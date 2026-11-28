import React, { useState } from 'react';
import { Factor } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthErrorMessage } from '../../lib/authHeaders';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { MfaChallengeView } from './MfaChallengeView';

export interface PasswordRecoveryViewProps {
  hasVerifiedMfa: boolean;
  currentAal: 'aal1' | 'aal2' | null;
  verifiedFactors: Factor[];
  onRefreshMfa: () => Promise<unknown>;
  onComplete: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function PasswordRecoveryView({
  hasVerifiedMfa,
  currentAal,
  verifiedFactors,
  onRefreshMfa,
  onComplete,
  onSignOut,
}: PasswordRecoveryViewProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Anti-MFA bypass: if user has verified MFA factor and session is still AAL1, require TOTP verification BEFORE changing password
  if (hasVerifiedMfa && currentAal !== 'aal2') {
    return (
      <div className="flex flex-col gap-3">
        <div className="p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 text-xs font-bold text-amber-950">
          Tài khoản của bạn đang bật bảo mật 2 lớp (2FA). Vui lòng xác minh mã Google Authenticator (AAL2) trước khi đặt mật khẩu mới.
        </div>
        <MfaChallengeView
          factors={verifiedFactors}
          onVerified={async () => {
            await onRefreshMfa();
          }}
          onSignOut={onSignOut}
          title="Xác minh 2FA để khôi phục mật khẩu"
          subtitle="Khôi phục mật khẩu không bỏ qua bước xác thực 2 lớp."
          idPrefix="recovery-mfa"
        />
      </div>
    );
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg('Đã cập nhật mật khẩu mới thành công!');
      setTimeout(() => {
        void onComplete();
      }, 900);
    } catch (err: unknown) {
      const msg = getAuthErrorMessage(err, 'Không thể đặt lại mật khẩu mới.');
      if (msg.toLowerCase().includes('aal2')) {
        setErrorMsg('Cần xác minh 2FA (AAL2) trước khi đổi mật khẩu.');
        await onRefreshMfa();
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#0E6C99]/15 border border-[#0E6C99]/30 text-[#0E6C99] flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-base sm:text-lg text-[#0A192F]">
              Đặt lại mật khẩu mới
            </h3>
            <p className="text-[11px] sm:text-xs font-bold text-[#1E293B]">
              Nhập mật khẩu mới cho tài khoản của bạn.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="px-2.5 py-1.5 rounded-xl bg-white/50 hover:bg-white/80 border border-[#14213D]/15 text-[#0A192F] text-xs font-black flex items-center gap-1 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-600" />
          <span>Hủy</span>
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="p-2.5 bg-rose-500/20 border border-rose-500/50 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-800 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-2.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-950 rounded-xl text-xs font-black flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <div>
          <label htmlFor="recovery-new-password" className="block text-xs font-black text-[#0A192F] mb-1">
            Mật khẩu mới
          </label>
          <div className="relative">
            <input
              id="recovery-new-password"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              autoComplete="new-password"
              disabled={loading}
              className="w-full h-10 pl-3 pr-10 bg-white/65 focus:bg-white border border-white/60 focus:border-[#0E6C99] rounded-xl font-black text-sm text-[#0A192F] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0A192F]/80 p-1 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="recovery-confirm-password" className="block text-xs font-black text-[#0A192F] mb-1">
            Xác nhận mật khẩu mới
          </label>
          <input
            id="recovery-confirm-password"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Nhập lại mật khẩu mới"
            autoComplete="new-password"
            disabled={loading}
            className="w-full h-10 px-3 bg-white/65 focus:bg-white border border-white/60 focus:border-[#0E6C99] rounded-xl font-black text-sm text-[#0A192F] outline-none"
          />
        </div>

        <EyeFocusable id="btn-recovery-submit" onSelect={() => void handleSubmit()} speakLabel="Lưu mật khẩu mới">
          <button
            id="btn-recovery-submit"
            type="button"
            disabled={loading}
            className="w-full h-11 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 text-white font-black text-sm rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] cursor-pointer transition-all"
          >
            {loading ? 'Đang cập nhật...' : 'CẬP NHẬT MẬT KHẨU'}
          </button>
        </EyeFocusable>
      </form>
    </div>
  );
}
