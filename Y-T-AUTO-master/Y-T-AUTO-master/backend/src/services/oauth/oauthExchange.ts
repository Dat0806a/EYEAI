import { getDb, withTransaction } from '../../database';
import { generateOpaqueValue, hashOpaqueValue, isOpaqueValue } from './oauthState';
import type { OAuthPurpose } from './oauthState';

export const OAUTH_CALLBACK_CODE_TTL_MS = 60 * 1000;
export const OAUTH_CALLBACK_SESSION_MAX_LIVE = 1_000;
export const OAUTH_CALLBACK_ERROR_MAX_LIVE = 250;

export const OAUTH_CALLBACK_ERROR_CODES = [
  'INVALID_OAUTH_STATE',
  'OAUTH_PROVIDER_FAILED',
  'OAUTH_EMAIL_LINK_REQUIRED',
  'OAUTH_IDENTITY_CONFLICT',
  'LOGIN_REQUIRED',
  'REGISTRATION_REQUIRED',
] as const;

export type OAuthCallbackErrorCode = typeof OAUTH_CALLBACK_ERROR_CODES[number];

const oauthCallbackErrorCodeSet: ReadonlySet<string> = new Set(OAUTH_CALLBACK_ERROR_CODES);

export type OAuthCallbackResult =
  | { kind: 'SESSION'; purpose: OAuthPurpose; userId: string }
  | { kind: 'ERROR'; purpose: OAuthPurpose; errorCode: OAuthCallbackErrorCode };

interface StoredCallbackResult {
  result_kind: 'SESSION' | 'ERROR';
  user_id: string | null;
  error_code: string | null;
  purpose: OAuthPurpose;
}

export class InvalidOAuthCodeError extends Error {
  readonly code = 'INVALID_OAUTH_CODE';

  constructor() {
    super('OAuth callback code is invalid or expired.');
    this.name = 'InvalidOAuthCodeError';
  }
}

export class InvalidOAuthCallbackErrorCodeError extends Error {
  readonly code = 'INVALID_OAUTH_ERROR_CODE';

  constructor() {
    super('OAuth callback error code is invalid.');
    this.name = 'InvalidOAuthCallbackErrorCodeError';
  }
}

export function isOAuthCallbackErrorCode(value: unknown): value is OAuthCallbackErrorCode {
  return typeof value === 'string' && oauthCallbackErrorCodeSet.has(value);
}

export async function issueOAuthCallbackCode(
  result: OAuthCallbackResult,
  binding: string,
  now = Date.now(),
): Promise<string> {
  if (result.purpose !== 'LOGIN' && result.purpose !== 'REGISTER' && result.purpose !== 'LINK') {
    throw new InvalidOAuthCodeError();
  }
  if (result.kind === 'ERROR' && !isOAuthCallbackErrorCode(result.errorCode)) {
    throw new InvalidOAuthCallbackErrorCodeError();
  }
  if (!isOpaqueValue(binding)) throw new InvalidOAuthCodeError();
  const code = generateOpaqueValue();
  const db = await getDb();
  await withTransaction(db, async () => {
    await db.run('DELETE FROM oauth_callback_codes WHERE expires_at <= ?', now);
    const cap = result.kind === 'SESSION'
      ? OAUTH_CALLBACK_SESSION_MAX_LIVE
      : OAUTH_CALLBACK_ERROR_MAX_LIVE;
    const row = await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM oauth_callback_codes WHERE result_kind = ?',
      result.kind,
    );
    const evictionCount = Math.max(0, (row?.count ?? 0) - cap + 1);
    if (evictionCount > 0) {
      await db.run(
        `DELETE FROM oauth_callback_codes
         WHERE result_kind = ? AND code_hash IN (
           SELECT code_hash FROM oauth_callback_codes
           WHERE result_kind = ?
           ORDER BY created_at ASC, code_hash ASC
           LIMIT ?
         )`,
        result.kind,
        result.kind,
        evictionCount,
      );
    }
    await db.run(
      `INSERT INTO oauth_callback_codes
       (code_hash, binding_hash, purpose, result_kind, user_id, error_code, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      hashOpaqueValue(code),
      hashOpaqueValue(binding),
      result.purpose,
      result.kind,
      result.kind === 'SESSION' ? result.userId : null,
      result.kind === 'ERROR' ? result.errorCode : null,
      now + OAUTH_CALLBACK_CODE_TTL_MS,
      now,
    );
  });
  return code;
}

export async function consumeOAuthCallbackCode(
  code: string,
  binding: string,
  expectedPurpose: OAuthPurpose,
  now = Date.now(),
): Promise<OAuthCallbackResult> {
  if (
    !isOpaqueValue(code)
    || !isOpaqueValue(binding)
    || (expectedPurpose !== 'LOGIN' && expectedPurpose !== 'REGISTER' && expectedPurpose !== 'LINK')
  ) throw new InvalidOAuthCodeError();
  const db = await getDb();
  const row = await db.get<StoredCallbackResult>(
    `DELETE FROM oauth_callback_codes
     WHERE code_hash = ? AND binding_hash = ? AND expires_at > ?
     RETURNING purpose, result_kind, user_id, error_code`,
    hashOpaqueValue(code),
    hashOpaqueValue(binding),
    now,
  );
  if (!row) throw new InvalidOAuthCodeError();
  if (row.purpose !== expectedPurpose) throw new InvalidOAuthCodeError();
  if (row.result_kind === 'SESSION' && row.user_id) {
    return { kind: 'SESSION', purpose: row.purpose, userId: row.user_id };
  }
  if (row.result_kind === 'ERROR' && isOAuthCallbackErrorCode(row.error_code)) {
    return { kind: 'ERROR', purpose: row.purpose, errorCode: row.error_code };
  }
  throw new InvalidOAuthCodeError();
}
