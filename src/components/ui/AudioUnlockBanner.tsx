import React, { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { unlockAudio, speakVietnamese, updateSpeechSettings, recoverAudioSession, isIOS } from '../../utils/speech';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';

export function AudioUnlockBanner() {
  const { setSpeakerEnabled } = useEyeTrackingSettings();
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem('eyetalk_audio_unlocked') === 'true';
  });

  useEffect(() => {
    const handleTap = () => {
      unlockAudio();
      recoverAudioSession();
    };

    window.addEventListener('pointerdown', handleTap, { passive: true });
    window.addEventListener('touchstart', handleTap, { passive: true });
    window.addEventListener('click', handleTap, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleTap);
      window.removeEventListener('touchstart', handleTap);
      window.removeEventListener('click', handleTap);
    };
  }, []);

  const handleEnableClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 1. Force enable speaker in EyeTracking state and speech module
    setSpeakerEnabled(true);
    updateSpeechSettings({ speakerEnabled: true });
    // 2. Perform deep unlock of AudioContext, WebKit speech queue, and HTMLAudioElement
    unlockAudio();
    recoverAudioSession();
    setUnlocked(true);
    try {
      sessionStorage.setItem('eyetalk_audio_unlocked', 'true');
    } catch {}

    // 3. Play friendly greeting sound to confirm audio is working
    // Synchronous execution ensures user gesture activation on iOS Safari!
    speakVietnamese('Âm thanh trợ lý EyeTalk đã sẵn sàng');
  };

  if (unlocked) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md pointer-events-auto transition-all animate-bounce">
      <button
        type="button"
        onClick={handleEnableClick}
        className="w-full bg-[#14213D] text-[#6AC9F0] border-2 border-[#6AC9F0] shadow-[0_10px_25px_rgba(20,33,61,0.5)] rounded-full px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 className="w-5 h-5 text-[#6AC9F0] animate-pulse flex-shrink-0" />
          <span className="truncate">
            {isIOS ? 'Chạm vào đây để bật Giọng Nói trên iPhone' : 'Chạm vào đây để bật Giọng Nói'}
          </span>
        </div>
        <span className="bg-[#6AC9F0] text-[#14213D] px-2.5 py-1 rounded-full text-[11px] font-black uppercase flex-shrink-0 shadow-xs">
          BẬT LOA
        </span>
      </button>
    </div>
  );
}
