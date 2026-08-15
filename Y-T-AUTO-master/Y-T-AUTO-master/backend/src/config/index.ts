import 'dotenv/config';

import { MAX_SMS_REQUEST_TIMEOUT_MS } from '../services/sms/types';

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

const otpTtlMinutes = positiveIntegerEnvironment('OTP_TTL_MINUTES', 5);
const otpResendCooldownSeconds = positiveIntegerEnvironment('OTP_RESEND_COOLDOWN_SECONDS', 60);
const otpMaxAttempts = positiveIntegerEnvironment('OTP_MAX_ATTEMPTS', 5);
const smsProvider = (process.env.OTP_SMS_PROVIDER ?? '').trim().toLowerCase();
const twilioRequestTimeoutMs = smsProvider === 'twilio'
  ? positiveIntegerEnvironment('TWILIO_REQUEST_TIMEOUT_MS', 10_000)
  : 10_000;
const esmsRequestTimeoutMs = smsProvider === 'esms'
  ? positiveIntegerEnvironment('ESMS_REQUEST_TIMEOUT_MS', 10_000)
  : 10_000;

if (otpMaxAttempts > 5) {
  throw new Error('OTP_MAX_ATTEMPTS must be between 1 and 5.');
}

if (otpResendCooldownSeconds > otpTtlMinutes * 60) {
  throw new Error('OTP_RESEND_COOLDOWN_SECONDS must not exceed the OTP lifetime.');
}

if (smsProvider === 'twilio' && twilioRequestTimeoutMs > MAX_SMS_REQUEST_TIMEOUT_MS) {
  throw new Error(
    `TWILIO_REQUEST_TIMEOUT_MS must be between 1 and ${MAX_SMS_REQUEST_TIMEOUT_MS} milliseconds.`,
  );
}

if (smsProvider === 'esms' && esmsRequestTimeoutMs > MAX_SMS_REQUEST_TIMEOUT_MS) {
  throw new Error(
    `ESMS_REQUEST_TIMEOUT_MS must be between 1 and ${MAX_SMS_REQUEST_TIMEOUT_MS} milliseconds.`,
  );
}

export const config = {
  port: Number(process.env.PORT ?? 5000),
  databasePath: process.env.DATABASE_PATH ?? './data/yte.db',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? './data/uploads',
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5000/api/auth/google/callback',
  },
  facebookOAuth: {
    appId: process.env.FACEBOOK_APP_ID ?? '',
    appSecret: process.env.FACEBOOK_APP_SECRET ?? '',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI ?? 'http://localhost:5000/api/auth/facebook/callback',
  },
  otp: {
    smsProvider,
    hmacSecret: process.env.OTP_HMAC_SECRET ?? '',
    ttlMinutes: otpTtlMinutes,
    resendCooldownSeconds: otpResendCooldownSeconds,
    maxAttempts: otpMaxAttempts,
  },
  sms: {
    provider: smsProvider,
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? '',
      fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
      requestTimeoutMs: twilioRequestTimeoutMs,
    },
    esms: {
      apiKey: process.env.ESMS_API_KEY ?? '',
      secretKey: process.env.ESMS_SECRET_KEY ?? '',
      requestTimeoutMs: esmsRequestTimeoutMs,
    },
  },
};
