import React, { memo } from 'react';
import { Phone, MessageCircle } from 'lucide-react';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';

export const ContactsVisual = memo(function ContactsVisual() {
  const { settings } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  return (
    <div className="relative w-full h-16 sm:h-18 rounded-[16px] bg-gradient-to-br from-[#FF6F61]/12 via-[#FFF2D6]/60 to-amber-500/15 border border-[#FF6F61]/25 px-2.5 py-1.5 flex items-center justify-between overflow-hidden">
      {/* Overlapping Human Avatars Group */}
      <div className="flex items-center -space-x-2.5 pl-0.5 z-10">
        {/* Avatar 1: Doctor / Main Caregiver */}
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#14213D] to-[#3B4B68] border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-xs">
          <span>BS</span>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
        </div>

        {/* Avatar 2: Family / Loved One */}
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#FF6F61] to-[#FF8577] border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-xs">
          <span>MẸ</span>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
        </div>

        {/* Avatar 3: Caretaker */}
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#6AC9F0] to-[#3B4B68] border-2 border-white flex items-center justify-center text-[#14213D] text-[10px] font-black shadow-xs">
          <span>CON</span>
        </div>
      </div>

      {/* Quick Action Bridge Pill */}
      <div className="flex flex-col items-end justify-center pr-1 z-10">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 border border-[#14213D]/10 text-[10px] font-black text-[#14213D] shadow-2xs">
          <Phone className={`w-3 h-3 text-[#FF6F61] ${!isEyeMode ? 'animate-bounce' : ''}`} />
          <MessageCircle className="w-3 h-3 text-[#6AC9F0]" />
        </div>
        <span className="text-[9px] font-bold text-[#3B4B68] mt-0.5 tracking-tight">
          Gọi & Nhắn tin
        </span>
      </div>
    </div>
  );
});
