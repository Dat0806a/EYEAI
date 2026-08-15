// Keep deterministic tests isolated from real local integration credentials.
for (const name of [
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_REDIRECT_URI',
  'OTP_SMS_PROVIDER',
  'OTP_HMAC_SECRET',
  'OTP_TTL_MINUTES',
  'OTP_RESEND_COOLDOWN_SECONDS',
  'OTP_MAX_ATTEMPTS',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
  'TWILIO_REQUEST_TIMEOUT_MS',
  'ESMS_API_KEY',
  'ESMS_SECRET_KEY',
  'ESMS_REQUEST_TIMEOUT_MS',
]) {
  process.env[name] = name === 'OTP_TTL_MINUTES'
    ? '5'
    : name === 'OTP_RESEND_COOLDOWN_SECONDS'
      ? '60'
      : name === 'OTP_MAX_ATTEMPTS'
        ? '5'
        : name === 'TWILIO_REQUEST_TIMEOUT_MS' || name === 'ESMS_REQUEST_TIMEOUT_MS'
          ? '10000'
        : '';
}
