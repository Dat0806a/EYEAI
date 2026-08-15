export const MAX_SMS_REQUEST_TIMEOUT_MS = 120_000;

export interface TwilioSmsProviderConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  fromNumber: string;
  requestTimeoutMs: number;
}

export interface EsmsSmsProviderConfig {
  apiKey: string;
  secretKey: string;
  requestTimeoutMs: number;
}

export interface SmsProviderConfig {
  provider: string;
  twilio: TwilioSmsProviderConfig;
  esms: EsmsSmsProviderConfig;
}

export interface SendOtpInput {
  toE164: string;
  code: string;
  expiresInSeconds: number;
}

export interface SmsProvider {
  sendOtp(input: SendOtpInput): Promise<void>;
}

export class OtpDeliveryUnavailableError extends Error {
  readonly code = 'OTP_DELIVERY_UNAVAILABLE';
  readonly statusCode = 502;

  constructor() {
    super('Không thể gửi mã OTP lúc này. Vui lòng thử lại sau.');
    this.name = 'OtpDeliveryUnavailableError';
  }
}
