import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { speakVietnamese } from '../../utils/speech';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';

export interface LoginFormProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setForgotNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg('Địa chỉ email không hợp lệ.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) throw error;

      if (data.user) {
        speakVietnamese('Đăng nhập thành công');
        onSuccess();
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (
        rawMsg.includes('Invalid login credentials') ||
        rawMsg.includes('invalid_grant') ||
        rawMsg.includes('invalid_credentials')
      ) {
        setErrorMsg('Email hoặc mật khẩu chưa chính xác.');
      } else if (rawMsg.includes('Email not confirmed')) {
        setErrorMsg('Email chưa xác thực. Vui lòng kiểm tra hộp thư.');
      } else {
        setErrorMsg('Đăng nhập không thành công. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (demoNumber: 1 | 2) => {
    setLoading(true);
    setErrorMsg(null);
    setForgotNotice(null);

    const demoEmail = `benhnhan${demoNumber}@eyetalk.app`;
    const demoPassword = 'Password123!';
    const demoName = demoNumber === 1 ? 'Nguyễn Văn An' : 'Trần Thị Bình';
    const demoRole = demoNumber === 1 ? 'impaired' : 'patient';

    try {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });

      if (!signInErr && signInData.user) {
        speakVietnamese(`Đã đăng nhập ${demoName}`);
        onSuccess();
        return;
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: demoEmail,
        password: demoPassword,
        options: {
          data: { 
            display_name: demoName,
            role: demoRole,
            account_type: demoRole,
          },
        },
      });

      if (signUpErr) throw signUpErr;

      if (signUpData.user) {
        await supabase.from('profiles').upsert({
          id: signUpData.user.id,
          display_name: demoName,
          role: demoRole,
          account_type: demoRole,
        });

        speakVietnamese(`Đã tạo và đăng nhập ${demoName}`);
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi đăng nhập Demo';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!email.trim()) {
      setForgotNotice('Nhập email vào ô trên rồi bấm Quên mật khẩu.');
      return;
    }
    setForgotNotice(`Liên kết đặt lại sẽ gửi đến: ${email.trim()}`);
    setTimeout(() => setForgotNotice(null), 4000);
  };

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3 select-none">
      {/* Title & Quick Demo */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="font-black text-base sm:text-xl text-[#0A192F] tracking-tight">
            Chào mừng trở lại
          </h3>
          <span className="text-[11px] sm:text-xs font-extrabold text-[#1E293B]">
            Nhập thông tin để tiếp tục
          </span>
        </div>

        {/* Demo Fast Access */}
        <div className="flex items-center gap-1 text-[11px] sm:text-xs font-black text-[#0A192F]">
          <span>Demo:</span>
          <button
            type="button"
            onClick={() => handleQuickDemo(1)}
            disabled={loading}
            className="px-2 py-0.5 rounded-lg bg-white/40 hover:bg-white/60 border border-white/60 text-[#0A192F] font-black text-[11px] sm:text-xs transition-colors cursor-pointer shadow-2xs"
          >
            An
          </button>
          <button
            type="button"
            onClick={() => handleQuickDemo(2)}
            disabled={loading}
            className="px-2 py-0.5 rounded-lg bg-white/40 hover:bg-white/60 border border-white/60 text-[#0A192F] font-black text-[11px] sm:text-xs transition-colors cursor-pointer shadow-2xs"
          >
            Bình
          </button>
        </div>
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

      {/* Forgot Password Notice */}
      {forgotNotice && (
        <div
          role="status"
          className="p-2 sm:p-2.5 bg-sky-500/25 border border-sky-400 text-[#0A192F] rounded-xl text-xs font-black flex items-center gap-2 animate-in fade-in duration-150"
        >
          <span>{forgotNotice}</span>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:gap-3">
        {/* Email Field */}
        <div>
          <label htmlFor="login-email" className="block text-[11px] sm:text-xs font-black text-[#0A192F] mb-0.5 sm:mb-1">
            Email / Số điện thoại
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email hoặc số điện thoại"
            autoComplete="email"
            disabled={loading}
            className="w-full h-9.5 sm:h-11 px-3 sm:px-3.5 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
          />
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-0.5 sm:mb-1">
            <label htmlFor="login-password" className="block text-[11px] sm:text-xs font-black text-[#0A192F]">
              Mật khẩu
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
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

        {/* Primary CTA Button */}
        <EyeFocusable id="btn-login-submit" onSelect={() => handleSubmit()}>
          <button
            id="btn-login-submit"
            type="submit"
            disabled={loading}
            className="w-full h-10 sm:h-11.5 mt-0.5 sm:mt-1 bg-[#FF6F61] hover:bg-[#ff5b4c] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none text-white font-black text-xs sm:text-base rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] flex items-center justify-center transition-all cursor-pointer select-none"
          >
            {loading ? 'Đang đăng nhập...' : 'ĐĂNG NHẬP'}
          </button>
        </EyeFocusable>
      </form>

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
