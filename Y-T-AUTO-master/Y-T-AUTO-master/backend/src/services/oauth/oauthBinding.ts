import { Request, Response } from 'express';
import { config } from '../../config';
import { OAUTH_AUTHORIZATION_STATE_TTL_MS, generateOpaqueValue, isOpaqueValue } from './oauthState';
import { OAUTH_CALLBACK_CODE_TTL_MS } from './oauthExchange';

export const OAUTH_BINDING_COOKIE_NAME = 'yte_oauth_binding';
export const OAUTH_BINDING_COOKIE_MAX_AGE_MS =
  OAUTH_AUTHORIZATION_STATE_TTL_MS + OAUTH_CALLBACK_CODE_TTL_MS;

function cookieIsSecure(): boolean {
  return new URL(config.webOrigin).protocol === 'https:';
}

export function readOAuthBinding(req: Request): string | null {
  const cookieHeader = req.headers?.cookie;
  if (typeof cookieHeader !== 'string') return null;

  const values = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${OAUTH_BINDING_COOKIE_NAME}=`))
    .map((part) => part.slice(OAUTH_BINDING_COOKIE_NAME.length + 1));

  return values.length === 1 && isOpaqueValue(values[0]) ? values[0] : null;
}

export function setOAuthBindingCookie(res: Response, binding: string): void {
  res.cookie(OAUTH_BINDING_COOKIE_NAME, binding, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieIsSecure(),
    path: '/api/auth',
    maxAge: OAUTH_BINDING_COOKIE_MAX_AGE_MS,
  });
}

export function ensureOAuthBinding(req: Request, res: Response): string {
  const binding = readOAuthBinding(req) ?? generateOpaqueValue();
  setOAuthBindingCookie(res, binding);
  return binding;
}
