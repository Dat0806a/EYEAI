import type { Request, Response } from 'express';
import { config } from '../config';
import type { AuthedRequest } from '../middleware/auth';
import { getPhoneAccountStatus } from '../repositories/phoneAuthRepository';
import { getPhoneAuthRuntime } from '../services/phone/phoneAuthRuntime';
import { isPhoneBindingToken } from '../services/phone/phoneBinding';

export const PHONE_BINDING_COOKIE_NAME = 'yte_phone_binding';

const PHONE_ERROR_MESSAGES: Record<string, string> = {
  LOGIN_REQUIRED: 'Tài khoản này đã được đăng ký. Vui lòng đăng nhập.',
  REGISTRATION_REQUIRED: 'Bạn chưa có tài khoản. Hãy đăng ký.',
  INVALID_PHONE_NUMBER: 'Số điện thoại không hợp lệ.',
  OTP_NOT_CONFIGURED: 'Dịch vụ gửi mã OTP chưa được cấu hình.',
  OTP_RESEND_COOLDOWN: 'Vui lòng chờ trước khi gửi lại mã OTP.',
  PHONE_RATE_LIMITED: 'Bạn đã yêu cầu quá nhiều mã OTP. Vui lòng thử lại sau.',
  PHONE_RATE_LIMIT_CAPACITY: 'Dịch vụ xác thực số điện thoại tạm thời quá tải. Vui lòng thử lại sau.',
  OTP_INVALID: 'Mã OTP không đúng.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã nhập sai mã OTP quá số lần cho phép.',
  OTP_INVALID_OR_EXPIRED: 'Yêu cầu OTP không hợp lệ hoặc đã hết hạn.',
  PHONE_IDENTITY_CONFLICT: 'Số điện thoại không thể liên kết với tài khoản này.',
  OTP_DELIVERY_UNAVAILABLE: 'Không thể gửi mã OTP lúc này. Vui lòng thử lại sau.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản.',
};

function cookieIsSecure(): boolean {
  return new URL(config.webOrigin).protocol === 'https:';
}

function setNoStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function readPhoneBinding(req: Request): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  const values = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${PHONE_BINDING_COOKIE_NAME}=`))
    .map((part) => part.slice(PHONE_BINDING_COOKIE_NAME.length + 1));
  return values.length === 1 && isPhoneBindingToken(values[0]) ? values[0] : null;
}

function setPhoneBindingCookie(res: Response, binding: string, maxAge: number): void {
  res.cookie(PHONE_BINDING_COOKIE_NAME, binding, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieIsSecure(),
    path: '/api/auth/phone',
    maxAge,
  });
}

function sendPhoneError(res: Response, err: unknown): void {
  setNoStore(res);
  const candidate = err as { code?: unknown; statusCode?: unknown; retryAfterMs?: unknown } | null;
  const code = typeof candidate?.code === 'string' && PHONE_ERROR_MESSAGES[candidate.code]
    ? candidate.code
    : 'INTERNAL_ERROR';
  const statusCode = code === 'INTERNAL_ERROR'
    ? 500
    : typeof candidate?.statusCode === 'number' ? candidate.statusCode : 400;
  if (typeof candidate?.retryAfterMs === 'number' && candidate.retryAfterMs > 0) {
    res.set('Retry-After', String(Math.ceil(candidate.retryAfterMs / 1000)));
  }
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message: code === 'INTERNAL_ERROR'
        ? 'Không thể hoàn tất xác thực số điện thoại.'
        : PHONE_ERROR_MESSAGES[code],
    },
  });
}

async function requestOtp(
  req: Request | AuthedRequest,
  res: Response,
  purpose: 'LOGIN' | 'REGISTER' | 'LINK',
): Promise<void> {
  setNoStore(res);
  try {
    const service = await getPhoneAuthRuntime();
    const input = {
      phone: (req.body as { phone: string }).phone,
      ip: requestIp(req),
      browserBinding: readPhoneBinding(req),
    };
    const result = purpose === 'LOGIN'
      ? await service.requestLoginOtp(input)
      : purpose === 'REGISTER'
        ? await service.requestRegisterOtp(input)
        : await service.requestLinkOtp({ ...input, userId: (req as AuthedRequest).userId as string });
    setPhoneBindingCookie(res, result.browserBinding, config.otp.ttlMinutes * 60_000);
    res.status(202).json({
      success: true,
      data: {
        challengeToken: result.challengeToken,
        expiresAt: new Date(result.expiresAt).toISOString(),
        resendAvailableAt: new Date(result.resendAvailableAt).toISOString(),
      },
      error: null,
    });
  } catch (error) {
    sendPhoneError(res, error);
  }
}

async function verifyOtp(
  req: Request | AuthedRequest,
  res: Response,
  purpose: 'LOGIN' | 'REGISTER' | 'LINK',
): Promise<void> {
  setNoStore(res);
  try {
    const service = await getPhoneAuthRuntime();
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const input = {
      challengeToken,
      code,
      ip: requestIp(req),
      browserBinding: readPhoneBinding(req) ?? '',
    };
    if (purpose !== 'LINK') {
      const session = purpose === 'LOGIN'
        ? await service.verifyLoginOtp(input)
        : await service.verifyRegisterOtp(input);
      res.json({ success: true, data: session, error: null });
      return;
    }
    const userId = (req as AuthedRequest).userId as string;
    await service.verifyLinkOtp({ ...input, userId });
    const status = await getPhoneAccountStatus(userId);
    res.json({ success: true, data: status, error: null });
  } catch (error) {
    sendPhoneError(res, error);
  }
}

export async function requestPhoneLoginOtp(req: Request, res: Response): Promise<void> {
  await requestOtp(req, res, 'LOGIN');
}

export async function verifyPhoneLoginOtp(req: Request, res: Response): Promise<void> {
  await verifyOtp(req, res, 'LOGIN');
}

export async function requestPhoneRegisterOtp(req: Request, res: Response): Promise<void> {
  await requestOtp(req, res, 'REGISTER');
}

export async function verifyPhoneRegisterOtp(req: Request, res: Response): Promise<void> {
  await verifyOtp(req, res, 'REGISTER');
}

export async function requestPhoneLinkOtp(req: AuthedRequest, res: Response): Promise<void> {
  await requestOtp(req, res, 'LINK');
}

export async function verifyPhoneLinkOtp(req: AuthedRequest, res: Response): Promise<void> {
  await verifyOtp(req, res, 'LINK');
}

export async function getPhoneStatus(req: AuthedRequest, res: Response): Promise<void> {
  setNoStore(res);
  try {
    const status = await getPhoneAccountStatus(req.userId as string);
    res.json({ success: true, data: status, error: null });
  } catch (error) {
    sendPhoneError(res, error);
  }
}
