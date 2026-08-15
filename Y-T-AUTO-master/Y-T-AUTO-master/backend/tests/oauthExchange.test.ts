import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database } from 'sqlite';

type DatabaseModule = typeof import('../src/database');
type OAuthStateModule = typeof import('../src/services/oauth/oauthState');
type OAuthExchangeModule = typeof import('../src/services/oauth/oauthExchange');

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function hashOpaqueValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const BINDING_A = 'A'.repeat(43);
const BINDING_B = 'B'.repeat(43);

describe('opaque OAuth state and callback exchange codes', () => {
  let tempDir = '';
  let db: Database;
  let database: DatabaseModule;
  let oauthState: OAuthStateModule;
  let oauthExchange: OAuthExchangeModule;
  let originalDatabasePath: string | undefined;
  let originalUploadDir: string | undefined;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-oauth-exchange-'));
    originalDatabasePath = process.env.DATABASE_PATH;
    originalUploadDir = process.env.UPLOAD_DIR;
    process.env.DATABASE_PATH = join(tempDir, 'oauth.db');
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    jest.resetModules();
    database = await import('../src/database');
    oauthState = await import('../src/services/oauth/oauthState');
    oauthExchange = await import('../src/services/oauth/oauthExchange');
    db = await database.getDb();
    await db.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      'user-1',
      'user-1@example.com',
      'hash',
    );
    await db.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      'user-2',
      'user-2@example.com',
      'hash',
    );
  });

  beforeEach(async () => {
    await db.run('DELETE FROM oauth_authorization_states');
    await db.run('DELETE FROM oauth_callback_codes');
  });

  afterAll(async () => {
    try {
      if (database) await database.closeDb();
    } finally {
      restoreEnv('DATABASE_PATH', originalDatabasePath);
      restoreEnv('UPLOAD_DIR', originalUploadDir);
      jest.resetModules();
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('issues a 32-byte base64url login state and stores only its SHA-256 hash', async () => {
    const now = 1_000_000;
    const state = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LOGIN',
    }, BINDING_A, now);

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      state,
    )).toBeUndefined();
    expect(await db.get(
      `SELECT state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at
       FROM oauth_authorization_states WHERE state_hash = ?`,
      hashOpaqueValue(state),
    )).toEqual({
      state_hash: hashOpaqueValue(state),
      binding_hash: hashOpaqueValue(BINDING_A),
      provider: 'GOOGLE',
      purpose: 'LOGIN',
      user_id: null,
      expires_at: now + 10 * 60 * 1000,
      created_at: now,
    });
  });

  it('deletes expired authorization states on issuance while preserving unexpired states', async () => {
    const now = 1_500_000;
    const expiredState = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LOGIN',
    }, BINDING_A, now - oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS);
    const unexpiredState = await oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LOGIN',
    }, BINDING_A, now - oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS + 1);

    await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LOGIN',
    }, BINDING_A, now);

    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      hashOpaqueValue(expiredState),
    )).toBeUndefined();
    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      hashOpaqueValue(unexpiredState),
    )).toEqual({ state_hash: hashOpaqueValue(unexpiredState) });
  });

  it('rejects a Google LINK flood without evicting unrelated Google or Facebook LOGIN states', async () => {
    const now = 1_700_000;
    const googleLogin = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LOGIN',
    }, BINDING_A, now - 2);
    const facebookLogin = await oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LOGIN',
    }, BINDING_A, now - 1);
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 998
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('attacker-google-link-%04d', value), ?, 'GOOGLE', 'LINK', 'user-1', ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_B),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LINK',
      userId: 'user-1',
    }, BINDING_B, now)).rejects.toMatchObject({
      code: 'OAUTH_RATE_LIMITED',
      statusCode: 429,
    });

    await expect(oauthState.consumeOAuthAuthorizationState(
      googleLogin,
      'GOOGLE',
      BINDING_A,
      now + 1,
    )).resolves.toEqual({ provider: 'GOOGLE', purpose: 'LOGIN', userId: null });
    await expect(oauthState.consumeOAuthAuthorizationState(
      facebookLogin,
      'FACEBOOK',
      BINDING_A,
      now + 1,
    )).resolves.toEqual({ provider: 'FACEBOOK', purpose: 'LOGIN', userId: null });
  });

  it('does not let user A LINK pressure evict user B pending LINK state', async () => {
    const now = 1_725_000;
    const userBState = await oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LINK',
      userId: 'user-2',
    }, BINDING_A, now - 1);
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 999
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('user-a-link-%04d', value), ?, 'GOOGLE', 'LINK', 'user-1', ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_B),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LINK',
      userId: 'user-1',
    }, BINDING_B, now)).rejects.toMatchObject({ code: 'OAUTH_RATE_LIMITED' });
    await expect(oauthState.consumeOAuthAuthorizationState(
      userBState,
      'FACEBOOK',
      BINDING_A,
      now + 1,
    )).resolves.toEqual({ provider: 'FACEBOOK', purpose: 'LINK', userId: 'user-2' });
  });

  it('bounds pending LINK states per principal without blocking another principal', async () => {
    const now = 1_740_000;
    for (let index = 0; index < 10; index += 1) {
      await oauthState.issueOAuthAuthorizationState({
        provider: index < 5 ? 'GOOGLE' : 'FACEBOOK',
        purpose: 'LINK',
        userId: 'user-1',
      }, BINDING_A, now + index);
    }

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LINK',
      userId: 'user-1',
    }, BINDING_B, now + 11)).rejects.toMatchObject({ code: 'OAUTH_RATE_LIMITED' });
    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LINK',
      userId: 'user-2',
    }, BINDING_B, now + 11)).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('isolates Google LINK capacity from Facebook LINK and both LOGIN providers', async () => {
    const now = 1_750_000;
    const googleLogin = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE', purpose: 'LOGIN',
    }, BINDING_A, now - 2);
    const facebookLogin = await oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK', purpose: 'LOGIN',
    }, BINDING_A, now - 1);
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 21
       )
       INSERT OR IGNORE INTO users (id, email, password_hash)
       SELECT printf('provider-user-%03d', value),
              printf('provider-user-%03d@example.com', value),
              'hash'
       FROM sequence`,
    );
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 100
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('google-provider-link-%04d', value), ?, 'GOOGLE', 'LINK',
              printf('provider-user-%03d', CAST(value / 5 AS INTEGER)), ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_B),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE', purpose: 'LINK', userId: 'provider-user-020',
    }, BINDING_B, now + 101)).rejects.toMatchObject({ code: 'OAUTH_RATE_LIMITED' });
    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK', purpose: 'LINK', userId: 'provider-user-020',
    }, BINDING_B, now + 101)).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(oauthState.consumeOAuthAuthorizationState(
      googleLogin, 'GOOGLE', BINDING_A, now + 102,
    )).resolves.toEqual({ provider: 'GOOGLE', purpose: 'LOGIN', userId: null });
    await expect(oauthState.consumeOAuthAuthorizationState(
      facebookLogin, 'FACEBOOK', BINDING_A, now + 102,
    )).resolves.toEqual({ provider: 'FACEBOOK', purpose: 'LOGIN', userId: null });
  });

  it('rejects new issuance at the hard global ceiling without deleting any live row', async () => {
    const now = 1_750_000;
    const expectedCap = 1_000;
    expect(
      oauthState.OAUTH_LOGIN_STATE_MAX_LIVE + oauthState.OAUTH_REGISTER_STATE_MAX_LIVE + oauthState.OAUTH_LINK_STATE_MAX_LIVE,
    ).toBe(expectedCap);
    expect(oauthState.OAUTH_LOGIN_STATE_MAX_LIVE_PER_PROVIDER * 2)
      .toBe(oauthState.OAUTH_LOGIN_STATE_MAX_LIVE);
    expect(oauthState.OAUTH_LINK_STATE_MAX_LIVE_PER_PROVIDER * 2)
      .toBe(oauthState.OAUTH_LINK_STATE_MAX_LIVE);
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('state-%04d', value), ?, 'GOOGLE', 'LOGIN', NULL, ?, value
       FROM sequence`,
      expectedCap,
      hashOpaqueValue(BINDING_A),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
    );

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LOGIN',
    }, BINDING_A, now)).rejects.toMatchObject({
      code: 'OAUTH_RATE_LIMITED',
      statusCode: 429,
    });

    expect(oauthState.OAUTH_AUTHORIZATION_STATE_MAX_LIVE).toBe(expectedCap);
    expect(await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM oauth_authorization_states WHERE expires_at > ?',
      now,
    )).toEqual({ count: expectedCap });
    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      'state-0000',
    )).toEqual({ state_hash: 'state-0000' });
  });

  it('commits TTL cleanup before applying LINK admission quotas', async () => {
    const now = 1_775_000;
    const states: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      states.push(await oauthState.issueOAuthAuthorizationState({
        provider: 'GOOGLE', purpose: 'LINK', userId: 'user-1',
      }, BINDING_A, now - oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS + index));
    }

    const replacement = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE', purpose: 'LINK', userId: 'user-1',
    }, BINDING_A, now);

    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      hashOpaqueValue(states[0]),
    )).toBeUndefined();
    expect(await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM oauth_authorization_states
       WHERE purpose = 'LINK' AND provider = 'GOOGLE' AND user_id = 'user-1'`,
    )).toEqual({ count: 5 });
    await expect(oauthState.consumeOAuthAuthorizationState(
      replacement, 'GOOGLE', BINDING_A, now + 1,
    )).resolves.toEqual({ provider: 'GOOGLE', purpose: 'LINK', userId: 'user-1' });
  });

  it('commits expired-row cleanup even when replacement issuance is rejected', async () => {
    const now = 1_785_000;
    for (let index = 0; index < 5; index += 1) {
      await oauthState.issueOAuthAuthorizationState({
        provider: 'GOOGLE', purpose: 'LINK', userId: 'user-1',
      }, BINDING_A, now + index);
    }
    await db.run(
      `INSERT INTO oauth_authorization_states
       (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       VALUES ('expired-before-rejection', ?, 'FACEBOOK', 'LOGIN', NULL, ?, ?)`,
      hashOpaqueValue(BINDING_A),
      now,
      now - oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
    );

    await expect(oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE', purpose: 'LINK', userId: 'user-1',
    }, BINDING_A, now + 10)).rejects.toMatchObject({ code: 'OAUTH_RATE_LIMITED' });
    expect(await db.get(
      'SELECT state_hash FROM oauth_authorization_states WHERE state_hash = ?',
      'expired-before-rejection',
    )).toBeUndefined();
  });

  it('serializes concurrent issuance at the final global capacity slot', async () => {
    const now = 1_790_000;
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 42
       )
       INSERT OR IGNORE INTO users (id, email, password_hash)
       SELECT printf('boundary-user-%03d', value),
              printf('boundary-user-%03d@example.com', value),
              'hash'
       FROM sequence`,
    );
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 800
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('boundary-login-%04d', value), ?,
              CASE WHEN value < 400 THEN 'GOOGLE' ELSE 'FACEBOOK' END,
              'LOGIN', NULL, ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_A),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 199
       )
       INSERT INTO oauth_authorization_states
         (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       SELECT printf('boundary-link-%04d', value), ?,
              CASE WHEN value < 100 THEN 'GOOGLE' ELSE 'FACEBOOK' END,
              'LINK',
              CASE WHEN value < 100
                THEN printf('boundary-user-%03d', CAST(value / 5 AS INTEGER))
                ELSE printf('boundary-user-%03d', 20 + CAST((value - 100) / 5 AS INTEGER))
              END,
              ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_B),
      now + oauthState.OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );

    const results = await Promise.allSettled([
      oauthState.issueOAuthAuthorizationState({
        provider: 'FACEBOOK', purpose: 'LINK', userId: 'boundary-user-040',
      }, BINDING_B, now + 1_000),
      oauthState.issueOAuthAuthorizationState({
        provider: 'FACEBOOK', purpose: 'LINK', userId: 'boundary-user-041',
      }, BINDING_B, now + 1_000),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'OAUTH_RATE_LIMITED', statusCode: 429 },
    });
    expect(await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM oauth_authorization_states WHERE expires_at > ?',
      now,
    )).toEqual({ count: 1_000 });
  });

  it('round-trips a provider-bound link state once', async () => {
    const now = 2_000_000;
    const state = await oauthState.issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LINK',
      userId: 'user-1',
    }, BINDING_A, now);

    await expect(oauthState.consumeOAuthAuthorizationState(state, 'FACEBOOK', BINDING_A, now + 1))
      .resolves.toEqual({ provider: 'FACEBOOK', purpose: 'LINK', userId: 'user-1' });
    await expect(oauthState.consumeOAuthAuthorizationState(state, 'FACEBOOK', BINDING_A, now + 2))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
  });

  it('rejects invalid, expired, provider-mismatched, and browser-mismatched state generically', async () => {
    const now = 3_000_000;
    const state = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LOGIN',
    }, BINDING_A, now);

    await expect(oauthState.consumeOAuthAuthorizationState('not-a-state', 'GOOGLE', BINDING_A, now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    await expect(oauthState.consumeOAuthAuthorizationState(state, 'FACEBOOK', BINDING_A, now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    await expect(oauthState.consumeOAuthAuthorizationState(state, 'GOOGLE', BINDING_B, now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    await expect(oauthState.consumeOAuthAuthorizationState(state, 'GOOGLE', '', now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    await expect(oauthState.consumeOAuthAuthorizationState(state, 'GOOGLE', BINDING_A, now + 10 * 60 * 1000))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
  });

  it('issues a 60-second session callback code and stores only its SHA-256 hash', async () => {
    const now = 4_000_000;
    const code = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await db.get(
      'SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?',
      code,
    )).toBeUndefined();
    expect(await db.get(
      `SELECT code_hash, binding_hash, result_kind, user_id, error_code, expires_at, created_at
       FROM oauth_callback_codes WHERE code_hash = ?`,
      hashOpaqueValue(code),
    )).toEqual({
      code_hash: hashOpaqueValue(code),
      binding_hash: hashOpaqueValue(BINDING_A),
      result_kind: 'SESSION',
      user_id: 'user-1',
      error_code: null,
      expires_at: now + 60 * 1000,
      created_at: now,
    });
  });

  it('deletes expired callback codes on issuance while preserving unexpired codes', async () => {
    const now = 4_500_000;
    const expiredCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now - oauthExchange.OAUTH_CALLBACK_CODE_TTL_MS);
    const unexpiredCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'ERROR',
      purpose: 'LOGIN',
      errorCode: 'OAUTH_PROVIDER_FAILED',
    }, BINDING_A, now - oauthExchange.OAUTH_CALLBACK_CODE_TTL_MS + 1);

    await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    expect(await db.get(
      'SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?',
      hashOpaqueValue(expiredCode),
    )).toBeUndefined();
    expect(await db.get(
      'SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?',
      hashOpaqueValue(unexpiredCode),
    )).toEqual({ code_hash: hashOpaqueValue(unexpiredCode) });
  });

  it('caps live SESSION callback codes and evicts only the oldest SESSION row', async () => {
    const now = 4_750_000;
    const expectedCap = 1_000;
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO oauth_callback_codes
         (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       SELECT printf('code-%04d', value), ?, 'LOGIN', 'SESSION', 'user-1', NULL, ?, value
       FROM sequence`,
      expectedCap,
      hashOpaqueValue(BINDING_A),
      now + oauthExchange.OAUTH_CALLBACK_CODE_TTL_MS,
    );

    const issued = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    expect(oauthExchange.OAUTH_CALLBACK_SESSION_MAX_LIVE).toBe(expectedCap);
    expect(await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM oauth_callback_codes
       WHERE result_kind = 'SESSION' AND expires_at > ?`,
      now,
    )).toEqual({ count: expectedCap });
    expect(await db.get(
      'SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?',
      'code-0000',
    )).toBeUndefined();
    expect(await db.get(
      'SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?',
      hashOpaqueValue(issued),
    )).toEqual({ code_hash: hashOpaqueValue(issued) });
  });

  it('bounds ERROR callback floods without evicting live SESSION codes', async () => {
    const now = 4_900_000;
    const sessionCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now - 1_000);
    await db.run(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < 999
       )
       INSERT INTO oauth_callback_codes
         (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       SELECT printf('session-%04d', value), ?, 'LOGIN', 'SESSION', 'user-1', NULL, ?, ? + value
       FROM sequence`,
      hashOpaqueValue(BINDING_A),
      now + oauthExchange.OAUTH_CALLBACK_CODE_TTL_MS,
      now - 999,
    );

    for (let index = 0; index <= 250; index += 1) {
      await oauthExchange.issueOAuthCallbackCode({
        kind: 'ERROR',
        purpose: 'LOGIN',
        errorCode: 'OAUTH_PROVIDER_FAILED',
      }, BINDING_A, now);
    }

    expect(await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM oauth_callback_codes
       WHERE result_kind = 'SESSION' AND expires_at > ?`,
      now,
    )).toEqual({ count: 1_000 });
    expect(await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM oauth_callback_codes
       WHERE result_kind = 'ERROR' AND expires_at > ?`,
      now,
    )).toEqual({ count: 250 });
    await expect(oauthExchange.consumeOAuthCallbackCode(sessionCode, BINDING_A, 'LOGIN', now + 1))
      .resolves.toEqual({ kind: 'SESSION', purpose: 'LOGIN', userId: 'user-1' });
    expect(oauthExchange.OAUTH_CALLBACK_ERROR_MAX_LIVE).toBe(250);
  });

  it('consumes session and safe error callback results exactly once', async () => {
    const now = 5_000_000;
    const sessionCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);
    const errorCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'ERROR',
      purpose: 'LOGIN',
      errorCode: 'OAUTH_PROVIDER_FAILED',
    }, BINDING_A, now);

    await expect(oauthExchange.consumeOAuthCallbackCode(sessionCode, BINDING_A, 'LOGIN', now + 1))
      .resolves.toEqual({ kind: 'SESSION', purpose: 'LOGIN', userId: 'user-1' });
    await expect(oauthExchange.consumeOAuthCallbackCode(errorCode, BINDING_A, 'LOGIN', now + 1))
      .resolves.toEqual({ kind: 'ERROR', purpose: 'LOGIN', errorCode: 'OAUTH_PROVIDER_FAILED' });
    await expect(oauthExchange.consumeOAuthCallbackCode(sessionCode, BINDING_A, 'LOGIN', now + 2))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
  });

  it('rejects an unsupported callback error code generically without storing it', async () => {
    const unsafeErrorCode = 'Provider exposed user@example.com';

    await expect(oauthExchange.issueOAuthCallbackCode({
      kind: 'ERROR',
      purpose: 'LOGIN',
      errorCode: unsafeErrorCode,
    } as any, BINDING_A, 5_500_000)).rejects.toMatchObject({
      code: 'INVALID_OAUTH_ERROR_CODE',
      message: 'OAuth callback error code is invalid.',
    });
    expect(await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM oauth_callback_codes',
    )).toEqual({ count: 0 });
  });

  it('prevents unsupported callback error codes from bypassing the service boundary', async () => {
    await expect(db.run(
      `INSERT INTO oauth_callback_codes
       (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       VALUES (?, ?, 'LOGIN', ?, ?, ?, ?, ?)`,
      'unsafe-error-code-hash',
      hashOpaqueValue(BINDING_A),
      'ERROR',
      null,
      'Provider exposed user@example.com',
      5_500_001,
      5_500_000,
    )).rejects.toThrow();
    expect(await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM oauth_callback_codes',
    )).toEqual({ count: 0 });
  });

  it('uses the same typed rejection for invalid, expired, and replayed callback codes', async () => {
    const now = 6_000_000;
    const code = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    await expect(oauthExchange.consumeOAuthCallbackCode('not-a-code', BINDING_A, 'LOGIN', now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
    await expect(oauthExchange.consumeOAuthCallbackCode(code, BINDING_A, 'LOGIN', now + 60 * 1000))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
    await expect(oauthExchange.consumeOAuthCallbackCode(code, BINDING_A, 'LOGIN', now + 60 * 1000 + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
  });

  it('requires the issuing browser binding for callback code exchange', async () => {
    const now = 6_500_000;
    const code = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    await expect(oauthExchange.consumeOAuthCallbackCode(code, BINDING_B, 'LOGIN', now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
    await expect(oauthExchange.consumeOAuthCallbackCode(code, '', 'LOGIN', now + 1))
      .rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
    await expect(oauthExchange.consumeOAuthCallbackCode(code, BINDING_A, 'LOGIN', now + 1))
      .resolves.toEqual({ kind: 'SESSION', purpose: 'LOGIN', userId: 'user-1' });
  });

  it('allows exactly one of two concurrent callback code consumes to succeed', async () => {
    const now = 7_000_000;
    const code = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'user-1',
    }, BINDING_A, now);

    const results = await Promise.allSettled([
      oauthExchange.consumeOAuthCallbackCode(code, BINDING_A, 'LOGIN', now + 1),
      oauthExchange.consumeOAuthCallbackCode(code, BINDING_A, 'LOGIN', now + 1),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'fulfilled')).toMatchObject({
      value: { kind: 'SESSION', userId: 'user-1' },
    });
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'INVALID_OAUTH_CODE' },
    });
  });
});
