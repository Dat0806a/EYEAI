import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthErrorMessage } from '../../lib/authHeaders';
import { speakVietnamese } from '../../utils/speech';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { MfaNumericKeypad } from './MfaNumericKeypad';

export interface LoginFormProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
  onAuthStart?: () => void;
  onPendingEmailOtpChange?: (pending: boolean) => void;
}

type LoginSubMode = 'password' | 'email_otp' | 'forgot_password';

function formatEmailDeliveryError(err: unknown, fallback: string): string {
  const raw = getAuthErrorMessage(err, '');
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('429')) {
    return 'Bạn vừa yêu cầu gửi email quá nhanh. Vui lòng đợi khoảng 60 giây rồi thử lại.';
  }
  if (lower.includes('smtp') || lower.includes('mail') || lower.includes('unexpected_failure')) {
    return 'Không thể gửi email xác thực từ máy chủ. Nếu chưa cấu hình Custom SMTP trên Supabase Dashboard, tính năng gửi email OTP/khôi phục có thể bị hạn chế.';
  }
  if (lower.includes('signups not allowed') || lower.includes('user not found')) {
    return 'Không tìm thấy tài khoản khớp với email này hoặc tài khoản chưa được đăng ký.';
  }
  if (lower.includes('expired') || lower.includes('invalid') || lower.includes('token')) {
    return 'Mã OTP không chính xác hoặc đã hết hạn.';
  }
  return raw || fallback;
}

export function LoginForm({
  onSuccess,
  onSwitchToRegister,
  onAuthStart,
  onPendingEmailOtpChange,
}: LoginFormProps) {
  const [subMode, setSubMode] = useState<LoginSubMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email OTP state (AAL1 passwordless login)
  const [otpSent, setOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');

  // Forgot password recovery state
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryOtpCode, setRecoveryOtpCode] = useState('');

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const switchSubMode = (next: LoginSubMode) => {
    setErrorMsg(null);
    setStatusNotice(null);
    setOtpSent(false);
    setEmailOtpCode('');
    setRecoverySent(false);
    setRecoveryOtpCode('');
    onPendingEmailOtpChange?.(false);
    setSubMode(next);
  };

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Vui lòng nhập địa chỉ email.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return 'Địa chỉ email không hợp lệ.';
    return null;
  };

  const handlePasswordLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    setStatusNotice(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }
    if (!password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    onAuthStart?.();
    onPendingEmailOtpChange?.(true);
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
      const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
      const canStatelessVerify =
        import.meta.env.MODE !== 'test' &&
        Boolean(rawUrl) &&
        Boolean(rawKey) &&
        !rawUrl.includes('placeholder-eyetalk.supabase.co');

      let passwordVerified = false;
      if (canStatelessVerify) {
        // Verify password directly without mutating the shared client session
        // (avoids triggering AuthContext hydrate/listFactors before Email OTP completes).
        const res = await fetch(`${rawUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: rawKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
          }),
        });
        const payload = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
          const msg =
            (typeof payload?.error_description === 'string' && payload.error_description) ||
            (typeof payload?.msg === 'string' && payload.msg) ||
            (typeof payload?.error === 'string' && payload.error) ||
            'Invalid login credentials';
          throw new Error(msg);
        }
        passwordVerified = Boolean(payload?.user || payload?.access_token);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        if (data.user) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          passwordVerified = true;
        }
      }

      if (passwordVerified) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: false,
          },
        });

        setSubMode('email_otp');
        setOtpSent(true);
        setEmailOtpCode('');

        if (otpError) {
          setErrorMsg(
            formatEmailDeliveryError(
              otpError,
              'Mật khẩu hợp lệ nhưng không thể gửi mã OTP qua email. Vui lòng thử gửi lại.'
            )
          );
          return;
        }

        setCooldownSeconds(60);
        setStatusNotice(
          `Mật khẩu hợp lệ. Đã gửi mã OTP 6 chữ số tới ${trimmedEmail}. Vui lòng kiểm tra hộp thư (kể cả Spam) và nhập mã để hoàn tất đăng nhập.`
        );
        speakVietnamese('Đã gửi mã OTP tới email của bạn');
      }
    } catch (err: unknown) {
      onPendingEmailOtpChange?.(false);
      const rawMsg = err instanceof Error ? err.message : '';
      if (
        rawMsg.includes('Invalid login credentials') ||
        rawMsg.includes('invalid_grant') ||
        rawMsg.includes('invalid_credentials')
      ) {
        setErrorMsg('Email hoặc mật khẩu chưa chính xác.');
      } else if (rawMsg.includes('Email not confirmed')) {
        setErrorMsg('Email chưa được xác nhận. Vui lòng kiểm tra hộp thư hoặc xác thực OTP.');
      } else {
        setErrorMsg('Đăng nhập không thành công. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setStatusNotice(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
        },
      });
      if (error) throw error;

      setOtpSent(true);
      setCooldownSeconds(60);
      setStatusNotice(
        `Đã gửi yêu cầu Email OTP tới ${email.trim()}. Lưu ý: Email OTP là đăng nhập bước 1 (AAL1), không thay thế mã Google Authenticator (AAL2).`
      );
    } catch (err: unknown) {
      setErrorMsg(formatEmailDeliveryError(err, 'Không thể gửi Email OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setStatusNotice(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }

    const sanitized = emailOtpCode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(sanitized)) {
      setErrorMsg('Vui lòng nhập đủ 6 chữ số Email OTP.');
      return;
    }

    onAuthStart?.();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: sanitized,
        type: 'email',
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error('Không khởi tạo được phiên đăng nhập từ Email OTP.');
      }

      setEmailOtpCode('');
      onPendingEmailOtpChange?.(false);
      speakVietnamese('Xác thực Email OTP thành công');
      onSuccess();
    } catch (err: unknown) {
      setErrorMsg(formatEmailDeliveryError(err, 'Mã Email OTP không hợp lệ hoặc đã hết hạn.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setStatusNotice(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }

    setLoading(true);
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;

      setRecoverySent(true);
      setCooldownSeconds(60);
      setStatusNotice(
        `Đã gửi yêu cầu khôi phục mật khẩu tới ${email.trim()}. Hãy mở liên kết trong email hoặc nhập mã OTP khôi phục 6 số (nếu mẫu email có mã).`
      );
    } catch (err: unknown) {
      setErrorMsg(formatEmailDeliveryError(err, 'Không thể gửi email khôi phục mật khẩu.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }

    const sanitized = recoveryOtpCode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(sanitized)) {
      setErrorMsg('Vui lòng nhập mã khôi phục 6 chữ số từ email.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: sanitized,
        type: 'recovery',
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error('Không thể xác minh mã khôi phục.');
      }
      setRecoveryOtpCode('');
      // AuthContext listens to session / PASSWORD_RECOVERY and shows PasswordRecoveryView
      // (with MFA AAL2 check if user already has 2FA enabled)
    } catch (err: unknown) {
      setErrorMsg(formatEmailDeliveryError(err, 'Mã khôi phục không đúng hoặc đã hết hạn.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3 select-none">
      {/* Header & Mode Switch */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="font-black text-base sm:text-xl text-[#0A192F] tracking-tight">
            {subMode === 'password'
              ? 'Chào mừng trở lại'
              : subMode === 'email_otp'
              ? 'Đăng nhập bằng Email OTP'
              : 'Khôi phục mật khẩu'}
          </h3>
          <span className="text-[11px] sm:text-xs font-extrabold text-[#1E293B]">
            {subMode === 'password'
              ? 'Nhập thông tin để tiếp tục'
              : subMode === 'email_otp'
              ? 'Mã OTP qua email (Bước 1 - AAL1)'
              : 'Xác minh email để đặt lại mật khẩu'}
          </span>
        </div>

        {subMode !== 'password' ? (
          <button
            type="button"
            onClick={() => switchSubMode('password')}
            className="px-2.5 py-1 rounded-xl bg-white/45 hover:bg-white/65 border border-white/60 text-xs font-black text-[#0E6C99] flex items-center gap-1 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Mật khẩu</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchSubMode('email_otp')}
            className="px-2.5 py-1 rounded-xl bg-white/45 hover:bg-white/65 border border-white/60 text-[11px] sm:text-xs font-black text-[#0E6C99] flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email OTP</span>
          </button>
        )}
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          className="p-2 sm:p-2.5 bg-rose-500/25 border border-rose-500/50 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2 animate-in fade-in duration-150"
        >
          <AlertCircle className="w-4 h-4 text-rose-800 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Status Notice */}
      {statusNotice && (
        <div
          role="status"
          className="p-2 sm:p-2.5 bg-sky-500/25 border border-sky-400 text-[#0A192F] rounded-xl text-xs font-black flex items-start gap-2 animate-in fade-in duration-150"
        >
          <CheckCircle2 className="w-4 h-4 text-[#0E6C99] shrink-0 mt-0.5" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* ================= PASSWORD LOGIN ================= */}
      {subMode === 'password' && (
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-2 sm:gap-3">
          <div>
            <label htmlFor="login-email" className="block text-[11px] sm:text-xs font-black text-[#0A192F] mb-0.5 sm:mb-1">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập địa chỉ email của bạn"
              autoComplete="email"
              disabled={loading}
              className="w-full h-9.5 sm:h-11 px-3 sm:px-3.5 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
              <label htmlFor="login-password" className="block text-[11px] sm:text-xs font-black text-[#0A192F]">
                Mật khẩu
              </label>
              <button
                type="button"
                onClick={() => switchSubMode('forgot_password')}
                className="text-[11px] sm:text-xs font-black text-[#0E6C99] hover:underline cursor-pointer"
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu của bạn"
                autoComplete="current-password"
                disabled={loading}
                className="w-full h-9.5 sm:h-11 pl-3 sm:pl-3.5 pr-10 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0A192F]/80 hover:text-[#0A192F] p-1 rounded transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <EyeFocusable id="btn-login-submit" onSelect={() => void handlePasswordLogin()}>
            <button
              id="btn-login-submit"
              type="button"
              disabled={loading}
              className="w-full h-10 sm:h-11.5 mt-0.5 sm:mt-1 bg-[#FF6F61] hover:bg-[#ff5b4c] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none text-white font-black text-xs sm:text-base rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] flex items-center justify-center transition-all cursor-pointer select-none"
            >
              {loading ? 'Đang đăng nhập...' : 'ĐĂNG NHẬP'}
            </button>
          </EyeFocusable>
        </form>
      )}

      {/* ================= EMAIL OTP LOGIN (AAL1) ================= */}
      {subMode === 'email_otp' && (
        <div className="flex flex-col gap-2.5">
          <form onSubmit={otpSent ? handleVerifyEmailOtp : handleSendEmailOtp} className="flex flex-col gap-2.5">
            <div>
              <label htmlFor="otp-login-email" className="block text-xs font-black text-[#0A192F] mb-1">
                Email đã đăng ký
              </label>
              <input
                id="otp-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email nhận mã OTP"
                autoComplete="email"
                disabled={loading}
                className="w-full h-10 px-3 bg-white/50 focus:bg-white/80 border border-white/60 focus:border-[#0E6C99] rounded-xl font-black text-[#0A192F] outline-none text-sm"
              />
            </div>

            {otpSent && (
              <>
                <div>
                  <label htmlFor="email-otp-code" className="block text-xs font-black text-[#0A192F] mb-1">
                    Mã Email OTP (6 chữ số)
                  </label>
                  <input
                    id="email-otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    disabled={loading}
                    className="w-full h-10 px-3 bg-white/70 border border-white/60 focus:border-[#0E6C99] rounded-xl font-black tracking-[0.4em] text-center text-base text-[#0A192F] outline-none"
                  />
                </div>
                <MfaNumericKeypad
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  disabled={loading}
                  idPrefix="email-otp-pad"
                />
                <p className="text-[11px] font-bold text-[#1E293B] bg-white/40 border border-white/50 rounded-xl px-2.5 py-1.5 leading-snug">
                  Nếu email nhận được chỉ có nút &quot;Sign in&quot; thay vì mã 6 số, mẫu <strong>Magic Link</strong> trên Supabase Dashboard chưa bật biến <code>{'{{ .Token }}'}</code>.
                </p>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (otpSent && emailOtpCode.length !== 6)}
              className="w-full h-10.5 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 text-white font-black text-sm rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] cursor-pointer"
            >
              {loading
                ? 'Đang xử lý...'
                : otpSent
                ? 'XÁC MINH EMAIL OTP'
                : 'GỬI MÃ EMAIL OTP'}
            </button>

            {otpSent && (
              <button
                type="button"
                disabled={loading || cooldownSeconds > 0}
                onClick={() => void handleSendEmailOtp()}
                className="text-xs font-black text-[#0E6C99] hover:underline disabled:opacity-50 cursor-pointer"
              >
                {cooldownSeconds > 0 ? `Gửi lại mã sau ${cooldownSeconds}s` : 'Gửi lại mã Email OTP'}
              </button>
            )}
          </form>
        </div>
      )}

      {/* ================= FORGOT PASSWORD / RECOVERY ================= */}
      {subMode === 'forgot_password' && (
        <div className="flex flex-col gap-2.5">
          <div className="p-2 rounded-xl bg-white/45 border border-white/60 text-[11px] font-bold text-[#1E293B] flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-[#0E6C99] shrink-0 mt-0.5" />
            <span>
              Khôi phục mật khẩu không bỏ qua xác thực 2 lớp (2FA). Nếu tài khoản có 2FA, bạn vẫn cần mã Google Authenticator trước khi đổi mật khẩu.
            </span>
          </div>

          <form onSubmit={recoverySent ? handleVerifyRecoveryOtp : handleSendRecoveryEmail} className="flex flex-col gap-2.5">
            <div>
              <label htmlFor="recovery-email" className="block text-xs font-black text-[#0A192F] mb-1">
                Email tài khoản
              </label>
              <input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email cần khôi phục"
                autoComplete="email"
                disabled={loading}
                className="w-full h-10 px-3 bg-white/50 focus:bg-white/80 border border-white/60 focus:border-[#0E6C99] rounded-xl font-black text-[#0A192F] outline-none text-sm"
              />
            </div>

            {recoverySent && (
              <div>
                <label htmlFor="recovery-otp-code" className="block text-xs font-black text-[#0A192F] mb-1">
                  Mã OTP khôi phục (nếu nhận được mã 6 số thay vì liên kết)
                </label>
                <input
                  id="recovery-otp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={recoveryOtpCode}
                  onChange={(e) => setRecoveryOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={loading}
                  className="w-full h-10 px-3 bg-white/70 border border-white/60 focus:border-[#0E6C99] rounded-xl font-black tracking-[0.4em] text-center text-base text-[#0A192F] outline-none"
                />
              </div>
            )}

            {!recoverySent ? (
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10.5 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 text-white font-black text-sm rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] cursor-pointer"
              >
                {loading ? 'Đang gửi yêu cầu...' : 'GỬI EMAIL KHÔI PHỤC'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={loading || recoveryOtpCode.length !== 6}
                  className="w-full h-10.5 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 text-white font-black text-sm rounded-xl cursor-pointer"
                >
                  {loading ? 'Đang xác minh...' : 'XÁC MINH MÃ KHÔI PHỤC'}
                </button>
                <button
                  type="button"
                  disabled={loading || cooldownSeconds > 0}
                  onClick={() => void handleSendRecoveryEmail()}
                  className="text-xs font-black text-[#0E6C99] hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {cooldownSeconds > 0 ? `Gửi lại sau ${cooldownSeconds}s` : 'Gửi lại email khôi phục'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Switch to Register link */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[#0A192F] font-bold select-none">
        <span>Chưa có tài khoản?</span>
        <button
          id="btn-switch-to-register"
          type="button"
          onClick={onSwitchToRegister}
          className="font-black text-[#0E6C99] hover:text-[#0A192F] hover:underline cursor-pointer transition-colors"
        >
          Đăng ký ngay
        </button>
      </div>
    </div>
  );
}
