import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  login,
  register,
  getAuthProviders,
  getMe,
  getPhoneAccountStatus,
  requestPhoneLinkOtp,
  requestPhoneLoginOtp,
  requestPhoneRegisterOtp,
  startOAuthLink,
  verifyPhoneLinkOtp,
  verifyPhoneLoginOtp,
  verifyPhoneRegisterOtp,
  exchangeOAuthCode,
} from './api';

const axiosMocks = vi.hoisted(() => {
  const post = vi.fn();
  const get = vi.fn();
  const useInterceptor = vi.fn();
  const create = vi.fn(() => ({
    interceptors: { request: { use: useInterceptor } },
    post,
    get,
  }));
  return { create, get, post, useInterceptor };
});

vi.mock('axios', () => ({
  default: {
    create: axiosMocks.create,
    isAxiosError: vi.fn(() => false),
  },
}));

beforeEach(() => {
  axiosMocks.post.mockReset();
  axiosMocks.get.mockReset();
});

it('includes the browser-bound OAuth cookie on API requests', () => {
  expect(axiosMocks.create).toHaveBeenCalledWith({ baseURL: '/api', withCredentials: true });
});

it('validates a candidate session with an explicit bearer header before storage', async () => {
  axiosMocks.get.mockResolvedValue({
    data: {
      data: {
        userId: '11111111-1111-4111-8111-111111111111',
        hasProfile: false,
        profile: null,
        phone: { phoneVerified: false, maskedPhone: null },
      },
    },
  });

  await expect(getMe('candidate-session-token')).resolves.toEqual({
    userId: '11111111-1111-4111-8111-111111111111',
    hasProfile: false,
    profile: null,
    phone: { phoneVerified: false, maskedPhone: null },
  });
  expect(axiosMocks.get).toHaveBeenCalledWith('/auth/me', {
    headers: { Authorization: 'Bearer candidate-session-token' },
  });
});

it('validates the exact auth-provider status contract', async () => {
  const providers = { google: true, facebook: false, phoneOtp: true };
  axiosMocks.get.mockResolvedValueOnce({ data: { data: { providers } } });
  await expect(getAuthProviders()).resolves.toEqual(providers);

  axiosMocks.get.mockResolvedValueOnce({
    data: { data: { providers: { ...providers, twilioAccountSid: 'AC-secret' } } },
  });
  await expect(getAuthProviders()).rejects.toThrow('Invalid authentication provider response.');

  axiosMocks.get.mockResolvedValueOnce({
    data: { data: { providers: { ...providers, phoneOtp: 'true' } } },
  });
  await expect(getAuthProviders()).rejects.toThrow('Invalid authentication provider response.');
});

describe('explicit OAuth intent exchange', () => {
  it.each(['LOGIN', 'REGISTER', 'LINK'] as const)(
    'submits %s as the expected purpose and validates the returned purpose',
    async (intent) => {
      const session = {
        userId: '11111111-1111-4111-8111-111111111111',
        token: 'candidate-oauth-token',
        intent,
      };
      axiosMocks.post.mockResolvedValue({ data: { data: session } });

      await expect(exchangeOAuthCode('opaque-code', intent)).resolves.toEqual(session);
      expect(axiosMocks.post).toHaveBeenCalledWith('/auth/oauth/exchange', {
        code: 'opaque-code',
        intent,
      });
    },
  );

  it('rejects an OAuth response whose intent differs from the requested intent', async () => {
    axiosMocks.post.mockResolvedValue({
      data: {
        data: {
          userId: '11111111-1111-4111-8111-111111111111',
          token: 'candidate-oauth-token',
          intent: 'REGISTER',
        },
      },
    });

    await expect(exchangeOAuthCode('opaque-code', 'LOGIN'))
      .rejects.toThrow('Invalid authentication session response.');
  });
});

it.each([
  ['register', register, ['person@example.test', 'password123']],
  ['login', login, ['person@example.test', 'password123']],
] as const)('validates the shared auth-session contract for password %s', async (_name, authenticate, args) => {
  const session = {
    userId: '11111111-1111-4111-8111-111111111111',
    token: 'candidate-password-token',
  };
  axiosMocks.post.mockResolvedValueOnce({ data: { data: session } });
  await expect(authenticate(...args)).resolves.toEqual(session);

  axiosMocks.post.mockResolvedValueOnce({
    data: { data: { ...session, email: 'person@example.test' } },
  });
  await expect(authenticate(...args)).rejects.toThrow('Invalid authentication session response.');
});

describe('phone authentication API contracts', () => {
  const challenge = {
    challengeToken: 'C'.repeat(43),
    expiresAt: '2026-08-13T10:05:00.000Z',
    resendAvailableAt: '2026-08-13T10:01:00.000Z',
  };

  it.each([
    ['login', requestPhoneLoginOtp, '/auth/phone/request'],
    ['register', requestPhoneRegisterOtp, '/auth/phone/register/request'],
    ['link', requestPhoneLinkOtp, '/auth/phone/link/request'],
  ] as const)('requests a validated %s challenge', async (_mode, requestOtp, endpoint) => {
    axiosMocks.post.mockResolvedValue({ data: { data: challenge } });

    await expect(requestOtp('0912 345 678')).resolves.toEqual(challenge);
    expect(axiosMocks.post).toHaveBeenCalledWith(endpoint, { phone: '0912 345 678' });
  });

  it.each([
    ['extra OTP', { ...challenge, otp: '123456' }],
    ['canonical phone', { ...challenge, phoneE164: '+84912345678' }],
    ['invalid token', { ...challenge, challengeToken: 'short' }],
    ['invalid timestamp', { ...challenge, expiresAt: 'later' }],
  ])('rejects a challenge response containing %s', async (_name, response) => {
    axiosMocks.post.mockResolvedValue({ data: { data: response } });
    await expect(requestPhoneLoginOtp('0912345678'))
      .rejects.toThrow('Invalid phone OTP challenge response.');
  });

  it('verifies a login challenge and validates the shared auth-session shape', async () => {
    const session = {
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'candidate-phone-token',
    };
    axiosMocks.post.mockResolvedValue({ data: { data: session } });

    await expect(verifyPhoneLoginOtp('C'.repeat(43), '012345')).resolves.toEqual(session);
    expect(axiosMocks.post).toHaveBeenCalledWith('/auth/phone/verify', {
      challengeToken: 'C'.repeat(43),
      code: '012345',
    });
  });

  it('verifies a registration challenge through the registration endpoint', async () => {
    const session = {
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'candidate-phone-register-token',
    };
    axiosMocks.post.mockResolvedValue({ data: { data: session } });

    await expect(verifyPhoneRegisterOtp('C'.repeat(43), '012345')).resolves.toEqual(session);
    expect(axiosMocks.post).toHaveBeenCalledWith('/auth/phone/register/verify', {
      challengeToken: 'C'.repeat(43),
      code: '012345',
    });
  });

  it('rejects sensitive or extra fields in a phone session response', async () => {
    axiosMocks.post.mockResolvedValue({
      data: {
        data: {
          userId: '11111111-1111-4111-8111-111111111111',
          token: 'candidate-phone-token',
          phone: '+84912345678',
        },
      },
    });
    await expect(verifyPhoneLoginOtp('C'.repeat(43), '123456'))
      .rejects.toThrow('Invalid authentication session response.');
  });

  it('verifies a link challenge and validates masked account status', async () => {
    const status = { phoneVerified: true, maskedPhone: '+84******678' };
    axiosMocks.post.mockResolvedValue({ data: { data: status } });

    await expect(verifyPhoneLinkOtp('C'.repeat(43), '123456')).resolves.toEqual(status);
    expect(axiosMocks.post).toHaveBeenCalledWith('/auth/phone/link/verify', {
      challengeToken: 'C'.repeat(43),
      code: '123456',
    });
  });

  it('loads phone status and rejects canonical or inconsistent values', async () => {
    axiosMocks.get.mockResolvedValueOnce({
      data: { data: { phoneVerified: false, maskedPhone: null } },
    });
    await expect(getPhoneAccountStatus()).resolves.toEqual({
      phoneVerified: false,
      maskedPhone: null,
    });
    expect(axiosMocks.get).toHaveBeenCalledWith('/auth/phone');

    axiosMocks.get.mockResolvedValueOnce({
      data: { data: { phoneVerified: true, maskedPhone: '+84912345678' } },
    });
    await expect(getPhoneAccountStatus()).rejects.toThrow('Invalid phone account status response.');
  });

  it('rejects extra or sensitive fields returned by /auth/me', async () => {
    axiosMocks.get.mockResolvedValue({
      data: {
        data: {
          userId: '11111111-1111-4111-8111-111111111111',
          hasProfile: false,
          profile: null,
          phone: { phoneVerified: false, maskedPhone: null },
          phoneE164: '+84912345678',
        },
      },
    });

    await expect(getMe('candidate-token')).rejects.toThrow('Invalid authenticated user response.');
  });

  it.each([
    ['invalid user UUID', {
      userId: 'not-a-uuid',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    }],
    ['invalid profile UUID', {
      userId: '11111111-1111-4111-8111-111111111111',
      hasProfile: true,
      profile: {
        id: 'profile-id',
        user_id: '11111111-1111-4111-8111-111111111111',
        full_name: 'Nguyen An',
        date_of_birth: '1990-01-01',
        gender: 'MALE',
      },
      phone: { phoneVerified: false, maskedPhone: null },
    }],
    ['mismatched profile user', {
      userId: '11111111-1111-4111-8111-111111111111',
      hasProfile: true,
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: '33333333-3333-4333-8333-333333333333',
        full_name: 'Nguyen An',
        date_of_birth: '1990-01-01',
        gender: 'MALE',
      },
      phone: { phoneVerified: false, maskedPhone: null },
    }],
    ['blank profile name', {
      userId: '11111111-1111-4111-8111-111111111111',
      hasProfile: true,
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: '11111111-1111-4111-8111-111111111111',
        full_name: '   ',
        date_of_birth: '1990-01-01',
        gender: 'MALE',
      },
      phone: { phoneVerified: false, maskedPhone: null },
    }],
    ['invalid birth date', {
      userId: '11111111-1111-4111-8111-111111111111',
      hasProfile: true,
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: '11111111-1111-4111-8111-111111111111',
        full_name: 'Nguyen An',
        date_of_birth: '1990-02-31',
        gender: 'MALE',
      },
      phone: { phoneVerified: false, maskedPhone: null },
    }],
  ])('rejects /auth/me with %s', async (_name, value) => {
    axiosMocks.get.mockResolvedValue({ data: { data: value } });
    await expect(getMe('candidate-token')).rejects.toThrow('Invalid authenticated user response.');
  });
});

describe('startOAuthLink authorization validation', () => {
  it.each([
    ['GOOGLE', 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state'],
    ['FACEBOOK', 'https://www.facebook.com/v23.0/dialog/oauth?state=opaque-state'],
  ] as const)('accepts a valid %s authorization URL', async (provider, authorizationUrl) => {
    axiosMocks.post.mockResolvedValue({ data: { data: { provider, authorizationUrl } } });

    await expect(startOAuthLink(provider)).resolves.toEqual({ provider, authorizationUrl });
  });

  it.each([
    [
      'mismatched provider',
      'FACEBOOK',
      { provider: 'GOOGLE', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state' },
    ],
    [
      'javascript URL',
      'GOOGLE',
      { provider: 'GOOGLE', authorizationUrl: 'javascript:alert(1)' },
    ],
    [
      'attacker HTTPS host',
      'GOOGLE',
      { provider: 'GOOGLE', authorizationUrl: 'https://accounts.google.com.attacker.example/o/oauth2/v2/auth' },
    ],
    [
      'credentials and fragment',
      'FACEBOOK',
      { provider: 'FACEBOOK', authorizationUrl: 'https://user:pass@www.facebook.com/v23.0/dialog/oauth#token' },
    ],
    [
      'unversioned Facebook path',
      'FACEBOOK',
      { provider: 'FACEBOOK', authorizationUrl: 'https://www.facebook.com/dialog/oauth?state=opaque-state' },
    ],
  ] as const)('rejects a %s response', async (_name, requestedProvider, response) => {
    axiosMocks.post.mockResolvedValue({ data: { data: response } });

    await expect(startOAuthLink(requestedProvider)).rejects.toThrow('Invalid OAuth authorization response.');
  });
});
