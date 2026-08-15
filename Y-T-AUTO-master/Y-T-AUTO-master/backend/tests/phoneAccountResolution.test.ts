import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import jwt from 'jsonwebtoken';
import type { Database } from 'sqlite';
import { createDatabase, MIGRATIONS_DIR } from '../src/database';
import { registerUser, loginUser, signSessionForUser } from '../src/repositories/authRepository';
import { config } from '../src/config';
import { PersistentPhoneRateLimiter } from '../src/services/phone/rateLimits';
import { PhoneAuthService } from '../src/services/phone/phoneAuthService';

const SECRET = 'phone-account-test-secret-with-at-least-thirty-two-bytes';
const BINDING_TOKEN = 'B'.repeat(43);

describe('phone account resolution', () => {
  let tempDir: string;
  let db: Database;
  let now: number;
  let sequence: number;
  let databasePath: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-phone-account-'));
    databasePath = join(tempDir, 'account.db');
    process.env.DATABASE_PATH = databasePath;
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '7d';
    db = await createDatabase(databasePath, process.env.UPLOAD_DIR, MIGRATIONS_DIR);
    now = 1_800_000_000_000;
    sequence = 0;
  });

  afterEach(async () => {
    await db.close();
    const databaseModule = await import('../src/database');
    await databaseModule.closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function service(sessionSigner = async (userId: string) => ({ userId, token: `token-${userId}` })) {
    return new PhoneAuthService({
      db,
      provider: { async sendOtp() {} },
      otpHmacSecret: SECRET,
      rateLimiter: new PersistentPhoneRateLimiter({ db, hmacKey: SECRET, now: () => now }),
      now: () => now,
      generateChallengeToken: () => `challenge-${++sequence}`,
      generateBindingToken: () => BINDING_TOKEN,
      generateOtp: () => '123456',
      generateId: () => `generated-${++sequence}`,
      sessionSigner,
    });
  }

  async function login(phone: string, instance = service()) {
    const challenge = await instance.requestLoginOtp({ phone, ip: `ip-${sequence}`, browserBinding: BINDING_TOKEN });
    return instance.verifyLoginOtp({ challengeToken: challenge.challengeToken, code: '123456', ip: `verify-${sequence}`, browserBinding: BINDING_TOKEN });
  }

  async function register(phone: string, instance = service()) {
    const challenge = await instance.requestRegisterOtp({ phone, ip: `ip-${sequence}`, browserBinding: BINDING_TOKEN });
    return instance.verifyRegisterOtp({ challengeToken: challenge.challengeToken, code: '123456', ip: `verify-${sequence}`, browserBinding: BINDING_TOKEN });
  }

  async function link(userId: string, phone: string, instance = service()) {
    const challenge = await instance.requestLinkOtp({ phone, ip: `ip-${sequence}`, browserBinding: BINDING_TOKEN, userId });
    return instance.verifyLinkOtp({ challengeToken: challenge.challengeToken, code: '123456', ip: `verify-${sequence}`, browserBinding: BINDING_TOKEN, userId });
  }

  it('logs into an existing phone identity and onboards a phone-only user without duplicating it', async () => {
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('existing', 'existing@example.com', 'hash')");
    await db.run('INSERT INTO user_phone_identities (id, user_id, phone_e164, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      'phone-existing', 'existing', '+84912345678', now, now, now);
    await expect(login('0912345678')).resolves.toEqual({ userId: 'existing', token: 'token-existing' });

    now += 60_000;
    const created = await register('0933333333');
    const user = await db.get<any>('SELECT * FROM users WHERE id = ?', created.userId);
    expect(user.email).toMatch(/^phone-.+@phone-auth\.invalid$/);
    expect(user.email_is_placeholder).toBe(1);
    expect(user.password_hash).toBe('PHONE_ONLY_NO_PASSWORD');
    expect(user.auth_provider).toBe('PHONE');
    expect(await db.get('SELECT user_id FROM user_phone_identities WHERE phone_e164 = ?', '+84933333333'))
      .toEqual({ user_id: created.userId });
  });

  it('uses UUID identifiers for production phone-only onboarding', async () => {
    const productionLike = new PhoneAuthService({
      db,
      provider: { async sendOtp() {} },
      otpHmacSecret: SECRET,
      rateLimiter: new PersistentPhoneRateLimiter({ db, hmacKey: SECRET, now: () => now }),
      now: () => now,
      generateChallengeToken: () => 'C'.repeat(43),
      generateBindingToken: () => 'B'.repeat(43),
      generateOtp: () => '123456',
      sessionSigner: async (userId) => ({ userId, token: `token-${userId}` }),
    });

    const created = await register('0933333333', productionLike);
    expect(created.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('links idempotently but rejects an owned phone and a different phone on the same account', async () => {
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('user-a', 'a@example.com', 'hash'), ('user-b', 'b@example.com', 'hash')");
    await db.run('INSERT INTO user_phone_identities (id, user_id, phone_e164, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      'phone-b', 'user-b', '+84988888888', now, now, now);

    await expect(link('user-a', '0912345678')).resolves.toEqual({ userId: 'user-a', phoneE164: '+84912345678' });
    now += 60_000;
    await expect(link('user-a', '0912345678')).resolves.toEqual({ userId: 'user-a', phoneE164: '+84912345678' });
    now += 60_000;
    await expect(link('user-a', '0988888888')).rejects.toMatchObject({ code: 'PHONE_IDENTITY_CONFLICT', statusCode: 409 });
    now += 60_000;
    await expect(link('user-a', '0977777777')).rejects.toMatchObject({ code: 'PHONE_IDENTITY_CONFLICT', statusCode: 409 });
  });

  it('returns only an unverified or masked verified phone status for an account', async () => {
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('status-user', 'status@example.com', 'hash')");
    const instance = service();
    await expect(instance.getStatus('status-user')).resolves.toEqual({
      phoneVerified: false,
      maskedPhone: null,
    });

    await link('status-user', '0912345678', instance);
    await expect(instance.getStatus('status-user')).resolves.toEqual({
      phoneVerified: true,
      maskedPhone: '+84******678',
    });
    expect(JSON.stringify(await instance.getStatus('status-user'))).not.toContain('+84912345678');
  });

  it('rolls back OTP consumption, onboarding, and linking when session/account work fails', async () => {
    const failing = service(async () => { throw new Error('signing failed'); });
    const challenge = await failing.requestRegisterOtp({ phone: '0912345678', ip: 'ip-fail', browserBinding: BINDING_TOKEN });
    await expect(failing.verifyRegisterOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'verify-fail', browserBinding: BINDING_TOKEN,
    })).rejects.toThrow('signing failed');
    expect(await db.get('SELECT status FROM phone_otp_challenges')).toEqual({ status: 'SENT' });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 0 });

    now += 60_000;
    const brokenAccount = new PhoneAuthService({
      db,
      provider: { async sendOtp() {} },
      otpHmacSecret: SECRET,
      rateLimiter: new PersistentPhoneRateLimiter({ db, hmacKey: SECRET, now: () => now }),
      now: () => now,
      generateChallengeToken: () => 'broken-account-challenge',
      generateBindingToken: () => BINDING_TOKEN,
      generateOtp: () => '123456',
      generateId: () => 'duplicate-id',
      sessionSigner: async (userId) => ({ userId, token: 'unused' }),
    });
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('duplicate-id', 'duplicate@example.com', 'hash')");
    const brokenChallenge = await brokenAccount.requestRegisterOtp({
      phone: '0933333333', ip: 'account-fail', browserBinding: BINDING_TOKEN,
    });
    await expect(brokenAccount.verifyRegisterOtp({
      challengeToken: brokenChallenge.challengeToken, code: '123456', ip: 'account-fail', browserBinding: BINDING_TOKEN,
    })).rejects.toThrow();
    expect(await db.get('SELECT status FROM phone_otp_challenges WHERE phone_e164 = ?', '+84933333333'))
      .toEqual({ status: 'SENT' });
    expect(await db.get('SELECT user_id FROM user_phone_identities WHERE phone_e164 = ?', '+84933333333')).toBeUndefined();
  });

  it('uses the unchanged JWT userId claim and configured expiry', async () => {
    const session = await signSessionForUser('jwt-user');
    const decoded = jwt.verify(session.token, config.jwtSecret) as jwt.JwtPayload;
    expect(session.userId).toBe('jwt-user');
    expect(decoded.userId).toBe('jwt-user');
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60);
  });

  it('rejects reserved placeholder emails for public registration and password login', async () => {
    await expect(registerUser('attacker@phone-auth.invalid', 'password123')).rejects.toMatchObject({
      code: 'RESERVED_EMAIL_DOMAIN', statusCode: 400,
    });
    await db.run("INSERT INTO users (id, email, password_hash, email_is_placeholder) VALUES ('phone-user', 'phone-id@phone-auth.invalid', ?, 1)",
      '$2b$10$Sklr/Q3RqLzE37s7qnbxEeuqkLWHxgnG6KT2nvHiUiUS8Jg/aEuZO');
    await expect(loginUser('phone-id@phone-auth.invalid', 'password123')).rejects.toMatchObject({ statusCode: 401 });
  });
});
