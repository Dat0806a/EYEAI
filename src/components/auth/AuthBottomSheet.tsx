import React, { memo } from 'react';

export interface AuthBottomSheetProps {
  children: React.ReactNode;
  mode: 'login' | 'register';
}

export const AuthBottomSheet = memo(function AuthBottomSheet({
  children,
  mode,
}: AuthBottomSheetProps) {
  return (
    <div className="w-full flex flex-col justify-end z-20 pointer-events-auto">
      <div
        className="w-full max-w-md md:max-w-lg mx-auto bg-[#FFF8EE]/98 sm:bg-[#FFF8EE]/96 backdrop-blur-md rounded-t-[26px] sm:rounded-t-[30px] shadow-[0_-8px_30px_rgba(20,33,61,0.18)] border-t border-white/80 px-4 sm:px-6 pt-2 pb-[calc(0.9rem+env(safe-area-inset-bottom))] transition-all duration-300 flex flex-col"
        style={{
          maxHeight: mode === 'register' ? 'min(68dvh, 520px)' : 'min(52dvh, 410px)',
        }}
      >
        {/* Decorative Top Center Drag Handle Bar */}
        <div className="w-10 h-1 bg-[#14213D]/20 rounded-full mx-auto mb-1.5 flex-shrink-0 cursor-default select-none" />

        {/* Scrollable Form Content */}
        <div className="overflow-y-auto overflow-x-hidden pr-0.5 custom-sheet-scroll flex-1">
          {children}
        </div>
      </div>
    </div>
  );
});
