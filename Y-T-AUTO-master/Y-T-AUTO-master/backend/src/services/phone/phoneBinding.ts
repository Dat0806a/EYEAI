import { hashOpaqueToken } from './otpCrypto';

const OPAQUE_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isPhoneBindingToken(value: string): boolean {
  return OPAQUE_BINDING_PATTERN.test(value);
}

export interface ResolvedPhoneBinding {
  token: string;
  hash: string;
  wasCreated: boolean;
}

export function resolvePhoneBinding(
  existingToken: string | null | undefined,
  generateToken: () => string,
): ResolvedPhoneBinding {
  const existing = typeof existingToken === 'string' ? existingToken.trim() : '';
  const reusable = isPhoneBindingToken(existing);
  const token = reusable ? existing : generateToken();
  if (!isPhoneBindingToken(token)) {
    throw new Error('Phone browser binding token generation failed.');
  }
  return { token, hash: hashOpaqueToken(token), wasCreated: !reusable };
}

export function hashPhoneBinding(token: string): string {
  if (!isPhoneBindingToken(token)) {
    throw new Error('Invalid phone browser binding token.');
  }
  return hashOpaqueToken(token);
}
