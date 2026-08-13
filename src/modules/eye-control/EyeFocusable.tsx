import React, { useRef, useEffect, ReactNode, useState, memo } from 'react';
import { useEyeNavigationContext } from './EyeNavigationProvider';
import { useEyeTrackingSettings } from './useEyeTracking';
import { motion, AnimatePresence } from 'motion/react';

interface EyeFocusableProps {
  id: string;
  key?: React.Key;
  onSelect?: () => void;
  groupId?: string;
  row?: number;
  col?: number;
  className?: string;
  children: ReactNode;
  as?: keyof React.JSX.IntrinsicElements;
}

export const EyeFocusable = memo(function EyeFocusable({
  id,
  onSelect,
  groupId,
  row,
  col,
  className = '',
  children,
  as: ComponentProp = 'div',
}: EyeFocusableProps) {
  const Component = ComponentProp as React.ElementType;
  const elementRef = useRef<HTMLDivElement>(null);
  const { activeFocusId, registerFocusNode, unregisterFocusNode, setFocusId } = useEyeNavigationContext();
  const { settings } = useEyeTrackingSettings();

  const [isSelecting, setIsSelecting] = useState(false);
  const isFocused = settings.eyeControlEnabled && activeFocusId === id;

  const handleSelect = () => {
    setIsSelecting(true);
    setTimeout(() => setIsSelecting(false), 180);
    if (onSelect) onSelect();
  };

  useEffect(() => {
    if (!elementRef.current) return;

    registerFocusNode({
      id,
      element: elementRef.current,
      groupId,
      row,
      col,
      onSelect: handleSelect,
    });

    return () => {
      unregisterFocusNode(id);
    };
  }, [id, groupId, row, col, registerFocusNode, unregisterFocusNode]);

  return (
    <Component
      ref={elementRef as any}
      id={`eye-focusable-${id}`}
      tabIndex={0}
      onClick={handleSelect}
      onFocus={() => setFocusId(id)}
      className={`relative transition-all duration-180 cursor-pointer select-none ${
        isFocused ? 'scale-[1.045] z-30 brightness-[1.04]' : ''
      } ${isSelecting ? 'scale-[0.965] brightness-115' : ''} ${className}`}
    >
      {children}

      {/* Signature Ultra High-Contrast Eye Focus Ring & Glowing Cursor Reticle */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            layoutId="eye-focus-glide-ring"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{
              type: 'spring',
              stiffness: 480,
              damping: 30,
              mass: 0.6,
            }}
            className="absolute -inset-2 rounded-[28px] border-[4px] border-[#00E5FF] ring-3 ring-[#14213D] bg-[#00E5FF]/10 shadow-[0_0_40px_#00E5FF,0_0_20px_rgba(0,229,255,0.9),inset_0_0_16px_rgba(0,229,255,0.4)] pointer-events-none z-30"
          >
            {/* Outer Iris Aperture Pulsing Accent */}
            <div className="absolute -inset-1 rounded-[30px] border-2 border-[#00E5FF] animate-ping pointer-events-none opacity-50" />

            {/* Glowing Corner Gaze Cursor Target Reticle Badge */}
            <div className="absolute -top-3.5 -right-3.5 z-40 flex items-center justify-center">
              <span className="relative flex h-8 w-8 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E5FF] opacity-90" />
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#00E5FF] text-[#14213D] font-black text-xs shadow-[0_0_16px_#00E5FF] border-2 border-[#14213D]">
                  🎯
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Selection Flash Overlay */}
      <AnimatePresence>
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0 rounded-[24px] bg-[#00E5FF]/45 pointer-events-none z-40"
          />
        )}
      </AnimatePresence>
    </Component>
  );
});
