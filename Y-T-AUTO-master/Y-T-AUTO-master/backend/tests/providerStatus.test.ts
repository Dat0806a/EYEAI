import { afterEach, describe, expect, it, jest } from '@jest/globals';

const phoneEnvNames = [
  'OTP_SMS_PROVIDER',
  'OTP_HMAC_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
  'ESMS_API_KEY',
  'ESMS_SECRET_KEY',
] as const;

const originalPhoneEnv = Object.fromEntries(
  phoneEnvNames.map((name) => [name, process.env[name]]),
) as Record<(typeof phoneEnvNames)[number], string | undefined>;

afterEach(() => {
  for (const name of phoneEnvNames) {
    const value = originalPhoneEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.resetModules();
});

describe('auth provider status', () => {
  it('reports unconfigured providers in the default test environment', async () => {
    const { getAuthProviderStatus } = await import('../src/services/oauth/providerStatus');
    expect(getAuthProviderStatus()).toEqual({ google: false, facebook: false, phoneOtp: false });
  });

  it('keeps phone OTP disabled for partial Twilio configuration', async () => {
    process.env.OTP_SMS_PROVIDER = 'twilio';
    process.env.OTP_HMAC_SECRET = 'phone-otp-secret-with-at-least-thirty-two-bytes';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = '';
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123';
    jest.resetModules();

    const { getAuthProviderStatus } = await import('../src/services/oauth/providerStatus');
    expect(getAuthProviderStatus().phoneOtp).toBe(false);
  });

  it('advertises phone OTP only for complete production configuration', async () => {
    process.env.OTP_SMS_PROVIDER = 'twilio';
    process.env.OTP_HMAC_SECRET = 'phone-otp-secret-with-at-least-thirty-two-bytes';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123';
    process.env.TWILIO_FROM_NUMBER = '';
    jest.resetModules();

    const { getAuthProviderStatus } = await import('../src/services/oauth/providerStatus');
    expect(getAuthProviderStatus()).toEqual({ google: false, facebook: false, phoneOtp: true });
  });

  it('keeps phone OTP disabled for partial eSMS configuration', async () => {
    process.env.OTP_SMS_PROVIDER = 'esms';
    process.env.OTP_HMAC_SECRET = 'phone-otp-secret-with-at-least-thirty-two-bytes';
    process.env.ESMS_API_KEY = 'synthetic-esms-api-key';
    process.env.ESMS_SECRET_KEY = '';
    jest.resetModules();

    const { getAuthProviderStatus } = await import('../src/services/oauth/providerStatus');
    expect(getAuthProviderStatus().phoneOtp).toBe(false);
  });

  it('advertises phone OTP for complete eSMS configuration', async () => {
    process.env.OTP_SMS_PROVIDER = 'esms';
    process.env.OTP_HMAC_SECRET = 'phone-otp-secret-with-at-least-thirty-two-bytes';
    process.env.ESMS_API_KEY = 'synthetic-esms-api-key';
    process.env.ESMS_SECRET_KEY = 'synthetic-esms-secret-key';
    jest.resetModules();

    const { getAuthProviderStatus } = await import('../src/services/oauth/providerStatus');
    expect(getAuthProviderStatus()).toEqual({ google: false, facebook: false, phoneOtp: true });
  });
});
