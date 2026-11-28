import type express from 'express';

// Note: 'unsafe-eval' is strictly required by self-hosted @mediapipe/face_mesh@0.4.1633559619
// (Emscripten createNamedFunction uses `new Function`), alongside 'wasm-unsafe-eval'.
export const SECURITY_CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');

export const SECURITY_PERMISSIONS_POLICY =
  'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()';

export function applyBrowserSecurityHeaders(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  res.setHeader('Content-Security-Policy', SECURITY_CSP_POLICY);
  res.setHeader('Permissions-Policy', SECURITY_PERMISSIONS_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
}

export function resolveAllowedCorsOrigin(originHeader?: string): string | null {
  if (!originHeader) return null;
  const trimmed = originHeader.trim();
  const configuredAppUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (configuredAppUrl && trimmed === configuredAppUrl) {
    return trimmed;
  }
  if (extraOrigins.includes(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]'
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateLimitBucket>();

export function checkInMemoryRateLimit(options: {
  key: string;
  windowMs: number;
  maxRequests: number;
}): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const existing = rateBuckets.get(options.key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    if (rateBuckets.size > 2000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (v.resetAt <= now) rateBuckets.delete(k);
      }
    }
    return { allowed: true };
  }

  if (existing.count >= options.maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  existing.count += 1;
  return { allowed: true };
}

export function createInMemoryRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  bucketPrefix: string;
}) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const result = checkInMemoryRateLimit({
      key: `${options.bucketPrefix}:${clientIp}`,
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
    });

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec ?? 1));
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.',
      });
      return;
    }

    next();
  };
}
