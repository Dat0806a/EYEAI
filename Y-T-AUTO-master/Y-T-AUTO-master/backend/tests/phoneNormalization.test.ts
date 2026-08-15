import { describe, expect, it } from '@jest/globals';
import {
  InvalidPhoneNumberError,
  normalizePhoneNumber,
} from '../src/services/phone/normalizePhone';

describe('phone number normalization', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['0912-345-678', '+84912345678'],
    ['+84 912 345 678', '+84912345678'],
    ['84912345678', '+84912345678'],
  ])('normalizes %s to canonical E.164', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it('preserves a valid explicit non-Vietnamese international number', () => {
    expect(normalizePhoneNumber('+12025550123')).toBe('+12025550123');
  });

  it.each([
    '',
    '   ',
    '09123',
    '091234567890123456789',
    '+84+912345678',
    '0912abc678',
    '0912345678 ext 2',
    '++84912345678',
  ])('rejects invalid phone input %p', (input) => {
    expect(() => normalizePhoneNumber(input)).toThrow(InvalidPhoneNumberError);
    expect(() => normalizePhoneNumber(input)).toThrow('Số điện thoại không hợp lệ.');
  });

  it('rejects non-string and excessively long input before parsing', () => {
    expect(() => normalizePhoneNumber(null as unknown as string)).toThrow(InvalidPhoneNumberError);
    expect(() => normalizePhoneNumber('0'.repeat(65))).toThrow(InvalidPhoneNumberError);
  });
});
