import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
  isGoogleOAuthConfigured: jest.fn(() => true),
  buildGoogleAuthorizationUrl: jest.fn((state: string) => `https://google.test/auth?state=${state}`),
  exchangeGoogleCodeForToken: jest.fn(),
  getGoogleUserInfo: jest.fn(),
};

const facebook = {
  isFacebookOAuthConfigured: jest.fn(() => true),
  buildFacebookAuthorizationUrl: jest.fn((state: string) => `https://facebook.test/auth?state=${state}`),
  exchangeFacebookCodeForToken: jest.fn(),
  getFacebookUserInfo: jest.fn(),
};

const oauthState = {
  OAUTH_AUTHORIZATION_STATE_TTL_MS: 10 * 60 * 1000,
  issueOAuthAuthorizationState: jest.fn(async () => 'S'.repeat(43)),
  consumeOAuthAuthorizationState: jest.fn(),
  generateOpaqueValue: jest.fn(() => 'B'.repeat(43)),
  isOpaqueValue: (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
};

const oauthExchange = {
  issueOAuthCallbackCode: jest.fn(async () => 'C'.repeat(43)),
  consumeOAuthCallbackCode: jest.fn(),
};

const safeOAuthErrors = [
  'INVALID_OAUTH_STATE',
  'OAUTH_PROVIDER_FAILED',
  'OAUTH_EMAIL_LINK_REQUIRED',
  'OAUTH_IDENTITY_CONFLICT',
  'LOGIN_REQUIRED',
  'REGISTRATION_REQUIRED',
];

jest.mock('../src/repositories/authRepository', () => repository);
jest.mock('../src/services/oauth/googleOAuth', () => google);
jest.mock('../src/services/oauth/facebookOAuth', () => facebook);
jest.mock('../src/services/oauth/oauthState', () => oauthState);
jest.mock('../src/services/oauth/oauthExchange', () => ({
  ...oauthExchange,
  OAUTH_CALLBACK_CODE_TTL_MS: 60 * 1000,
  OAUTH_CALLBACK_ERROR_CODES: safeOAuthErrors,
  isOAuthCallbackErrorCode: (value: unknown) => safeOAuthErrors.includes(String(value)),
}));
jest.mock('../src/services/oauth/providerStatus', () => ({ getAuthProviderStatus: jest.fn(() => []) }));
jest.mock('../src/config', () => ({
  config: { webOrigin: 'https://app.example.test' },
}));

import {
  exchangeOAuthCallbackCode,
  facebookCallback,
  facebookLogin,
  googleCallback,
  googleLogin,
} from '../src/controllers/authController';
import { oauthExchangeSchema } from '../src/schemas';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  redirect: jest.Mock;
  set: jest.Mock;
  cookie: jest.Mock;
};

function response(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  return res;
}

const BINDING = 'B'.repeat(43);

function request(input: Partial<Request>): Request {
  return {
    headers: { cookie: `yte_oauth_binding=${BINDING}` },
    ...input,
  } as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  google.isGoogleOAuthConfigured.mockReturnValue(true);
  facebook.isFacebookOAuthConfigured.mockReturnValue(true);
  oauthState.issueOAuthAuthorizationState.mockResolvedValue('S'.repeat(43));
  oauthExchange.issueOAuthCallbackCode.mockResolvedValue('C'.repeat(43));
});

describe('explicit public OAuth authorization intent', () => {
  it.each([
    ['GOOGLE', googleLogin],
    ['FACEBOOK', facebookLogin],
  ] as const)('starts %s LOGIN only when the query intent is LOGIN', async (provider, handler) => {
    const res = response();

    await handler(request({ query: { intent: 'LOGIN' } }), res);

    expect(oauthState.issueOAuthAuthorizationState).toHaveBeenCalledWith(
      { provider, purpose: 'LOGIN' },
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
  });

  it.each([
    ['GOOGLE', googleLogin],
    ['FACEBOOK', facebookLogin],
  ] as const)('starts %s REGISTER only when the query intent is REGISTER', async (provider, handler) => {
    const res = response();

    await handler(request({ query: { intent: 'REGISTER' } }), res);

    expect(oauthState.issueOAuthAuthorizationState).toHaveBeenCalledWith(
      { provider, purpose: 'REGISTER' },
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
  });

  it.each([googleLogin, facebookLogin])('fails closed when public OAuth intent is missing or invalid', async (handler) => {
    for (const intent of [undefined, 'LINK', 'login']) {
      jest.clearAllMocks();
      const res = response();
      await handler(request({ query: intent ? { intent } : {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(oauthState.issueOAuthAuthorizationState).not.toHaveBeenCalled();
    }
  });
});

describe('purpose-bound OAuth callbacks', () => {
  it('uses existing-only resolution for LOGIN and redirects with the consumed intent', async () => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'GOOGLE', purpose: 'LOGIN', userId: null,
    });
    google.exchangeGoogleCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    google.getGoogleUserInfo.mockResolvedValue({
      sub: 'google-sub', email: 'person@example.test', email_verified: true, name: null,
    });
    repository.loginWithOAuthIdentity.mockResolvedValue({ userId: 'login-user' });
    const res = response();

    await googleCallback(request({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(repository.loginWithOAuthIdentity).toHaveBeenCalledWith({
      provider: 'GOOGLE', providerSub: 'google-sub', email: 'person@example.test', emailVerified: true,
    });
    expect(repository.registerOAuthUser).not.toHaveBeenCalled();
    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith({
      kind: 'SESSION', purpose: 'LOGIN', userId: 'login-user',
    }, BINDING);
    const redirect = new URL(String(res.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('code')).toBe('C'.repeat(43));
    expect(redirect.searchParams.get('intent')).toBe('LOGIN');
  });

  it('uses new-only resolution for REGISTER and never invokes LOGIN resolution', async () => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'FACEBOOK', purpose: 'REGISTER', userId: null,
    });
    facebook.exchangeFacebookCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    facebook.getFacebookUserInfo.mockResolvedValue({
      id: 'facebook-sub', email: 'person@example.test', name: null,
    });
    repository.registerOAuthUser.mockResolvedValue({ userId: 'register-user' });
    const res = response();

    await facebookCallback(request({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(repository.registerOAuthUser).toHaveBeenCalledWith({
      provider: 'FACEBOOK', providerSub: 'facebook-sub', email: 'person@example.test', emailVerified: false,
    });
    expect(repository.loginWithOAuthIdentity).not.toHaveBeenCalled();
    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith({
      kind: 'SESSION', purpose: 'REGISTER', userId: 'register-user',
    }, BINDING);
    const redirect = new URL(String(res.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('intent')).toBe('REGISTER');
  });

  it.each([
    ['LOGIN', 'REGISTRATION_REQUIRED'],
    ['REGISTER', 'LOGIN_REQUIRED'],
  ] as const)('binds %s guidance errors to the same callback intent', async (purpose, code) => {
    oauthState.consumeOAuthAuthorizationState.mockResolvedValue({
      provider: 'GOOGLE', purpose, userId: null,
    });
    google.exchangeGoogleCodeForToken.mockResolvedValue({ accessToken: 'provider-secret' });
    google.getGoogleUserInfo.mockResolvedValue({
      sub: 'google-sub', email: 'person@example.test', email_verified: true, name: null,
    });
    const failure = Object.assign(new Error('safe semantic failure'), { code, statusCode: 409 });
    if (purpose === 'LOGIN') repository.loginWithOAuthIdentity.mockRejectedValue(failure);
    else repository.registerOAuthUser.mockRejectedValue(failure);
    const res = response();

    await googleCallback(request({ query: { code: 'provider-code', state: 'opaque-state' } }), res);

    expect(oauthExchange.issueOAuthCallbackCode).toHaveBeenCalledWith({
      kind: 'ERROR', purpose, errorCode: code,
    }, BINDING);
    const redirect = new URL(String(res.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('intent')).toBe(purpose);
  });
});

describe('purpose-bound OAuth exchange', () => {
  it('strictly requires code and LOGIN/REGISTER/LINK intent', () => {
    expect(oauthExchangeSchema.safeParse({ code: 'C'.repeat(43), intent: 'LOGIN' }).success).toBe(true);
    expect(oauthExchangeSchema.safeParse({ code: 'C'.repeat(43), intent: 'REGISTER' }).success).toBe(true);
    expect(oauthExchangeSchema.safeParse({ code: 'C'.repeat(43), intent: 'LINK' }).success).toBe(true);
    expect(oauthExchangeSchema.safeParse({ code: 'C'.repeat(43) }).success).toBe(false);
    expect(oauthExchangeSchema.safeParse({ code: 'C'.repeat(43), intent: 'login' }).success).toBe(false);
  });

  it('consumes the code under the expected intent and returns the bound intent', async () => {
    oauthExchange.consumeOAuthCallbackCode.mockResolvedValue({
      kind: 'SESSION', purpose: 'REGISTER', userId: 'session-user',
    });
    repository.createSessionForUser.mockResolvedValue({ userId: 'session-user', token: 'session-token' });
    const res = response();

    await exchangeOAuthCallbackCode(request({
      body: { code: 'C'.repeat(43), intent: 'REGISTER' },
    }), res);

    expect(oauthExchange.consumeOAuthCallbackCode).toHaveBeenCalledWith(
      'C'.repeat(43), BINDING, 'REGISTER',
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { userId: 'session-user', token: 'session-token', intent: 'REGISTER' },
      error: null,
    });
  });
});
