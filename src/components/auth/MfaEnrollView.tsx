import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  ShieldPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { speakVietnamese } from '../../utils/speech';
import { MfaNumericKeypad } from './MfaNumericKeypad';
import { mapMfaVerifyError } from './MfaChallengeView';

export interface MfaEnrollViewProps {
  onEnrolled: () => Promise<void> | void;
  onCancel?: () => void;
  onSignOut?: () => Promise<void> | void;
  mandatory?: boolean;
  idPrefix?: string;
}

function normalizeQrSrc(qrCode: string): string {
  const trimmed = (qrCode || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function MfaEnrollView({
  onEnrolled,
  onCancel,
  onSignOut,
  mandatory = false,
  idPrefix = 'mfa-enroll',
}: MfaEnrollViewProps) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSrc, setQrCodeSrc] = useState<string>('');
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [code, setCode] = useState('');
  const [enrolling, setEnrolling] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const enrollSeqRef = useRef(0);
  const inFlightEnrollRef = useRef<Promise<{
    factorId: string;
    qrCodeSrc: string;
    totpSecret: string;
  }> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const performEnrollment = useCallback(async () => {
    // Clean up any stale unverified TOTP factors before enrolling to prevent enrollment deadlocks
    const { data: listed } = await supabase.auth.mfa.listFactors();
    const rawFactors = [...(listed?.all || []), ...(listed?.totp || [])];
    const seenIds = new Set<string>();
    const unverifiedTotp = rawFactors.filter((f) => {
      if (!f?.id || seenIds.has(f.id)) return false;
      seenIds.add(f.id);
      return f.factor_type === 'totp' && f.status === 'unverified';
    });
    for (const stale of unverifiedTotp) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => {});
    }

    const uniqueSuffix = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Google Authenticator (${uniqueSuffix})`,
      issuer: 'EYEAI - LUCKY DREAM',
    });

    if (error || !data?.id || !data?.totp) {
      throw error || new Error('Không thể tạo mã QR kích hoạt 2FA.');
    }

    return {
      factorId: data.id,
      qrCodeSrc: normalizeQrSrc(data.totp.qr_code),
      totpSecret: data.totp.secret || '',
    };
  }, []);

  const startEnrollment = useCallback(
    async (forceNew = false) => {
      const seq = ++enrollSeqRef.current;
      setEnrolling(true);
      setErrorMsg(null);
      setCode('');
      try {
        let pending = !forceNew ? inFlightEnrollRef.current : null;
        if (!pending) {
          pending = performEnrollment();
          inFlightEnrollRef.current = pending;
        }

        const result = await pending;
        if (inFlightEnrollRef.current === pending) {
          inFlightEnrollRef.current = null;
        }
        if (!mountedRef.current || seq !== enrollSeqRef.current) return;

        setFactorId(result.factorId);
        setQrCodeSrc(result.qrCodeSrc);
        setTotpSecret(result.totpSecret);
      } catch (err: unknown) {
        inFlightEnrollRef.current = null;
        if (!mountedRef.current || seq !== enrollSeqRef.current) return;
        const mapped = mapMfaVerifyError(err);
        setErrorMsg(mapped.message);
        setFactorId(null);
      } finally {
        if (mountedRef.current && seq === enrollSeqRef.current) {
          setEnrolling(false);
        }
      }
    },
    [performEnrollment]
  );

  useEffect(() => {
    void startEnrollment(false);
  }, [startEnrollment]);

  const handleCopySecret = async () => {
    if (!totpSecret || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleVerifyEnrollment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (verifying || enrolling) return;
    setErrorMsg(null);

    if (!factorId) {
      setErrorMsg('Chưa khởi tạo được phiên đăng ký 2FA. Vui lòng thử tạo lại mã QR.');
      return;
    }

    const sanitized = code.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(sanitized)) {
      setErrorMsg('Vui lòng nhập đủ 6 chữ số từ Google Authenticator.');
      return;
    }

    setVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError || !challengeData?.id) {
        throw challengeError || new Error('Không thể tạo thử thách xác minh 2FA.');
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: sanitized,
      });

      if (verifyError) throw verifyError;

      setCode('');
      setTotpSecret('');
      speakVietnamese('Đã kích hoạt xác thực hai lớp thành công');
      await onEnrolled();
    } catch (err: unknown) {
      const mapped = mapMfaVerifyError(err);
      setErrorMsg(mapped.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-base sm:text-lg text-[#0A192F] leading-tight">
              {mandatory ? 'Bắt buộc thiết lập 2FA (AAL2)' : 'Kích hoạt Google Authenticator'}
            </h3>
            <p className="text-[11px] sm:text-xs font-bold text-[#1E293B] mt-0.5">
              {mandatory
                ? 'Tài khoản Bệnh nhân cần bật bảo mật 2 lớp trước khi truy cập dữ liệu y tế.'
                : 'Quét mã QR bằng Google Authenticator rồi nhập mã 6 chữ số để hoàn tất.'}
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

      {errorMsg && (
        <div
          role="alert"
          className="p-2.5 bg-rose-500/20 border border-rose-500/50 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-800 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {enrolling ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-slate-200 text-center text-xs font-black text-[#14213D]">
          Đang tạo mã QR bảo mật từ Supabase MFA...
        </div>
      ) : (
        <>
          {qrCodeSrc && (
            <div className="p-3 rounded-2xl bg-white/85 border border-slate-200 flex flex-col sm:flex-row items-center gap-3">
              <img
                src={qrCodeSrc}
                alt="Mã QR Google Authenticator"
                className="w-36 h-36 rounded-xl border border-slate-200 bg-white p-1 shrink-0"
              />
              <div className="flex-1 min-w-0 flex flex-col gap-2 text-xs">
                <p className="font-black text-[#0A192F]">
                  1. Mở ứng dụng Google Authenticator và quét mã QR.
                </p>
                <p className="font-bold text-slate-600">
                  Hoặc nhập khóa thiết lập thủ công nếu không quét được camera:
                </p>
                {totpSecret && (
                  <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    <span className="font-mono text-[11px] font-bold text-[#0A192F] truncate flex-1">
                      {showSecret ? totpSecret : '••••••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? 'Ẩn khóa bí mật' : 'Hiện khóa bí mật'}
                      className="p-1 text-slate-600 hover:text-[#0A192F] cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      aria-label="Sao chép khóa thiết lập"
                      className="p-1 text-[#0E6C99] hover:text-[#0A192F] cursor-pointer"
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void startEnrollment(true)}
                  disabled={verifying}
                  className="self-start text-[11px] font-black text-[#0E6C99] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Tạo lại mã QR</span>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleVerifyEnrollment} className="flex flex-col gap-2.5">
            <div>
              <label htmlFor={`${idPrefix}-otp-input`} className="block text-xs font-black text-[#0A192F] mb-1">
                2. Nhập mã 6 chữ số để xác nhận kích hoạt
              </label>
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
                className="w-full h-11 px-3.5 bg-white/75 focus:bg-white border border-[#14213D]/20 focus:border-[#0E6C99] rounded-xl font-black tracking-[0.45em] text-center text-lg text-[#0A192F] outline-none"
              />
            </div>

            <MfaNumericKeypad
              value={code}
              onChange={setCode}
              disabled={verifying}
              idPrefix={idPrefix}
            />

            <div className="flex items-center gap-2 pt-1">
              {onCancel && !mandatory && (
                <EyeFocusable id={`${idPrefix}-cancel`} onSelect={onCancel} speakLabel="Hủy thiết lập 2FA">
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={onCancel}
                    className="px-4 h-11 rounded-xl bg-slate-200 hover:bg-slate-300 text-[#0A192F] font-black text-xs cursor-pointer"
                  >
                    Hủy
                  </button>
                </EyeFocusable>
              )}

              <EyeFocusable
                id={`${idPrefix}-submit`}
                onSelect={() => void handleVerifyEnrollment()}
                speakLabel="Xác nhận kích hoạt 2FA"
                className="flex-1"
              >
                <button
                  id={`${idPrefix}-submit`}
                  type="button"
                  disabled={verifying || code.length !== 6 || !factorId}
                  className="w-full h-11 bg-[#FF6F61] hover:bg-[#ff5b4c] disabled:opacity-60 disabled:pointer-events-none text-white font-black text-sm rounded-xl shadow-[0_6px_18px_rgba(255,111,97,0.35)] cursor-pointer transition-all"
                >
                  {verifying ? 'Đang kích hoạt...' : 'XÁC NHẬN & BẬT 2FA'}
                </button>
              </EyeFocusable>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
