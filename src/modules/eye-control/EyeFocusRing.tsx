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
      className={`absolute inset-0 rounded-[24px] border-4 border-[#6AC9F0] shadow-[0_0_24px_rgba(106,201,240,0.60)] pointer-events-none z-20 ${className}`}
    />
  );
}
