import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';

export const AiVisual = memo(function AiVisual() {
  const { settings } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  return (
    <div className="relative w-full h-16 sm:h-18 rounded-[16px] bg-gradient-to-br from-indigo-500/10 via-[#FFF2D6]/60 to-[#6AC9F0]/25 border border-purple-300/35 px-2.5 py-1.5 flex items-center justify-between overflow-hidden">
      {/* AI Companion Sphere with Animated Intelligent Eyes */}
      <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-gradient-to-tr from-[#14213D] via-[#3B4B68] to-[#6AC9F0] p-0.5 flex items-center justify-center flex-shrink-0 shadow-xs z-10">
        <div className="w-full h-full rounded-full bg-[#14213D] flex flex-col items-center justify-center border border-[#6AC9F0]/60 overflow-hidden">
          {/* Glowing Companion Eyes */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2 h-2.5 bg-[#6AC9F0] rounded-full shadow-[0_0_6px_#6AC9F0]" />
            <div className="w-2 h-2.5 bg-[#6AC9F0] rounded-full shadow-[0_0_6px_#6AC9F0]" />
          </div>
          {/* Subtle Smile */}
          <div className="w-2.5 h-0.5 bg-[#FFF2D6] rounded-full" />
        </div>
      </div>

      {/* AI Intelligence Rays & Badge */}
      <div className="flex flex-col items-end justify-center pr-1 z-10">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 border border-[#14213D]/10 text-[9px] font-black text-[#14213D] shadow-2xs">
          <Sparkles className={`w-2.5 h-2.5 text-[#6AC9F0] ${!isEyeMode ? 'animate-spin' : ''}`} />
          <span>24/7</span>
        </div>
        <span className="text-[9px] font-bold text-[#3B4B68] mt-0.5 tracking-tight">
          Hỏi đáp & Lắng nghe
        </span>
      </div>
    </div>
  );
});
