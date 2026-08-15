import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sqlite';

type DatabaseModule = typeof import('../src/database');
type RepositoryModule = typeof import('../src/repositories/authRepository');

describe('explicit OAuth account resolution', () => {
  let tempDir: string;
  let db: Database;
  let database: DatabaseModule;
  let repository: RepositoryModule;
  let originalDatabasePath: string | undefined;
  let originalUploadDir: string | undefined;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-oauth-account-intent-'));
    originalDatabasePath = process.env.DATABASE_PATH;
    originalUploadDir = process.env.UPLOAD_DIR;
    process.env.DATABASE_PATH = join(tempDir, 'oauth-account.db');
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    jest.resetModules();
    database = await import('../src/database');
    repository = await import('../src/repositories/authRepository');
    db = await database.getDb();
  });

  beforeEach(async () => {
    await db.run('DELETE FROM user_oauth_identities');
    await db.run('DELETE FROM users');
  });

  afterAll(async () => {
    await database.closeDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
    jest.resetModules();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const googleIdentity = {
    provider: 'GOOGLE' as const,
    providerSub: 'google-subject',
    email: 'new-google@example.com',
    emailVerified: true,
  };

  const facebookIdentity = {
    provider: 'FACEBOOK' as const,
    providerSub: 'facebook-subject',
    email: 'new-facebook@example.com',
    emailVerified: false,
  };

  it.each([
    ['Google', googleIdentity],
    ['Facebook', facebookIdentity],
  ])('%s REGISTER creates one new user and one provider identity', async (_label, identity) => {
    const result = await repository.registerOAuthUser(identity);

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    expect(await db.get(
      'SELECT user_id, provider, provider_sub FROM user_oauth_identities',
    )).toEqual({
      user_id: result.userId,
      provider: identity.provider,
      provider_sub: identity.providerSub,
    });
  });

  it.each([
    ['Google', googleIdentity],
    ['Facebook', facebookIdentity],
  ])('%s REGISTER rejects an existing identity without duplicating it', async (_label, identity) => {
    const first = await repository.registerOAuthUser(identity);

    await expect(repository.registerOAuthUser(identity)).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
      statusCode: 409,
    });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    expect(await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM user_oauth_identities WHERE user_id = ?',
      first.userId,
    )).toEqual({ count: 1 });
  });

  it.each([
    ['Google', googleIdentity],
    ['Facebook', facebookIdentity],
  ])('%s LOGIN authenticates an existing identity', async (_label, identity) => {
    const registered = await repository.registerOAuthUser(identity);

    await expect(repository.loginWithOAuthIdentity(identity)).resolves.toEqual({
      userId: registered.userId,
    });
  });

  it.each([
    ['Google', googleIdentity],
    ['Facebook', facebookIdentity],
  ])('%s LOGIN rejects an unknown identity without creating a user', async (_label, identity) => {
    await expect(repository.loginWithOAuthIdentity(identity)).rejects.toMatchObject({
      code: 'REGISTRATION_REQUIRED',
      statusCode: 409,
    });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 0 });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_oauth_identities'))
      .toEqual({ count: 0 });
  });

  it('never silently links an unknown Google identity to an existing email account', async () => {
    await db.run(
      `INSERT INTO users
       (id, email, password_hash, email_verified, email_verification_source)
       VALUES ('email-owner', 'new-google@example.com', 'hash', 1, 'INTERNAL')`,
    );

    await expect(repository.loginWithOAuthIdentity(googleIdentity)).rejects.toMatchObject({
      code: 'OAUTH_EMAIL_LINK_REQUIRED',
      statusCode: 409,
    });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_oauth_identities'))
      .toEqual({ count: 0 });
  });

  it('REGISTER treats any existing email account as already registered without merging', async () => {
    await db.run(
      "INSERT INTO users (id, email, password_hash) VALUES ('email-owner', 'new-google@example.com', 'hash')",
    );

    await expect(repository.registerOAuthUser(googleIdentity)).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
      statusCode: 409,
    });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_oauth_identities'))
      .toEqual({ count: 0 });
  });

  it('allows only one of two concurrent OAuth registrations to create the identity', async () => {
    const results = await Promise.allSettled([
      repository.registerOAuthUser(googleIdentity),
      repository.registerOAuthUser(googleIdentity),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'LOGIN_REQUIRED', statusCode: 409 },
    });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_oauth_identities'))
      .toEqual({ count: 1 });
  });

  it('fails closed instead of selecting an ambiguous legacy identity owner', async () => {
    await db.run(
      `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
       VALUES ('legacy-a', 'legacy-a@example.com', 'hash', 'GOOGLE', 'ambiguous-sub'),
              ('legacy-b', 'legacy-b@example.com', 'hash', 'GOOGLE', 'ambiguous-sub')`,
    );

    await expect(repository.loginWithOAuthIdentity({
      ...googleIdentity,
      providerSub: 'ambiguous-sub',
      email: 'unused@example.com',
    })).rejects.toMatchObject({ code: 'OAUTH_IDENTITY_CONFLICT', statusCode: 409 });
  });
});
