import React, { memo } from 'react';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';

export const LocationVisual = memo(function LocationVisual() {
  const { settings } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  return (
    <div className="relative w-full h-16 sm:h-18 rounded-[16px] bg-gradient-to-br from-emerald-500/10 via-[#FFF2D6]/60 to-[#6AC9F0]/20 border border-[#6AC9F0]/30 px-2.5 py-1.5 flex items-center justify-between overflow-hidden">
      {/* Mini Map Vector Grid & Path */}
      <svg className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="map-grid-compact" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke="#14213D" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#map-grid-compact)" />
        <path
          d="M 5 45 Q 40 15 90 35 T 160 20"
          fill="none"
          stroke="#6AC9F0"
          strokeWidth="2"
          strokeDasharray="3 3"
        />
      </svg>

      {/* Radar Pulse Beacon Center */}
      <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-[14px] bg-white/90 border-2 border-[#6AC9F0]/60 flex items-center justify-center flex-shrink-0 shadow-xs z-10">
        <div className={`absolute inset-0 rounded-[14px] border border-[#6AC9F0] ${!isEyeMode ? 'animate-ping opacity-25' : 'opacity-40'}`} />
        
        {/* Stylized Location Pin */}
        <div className="relative flex flex-col items-center">
          <div className="w-5 h-5 rounded-full bg-[#14213D] border-2 border-[#6AC9F0] flex items-center justify-center shadow-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6AC9F0]" />
          </div>
          <div className="w-1 h-1 bg-[#14213D] rotate-45 -mt-0.5" />
        </div>
      </div>

      {/* Coordinates / Radar Status readout */}
      <div className="flex flex-col items-end justify-center pr-1 z-10">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/85 border border-[#14213D]/10 text-[9px] font-black text-[#14213D]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>GPS</span>
        </div>
        <span className="text-[9px] font-bold text-[#3B4B68] mt-0.5 tracking-tight">
          Định vị an toàn
        </span>
      </div>
    </div>
  );
});
