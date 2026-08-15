import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sqlite';
import { createDatabase, MIGRATIONS_DIR } from '../src/database';
import { PersistentPhoneRateLimiter } from '../src/services/phone/rateLimits';
import { PhoneAuthService } from '../src/services/phone/phoneAuthService';

const SECRET = 'phone-intent-test-secret-with-at-least-thirty-two-bytes';
const BINDING = 'B'.repeat(43);

describe('explicit phone auth intent', () => {
  let tempDir: string;
  let db: Database;
  let now: number;
  let sequence: number;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-phone-intent-'));
    db = await createDatabase(join(tempDir, 'phone.db'), join(tempDir, 'uploads'), MIGRATIONS_DIR);
    now = 1_900_000_000_000;
    sequence = 0;
  });

  afterEach(async () => {
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function service() {
    return new PhoneAuthService({
      db,
      provider: { async sendOtp() {} },
      otpHmacSecret: SECRET,
      rateLimiter: new PersistentPhoneRateLimiter({ db, hmacKey: SECRET, now: () => now }),
      now: () => now,
      generateChallengeToken: () => `${String(++sequence).padStart(2, '0')}${'C'.repeat(41)}`,
      generateBindingToken: () => BINDING,
      generateOtp: () => '123456',
      generateId: () => `generated-${++sequence}`,
      sessionSigner: async (userId) => ({ userId, token: `jwt-${userId}` }),
    });
  }

  it('LOGIN rejects an unknown verified phone without creating a placeholder and consumes proof', async () => {
    const instance = service();
    const challenge = await instance.requestLoginOtp({
      phone: '0912345678', ip: 'login-request', browserBinding: BINDING,
    });

    await expect(instance.verifyLoginOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'login-verify',
      browserBinding: BINDING,
    })).rejects.toMatchObject({ code: 'REGISTRATION_REQUIRED', statusCode: 409 });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 0 });
    expect(await db.get('SELECT status, code_mac FROM phone_otp_challenges')).toEqual({
      status: 'CONSUMED',
      code_mac: null,
    });
    await expect(instance.verifyLoginOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'login-replay',
      browserBinding: BINDING,
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });

  it('REGISTER creates the only allowed placeholder account and returns a session', async () => {
    const instance = service();
    const challenge = await instance.requestRegisterOtp({
      phone: '0912345678', ip: 'register-request', browserBinding: BINDING,
    });

    const session = await instance.verifyRegisterOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'register-verify',
      browserBinding: BINDING,
    });

    expect(session.token).toBe(`jwt-${session.userId}`);
    expect(await db.get(
      'SELECT email, password_hash, auth_provider, email_is_placeholder FROM users WHERE id = ?',
      session.userId,
    )).toEqual({
      email: `phone-${session.userId}@phone-auth.invalid`,
      password_hash: 'PHONE_ONLY_NO_PASSWORD',
      auth_provider: 'PHONE',
      email_is_placeholder: 1,
    });
    expect(await db.get('SELECT user_id, phone_e164 FROM user_phone_identities')).toEqual({
      user_id: session.userId,
      phone_e164: '+84912345678',
    });
  });

  it('REGISTER rejects an existing phone without duplication and consumes proof', async () => {
    await db.run(
      "INSERT INTO users (id, email, password_hash) VALUES ('existing', 'existing@example.com', 'hash')",
    );
    await db.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES ('phone-existing', 'existing', '+84912345678', ?, ?, ?)`,
      now,
      now,
      now,
    );
    const instance = service();
    const challenge = await instance.requestRegisterOtp({
      phone: '0912345678', ip: 'register-existing-request', browserBinding: BINDING,
    });

    await expect(instance.verifyRegisterOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'register-existing-verify',
      browserBinding: BINDING,
    })).rejects.toMatchObject({ code: 'LOGIN_REQUIRED', statusCode: 409 });
    expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    expect(await db.get('SELECT status FROM phone_otp_challenges')).toEqual({ status: 'CONSUMED' });
  });

  it('LOGIN authenticates only the existing phone owner', async () => {
    await db.run(
      "INSERT INTO users (id, email, password_hash) VALUES ('existing', 'existing@example.com', 'hash')",
    );
    await db.run(
      `INSERT INTO user_phone_identities
       (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES ('phone-existing', 'existing', '+84912345678', ?, ?, ?)`,
      now,
      now,
      now,
    );
    const instance = service();
    const challenge = await instance.requestLoginOtp({
      phone: '0912345678', ip: 'login-existing-request', browserBinding: BINDING,
    });

    await expect(instance.verifyLoginOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'login-existing-verify',
      browserBinding: BINDING,
    })).resolves.toEqual({ userId: 'existing', token: 'jwt-existing' });
  });

  it('does not allow a REGISTER challenge to be verified as LOGIN', async () => {
    const instance = service();
    const challenge = await instance.requestRegisterOtp({
      phone: '0912345678', ip: 'purpose-request', browserBinding: BINDING,
    });

    await expect(instance.verifyLoginOtp({
      challengeToken: challenge.challengeToken,
      code: '123456',
      ip: 'purpose-verify',
      browserBinding: BINDING,
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    expect(await db.get('SELECT status FROM phone_otp_challenges')).toEqual({ status: 'SENT' });
  });
});
