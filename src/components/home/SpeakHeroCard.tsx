import React, { memo } from 'react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { Volume2, Sparkle } from 'lucide-react';
import { motion } from 'motion/react';

interface SpeakHeroCardProps {
  onClick: () => void;
  row?: number;
  col?: number;
}

export const SpeakHeroCard = memo(function SpeakHeroCard({
  onClick,
  row = 0,
  col = 0,
}: SpeakHeroCardProps) {
  return (
    <EyeFocusable
      id="card-speak"
      onSelect={onClick}
      row={row}
      col={col}
      className="w-full"
    >
      <motion.div
        whileTap={{ scale: 0.975 }}
        transition={{ duration: 0.12 }}
        className="relative w-full min-h-[104px] sm:min-h-[112px] p-4 sm:p-5 rounded-[26px_30px_26px_30px] bg-gradient-to-r from-[#6AC9F0] via-[#52BBE6] to-[#3AAAD8] text-[#14213D] border-3 border-[#14213D]/20 shadow-[0_10px_28px_-4px_rgba(106,201,240,0.45)] flex items-center justify-between gap-3 sm:gap-4 overflow-hidden select-none cursor-pointer"
      >
        {/* Subtle Ambient Inset Glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-white/20 pointer-events-none" />

        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
          {/* Voice Speaker Emblem */}
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-[18px] bg-[#14213D] text-[#6AC9F0] border-2 border-white/40 flex items-center justify-center flex-shrink-0 shadow-md">
            <Volume2 className="w-6 h-6 sm:w-7 sm:h-7 animate-pulse" />
          </div>

          {/* Typography */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-[#14213D] text-[#6AC9F0] font-black text-[10px] uppercase tracking-wider">
                LOA NGOẠI
              </span>
            </div>
            <h3 className="font-black tracking-tight text-lg sm:text-2xl text-[#14213D] leading-tight drop-shadow-xs mt-0.5">
              Nói chuyện với người xung quanh
            </h3>
            <p className="text-xs sm:text-sm text-[#14213D]/80 font-bold mt-0.5 leading-snug">
              Gõ để thiết bị nói thay bạn
            </p>
          </div>
        </div>

        {/* Right Quick Action Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#14213D] text-[#6AC9F0] font-black text-xs shadow-sm flex-shrink-0 border border-white/30">
          <Sparkle className="w-3.5 h-3.5 text-[#6AC9F0]" />
          <span>BẢNG NÓI</span>
        </div>
      </motion.div>
    </EyeFocusable>
  );
});
