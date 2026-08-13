import React, { useRef, useEffect, ReactNode, useState, memo, useCallback } from 'react';
import { useEyeNavigationContext } from './EyeNavigationProvider';
import { useEyeTrackingSettings } from './useEyeTracking';
import { motion, AnimatePresence } from 'motion/react';
import { speakVietnamese } from '../../utils/speech';

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
  speakLabel?: string;
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
  speakLabel,
}: EyeFocusableProps) {
  const Component = ComponentProp as React.ElementType;
  const elementRef = useRef<HTMLDivElement>(null);
  const { activeFocusId, registerFocusNode, unregisterFocusNode, setFocusId } = useEyeNavigationContext();
  const { settings } = useEyeTrackingSettings();

  const [isSelecting, setIsSelecting] = useState(false);
  const isFocused = settings.eyeControlEnabled && activeFocusId === id;

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const speakLabelRef = useRef(speakLabel);
  useEffect(() => {
    speakLabelRef.current = speakLabel;
  }, [speakLabel]);

  // Extract clear voice text from element or props
  const getVoiceText = useCallback((): string => {
    if (speakLabelRef.current) return speakLabelRef.current;
    if (!elementRef.current) return '';

    const el = elementRef.current;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const titleAttr = el.getAttribute('title');
    if (titleAttr) return titleAttr;

    const rawText = el.innerText || el.textContent || '';
    if (!rawText) return '';

    // Take first non-empty line
    const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    let clean = lines[0]
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🎯✨⚡🚀🔥]/gu, '')
      .trim();

    if (clean.length > 40) {
      clean = clean.substring(0, 40).trim();
    }

    return clean;
  }, []);

  const handleSelect = useCallback(() => {
    setIsSelecting(true);
    setTimeout(() => setIsSelecting(false), 180);

    const text = getVoiceText();
    if (text) {
      speakVietnamese(`Đã chọn ${text}`);
    }

    if (onSelectRef.current) onSelectRef.current();
  }, [getVoiceText]);

  // Automatically announce voice out loud when eye focus changes to this item
  useEffect(() => {
    if (isFocused) {
      const text = getVoiceText();
      if (text) {
        const timer = setTimeout(() => {
          speakVietnamese(text);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isFocused, getVoiceText]);

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
  }, [id, groupId, row, col, registerFocusNode, unregisterFocusNode, handleSelect]);

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
