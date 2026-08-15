import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sqlite';
import { createDatabase, MIGRATIONS_DIR, openConfiguredDatabase } from '../src/database';
import {
  PersistentPhoneRateLimiter,
  PhoneRateLimitExceededError,
  type PhoneRateLimitBucketSpec,
} from '../src/services/phone/rateLimits';

const HMAC_KEY = 'test-only-rate-limit-key-with-sufficient-entropy';

describe('persistent phone auth rate limits', () => {
  let tempDir = '';
  let databasePath = '';
  let db: Database | null = null;
  let now = 120_000;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'yte-phone-rate-limit-'));
    databasePath = join(tempDir, 'test.db');
    db = await createDatabase(databasePath, join(tempDir, 'uploads'), MIGRATIONS_DIR);
    now = 120_000;
  });

  afterEach(async () => {
    if (db) await db.close();
    db = null;
    rmSync(tempDir, { recursive: true, force: true });
  });

  function limiter(database = db!, options: { maxRows?: number; cleanupBatchSize?: number } = {}) {
    return new PersistentPhoneRateLimiter({
      db: database,
      hmacKey: HMAC_KEY,
      now: () => now,
      ...options,
    });
  }

  function bucket(
    domain: string,
    identity: string,
    limit: number,
    windowMs: number,
  ): PhoneRateLimitBucketSpec {
    return { domain, identity, limit, windowMs };
  }

  it('enforces independent minute, hour, and day windows with privacy-safe keys', async () => {
    const service = limiter();
    const specs = [
      bucket('send:phone:minute', '+84912345678', 1, 60_000),
      bucket('send:phone:hour', '+84912345678', 5, 3_600_000),
      bucket('send:phone:day', '+84912345678', 10, 86_400_000),
    ];

    await service.consume(specs);
    await expect(service.consume(specs)).rejects.toMatchObject({
      statusCode: 429,
      code: 'PHONE_RATE_LIMITED',
      retryAfterMs: 60_000,
    });
    const rows = await db!.all<{ bucket_key: string; domain: string; request_count: number }[]>(
      'SELECT bucket_key, domain, request_count FROM phone_auth_rate_limits ORDER BY domain',
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.bucket_key))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('+84912345678');

    now += 60_000;
    await expect(service.consume(specs)).resolves.toBeUndefined();
  });

  it('uses domain separation for phone, IP, user, and provider-failure accounting', async () => {
    const service = limiter();
    await service.consume([
      bucket('send:phone', 'shared-value', 1, 60_000),
      bucket('send:ip', 'shared-value', 1, 60_000),
      bucket('send:user', 'shared-value', 1, 60_000),
    ]);

    const rows = await db!.all<{ bucket_key: string }[]>(
      'SELECT bucket_key FROM phone_auth_rate_limits',
    );
    expect(new Set(rows.map((row) => row.bucket_key)).size).toBe(3);

    // Sending consumes admission budgets before provider delivery, so a failed provider call is not refunded.
    await expect(service.consume([bucket('send:phone', 'shared-value', 1, 60_000)]))
      .rejects.toBeInstanceOf(PhoneRateLimitExceededError);
  });

  it('rolls back all bucket changes when any member of an atomic group is rejected', async () => {
    const service = limiter();
    await service.consume([bucket('verify:phone', '+84912345678', 1, 60_000)]);

    await expect(service.consume([
      bucket('verify:ip', '203.0.113.8', 10, 60_000),
      bucket('verify:phone', '+84912345678', 1, 60_000),
    ])).rejects.toBeInstanceOf(PhoneRateLimitExceededError);

    expect(await db!.get(
      "SELECT request_count FROM phone_auth_rate_limits WHERE domain = 'verify:ip'",
    )).toBeUndefined();
    expect(await db!.get(
      "SELECT request_count FROM phone_auth_rate_limits WHERE domain = 'verify:phone'",
    )).toEqual({ request_count: 1 });
  });

  it('cleans expired rows in bounded batches and reuses released capacity', async () => {
    const service = limiter(undefined, { maxRows: 2, cleanupBatchSize: 1 });
    await service.consume([bucket('send:phone', 'phone-a', 1, 1_000)]);
    await service.consume([bucket('send:phone', 'phone-b', 1, 1_000)]);
    now += 1_000;

    await service.consume([bucket('send:phone', 'phone-c', 1, 1_000)]);
    const rows = await db!.all<{ window_end: number }[]>(
      'SELECT window_end FROM phone_auth_rate_limits ORDER BY window_end',
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.window_end <= now)).toHaveLength(1);
  });

  it('fails closed at the hard active-row capacity without evicting live buckets', async () => {
    const service = limiter(undefined, { maxRows: 1 });
    await service.consume([bucket('send:phone', 'phone-a', 10, 60_000)]);

    await expect(service.consume([bucket('send:ip', '203.0.113.9', 10, 60_000)]))
      .rejects.toMatchObject({
        statusCode: 429,
        code: 'PHONE_RATE_LIMIT_CAPACITY',
        retryAfterMs: 60_000,
      });
    expect(await db!.all('SELECT domain FROM phone_auth_rate_limits')).toEqual([
      { domain: 'send:phone' },
    ]);
  });

  it('shares counters across limiter instances and separate database connections', async () => {
    const secondDb = await openConfiguredDatabase(databasePath);
    try {
      const first = limiter(db!);
      const second = limiter(secondDb);
      const spec = bucket('verify:ip', '198.51.100.4', 1, 60_000);

      await first.consume([spec]);
      await expect(second.consume([spec])).rejects.toBeInstanceOf(PhoneRateLimitExceededError);
    } finally {
      await secondDb.close();
    }
  });

  it('rejects invalid bucket definitions without creating rows', async () => {
    const service = limiter();
    await expect(service.consume([bucket('', 'identity', 1, 60_000)]))
      .rejects.toThrow('domain');
    await expect(service.consume([bucket('send:phone', '', 1, 60_000)]))
      .rejects.toThrow('identity');
    await expect(service.consume([bucket('send:phone', 'identity', 0, 60_000)]))
      .rejects.toThrow('limit');
    await expect(service.consume([bucket('send:phone', 'identity', 1, 0)]))
      .rejects.toThrow('windowMs');
    expect(await db!.all('SELECT * FROM phone_auth_rate_limits')).toEqual([]);
  });

  it('rejects a weak HMAC key before deriving privacy-sensitive bucket identities', () => {
    expect(() => new PersistentPhoneRateLimiter({
      db: db!,
      hmacKey: 'too-short',
    })).toThrow('at least 32 bytes');
  });

});
