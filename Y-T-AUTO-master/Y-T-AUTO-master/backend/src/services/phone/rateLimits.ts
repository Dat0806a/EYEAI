import { createHmac, type BinaryLike } from 'crypto';
import type { Database } from 'sqlite';
import { withTransaction } from '../../database';

const RATE_LIMIT_KEY_CONTEXT = 'auto-yte:phone-auth:rate-limit:v1';
const DEFAULT_MAX_ROWS = 50_000;
const DEFAULT_CLEANUP_BATCH_SIZE = 250;

export interface PhoneRateLimitBucketSpec {
  domain: string;
  identity: string;
  limit: number;
  windowMs: number;
}

export interface PhoneRateLimitClock {
  now(): number;
}

export interface PersistentPhoneRateLimiterOptions {
  db: Database;
  hmacKey: BinaryLike;
  clock?: PhoneRateLimitClock;
  now?: () => number;
  maxRows?: number;
  cleanupBatchSize?: number;
}

export type PhoneRateLimitErrorCode = 'PHONE_RATE_LIMITED' | 'PHONE_RATE_LIMIT_CAPACITY';

export class PhoneRateLimitExceededError extends Error {
  readonly statusCode = 429;

  constructor(
    readonly retryAfterMs: number,
    readonly code: PhoneRateLimitErrorCode = 'PHONE_RATE_LIMITED',
  ) {
    super(code === 'PHONE_RATE_LIMIT_CAPACITY'
      ? 'Phone authentication is temporarily unavailable.'
      : 'Too many phone authentication attempts.');
    this.name = 'PhoneRateLimitExceededError';
  }
}

interface RateLimitRow {
  window_start: number;
  window_end: number;
  request_count: number;
}

interface PreparedBucket extends PhoneRateLimitBucketSpec {
  bucketKey: string;
  windowStart: number;
  windowEnd: number;
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

function requireStrongHmacKey(value: BinaryLike): void {
  const byteLength = typeof value === 'string'
    ? Buffer.byteLength(value, 'utf8')
    : value.byteLength;
  if (byteLength < 32) {
    throw new Error('Rate-limit HMAC key must be at least 32 bytes.');
  }
}

function validateSpec(spec: PhoneRateLimitBucketSpec): void {
  if (!spec.domain.trim()) throw new Error('Rate-limit domain must not be empty.');
  if (spec.domain.length > 100) throw new Error('Rate-limit domain is too long.');
  if (!spec.identity) throw new Error('Rate-limit identity must not be empty.');
  requirePositiveInteger('Rate-limit limit', spec.limit);
  requirePositiveInteger('Rate-limit windowMs', spec.windowMs);
}

export class PersistentPhoneRateLimiter {
  private readonly db: Database;
  private readonly hmacKey: BinaryLike;
  private readonly now: () => number;
  private readonly maxRows: number;
  private readonly cleanupBatchSize: number;

  constructor(options: PersistentPhoneRateLimiterOptions) {
    requireStrongHmacKey(options.hmacKey);
    this.db = options.db;
    this.hmacKey = options.hmacKey;
    this.now = options.now ?? (() => options.clock?.now() ?? Date.now());
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
    this.cleanupBatchSize = options.cleanupBatchSize ?? DEFAULT_CLEANUP_BATCH_SIZE;
    requirePositiveInteger('Rate-limit maxRows', this.maxRows);
    requirePositiveInteger('Rate-limit cleanupBatchSize', this.cleanupBatchSize);
  }

  async consume(specs: readonly PhoneRateLimitBucketSpec[]): Promise<void> {
    await withTransaction(this.db, () => this.consumeWithinTransaction(specs));
  }

  async consumeWithinTransaction(specs: readonly PhoneRateLimitBucketSpec[]): Promise<void> {
    if (specs.length === 0) return;
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error('Rate-limit clock must return a non-negative safe integer.');
    }
    const prepared = specs.map((spec) => this.prepareBucket(spec, now));
    if (new Set(prepared.map((bucket) => bucket.bucketKey)).size !== prepared.length) {
      throw new Error('Duplicate rate-limit bucket specification.');
    }

    await this.cleanupExpired(now);
    const existing = new Map<string, RateLimitRow | undefined>();
    for (const bucket of prepared) {
      existing.set(bucket.bucketKey, await this.db.get<RateLimitRow>(
        `SELECT window_start, window_end, request_count
         FROM phone_auth_rate_limits
         WHERE bucket_key = ?`,
        bucket.bucketKey,
      ));
    }

    for (const bucket of prepared) {
      const row = existing.get(bucket.bucketKey);
      if (row && row.window_start === bucket.windowStart && row.window_end === bucket.windowEnd &&
          row.request_count >= bucket.limit) {
        throw new PhoneRateLimitExceededError(Math.max(1, row.window_end - now));
      }
    }

    const missingRows = prepared.filter((bucket) => !existing.get(bucket.bucketKey)).length;
    if (missingRows > 0) {
      const count = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM phone_auth_rate_limits',
      );
      if (!count || count.count + missingRows > this.maxRows) {
        const earliest = await this.db.get<{ window_end: number }>(
          'SELECT MIN(window_end) AS window_end FROM phone_auth_rate_limits WHERE window_end > ?',
          now,
        );
        const retryAfterMs = earliest?.window_end
          ? Math.max(1, earliest.window_end - now)
          : 1_000;
        throw new PhoneRateLimitExceededError(retryAfterMs, 'PHONE_RATE_LIMIT_CAPACITY');
      }
    }

    for (const bucket of prepared) {
      const row = existing.get(bucket.bucketKey);
      if (!row) {
        await this.db.run(
          `INSERT INTO phone_auth_rate_limits
           (bucket_key, domain, window_start, window_end, request_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          bucket.bucketKey, bucket.domain, bucket.windowStart, bucket.windowEnd, now, now,
        );
      } else if (row.window_start !== bucket.windowStart || row.window_end !== bucket.windowEnd) {
        await this.db.run(
          `UPDATE phone_auth_rate_limits
           SET domain = ?, window_start = ?, window_end = ?, request_count = 1,
               created_at = ?, updated_at = ?
           WHERE bucket_key = ?`,
          bucket.domain, bucket.windowStart, bucket.windowEnd, now, now, bucket.bucketKey,
        );
      } else {
        await this.db.run(
          `UPDATE phone_auth_rate_limits SET request_count = request_count + 1, updated_at = ?
           WHERE bucket_key = ?`,
          now, bucket.bucketKey,
        );
      }
    }
  }

  private prepareBucket(spec: PhoneRateLimitBucketSpec, now: number): PreparedBucket {
    validateSpec(spec);
    const windowStart = Math.floor(now / spec.windowMs) * spec.windowMs;
    const bucketKey = createHmac('sha256', this.hmacKey)
      .update(RATE_LIMIT_KEY_CONTEXT)
      .update('\0')
      .update(spec.domain)
      .update('\0')
      .update(String(spec.windowMs))
      .update('\0')
      .update(spec.identity)
      .digest('hex');
    return {
      ...spec,
      bucketKey,
      windowStart,
      windowEnd: windowStart + spec.windowMs,
    };
  }

  private async cleanupExpired(now: number): Promise<void> {
    await this.db.run(
      `DELETE FROM phone_auth_rate_limits
       WHERE bucket_key IN (
         SELECT bucket_key
         FROM phone_auth_rate_limits
         WHERE window_end <= ?
         ORDER BY window_end, bucket_key
         LIMIT ?
       )`,
      now,
      this.cleanupBatchSize,
    );
  }
}
