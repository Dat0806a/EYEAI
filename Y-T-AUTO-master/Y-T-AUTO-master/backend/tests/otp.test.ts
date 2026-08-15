import { describe, expect, it } from '@jest/globals';
import { config } from '../src/config';
import { generateOtpCode, hashOtpCode, otpExpiresAt } from '../src/services/otp/otp';

describe('OTP helpers', () => {
  it('generates numeric OTP codes with the requested length', () => {
    for (let length = 4; length <= 10; length += 1) {
      const code = generateOtpCode(length);
      expect(code).toMatch(new RegExp(`^\\d{${length}}$`));
    }
  });

  it('rejects invalid OTP lengths', () => {
    expect(() => generateOtpCode(3)).toThrow('Độ dài mã OTP');
    expect(() => generateOtpCode(11)).toThrow('Độ dài mã OTP');
  });

  it('hashes OTP codes deterministically with SHA-256', () => {
    expect(hashOtpCode('123456')).toBe(hashOtpCode('123456'));
    expect(hashOtpCode('123456')).not.toBe(hashOtpCode('654321'));
    expect(hashOtpCode('123456')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computes expiry from the configured phone OTP TTL', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const expiry = otpExpiresAt(now);
    expect(new Date(expiry).getTime()).toBe(
      now.getTime() + config.otp.ttlMinutes * 60 * 1000,
    );
  });
});
