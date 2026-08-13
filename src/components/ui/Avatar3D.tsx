import React, { memo } from 'react';
import { motion } from 'motion/react';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';
import { Sparkles, Bot, Heart } from 'lucide-react';

export type AvatarState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'HAPPY' | 'EYE_MODE';

interface Avatar3DProps {
  state?: AvatarState;
  className?: string;
  onClick?: () => void;
  inlineStage?: boolean;
}

export const Avatar3D = memo(function Avatar3D({
  state = 'IDLE',
  className = '',
  onClick,
  inlineStage = false,
}: Avatar3DProps) {
  const { settings } = useEyeTrackingSettings();
  const isLowMotion = settings.eyeControlEnabled;

  const content = (
    <div className="relative group flex flex-col items-center select-none cursor-pointer" onClick={onClick}>
      {/* Companion Mascot Speech / Status Bubble */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-1.5 px-3 py-0.5 bg-white/95 backdrop-blur-md rounded-full border border-[#14213D]/15 shadow-xs flex items-center gap-1.5 text-[11px] font-black text-[#14213D] transition-transform group-hover:scale-105"
      >
        <Bot className="w-3 h-3 text-[#6AC9F0]" />
        <span>EYEAI Trợ thủ</span>
        {state === 'THINKING' ? (
          <Sparkles className="w-3 h-3 text-[#FF6F61] animate-spin" />
        ) : (
          <Heart className="w-3 h-3 text-[#FF6F61] fill-[#FF6F61]/30" />
        )}
      </motion.div>

      {/* Mascot 3D Stage Spherical Character Container */}
      <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-[#14213D] via-[#3B4B68] to-[#6AC9F0] p-1 shadow-[0_10px_24px_rgba(20,33,61,0.22)] flex items-center justify-center transition-transform group-hover:scale-105">
        {/* Concentric Eye Motif Outer Ring */}
        <div className="absolute -inset-1 rounded-full border-2 border-[#6AC9F0]/40 animate-aperture pointer-events-none" />
        
        {/* Mascot Face Canvas Graphic Container */}
        <div className="w-full h-full rounded-full bg-[#14213D] flex flex-col items-center justify-center relative overflow-hidden border-2 border-[#6AC9F0]/70">
          {/* Mascot Eyes */}
          <div className="flex items-center gap-2.5 mb-1">
            <motion.div
              animate={isLowMotion ? { scaleY: [1, 0.1, 1] } : { scaleY: [1, 0.1, 1], y: [0, -1.2, 0] }}
              transition={{ repeat: Infinity, duration: 3.5, repeatDelay: 1.2 }}
              className="w-3 h-4 bg-[#6AC9F0] rounded-full shadow-[0_0_8px_#6AC9F0]"
            />
            <motion.div
              animate={isLowMotion ? { scaleY: [1, 0.1, 1] } : { scaleY: [1, 0.1, 1], y: [0, -1.2, 0] }}
              transition={{ repeat: Infinity, duration: 3.5, repeatDelay: 1.2 }}
              className="w-3 h-4 bg-[#6AC9F0] rounded-full shadow-[0_0_8px_#6AC9F0]"
            />
          </div>

          {/* Mascot Friendly Mouth */}
          <div className="w-3.5 h-1.5 bg-[#FFF2D6] rounded-full" />
        </div>
      </div>

      {/* Ambient Floor Shadow Stage */}
      <div className="w-20 h-3 mt-1 avatar-floor-shadow rounded-full pointer-events-none" />
    </div>
  );

  if (inlineStage) {
    return <div className={`relative flex items-center justify-end ${className}`}>{content}</div>;
  }

  return (
    <motion.div
      initial={{ scale: 0.88, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed bottom-3 right-3 z-[40] pointer-events-auto ${className}`}
    >
      {content}
    </motion.div>
  );
});
