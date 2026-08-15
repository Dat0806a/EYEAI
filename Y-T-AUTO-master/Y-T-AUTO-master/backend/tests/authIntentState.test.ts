import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sqlite';

type DatabaseModule = typeof import('../src/database');
type OAuthStateModule = typeof import('../src/services/oauth/oauthState');
type OAuthExchangeModule = typeof import('../src/services/oauth/oauthExchange');

const BINDING = 'B'.repeat(43);

describe('explicit OAuth intent persistence', () => {
  let tempDir: string;
  let database: DatabaseModule;
  let oauthState: OAuthStateModule;
  let oauthExchange: OAuthExchangeModule;
  let db: Database;
  let originalDatabasePath: string | undefined;
  let originalUploadDir: string | undefined;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-auth-intent-state-'));
    originalDatabasePath = process.env.DATABASE_PATH;
    originalUploadDir = process.env.UPLOAD_DIR;
    process.env.DATABASE_PATH = join(tempDir, 'auth-intent.db');
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    jest.resetModules();
    database = await import('../src/database');
    oauthState = await import('../src/services/oauth/oauthState');
    oauthExchange = await import('../src/services/oauth/oauthExchange');
    db = await database.getDb();
    await db.run(
      "INSERT INTO users (id, email, password_hash) VALUES ('intent-user', 'intent@example.com', 'hash')",
    );
  });

  beforeEach(async () => {
    await db.run('DELETE FROM oauth_authorization_states');
    await db.run('DELETE FROM oauth_callback_codes');
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

  it('round-trips a browser-bound REGISTER authorization state once', async () => {
    const state = await oauthState.issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'REGISTER',
    }, BINDING, 1_000_000);

    await expect(oauthState.consumeOAuthAuthorizationState(
      state,
      'GOOGLE',
      BINDING,
      1_000_001,
    )).resolves.toEqual({ provider: 'GOOGLE', purpose: 'REGISTER', userId: null });
    await expect(oauthState.consumeOAuthAuthorizationState(
      state,
      'GOOGLE',
      BINDING,
      1_000_002,
    )).rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
  });

  it('binds a callback session to its intent and burns the code on mismatch', async () => {
    const code = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'REGISTER',
      userId: 'intent-user',
    }, BINDING, 2_000_000);

    await expect(oauthExchange.consumeOAuthCallbackCode(
      code,
      BINDING,
      'LOGIN',
      2_000_001,
    )).rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
    await expect(oauthExchange.consumeOAuthCallbackCode(
      code,
      BINDING,
      'REGISTER',
      2_000_002,
    )).rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
  });

  it('round-trips purpose-bound success and safe post-proof guidance errors', async () => {
    const sessionCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'SESSION',
      purpose: 'LOGIN',
      userId: 'intent-user',
    }, BINDING, 3_000_000);
    const loginRequiredCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'ERROR',
      purpose: 'REGISTER',
      errorCode: 'LOGIN_REQUIRED',
    }, BINDING, 3_000_000);
    const registrationRequiredCode = await oauthExchange.issueOAuthCallbackCode({
      kind: 'ERROR',
      purpose: 'LOGIN',
      errorCode: 'REGISTRATION_REQUIRED',
    }, BINDING, 3_000_000);

    await expect(oauthExchange.consumeOAuthCallbackCode(
      sessionCode,
      BINDING,
      'LOGIN',
      3_000_001,
    )).resolves.toEqual({ kind: 'SESSION', purpose: 'LOGIN', userId: 'intent-user' });
    await expect(oauthExchange.consumeOAuthCallbackCode(
      loginRequiredCode,
      BINDING,
      'REGISTER',
      3_000_001,
    )).resolves.toEqual({ kind: 'ERROR', purpose: 'REGISTER', errorCode: 'LOGIN_REQUIRED' });
    await expect(oauthExchange.consumeOAuthCallbackCode(
      registrationRequiredCode,
      BINDING,
      'LOGIN',
      3_000_001,
    )).resolves.toEqual({ kind: 'ERROR', purpose: 'LOGIN', errorCode: 'REGISTRATION_REQUIRED' });
  });
});
