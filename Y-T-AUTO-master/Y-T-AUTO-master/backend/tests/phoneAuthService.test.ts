import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sqlite';
import { createDatabase, MIGRATIONS_DIR, openConfiguredDatabase } from '../src/database';
import { PersistentPhoneRateLimiter } from '../src/services/phone/rateLimits';
import { PhoneAuthService } from '../src/services/phone/phoneAuthService';
import { resolvePhoneBinding } from '../src/services/phone/phoneBinding';
import type { SmsProvider } from '../src/services/sms/types';

const SECRET = 'phone-auth-test-secret-with-at-least-thirty-two-bytes';
const BINDING_TOKEN = 'B'.repeat(43);

describe('phone authentication challenge service', () => {
  let tempDir: string;
  let databasePath: string;
  let db: Database;
  let now: number;
  let sent: Array<{ toE164: string; code: string }>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-phone-service-'));
    databasePath = join(tempDir, 'phone.db');
    db = await createDatabase(databasePath, join(tempDir, 'uploads'), MIGRATIONS_DIR);
    now = 1_800_000_000_000;
    sent = [];
  });

  afterEach(async () => {
    await db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createService(options: {
    database?: Database;
    provider?: SmsProvider;
    sessionSigner?: (userId: string) => Promise<{ userId: string; token: string }>;
    maxAttempts?: number;
  } = {}) {
    const database = options.database ?? db;
    return new PhoneAuthService({
      db: database,
      provider: options.provider ?? {
        async sendOtp(input) {
          sent.push({ toE164: input.toE164, code: input.code });
        },
      },
      otpHmacSecret: SECRET,
      rateLimiter: new PersistentPhoneRateLimiter({ db: database, hmacKey: SECRET, now: () => now }),
      now: () => now,
      generateChallengeToken: () => `challenge-${sent.length + 1}`,
      generateBindingToken: () => BINDING_TOKEN,
      generateOtp: () => '123456',
      generateId: () => `id-${Math.random()}`,
      sessionSigner: options.sessionSigner ?? (async (userId) => ({ userId, token: `jwt-${userId}` })),
      maxAttempts: options.maxAttempts,
    });
  }

  it('accepts only high-entropy canonical browser binding tokens', () => {
    expect(resolvePhoneBinding('B'.repeat(43), () => 'C'.repeat(43))).toMatchObject({
      token: BINDING_TOKEN,
      wasCreated: false,
    });
    expect(resolvePhoneBinding('attacker-fixed-binding', () => 'C'.repeat(43))).toMatchObject({
      token: 'C'.repeat(43),
      wasCreated: true,
    });
  });

  it('creates an account-independent browser-bound challenge without persisting raw secrets', async () => {
    const trace: string[] = [];
    await db.on('trace', (sql: string) => trace.push(sql));
    const response = await createService().requestLoginOtp({
      phone: '0912 345 678', ip: '203.0.113.1', browserBinding: null,
    });

    expect(response).toMatchObject({
      challengeToken: 'challenge-1', browserBinding: BINDING_TOKEN, bindingWasCreated: true,
      expiresAt: now + 300_000, resendAvailableAt: now + 60_000,
    });
    expect(sent).toEqual([{ toE164: '+84912345678', code: '123456' }]);
    const row = await db.get<any>('SELECT * FROM phone_otp_challenges');
    expect(row.status).toBe('SENT');
    expect(row.code_mac).toMatch(/^[a-f0-9]{64}$/);
    expect(row).not.toHaveProperty('code');
    expect(JSON.stringify(row)).not.toContain('challenge-1');
    expect(JSON.stringify(row)).not.toContain(BINDING_TOKEN);
    expect(trace.join('\n')).not.toMatch(/FROM users|user_phone_identities/);
  });

  it('consumes send phone/IP/user budgets atomically and enforces cooldown', async () => {
    const service = createService();
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('link-user', 'link@example.com', 'hash')");
    await service.requestLinkOtp({
      phone: '0912345678', ip: '203.0.113.2', browserBinding: BINDING_TOKEN, userId: 'link-user',
    });
    const domains = await db.all<{ domain: string }[]>('SELECT domain FROM phone_auth_rate_limits ORDER BY domain');
    expect(domains.map((row) => row.domain)).toEqual(expect.arrayContaining([
      'send:phone:minute', 'send:phone:hour', 'send:phone:day', 'send:ip:minute',
      'send:ip:hour', 'send:user:minute', 'send:user:hour',
    ]));

    await expect(service.requestLinkOtp({
      phone: '0912345678', ip: '203.0.113.3', browserBinding: BINDING_TOKEN, userId: 'link-user',
    })).rejects.toMatchObject({ code: 'OTP_RESEND_COOLDOWN', statusCode: 429 });
  });

  it('marks provider failures safely, clears the MAC, and keeps admission budgets consumed', async () => {
    const service = createService({ provider: { async sendOtp() { throw new Error('secret provider body 123456'); } } });
    await expect(service.requestLoginOtp({
      phone: '0912345678', ip: '203.0.113.4', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_DELIVERY_UNAVAILABLE', statusCode: 502 });
    expect(await db.get('SELECT status, code_mac FROM phone_otp_challenges')).toEqual({
      status: 'SEND_FAILED', code_mac: null,
    });
    expect(await db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM phone_auth_rate_limits WHERE domain LIKE 'send:%'",
    )).toEqual({ count: 5 });
  });

  it('preserves a safe provider-not-configured error after finalizing the failed challenge', async () => {
    const service = createService({
      provider: {
        async sendOtp() {
          throw Object.assign(new Error('configuration detail'), {
            code: 'OTP_NOT_CONFIGURED',
            statusCode: 503,
          });
        },
      },
    });
    await expect(service.requestLoginOtp({
      phone: '0912345678', ip: '203.0.113.44', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_NOT_CONFIGURED', statusCode: 503 });
    expect(await db.get('SELECT status, code_mac FROM phone_otp_challenges')).toEqual({
      status: 'SEND_FAILED', code_mac: null,
    });
  });

  it('invalidates older active challenges only after the replacement is delivered', async () => {
    const service = createService();
    const first = await service.requestLoginOtp({ phone: '0912345678', ip: 'ip-a', browserBinding: BINDING_TOKEN });
    now += 60_000;
    const second = await service.requestLoginOtp({ phone: '0912345678', ip: 'ip-b', browserBinding: BINDING_TOKEN });
    expect(second.challengeToken).not.toBe(first.challengeToken);
    const rows = await db.all<{ status: string; code_mac: string | null }[]>(
      'SELECT status, code_mac FROM phone_otp_challenges ORDER BY created_at',
    );
    expect(rows).toEqual([{ status: 'LOCKED', code_mac: null }, { status: 'SENT', code_mac: expect.any(String) }]);
  });

  it('cleans expired secrets and removes terminal challenge history in bounded batches', async () => {
    const service = createService();
    const expired = await service.requestLoginOtp({
      phone: '0912345678', ip: 'ip-clean-a', browserBinding: BINDING_TOKEN,
    });
    now += 300_001;
    await service.requestLoginOtp({
      phone: '0933333333', ip: 'ip-clean-b', browserBinding: BINDING_TOKEN,
    });
    const expiredRow = await db.get<{ status: string; code_mac: string | null }>(
      'SELECT status, code_mac FROM phone_otp_challenges WHERE phone_e164 = ?',
      '+84912345678',
    );
    expect(expiredRow).toEqual(expect.objectContaining({ status: 'LOCKED', code_mac: null }));

    await db.run(
      `INSERT INTO phone_otp_challenges
       (challenge_hash, binding_hash, phone_e164, purpose, target_user_id, code_mac,
        status, attempts, max_attempts, expires_at, resend_available_at, created_at,
        sent_at, consumed_at, updated_at)
       VALUES (?, ?, ?, 'LOGIN', NULL, NULL, 'CONSUMED', 0, 5, ?, ?, ?, ?, ?, ?)`,
      'f'.repeat(64), 'e'.repeat(64), '+84966666666', now - 100_000,
      now - 200_000, now - 300_000, now - 290_000, now - 280_000, now - 280_000,
    );
    now += 24 * 60 * 60 * 1000 + 1;
    await service.requestLoginOtp({
      phone: '0977777777', ip: 'ip-clean-c', browserBinding: BINDING_TOKEN,
    });
    expect(await db.get('SELECT challenge_hash FROM phone_otp_challenges WHERE challenge_hash = ?', 'f'.repeat(64)))
      .toBeUndefined();
    expect(expired.challengeToken).toBeDefined();
  });

  it('verifies once, rejects wrong/expired/replayed codes, and locks at the attempt ceiling', async () => {
    const service = createService();
    const challenge = await service.requestLoginOtp({ phone: '0912345678', ip: 'ip-v', browserBinding: BINDING_TOKEN });
    await expect(service.verifyLoginOtp({
      challengeToken: challenge.challengeToken, code: '000000', ip: 'ip-v', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_INVALID', statusCode: 400 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(service.verifyLoginOtp({
        challengeToken: challenge.challengeToken, code: '000000', ip: 'ip-v', browserBinding: BINDING_TOKEN,
      })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    }
    await expect(service.verifyLoginOtp({
      challengeToken: challenge.challengeToken, code: '000000', ip: 'ip-v', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_ATTEMPTS_EXCEEDED', statusCode: 429 });
    await expect(service.verifyLoginOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-v', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });

    now += 60_000;
    const expired = await service.requestLoginOtp({ phone: '0933333333', ip: 'ip-exp', browserBinding: BINDING_TOKEN });
    now += 300_001;
    await expect(service.verifyLoginOtp({
      challengeToken: expired.challengeToken, code: '123456', ip: 'ip-exp', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_EXPIRED' });

    now += 60_000;
    const valid = await service.requestRegisterOtp({ phone: '0966666666', ip: 'ip-valid', browserBinding: BINDING_TOKEN });
    await expect(service.verifyRegisterOtp({
      challengeToken: valid.challengeToken, code: '123456', ip: 'ip-valid', browserBinding: BINDING_TOKEN,
    })).resolves.toMatchObject({ token: expect.any(String), userId: expect.any(String) });
    await expect(service.verifyRegisterOtp({
      challengeToken: valid.challengeToken, code: '123456', ip: 'ip-valid', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });

  it('enforces binding, purpose, target-user and verify phone/IP budgets', async () => {
    await db.run("INSERT INTO users (id, email, password_hash) VALUES ('user-a', 'a@example.com', 'hash')");
    const service = createService();
    const challenge = await service.requestLinkOtp({
      phone: '0912345678', ip: 'ip-bind', browserBinding: BINDING_TOKEN, userId: 'user-a',
    });
    await expect(service.verifyLoginOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-bind', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(service.verifyLinkOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-bind', browserBinding: 'wrong', userId: 'user-a',
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    expect(await db.get<{ total: number }>(
      "SELECT SUM(request_count) AS total FROM phone_auth_rate_limits WHERE domain = 'verify:ip:minute'",
    )).toEqual({ total: 2 });
    await expect(service.verifyLinkOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-bind', browserBinding: BINDING_TOKEN, userId: 'user-b',
    })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await service.verifyLinkOtp({
      challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-bind', browserBinding: BINDING_TOKEN, userId: 'user-a',
    });
    const domains = await db.all<{ domain: string }[]>("SELECT domain FROM phone_auth_rate_limits WHERE domain LIKE 'verify:%'");
    expect(domains.map((row) => row.domain)).toEqual(expect.arrayContaining(['verify:phone:minute', 'verify:ip:minute']));
  });

  it('rate-limits send requests by IP and verify attempts by phone', async () => {
    const service = createService({ maxAttempts: 50 });
    for (const phone of ['0912345678', '0933333333', '0966666666', '0977777777', '0988888888']) {
      await service.requestLoginOtp({ phone, ip: 'shared-send-ip', browserBinding: BINDING_TOKEN });
    }
    await expect(service.requestLoginOtp({
      phone: '0909999999', ip: 'shared-send-ip', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'PHONE_RATE_LIMITED', statusCode: 429 });

    const challenge = await service.requestLoginOtp({
      phone: '0901234567', ip: 'separate-ip', browserBinding: BINDING_TOKEN,
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(service.verifyLoginOtp({
        challengeToken: challenge.challengeToken, code: '000000', ip: `verify-ip-${attempt}`, browserBinding: BINDING_TOKEN,
      })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    }
    await expect(service.verifyLoginOtp({
      challengeToken: challenge.challengeToken, code: '000000', ip: 'verify-ip-last', browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'PHONE_RATE_LIMITED', statusCode: 429 });
  });

  it('enforces the twenty-per-minute verify IP ceiling across unknown challenges', async () => {
    const service = createService();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(service.verifyLoginOtp({
        challengeToken: `${String(attempt).padStart(2, '0')}${'C'.repeat(41)}`,
        code: '000000',
        ip: 'shared-verify-ip',
        browserBinding: BINDING_TOKEN,
      })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    }
    await expect(service.verifyLoginOtp({
      challengeToken: 'Z'.repeat(43),
      code: '000000',
      ip: 'shared-verify-ip',
      browserBinding: BINDING_TOKEN,
    })).rejects.toMatchObject({ code: 'PHONE_RATE_LIMITED', statusCode: 429 });
  });

  it('allows only one concurrent verification across separate SQLite connections', async () => {
    const firstService = createService();
    const challenge = await firstService.requestRegisterOtp({ phone: '0912345678', ip: 'ip-race', browserBinding: BINDING_TOKEN });
    const secondDb = await openConfiguredDatabase(databasePath);
    try {
      const secondService = createService({ database: secondDb });
      const results = await Promise.allSettled([
        firstService.verifyRegisterOtp({ challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-race-a', browserBinding: BINDING_TOKEN }),
        secondService.verifyRegisterOtp({ challengeToken: challenge.challengeToken, code: '123456', ip: 'ip-race-b', browserBinding: BINDING_TOKEN }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    } finally {
      await secondDb.close();
    }
  });
});
