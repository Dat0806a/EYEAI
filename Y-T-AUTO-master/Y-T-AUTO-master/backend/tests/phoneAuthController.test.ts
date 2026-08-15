import { Request, Response } from 'express';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthedRequest } from '../src/middleware/auth';

const phoneService = {
  requestLoginOtp: jest.fn(),
  requestRegisterOtp: jest.fn(),
  requestLinkOtp: jest.fn(),
  verifyLoginOtp: jest.fn(),
  verifyRegisterOtp: jest.fn(),
  verifyLinkOtp: jest.fn(),
};

const phoneStatus = { getPhoneAccountStatus: jest.fn() };

jest.mock('../src/services/phone/phoneAuthRuntime', () => ({
  getPhoneAuthRuntime: jest.fn(async () => phoneService),
}));
jest.mock('../src/repositories/phoneAuthRepository', () => ({
  getPhoneAccountStatus: phoneStatus.getPhoneAccountStatus,
}));

import {
  getPhoneStatus,
  requestPhoneLinkOtp,
  requestPhoneLoginOtp,
  requestPhoneRegisterOtp,
  verifyPhoneLinkOtp,
  verifyPhoneLoginOtp,
  verifyPhoneRegisterOtp,
} from '../src/controllers/phoneAuthController';
import { authRouter } from '../src/routes/authRoutes';
import { requireAuth } from '../src/middleware/auth';
import { phoneRequestSchema, phoneVerifySchema } from '../src/schemas';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  set: jest.Mock;
  cookie: jest.Mock;
};

function response(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  return res;
}

function request(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  } as Request;
}

beforeEach(() => {
  for (const mock of Object.values(phoneService)) mock.mockReset();
  phoneStatus.getPhoneAccountStatus.mockReset();
});

describe('phone authentication controller', () => {
  it('returns a generic 202 login challenge, sets a secure browser cookie, and strips internal fields', async () => {
    phoneService.requestLoginOtp.mockResolvedValue({
      challengeToken: 'C'.repeat(43),
      expiresAt: 1_800_000_300_000,
      resendAvailableAt: 1_800_000_060_000,
      browserBinding: 'B'.repeat(43),
      bindingWasCreated: true,
    });
    const res = response();

    await requestPhoneLoginOtp(request({ body: { phone: '0912345678' } }), res);

    expect(phoneService.requestLoginOtp).toHaveBeenCalledWith({
      phone: '0912345678',
      ip: '203.0.113.10',
      browserBinding: null,
    });
    expect(res.cookie).toHaveBeenCalledWith('yte_phone_binding', 'B'.repeat(43), {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth/phone',
      maxAge: 300_000,
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        challengeToken: 'C'.repeat(43),
        expiresAt: new Date(1_800_000_300_000).toISOString(),
        resendAvailableAt: new Date(1_800_000_060_000).toISOString(),
      },
      error: null,
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/browserBinding|bindingWasCreated|0912345678|otp|codeMac/i);
  });

  it('uses explicit REGISTER service methods for public phone registration', async () => {
    phoneService.requestRegisterOtp.mockResolvedValue({
      challengeToken: 'R'.repeat(43),
      expiresAt: 1_800_000_300_000,
      resendAvailableAt: 1_800_000_060_000,
      browserBinding: 'B'.repeat(43),
      bindingWasCreated: true,
    });
    phoneService.verifyRegisterOtp.mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'register-session-token',
    });

    const requestRes = response();
    await requestPhoneRegisterOtp(request({ body: { phone: '0912345678' } }), requestRes);
    expect(phoneService.requestRegisterOtp).toHaveBeenCalledWith({
      phone: '0912345678',
      ip: '203.0.113.10',
      browserBinding: null,
    });
    expect(requestRes.status).toHaveBeenCalledWith(202);

    const verifyRes = response();
    await verifyPhoneRegisterOtp(request({
      body: { challengeToken: 'R'.repeat(43), code: '123456' },
      headers: { cookie: `yte_phone_binding=${'B'.repeat(43)}` },
    }), verifyRes);
    expect(phoneService.verifyRegisterOtp).toHaveBeenCalledWith({
      challengeToken: 'R'.repeat(43),
      code: '123456',
      ip: '203.0.113.10',
      browserBinding: 'B'.repeat(43),
    });
    expect(verifyRes.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId: '11111111-1111-4111-8111-111111111111',
        token: 'register-session-token',
      },
      error: null,
    });
  });

  it('reuses exactly one valid binding cookie and ignores malformed or duplicate cookies', async () => {
    phoneService.requestLoginOtp.mockResolvedValue({
      challengeToken: 'C'.repeat(43),
      expiresAt: 1_800_000_300_000,
      resendAvailableAt: 1_800_000_060_000,
      browserBinding: 'N'.repeat(43),
      bindingWasCreated: false,
    });
    const valid = 'B'.repeat(43);

    await requestPhoneLoginOtp(request({
      body: { phone: '0912345678' },
      headers: { cookie: `yte_phone_binding=${valid}` },
    }), response());
    expect(phoneService.requestLoginOtp).toHaveBeenLastCalledWith(expect.objectContaining({
      browserBinding: valid,
    }));

    await requestPhoneLoginOtp(request({
      body: { phone: '0912345678' },
      headers: { cookie: 'yte_phone_binding=short; yte_phone_binding=duplicate' },
    }), response());
    expect(phoneService.requestLoginOtp).toHaveBeenLastCalledWith(expect.objectContaining({
      browserBinding: null,
    }));
  });

  it('refreshes the browser binding cookie lifetime for every successful resend', async () => {
    const binding = 'B'.repeat(43);
    phoneService.requestLoginOtp.mockResolvedValue({
      challengeToken: 'C'.repeat(43),
      expiresAt: 1_800_000_300_000,
      resendAvailableAt: 1_800_000_060_000,
      browserBinding: binding,
      bindingWasCreated: false,
    });
    const res = response();

    await requestPhoneLoginOtp(request({
      body: { phone: '0912345678' },
      headers: { cookie: `yte_phone_binding=${binding}` },
    }), res);

    expect(res.cookie).toHaveBeenCalledWith('yte_phone_binding', binding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth/phone',
      maxAge: 300_000,
    });
  });

  it('verifies login using only the bound cookie and returns the existing auth session shape', async () => {
    phoneService.verifyLoginOtp.mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'phone-session-token',
    });
    const res = response();
    const binding = 'B'.repeat(43);

    await verifyPhoneLoginOtp(request({
      body: { challengeToken: 'C'.repeat(43), code: '012345' },
      headers: { cookie: `yte_phone_binding=${binding}` },
    }), res);

    expect(phoneService.verifyLoginOtp).toHaveBeenCalledWith({
      challengeToken: 'C'.repeat(43),
      code: '012345',
      ip: '203.0.113.10',
      browserBinding: binding,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId: '11111111-1111-4111-8111-111111111111',
        token: 'phone-session-token',
      },
      error: null,
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('keeps link requests and verification tied to the authenticated user and returns only masked status', async () => {
    phoneService.requestLinkOtp.mockResolvedValue({
      challengeToken: 'C'.repeat(43),
      expiresAt: 1_800_000_300_000,
      resendAvailableAt: 1_800_000_060_000,
      browserBinding: 'B'.repeat(43),
      bindingWasCreated: true,
    });
    phoneService.verifyLinkOtp.mockResolvedValue({
      userId: 'authenticated-user',
      phoneE164: '+84912345678',
    });
    phoneStatus.getPhoneAccountStatus.mockResolvedValue({ phoneVerified: true, maskedPhone: '+84******678' });
    const requestRes = response();
    await requestPhoneLinkOtp(request({ body: { phone: '0912345678' }, userId: 'authenticated-user' } as Partial<AuthedRequest>), requestRes);
    expect(phoneService.requestLinkOtp).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'authenticated-user',
    }));

    const verifyRes = response();
    await verifyPhoneLinkOtp(request({
      body: { challengeToken: 'C'.repeat(43), code: '123456' },
      headers: { cookie: `yte_phone_binding=${'B'.repeat(43)}` },
      userId: 'authenticated-user',
    } as Partial<AuthedRequest>), verifyRes);
    expect(phoneService.verifyLinkOtp).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'authenticated-user',
    }));
    expect(phoneStatus.getPhoneAccountStatus).toHaveBeenCalledWith('authenticated-user');
    expect(verifyRes.json).toHaveBeenCalledWith({
      success: true,
      data: { phoneVerified: true, maskedPhone: '+84******678' },
      error: null,
    });
    expect(JSON.stringify(verifyRes.json.mock.calls)).not.toContain('+84912345678');
  });

  it('returns phone account status without canonical identity data', async () => {
    phoneStatus.getPhoneAccountStatus.mockResolvedValue({ phoneVerified: false, maskedPhone: null });
    const res = response();
    await getPhoneStatus(request({ userId: 'authenticated-user' } as Partial<AuthedRequest>), res);
    expect(phoneStatus.getPhoneAccountStatus).toHaveBeenCalledWith('authenticated-user');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { phoneVerified: false, maskedPhone: null },
      error: null,
    });
  });

  it.each([
    ['OTP_RESEND_COOLDOWN', 429, 59_001, 'Vui lòng chờ trước khi gửi lại mã OTP.'],
    ['PHONE_RATE_LIMITED', 429, 120_000, 'Bạn đã yêu cầu quá nhiều mã OTP. Vui lòng thử lại sau.'],
    ['OTP_INVALID', 400, undefined, 'Mã OTP không đúng.'],
    ['OTP_EXPIRED', 400, undefined, 'Mã OTP đã hết hạn.'],
    ['OTP_ATTEMPTS_EXCEEDED', 429, undefined, 'Bạn đã nhập sai mã OTP quá số lần cho phép.'],
    ['OTP_INVALID_OR_EXPIRED', 400, undefined, 'Yêu cầu OTP không hợp lệ hoặc đã hết hạn.'],
    ['PHONE_IDENTITY_CONFLICT', 409, undefined, 'Số điện thoại không thể liên kết với tài khoản này.'],
    ['OTP_DELIVERY_UNAVAILABLE', 502, undefined, 'Không thể gửi mã OTP lúc này. Vui lòng thử lại sau.'],
  ] as const)('maps %s to a safe Vietnamese error', async (code, statusCode, retryAfterMs, message) => {
    phoneService.verifyLoginOtp.mockRejectedValue(Object.assign(new Error('raw phone +84912345678 secret'), {
      code,
      statusCode,
      retryAfterMs,
    }));
    const res = response();

    await verifyPhoneLoginOtp(request({
      body: { challengeToken: 'C'.repeat(43), code: '123456' },
      headers: { cookie: `yte_phone_binding=${'B'.repeat(43)}` },
    }), res);

    expect(res.status).toHaveBeenCalledWith(statusCode);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code, message },
    });
    if (retryAfterMs) {
      expect(res.set).toHaveBeenCalledWith('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    }
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/\+84912345678|secret|raw phone/i);
  });

  it('consumes verification budget and returns a generic response when the binding cookie is missing', async () => {
    phoneService.verifyLoginOtp.mockRejectedValue(Object.assign(new Error('Invalid binding.'), {
      code: 'OTP_INVALID_OR_EXPIRED',
      statusCode: 400,
    }));
    const res = response();
    await verifyPhoneLoginOtp(request({
      body: { challengeToken: 'C'.repeat(43), code: '123456' },
    }), res);
    expect(phoneService.verifyLoginOtp).toHaveBeenCalledWith({
      challengeToken: 'C'.repeat(43),
      code: '123456',
      ip: '203.0.113.10',
      browserBinding: '',
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'Yêu cầu OTP không hợp lệ hoặc đã hết hạn.',
      },
    });
  });
});

describe('phone auth route and schema contracts', () => {
  const routes = (authRouter as unknown as { stack: Array<{ route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: ((...args: any[]) => unknown) & { name?: string } }>;
  } }> }).stack.flatMap((layer) => layer.route ? [layer.route] : []);

  it.each([
    ['/phone/request', false],
    ['/phone/verify', false],
    ['/phone/register/request', false],
    ['/phone/register/verify', false],
    ['/phone/link/request', true],
    ['/phone/link/verify', true],
  ] as const)('registers strict validation and correct auth ordering for %s', (path, authenticated) => {
    const route = routes.find((candidate) => candidate.path === path);
    expect(route?.methods.post).toBe(true);
    const handlers = route?.stack.map((layer) => layer.handle) ?? [];
    if (authenticated) {
      expect(handlers[0]).toBe(requireAuth);
      expect(handlers[1]).not.toBe(route?.stack.at(-1)?.handle);
    } else {
      expect(handlers).not.toContain(requireAuth);
      expect(handlers[0]).not.toBe(route?.stack.at(-1)?.handle);
    }
  });

  it.each([
    ['/phone/request', false],
    ['/phone/verify', false],
    ['/phone/register/request', false],
    ['/phone/register/verify', false],
    ['/phone/link/request', true],
    ['/phone/link/verify', true],
  ] as const)('sets no-store before rejecting invalid input on %s', async (path, authenticated) => {
    const route = routes.find((candidate) => candidate.path === path);
    const handlers = route?.stack.map((layer) => layer.handle) ?? [];
    const res = response();
    const req = request({ body: {} });

    for (const handler of handlers.slice(authenticated ? 1 : 0, -1)) {
      let nextCalled = false;
      await handler(req, res, () => {
        nextCalled = true;
      });
      if (!nextCalled) break;
    }

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('registers authenticated phone status and preserves existing OAuth handlers', () => {
    const route = routes.find((candidate) => candidate.path === '/phone');
    expect(route?.methods.get).toBe(true);
    expect(route?.stack.map((layer) => layer.handle)).toEqual([requireAuth, getPhoneStatus]);
    expect(routes.find((candidate) => candidate.path === '/google/callback')).toBeDefined();
    expect(routes.find((candidate) => candidate.path === '/facebook/callback')).toBeDefined();
  });

  it('strictly rejects extra and malformed phone request fields', () => {
    expect(phoneRequestSchema.safeParse({ phone: '0912345678' }).success).toBe(true);
    expect(phoneRequestSchema.safeParse({ phone: '0912345678', extra: true }).success).toBe(false);
    expect(phoneRequestSchema.safeParse({ phone: '' }).success).toBe(false);
    expect(phoneRequestSchema.safeParse({ phone: '1'.repeat(65) }).success).toBe(false);
  });

  it('strictly validates opaque challenge tokens and six-digit OTP codes', () => {
    expect(phoneVerifySchema.safeParse({
      challengeToken: 'C'.repeat(43),
      code: '012345',
    }).success).toBe(true);
    expect(phoneVerifySchema.safeParse({
      challengeToken: 'C'.repeat(43),
      code: '012345',
      extra: true,
    }).success).toBe(false);
    expect(phoneVerifySchema.safeParse({ challengeToken: 'short', code: '012345' }).success).toBe(false);
    expect(phoneVerifySchema.safeParse({ challengeToken: 'C'.repeat(43), code: '12345a' }).success).toBe(false);
  });
});
