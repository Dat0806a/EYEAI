import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';

interface OtpMacInput {
  secret: string;
  challengeHash: string;
  phoneE164: string;
  code: string;
}

interface VerifyOtpMacInput extends OtpMacInput {
  storedMac: string;
}

const HEX_SHA256 = /^[a-f0-9]{64}$/;

export function generateOtpCode(length = 6): string {
  if (!Number.isInteger(length) || length < 4 || length > 10) {
    throw new Error('Độ dài mã OTP phải từ 4 đến 10 ký tự.');
  }
  const upperBound = 10 ** length;
  return String(randomInt(0, upperBound)).padStart(length, '0');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createOtpMac(input: OtpMacInput): string {
  return createHmac('sha256', input.secret)
    .update(`phone-otp\0${input.challengeHash}\0${input.phoneE164}\0${input.code}`)
    .digest('hex');
}

export function verifyOtpMac(input: VerifyOtpMacInput): boolean {
  if (!HEX_SHA256.test(input.storedMac)) return false;
  const expected = Buffer.from(createOtpMac(input), 'hex');
  const stored = Buffer.from(input.storedMac, 'hex');
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}
