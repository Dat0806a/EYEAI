import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { speakVietnamese } from '../../utils/speech';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { RegistrationRole } from '../../hooks/useAuth';

export interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  // Step 1: Role selection, Step 2: Account details
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<RegistrationRole | null>(null);

  // Step 2 Form state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNextToStep2 = () => {
    setErrorMsg(null);
    if (!selectedRole) {
      setErrorMsg('Vui lòng chọn loại tài khoản.');
      return;
    }
    setStep(2);
  };

  const handleBackToStep1 = () => {
    setErrorMsg(null);
    setStep(1);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!selectedRole) {
      setErrorMsg('Vui lòng chọn loại tài khoản.');
      setStep(1);
      return;
    }

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập họ và tên của bạn.');
      return;
    }
    if (!trimmedEmail) {
      setErrorMsg('Vui lòng nhập địa chỉ email.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg('Địa chỉ email không đúng định dạng.');
      return;
    }
    if (!password) {
      setErrorMsg('Vui lòng tạo mật khẩu.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            display_name: trimmedName,
            role: selectedRole,
            account_type: selectedRole,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: trimmedName,
          role: selectedRole,
          account_type: selectedRole,
        });

        speakVietnamese('Đăng ký tài khoản thành công');
        onSuccess();
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.includes('User already registered') || rawMsg.includes('already been registered')) {
        setErrorMsg('Email này đã được sử dụng.');
      } else if (rawMsg.includes('Password should be at least')) {
        setErrorMsg('Mật khẩu cần ít nhất 6 ký tự.');
      } else {
        setErrorMsg('Đăng ký không thành công. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          className="p-2.5 bg-rose-500/25 border border-rose-500/50 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2 animate-in fade-in duration-150"
        >
          <AlertCircle className="w-4 h-4 text-rose-800 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ================= STEP 1: ROLE SELECTION ================= */}
      {step === 1 && (
        <div className="flex flex-col gap-3 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex flex-col">
            <h3 className="font-black text-lg sm:text-xl text-[#0A192F] tracking-tight">
              Tạo tài khoản
            </h3>
            <span className="text-xs font-extrabold text-[#1E293B]">
              Bạn thuộc nhóm nào?
            </span>
          </div>

          {/* Role Cards: EXACTLY TWO Options */}
          <div className="flex flex-col gap-2.5">
            {/* 1. Người suy giảm */}
            <EyeFocusable
              id="role-opt-impaired"
              onSelect={() => setSelectedRole('impaired')}
              speakLabel="Người suy giảm"
            >
              <button
                type="button"
                onClick={() => setSelectedRole('impaired')}
                className={`w-full p-3 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedRole === 'impaired'
                    ? 'bg-white/55 border-2 border-[#0E6C99] shadow-xs backdrop-blur-sm'
                    : 'bg-white/25 hover:bg-white/35 border border-white/45 backdrop-blur-xs'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-black text-sm text-[#0A192F]">
                    Người suy giảm
                  </span>
                  <span className="text-xs text-[#1E293B] font-bold">
                    Hỗ trợ thao tác và giao tiếp thuận tiện
                  </span>
                </div>
                {selectedRole === 'impaired' && (
                  <CheckCircle2 className="w-5 h-5 text-[#0E6C99] shrink-0" />
                )}
              </button>
            </EyeFocusable>

            {/* 2. Bệnh nhân */}
            <EyeFocusable
              id="role-opt-patient"
              onSelect={() => setSelectedRole('patient')}
              speakLabel="Bệnh nhân"
            >
              <button
                type="button"
                onClick={() => setSelectedRole('patient')}
                className={`w-full p-3 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedRole === 'patient'
                    ? 'bg-white/55 border-2 border-[#0E6C99] shadow-xs backdrop-blur-sm'
                    : 'bg-white/25 hover:bg-white/35 border border-white/45 backdrop-blur-xs'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-black text-sm text-[#0A192F]">
                    Bệnh nhân
                  </span>
                  <span className="text-xs text-[#1E293B] font-bold">
                    Sử dụng các tính năng hỗ trợ phù hợp
                  </span>
                </div>
                {selectedRole === 'patient' && (
                  <CheckCircle2 className="w-5 h-5 text-[#0E6C99] shrink-0" />
                )}
              </button>
            </EyeFocusable>
          </div>

          {/* Continue Button */}
          <EyeFocusable id="btn-register-continue" onSelect={handleNextToStep2}>
            <button
              id="btn-register-continue"
              type="button"
              onClick={handleNextToStep2}
              disabled={!selectedRole}
              className="w-full h-11.5 mt-1 bg-[#FF6F61] hover:bg-[#ff5b4c] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white font-black text-sm sm:text-base rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] flex items-center justify-center transition-all cursor-pointer select-none"
            >
              TIẾP TỤC
            </button>
          </EyeFocusable>
        </div>
      )}

      {/* ================= STEP 2: ACCOUNT DETAILS ================= */}
      {step === 2 && (
        <div className="flex flex-col gap-2.5 animate-in fade-in duration-200">
          {/* Header with Back button and role badge */}
          <div className="flex items-center justify-between pb-1 border-b border-white/30">
            <button
              type="button"
              onClick={handleBackToStep1}
              className="flex items-center gap-1 text-xs font-black text-[#0E6C99] hover:text-[#0A192F] transition-colors cursor-pointer py-0.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </button>
            <span className="px-3 py-1 rounded-full bg-white/50 border border-white/60 text-xs font-black text-[#0A192F]">
              {selectedRole === 'impaired' ? 'Người suy giảm' : 'Bệnh nhân'}
            </span>
          </div>

          {/* Form Fields container */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            {/* Họ và tên */}
            <div>
              <label htmlFor="reg-name" className="block text-xs font-black text-[#0A192F] mb-0.5">
                Họ và tên
              </label>
              <input
                id="reg-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nhập họ và tên của bạn"
                autoComplete="name"
                disabled={loading}
                className="w-full h-10 px-3.5 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
              />
            </div>

            {/* Email / Số điện thoại */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-black text-[#0A192F] mb-0.5">
                Email / Số điện thoại
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email hoặc số điện thoại"
                autoComplete="email"
                disabled={loading}
                className="w-full h-10 px-3.5 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
              />
            </div>

            {/* Mật khẩu */}
            <div>
              <label htmlFor="reg-password" className="block text-xs font-black text-[#0A192F] mb-0.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tạo mật khẩu (ít nhất 6 ký tự)"
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full h-10 pl-3.5 pr-10 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
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

            {/* Xác nhận mật khẩu */}
            <div>
              <label htmlFor="reg-confirm" className="block text-xs font-black text-[#0A192F] mb-0.5">
                Xác nhận mật khẩu
              </label>
              <div className="relative">
                <input
                  id="reg-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full h-10 pl-3.5 pr-10 bg-white/30 hover:bg-white/40 focus:bg-white/55 border border-white/50 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black text-[#0A192F] placeholder:text-[#1E293B]/70 outline-none transition-all text-xs sm:text-sm shadow-2xs backdrop-blur-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0A192F]/80 hover:text-[#0A192F] p-1 rounded transition-colors cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <EyeFocusable id="btn-register-submit" onSelect={() => handleSubmit()}>
              <button
                id="btn-register-submit"
                type="submit"
                disabled={loading}
                className="w-full h-11.5 mt-1 bg-[#FF6F61] hover:bg-[#ff5b4c] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none text-white font-black text-sm sm:text-base rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] flex items-center justify-center transition-all cursor-pointer select-none"
              >
                {loading ? 'Đang tạo tài khoản...' : 'TẠO TÀI KHOẢN'}
              </button>
            </EyeFocusable>
          </form>
        </div>
      )}

      {/* Switch to Login Footer */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[#0A192F] font-bold select-none">
        <span>Đã có tài khoản?</span>
        <button
          id="btn-switch-to-login"
          type="button"
          onClick={onSwitchToLogin}
          className="font-black text-[#0E6C99] hover:text-[#0A192F] hover:underline cursor-pointer transition-colors"
        >
          Đăng nhập
        </button>
      </div>
    </div>
  );
}
