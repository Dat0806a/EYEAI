import { afterEach, describe, expect, it, jest } from '@jest/globals';

const numericNames = [
  'OTP_TTL_MINUTES',
  'OTP_RESEND_COOLDOWN_SECONDS',
  'OTP_MAX_ATTEMPTS',
  'TWILIO_REQUEST_TIMEOUT_MS',
  'ESMS_REQUEST_TIMEOUT_MS',
] as const;

const stringNames = [
  'OTP_SMS_PROVIDER',
  'ESMS_API_KEY',
  'ESMS_SECRET_KEY',
] as const;

const originalValues = Object.fromEntries(
  [...numericNames, ...stringNames].map((name) => [name, process.env[name]]),
) as Record<(typeof numericNames)[number] | (typeof stringNames)[number], string | undefined>;

afterEach(() => {
  for (const name of [...numericNames, ...stringNames]) {
    const value = originalValues[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.resetModules();
});

describe('phone authentication numeric configuration', () => {
  it.each([
    ['OTP_TTL_MINUTES', '0'],
    ['OTP_RESEND_COOLDOWN_SECONDS', '-1'],
    ['OTP_MAX_ATTEMPTS', '1.5'],
    ['TWILIO_REQUEST_TIMEOUT_MS', 'not-a-number'],
    ['ESMS_REQUEST_TIMEOUT_MS', 'not-a-number'],
  ] as const)('rejects invalid %s before the application starts', async (name, value) => {
    if (name === 'TWILIO_REQUEST_TIMEOUT_MS') process.env.OTP_SMS_PROVIDER = 'twilio';
    if (name === 'ESMS_REQUEST_TIMEOUT_MS') process.env.OTP_SMS_PROVIDER = 'esms';
    process.env[name] = value;
    jest.resetModules();

    await expect(import('../src/config')).rejects.toThrow(`${name} must be a positive integer.`);
  });

  it('parses valid phone authentication numeric settings exactly', async () => {
    process.env.OTP_SMS_PROVIDER = 'twilio';
    process.env.OTP_TTL_MINUTES = '7';
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '90';
    process.env.OTP_MAX_ATTEMPTS = '4';
    process.env.TWILIO_REQUEST_TIMEOUT_MS = '8000';
    jest.resetModules();

    const { config } = await import('../src/config');
    expect(config.otp).toMatchObject({
      ttlMinutes: 7,
      resendCooldownSeconds: 90,
      maxAttempts: 4,
    });
    expect(config.sms.twilio.requestTimeoutMs).toBe(8000);
  });

  it('rejects OTP_MAX_ATTEMPTS above the brute-force safety ceiling', async () => {
    process.env.OTP_MAX_ATTEMPTS = '6';
    jest.resetModules();

    await expect(import('../src/config')).rejects.toThrow(
      'OTP_MAX_ATTEMPTS must be between 1 and 5.',
    );
  });

  it('rejects a resend cooldown longer than the OTP lifetime', async () => {
    process.env.OTP_TTL_MINUTES = '1';
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '120';
    jest.resetModules();

    await expect(import('../src/config')).rejects.toThrow(
      'OTP_RESEND_COOLDOWN_SECONDS must not exceed the OTP lifetime.',
    );
  });

  it('rejects a Twilio timeout above the bounded network-call ceiling', async () => {
    process.env.OTP_SMS_PROVIDER = 'twilio';
    process.env.TWILIO_REQUEST_TIMEOUT_MS = '120001';
    jest.resetModules();

    await expect(import('../src/config')).rejects.toThrow(
      'TWILIO_REQUEST_TIMEOUT_MS must be between 1 and 120000 milliseconds.',
    );
  });

  it('parses eSMS credentials and a bounded request timeout without exposing values', async () => {
    process.env.OTP_SMS_PROVIDER = 'esms';
    process.env.ESMS_API_KEY = 'synthetic-esms-api-key';
    process.env.ESMS_SECRET_KEY = 'synthetic-esms-secret-key';
    process.env.ESMS_REQUEST_TIMEOUT_MS = '9000';
    jest.resetModules();

    const { config } = await import('../src/config');
    expect(config.sms).toMatchObject({
      provider: 'esms',
      esms: {
        apiKey: 'synthetic-esms-api-key',
        secretKey: 'synthetic-esms-secret-key',
        requestTimeoutMs: 9000,
      },
    });
  });

  it('rejects an eSMS timeout above the bounded network-call ceiling', async () => {
    process.env.OTP_SMS_PROVIDER = 'esms';
    process.env.ESMS_REQUEST_TIMEOUT_MS = '120001';
    jest.resetModules();

    await expect(import('../src/config')).rejects.toThrow(
      'ESMS_REQUEST_TIMEOUT_MS must be between 1 and 120000 milliseconds.',
    );
  });

  it('ignores an invalid unused eSMS timeout when Twilio is selected', async () => {
    process.env.OTP_SMS_PROVIDER = 'twilio';
    process.env.ESMS_REQUEST_TIMEOUT_MS = 'not-a-number';
    jest.resetModules();

    const { config } = await import('../src/config');
    expect(config.sms.provider).toBe('twilio');
    expect(config.sms.esms.requestTimeoutMs).toBe(10_000);
  });

  it('ignores an invalid unused Twilio timeout when eSMS is selected', async () => {
    process.env.OTP_SMS_PROVIDER = 'esms';
    process.env.TWILIO_REQUEST_TIMEOUT_MS = 'not-a-number';
    jest.resetModules();

    const { config } = await import('../src/config');
    expect(config.sms.provider).toBe('esms');
    expect(config.sms.twilio.requestTimeoutMs).toBe(10_000);
  });
});
