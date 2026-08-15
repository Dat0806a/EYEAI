import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export class InvalidPhoneNumberError extends Error {
  readonly code = 'INVALID_PHONE_NUMBER';
  readonly statusCode = 400;

  constructor() {
    super('Số điện thoại không hợp lệ.');
    this.name = 'InvalidPhoneNumberError';
  }
}

const MAX_PHONE_INPUT_LENGTH = 64;
const SIMPLE_PHONE_INPUT = /^\+?[0-9\s-]+$/;

export function normalizePhoneNumber(input: string): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (
    !value
    || value.length > MAX_PHONE_INPUT_LENGTH
    || !SIMPLE_PHONE_INPUT.test(value)
  ) {
    throw new InvalidPhoneNumberError();
  }

  const compact = value.replace(/[\s-]+/g, '');
  const parseInput = compact.startsWith('84') && !compact.startsWith('+')
    ? `+${compact}`
    : compact;
  const phone = parsePhoneNumberFromString(parseInput, 'VN');
  if (!phone?.isValid()) throw new InvalidPhoneNumberError();
  return phone.number;
}
