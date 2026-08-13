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
      className={`relative transition-transform duration-180 cursor-pointer select-none ${
        isFocused ? 'scale-[1.02] z-30' : ''
      } ${isSelecting ? 'scale-[0.965] brightness-110' : ''} ${className}`}
    >
      {children}

      {/* Signature Lucky Dream Eye Glide Ring Overlay */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            layoutId="eye-focus-glide-ring"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{
              type: 'spring',
              stiffness: 450,
              damping: 32,
              mass: 0.7,
            }}
            className="absolute -inset-1.5 rounded-[26px_32px_26px_26px] border-3.5 border-[#6AC9F0] shadow-[0_0_28px_rgba(106,201,240,0.55),inset_0_0_12px_rgba(106,201,240,0.20)] pointer-events-none z-20"
          >
            {/* Outer Iris Aperture Halo Accent */}
            <div className="absolute -inset-1 rounded-[28px_34px_28px_28px] border border-[#6AC9F0]/40 animate-aperture pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soft Confirm Selection Flash Overlay */}
      <AnimatePresence>
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0 rounded-[24px_28px_24px_24px] bg-[#6AC9F0]/25 pointer-events-none z-30"
          />
        )}
      </AnimatePresence>
    </Component>
  );
});
