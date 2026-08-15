import React, { memo } from 'react';
import { motion } from 'motion/react';

export interface AuthHeroTextProps {
  mode: 'login' | 'register';
}

export const AuthHeroText = memo(function AuthHeroText({ mode }: AuthHeroTextProps) {
  return (
    <div className="w-full text-center px-4 pt-1 pb-1.5 select-none">
      {mode === 'login' ? (
        <motion.div
          key="hero-login"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-0.5"
        >
          <h2 className="font-black text-xl sm:text-2xl text-white tracking-tight drop-shadow-[0_2px_8px_rgba(10,25,47,0.85)]">
            Chào mừng bạn
          </h2>
          <p className="text-[11px] sm:text-xs font-semibold text-white/95 tracking-normal drop-shadow-[0_1px_4px_rgba(10,25,47,0.85)]">
            Tiếp tục để sử dụng LUCKY DREAM
          </p>

          {/* Minimalist Dots Indicator */}
          <div className="flex items-center gap-1.5 mt-0.5 opacity-85">
            <span className="w-1 h-1 rounded-full bg-[#6AC9F0]" />
            <span className="text-[10px] text-[#FFD338]">★</span>
            <span className="w-1 h-1 rounded-full bg-[#6AC9F0]" />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="hero-register"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-0.5"
        >
          <h2 className="font-black text-xl sm:text-2xl text-white tracking-tight drop-shadow-[0_2px_8px_rgba(10,25,47,0.85)] flex items-center justify-center gap-1">
            <span>Bắt đầu cùng Lucky Dream</span>
            <span className="text-[#FF6F61] text-base">❤️</span>
          </h2>
          <p className="text-[11px] sm:text-xs font-semibold text-white/95 tracking-normal drop-shadow-[0_1px_4px_rgba(10,25,47,0.85)]">
            Tạo tài khoản để khám phá điều may mắn
          </p>

          {/* Minimalist Dots Indicator */}
          <div className="flex items-center gap-1.5 mt-0.5 opacity-85">
            <span className="w-1 h-1 rounded-full bg-[#6AC9F0]" />
            <span className="text-[10px] text-[#FF6F61]">★</span>
            <span className="w-1 h-1 rounded-full bg-[#6AC9F0]" />
          </div>
        </motion.div>
      )}
    </div>
  );
});
