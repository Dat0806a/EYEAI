import React, { ReactNode, memo } from 'react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';
import { motion } from 'motion/react';

interface FeatureCardProps {
  id: string;
  title: string;
  description: string;
  visualNode: ReactNode;
  onClick: () => void;
  row?: number;
  col?: number;
  className?: string;
  railColor?: string;
}

export const FeatureCard = memo(function FeatureCard({
  id,
  title,
  description,
  visualNode,
  onClick,
  row,
  col,
  className = '',
  railColor = 'from-[#6AC9F0] via-[#6AC9F0]/40 to-transparent',
}: FeatureCardProps) {
  const { settings } = useEyeTrackingSettings();
  const isLiving = !settings.eyeControlEnabled;

  return (
    <EyeFocusable
      id={id}
      onSelect={onClick}
      row={row}
      col={col}
      className={`w-full ${className}`}
    >
      <motion.div
        whileTap={{ scale: 0.965 }}
        transition={{ duration: 0.12 }}
        className={`relative w-full min-h-[154px] sm:min-h-[168px] p-3.5 sm:p-4.5 rounded-[22px_26px_22px_22px] bg-white text-[#14213D] border-2 border-[#14213D]/12 shadow-[0_6px_18px_-4px_rgba(20,33,61,0.07)] hover:shadow-md hover:border-[#6AC9F0]/60 transition-all flex flex-col justify-between overflow-hidden select-none ${
          isLiving ? 'living-card-float' : ''
        }`}
      >
        {/* Top Tactile Highlight Rail */}
        <div className={`absolute top-0 left-0 right-0 h-[3.5px] bg-gradient-to-r ${railColor}`} />

        {/* Top Feature Visual Mini Scene */}
        <div className="w-full">
          {visualNode}
        </div>

        {/* Bottom Feature Typography */}
        <div className="mt-2 flex flex-col">
          <h3 className="font-black tracking-tight text-base sm:text-lg text-[#14213D] leading-tight">
            {title}
          </h3>
          <p className="text-[10px] sm:text-xs text-[#3B4B68] font-bold mt-0.5 leading-snug line-clamp-1">
            {description}
          </p>
        </div>
      </motion.div>
    </EyeFocusable>
  );
});
