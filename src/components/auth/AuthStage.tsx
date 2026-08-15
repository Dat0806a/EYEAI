import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthBackgroundVideo } from './AuthBackgroundVideo';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';

export interface AuthStageProps {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onLoginSuccess: () => void;
}

export function AuthStage({ mode, onModeChange, onLoginSuccess }: AuthStageProps) {
  return (
    <div
      className="fixed inset-0 w-full h-[100dvh] overflow-y-auto overscroll-none bg-[#75CBEB] flex flex-col justify-end items-center select-none z-10"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* 
        Full-Screen Background Video
        Mascot and scenery float in the upper/middle screen area behind the transparent form
      */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <AuthBackgroundVideo />
      </div>

      {/* 
        Bottom Sheet Form Overlay: Responsive Mobile Glassmorphism Container
      */}
      <div
        id="auth-bottom-sheet"
        className="relative z-10 w-full max-w-md sm:max-w-lg mx-auto bg-white/15 backdrop-blur-md rounded-t-[24px] sm:rounded-t-[32px] p-3.5 sm:p-6 border-t border-white/40 shadow-[0_-8px_36px_rgba(20,33,61,0.18)] max-h-[88dvh] overflow-y-auto transition-all duration-300 touch-pan-y"
      >
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
              className={`w-full py-2 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer select-none flex items-center justify-center ${
                mode === 'login'
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
              className={`w-full py-2 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer select-none flex items-center justify-center ${
                mode === 'register'
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
                  onSwitchToRegister={() => onModeChange('register')}
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
                  onSwitchToLogin={() => onModeChange('login')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
