import React, { memo } from 'react';

export const AuthBrandHeader = memo(function AuthBrandHeader() {
  return (
    <div className="flex flex-col items-center justify-center pt-1.5 sm:pt-2.5 select-none">
      {/* Sleek Brand Text Lockup: LUCKY DREAM */}
      <div className="flex items-center gap-1.5 drop-shadow-[0_2px_10px_rgba(10,25,47,0.75)]">
        <span className="text-base sm:text-lg">⭐</span>
        <span className="font-black text-xl sm:text-2xl tracking-wider text-white uppercase">
          LUCKY
        </span>
        <span className="font-black text-xl sm:text-2xl tracking-wider text-[#6AC9F0] uppercase">
          DREAM
        </span>
      </div>
    </div>
  );
});
