import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Factor } from '@supabase/supabase-js';
import {
  AlertCircle,
  HelpCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthErrorMessage } from '../../lib/authHeaders';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { speakVietnamese } from '../../utils/speech';
import { MfaNumericKeypad } from './MfaNumericKeypad';

export interface MfaChallengeViewProps {
  factors: Factor[];
  onVerified: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  title?: string;
  subtitle?: string;
  idPrefix?: string;
}

export function mapMfaVerifyError(err: unknown): { message: string; expired: boolean; network: boolean } {
  const raw = getAuthErrorMessage(err, '');
  const lower = raw.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return {
      message: 'Mất kết nối mạng khi xác minh OTP. Vui lòng kiểm tra kết nối và thử lại.',
      expired: false,
      network: true,
    };
  }
  if (lower.includes('expired') || lower.includes('not found') || lower.includes('challenge')) {
    return {
      message: 'Mã thử thách hoặc mã OTP đã hết hạn. Vui lòng nhập mã 6 số mới nhất từ Google Authenticator.',
      expired: true,
      network: false,
    };
  }
  if (
    lower.includes('invalid totp') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid') ||
    lower.includes('verification failed')
  ) {
    return {
      message: 'Mã OTP 6 chữ số không chính xác hoặc đã trôi thời gian. Vui lòng kiểm tra lại.',
      expired: false,
      network: false,
    };
  }
  return {
    message: raw || 'Xác minh 2 lớp không thành công. Vui lòng thử lại.',
    expired: false,
    network: false,
  };
}

export function MfaChallengeView({
  factors,
  onVerified,
  onSignOut,
  title = 'Xác minh bảo mật 2 lớp (2FA)',
  subtitle = 'Nhập mã 6 chữ số từ ứng dụng Google Authenticator để tiếp tục (AAL2).',
  idPrefix = 'mfa-verify',
}: MfaChallengeViewProps) {
  const verifiedTotpFactors = factors.filter(
    (f) => f.status === 'verified' && f.factor_type === 'totp'
  );
  const activeFactor = verifiedTotpFactors[0] || factors[0] || null;

  const [selectedFactorId, setSelectedFactorId] = useState<string>(activeFactor?.id || '');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLostDeviceHelp, setShowLostDeviceHelp] = useState(false);

  const mountedRef = useRef(true);
  const challengeSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeFactor?.id && !selectedFactorId) {
      setSelectedFactorId(activeFactor.id);
    }
  }, [activeFactor?.id, selectedFactorId]);

  const createChallenge = useCallback(async (factorId: string) => {
    if (!factorId) return null;
    const seq = ++challengeSeqRef.current;
    setLoadingChallenge(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error || !data?.id) {
        throw error || new Error('Không thể khởi tạo phiên thử thách MFA.');
      }
      if (!mountedRef.current || seq !== challengeSeqRef.current) return null;
      setChallengeId(data.id);
      return data.id;
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== challengeSeqRef.current) return null;
      const mapped = mapMfaVerifyError(err);
      setErrorMsg(mapped.message);
      setChallengeId(null);
      return null;
    } finally {
      if (mountedRef.current && seq === challengeSeqRef.current) {
        setLoadingChallenge(false);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedFactorId) {
      void createChallenge(selectedFactorId);
    }
  }, [selectedFactorId, createChallenge]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (verifying || loadingChallenge) return;
    setErrorMsg(null);

    const sanitized = code.replace(/\D/g, '').slice(0, 6);
    if (!selectedFactorId) {
      setErrorMsg('Không tìm thấy phương thức xác thực Google Authenticator.');
      return;
    }
    if (!/^\d{6}$/.test(sanitized)) {
      setErrorMsg('Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }

    setVerifying(true);
    try {
      let activeChallengeId = challengeId;
      if (!activeChallengeId) {
        activeChallengeId = await createChallenge(selectedFactorId);
        if (!activeChallengeId) {
          setVerifying(false);
          return;
        }
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId: selectedFactorId,
        challengeId: activeChallengeId,
        code: sanitized,
      });

      if (error) throw error;

      setCode('');
      speakVietnamese('Xác minh hai lớp thành công');
      await onVerified();
    } catch (err: unknown) {
      const mapped = mapMfaVerifyError(err);
      setErrorMsg(mapped.message);
      if (mapped.expired) {
        await createChallenge(selectedFactorId);
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#0E6C99]/15 border border-[#0E6C99]/30 text-[#0E6C99] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-base sm:text-lg text-[#0A192F] leading-tight">
              {title}
            </h3>
            <p className="text-[11px] sm:text-xs font-bold text-[#1E293B] mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {onSignOut && (
          <EyeFocusable id={`${idPrefix}-signout`} onSelect={onSignOut} speakLabel="Đăng xuất">
            <button
              type="button"
              onClick={onSignOut}
              className="px-2.5 py-1.5 rounded-xl bg-white/50 hover:bg-white/80 border border-[#14213D]/15 text-[#0A192F] text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Thoát</span>
            </button>
          </EyeFocusable>
        )}
      </div>

      {verifiedTotpFactors.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {verifiedTotpFactors.map((factor, idx) => (
            <button
              key={factor.id}
              type="button"
              onClick={() => setSelectedFactorId(factor.id)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black border cursor-pointer ${
                selectedFactorId === factor.id
                  ? 'bg-[#0E6C99] text-white border-[#0E6C99]'
                  : 'bg-white/60 text-[#0A192F] border-white/70'
              }`}
            >
              {factor.friendly_name || `Thiết bị #${idx + 1}`}
            </button>
          ))}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-2.5 bg-rose-500/20 border border-rose-500/50 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-800 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor={`${idPrefix}-otp-input`} className="text-xs font-black text-[#0A192F]">
              Mã OTP 6 chữ số
            </label>
            <button
              type="button"
              disabled={loadingChallenge || verifying || !selectedFactorId}
              onClick={() => selectedFactorId && void createChallenge(selectedFactorId)}
              className="text-[11px] font-black text-[#0E6C99] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loadingChallenge ? 'animate-spin' : ''}`} />
              <span>Làm mới thử thách</span>
            </button>
          </div>
          <input
            id={`${idPrefix}-otp-input`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={verifying}
            className="w-full h-11 px-3.5 bg-white/70 focus:bg-white border border-[#14213D]/20 focus:border-[#0E6C99] focus:ring-2 focus:ring-[#0E6C99]/30 rounded-xl font-black tracking-[0.45em] text-center text-lg text-[#0A192F] outline-none"
          />
        </div>

        <MfaNumericKeypad
          value={code}
          onChange={setCode}
          disabled={verifying}
          idPrefix={idPrefix}
        />

        <EyeFocusable id={`${idPrefix}-submit`} onSelect={() => void handleSubmit()} speakLabel="Xác minh OTP">
          <button
            id={`${idPrefix}-submit`}
            type="button"
            disabled={verifying || loadingChallenge || code.length !== 6}
            className="w-full h-11 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 disabled:pointer-events-none text-white font-black text-sm rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] cursor-pointer transition-all"
          >
            {verifying ? 'Đang xác minh...' : 'XÁC MINH MÃ OTP'}
          </button>
        </EyeFocusable>
      </form>

      <div className="pt-1 border-t border-white/40">
        <button
          type="button"
          onClick={() => setShowLostDeviceHelp((v) => !v)}
          className="text-[11px] font-black text-[#0E6C99] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Mất thiết bị xác thực Google Authenticator?</span>
        </button>

        {showLostDeviceHelp && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 text-[11px] font-bold text-amber-950 leading-relaxed">
            Để chống bỏ qua xác thực 2 lớp (MFA Bypass), Email OTP hoặc đặt lại mật khẩu không thể tự tắt 2FA. Nếu mất điện thoại/ứng dụng Google Authenticator, vui lòng liên hệ quản trị viên để xác minh danh tính và gỡ yếu tố MFA trên Supabase Auth Dashboard.
          </div>
        )}
      </div>
    </div>
  );
}
