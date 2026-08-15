import { Request, Response } from 'express';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthedRequest, requireAuth } from '../src/middleware/auth';

const repository = {
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  getProfile: jest.fn(),
  upsertProfile: jest.fn(),
  resolveOAuthUser: jest.fn(),
  loginWithOAuthIdentity: jest.fn(),
  registerOAuthUser: jest.fn(),
  linkOAuthIdentityToAuthenticatedUser: jest.fn(),
  createSessionForUser: jest.fn(),
};

const google = {
  isGoogleOAuthConfigured: jest.fn(),
  buildGoogleAuthorizationUrl: jest.fn(),
  exchangeGoogleCodeForToken: jest.fn(),
  getGoogleUserInfo: jest.fn(),
};

const facebook = {
  isFacebookOAuthConfigured: jest.fn(),
  buildFacebookAuthorizationUrl: jest.fn(),
  exchangeFacebookCodeForToken: jest.fn(),
  getFacebookUserInfo: jest.fn(),
};

const oauthState = {
  OAUTH_AUTHORIZATION_STATE_TTL_MS: 10 * 60 * 1000,
  issueOAuthAuthorizationState: jest.fn(),
  consumeOAuthAuthorizationState: jest.fn(),
  generateOpaqueValue: jest.fn(() => 'B'.repeat(43)),
  isOpaqueValue: (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
};

const oauthExchange = {
  issueOAuthCallbackCode: jest.fn(),
  consumeOAuthCallbackCode: jest.fn(),
};

jest.mock('../src/repositories/authRepository', () => repository);
jest.mock('../src/services/oauth/googleOAuth', () => google);
jest.mock('../src/services/oauth/facebookOAuth', () => facebook);
jest.mock('../src/services/oauth/oauthState', () => oauthState);
jest.mock('../src/services/oauth/oauthExchange', () => ({
  ...oauthExchange,
  OAUTH_CALLBACK_CODE_TTL_MS: 60 * 1000,
  OAUTH_CALLBACK_ERROR_CODES: [
    'INVALID_OAUTH_STATE',
    'OAUTH_PROVIDER_FAILED',
    'OAUTH_EMAIL_LINK_REQUIRED',
    'OAUTH_IDENTITY_CONFLICT',
    'LOGIN_REQUIRED',
    'REGISTRATION_REQUIRED',
  ],
  isOAuthCallbackErrorCode: (value: unknown) => [
    'INVALID_OAUTH_STATE',
    'OAUTH_PROVIDER_FAILED',
    'OAUTH_EMAIL_LINK_REQUIRED',
    'OAUTH_IDENTITY_CONFLICT',
    'LOGIN_REQUIRED',
    'REGISTRATION_REQUIRED',
  ].includes(String(value)),
}));
jest.mock('../src/services/oauth/providerStatus', () => ({ getAuthProviderStatus: jest.fn(() => []) }));
jest.mock('../src/services/otp/otp', () => ({ isOtpConfigured: jest.fn(() => false) }));
jest.mock('../src/config', () => ({
  config: {
    webOrigin: 'https://app.example.test/base/path?discard=1#discard',
  },
}));

import {
  exchangeOAuthCallbackCode,
  facebookCallback,
  facebookLink,
  facebookLogin,
  googleCallback,
  googleLink,
  googleLogin,
} from '../src/controllers/authController';
import { oauthExchangeSchema } from '../src/schemas';
import { authRouter } from '../src/routes/authRoutes';
import {
  oauthCallbackRateLimit,
  oauthLinkRateLimit,
  oauthLoginRateLimit,
} from '../src/middleware/oauthRateLimit';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  redirect: jest.Mock;
  set: jest.Mock;
  cookie: jest.Mock;
};

function createResponse(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  return res;
}

const BINDING_A = 'A'.repeat(43);

function requestWithBinding<T extends Request>(request: Partial<T>): T {
  return {
    ...request,
    headers: { cookie: `yte_oauth_binding=${BINDING_A}` },
  } as T;
}

function expectSafeCallbackRedirect(res: MockResponse, expectedCode: string, intent: string): void {
  expect(res.redirect).toHaveBeenCalledTimes(1);
  const redirect = new URL(String(res.redirect.mock.calls[0][0]));
  expect(redirect.origin).toBe('https://app.example.test');
  expect(redirect.pathname).toBe('/oauth/callback');
  expect([...redirect.searchParams.keys()]).toEqual(['code', 'intent']);
  expect(redirect.searchParams.get('code')).toBe(expectedCode);
  expect(redirect.searchParams.get('intent')).toBe(intent);
  expect(redirect.hash).toBe('');
  expect(redirect.href).not.toMatch(/token|jwt|access_token|refresh_token|userId|email/i);
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.set).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
}

beforeEach(() => {
  google.isGoogleOAuthConfigured.mockReturnValue(true);
  facebook.isFacebookOAuthConfigured.mockReturnValue(true);
  google.buildGoogleAuthorizationUrl.mockImplementation((state) => `https://google.test/auth?state=${state}`);
  facebook.buildFacebookAuthorizationUrl.mockImplementation((state) => `https://facebook.test/auth?state=${state}`);
  oauthState.issueOAuthAuthorizationState.mockResolvedValue('state-value');
  oauthExchange.issueOAuthCallbackCode.mockResolvedValue('C'.repeat(43));
});

describe('OAuth authorization starts', () => {
  it.each([
    ['GOOGLE', googleLogin, google.buildGoogleAuthorizationUrl],
    ['FACEBOOK', facebookLogin, facebook.buildFacebookAuthorizationUrl],
  ] as const)('issues opaque LOGIN state before starting %s OAuth', async (provider, handler, buildUrl) => {
    const res = createResponse();

    await handler({ query: { intent: 'LOGIN' } } as unknown as Request, res);

    expect(oauthState.issueOAuthAuthorizationState).toHaveBeenCalledWith(
      { provider, purpose: 'LOGIN' },
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    const binding = oauthState.issueOAuthAuthorizationState.mock.calls.at(-1)?.[1];
    expect(res.cookie).toHaveBeenCalledWith('yte_oauth_binding', binding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/api/auth',
      maxAge: 10 * 60 * 1000 + 60 * 1000,
    });
    expect(res.cookie.mock.calls.at(-1)?.[2]).not.toHaveProperty('domain');
    expect(buildUrl).toHaveBeenCalledWith('state-value');
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('state=state-value'));
  });

  it.each([
    ['GOOGLE', googleLink],
    ['FACEBOOK', facebookLink],
  ] as const)('ties %s link state to the authenticated user', async (provider, handler) => {
    const req = requestWithBinding<AuthedRequest>({ userId: 'authenticated-user' });
    const res = createResponse();

    await handler(req, res);

    expect(oauthState.issueOAuthAuthorizationState).toHaveBeenCalledWith({
      provider,
      purpose: 'LINK',
      userId: 'authenticated-user',
    }, BINDING_A);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { provider, authorizationUrl: expect.stringContaining('state=state-value') },
      error: null,
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([
    ['GOOGLE', googleLink],
    ['FACEBOOK', facebookLink],
  ] as const)('returns a safe 429 when %s link-state admission is saturated', async (_provider, handler) => {
    oauthState.issueOAuthAuthorizationState.mockRejectedValue(
      Object.assign(new Error('Too many pending OAuth authorization attempts. Please try again shortly.'), {
        code: 'OAUTH_RATE_LIMITED',
        statusCode: 429,
      }),
    );
    const req = requestWithBinding<AuthedRequest>({ userId: 'authenticated-user' });
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: 'Too many pending OAuth authorization attempts. Please try again shortly.',
      },
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/token|code=[A-Za-z0-9_-]+/i);
  });
});

describe('OAuth provider callbacks', () => {
  it('resolves a verified Google login and redirects with only an opaque code', async () => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'GOOGLE', purpose: 'LOGIN', userId: null,
    });
    google.exchangeGoogleCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    google.getGoogleUserInfo.mockResolvedValue({
      sub: 'google-sub', email: 'person@example.test', email_verified: true, name: 'Person',
    });
    repository.loginWithOAuthIdentity.mockResolvedValue({ userId: 'google-user' });

    const res = createResponse();
    await googleCallback(requestWithBinding({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(oauthState.consumeOAuthAuthorizationState).toHaveBeenCalledWith(
      'opaque-state', 'GOOGLE', BINDING_A,
    );
    expect(repository.loginWithOAuthIdentity).toHaveBeenCalledWith({
      provider: 'GOOGLE',
      providerSub: 'google-sub',
      email: 'person@example.test',
      emailVerified: true,
    });
    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith(
      { kind: 'SESSION', purpose: 'LOGIN', userId: 'google-user' }, BINDING_A,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'yte_oauth_binding', BINDING_A, expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(repository.createSessionForUser).not.toHaveBeenCalled();
    expectSafeCallbackRedirect(res, 'C'.repeat(43), 'LOGIN');
  });

  it('resolves a Facebook login without trusting provider email', async () => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'FACEBOOK', purpose: 'LOGIN', userId: null,
    });
    facebook.exchangeFacebookCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    facebook.getFacebookUserInfo.mockResolvedValue({
      id: 'facebook-sub', email: 'person@example.test', name: 'Person',
    });
    repository.loginWithOAuthIdentity.mockResolvedValue({ userId: 'facebook-user' });

    const res = createResponse();
    await facebookCallback(requestWithBinding({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(repository.loginWithOAuthIdentity).toHaveBeenCalledWith({
      provider: 'FACEBOOK',
      providerSub: 'facebook-sub',
      email: 'person@example.test',
      emailVerified: false,
    });
    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith(
      { kind: 'SESSION', purpose: 'LOGIN', userId: 'facebook-user' }, BINDING_A,
    );
    expectSafeCallbackRedirect(res, 'C'.repeat(43), 'LOGIN');
  });

  it('links the provider identity to the user bound into state', async () => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'FACEBOOK', purpose: 'LINK', userId: 'link-target',
    });
    facebook.exchangeFacebookCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    facebook.getFacebookUserInfo.mockResolvedValue({
      id: 'facebook-sub', email: 'ignored@example.test', name: 'Ignored',
    });
    repository.linkOAuthIdentityToAuthenticatedUser.mockResolvedValue({ userId: 'link-target' });

    const res = createResponse();
    await facebookCallback(requestWithBinding({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(repository.linkOAuthIdentityToAuthenticatedUser).toHaveBeenCalledWith('link-target', {
      provider: 'FACEBOOK', providerSub: 'facebook-sub',
    });
    expect(repository.resolveOAuthUser).not.toHaveBeenCalled();
    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith(
      { kind: 'SESSION', purpose: 'LINK', userId: 'link-target' }, BINDING_A,
    );
    expectSafeCallbackRedirect(res, 'C'.repeat(43), 'LINK');
  });

  it.each([
    [Object.assign(new Error('raw repository detail'), { code: 'OAUTH_EMAIL_LINK_REQUIRED' }), 'OAUTH_EMAIL_LINK_REQUIRED'],
    [new Error('raw provider detail person@example.test access_token=secret'), 'OAUTH_PROVIDER_FAILED'],
  ] as const)('turns callback failure into a safe opaque error code', async (failure, errorCode) => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'GOOGLE', purpose: 'LOGIN', userId: null,
    });
    google.exchangeGoogleCodeForToken.mockRejectedValue(failure);
    oauthExchange.issueOAuthCallbackCode.mockResolvedValue('E'.repeat(43));

    const res = createResponse();
    await googleCallback(requestWithBinding({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith(
      { kind: 'ERROR', purpose: 'LOGIN', errorCode },
      BINDING_A,
    );
    const refreshedBinding = oauthExchange.issueOAuthCallbackCode.mock.calls.at(-1)?.[1];
    expect(res.cookie).toHaveBeenCalledWith(
      'yte_oauth_binding', refreshedBinding, expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expectSafeCallbackRedirect(res, 'E'.repeat(43), 'LOGIN');
  });

  it('creates a fresh browser binding for a safe callback error when the cookie is missing', async () => {
    oauthExchange.issueOAuthCallbackCode.mockResolvedValue('E'.repeat(43));
    const res = createResponse();

    await googleCallback({ query: { state: 'opaque-state' } } as unknown as Request, res);

    expect(oauthState.consumeOAuthAuthorizationState).not.toHaveBeenCalled();
    expect(oauthExchange.issueOAuthCallbackCode).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('OAuth callback exchange', () => {
  it('consumes a session code before signing and returns the application session', async () => {
    oauthExchange.consumeOAuthCallbackCode.mockResolvedValue({ kind: 'SESSION', purpose: 'LOGIN', userId: 'session-user' });
    repository.createSessionForUser.mockResolvedValue({ userId: 'session-user', token: 'session-token' });
    const res = createResponse();

    await exchangeOAuthCallbackCode(requestWithBinding({ body: { code: 'S'.repeat(43), intent: 'LOGIN' } }), res);

    expect(oauthExchange.consumeOAuthCallbackCode).toHaveBeenCalledWith('S'.repeat(43), BINDING_A, 'LOGIN');
    expect(repository.createSessionForUser).toHaveBeenCalledWith('session-user');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { userId: 'session-user', token: 'session-token', intent: 'LOGIN' },
      error: null,
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('returns a generic safe error for invalid, expired, or replayed codes', async () => {
    oauthExchange.consumeOAuthCallbackCode.mockRejectedValue(
      Object.assign(new Error('database detail'), { code: 'INVALID_OAUTH_CODE' }),
    );
    const res = createResponse();

    await exchangeOAuthCallbackCode(requestWithBinding({ body: { code: 'I'.repeat(43) } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code: 'INVALID_OAUTH_CODE', message: expect.not.stringContaining('database detail') },
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('maps stored OAuth errors to safe typed responses', async () => {
    oauthExchange.consumeOAuthCallbackCode.mockResolvedValue({
      kind: 'ERROR', errorCode: 'OAUTH_EMAIL_LINK_REQUIRED',
    });
    const res = createResponse();

    await exchangeOAuthCallbackCode(requestWithBinding({ body: { code: 'E'.repeat(43) } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code: 'OAUTH_EMAIL_LINK_REQUIRED', message: expect.any(String) },
    });
    expect(repository.createSessionForUser).not.toHaveBeenCalled();
  });

  it('does not revive a consumed code when session signing fails', async () => {
    oauthExchange.consumeOAuthCallbackCode
      .mockResolvedValueOnce({ kind: 'SESSION', userId: 'session-user' })
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'INVALID_OAUTH_CODE' }));
    repository.createSessionForUser.mockRejectedValue(new Error('JWT signing secret detail'));

    const first = createResponse();
    await exchangeOAuthCallbackCode(requestWithBinding({ body: { code: 'F'.repeat(43) } }), first);
    expect(first.status).toHaveBeenCalledWith(500);
    expect(first.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: expect.not.stringContaining('JWT signing secret detail') },
    });

    const replay = createResponse();
    await exchangeOAuthCallbackCode(requestWithBinding({ body: { code: 'F'.repeat(43) } }), replay);
    expect(replay.status).toHaveBeenCalledWith(400);
    expect(oauthExchange.consumeOAuthCallbackCode).toHaveBeenCalledTimes(2);
    expect(repository.createSessionForUser).toHaveBeenCalledTimes(1);
  });

  it('rejects callback code exchange generically when the binding cookie is missing', async () => {
    const res = createResponse();

    await exchangeOAuthCallbackCode({ body: { code: 'M'.repeat(43) } } as Request, res);

    expect(oauthExchange.consumeOAuthCallbackCode).not.toHaveBeenCalled();
    expect(repository.createSessionForUser).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'INVALID_OAUTH_CODE',
        message: 'The OAuth callback code is invalid or expired.',
      },
    });
  });
});

describe('OAuth route and validation contracts', () => {
  it.each([
    ['A'.repeat(43), true],
    ['A'.repeat(42), false],
    ['A'.repeat(44), false],
    [`${'A'.repeat(42)}+`, false],
    ['', false],
  ])('strictly validates callback code %s', (code, expected) => {
    expect(oauthExchangeSchema.safeParse({ code, intent: 'LOGIN' }).success).toBe(expected);
    expect(oauthExchangeSchema.safeParse({ code, intent: 'LOGIN', extra: true }).success).toBe(false);
  });

  it('registers security middleware before OAuth handlers', () => {
    const routes = (authRouter as unknown as { stack: Array<{ route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: ((...args: any[]) => unknown) & { name?: string } }>;
    } }> }).stack.flatMap((layer) => layer.route ? [layer.route] : []);
    const exchange = routes.find((route) => route.path === '/oauth/exchange');
    const googleLoginRoute = routes.find((route) => route.path === '/google');
    const googleCallbackRoute = routes.find((route) => route.path === '/google/callback');
    const facebookLoginRoute = routes.find((route) => route.path === '/facebook');
    const facebookCallbackRoute = routes.find((route) => route.path === '/facebook/callback');
    const googleLinkRoute = routes.find((route) => route.path === '/google/link');
    const facebookLinkRoute = routes.find((route) => route.path === '/facebook/link');

    expect(exchange?.methods.post).toBe(true);
    expect(googleLinkRoute?.methods.post).toBe(true);
    expect(facebookLinkRoute?.methods.post).toBe(true);
    expect(googleLinkRoute?.stack.map((layer) => layer.handle.name)).toContain('requireAuth');
    expect(facebookLinkRoute?.stack.map((layer) => layer.handle.name)).toContain('requireAuth');
    expect(exchange?.stack.at(-1)?.handle).toBe(exchangeOAuthCallbackCode);
    expect(exchange?.stack[0]?.handle).not.toBe(exchangeOAuthCallbackCode);
    const exchangeValidation = exchange?.stack[0]?.handle;
    const invalidResponse = createResponse();
    const invalidNext = jest.fn();
    exchangeValidation?.({ body: { code: 'short', intent: 'LOGIN' } } as Request, invalidResponse, invalidNext);
    expect(invalidNext).not.toHaveBeenCalled();
    expect(invalidResponse.status).toHaveBeenCalledWith(400);
    expect(invalidResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    }));
    const validNext = jest.fn();
    exchangeValidation?.({ body: { code: 'V'.repeat(43), intent: 'LOGIN' } } as Request, createResponse(), validNext);
    expect(validNext).toHaveBeenCalledTimes(1);
    expect(googleLoginRoute?.stack.map((layer) => layer.handle)).toEqual([
      oauthLoginRateLimit,
      googleLogin,
    ]);
    expect(facebookLoginRoute?.stack.map((layer) => layer.handle)).toEqual([
      oauthLoginRateLimit,
      facebookLogin,
    ]);
    expect(googleCallbackRoute?.stack.map((layer) => layer.handle)).toEqual([
      oauthCallbackRateLimit,
      googleCallback,
    ]);
    expect(facebookCallbackRoute?.stack.map((layer) => layer.handle)).toEqual([
      oauthCallbackRateLimit,
      facebookCallback,
    ]);
    expect(googleLinkRoute?.stack.map((layer) => layer.handle)).toEqual([
      requireAuth,
      oauthLinkRateLimit,
      googleLink,
    ]);
    expect(facebookLinkRoute?.stack.map((layer) => layer.handle)).toEqual([
      requireAuth,
      oauthLinkRateLimit,
      facebookLink,
    ]);
  });
});
