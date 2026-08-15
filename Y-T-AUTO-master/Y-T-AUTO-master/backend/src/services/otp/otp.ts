import { createHash, randomInt } from 'crypto';
import { config } from '../../config';
import { isPhoneAuthConfigured } from '../sms/providerFactory';

export function isOtpConfigured(): boolean {
  return isPhoneAuthConfigured({ sms: config.sms, otpHmacSecret: config.otp.hmacSecret });
}

export function generateOtpCode(length = 6): string {
  if (length < 4 || length > 10) {
    throw new Error('Độ dài mã OTP phải từ 4 đến 10 ký tự.');
  }
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(randomInt(min, max + 1));
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function otpExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + config.otp.ttlMinutes * 60 * 1000).toISOString();
}
