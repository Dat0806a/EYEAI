import { createHash, randomBytes } from 'crypto';
import { getDb, withTransaction } from '../../database';

export const OAUTH_AUTHORIZATION_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_AUTHORIZATION_STATE_MAX_LIVE = 1_000;
export const OAUTH_LOGIN_STATE_MAX_LIVE = 400;
export const OAUTH_LOGIN_STATE_MAX_LIVE_PER_PROVIDER = 200;
export const OAUTH_REGISTER_STATE_MAX_LIVE = 400;
export const OAUTH_REGISTER_STATE_MAX_LIVE_PER_PROVIDER = 200;
export const OAUTH_LINK_STATE_MAX_LIVE = 200;
export const OAUTH_LINK_STATE_MAX_LIVE_PER_PROVIDER = 100;
export const OAUTH_LINK_STATE_MAX_LIVE_PER_USER = 10;
export const OAUTH_LINK_STATE_MAX_LIVE_PER_USER_PROVIDER = 5;

export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';
export type OAuthPurpose = 'LOGIN' | 'REGISTER' | 'LINK';

export type OAuthAuthorizationStateInput =
  | { provider: OAuthProvider; purpose: 'LOGIN'; userId?: never }
  | { provider: OAuthProvider; purpose: 'REGISTER'; userId?: never }
  | { provider: OAuthProvider; purpose: 'LINK'; userId: string };

export type OAuthAuthorizationState =
  | { provider: OAuthProvider; purpose: 'LOGIN'; userId: null }
  | { provider: OAuthProvider; purpose: 'REGISTER'; userId: null }
  | { provider: OAuthProvider; purpose: 'LINK'; userId: string };

interface StoredAuthorizationState {
  provider: OAuthProvider;
  purpose: OAuthPurpose;
  user_id: string | null;
}

interface AuthorizationStateCounts {
  total_count: number;
  purpose_count: number;
  provider_count: number;
  user_count: number;
  user_provider_count: number;
}

export class InvalidOAuthStateError extends Error {
  readonly code = 'INVALID_OAUTH_STATE';

  constructor() {
    super('OAuth authorization state is invalid or expired.');
    this.name = 'InvalidOAuthStateError';
  }
}

export class OAuthAuthorizationStateLimitError extends Error {
  readonly code = 'OAUTH_RATE_LIMITED';
  readonly statusCode = 429;

  constructor() {
    super('Too many pending OAuth authorization attempts. Please try again shortly.');
    this.name = 'OAuthAuthorizationStateLimitError';
  }
}

export function generateOpaqueValue(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isOpaqueValue(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function issueOAuthAuthorizationState(
  input: OAuthAuthorizationStateInput,
  binding: string,
  now = Date.now(),
): Promise<string> {
  if (!isOpaqueValue(binding)) throw new InvalidOAuthStateError();
  if (input.purpose === 'LINK') {
    if (typeof input.userId !== 'string' || !input.userId.trim()) throw new InvalidOAuthStateError();
  } else if ('userId' in input && input.userId !== undefined) {
    throw new InvalidOAuthStateError();
  }
  const state = generateOpaqueValue();
  const db = await getDb();
  const admitted = await withTransaction(db, async () => {
    await db.run('DELETE FROM oauth_authorization_states WHERE expires_at <= ?', now);
    const row = await db.get<AuthorizationStateCounts>(
      `SELECT
         COUNT(*) AS total_count,
         SUM(CASE WHEN purpose = ? THEN 1 ELSE 0 END) AS purpose_count,
         SUM(CASE WHEN purpose = ? AND provider = ? THEN 1 ELSE 0 END) AS provider_count,
         SUM(CASE WHEN purpose = 'LINK' AND user_id = ? THEN 1 ELSE 0 END) AS user_count,
         SUM(CASE WHEN purpose = 'LINK' AND user_id = ? AND provider = ? THEN 1 ELSE 0 END)
           AS user_provider_count
       FROM oauth_authorization_states`,
      input.purpose,
      input.purpose,
      input.provider,
      input.purpose === 'LINK' ? input.userId : null,
      input.purpose === 'LINK' ? input.userId : null,
      input.provider,
    );
    const totalCount = row?.total_count ?? 0;
    const purposeCount = row?.purpose_count ?? 0;
    const providerCount = row?.provider_count ?? 0;
    const userCount = row?.user_count ?? 0;
    const userProviderCount = row?.user_provider_count ?? 0;
    const atPartitionLimit = input.purpose === 'LOGIN'
      ? purposeCount >= OAUTH_LOGIN_STATE_MAX_LIVE
        || providerCount >= OAUTH_LOGIN_STATE_MAX_LIVE_PER_PROVIDER
      : input.purpose === 'REGISTER'
        ? purposeCount >= OAUTH_REGISTER_STATE_MAX_LIVE
          || providerCount >= OAUTH_REGISTER_STATE_MAX_LIVE_PER_PROVIDER
      : purposeCount >= OAUTH_LINK_STATE_MAX_LIVE
        || providerCount >= OAUTH_LINK_STATE_MAX_LIVE_PER_PROVIDER
        || userCount >= OAUTH_LINK_STATE_MAX_LIVE_PER_USER
        || userProviderCount >= OAUTH_LINK_STATE_MAX_LIVE_PER_USER_PROVIDER;
    if (totalCount >= OAUTH_AUTHORIZATION_STATE_MAX_LIVE || atPartitionLimit) {
      return false;
    }
    await db.run(
      `INSERT INTO oauth_authorization_states
       (state_hash, binding_hash, provider, purpose, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      hashOpaqueValue(state),
      hashOpaqueValue(binding),
      input.provider,
      input.purpose,
      input.purpose === 'LINK' ? input.userId : null,
      now + OAUTH_AUTHORIZATION_STATE_TTL_MS,
      now,
    );
    return true;
  });
  if (!admitted) throw new OAuthAuthorizationStateLimitError();
  return state;
}

export async function consumeOAuthAuthorizationState(
  state: string,
  provider: OAuthProvider,
  binding: string,
  now = Date.now(),
): Promise<OAuthAuthorizationState> {
  if (!isOpaqueValue(state) || !isOpaqueValue(binding)) throw new InvalidOAuthStateError();
  const db = await getDb();
  const row = await db.get<StoredAuthorizationState>(
    `DELETE FROM oauth_authorization_states
     WHERE state_hash = ? AND binding_hash = ? AND provider = ? AND expires_at > ?
     RETURNING provider, purpose, user_id`,
    hashOpaqueValue(state),
    hashOpaqueValue(binding),
    provider,
    now,
  );
  if (!row) throw new InvalidOAuthStateError();
  if (row.purpose === 'LINK' && row.user_id) {
    return { provider: row.provider, purpose: 'LINK', userId: row.user_id };
  }
  if (row.purpose === 'LOGIN' && row.user_id === null) {
    return { provider: row.provider, purpose: 'LOGIN', userId: null };
  }
  if (row.purpose === 'REGISTER' && row.user_id === null) {
    return { provider: row.provider, purpose: 'REGISTER', userId: null };
  }
  throw new InvalidOAuthStateError();
}
