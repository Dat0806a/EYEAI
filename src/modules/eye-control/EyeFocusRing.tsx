import React from 'react';
import { motion } from 'motion/react';

interface EyeFocusRingProps {
  visible: boolean;
  className?: string;
}

export function EyeFocusRing({ visible, className = '' }: EyeFocusRingProps) {
  if (!visible) return null;

  return (
    <motion.div
      layoutId="eye-glide-ring"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 450,
        damping: 32,
        mass: 0.7,
      }}
      className={`absolute -inset-1 rounded-[26px] border-4 border-[#00E5FF] ring-2 ring-[#14213D] shadow-[0_0_32px_#00E5FF,0_0_16px_rgba(0,229,255,0.8),inset_0_0_14px_rgba(0,229,255,0.35)] pointer-events-none z-20 ${className}`}
    />
  );
}
