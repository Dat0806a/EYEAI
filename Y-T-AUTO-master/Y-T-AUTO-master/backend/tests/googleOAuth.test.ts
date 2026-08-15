import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { OAuthIdentityInput } from '../src/repositories/authRepository';
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleCodeForToken,
  getGoogleUserInfo,
  isGoogleOAuthConfigured,
} from '../src/services/oauth/googleOAuth';

const configured = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:5000/api/auth/google/callback',
};

const originalFetch = globalThis.fetch;

if (false) {
  // @ts-expect-error emailVerified is required by the OAuth repository API.
  const missingEmailVerification: OAuthIdentityInput = {
    provider: 'GOOGLE',
    providerSub: 'compile-time-subject',
    email: 'compile-time@example.com',
  };
  void missingEmailVerification;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Google OAuth helpers', () => {
  it('detects missing and complete Google OAuth configuration', () => {
    expect(isGoogleOAuthConfigured({ clientId: '', clientSecret: '', redirectUri: '' })).toBe(false);
    expect(isGoogleOAuthConfigured(configured)).toBe(true);
  });

  it('builds an authorization URL with required parameters', () => {
    const url = buildGoogleAuthorizationUrl('state-1', configured);
    expect(url).toContain('client_id=client-id');
    expect(url).toContain('redirect_uri=' + encodeURIComponent(configured.redirectUri));
    expect(url).toContain('state=state-1');
    expect(url).toContain('scope=openid+email+profile');
  });

  it('exchanges an authorization code for an access token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-token' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeGoogleCodeForToken('code-1', configured);
    expect(result.accessToken).toBe('access-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a Vietnamese error when Google rejects the code', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    await expect(exchangeGoogleCodeForToken('bad-code', configured)).rejects.toThrow(
      'Google không chấp nhận mã xác thực',
    );
  });

  it('loads verified Google user info with explicit trust metadata', async () => {
    globalThis.fetch =
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: 'sub-1', email: 'user@example.com', email_verified: true, name: 'User',
        }),
      }) as unknown as typeof fetch;
    const info = await getGoogleUserInfo('access-token');
    expect(info).toEqual({
      sub: 'sub-1', email: 'user@example.com', email_verified: true, name: 'User',
    });
  });

  it.each([false, undefined])(
    'exposes Google email verification as false when userinfo returns %s',
    async (emailVerified) => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: 'sub-1', email: 'user@example.com', email_verified: emailVerified, name: 'User',
        }),
      }) as unknown as typeof fetch;

      await expect(getGoogleUserInfo('access-token')).resolves.toMatchObject({
        email_verified: false,
      });
    },
  );

  it('rejects Google user info without a valid email', async () => {
    globalThis.fetch =
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'sub-1', email: null }),
      }) as unknown as typeof fetch;
    await expect(getGoogleUserInfo('access-token')).rejects.toThrow(
      'Tài khoản Google không có email hợp lệ',
    );
  });
});

describe('Google OAuth repository', () => {
  async function withOAuthTestDatabase(
    test: (
      db: Awaited<ReturnType<typeof import('../src/database').createDatabase>>,
      repository: typeof import('../src/repositories/authRepository'),
    ) => Promise<void>,
  ): Promise<void> {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-oauth-'));
    const databasePath = join(tempDir, 'oauth.db');
    const uploads = join(tempDir, 'uploads');
    mkdirSync(uploads);
    const originalDb = process.env.DATABASE_PATH;
    const originalUploads = process.env.UPLOAD_DIR;
    const originalSecret = process.env.JWT_SECRET;
    process.env.DATABASE_PATH = databasePath;
    process.env.UPLOAD_DIR = uploads;
    process.env.JWT_SECRET = 'test-secret';
    jest.resetModules();

    let db: Awaited<ReturnType<typeof import('../src/database').createDatabase>> | null = null;
    try {
      const databaseModule = await import('../src/database');
      const repositoryModule = await import('../src/repositories/authRepository');
      db = await databaseModule.createDatabase(databasePath, uploads);
      await test(db, repositoryModule);
    } finally {
      if (db) await db.close();
      const databaseModule = await import('../src/database');
      await databaseModule.closeDb();
      if (originalDb === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = originalDb;
      if (originalUploads === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = originalUploads;
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  it.each([false, undefined])(
    'rejects a new Google identity when email verification is %s without mutation',
    async (emailVerified) => {
      await withOAuthTestDatabase(async (db, repository) => {
        await expect(repository.resolveOAuthUser({
          provider: 'GOOGLE',
          providerSub: 'unverified-google-sub',
          email: 'unverified@example.com',
          emailVerified,
        } as OAuthIdentityInput)).rejects.toMatchObject({
          code: 'OAUTH_EMAIL_LINK_REQUIRED',
          statusCode: 409,
        });

        expect(await db.get('SELECT id FROM users WHERE email = ?', 'unverified@example.com')).toBeUndefined();
        expect(await db.get(
          'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
          'GOOGLE',
          'unverified-google-sub',
        )).toBeUndefined();
      });
    },
  );

  it.each(['   ', 'not-an-email', 'person@example', 'person@@example.com'])(
    'rejects malformed OAuth email %j with a safe typed error and no mutation',
    async (email) => {
      await withOAuthTestDatabase(async (db, repository) => {
        await expect(repository.resolveOAuthUser({
          provider: 'GOOGLE',
          providerSub: 'invalid-email-google-sub',
          email,
          emailVerified: true,
        })).rejects.toMatchObject({
          code: 'INVALID_OAUTH_IDENTITY',
          statusCode: 400,
        });

        expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 0 });
        expect(await db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM user_oauth_identities',
        )).toEqual({ count: 0 });
      });
    },
  );

  it('rejects a whitespace-only provider subject before resolving a user', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: '   ',
        email: 'valid@example.com',
        emailVerified: true,
      })).rejects.toMatchObject({
        code: 'INVALID_OAUTH_IDENTITY',
        statusCode: 400,
      });

      expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 0 });
      expect(await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM user_oauth_identities',
      )).toEqual({ count: 0 });
    });
  });

  it('creates a verified Google user without issuing a session or profile', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const result = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'google-sub-1',
        email: 'Verified@Example.com',
        emailVerified: true,
      });

      expect(result.userId).toBeTruthy();
      expect(result).toEqual({ userId: result.userId });
      expect('token' in result).toBe(false);
      expect(await db.get(
        `SELECT email, auth_provider, provider_sub, email_verified, email_verification_source
         FROM users WHERE id = ?`,
        result.userId,
      )).toEqual({
        email: 'verified@example.com',
        auth_provider: 'GOOGLE',
        provider_sub: 'google-sub-1',
        email_verified: 1,
        email_verification_source: 'GOOGLE',
      });
      expect(await db.get('SELECT user_id FROM profiles WHERE user_id = ?', result.userId)).toBeUndefined();
      expect(await db.get(
        'SELECT user_id, provider, provider_sub FROM user_oauth_identities WHERE user_id = ?',
        result.userId,
      )).toEqual({
        user_id: result.userId,
        provider: 'GOOGLE',
        provider_sub: 'google-sub-1',
      });
    });
  });

  it('auto-links verified Google only to an already verified local email', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users
          (id, email, password_hash, email_verified, email_verification_source)
         VALUES (?, ?, ?, ?, ?)`,
        'verified-email-user',
        'verified@example.com',
        'hash',
        1,
        'INTERNAL',
      );

      const result = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'google-link-sub',
        email: 'VERIFIED@example.com',
        emailVerified: true,
      });

      expect(result).toEqual({ userId: 'verified-email-user' });
      expect(await db.get(
        'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
        'GOOGLE',
        'google-link-sub',
      )).toEqual({ user_id: 'verified-email-user' });
      expect(await db.get(
        'SELECT auth_provider, provider_sub, email_verified, email_verification_source FROM users WHERE id = ?',
        'verified-email-user',
      )).toEqual({
        auth_provider: 'GOOGLE',
        provider_sub: 'google-link-sub',
        email_verified: 1,
        email_verification_source: 'INTERNAL',
      });
    });
  });

  it('canonicalizes whitespace-padded case-varied email before collision lookup', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users
          (id, email, password_hash, email_verified, email_verification_source)
         VALUES (?, ?, ?, ?, ?)`,
        'canonical-email-user',
        'canonical@example.com',
        'hash',
        1,
        'INTERNAL',
      );

      const result = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'canonical-google-sub',
        email: '  CANONICAL@EXAMPLE.COM\t',
        emailVerified: true,
      });

      expect(result).toEqual({ userId: 'canonical-email-user' });
      expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
      expect(await db.get(
        'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
        'GOOGLE',
        'canonical-google-sub',
      )).toEqual({ user_id: 'canonical-email-user' });
    });
  });

  it('rejects verified Google email collision with an unverified local account without mutation', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        'unverified-email-user',
        'collision@example.com',
        'hash',
      );

      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'google-collision-sub',
        email: 'collision@example.com',
        emailVerified: true,
      })).rejects.toMatchObject({
        code: 'OAUTH_EMAIL_LINK_REQUIRED',
        statusCode: 409,
      });

      expect(await db.get(
        'SELECT auth_provider, provider_sub, email_verified FROM users WHERE id = ?',
        'unverified-email-user',
      )).toEqual({ auth_provider: 'EMAIL', provider_sub: null, email_verified: 0 });
      expect(await db.get(
        'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
        'GOOGLE',
        'google-collision-sub',
      )).toBeUndefined();
    });
  });

  it('uses provider identity before email and verification checks on repeat login', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const first = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'stable-google-sub',
        email: 'first@example.com',
        emailVerified: true,
      });

      const repeat = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'stable-google-sub',
        email: '',
        emailVerified: false,
      });

      expect(repeat).toEqual(first);
      expect(await db.get('SELECT email FROM users WHERE id = ?', first.userId)).toEqual({
        email: 'first@example.com',
      });
      expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
    });
  });

  it('rejects a scoped identity whose same-provider legacy value conflicts', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users
          (id, email, password_hash, auth_provider, provider_sub, email_verified, email_verification_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        'inconsistent-google-user',
        'inconsistent-google@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'GOOGLE',
        'legacy-google-sub',
        1,
        'GOOGLE',
      );
      await db.run(
        `INSERT INTO user_oauth_identities (id, user_id, provider, provider_sub)
         VALUES (?, ?, ?, ?)`,
        'inconsistent-google-identity',
        'inconsistent-google-user',
        'GOOGLE',
        'scoped-google-sub',
      );

      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'scoped-google-sub',
        email: 'changed@example.com',
        emailVerified: false,
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });

      expect(await db.all(
        'SELECT provider_sub FROM user_oauth_identities WHERE user_id = ?',
        'inconsistent-google-user',
      )).toEqual([{ provider_sub: 'scoped-google-sub' }]);
    });
  });

  it('allows a scoped identity when the legacy value belongs to a different provider', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
         VALUES (?, ?, ?, ?, ?)`,
        'mixed-provider-user',
        'mixed-provider@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'FACEBOOK',
        'legacy-facebook-sub',
      );
      await db.run(
        `INSERT INTO user_oauth_identities (id, user_id, provider, provider_sub)
         VALUES (?, ?, ?, ?)`,
        'mixed-provider-google-identity',
        'mixed-provider-user',
        'GOOGLE',
        'scoped-google-sub',
      );

      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'scoped-google-sub',
        email: 'changed@example.com',
        emailVerified: false,
      })).resolves.toEqual({ userId: 'mixed-provider-user' });
    });
  });

  it('rejects a second Google identity for the same verified email user with a typed conflict', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const first = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'first-google-sub',
        email: 'one-google@example.com',
        emailVerified: true,
      });

      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'second-google-sub',
        email: 'one-google@example.com',
        emailVerified: true,
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });

      expect(await db.all(
        'SELECT provider_sub FROM user_oauth_identities WHERE user_id = ?',
        first.userId,
      )).toEqual([{ provider_sub: 'first-google-sub' }]);
    });
  });

  it('rejects a different Google identity for a verified legacy-only user without mutation', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users
          (id, email, password_hash, auth_provider, provider_sub, email_verified, email_verification_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        'verified-legacy-google-user',
        'verified-legacy@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'GOOGLE',
        'legacy-google-sub-a',
        1,
        'GOOGLE',
      );

      await expect(repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'legacy-google-sub-b',
        email: 'verified-legacy@example.com',
        emailVerified: true,
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });

      expect(await db.get(
        'SELECT auth_provider, provider_sub FROM users WHERE id = ?',
        'verified-legacy-google-user',
      )).toEqual({ auth_provider: 'GOOGLE', provider_sub: 'legacy-google-sub-a' });
      expect(await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM user_oauth_identities WHERE user_id = ?',
        'verified-legacy-google-user',
      )).toEqual({ count: 0 });
    });
  });

  it('backfills a provider-scoped identity for a legacy OAuth user', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
         VALUES (?, ?, ?, ?, ?)`,
        'legacy-google-user',
        'legacy@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'GOOGLE',
        'legacy-google-sub',
      );

      const result = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'legacy-google-sub',
        email: 'not-an-email',
        emailVerified: false,
      });

      expect(result).toEqual({ userId: 'legacy-google-user' });
      expect(await db.get(
        'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
        'GOOGLE',
        'legacy-google-sub',
      )).toEqual({ user_id: 'legacy-google-user' });
    });
  });

  it('issues a session separately and rejects a missing user', async () => {
    await withOAuthTestDatabase(async (_db, repository) => {
      const resolved = await repository.resolveOAuthUser({
        provider: 'GOOGLE',
        providerSub: 'session-google-sub',
        email: 'session@example.com',
        emailVerified: true,
      });

      const session = await repository.createSessionForUser(resolved.userId);

      expect(session.userId).toBe(resolved.userId);
      expect(session.token).toBeTruthy();
      expect('token' in resolved).toBe(false);
      await expect(repository.createSessionForUser('missing-user')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
