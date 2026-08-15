import { MAX_SMS_REQUEST_TIMEOUT_MS, type SmsProvider, type SmsProviderConfig } from './types';
import { EsmsSmsProvider } from './esmsSmsProvider';
import { TwilioSmsProvider } from './twilioSmsProvider';

export class SmsProviderNotConfiguredError extends Error {
  readonly code = 'OTP_NOT_CONFIGURED';
  readonly statusCode = 503;

  constructor() {
    super('Dịch vụ gửi mã OTP chưa được cấu hình.');
    this.name = 'SmsProviderNotConfiguredError';
  }
}

function nonBlank(value: string): boolean {
  return value.trim().length > 0;
}

function exactlyOneSender(config: SmsProviderConfig): boolean {
  return nonBlank(config.twilio.messagingServiceSid) !== nonBlank(config.twilio.fromNumber);
}

function validTimeout(requestTimeoutMs: number): boolean {
  return Number.isSafeInteger(requestTimeoutMs)
    && requestTimeoutMs > 0
    && requestTimeoutMs <= MAX_SMS_REQUEST_TIMEOUT_MS;
}

export function isSmsProviderConfigured(config: SmsProviderConfig): boolean {
  const provider = config.provider.trim().toLowerCase();
  if (provider === 'twilio') {
    return nonBlank(config.twilio.accountSid)
      && nonBlank(config.twilio.authToken)
      && exactlyOneSender(config)
      && validTimeout(config.twilio.requestTimeoutMs);
  }
  if (provider === 'esms') {
    return nonBlank(config.esms.apiKey)
      && nonBlank(config.esms.secretKey)
      && validTimeout(config.esms.requestTimeoutMs);
  }
  return false;
}

export function isPhoneAuthConfigured(input: {
  sms: SmsProviderConfig;
  otpHmacSecret: string;
}): boolean {
  return isSmsProviderConfigured(input.sms) && Buffer.byteLength(input.otpHmacSecret, 'utf8') >= 32;
}

export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
  if (!isSmsProviderConfigured(config)) throw new SmsProviderNotConfiguredError();
  return config.provider.trim().toLowerCase() === 'esms'
    ? new EsmsSmsProvider(config.esms)
    : new TwilioSmsProvider(config.twilio);
}
