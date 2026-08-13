import React, { useState, useEffect } from 'react';
import { Volume2, CheckCircle2 } from 'lucide-react';
import { unlockAudio, speakVietnamese } from '../../utils/speech';

export function AudioUnlockBanner() {
  const [unlocked, setUnlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleTap = () => {
      unlockAudio();
      setUnlocked(true);
    };

    window.addEventListener('pointerdown', handleTap, { passive: true });
    window.addEventListener('touchstart', handleTap, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleTap);
      window.removeEventListener('touchstart', handleTap);
    };
  }, []);

  const handleEnableClick = () => {
    unlockAudio();
    setUnlocked(true);
    setDismissed(true);
    speakVietnamese('Âm thanh trợ lý EyeTalk đã sẵn sàng');
  };

  if (unlocked || dismissed) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md pointer-events-auto transition-all animate-bounce">
      <button
        type="button"
        onClick={handleEnableClick}
        className="w-full bg-[#14213D] text-[#6AC9F0] border-2 border-[#6AC9F0] shadow-[0_10px_25px_rgba(20,33,61,0.4)] rounded-full px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 className="w-5 h-5 text-[#6AC9F0] animate-pulse flex-shrink-0" />
          <span className="truncate">Bấm vào đây để bật Giọng Nói trên iPhone</span>
        </div>
        <span className="bg-[#6AC9F0] text-[#14213D] px-2.5 py-1 rounded-full text-[11px] font-black uppercase flex-shrink-0 shadow-xs">
          KÍCH HOẠT LOA
        </span>
      </button>
    </div>
  );
}
