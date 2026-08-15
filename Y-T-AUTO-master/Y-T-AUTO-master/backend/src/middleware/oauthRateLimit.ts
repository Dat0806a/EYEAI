import { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthedRequest } from './auth';

export const OAUTH_LOGIN_RATE_LIMIT = 30;
export const OAUTH_LOGIN_RATE_WINDOW_MS = 60_000;
export const OAUTH_CALLBACK_RATE_LIMIT = 60;
export const OAUTH_CALLBACK_RATE_WINDOW_MS = 60_000;
export const OAUTH_LOGIN_RATE_LIMIT_MAX_CLIENTS = 10_000;
export const OAUTH_LINK_PRINCIPAL_RATE_LIMIT = 10;
export const OAUTH_LINK_IP_RATE_LIMIT = 30;
export const OAUTH_LINK_RATE_WINDOW_MS = 60_000;
export const OAUTH_LINK_RATE_LIMIT_MAX_PRINCIPALS = 10_000;
export const OAUTH_LINK_RATE_LIMIT_MAX_IPS = 10_000;

interface FixedWindowEntry {
  count: number;
  windowStartedAt: number;
}

interface FixedWindowRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  maxEntries?: number;
  now?: () => number;
  rejectNewKeysAtCapacity?: boolean;
}

interface OAuthLinkRateLimiterOptions {
  principalLimit?: number;
  ipLimit?: number;
  windowMs?: number;
  maxPrincipalEntries?: number;
  maxIpEntries?: number;
  now?: () => number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, FixedWindowEntry>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly rejectNewKeysAtCapacity: boolean;

  constructor(options: FixedWindowRateLimiterOptions = {}) {
    this.limit = options.limit ?? OAUTH_LOGIN_RATE_LIMIT;
    this.windowMs = options.windowMs ?? OAUTH_LOGIN_RATE_WINDOW_MS;
    this.maxEntries = options.maxEntries ?? OAUTH_LOGIN_RATE_LIMIT_MAX_CLIENTS;
    this.now = options.now ?? Date.now;
    this.rejectNewKeysAtCapacity = options.rejectNewKeysAtCapacity ?? false;
  }

  get entryCount(): number {
    return this.entries.size;
  }

  consume(clientKey: string): boolean {
    const now = this.now();
    this.pruneExpired(now);
    const entry = this.entries.get(clientKey);
    if (entry) {
      if (entry.count >= this.limit) return false;
      entry.count += 1;
      return true;
    }

    if (this.entries.size >= this.maxEntries) {
      if (this.rejectNewKeysAtCapacity) return false;
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.entries.set(clientKey, { count: 1, windowStartedAt: now });
    return true;
  }

  private pruneExpired(now: number): void {
    for (const [clientKey, entry] of this.entries) {
      if (now - entry.windowStartedAt < this.windowMs) break;
      this.entries.delete(clientKey);
    }
  }
}

export function createOAuthLoginRateLimit(
  options: FixedWindowRateLimiterOptions = {},
): RequestHandler {
  const limiter = new FixedWindowRateLimiter(options);
  return function oauthLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    if (limiter.consume(clientKey)) {
      next();
      return;
    }
    res.status(429).json({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: 'Too many OAuth login attempts. Please try again shortly.',
      },
    });
  };
}

export const oauthLoginRateLimit = createOAuthLoginRateLimit();

export function createOAuthCallbackRateLimit(
  options: FixedWindowRateLimiterOptions = {},
): RequestHandler {
  const limiter = new FixedWindowRateLimiter({
    ...options,
    limit: options.limit ?? OAUTH_CALLBACK_RATE_LIMIT,
    windowMs: options.windowMs ?? OAUTH_CALLBACK_RATE_WINDOW_MS,
  });
  return function oauthCallbackRateLimit(req: Request, res: Response, next: NextFunction): void {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    if (limiter.consume(clientKey)) {
      next();
      return;
    }
    res.status(429).json({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: 'Too many OAuth callback attempts. Please try again shortly.',
      },
    });
  };
}

export const oauthCallbackRateLimit = createOAuthCallbackRateLimit();

export function createOAuthLinkRateLimit(
  options: OAuthLinkRateLimiterOptions = {},
): RequestHandler {
  const principalLimiter = new FixedWindowRateLimiter({
    limit: options.principalLimit ?? OAUTH_LINK_PRINCIPAL_RATE_LIMIT,
    windowMs: options.windowMs ?? OAUTH_LINK_RATE_WINDOW_MS,
    maxEntries: options.maxPrincipalEntries ?? OAUTH_LINK_RATE_LIMIT_MAX_PRINCIPALS,
    now: options.now,
    rejectNewKeysAtCapacity: true,
  });
  const ipLimiter = new FixedWindowRateLimiter({
    limit: options.ipLimit ?? OAUTH_LINK_IP_RATE_LIMIT,
    windowMs: options.windowMs ?? OAUTH_LINK_RATE_WINDOW_MS,
    maxEntries: options.maxIpEntries ?? OAUTH_LINK_RATE_LIMIT_MAX_IPS,
    now: options.now,
    rejectNewKeysAtCapacity: true,
  });
  return function oauthLinkRateLimit(
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid authenticated session is required.',
        },
      });
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const principalAllowed = principalLimiter.consume(req.userId);
    const ipAllowed = ipLimiter.consume(ip);
    if (principalAllowed && ipAllowed) {
      next();
      return;
    }
    res.status(429).json({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: 'Too many OAuth account-linking attempts. Please try again shortly.',
      },
    });
  };
}

export const oauthLinkRateLimit = createOAuthLinkRateLimit();
