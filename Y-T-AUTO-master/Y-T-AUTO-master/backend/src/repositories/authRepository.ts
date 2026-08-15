import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { getDb, withTransaction } from '../database';
import { config } from '../config';
import { uuid } from '../utils/age';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
}

export interface OAuthIdentityInput {
  provider: 'GOOGLE' | 'FACEBOOK';
  providerSub: string;
  email: string;
  emailVerified: boolean;
}

export interface OAuthIdentityLinkInput {
  provider: OAuthIdentityInput['provider'];
  providerSub: string;
}

type RepositoryError = Error & { code: string; statusCode: number };

function createRepositoryError(code: string, message: string, statusCode: number): RepositoryError {
  const error = new Error(message) as RepositoryError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

const OAUTH_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function normalizeProviderSub(providerSub: string): string {
  const normalized = typeof providerSub === 'string' ? providerSub.trim() : '';
  if (!normalized) {
    throw createRepositoryError(
      'INVALID_OAUTH_IDENTITY',
      'Định danh nhà cung cấp OAuth không hợp lệ.',
      400,
    );
  }
  return normalized;
}

function normalizeOAuthEmail(email: string): string {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const localPart = normalized.split('@')[0] ?? '';
  if (
    normalized.length > 254
    || localPart.length > 64
    || localPart.startsWith('.')
    || localPart.endsWith('.')
    || localPart.includes('..')
    || !OAUTH_EMAIL_PATTERN.test(normalized)
  ) {
    throw createRepositoryError(
      'INVALID_OAUTH_IDENTITY',
      'Email OAuth không hợp lệ.',
      400,
    );
  }
  return normalized;
}

function normalizeOAuthIdentityLookupInput(input: OAuthIdentityInput): OAuthIdentityInput {
  return {
    ...input,
    providerSub: normalizeProviderSub(input.providerSub),
  };
}

function normalizeOAuthIdentityLinkInput(input: OAuthIdentityLinkInput): OAuthIdentityLinkInput {
  return { ...input, providerSub: normalizeProviderSub(input.providerSub) };
}

function assertLegacyIdentityConsistency(
  provider: OAuthIdentityLinkInput['provider'],
  providerSub: string,
  legacy: { auth_provider: string; provider_sub: string | null },
): void {
  if (
    legacy.auth_provider === provider
    && legacy.provider_sub
    && legacy.provider_sub !== providerSub
  ) {
    throw createRepositoryError(
      'OAUTH_IDENTITY_CONFLICT',
      'Tài khoản đã liên kết với một định danh khác của nhà cung cấp này.',
      409,
    );
  }
}

export function signSessionForUser(userId: string): { userId: string; token: string } {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as SignOptions);
  return { userId, token };
}

export async function registerUser(email: string, password: string): Promise<{ userId: string; token: string }> {
  if (email.trim().toLowerCase().endsWith('@phone-auth.invalid')) {
    throw createRepositoryError('RESERVED_EMAIL_DOMAIN', 'Email không hợp lệ.', 400);
  }
  const db = await getDb();
  const existing = await db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', email.toLowerCase());
  if (existing) {
    const error = new Error('Email đã được sử dụng.');
    (error as Error & { statusCode?: number }).statusCode = 409;
    throw error;
  }
  const userId = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.run(
    'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
    userId,
    email.toLowerCase(),
    passwordHash,
  );
  return signSessionForUser(userId);
}

export async function loginUser(email: string, password: string): Promise<{ userId: string; token: string }> {
  const db = await getDb();
  const user = await db.get<UserRow & { email_is_placeholder: number }>('SELECT * FROM users WHERE email = ?', email.toLowerCase());
  if (!user || user.email_is_placeholder === 1 || user.email.endsWith('@phone-auth.invalid')) {
    const error = new Error('Email hoặc mật khẩu không đúng.');
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const error = new Error('Email hoặc mật khẩu không đúng.');
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return signSessionForUser(user.id);
}

async function insertOAuthIdentity(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  input: OAuthIdentityLinkInput,
): Promise<void> {
  await db.run(
    'INSERT INTO user_oauth_identities (id, user_id, provider, provider_sub) VALUES (?, ?, ?, ?)',
    uuid(),
    userId,
    input.provider,
    input.providerSub,
  );
}

async function updateLegacyOAuthIdentity(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  input: OAuthIdentityLinkInput,
): Promise<void> {
  await db.run(
    `UPDATE users
     SET auth_provider = ?, provider_sub = ?, updated_at = ?
     WHERE id = ? AND auth_provider = 'EMAIL' AND provider_sub IS NULL`,
    input.provider,
    input.providerSub,
    new Date().toISOString(),
    userId,
  );
}

async function findScopedOrLegacyOAuthOwner(
  db: Awaited<ReturnType<typeof getDb>>,
  input: OAuthIdentityInput,
): Promise<{ userId: string | null; legacyWasBackfilled: boolean }> {
  const byProvider = await db.get<{
    user_id: string;
    auth_provider: string;
    provider_sub: string | null;
  }>(
    `SELECT identity.user_id, users.auth_provider, users.provider_sub
     FROM user_oauth_identities AS identity
     JOIN users ON users.id = identity.user_id
     WHERE identity.provider = ? AND identity.provider_sub = ?`,
    input.provider,
    input.providerSub,
  );
  if (byProvider) {
    assertLegacyIdentityConsistency(input.provider, input.providerSub, byProvider);
    return { userId: byProvider.user_id, legacyWasBackfilled: false };
  }

  const legacyOwners = await db.all<{ id: string }[]>(
    'SELECT id FROM users WHERE auth_provider = ? AND provider_sub = ? ORDER BY id',
    input.provider,
    input.providerSub,
  );
  if (legacyOwners.length > 1) {
    throw createRepositoryError(
      'OAUTH_IDENTITY_CONFLICT',
      'Định danh nhà cung cấp thuộc nhiều tài khoản cũ; không thể tự động phân giải.',
      409,
    );
  }
  if (legacyOwners.length === 0) return { userId: null, legacyWasBackfilled: false };

  const legacyUserId = legacyOwners[0].id;
  const otherIdentity = await db.get<{ provider_sub: string }>(
    'SELECT provider_sub FROM user_oauth_identities WHERE user_id = ? AND provider = ?',
    legacyUserId,
    input.provider,
  );
  if (otherIdentity && otherIdentity.provider_sub !== input.providerSub) {
    throw createRepositoryError(
      'OAUTH_IDENTITY_CONFLICT',
      'Tài khoản đã liên kết với một định danh khác của nhà cung cấp này.',
      409,
    );
  }
  if (!otherIdentity) await insertOAuthIdentity(db, legacyUserId, input);
  return { userId: legacyUserId, legacyWasBackfilled: !otherIdentity };
}

function assertOAuthRegistrationPolicy(input: OAuthIdentityInput): OAuthIdentityInput {
  const normalizedInput = {
    ...input,
    email: normalizeOAuthEmail(input.email),
  };
  if (normalizedInput.provider === 'GOOGLE' && normalizedInput.emailVerified !== true) {
    throw createRepositoryError(
      'OAUTH_EMAIL_LINK_REQUIRED',
      'Google chưa xác minh email; không thể đăng ký tài khoản.',
      409,
    );
  }
  return normalizedInput;
}

export async function loginWithOAuthIdentity(input: OAuthIdentityInput): Promise<{ userId: string }> {
  const lookupInput = normalizeOAuthIdentityLookupInput(input);
  const db = await getDb();
  const resolution = await withTransaction(db, async () => {
    const owner = await findScopedOrLegacyOAuthOwner(db, lookupInput);
    if (owner.userId) return { userId: owner.userId, error: null };

    const normalizedInput = assertOAuthRegistrationPolicy(lookupInput);
    const byEmail = await db.get<{ id: string }>(
      'SELECT id FROM users WHERE email = ?',
      normalizedInput.email,
    );
    return byEmail
      ? { userId: null, error: createRepositoryError(
        'OAUTH_EMAIL_LINK_REQUIRED',
        'Email đã thuộc một tài khoản khác; hãy đăng nhập để liên kết nhà cung cấp.',
        409,
      ) }
      : { userId: null, error: createRepositoryError(
        'REGISTRATION_REQUIRED',
        'Bạn chưa có tài khoản. Hãy đăng ký.',
        409,
      ) };
  });
  if (resolution.error) throw resolution.error;
  return { userId: resolution.userId! };
}

export async function registerOAuthUser(input: OAuthIdentityInput): Promise<{ userId: string }> {
  const lookupInput = normalizeOAuthIdentityLookupInput(input);
  const db = await getDb();
  const result = await withTransaction(db, async () => {
    const owner = await findScopedOrLegacyOAuthOwner(db, lookupInput);
    if (owner.userId) {
      return { userId: null, error: createRepositoryError(
        'LOGIN_REQUIRED',
        'Tài khoản này đã được đăng ký. Vui lòng đăng nhập.',
        409,
      ) };
    }

    const normalizedInput = assertOAuthRegistrationPolicy(lookupInput);
    const byEmail = await db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', normalizedInput.email);
    if (byEmail) {
      return { userId: null, error: createRepositoryError(
        'LOGIN_REQUIRED',
        'Tài khoản này đã được đăng ký. Vui lòng đăng nhập.',
        409,
      ) };
    }

    const newUserId = uuid();
    const googleEmailIsTrusted = normalizedInput.provider === 'GOOGLE';
    await db.run(
      `INSERT INTO users
        (id, email, password_hash, auth_provider, provider_sub, email_verified, email_verification_source)
       VALUES (?, ?, 'OAUTH_ONLY_NO_PASSWORD', ?, ?, ?, ?)`,
      newUserId,
      normalizedInput.email,
      normalizedInput.provider,
      normalizedInput.providerSub,
      googleEmailIsTrusted ? 1 : 0,
      googleEmailIsTrusted ? 'GOOGLE' : null,
    );
    await insertOAuthIdentity(db, newUserId, normalizedInput);
    return { userId: newUserId, error: null };
  });
  if (result.error) throw result.error;
  return { userId: result.userId! };
}

/** @deprecated Public OAuth flows must call the explicit LOGIN or REGISTER method. */
export async function resolveOAuthUser(input: OAuthIdentityInput): Promise<{ userId: string }> {
  try {
    return await loginWithOAuthIdentity(input);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'REGISTRATION_REQUIRED') return registerOAuthUser(input);
    if (code !== 'OAUTH_EMAIL_LINK_REQUIRED' || input.provider !== 'GOOGLE' || !input.emailVerified) {
      throw error;
    }

    const email = normalizeOAuthEmail(input.email);
    const db = await getDb();
    const existing = await db.get<{ id: string; email_verified: number }>(
      'SELECT id, email_verified FROM users WHERE email = ?',
      email,
    );
    if (!existing || existing.email_verified !== 1) throw error;
    return linkOAuthIdentityToAuthenticatedUser(existing.id, {
      provider: input.provider,
      providerSub: normalizeProviderSub(input.providerSub),
    });
  }
}

export async function linkOAuthIdentityToAuthenticatedUser(
  targetUserId: string,
  input: OAuthIdentityLinkInput,
): Promise<{ userId: string }> {
  const normalizedInput = normalizeOAuthIdentityLinkInput(input);
  const db = await getDb();
  return withTransaction(db, async () => {
    const targetUser = await db.get<{
      id: string;
      auth_provider: string;
      provider_sub: string | null;
    }>('SELECT id, auth_provider, provider_sub FROM users WHERE id = ?', targetUserId);
    if (!targetUser) {
      throw createRepositoryError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
    }

    const identityOwner = await db.get<{ user_id: string }>(
      'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
      normalizedInput.provider,
      normalizedInput.providerSub,
    );
    if (identityOwner) {
      if (identityOwner.user_id === targetUserId) {
        assertLegacyIdentityConsistency(normalizedInput.provider, normalizedInput.providerSub, targetUser);
        return { userId: targetUserId };
      }
      throw createRepositoryError(
        'OAUTH_IDENTITY_CONFLICT',
        'Định danh nhà cung cấp đã thuộc một tài khoản khác.',
        409,
      );
    }

    const legacyIdentityOwner = await db.get<{ id: string }>(
      'SELECT id FROM users WHERE auth_provider = ? AND provider_sub = ?',
      normalizedInput.provider,
      normalizedInput.providerSub,
    );
    if (legacyIdentityOwner && legacyIdentityOwner.id !== targetUserId) {
      throw createRepositoryError(
        'OAUTH_IDENTITY_CONFLICT',
        'Định danh nhà cung cấp đã thuộc một tài khoản khác.',
        409,
      );
    }

    const providerIdentity = await db.get<{ provider_sub: string }>(
      'SELECT provider_sub FROM user_oauth_identities WHERE user_id = ? AND provider = ?',
      targetUserId,
      normalizedInput.provider,
    );
    if (providerIdentity) {
      throw createRepositoryError(
        'OAUTH_IDENTITY_CONFLICT',
        'Tài khoản đã liên kết với một định danh khác của nhà cung cấp này.',
        409,
      );
    }

    assertLegacyIdentityConsistency(normalizedInput.provider, normalizedInput.providerSub, targetUser);

    await insertOAuthIdentity(db, targetUserId, normalizedInput);
    await updateLegacyOAuthIdentity(db, targetUserId, normalizedInput);
    return { userId: targetUserId };
  });
}

export async function createSessionForUser(userId: string): Promise<{ userId: string; token: string }> {
  const db = await getDb();
  const user = await db.get<{ id: string }>('SELECT id FROM users WHERE id = ?', userId);
  if (!user) {
    throw createRepositoryError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
  }
  return signSessionForUser(userId);
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const db = await getDb();
  const row = await db.get<ProfileRow>('SELECT * FROM profiles WHERE user_id = ?', userId);
  return row ?? null;
}

export async function upsertProfile(
  userId: string,
  fullName: string,
  dateOfBirth: string,
  gender: 'MALE' | 'FEMALE' | 'OTHER',
): Promise<ProfileRow> {
  const db = await getDb();
  const existing = await db.get<{ id: string }>('SELECT id FROM profiles WHERE user_id = ?', userId);
  const now = new Date().toISOString();
  if (existing) {
    await db.run(
      'UPDATE profiles SET full_name = ?, date_of_birth = ?, gender = ?, updated_at = ? WHERE id = ?',
      fullName,
      dateOfBirth,
      gender,
      now,
      existing.id,
    );
  } else {
    await db.run(
      'INSERT INTO profiles (id, user_id, full_name, date_of_birth, gender) VALUES (?, ?, ?, ?, ?)',
      uuid(),
      userId,
      fullName,
      dateOfBirth,
      gender,
    );
  }
  const profile = await getProfile(userId);
  if (!profile) {
    throw new Error('Không thể lưu hồ sơ.');
  }
  return profile;
}
