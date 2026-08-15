import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import {
  createDatabase,
  discoverMigrationFiles,
  MIGRATIONS_DIR,
  openConfiguredDatabase,
  runMigrations,
} from '../src/database';

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function captureResponse(): { statusCode: number; body: any; response: any } {
  const captured = {
    statusCode: 200,
    body: undefined as any,
    response: undefined as any,
  };
  captured.response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return captured;
}

async function insertLegacyMealPlan(
  db: Database,
  options: { id: string; userId: string; reportId: string; itemCount: number; createdAt?: string },
): Promise<void> {
  await db.run(
    'INSERT INTO meal_plans (id, user_id, lab_report_id, title, description) VALUES (?, ?, ?, ?, ?)',
    options.id,
    options.userId,
    options.reportId,
    `${options.id} title`,
    `${options.id} description`,
  );
  if (options.createdAt) {
    await db.run('UPDATE meal_plans SET created_at = ? WHERE id = ?', options.createdAt, options.id);
  }
  const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK'];
  for (let index = 0; index < options.itemCount; index += 1) {
    const mealType = mealTypes[index % mealTypes.length];
    await db.run(
      'INSERT INTO meal_plan_items (id, meal_plan_id, meal_type, name, description, ingredients, preparation, rationale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      `${options.id}-item-${index}`,
      options.id,
      mealType,
      `${mealType} name`,
      `${mealType} description`,
      `${mealType} ingredients`,
      `${mealType} preparation`,
      `${mealType} rationale`,
    );
  }
}

async function insertLegacyExercisePlan(
  db: Database,
  options: { id: string; userId: string; reportId: string; itemCount: number; createdAt?: string },
): Promise<void> {
  await db.run(
    'INSERT INTO exercise_plans (id, user_id, lab_report_id, title) VALUES (?, ?, ?, ?)',
    options.id,
    options.userId,
    options.reportId,
    `${options.id} title`,
  );
  if (options.createdAt) {
    await db.run('UPDATE exercise_plans SET created_at = ? WHERE id = ?', options.createdAt, options.id);
  }
  for (let index = 0; index < options.itemCount; index += 1) {
    await db.run(
      'INSERT INTO exercise_items (id, exercise_plan_id, name, description, duration, difficulty, rationale) VALUES (?, ?, ?, ?, ?, ?, ?)',
      `${options.id}-item-${index}`,
      options.id,
      `Exercise ${index}`,
      `Exercise description ${index}`,
      15 + index,
      'EASY',
      `Exercise rationale ${index}`,
    );
  }
}

describe('database migrations', () => {
  let db: Database | null = null;
  let tempDir = '';

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-database-test-'));
    db = await createDatabase(join(tempDir, 'test.db'), join(tempDir, 'uploads'), MIGRATIONS_DIR);
  });

  afterAll(async () => {
    try {
      if (db) await db.close();
    } finally {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates all required tables', async () => {
    const tables = await db!.all<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    for (const required of [
      'users',
      'profiles',
      'lab_reports',
      'lab_results',
      'meal_plans',
      'meal_plan_items',
      'exercise_plans',
      'exercise_items',
      'chat_sessions',
      'chat_messages',
      'user_oauth_identities',
      'oauth_authorization_states',
      'oauth_callback_codes',
      'user_phone_identities',
      'phone_otp_challenges',
      'phone_auth_rate_limits',
      'migrations',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('discovers arbitrary SQL migration filenames in deterministic order', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-migrations-test-'));
    try {
      mkdirSync(join(tempDir, 'nested'));
      writeFileSync(join(tempDir, '010_last.sql'), 'SELECT 10;');
      writeFileSync(join(tempDir, '002_middle.sql'), 'SELECT 2;');
      writeFileSync(join(tempDir, '001_first.sql'), 'SELECT 1;');
      writeFileSync(join(tempDir, 'README.md'), 'ignore');
      writeFileSync(join(tempDir, '003_upper.SQL'), 'ignore');

      expect(discoverMigrationFiles(tempDir)).toEqual(['001_first.sql', '002_middle.sql', '010_last.sql']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records every migration exactly once, including analysis narrative', async () => {
    const rows = await db!.all<{ name: string }[]>('SELECT name FROM migrations ORDER BY name');
    expect(rows.map((row) => row.name)).toEqual([
      '001_initial.sql',
      '002_verified_media.sql',
      '003_analysis_narrative.sql',
      '004_oauth.sql',
      '005_otp.sql',
      '006_oauth_identities.sql',
      '007_oauth_callback_security.sql',
      '008_oauth_browser_binding.sql',
      '009_phone_auth.sql',
      '010_auth_intents.sql',
    ]);
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM migrations WHERE name = ?',
      '003_analysis_narrative.sql',
    ))!.count).toBe(1);
  });

  it('adds constrained phone identities and preserves legacy account semantics', async () => {
    const columns = await db!.all<{ name: string; notnull: number; dflt_value: string | null }[]>(
      'PRAGMA table_info(users)',
    );
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'email_is_placeholder', notnull: 1, dflt_value: '0' }),
    ]));

    await db!.run(
      `INSERT INTO users
       (id, email, password_hash, auth_provider, email_is_placeholder)
       VALUES (?, ?, ?, ?, ?)`,
      'phone-user-1',
      'phone-1@phone-auth.invalid',
      'PHONE_ONLY_NO_PASSWORD',
      'PHONE',
      1,
    );
    await db!.run(
      `INSERT INTO users
       (id, email, password_hash, auth_provider)
       VALUES (?, ?, ?, ?)`,
      'phone-user-2',
      'phone-2@phone-auth.invalid',
      'PHONE_ONLY_NO_PASSWORD',
      'PHONE',
    );
    expect(await db!.get(
      'SELECT auth_provider, email_is_placeholder FROM users WHERE id = ?',
      'phone-user-1',
    )).toEqual({ auth_provider: 'PHONE', email_is_placeholder: 1 });
    expect(await db!.get(
      'SELECT email_is_placeholder FROM users WHERE id = ?',
      'phone-user-2',
    )).toEqual({ email_is_placeholder: 0 });
    await expect(db!.run(
      'UPDATE users SET email_is_placeholder = 2 WHERE id = ?',
      'phone-user-1',
    )).rejects.toThrow();

    await db!.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'phone-identity-1',
      'phone-user-1',
      '+84912345678',
      1000,
      1000,
      1000,
    );
    await expect(db!.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'phone-identity-duplicate-user',
      'phone-user-1',
      '+84987654321',
      1000,
      1000,
      1000,
    )).rejects.toThrow();
    await expect(db!.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'phone-identity-duplicate-phone',
      'phone-user-2',
      '+84912345678',
      1000,
      1000,
      1000,
    )).rejects.toThrow();
    await expect(db!.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'phone-identity-invalid-format',
      'phone-user-2',
      '0912345678',
      1000,
      1000,
      1000,
    )).rejects.toThrow();
    await expect(db!.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'phone-identity-extra-plus',
      'phone-user-2',
      '+84+912345678',
      1000,
      1000,
      1000,
    )).rejects.toThrow();
  });

  it('enforces phone challenge purpose, target, attempts, and lifecycle constraints', async () => {
    const insertChallenge = (overrides: Record<string, unknown> = {}) => {
      const row = {
        challenge_hash: 'a'.repeat(64),
        binding_hash: 'b'.repeat(64),
        phone_e164: '+84912345678',
        purpose: 'LOGIN',
        target_user_id: null,
        code_mac: 'c'.repeat(64),
        status: 'PENDING_SEND',
        attempts: 0,
        max_attempts: 5,
        expires_at: 1300,
        resend_available_at: 1060,
        created_at: 1000,
        sent_at: null,
        failed_at: null,
        locked_at: null,
        consumed_at: null,
        updated_at: 1000,
        ...overrides,
      };
      return db!.run(
        `INSERT INTO phone_otp_challenges
         (challenge_hash, binding_hash, phone_e164, purpose, target_user_id, code_mac,
          status, attempts, max_attempts, expires_at, resend_available_at, created_at,
          sent_at, failed_at, locked_at, consumed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...Object.values(row),
      );
    };

    await expect(insertChallenge({ challenge_hash: 'd'.repeat(64), target_user_id: 'phone-user-1' }))
      .rejects.toThrow();
    await expect(insertChallenge({ challenge_hash: 'e'.repeat(64), purpose: 'LINK' }))
      .rejects.toThrow();
    await expect(insertChallenge({ challenge_hash: 'f'.repeat(64), attempts: 6 }))
      .rejects.toThrow();
    await expect(insertChallenge({
      challenge_hash: '1'.repeat(64),
      status: 'SENT',
    })).rejects.toThrow();
    await expect(insertChallenge({
      challenge_hash: '2'.repeat(64),
      status: 'SEND_FAILED',
      failed_at: 1001,
    })).rejects.toThrow();
    await expect(insertChallenge({
      challenge_hash: '3'.repeat(64),
      purpose: 'LINK',
      target_user_id: 'phone-user-2',
      status: 'SENT',
      sent_at: 1001,
    })).resolves.toBeTruthy();
    await expect(insertChallenge({
      challenge_hash: '4'.repeat(64),
      code_mac: null,
      status: 'LOCKED',
      attempts: 5,
      locked_at: 1001,
    })).rejects.toThrow();
    await expect(insertChallenge({
      challenge_hash: '5'.repeat(64),
      code_mac: null,
      status: 'CONSUMED',
      consumed_at: 1001,
    })).rejects.toThrow();

    const indexNames = (await db!.all<{ name: string }[]>('PRAGMA index_list(phone_otp_challenges)'))
      .map((row) => row.name);
    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_phone_otp_challenges_phone_scope',
      'idx_phone_otp_challenges_expires_at',
      'idx_phone_otp_challenges_status_created_at',
    ]));
  });

  it('constrains persistent phone rate-limit buckets and keeps migration application idempotent', async () => {
    await db!.run(
      `INSERT INTO phone_auth_rate_limits
       (bucket_key, domain, window_start, window_end, request_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'd'.repeat(64),
      'send:phone',
      1000,
      2000,
      1,
      1000,
      1000,
    );
    await expect(db!.run(
      `INSERT INTO phone_auth_rate_limits
       (bucket_key, domain, window_start, window_end, request_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'not-a-hash',
      'send:phone',
      1000,
      2000,
      1,
      1000,
      1000,
    )).rejects.toThrow();
    await expect(db!.run(
      `INSERT INTO phone_auth_rate_limits
       (bucket_key, domain, window_start, window_end, request_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e'.repeat(64),
      'send:phone',
      2000,
      1000,
      1,
      1000,
      1000,
    )).rejects.toThrow();

    await runMigrations(db!, MIGRATIONS_DIR);
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM migrations WHERE name = ?',
      '009_phone_auth.sql',
    ))!.count).toBe(1);
    expect(await db!.get(
      'SELECT auth_provider, provider_sub FROM users WHERE id = ?',
      'phone-user-1',
    )).toEqual({ auth_provider: 'PHONE', provider_sub: null });
  });

  it('upgrades an OAuth-era database without rebuilding or changing existing users', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-phone-auth-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const legacyMigrations = join(tempDir, 'legacy-migrations');
    const phoneMigration = join(tempDir, 'phone-migration');
    mkdirSync(legacyMigrations);
    mkdirSync(phoneMigration);
    for (const file of [
      '001_initial.sql',
      '002_verified_media.sql',
      '003_analysis_narrative.sql',
      '004_oauth.sql',
      '005_otp.sql',
      '006_oauth_identities.sql',
      '007_oauth_callback_security.sql',
      '008_oauth_browser_binding.sql',
    ]) {
      writeFileSync(
        join(legacyMigrations, file),
        readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
      );
    }
    writeFileSync(
      join(phoneMigration, '009_phone_auth.sql'),
      readFileSync(join(MIGRATIONS_DIR, '009_phone_auth.sql'), 'utf8'),
    );

    let legacyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(databasePath, join(tempDir, 'uploads'), legacyMigrations);
      await legacyDb.run(
        `INSERT INTO users
         (id, email, password_hash, auth_provider, provider_sub, email_verified, email_verification_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        'existing-google-user',
        'existing-google@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'GOOGLE',
        'google-sub-existing',
        1,
        'GOOGLE',
      );
      await legacyDb.run(
        `INSERT INTO user_oauth_identities
         (id, user_id, provider, provider_sub)
         VALUES (?, ?, ?, ?)`,
        'existing-google-identity',
        'existing-google-user',
        'GOOGLE',
        'google-sub-existing',
      );
      const usersRootPageBefore = (await legacyDb.get<{ rootpage: number }>(
        "SELECT rootpage FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      ))!.rootpage;

      await runMigrations(legacyDb, phoneMigration);

      expect((await legacyDb.get<{ rootpage: number }>(
        "SELECT rootpage FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      ))!.rootpage).toBe(usersRootPageBefore);
      expect(await legacyDb.get(
        `SELECT id, email, password_hash, auth_provider, provider_sub,
                email_verified, email_verification_source, email_is_placeholder
         FROM users WHERE id = ?`,
        'existing-google-user',
      )).toEqual({
        id: 'existing-google-user',
        email: 'existing-google@example.com',
        password_hash: 'OAUTH_ONLY_NO_PASSWORD',
        auth_provider: 'GOOGLE',
        provider_sub: 'google-sub-existing',
        email_verified: 1,
        email_verification_source: 'GOOGLE',
        email_is_placeholder: 0,
      });
      expect(await legacyDb.get(
        'SELECT user_id, provider, provider_sub FROM user_oauth_identities WHERE id = ?',
        'existing-google-identity',
      )).toEqual({
        user_id: 'existing-google-user',
        provider: 'GOOGLE',
        provider_sub: 'google-sub-existing',
      });
    } finally {
      if (legacyDb) await legacyDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adds OAuth callback security metadata and constrained state storage', async () => {
    const userColumns = await db!.all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[]>('PRAGMA table_info(users)');
    expect(userColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'email_verified', notnull: 1, dflt_value: '0' }),
      expect.objectContaining({ name: 'email_verification_source', notnull: 0 }),
    ]));
    expect((await db!.all<{ name: string }[]>('PRAGMA index_list(oauth_authorization_states)'))
      .map((index) => index.name)).toContain('idx_oauth_authorization_states_expires_at');
    expect((await db!.all<{ name: string }[]>('PRAGMA index_list(oauth_authorization_states)'))
      .map((index) => index.name)).toContain('idx_oauth_authorization_states_created_at');
    expect((await db!.all<{ name: string }[]>('PRAGMA index_list(oauth_callback_codes)'))
      .map((index) => index.name)).toContain('idx_oauth_callback_codes_expires_at');
    expect((await db!.all<{ name: string }[]>('PRAGMA index_list(oauth_callback_codes)'))
      .map((index) => index.name)).toContain('idx_oauth_callback_codes_kind_created_at');
    expect(await db!.all<{ name: string; notnull: number }[]>(
      'PRAGMA table_info(oauth_authorization_states)',
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'binding_hash', notnull: 1 }),
    ]));
    expect(await db!.all<{ name: string; notnull: number }[]>(
      'PRAGMA table_info(oauth_callback_codes)',
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'binding_hash', notnull: 1 }),
      expect.objectContaining({ name: 'purpose', notnull: 1 }),
    ]));

    await expect(db!.run(
      `INSERT INTO oauth_authorization_states
       (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       VALUES (?, ?, 'GOOGLE', 'REGISTER', NULL, ?, ?)`,
      'valid-register-context',
      'valid-binding-hash',
      2,
      1,
    )).resolves.toBeDefined();

    await db!.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      'oauth-security-user',
      'oauth-security@example.com',
      'hash',
    );
    expect(await db!.get(
      'SELECT email_verified, email_verification_source FROM users WHERE id = ?',
      'oauth-security-user',
    )).toEqual({ email_verified: 0, email_verification_source: null });
    await expect(db!.run(
      'UPDATE users SET email_verification_source = ? WHERE id = ?',
      'UNTRUSTED',
      'oauth-security-user',
    )).rejects.toThrow();

    await expect(db!.run(
      `INSERT INTO oauth_authorization_states
       (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'invalid-login-context',
      'valid-binding-hash',
      'GOOGLE',
      'LOGIN',
      'oauth-security-user',
      2,
      1,
    )).rejects.toThrow();
  });

  it('invalidates legacy ephemeral OAuth rows when adding required browser binding', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-oauth-binding-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const legacyMigrations = join(tempDir, 'legacy-migrations');
    mkdirSync(legacyMigrations);
    for (const file of [
      '001_initial.sql',
      '002_verified_media.sql',
      '003_analysis_narrative.sql',
      '004_oauth.sql',
      '005_otp.sql',
      '006_oauth_identities.sql',
      '007_oauth_callback_security.sql',
    ]) {
      writeFileSync(
        join(legacyMigrations, file),
        readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
      );
    }

    let legacyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(databasePath, join(tempDir, 'uploads'), legacyMigrations);
      await legacyDb.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        'binding-upgrade-user',
        'binding-upgrade@example.com',
        'hash',
      );
      await legacyDb.run(
        `INSERT INTO oauth_authorization_states
         (state_hash, provider, purpose, user_id, expires_at, created_at)
         VALUES (?, 'GOOGLE', 'LOGIN', NULL, ?, ?)`,
        'legacy-state-hash',
        Date.now() + 60_000,
        Date.now(),
      );
      await legacyDb.run(
        `INSERT INTO oauth_callback_codes
         (code_hash, result_kind, user_id, error_code, expires_at, created_at)
         VALUES (?, 'SESSION', ?, NULL, ?, ?)`,
        'legacy-code-hash',
        'binding-upgrade-user',
        Date.now() + 60_000,
        Date.now(),
      );

      await runMigrations(legacyDb, MIGRATIONS_DIR);

      expect(await legacyDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM oauth_authorization_states',
      )).toEqual({ count: 0 });
      expect(await legacyDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM oauth_callback_codes',
      )).toEqual({ count: 0 });
      expect(await legacyDb.all<{ name: string; notnull: number }[]>(
        'PRAGMA table_info(oauth_authorization_states)',
      )).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'binding_hash', notnull: 1 }),
      ]));
      expect(await legacyDb.all<{ name: string; notnull: number }[]>(
        'PRAGMA table_info(oauth_callback_codes)',
      )).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'binding_hash', notnull: 1 }),
      ]));
    } finally {
      if (legacyDb) await legacyDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a SESSION callback result without a user', async () => {
    await expect(db!.run(
      `INSERT INTO oauth_callback_codes
       (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       VALUES (?, ?, 'LOGIN', ?, ?, ?, ?, ?)`,
      'invalid-session-missing-user',
      'valid-binding-hash',
      'SESSION',
      null,
      null,
      2,
      1,
    )).rejects.toThrow();
  });

  it('rejects a SESSION callback result containing an error code', async () => {
    await db!.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      'oauth-callback-check-user',
      'oauth-callback-check@example.com',
      'hash',
    );
    await expect(db!.run(
      `INSERT INTO oauth_callback_codes
       (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       VALUES (?, ?, 'LOGIN', ?, ?, ?, ?, ?)`,
      'invalid-session-error-code',
      'valid-binding-hash',
      'SESSION',
      'oauth-callback-check-user',
      'OAUTH_PROVIDER_FAILED',
      2,
      1,
    )).rejects.toThrow();
  });

  it('migrates legacy OAuth identities into provider-scoped links', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-oauth-identities-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const legacyMigrations = join(tempDir, 'legacy-migrations');
    mkdirSync(legacyMigrations);
    for (const file of [
      '001_initial.sql',
      '002_verified_media.sql',
      '003_analysis_narrative.sql',
      '004_oauth.sql',
      '005_otp.sql',
    ]) {
      writeFileSync(
        join(legacyMigrations, file),
        readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
      );
    }

    let legacyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(databasePath, join(tempDir, 'uploads'), legacyMigrations);
      await legacyDb.run(
        'INSERT INTO users (id, email, password_hash, auth_provider, provider_sub) VALUES (?, ?, ?, ?, ?)',
        'legacy-google-user',
        'legacy@example.com',
        'oauth-only',
        'GOOGLE',
        'legacy-google-sub',
      );

      await runMigrations(legacyDb, MIGRATIONS_DIR);

      const identityTable = await legacyDb.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_oauth_identities'",
      );
      expect(identityTable).toBeTruthy();
      expect(await legacyDb.get(
        'SELECT user_id, provider, provider_sub FROM user_oauth_identities WHERE user_id = ?',
        'legacy-google-user',
      )).toEqual({
        user_id: 'legacy-google-user',
        provider: 'GOOGLE',
        provider_sub: 'legacy-google-sub',
      });
      const legacyIndexes = await legacyDb.all<{ name: string }[]>('PRAGMA index_list(users)');
      expect(legacyIndexes.map((index) => index.name)).not.toContain('idx_users_provider_sub');
    } finally {
      if (legacyDb) await legacyDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adds nullable narrative columns to reports and results', async () => {
    const reportColumns = await db!.all<{ name: string; notnull: number }[]>(
      'PRAGMA table_info(lab_reports)',
    );
    const resultColumns = await db!.all<{ name: string; notnull: number }[]>(
      'PRAGMA table_info(lab_results)',
    );

    expect(reportColumns).toContainEqual(
      expect.objectContaining({ name: 'analysis_summary', notnull: 0 }),
    );
    expect(resultColumns).toContainEqual(
      expect.objectContaining({ name: 'explanation', notnull: 0 }),
    );
  });

  it('adds narrative columns without deleting existing report or result history', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-narrative-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const initialMigrations = join(tempDir, 'initial-migrations');
    const upgradeMigrations = join(tempDir, 'upgrade-migrations');
    mkdirSync(initialMigrations);
    mkdirSync(upgradeMigrations);
    writeFileSync(
      join(initialMigrations, '001_initial.sql'),
      readFileSync(join(MIGRATIONS_DIR, '001_initial.sql'), 'utf8'),
    );
    writeFileSync(
      join(initialMigrations, '002_verified_media.sql'),
      readFileSync(join(MIGRATIONS_DIR, '002_verified_media.sql'), 'utf8'),
    );
    writeFileSync(
      join(upgradeMigrations, '003_analysis_narrative.sql'),
      readFileSync(join(MIGRATIONS_DIR, '003_analysis_narrative.sql'), 'utf8'),
    );

    let legacyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(
        databasePath,
        join(tempDir, 'uploads'),
        initialMigrations,
      );
      const userId = '71111111-1111-4111-8111-111111111111';
      const reportId = '72222222-2222-4222-8222-222222222222';
      const resultId = '73333333-3333-4333-8333-333333333333';
      await legacyDb.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        userId,
        'narrative-upgrade@example.com',
        'hash',
      );
      await legacyDb.run(
        'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
        reportId,
        userId,
        'legacy-narrative.jpg',
        'PROCESSED',
        'UPLOAD',
      );
      await legacyDb.run(
        `INSERT INTO lab_results (
           id, report_id, test_code, test_name, value, unit, status, ocr_confidence, reference_source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        resultId,
        reportId,
        'RBC',
        'Red blood cells',
        4.5,
        '10^12/L',
        'UNKNOWN',
        1,
        'LAB_REPORT',
      );

      await runMigrations(legacyDb, upgradeMigrations);
      await runMigrations(legacyDb, upgradeMigrations);

      expect(await legacyDb.get(
        'SELECT id, analysis_summary FROM lab_reports WHERE id = ?',
        reportId,
      )).toEqual({ id: reportId, analysis_summary: null });
      expect(await legacyDb.get(
        'SELECT id, explanation FROM lab_results WHERE id = ?',
        resultId,
      )).toEqual({ id: resultId, explanation: null });
      expect((await legacyDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM migrations WHERE name = ?',
        '003_analysis_narrative.sql',
      ))!.count).toBe(1);
    } finally {
      if (legacyDb) await legacyDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adds every nullable meal and exercise media provenance column', async () => {
    const mealColumns = await db!.all<{ name: string; notnull: number }[]>('PRAGMA table_info(meal_plan_items)');
    const exerciseColumns = await db!.all<{ name: string; notnull: number }[]>('PRAGMA table_info(exercise_items)');

    for (const name of ['image_alt', 'image_source_url', 'image_license', 'image_author', 'image_verified_at']) {
      expect(mealColumns).toContainEqual(expect.objectContaining({ name, notnull: 0 }));
    }
    for (const name of [
      'youtube_video_id',
      'youtube_title',
      'youtube_author',
      'youtube_author_url',
      'youtube_thumbnail_url',
      'youtube_verified_at',
    ]) {
      expect(exerciseColumns).toContainEqual(expect.objectContaining({ name, notnull: 0 }));
    }
    expect(exerciseColumns).toContainEqual(expect.objectContaining({ name: 'youtube_source' }));
  });

  it('adds non-unique lookup indexes for report and plan history reads', async () => {
    const expectedIndexes = [
      { table: 'lab_results', name: 'idx_lab_results_report_id', columns: ['report_id'] },
      { table: 'meal_plans', name: 'idx_meal_plans_report_created_at', columns: ['lab_report_id', 'created_at'] },
      { table: 'meal_plan_items', name: 'idx_meal_plan_items_plan_meal_type', columns: ['meal_plan_id', 'meal_type'] },
      { table: 'exercise_plans', name: 'idx_exercise_plans_report_created_at', columns: ['lab_report_id', 'created_at'] },
      { table: 'exercise_items', name: 'idx_exercise_items_plan_id', columns: ['exercise_plan_id'] },
    ];

    for (const expected of expectedIndexes) {
      const indexes = await db!.all<{ name: string; unique: number }[]>(`PRAGMA index_list(${expected.table})`);
      expect(indexes).toContainEqual(expect.objectContaining({ name: expected.name, unique: 0 }));
      const columns = await db!.all<{ name: string }[]>(`PRAGMA index_info(${expected.name})`);
      expect(columns.map((column) => column.name)).toEqual(expected.columns);
    }
  });

  it('opens a configured dedicated connection without rerunning migrations', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-dedicated-connection-'));
    let dedicatedDb: Database | null = null;
    try {
      dedicatedDb = await openConfiguredDatabase(join(tempDir, 'dedicated.db'));
      const foreignKeys = await dedicatedDb.get<Record<string, number>>('PRAGMA foreign_keys');
      const busyTimeout = await dedicatedDb.get<Record<string, number>>('PRAGMA busy_timeout');
      const migrationTable = await dedicatedDb.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
      );

      expect(Object.values(foreignKeys ?? {})).toEqual([1]);
      expect(Object.values(busyTimeout ?? {})[0]).toBeGreaterThanOrEqual(1000);
      expect(migrationTable).toBeUndefined();
    } finally {
      if (dedicatedDb) await dedicatedDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('commits and rolls back deferred read transactions cleanly', async () => {
    const databaseModule = await import('../src/database') as Record<string, unknown>;
    const withReadTransaction = databaseModule.withReadTransaction as
      | ((connection: Database, work: () => Promise<unknown>) => Promise<unknown>)
      | undefined;
    expect(typeof withReadTransaction).toBe('function');
    if (!withReadTransaction) return;

    const readDb = await openConfiguredDatabase(join(tempDir, 'test.db'));
    const execSpy = jest.spyOn(readDb, 'exec');
    try {
      await expect(withReadTransaction(readDb, async () => {
        return readDb.get('SELECT 1 AS value');
      })).resolves.toEqual({ value: 1 });
      await expect(withReadTransaction(readDb, async () => {
        await readDb.get('SELECT 1');
        throw new Error('read snapshot failed');
      })).rejects.toThrow('read snapshot failed');

      const transactionSql = execSpy.mock.calls
        .map(([sql]) => String(sql).trim().toUpperCase())
        .filter((sql) => ['BEGIN', 'BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(sql));
      expect(transactionSql).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
      await expect(readDb.exec('BEGIN; ROLLBACK;')).resolves.toBeUndefined();
    } finally {
      execSpy.mockRestore();
      await readDb.close();
    }
  });

  it('rejects in-memory databases because dedicated analysis connections require a file-backed path', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-memory-database-'));
    const emptyMigrationsDir = join(tempDir, 'migrations');
    mkdirSync(emptyMigrationsDir);
    const expectedMessage =
      'DATABASE_PATH=:memory: is not supported; use a file-backed SQLite database for dedicated analysis connections.';

    async function captureInitializationError(
      operation: () => Promise<Database>,
    ): Promise<unknown> {
      let openedDb: Database | null = null;
      try {
        openedDb = await operation();
        return null;
      } catch (error) {
        return error;
      } finally {
        if (openedDb) await openedDb.close();
      }
    }

    try {
      const openError = await captureInitializationError(() => openConfiguredDatabase(':memory:'));
      const createError = await captureInitializationError(() => createDatabase(
        ':memory:',
        join(tempDir, 'uploads'),
        emptyMigrationsDir,
      ));

      expect([
        openError instanceof Error ? openError.message : null,
        createError instanceof Error ? createError.message : null,
      ]).toEqual([expectedMessage, expectedMessage]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('downgrades unverifiable legacy media without deleting or constraining plan history', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-legacy-upgrade-'));
    const initialMigrations = join(tempDir, 'initial-migrations');
    const upgradeMigrations = join(tempDir, 'upgrade-migrations');
    mkdirSync(initialMigrations);
    mkdirSync(upgradeMigrations);
    writeFileSync(
      join(initialMigrations, '001_initial.sql'),
      readFileSync(join(MIGRATIONS_DIR, '001_initial.sql'), 'utf8'),
    );
    writeFileSync(
      join(upgradeMigrations, '002_verified_media.sql'),
      readFileSync(join(MIGRATIONS_DIR, '002_verified_media.sql'), 'utf8'),
    );

    let legacyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(join(tempDir, 'legacy.db'), join(tempDir, 'uploads'), initialMigrations);
      const userId = '11111111-1111-4111-8111-111111111111';
      const reportId = '22222222-2222-4222-8222-222222222222';
      await legacyDb.run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', userId, 'legacy@example.com', 'hash');
      await legacyDb.run(
        'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
        reportId,
        userId,
        'legacy.jpg',
        'PROCESSED',
        'UPLOAD',
      );

      await legacyDb.run(
        'INSERT INTO meal_plans (id, user_id, lab_report_id, title, description) VALUES (?, ?, ?, ?, ?)',
        'meal-old', userId, reportId, 'Old meal', 'Old description',
      );
      await legacyDb.run(
        'INSERT INTO meal_plans (id, user_id, lab_report_id, title, description) VALUES (?, ?, ?, ?, ?)',
        'meal-new', userId, reportId, 'Legacy meal', 'Legacy description',
      );
      const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK'];
      for (const [index, mealType] of mealTypes.entries()) {
        await legacyDb.run(
          'INSERT INTO meal_plan_items (id, meal_plan_id, meal_type, name, description, ingredients, preparation, image_url, rationale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          `meal-item-${index}`,
          'meal-new',
          mealType,
          `${mealType} name`,
          `${mealType} description`,
          `${mealType} ingredients`,
          `${mealType} preparation`,
          index === 0 ? 'https://example.com/legacy-food.jpg' : null,
          `${mealType} rationale`,
        );
      }

      await legacyDb.run(
        'INSERT INTO exercise_plans (id, user_id, lab_report_id, title) VALUES (?, ?, ?, ?)',
        'exercise-old', userId, reportId, 'Old exercise',
      );
      await legacyDb.run(
        'INSERT INTO exercise_plans (id, user_id, lab_report_id, title) VALUES (?, ?, ?, ?)',
        'exercise-new', userId, reportId, 'Legacy exercise',
      );
      for (let index = 0; index < 2; index += 1) {
        await legacyDb.run(
          'INSERT INTO exercise_items (id, exercise_plan_id, name, description, duration, difficulty, rationale, youtube_url, youtube_verified, youtube_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          `exercise-item-${index}`,
          'exercise-new',
          `Exercise ${index}`,
          `Exercise description ${index}`,
          15 + index,
          'EASY',
          `Exercise rationale ${index}`,
          index === 0 ? 'https://www.youtube.com/watch?v=legacy' : null,
          index === 0 ? 1 : 0,
          index === 0 ? 'Legacy source' : null,
        );
      }

      await legacyDb.exec(`
        CREATE TRIGGER reject_clean_meal_media_update
        BEFORE UPDATE ON meal_plan_items
        WHEN OLD.image_url IS NULL
        BEGIN
          SELECT RAISE(ABORT, 'clean meal media row updated');
        END;

        CREATE TRIGGER reject_clean_exercise_media_update
        BEFORE UPDATE ON exercise_items
        WHEN OLD.youtube_url IS NULL
          AND OLD.youtube_verified = 0
          AND OLD.youtube_source IS NULL
        BEGIN
          SELECT RAISE(ABORT, 'clean exercise media row updated');
        END;
      `);

      await runMigrations(legacyDb, upgradeMigrations);

      const mealPlans = await legacyDb.all<{ id: string }[]>(
        'SELECT id FROM meal_plans WHERE lab_report_id = ? ORDER BY rowid',
        reportId,
      );
      const exercisePlans = await legacyDb.all<{ id: string }[]>(
        'SELECT id FROM exercise_plans WHERE lab_report_id = ? ORDER BY rowid',
        reportId,
      );
      expect(mealPlans).toEqual([{ id: 'meal-old' }, { id: 'meal-new' }]);
      expect(exercisePlans).toEqual([{ id: 'exercise-old' }, { id: 'exercise-new' }]);

      const mealItems = await legacyDb.all<Array<Record<string, unknown>>>(
        `SELECT meal_type AS mealType, name, description, ingredients, preparation, rationale,
          image_url AS imageUrl, image_alt AS imageAlt, image_source_url AS imageSourceUrl,
          image_license AS imageLicense, image_author AS imageAuthor, image_verified_at AS imageVerifiedAt
         FROM meal_plan_items WHERE meal_plan_id = ?
         ORDER BY CASE meal_type WHEN 'BREAKFAST' THEN 1 WHEN 'LUNCH' THEN 2 WHEN 'DINNER' THEN 3 WHEN 'SNACK' THEN 4 ELSE 5 END`,
        'meal-new',
      );
      const exerciseItems = (
        await legacyDb.all<Array<Record<string, unknown>>>(
          `SELECT name, description, duration, difficulty, rationale, youtube_url AS youtubeUrl,
            youtube_video_id AS youtubeVideoId, youtube_title AS youtubeTitle, youtube_author AS youtubeAuthor,
            youtube_author_url AS youtubeAuthorUrl, youtube_thumbnail_url AS youtubeThumbnailUrl,
            youtube_verified AS youtubeVerified, youtube_source AS youtubeSource, youtube_verified_at AS youtubeVerifiedAt
           FROM exercise_items WHERE exercise_plan_id = ? ORDER BY rowid`,
          'exercise-new',
        )
      ).map((item) => ({ ...item, youtubeVerified: item.youtubeVerified === 1 }));

      const contractsDir = join(__dirname, '..', '..', 'contracts');
      const ajv = new Ajv({ strict: false, allErrors: true });
      addFormats(ajv);
      const validateMeal = ajv.compile(JSON.parse(readFileSync(join(contractsDir, 'json', 'meal_plan.schema.json'), 'utf8')));
      const validateExercise = ajv.compile(JSON.parse(readFileSync(join(contractsDir, 'json', 'exercise_plan.schema.json'), 'utf8')));
      expect(validateMeal({ reportId, title: 'Legacy meal', description: 'Legacy description', items: mealItems })).toBe(true);
      expect(validateExercise({ reportId, title: 'Legacy exercise', items: exerciseItems })).toBe(true);

      const mealIndexes = await legacyDb.all<{ name: string; unique: number; partial: number }[]>('PRAGMA index_list(meal_plans)');
      const exerciseIndexes = await legacyDb.all<{ name: string; unique: number; partial: number }[]>('PRAGMA index_list(exercise_plans)');
      expect(mealIndexes.map((index) => index.name)).not.toContain('idx_meal_plans_lab_report_unique');
      expect(exerciseIndexes.map((index) => index.name)).not.toContain('idx_exercise_plans_lab_report_unique');
      await expect(legacyDb.run(
        'INSERT INTO meal_plans (id, user_id, lab_report_id, title, description) VALUES (?, ?, ?, ?, ?)',
        'meal-duplicate', userId, reportId, 'Duplicate', 'Duplicate',
      )).resolves.toBeTruthy();
      await expect(legacyDb.run(
        'INSERT INTO exercise_plans (id, user_id, lab_report_id, title) VALUES (?, ?, ?, ?)',
        'exercise-duplicate', userId, reportId, 'Duplicate',
      )).resolves.toBeTruthy();
    } finally {
      if (legacyDb) await legacyDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps legacy history and returns the newest valid plan by created_at then rowid', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-valid-legacy-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const uploadDir = join(tempDir, 'uploads');
    const initialMigrations = join(tempDir, 'initial-migrations');
    const upgradeMigrations = join(tempDir, 'upgrade-migrations');
    mkdirSync(initialMigrations);
    mkdirSync(upgradeMigrations);
    writeFileSync(
      join(initialMigrations, '001_initial.sql'),
      readFileSync(join(MIGRATIONS_DIR, '001_initial.sql'), 'utf8'),
    );
    writeFileSync(
      join(upgradeMigrations, '002_verified_media.sql'),
      readFileSync(join(MIGRATIONS_DIR, '002_verified_media.sql'), 'utf8'),
    );

    const originalDatabasePath = process.env.DATABASE_PATH;
    const originalUploadDir = process.env.UPLOAD_DIR;
    let legacyDb: Database | null = null;
    let historyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(databasePath, uploadDir, initialMigrations);
      const userId = '31111111-1111-4111-8111-111111111111';
      const reportId = '32222222-2222-4222-8222-222222222222';
      await legacyDb.run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', userId, 'valid-legacy@example.com', 'hash');
      await legacyDb.run(
        'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
        reportId,
        userId,
        'valid-legacy.jpg',
        'PROCESSED',
        'UPLOAD',
      );

      await insertLegacyMealPlan(legacyDb, {
        id: 'meal-valid-old', userId, reportId, itemCount: 5, createdAt: '2026-08-08 10:00:00',
      });
      await insertLegacyMealPlan(legacyDb, {
        id: 'meal-valid-tie-first', userId, reportId, itemCount: 5, createdAt: '2026-08-09 10:00:00',
      });
      await insertLegacyMealPlan(legacyDb, {
        id: 'meal-valid-tie-last', userId, reportId, itemCount: 5, createdAt: '2026-08-09 10:00:00',
      });
      await insertLegacyMealPlan(legacyDb, {
        id: 'meal-partial-new', userId, reportId, itemCount: 2, createdAt: '2026-08-10 10:00:00',
      });
      await insertLegacyExercisePlan(legacyDb, {
        id: 'exercise-valid-old', userId, reportId, itemCount: 2, createdAt: '2026-08-08 10:00:00',
      });
      await insertLegacyExercisePlan(legacyDb, {
        id: 'exercise-valid-tie-first', userId, reportId, itemCount: 2, createdAt: '2026-08-09 10:00:00',
      });
      await insertLegacyExercisePlan(legacyDb, {
        id: 'exercise-valid-tie-last', userId, reportId, itemCount: 2, createdAt: '2026-08-09 10:00:00',
      });
      await insertLegacyExercisePlan(legacyDb, {
        id: 'exercise-partial-new', userId, reportId, itemCount: 1, createdAt: '2026-08-10 10:00:00',
      });

      await runMigrations(legacyDb, upgradeMigrations);

      expect(await legacyDb.all<{ id: string }[]>(
        'SELECT id FROM meal_plans WHERE lab_report_id = ? ORDER BY rowid',
        reportId,
      ))
        .toEqual([
          { id: 'meal-valid-old' },
          { id: 'meal-valid-tie-first' },
          { id: 'meal-valid-tie-last' },
          { id: 'meal-partial-new' },
        ]);
      expect(await legacyDb.all<{ id: string }[]>(
        'SELECT id FROM exercise_plans WHERE lab_report_id = ? ORDER BY rowid',
        reportId,
      ))
        .toEqual([
          { id: 'exercise-valid-old' },
          { id: 'exercise-valid-tie-first' },
          { id: 'exercise-valid-tie-last' },
          { id: 'exercise-partial-new' },
        ]);

      await legacyDb.close();
      legacyDb = null;
      process.env.DATABASE_PATH = databasePath;
      process.env.UPLOAD_DIR = uploadDir;
      jest.resetModules();
      const isolatedDatabase = await import('../src/database');
      const { getReportDetail } = await import('../src/controllers/analysisController');
      historyDb = await isolatedDatabase.getDb();
      const response = captureResponse();
      await getReportDetail({ userId, params: { reportId } } as any, response.response);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.report.mealPlan.title).toBe('meal-valid-tie-last title');
      expect(response.body.data.report.exercisePlan.title).toBe('exercise-valid-tie-last title');
      const openapi = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'contracts', 'openapi.json'), 'utf8'),
      );
      const ajv = new Ajv({ strict: false, allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile({
        $schema: 'http://json-schema.org/draft-07/schema#',
        $ref: '#/components/schemas/ReportDetail',
        components: openapi.components,
      });
      expect({ valid: validate(response.body.data.report), errors: validate.errors })
        .toEqual({ valid: true, errors: null });
    } finally {
      if (historyDb) await historyDb.close();
      if (legacyDb) await legacyDb.close();
      restoreEnv('DATABASE_PATH', originalDatabasePath);
      restoreEnv('UPLOAD_DIR', originalUploadDir);
      jest.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves invalid-only legacy plans but returns null plans from report history', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-invalid-legacy-upgrade-'));
    const databasePath = join(tempDir, 'legacy.db');
    const uploadDir = join(tempDir, 'uploads');
    const initialMigrations = join(tempDir, 'initial-migrations');
    const upgradeMigrations = join(tempDir, 'upgrade-migrations');
    mkdirSync(initialMigrations);
    mkdirSync(upgradeMigrations);
    writeFileSync(
      join(initialMigrations, '001_initial.sql'),
      readFileSync(join(MIGRATIONS_DIR, '001_initial.sql'), 'utf8'),
    );
    writeFileSync(
      join(upgradeMigrations, '002_verified_media.sql'),
      readFileSync(join(MIGRATIONS_DIR, '002_verified_media.sql'), 'utf8'),
    );

    const originalDatabasePath = process.env.DATABASE_PATH;
    const originalUploadDir = process.env.UPLOAD_DIR;
    let legacyDb: Database | null = null;
    let historyDb: Database | null = null;
    try {
      legacyDb = await createDatabase(databasePath, uploadDir, initialMigrations);
      const userId = '41111111-1111-4111-8111-111111111111';
      const reportId = '42222222-2222-4222-8222-222222222222';
      await legacyDb.run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', userId, 'invalid-legacy@example.com', 'hash');
      await legacyDb.run(
        'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
        reportId,
        userId,
        'invalid-legacy.jpg',
        'PROCESSED',
        'UPLOAD',
      );
      await insertLegacyMealPlan(legacyDb, { id: 'meal-invalid-only', userId, reportId, itemCount: 2 });
      await insertLegacyExercisePlan(legacyDb, { id: 'exercise-invalid-only', userId, reportId, itemCount: 1 });

      await runMigrations(legacyDb, upgradeMigrations);
      expect((await legacyDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?',
        reportId,
      ))!.count).toBe(1);
      expect((await legacyDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?',
        reportId,
      ))!.count).toBe(1);

      await legacyDb.close();
      legacyDb = null;
      process.env.DATABASE_PATH = databasePath;
      process.env.UPLOAD_DIR = uploadDir;
      jest.resetModules();
      const isolatedDatabase = await import('../src/database');
      const { getReportDetail } = await import('../src/controllers/analysisController');
      historyDb = await isolatedDatabase.getDb();
      const response = captureResponse();
      await getReportDetail({ userId, params: { reportId } } as any, response.response);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.report.mealPlan).toBeNull();
      expect(response.body.data.report.exercisePlan).toBeNull();
    } finally {
      if (historyDb) await historyDb.close();
      if (legacyDb) await legacyDb.close();
      restoreEnv('DATABASE_PATH', originalDatabasePath);
      restoreEnv('UPLOAD_DIR', originalUploadDir);
      jest.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rechecks the migration ledger after acquiring a transaction across real connections', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-concurrent-migration-'));
    const databasePath = join(tempDir, 'concurrent.db');
    const migrationsDir = join(tempDir, 'migrations');
    const emptyMigrationsDir = join(tempDir, 'empty-migrations');
    mkdirSync(migrationsDir);
    mkdirSync(emptyMigrationsDir);
    writeFileSync(
      join(migrationsDir, '001_concurrent.sql'),
      'ALTER TABLE probe ADD COLUMN concurrent_column TEXT;',
    );

    let setupDb: Database | null = null;
    let blockerDb: Database | null = null;
    let firstDb: Database | null = null;
    let secondDb: Database | null = null;
    let blockerTransactionOpen = false;
    try {
      setupDb = await createDatabase(databasePath, join(tempDir, 'uploads'), emptyMigrationsDir);
      await setupDb.exec('CREATE TABLE probe (id TEXT PRIMARY KEY)');
      await setupDb.close();
      setupDb = null;

      blockerDb = await openConfiguredDatabase(databasePath);
      firstDb = await open({ filename: databasePath, driver: sqlite3.Database });
      secondDb = await open({ filename: databasePath, driver: sqlite3.Database });
      await firstDb.exec('PRAGMA busy_timeout = 5000;');
      await secondDb.exec('PRAGMA busy_timeout = 5000;');
      await blockerDb.exec('BEGIN IMMEDIATE');
      blockerTransactionOpen = true;

      let resolveFirstBegin!: () => void;
      let resolveSecondBegin!: () => void;
      const firstBegin = new Promise<void>((resolve) => {
        resolveFirstBegin = resolve;
      });
      const secondBegin = new Promise<void>((resolve) => {
        resolveSecondBegin = resolve;
      });
      let alterExecutions = 0;
      const observeSql = (resolveBegin: () => void) => (sql: string): void => {
        if (sql.includes('BEGIN IMMEDIATE')) resolveBegin();
        if (sql.includes('ALTER TABLE probe ADD COLUMN concurrent_column TEXT')) alterExecutions += 1;
      };
      firstDb.on('trace', observeSql(resolveFirstBegin));
      secondDb.on('trace', observeSql(resolveSecondBegin));

      const migrationCalls = [
        runMigrations(firstDb, migrationsDir),
        runMigrations(secondDb, migrationsDir),
      ];
      await Promise.all([firstBegin, secondBegin]);
      await blockerDb.exec('COMMIT');
      blockerTransactionOpen = false;

      await expect(Promise.all(migrationCalls)).resolves.toEqual([undefined, undefined]);
      expect(alterExecutions).toBe(1);
      expect((await firstDb.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM migrations WHERE name = ?',
        '001_concurrent.sql',
      ))!.count).toBe(1);
      expect((await firstDb.all<{ name: string }[]>('PRAGMA table_info(probe)'))
        .map((column) => column.name)).toEqual(['id', 'concurrent_column']);
    } finally {
      if (blockerTransactionOpen && blockerDb) await blockerDb.exec('ROLLBACK');
      if (secondDb) await secondDb.close();
      if (firstDb) await firstDb.close();
      if (blockerDb) await blockerDb.close();
      if (setupDb) await setupDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rolls back migration DDL when the ledger insert fails and retries cleanly', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-atomic-migration-'));
    const migrationsDir = join(tempDir, 'migrations');
    const emptyMigrationsDir = join(tempDir, 'empty-migrations');
    mkdirSync(migrationsDir);
    mkdirSync(emptyMigrationsDir);
    writeFileSync(join(migrationsDir, '001_atomic.sql'), 'ALTER TABLE probe ADD COLUMN rolled_back TEXT;');

    let atomicDb: Database | null = null;
    try {
      atomicDb = await createDatabase(join(tempDir, 'atomic.db'), join(tempDir, 'uploads'), emptyMigrationsDir);
      await atomicDb.exec('CREATE TABLE probe (id TEXT PRIMARY KEY)');
      await atomicDb.exec(`
        CREATE TRIGGER fail_migration_ledger
        BEFORE INSERT ON migrations
        BEGIN
          SELECT RAISE(ABORT, 'ledger failure');
        END;
      `);

      await expect(runMigrations(atomicDb, migrationsDir)).rejects.toThrow('ledger failure');
      const failedColumns = await atomicDb.all<{ name: string }[]>('PRAGMA table_info(probe)');
      expect(failedColumns.map((column) => column.name)).toEqual(['id']);
      expect(await atomicDb.get('SELECT name FROM migrations WHERE name = ?', '001_atomic.sql')).toBeUndefined();

      await atomicDb.exec('DROP TRIGGER fail_migration_ledger');
      await runMigrations(atomicDb, migrationsDir);
      const retriedColumns = await atomicDb.all<{ name: string }[]>('PRAGMA table_info(probe)');
      expect(retriedColumns.map((column) => column.name)).toEqual(['id', 'rolled_back']);
      expect(await atomicDb.get('SELECT name FROM migrations WHERE name = ?', '001_atomic.sql')).toBeTruthy();
    } finally {
      if (atomicDb) await atomicDb.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('closes the database handle when initialization fails', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-init-failure-'));
    const close = jest.fn().mockResolvedValue(undefined);
    const exec = jest.fn().mockRejectedValue(new Error('initialization failed'));
    jest.resetModules();
    jest.doMock('sqlite', () => ({
      open: jest.fn().mockResolvedValue({ exec, close }),
    }));

    try {
      const isolatedDatabase = await import('../src/database');
      await expect(isolatedDatabase.createDatabase(join(tempDir, 'failed.db'), join(tempDir, 'uploads')))
        .rejects.toThrow('initialization failed');
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      jest.dontMock('sqlite');
      jest.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retries singleton database initialization after a rejected attempt', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-init-retry-'));
    const originalDatabasePath = process.env.DATABASE_PATH;
    const originalUploadDir = process.env.UPLOAD_DIR;
    const fakeDb = {
      exec: jest.fn().mockResolvedValue(undefined),
      all: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const open = jest.fn()
      .mockRejectedValueOnce(new Error('open failed'))
      .mockResolvedValueOnce(fakeDb);
    process.env.DATABASE_PATH = join(tempDir, 'retry.db');
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    jest.resetModules();
    jest.doMock('sqlite', () => ({ open }));

    try {
      const isolatedDatabase = await import('../src/database');
      await expect(isolatedDatabase.getDb()).rejects.toThrow('open failed');
      await expect(isolatedDatabase.getDb()).resolves.toBe(fakeDb);
      expect(open).toHaveBeenCalledTimes(2);
    } finally {
      jest.dontMock('sqlite');
      jest.resetModules();
      restoreEnv('DATABASE_PATH', originalDatabasePath);
      restoreEnv('UPLOAD_DIR', originalUploadDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
