import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildFacebookAuthorizationUrl,
  exchangeFacebookCodeForToken,
  getFacebookUserInfo,
  isFacebookOAuthConfigured,
} from '../src/services/oauth/facebookOAuth';

const configured = {
  appId: 'app-id',
  appSecret: 'app-secret',
  redirectUri: 'http://localhost:5000/api/auth/facebook/callback',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Facebook OAuth helpers', () => {
  it('detects missing and complete configuration', () => {
    expect(isFacebookOAuthConfigured({ appId: '', appSecret: '', redirectUri: '' })).toBe(false);
    expect(isFacebookOAuthConfigured(configured)).toBe(true);
  });

  it('builds an authorization URL with state and email scope', () => {
    const url = buildFacebookAuthorizationUrl('state-1', configured);
    expect(url).toContain('client_id=app-id');
    expect(url).toContain('state=state-1');
    expect(url).toContain('scope=email');
  });

  it('posts the app secret in the token request body instead of the URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fb-token' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeFacebookCodeForToken('code-1', configured);

    expect(result.accessToken).toBe('fb-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe('https://graph.facebook.com/v19.0/oauth/access_token');
    expect(requestUrl).not.toContain(configured.appSecret);
    expect(requestInit).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const body = new URLSearchParams(String(requestInit.body));
    expect(body.get('client_secret')).toBe(configured.appSecret);
  });

  it('loads user info and confirms email permission with bearer tokens', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'fb-id', email: 'fb@example.com', name: 'FB User' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ permission: 'email', status: 'granted' }] }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const info = await getFacebookUserInfo('fb-token');

    expect(info).toEqual({ id: 'fb-id', email: 'fb@example.com', name: 'FB User' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe('https://graph.facebook.com/v19.0/me?fields=id%2Cname%2Cemail');
    expect(requestUrl).not.toContain('fb-token');
    expect(requestInit).toEqual({ headers: { Authorization: 'Bearer fb-token' } });
    const [permissionUrl, permissionInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(permissionUrl).toBe('https://graph.facebook.com/v19.0/me/permissions');
    expect(permissionUrl).not.toContain('fb-token');
    expect(permissionInit).toEqual({ headers: { Authorization: 'Bearer fb-token' } });
  });

  it('reports when the user declined the email permission', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'fb-id', email: 'fb@example.com', name: 'FB User' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ permission: 'email', status: 'declined' }] }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(getFacebookUserInfo('fb-token')).rejects.toThrow(
      'Facebook chưa cấp quyền email cho ứng dụng',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [permissionUrl, permissionInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(permissionUrl).toBe('https://graph.facebook.com/v19.0/me/permissions');
    expect(permissionUrl).not.toContain('fb-token');
    expect(permissionInit).toEqual({ headers: { Authorization: 'Bearer fb-token' } });
  });

  it('reports when email permission is granted but the account returns no email', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'fb-id', name: 'FB User' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ permission: 'email', status: 'granted' }] }),
      }) as unknown as typeof fetch;

    await expect(getFacebookUserInfo('fb-token')).rejects.toThrow(
      'Facebook đã cấp quyền email nhưng tài khoản không trả về email hợp lệ',
    );
  });
});

describe('Facebook OAuth repository', () => {
  async function withOAuthTestDatabase(
    test: (
      db: Awaited<ReturnType<typeof import('../src/database').createDatabase>>,
      repository: typeof import('../src/repositories/authRepository'),
    ) => Promise<void>,
  ): Promise<void> {
    const tempDir = mkdtempSync(join(tmpdir(), 'yte-facebook-oauth-'));
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

  it.each([false, true])(
    'rejects a Facebook email collision without mutation when emailVerified is %s',
    async (emailVerified) => {
      await withOAuthTestDatabase(async (db, repository) => {
        await db.run(
          `INSERT INTO users
            (id, email, password_hash, email_verified, email_verification_source)
           VALUES (?, ?, ?, ?, ?)`,
          'existing-email-user',
          'shared@example.com',
          'hash',
          1,
          'INTERNAL',
        );

        await expect(repository.resolveOAuthUser({
          provider: 'FACEBOOK',
          providerSub: `facebook-collision-${emailVerified}`,
          email: 'shared@example.com',
          emailVerified,
        })).rejects.toMatchObject({
          code: 'OAUTH_EMAIL_LINK_REQUIRED',
          statusCode: 409,
        });

        expect(await db.get(
          'SELECT auth_provider, provider_sub FROM users WHERE id = ?',
          'existing-email-user',
        )).toEqual({ auth_provider: 'EMAIL', provider_sub: null });
        expect(await db.get(
          'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
          'FACEBOOK',
          `facebook-collision-${emailVerified}`,
        )).toBeUndefined();
        expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
      });
    },
  );

  it('creates a provider-owned Facebook user without trusting email or fabricating a profile', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const result = await repository.resolveOAuthUser({
        provider: 'FACEBOOK',
        providerSub: 'new-facebook-sub',
        email: 'Facebook@Example.com',
        emailVerified: true,
      });

      expect(result).toEqual({ userId: result.userId });
      expect('token' in result).toBe(false);
      expect(await db.get(
        `SELECT email, auth_provider, provider_sub, email_verified, email_verification_source
         FROM users WHERE id = ?`,
        result.userId,
      )).toEqual({
        email: 'facebook@example.com',
        auth_provider: 'FACEBOOK',
        provider_sub: 'new-facebook-sub',
        email_verified: 0,
        email_verification_source: null,
      });
      expect(await db.get('SELECT user_id FROM profiles WHERE user_id = ?', result.userId)).toBeUndefined();
      expect(await db.get(
        'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
        'FACEBOOK',
        'new-facebook-sub',
      )).toEqual({ user_id: result.userId });
    });
  });

  it('canonicalizes surrounding provider subject whitespace', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const first = await repository.resolveOAuthUser({
        provider: 'FACEBOOK',
        providerSub: '  canonical-facebook-sub  ',
        email: 'canonical-facebook@example.com',
        emailVerified: false,
      });
      const repeat = await repository.resolveOAuthUser({
        provider: 'FACEBOOK',
        providerSub: 'canonical-facebook-sub',
        email: 'canonical-facebook@example.com',
        emailVerified: false,
      });

      expect(repeat).toEqual(first);
      expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')).toEqual({ count: 1 });
      expect(await db.get(
        'SELECT provider_sub FROM user_oauth_identities WHERE user_id = ?',
        first.userId,
      )).toEqual({ provider_sub: 'canonical-facebook-sub' });
    });
  });

  it('uses the Facebook provider identity before a changed email', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      const first = await repository.resolveOAuthUser({
        provider: 'FACEBOOK',
        providerSub: 'stable-facebook-sub',
        email: 'original-facebook@example.com',
        emailVerified: false,
      });

      const repeat = await repository.resolveOAuthUser({
        provider: 'FACEBOOK',
        providerSub: 'stable-facebook-sub',
        email: 'existing@example.com',
        emailVerified: true,
      });

      expect(repeat).toEqual(first);
      expect(await db.get('SELECT email FROM users WHERE id = ?', first.userId)).toEqual({
        email: 'original-facebook@example.com',
      });
    });
  });

  it('links an identity only to the authenticated target and is idempotent', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        'authenticated-user',
        'local@example.com',
        'hash',
      );

      const first = await repository.linkOAuthIdentityToAuthenticatedUser('authenticated-user', {
        provider: 'FACEBOOK',
        providerSub: 'linked-facebook-sub',
      });
      const repeat = await repository.linkOAuthIdentityToAuthenticatedUser('authenticated-user', {
        provider: 'FACEBOOK',
        providerSub: 'linked-facebook-sub',
      });

      expect(first).toEqual({ userId: 'authenticated-user' });
      expect(repeat).toEqual(first);
      expect(await db.get('SELECT email FROM users WHERE id = ?', 'authenticated-user')).toEqual({
        email: 'local@example.com',
      });
      expect(await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM user_oauth_identities WHERE user_id = ?',
        'authenticated-user',
      )).toEqual({ count: 1 });
      expect(await db.get('SELECT user_id FROM profiles WHERE user_id = ?', 'authenticated-user')).toBeUndefined();
    });
  });

  it('rejects a whitespace-only provider subject before explicit linking', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        'invalid-link-target',
        'invalid-link-target@example.com',
        'hash',
      );

      await expect(repository.linkOAuthIdentityToAuthenticatedUser('invalid-link-target', {
        provider: 'FACEBOOK',
        providerSub: '\t  ',
      })).rejects.toMatchObject({
        code: 'INVALID_OAUTH_IDENTITY',
        statusCode: 400,
      });

      expect(await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM user_oauth_identities',
      )).toEqual({ count: 0 });
    });
  });

  it('rejects idempotent linking when same-provider legacy and scoped identities conflict', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
         VALUES (?, ?, ?, ?, ?)`,
        'inconsistent-facebook-user',
        'inconsistent-facebook@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'FACEBOOK',
        'legacy-facebook-sub',
      );
      await db.run(
        `INSERT INTO user_oauth_identities (id, user_id, provider, provider_sub)
         VALUES (?, ?, ?, ?)`,
        'inconsistent-facebook-identity',
        'inconsistent-facebook-user',
        'FACEBOOK',
        'scoped-facebook-sub',
      );

      await expect(repository.linkOAuthIdentityToAuthenticatedUser('inconsistent-facebook-user', {
        provider: 'FACEBOOK',
        providerSub: 'scoped-facebook-sub',
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });
    });
  });

  it('allows idempotent linking when the legacy value belongs to a different provider', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
         VALUES (?, ?, ?, ?, ?)`,
        'mixed-link-user',
        'mixed-link@example.com',
        'OAUTH_ONLY_NO_PASSWORD',
        'GOOGLE',
        'legacy-google-sub',
      );
      await db.run(
        `INSERT INTO user_oauth_identities (id, user_id, provider, provider_sub)
         VALUES (?, ?, ?, ?)`,
        'mixed-link-facebook-identity',
        'mixed-link-user',
        'FACEBOOK',
        'scoped-facebook-sub',
      );

      await expect(repository.linkOAuthIdentityToAuthenticatedUser('mixed-link-user', {
        provider: 'FACEBOOK',
        providerSub: 'scoped-facebook-sub',
      })).resolves.toEqual({ userId: 'mixed-link-user' });
    });
  });

  it('rejects identities owned by another user and a second identity for the same provider', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?), (?, ?, ?)',
        'first-user',
        'first@example.com',
        'hash',
        'second-user',
        'second@example.com',
        'hash',
      );
      await repository.linkOAuthIdentityToAuthenticatedUser('first-user', {
        provider: 'FACEBOOK',
        providerSub: 'owned-facebook-sub',
      });

      await expect(repository.linkOAuthIdentityToAuthenticatedUser('second-user', {
        provider: 'FACEBOOK',
        providerSub: 'owned-facebook-sub',
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });
      await expect(repository.linkOAuthIdentityToAuthenticatedUser('first-user', {
        provider: 'FACEBOOK',
        providerSub: 'different-facebook-sub',
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });

      expect(await db.all(
        'SELECT user_id, provider_sub FROM user_oauth_identities ORDER BY user_id',
      )).toEqual([{ user_id: 'first-user', provider_sub: 'owned-facebook-sub' }]);
    });
  });

  it('honors legacy provider ownership during explicit linking', async () => {
    await withOAuthTestDatabase(async (db, repository) => {
      await db.run(
        `INSERT INTO users (id, email, password_hash, auth_provider, provider_sub)
         VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
        'legacy-owner',
        'legacy-owner@example.com',
        'hash',
        'FACEBOOK',
        'legacy-owned-sub',
        'link-target',
        'link-target@example.com',
        'hash',
        'FACEBOOK',
        'target-existing-sub',
      );

      await expect(repository.linkOAuthIdentityToAuthenticatedUser('link-target', {
        provider: 'FACEBOOK',
        providerSub: 'legacy-owned-sub',
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });
      await expect(repository.linkOAuthIdentityToAuthenticatedUser('link-target', {
        provider: 'FACEBOOK',
        providerSub: 'second-target-sub',
      })).rejects.toMatchObject({
        code: 'OAUTH_IDENTITY_CONFLICT',
        statusCode: 409,
      });

      expect(await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_oauth_identities')).toEqual({
        count: 0,
      });
    });
  });
});
