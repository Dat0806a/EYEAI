import { FormEvent, useEffect, useState } from 'react';
import { requestPhoneLinkOtp, requestPhoneLoginOtp, requestPhoneRegisterOtp } from '../services/api';
import type { PhoneOtpChallenge } from '../types';
import { Alert, Button, Input } from './ui';

type PhoneOtpMode = 'login' | 'register' | 'link';

interface PhoneOtpFlowProps {
  mode: PhoneOtpMode;
  onVerify: (
    challengeToken: string,
    code: string,
  ) => Promise<boolean | { hasProfile: boolean } | void>;
  onSuccess?: (result: boolean | { hasProfile: boolean } | void) => void;
}

const SAFE_ERRORS: Record<string, string> = {
  INVALID_PHONE_NUMBER: 'Số điện thoại không hợp lệ. Vui lòng kiểm tra và thử lại.',
  OTP_INVALID: 'Mã OTP không đúng. Vui lòng kiểm tra và thử lại.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn. Vui lòng gửi mã mới.',
  OTP_INVALID_OR_EXPIRED: 'Yêu cầu xác minh không hợp lệ hoặc đã hết hạn. Vui lòng gửi mã mới.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi mã mới.',
  OTP_RESEND_COOLDOWN: 'Vui lòng chờ hết thời gian đếm ngược trước khi gửi lại mã.',
  PHONE_RATE_LIMITED: 'Bạn thao tác quá nhiều lần. Vui lòng chờ rồi thử lại.',
  PHONE_RATE_LIMIT_CAPACITY: 'Dịch vụ xác minh đang bận. Vui lòng thử lại sau.',
  OTP_DELIVERY_UNAVAILABLE: 'Chưa thể gửi mã OTP lúc này. Vui lòng thử lại sau.',
  OTP_NOT_CONFIGURED: 'Tính năng xác minh số điện thoại chưa sẵn sàng.',
  PHONE_IDENTITY_CONFLICT: 'Số điện thoại này không thể liên kết với tài khoản hiện tại.',
  REGISTRATION_REQUIRED: 'Bạn chưa có tài khoản. Hãy đăng ký.',
  LOGIN_REQUIRED: 'Tài khoản này đã được đăng ký. Vui lòng đăng nhập.',
};

function phoneErrorDetails(error: unknown): { code: string | null; message: string; retryAfterSeconds: number } {
  const response = (error as {
    response?: {
      data?: { error?: { code?: unknown } };
      headers?: Record<string, unknown>;
    };
  } | null)?.response;
  const code = response?.data?.error?.code;
  const retryAfterValue = response?.headers?.['retry-after'];
  const parsedRetryAfter = typeof retryAfterValue === 'number'
    ? retryAfterValue
    : typeof retryAfterValue === 'string' && /^\d+$/.test(retryAfterValue.trim())
      ? Number(retryAfterValue)
      : 0;
  return {
    code: typeof code === 'string' ? code : null,
    message: typeof code === 'string' && SAFE_ERRORS[code]
      ? SAFE_ERRORS[code]
      : 'Đã xảy ra lỗi khi xác minh số điện thoại. Vui lòng thử lại.',
    retryAfterSeconds: Number.isSafeInteger(parsedRetryAfter) && parsedRetryAfter > 0
      ? parsedRetryAfter
      : 0,
  };
}

function secondsUntil(timestamp: string): number {
  return Math.max(0, Math.ceil((Date.parse(timestamp) - Date.now()) / 1000));
}

export function PhoneOtpFlow({ mode, onVerify, onSuccess }: PhoneOtpFlowProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<PhoneOtpChallenge | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [retryAvailableAt, setRetryAvailableAt] = useState<number | null>(null);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guidanceTarget, setGuidanceTarget] = useState<'login' | 'register' | null>(null);

  useEffect(() => {
    if (!challenge && retryAvailableAt === null) return undefined;
    const updateCountdown = () => {
      setResendSeconds(challenge ? secondsUntil(challenge.resendAvailableAt) : 0);
      setRetrySeconds(retryAvailableAt === null
        ? 0
        : Math.max(0, Math.ceil((retryAvailableAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [challenge, retryAvailableAt]);

  const applyError = (caught: unknown) => {
    const details = phoneErrorDetails(caught);
    setError(details.message);
    setGuidanceTarget(details.code === 'REGISTRATION_REQUIRED'
      ? 'register'
      : details.code === 'LOGIN_REQUIRED'
        ? 'login'
        : null);
    setRetryAvailableAt(details.retryAfterSeconds > 0
      ? Date.now() + details.retryAfterSeconds * 1_000
      : null);
  };

  const requestOtp = async () => {
    if (retrySeconds > 0) return;
    setError('');
    setGuidanceTarget(null);
    setLoading(true);
    try {
      const nextChallenge = mode === 'login'
        ? await requestPhoneLoginOtp(phone)
        : mode === 'register'
          ? await requestPhoneRegisterOtp(phone)
          : await requestPhoneLinkOtp(phone);
      setChallenge(nextChallenge);
      setCode('');
      setRetryAvailableAt(null);
      setResendSeconds(secondsUntil(nextChallenge.resendAvailableAt));
    } catch (requestError) {
      applyError(requestError);
    } finally {
      setLoading(false);
    }
  };

  const onRequestSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await requestOtp();
  };

  const onVerifySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setError('');
    setGuidanceTarget(null);
    setLoading(true);
    try {
      const verified = await onVerify(challenge.challengeToken, code);
      if (verified !== false) onSuccess?.(verified);
    } catch (verifyError) {
      applyError(verifyError);
    } finally {
      setLoading(false);
    }
  };

  const changePhone = () => {
    setChallenge(null);
    setCode('');
    setError('');
    setGuidanceTarget(null);
  };

  if (!challenge) {
    return (
      <form onSubmit={onRequestSubmit} className="mt-5 space-y-4">
        {error ? (
          <Alert>
            <div role="alert">{error}</div>
            {guidanceTarget ? (
              <a
                href={guidanceTarget === 'register' ? '/register' : '/login'}
                className="mt-2 inline-block font-semibold underline"
              >
                {guidanceTarget === 'register' ? 'Đăng ký' : 'Đăng nhập'}
              </a>
            ) : null}
          </Alert>
        ) : null}
        <div>
          <label htmlFor={`phone-${mode}`} className="mb-1 block text-sm font-medium text-navy">
            Số điện thoại
          </label>
          <Input
            id={`phone-${mode}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0912 345 678"
            disabled={loading}
          />
          <p className="mt-2 text-xs text-gray-500">Hỗ trợ số Việt Nam và định dạng quốc tế có mã quốc gia.</p>
        </div>
        <Button type="submit" className="w-full" disabled={loading || retrySeconds > 0 || !phone.trim()}>
          {loading
            ? 'Đang gửi mã...'
            : retrySeconds > 0
              ? `Thử lại sau ${retrySeconds} giây`
              : mode === 'link' ? 'Gửi mã xác minh' : 'Gửi mã OTP'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerifySubmit} className="mt-5 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-navy">Nhập mã xác minh</h3>
        <p className="mt-1 text-sm text-gray-500">
          Mã gồm 6 chữ số đã được gửi đến <span className="font-semibold text-navy">{phone}</span>.
        </p>
      </div>
      {error ? (
        <Alert>
          <div role="alert">{error}</div>
          {guidanceTarget ? (
            <a
              href={guidanceTarget === 'register' ? '/register' : '/login'}
              className="mt-2 inline-block font-semibold underline"
            >
              {guidanceTarget === 'register' ? 'Đăng ký' : 'Đăng nhập'}
            </a>
          ) : null}
        </Alert>
      ) : null}
      <div>
        <label htmlFor={`otp-${mode}`} className="mb-1 block text-sm font-medium text-navy">Mã OTP</label>
        <Input
          id={`otp-${mode}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading || retrySeconds > 0 || code.length !== 6}>
        {loading
          ? 'Đang xác minh...'
          : retrySeconds > 0
            ? `Thử xác minh lại sau ${retrySeconds} giây`
            : mode === 'login'
              ? 'Xác minh và đăng nhập'
              : mode === 'register'
                ? 'Xác minh và đăng ký'
                : 'Xác minh và liên kết'}
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="ghost"
          disabled={loading || Math.max(resendSeconds, retrySeconds) > 0}
          onClick={() => void requestOtp()}
          className="w-full"
        >
          {Math.max(resendSeconds, retrySeconds) > 0
            ? `Gửi lại sau ${Math.max(resendSeconds, retrySeconds)} giây`
            : 'Gửi lại mã'}
        </Button>
        <Button type="button" variant="ghost" disabled={loading} onClick={changePhone} className="w-full">
          Đổi số điện thoại
        </Button>
      </div>
    </form>
  );
}
