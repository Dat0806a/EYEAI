import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  createSmsProvider,
  isPhoneAuthConfigured,
  isSmsProviderConfigured,
  SmsProviderNotConfiguredError,
} from '../src/services/sms/providerFactory';
import { TwilioSmsProvider } from '../src/services/sms/twilioSmsProvider';
import type { SmsProviderConfig, TwilioSmsProviderConfig } from '../src/services/sms/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const baseConfig: SmsProviderConfig = {
  provider: 'twilio',
  twilio: {
    accountSid: 'AC1234567890',
    authToken: 'twilio-auth-token',
    messagingServiceSid: 'MG1234567890',
    fromNumber: '',
    requestTimeoutMs: 5_000,
  },
  esms: { apiKey: '', secretKey: '', requestTimeoutMs: 5_000 },
};

const baseTwilioConfig: TwilioSmsProviderConfig = baseConfig.twilio;

describe('SMS provider configuration', () => {
  it('requires an exact supported provider and complete Twilio credentials', () => {
    expect(isSmsProviderConfigured(baseConfig)).toBe(true);
    expect(isSmsProviderConfigured({ ...baseConfig, provider: '' })).toBe(false);
    expect(isSmsProviderConfigured({ ...baseConfig, provider: 'fake' })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, accountSid: '' },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, authToken: '' },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, authToken: '   ' },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, messagingServiceSid: '', fromNumber: '' },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: {
        ...baseConfig.twilio,
        messagingServiceSid: 'MG123',
        fromNumber: '+12025550123',
      },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: {
        ...baseConfig.twilio,
        messagingServiceSid: '',
        fromNumber: '+12025550123',
      },
    })).toBe(true);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, requestTimeoutMs: 120_000 },
    })).toBe(true);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, requestTimeoutMs: 120_001 },
    })).toBe(false);
    expect(isSmsProviderConfigured({
      ...baseConfig,
      twilio: { ...baseConfig.twilio, requestTimeoutMs: 1.5 },
    })).toBe(false);
  });

  it('does not advertise phone auth without a dedicated strong OTP secret', () => {
    expect(isPhoneAuthConfigured({ sms: baseConfig, otpHmacSecret: '' })).toBe(false);
    expect(isPhoneAuthConfigured({ sms: baseConfig, otpHmacSecret: 'too-short' })).toBe(false);
    expect(isPhoneAuthConfigured({
      sms: baseConfig,
      otpHmacSecret: 'phone-otp-secret-with-at-least-thirty-two-bytes',
    })).toBe(true);
  });

  it('rejects unavailable production configuration without exposing values', () => {
    expect(() => createSmsProvider({ ...baseConfig, provider: 'fake' })).toThrow(
      SmsProviderNotConfiguredError,
    );
    expect(() => createSmsProvider({ ...baseConfig, provider: 'fake' })).toThrow(
      'Dịch vụ gửi mã OTP chưa được cấu hình.',
    );
  });
});

describe('Twilio SMS provider', () => {
  it('sends one ASCII OTP message through the Twilio Messages API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const provider = new TwilioSmsProvider(baseTwilioConfig);

    await provider.sendOtp({
      toE164: '+84912345678',
      code: '012345',
      expiresInSeconds: 300,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC1234567890/Messages.json',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Basic ${Buffer.from('AC1234567890:twilio-auth-token').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(init.signal).toBeDefined();
    const body = new URLSearchParams(String(init.body));
    expect(body.get('To')).toBe('+84912345678');
    expect(body.get('MessagingServiceSid')).toBe('MG1234567890');
    expect(body.get('From')).toBeNull();
    expect(body.get('Body')).toBe(
      'Y Te Cho Nguoi Binh Thuong: Ma OTP cua ban la 012345. Ma het han sau 5 phut.',
    );
  });

  it('uses a configured sender number when no messaging service is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const provider = new TwilioSmsProvider({
      ...baseTwilioConfig,
      messagingServiceSid: '',
      fromNumber: '+12025550123',
    });

    await provider.sendOtp({ toE164: '+84912345678', code: '123456', expiresInSeconds: 240 });

    const body = new URLSearchParams(String(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
    ));
    expect(body.get('From')).toBe('+12025550123');
    expect(body.get('MessagingServiceSid')).toBeNull();
  });

  it('treats a whitespace-only messaging service as absent when a sender number is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const config = {
      ...baseTwilioConfig,
      messagingServiceSid: '   ',
      fromNumber: '+12025550123',
    };

    expect(isSmsProviderConfigured({ ...baseConfig, twilio: config })).toBe(true);
    const provider = new TwilioSmsProvider(config);
    await provider.sendOtp({ toE164: '+84912345678', code: '123456', expiresInSeconds: 240 });

    const body = new URLSearchParams(String(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
    ));
    expect(body.get('From')).toBe('+12025550123');
    expect(body.get('MessagingServiceSid')).toBeNull();
  });

  it.each([
    ['non-2xx', jest.fn().mockResolvedValue({ ok: false, status: 400 })],
    ['network', jest.fn().mockRejectedValue(new Error('socket leaked twilio-auth-token 654321'))],
    ['timeout', jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))],
  ])('sanitizes %s provider failures and logs no secrets or OTP', async (_label, fetchMock) => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new TwilioSmsProvider(baseTwilioConfig);

    let failure: unknown;
    try {
      await provider.sendOtp({ toE164: '+84912345678', code: '654321', expiresInSeconds: 300 });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
      statusCode: 502,
      message: 'Không thể gửi mã OTP lúc này. Vui lòng thử lại sau.',
    });
    expect(JSON.stringify(failure)).not.toMatch(/654321|twilio-auth-token|AC1234567890/);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
