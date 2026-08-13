import React, { memo } from 'react';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';

export const EntertainmentVisual = memo(function EntertainmentVisual() {
  const { settings } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  return (
    <div className="relative w-full h-16 sm:h-18 rounded-[16px] bg-gradient-to-br from-[#6AC9F0]/15 via-[#FFF2D6]/60 to-[#6AC9F0]/25 border border-[#6AC9F0]/30 px-2.5 py-1.5 flex items-center justify-between overflow-hidden">
      {/* Vinyl Disc with Center Iris Accent */}
      <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#14213D] border-2 border-[#6AC9F0]/60 flex items-center justify-center flex-shrink-0 shadow-xs">
        <div className="absolute inset-1 rounded-full border border-white/15" />
        <div className="w-4 h-4 rounded-full bg-[#6AC9F0] border border-white/40 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-[#14213D]" />
        </div>
      </div>

      {/* Sound Equalizer Waveform Bars */}
      <div className="flex items-end gap-1 h-8 sm:h-9 px-1 flex-1 justify-center">
        {[45, 80, 60, 95, 50].map((height, idx) => (
          <div
            key={idx}
            style={{ height: `${height}%` }}
            className={`w-1.5 rounded-full bg-gradient-to-t from-[#14213D] to-[#6AC9F0] transition-all duration-300 ${
              !isEyeMode ? 'animate-pulse' : ''
            }`}
          />
        ))}
      </div>

      {/* Floating Melody Note Emblem */}
      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 border border-[#14213D]/10 flex items-center justify-center shadow-xs flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-[#14213D]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      </div>
    </div>
  );
});
