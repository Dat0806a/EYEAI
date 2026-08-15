import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  createSmsProvider,
  isSmsProviderConfigured,
  SmsProviderNotConfiguredError,
} from '../src/services/sms/providerFactory';
import { EsmsSmsProvider } from '../src/services/sms/esmsSmsProvider';
import { parseEsmsSendResponse } from '../src/services/sms/esmsResponse';
import type { SmsProviderConfig } from '../src/services/sms/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const esmsConfig: SmsProviderConfig = {
  provider: 'esms',
  twilio: {
    accountSid: '',
    authToken: '',
    messagingServiceSid: '',
    fromNumber: '',
    requestTimeoutMs: 5_000,
  },
  esms: {
    apiKey: 'synthetic-esms-api-key',
    secretKey: 'synthetic-esms-secret-key',
    requestTimeoutMs: 5_000,
  },
};

describe('eSMS provider configuration', () => {
  it('selects the eSMS adapter only for a complete eSMS configuration', () => {
    expect(isSmsProviderConfigured(esmsConfig)).toBe(true);
    expect(createSmsProvider(esmsConfig).constructor.name).toBe('EsmsSmsProvider');
  });

  it.each([
    ['ESMS_API_KEY', { apiKey: '' }],
    ['ESMS_SECRET_KEY', { secretKey: '' }],
    ['blank ESMS_API_KEY', { apiKey: '   ' }],
    ['blank ESMS_SECRET_KEY', { secretKey: '   ' }],
  ])('fails closed when %s is missing', (_name, override) => {
    const incomplete = {
      ...esmsConfig,
      esms: { ...esmsConfig.esms, ...override },
    };

    expect(isSmsProviderConfigured(incomplete)).toBe(false);
    expect(() => createSmsProvider(incomplete)).toThrow(SmsProviderNotConfiguredError);
  });
});

describe('eSMS SMS provider', () => {
  it('keeps the runtime response validator synchronized with the physical contract', () => {
    expect(parseEsmsSendResponse({
      CodeResult: '100',
      CountRegenerate: 0,
      SMSID: 'synthetic-id',
      ErrorMessage: '',
      FutureProviderField: 'allowed',
    })).toMatchObject({ CodeResult: '100', CountRegenerate: 0 });
    expect(parseEsmsSendResponse({ CodeResult: 100 })).toBeNull();
    expect(parseEsmsSendResponse({ CodeResult: '100', CountRegenerate: -1 })).toBeNull();
    expect(parseEsmsSendResponse({ CodeResult: '100', SMSID: 123 })).toBeNull();
    expect(parseEsmsSendResponse({ CodeResult: '100', ErrorMessage: 123 })).toBeNull();
  });

  it('sends the backend OTP once through the exact approved eSMS endpoint and template', async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        CodeResult: '100',
        CountRegenerate: 0,
        SMSID: 'synthetic-esms-message-id',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new EsmsSmsProvider(esmsConfig.esms);

    await provider.sendOtp({
      toE164: '+84912345678',
      code: '012345',
      expiresInSeconds: 300,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
    expect(init.signal).toBe(timeoutSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      ApiKey: 'synthetic-esms-api-key',
      SecretKey: 'synthetic-esms-secret-key',
      Content: '012345 la ma xac minh dang ky Baotrixemay cua ban',
      Phone: '0912345678',
      Brandname: 'Baotrixemay',
      SmsType: '2',
      IsUnicode: '0',
    });
    expect(String(init.body)).not.toMatch(/Sandbox|AutoGenCode/);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('accepts documented extra response fields while requiring CodeResult 100', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        CodeResult: '100',
        CountRegenerate: 0,
        SMSID: 'synthetic-esms-message-id',
        FutureProviderField: 'allowed',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new EsmsSmsProvider(esmsConfig.esms).sendOtp({
      toE164: '+84912345678',
      code: '123456',
      expiresInSeconds: 300,
    })).resolves.toBeUndefined();
  });

  it('rejects non-Vietnamese destinations safely before making a provider request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new EsmsSmsProvider(esmsConfig.esms).sendOtp({
      toE164: '+12025550123',
      code: '123456',
      expiresInSeconds: 300,
    })).rejects.toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
      statusCode: 502,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a code that cannot fit the approved eSMS CODE placeholder', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new EsmsSmsProvider(esmsConfig.esms).sendOtp({
      toE164: '+84912345678',
      code: '123456789',
      expiresInSeconds: 300,
    })).rejects.toMatchObject({ code: 'OTP_DELIVERY_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP failure', jest.fn().mockResolvedValue({ ok: false, status: 503 })],
    ['network failure', jest.fn().mockRejectedValue(new Error('network synthetic-esms-secret-key 654321'))],
    ['provider failure', jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ CodeResult: '104', ErrorMessage: 'provider detail 654321' }),
    })],
    ['malformed JSON', jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('bad JSON synthetic-esms-api-key')),
    })],
    ['missing CodeResult', jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ SMSID: 'synthetic-id' }),
    })],
    ['wrong CodeResult type', jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ CodeResult: 100 }),
    })],
  ])('maps %s to a safe public error without logging OTP or credentials', async (_label, fetchMock) => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new EsmsSmsProvider(esmsConfig.esms);

    let failure: unknown;
    try {
      await provider.sendOtp({
        toE164: '+84912345678',
        code: '654321',
        expiresInSeconds: 300,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
      statusCode: 502,
    });
    expect(JSON.stringify(failure)).not.toMatch(
      /654321|synthetic-esms-api-key|synthetic-esms-secret-key|provider detail/,
    );
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('maps timeout to one safe failure without retrying or logging secrets', async () => {
    const fetchMock = jest.fn().mockRejectedValue(
      Object.assign(new Error('aborted synthetic-esms-secret-key 654321'), { name: 'AbortError' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(new EsmsSmsProvider(esmsConfig.esms).sendOtp({
      toE164: '+84912345678',
      code: '654321',
      expiresInSeconds: 300,
    })).rejects.toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
      statusCode: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
