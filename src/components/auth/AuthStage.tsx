import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, LogOut, RefreshCw } from 'lucide-react';
import { AuthBackgroundVideo } from './AuthBackgroundVideo';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { MfaChallengeView } from './MfaChallengeView';
import { MfaEnrollView } from './MfaEnrollView';
import { PasswordRecoveryView } from './PasswordRecoveryView';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { useAuth } from '../../hooks/useAuth';

export interface AuthStageProps {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onLoginSuccess: () => void;
  onAuthStart?: () => void;
  pendingEmailOtp?: boolean;
  onPendingEmailOtpChange?: (pending: boolean) => void;
}

export function AuthStage({
  mode,
  onModeChange,
  onLoginSuccess,
  onAuthStart,
  pendingEmailOtp = false,
  onPendingEmailOtpChange,
}: AuthStageProps) {
  const {
    isAuthenticated,
    loading,
    profile,
    profileError,
    isPasswordRecovery,
    roleVerified,
    requiresRoleReview,
    needsMfaEnrollment,
    needsMfaVerification,
    hasVerifiedMfa,
    currentAal,
    verifiedMfaFactors,
    refreshMfaState,
    refreshProfile,
    completePasswordRecovery,
    signOut,
  } = useAuth();

  const renderPostAuthGate = () => {
    if (pendingEmailOtp) {
      return null;
    }

    if (isAuthenticated && loading) {
      return (
        <div className="py-6 text-center text-sm font-black text-[#0A192F]">
          Đang kiểm tra trạng thái bảo mật và xác thực 2 lớp...
        </div>
      );
    }

    if (isAuthenticated && isPasswordRecovery) {
      return (
        <PasswordRecoveryView
          hasVerifiedMfa={false}
          currentAal={currentAal}
          verifiedFactors={verifiedMfaFactors}
          onRefreshMfa={refreshMfaState}
          onComplete={completePasswordRecovery}
          onSignOut={signOut}
        />
      );
    }

    if (isAuthenticated && (!profile?.account_type || !roleVerified || requiresRoleReview || profileError)) {
      return (
        <div className="flex flex-col gap-3 p-2">
          <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-950 text-xs font-black flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-800 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span>
                {profileError ||
                  'Tài khoản chưa được xác minh phân quyền hợp lệ từ máy chủ. Truy cập dữ liệu tạm thời bị từ chối.'}
              </span>
              {(!roleVerified || requiresRoleReview) && (
                <span className="text-[11px] font-bold text-rose-900/90">
                  Tài khoản cũ cần được quản trị viên duyệt trong Supabase (`admin_set_verified_account_type`) hoặc bạn có thể đăng ký tài khoản mới.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="flex-1 h-10 rounded-xl bg-[#0E6C99] text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử tải lại</span>
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex-1 h-10 rounded-xl bg-white/70 border border-slate-300 text-[#0A192F] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Quay lại đăng nhập</span>
            </button>
          </div>
        </div>
      );
    }

    if (isAuthenticated && needsMfaEnrollment) {
      return (
        <MfaEnrollView
          mandatory
          onEnrolled={async () => {
            await refreshMfaState();
            onLoginSuccess();
          }}
          onSignOut={signOut}
          idPrefix="gate-mfa-enroll"
        />
      );
    }

    if (isAuthenticated && needsMfaVerification) {
      return (
        <MfaChallengeView
          factors={verifiedMfaFactors}
          onVerified={async () => {
            await refreshMfaState();
            onLoginSuccess();
          }}
          onSignOut={signOut}
          idPrefix="gate-mfa-verify"
        />
      );
    }

    return null;
  };

  const gateContent = renderPostAuthGate();

  return (
    <div
      className="fixed inset-0 w-full h-[100dvh] overflow-y-auto overscroll-none bg-[#75CBEB] flex flex-col justify-end items-center select-none z-10"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Full-Screen Background Video */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <AuthBackgroundVideo />
      </div>

      {/* Bottom Sheet Form Overlay */}
      <div
        id="auth-bottom-sheet"
        className="relative z-10 w-full max-w-md sm:max-w-lg mx-auto bg-white/15 backdrop-blur-md rounded-t-[24px] sm:rounded-t-[32px] p-3.5 sm:p-6 border-t border-white/40 shadow-[0_-8px_36px_rgba(20,33,61,0.18)] max-h-[88dvh] overflow-y-auto transition-all duration-300 touch-pan-y"
      >
        {gateContent ? (
          <div className="w-full">{gateContent}</div>
        ) : (
          <>
            {/* Top Segmented Tabs: Đăng nhập & Đăng ký */}
            <div className="flex items-center justify-center p-1 rounded-2xl bg-black/10 backdrop-blur-xs border border-white/30 mb-2.5 sm:mb-4">
              <EyeFocusable
                id="auth-tab-login"
                onSelect={() => onModeChange('login')}
                speakLabel="Đăng nhập"
                className="flex-1"
              >
                <button
                  type="button"
                  onClick={() => onModeChange('login')}
                  className={`w-full py-2 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer select-none flex items-center justify-center ${mode === 'login'
                      ? 'bg-white/50 text-[#14213D] shadow-2xs border border-white/50'
                      : 'text-[#14213D]/70 hover:text-[#14213D] hover:bg-white/20'
                    }`}
                >
                  Đăng nhập
                </button>
              </EyeFocusable>

              <EyeFocusable
                id="auth-tab-register"
                onSelect={() => onModeChange('register')}
                speakLabel="Đăng ký"
                className="flex-1"
              >
                <button
                  type="button"
                  onClick={() => onModeChange('register')}
                  className={`w-full py-2 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer select-none flex items-center justify-center ${mode === 'register'
                      ? 'bg-white/50 text-[#14213D] shadow-2xs border border-white/50'
                      : 'text-[#14213D]/70 hover:text-[#14213D] hover:bg-white/20'
                    }`}
                >
                  Đăng ký
                </button>
              </EyeFocusable>
            </div>

            {/* Form Content Area */}
            <div className="w-full">
              <AnimatePresence mode="wait" initial={false}>
                {mode === 'login' ? (
                  <motion.div
                    key="auth-mode-login"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <LoginForm
                      onSuccess={onLoginSuccess}
                      onAuthStart={onAuthStart}
                      onPendingEmailOtpChange={onPendingEmailOtpChange}
                      onSwitchToRegister={() => {
                        onPendingEmailOtpChange?.(false);
                        onModeChange('register');
                      }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="auth-mode-register"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <RegisterForm
                      onSuccess={onLoginSuccess}
                      onAuthStart={onAuthStart}
                      onSwitchToLogin={() => onModeChange('login')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
