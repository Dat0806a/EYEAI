import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, jest } from '@jest/globals';
import {
  createOAuthCallbackRateLimit,
  createOAuthLinkRateLimit,
  createOAuthLoginRateLimit,
  FixedWindowRateLimiter,
  OAUTH_CALLBACK_RATE_LIMIT,
  OAUTH_CALLBACK_RATE_WINDOW_MS,
  OAUTH_LINK_IP_RATE_LIMIT,
  OAUTH_LINK_PRINCIPAL_RATE_LIMIT,
  OAUTH_LINK_RATE_WINDOW_MS,
  OAUTH_LOGIN_RATE_LIMIT,
  OAUTH_LOGIN_RATE_WINDOW_MS,
} from '../src/middleware/oauthRateLimit';
import type { AuthedRequest } from '../src/middleware/auth';

type MockResponse = Response & { status: jest.Mock; json: jest.Mock };

function createResponse(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function createRequest(ip: string, forwardedFor?: string, userId?: string): Request {
  return {
    ip,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress: ip },
    userId,
  } as unknown as Request;
}

describe('OAuth login start rate limiting', () => {
  it('allows 30 requests per minute for one IP and safely rejects the next request', () => {
    let now = 1_000;
    const middleware = createOAuthLoginRateLimit({ now: () => now });
    const req = createRequest('203.0.113.10');
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    for (let index = 0; index < OAUTH_LOGIN_RATE_LIMIT; index += 1) {
      middleware(req, res, next);
      now += 1;
    }
    middleware(req, res, next);

    expect(OAUTH_LOGIN_RATE_WINDOW_MS).toBe(60_000);
    expect(next).toHaveBeenCalledTimes(OAUTH_LOGIN_RATE_LIMIT);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: expect.any(String),
      },
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/token|code=[A-Za-z0-9_-]+/i);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('uses Express IP/socket identity instead of arbitrary X-Forwarded-For values', () => {
    const middleware = createOAuthLoginRateLimit({ limit: 1, now: () => 5_000 });
    const next = jest.fn() as unknown as NextFunction;

    middleware(createRequest('198.51.100.8', '1.1.1.1'), createResponse(), next);
    const rejected = createResponse();
    middleware(createRequest('198.51.100.8', '8.8.8.8'), rejected, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(rejected.status).toHaveBeenCalledWith(429);
  });

  it('resets deterministically after the fixed window and prunes expired clients', () => {
    let now = 10_000;
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => now,
    });

    expect(limiter.consume('client-a')).toBe(true);
    expect(limiter.consume('client-a')).toBe(false);
    expect(limiter.entryCount).toBe(1);

    now += 1_001;
    expect(limiter.consume('client-b')).toBe(true);
    expect(limiter.entryCount).toBe(1);
    expect(limiter.consume('client-a')).toBe(true);
  });

  it('keeps the active-client map within its configured hard bound', () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 2,
      now: () => 20_000,
    });

    expect(limiter.consume('client-a')).toBe(true);
    expect(limiter.consume('client-b')).toBe(true);
    expect(limiter.consume('client-c')).toBe(true);
    expect(limiter.entryCount).toBe(2);
  });
});

describe('OAuth callback rate limiting', () => {
  it('allows 60 callbacks per minute for one IP and safely rejects the next request', () => {
    let now = 30_000;
    const middleware = createOAuthCallbackRateLimit({ now: () => now });
    const req = createRequest('203.0.113.20');
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    for (let index = 0; index < OAUTH_CALLBACK_RATE_LIMIT; index += 1) {
      middleware(req, res, next);
      now += 1;
    }
    middleware(req, res, next);

    expect(OAUTH_CALLBACK_RATE_LIMIT).toBe(60);
    expect(OAUTH_CALLBACK_RATE_WINDOW_MS).toBe(60_000);
    expect(next).toHaveBeenCalledTimes(OAUTH_CALLBACK_RATE_LIMIT);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: expect.any(String),
      },
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/token|code=[A-Za-z0-9_-]+/i);
  });
});

describe('authenticated OAuth link start rate limiting', () => {
  it('enforces one shared principal budget across IPs and providers', () => {
    let now = 40_000;
    const middleware = createOAuthLinkRateLimit({ now: () => now });
    const next = jest.fn() as unknown as NextFunction;

    for (let index = 0; index < OAUTH_LINK_PRINCIPAL_RATE_LIMIT; index += 1) {
      middleware(
        createRequest(`203.0.113.${index + 1}`, undefined, 'user-1') as AuthedRequest,
        createResponse(),
        next,
      );
      now += 1;
    }
    const rejected = createResponse();
    middleware(
      createRequest('198.51.100.200', undefined, 'user-1') as AuthedRequest,
      rejected,
      next,
    );

    expect(OAUTH_LINK_RATE_WINDOW_MS).toBe(60_000);
    expect(next).toHaveBeenCalledTimes(OAUTH_LINK_PRINCIPAL_RATE_LIMIT);
    expect(rejected.status).toHaveBeenCalledWith(429);
    expect(rejected.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: 'OAUTH_RATE_LIMITED',
        message: expect.any(String),
      },
    });
  });

  it('enforces an IP ceiling across authenticated principals', () => {
    const middleware = createOAuthLinkRateLimit({ now: () => 50_000 });
    const next = jest.fn() as unknown as NextFunction;

    for (let index = 0; index < OAUTH_LINK_IP_RATE_LIMIT; index += 1) {
      middleware(
        createRequest('203.0.113.50', undefined, `user-${index}`) as AuthedRequest,
        createResponse(),
        next,
      );
    }
    const rejected = createResponse();
    middleware(
      createRequest('203.0.113.50', undefined, 'last-user') as AuthedRequest,
      rejected,
      next,
    );

    expect(next).toHaveBeenCalledTimes(OAUTH_LINK_IP_RATE_LIMIT);
    expect(rejected.status).toHaveBeenCalledWith(429);
  });

  it('counts a principal-rejected attempt toward its IP ceiling', () => {
    const middleware = createOAuthLinkRateLimit({
      principalLimit: 1,
      ipLimit: 2,
      now: () => 60_000,
    });
    const next = jest.fn() as unknown as NextFunction;

    middleware(createRequest('203.0.113.60', undefined, 'user-1') as AuthedRequest, createResponse(), next);
    const principalRejected = createResponse();
    middleware(
      createRequest('203.0.113.60', undefined, 'user-1') as AuthedRequest,
      principalRejected,
      next,
    );
    const ipRejected = createResponse();
    middleware(
      createRequest('203.0.113.60', undefined, 'user-2') as AuthedRequest,
      ipRejected,
      next,
    );

    expect(principalRejected.status).toHaveBeenCalledWith(429);
    expect(ipRejected.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails closed when either bounded identity map cannot admit a new active key', () => {
    const middleware = createOAuthLinkRateLimit({
      principalLimit: 10,
      ipLimit: 10,
      maxPrincipalEntries: 1,
      maxIpEntries: 1,
      now: () => 70_000,
    });
    const next = jest.fn() as unknown as NextFunction;

    middleware(createRequest('203.0.113.70', undefined, 'user-1') as AuthedRequest, createResponse(), next);
    const rejected = createResponse();
    middleware(
      createRequest('203.0.113.71', undefined, 'user-2') as AuthedRequest,
      rejected,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(rejected.status).toHaveBeenCalledWith(429);
  });
});
