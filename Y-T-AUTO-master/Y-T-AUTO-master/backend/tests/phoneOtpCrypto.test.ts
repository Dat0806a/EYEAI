import { describe, expect, it, jest } from '@jest/globals';
import { randomInt } from 'crypto';
import {
  createOtpMac,
  generateOpaqueToken,
  generateOtpCode,
  hashOpaqueToken,
  verifyOtpMac,
} from '../src/services/phone/otpCrypto';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, randomInt: jest.fn(actual.randomInt) };
});

const mockedRandomInt = jest.mocked(randomInt);

describe('phone OTP cryptography', () => {
  it('generates a six-digit OTP and preserves leading zeroes', () => {
    mockedRandomInt.mockReturnValueOnce(42);

    expect(generateOtpCode()).toBe('000042');
    expect(mockedRandomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it('supports bounded numeric OTP lengths only', () => {
    mockedRandomInt.mockReturnValueOnce(7);
    expect(generateOtpCode(4)).toBe('0007');
    expect(() => generateOtpCode(3)).toThrow('Độ dài mã OTP');
    expect(() => generateOtpCode(11)).toThrow('Độ dài mã OTP');
  });

  it('generates opaque browser-safe challenge values and stores only hashes', () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashOpaqueToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(token)).not.toBe(token);
  });

  it('domain-separates OTP MACs by secret, challenge, phone, and code', () => {
    const base = {
      secret: 'test-phone-otp-hmac-secret-that-is-long-enough',
      challengeHash: 'a'.repeat(64),
      phoneE164: '+84912345678',
      code: '123456',
    };
    const mac = createOtpMac(base);

    expect(mac).toMatch(/^[a-f0-9]{64}$/);
    expect(createOtpMac(base)).toBe(mac);
    expect(createOtpMac({ ...base, secret: `${base.secret}-other` })).not.toBe(mac);
    expect(createOtpMac({ ...base, challengeHash: 'b'.repeat(64) })).not.toBe(mac);
    expect(createOtpMac({ ...base, phoneE164: '+84987654321' })).not.toBe(mac);
    expect(createOtpMac({ ...base, code: '654321' })).not.toBe(mac);
  });

  it('verifies a stored MAC without accepting malformed values', () => {
    const input = {
      secret: 'test-phone-otp-hmac-secret-that-is-long-enough',
      challengeHash: 'c'.repeat(64),
      phoneE164: '+84912345678',
      code: '123456',
    };
    const storedMac = createOtpMac(input);

    expect(verifyOtpMac({ ...input, storedMac })).toBe(true);
    expect(verifyOtpMac({ ...input, code: '123457', storedMac })).toBe(false);
    expect(verifyOtpMac({ ...input, storedMac: 'not-a-mac' })).toBe(false);
  });
});
