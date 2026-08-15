import { afterEach, expect, it, jest } from '@jest/globals';

const originalPhoneEnvironment = {
  provider: process.env.OTP_SMS_PROVIDER,
  hmacSecret: process.env.OTP_HMAC_SECRET,
  apiKey: process.env.ESMS_API_KEY,
  secretKey: process.env.ESMS_SECRET_KEY,
};

afterEach(() => {
  for (const [name, value] of [
    ['OTP_SMS_PROVIDER', originalPhoneEnvironment.provider],
    ['OTP_HMAC_SECRET', originalPhoneEnvironment.hmacSecret],
    ['ESMS_API_KEY', originalPhoneEnvironment.apiKey],
    ['ESMS_SECRET_KEY', originalPhoneEnvironment.secretKey],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  database.getDb.mockClear();
  jest.resetModules();
});

const database = {
  getDb: jest.fn(async () => ({})),
};

jest.mock('../src/database', () => ({
  getDb: database.getDb,
}));
jest.mock('../src/repositories/authRepository', () => ({
  signSessionForUser: jest.fn(),
}));

it('fails with a typed configuration error before opening the database', async () => {
  const { getPhoneAuthRuntime } = await import('../src/services/phone/phoneAuthRuntime');
  await expect(getPhoneAuthRuntime()).rejects.toMatchObject({
    code: 'OTP_NOT_CONFIGURED',
    statusCode: 503,
  });
  expect(database.getDb).not.toHaveBeenCalled();
});

it('fails incomplete eSMS configuration before opening the database', async () => {
  process.env.OTP_SMS_PROVIDER = 'esms';
  process.env.OTP_HMAC_SECRET = 'phone-otp-secret-with-at-least-thirty-two-bytes';
  process.env.ESMS_API_KEY = 'synthetic-esms-api-key';
  process.env.ESMS_SECRET_KEY = '';
  jest.resetModules();

  const { getPhoneAuthRuntime } = await import('../src/services/phone/phoneAuthRuntime');
  await expect(getPhoneAuthRuntime()).rejects.toMatchObject({
    code: 'OTP_NOT_CONFIGURED',
    statusCode: 503,
  });
  expect(database.getDb).not.toHaveBeenCalled();
});
