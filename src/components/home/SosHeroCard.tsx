import React, { memo } from 'react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { ShieldAlert, PhoneCall } from 'lucide-react';
import { motion } from 'motion/react';

interface SosHeroCardProps {
  onClick: () => void;
  row?: number;
  col?: number;
}

export const SosHeroCard = memo(function SosHeroCard({
  onClick,
  row = 2,
  col = 0,
}: SosHeroCardProps) {
  return (
    <EyeFocusable
      id="card-sos"
      onSelect={onClick}
      row={row}
      col={col}
      className="w-full"
    >
      <motion.div
        whileTap={{ scale: 0.975 }}
        transition={{ duration: 0.12 }}
        className="relative w-full min-h-[100px] sm:min-h-[108px] p-4.5 sm:p-5.5 rounded-[26px_30px_26px_30px] bg-gradient-to-r from-[#FF6F61] via-[#FF6F61] to-[#FF8577] text-white border-3 border-[#FF6F61] shadow-[0_12px_32px_-4px_rgba(255,111,97,0.38)] flex items-center justify-between gap-4 overflow-hidden select-none"
      >
        {/* Subtle Ambient Inset Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          {/* Urgent Shield Emblem */}
          <div className="relative w-13 h-13 sm:w-15 sm:h-15 rounded-[18px] bg-white/20 backdrop-blur-xs border-2 border-white/40 flex items-center justify-center flex-shrink-0 shadow-inner">
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>

          {/* Typography */}
          <div className="flex flex-col">
            <h3 className="font-black tracking-tight text-xl sm:text-2xl uppercase leading-tight drop-shadow-xs">
              SOS KHẨN CẤP
            </h3>
            <p className="text-xs sm:text-sm text-white/95 font-bold mt-0.5 leading-snug">
              Báo động & Gọi khẩn cấp trong 8 giây
            </p>
          </div>
        </div>

        {/* Right Quick Action Beacon */}
        <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-[#FF6F61] font-black text-xs shadow-md flex-shrink-0">
          <PhoneCall className="w-4 h-4 text-[#FF6F61]" />
          <span>GỌI 115 / BS</span>
        </div>
      </motion.div>
    </EyeFocusable>
  );
});
