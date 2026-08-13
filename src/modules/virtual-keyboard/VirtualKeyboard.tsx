import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QWERTY_LAYOUT, NUMBERS_LAYOUT, PHRASES_LAYOUT } from './keyboardLayout';
import { GridItem, VirtualKeyboardProps } from './types';
import { EyeFocusable } from '../eye-control/EyeFocusable';
import { ChevronDown, Delete, Send, Search } from 'lucide-react';
import { useEyeTrackingSettings } from '../eye-control/useEyeTracking';

export function VirtualKeyboard({
  isOpen,
  onClose,
  onKeyPress,
  actionLabel = 'Gửi',
}: VirtualKeyboardProps & { actionLabel?: string }) {
  const { setKeyboardOpen } = useEyeTrackingSettings();
  const [layoutMode, setLayoutMode] = useState<'QWERTY' | 'NUMBERS' | 'PHRASES'>('QWERTY');
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure keyboard height and inform global context for floating HUD position
  useEffect(() => {
    setKeyboardOpen(isOpen);

    if (!isOpen) {
      document.documentElement.style.setProperty('--virtual-keyboard-height', '0px');
      return;
    }

    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.offsetHeight;
        document.documentElement.style.setProperty('--virtual-keyboard-height', `${height}px`);
      }
    };

    updateHeight();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(containerRef.current);
    }

    return () => {
      if (observer) observer.disconnect();
      document.documentElement.style.setProperty('--virtual-keyboard-height', '0px');
      setKeyboardOpen(false);
    };
  }, [isOpen, setKeyboardOpen]);

  if (!isOpen) return null;

  const currentLayout =
    layoutMode === 'NUMBERS'
      ? NUMBERS_LAYOUT
      : layoutMode === 'PHRASES'
      ? PHRASES_LAYOUT
      : QWERTY_LAYOUT;

  const handleKeyClick = (item: GridItem) => {
    if (item.value === 'TOGGLE_NUMBERS') {
      setLayoutMode('NUMBERS');
      return;
    }
    if (item.value === 'TOGGLE_PHRASES') {
      setLayoutMode('PHRASES');
      return;
    }
    if (item.value === 'TOGGLE_ABC') {
      setLayoutMode('QWERTY');
      return;
    }
    onKeyPress(item);
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        id="smartphone-virtual-keyboard"
        className="fixed bottom-0 left-0 right-0 z-[80] bg-[#FFF2D6] border-t-2 border-[#14213D]/15 shadow-[0_-8px_30px_rgba(20,33,61,0.12)] px-1 sm:px-3 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] select-none flex flex-col justify-end"
      >
        {/* Minimal Control Bar: Mode Tabs + Close Button */}
        <div className="flex items-center justify-between px-1 mb-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLayoutMode('QWERTY')}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black transition-colors ${
                layoutMode === 'QWERTY'
                  ? 'bg-[#14213D] text-[#6AC9F0]'
                  : 'bg-white/60 text-[#3B4B68] hover:bg-white'
              }`}
            >
              ABC
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('NUMBERS')}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black transition-colors ${
                layoutMode === 'NUMBERS'
                  ? 'bg-[#14213D] text-[#6AC9F0]'
                  : 'bg-white/60 text-[#3B4B68] hover:bg-white'
              }`}
            >
              123
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('PHRASES')}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black transition-colors ${
                layoutMode === 'PHRASES'
                  ? 'bg-[#14213D] text-[#6AC9F0]'
                  : 'bg-white/60 text-[#3B4B68] hover:bg-white'
              }`}
            >
              Mẫu câu
            </button>
          </div>

          {onClose && (
            <EyeFocusable id="btn-close-keyboard" onSelect={onClose}>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full bg-white/80 hover:bg-white text-[#14213D] border border-[#14213D]/10 shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Đóng bàn phím"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </EyeFocusable>
          )}
        </div>

        {/* 4 Compact Rows Smartphone Keyboard Grid */}
        <div className="flex flex-col gap-1 sm:gap-1.5 w-full max-w-2xl mx-auto">
          {currentLayout.map((row, rowIndex) => (
            <div
              key={`kb-row-${layoutMode}-${rowIndex}`}
              className="flex items-center justify-center gap-1 sm:gap-1.5 w-full"
            >
              {row.map((item, colIndex) => {
                const isSpace = item.id.includes('space');
                const isSend = item.id.includes('send') || item.value === 'SEND';
                const isBackspace = item.id.includes('backspace') || item.value === 'BACKSPACE';
                const isToggle = item.value.startsWith('TOGGLE_');

                // Dynamic Flex Widths for standard mobile composition
                const flexStyle = isSpace
                  ? 'flex-[2.5]'
                  : isSend
                  ? 'flex-[1.8]'
                  : isToggle || isBackspace
                  ? 'flex-[1.2]'
                  : 'flex-1';

                const buttonLabel = isSend ? actionLabel : item.label;

                return (
                  <EyeFocusable
                    key={`${layoutMode}-${item.id}`}
                    id={`key-${item.id}`}
                    row={rowIndex}
                    col={colIndex}
                    groupId="virtual-keyboard"
                    onSelect={() => handleKeyClick(item)}
                    className={`${flexStyle} min-w-0 h-[40px] sm:h-[46px] rounded-[8px] sm:rounded-[10px] bg-white text-[#14213D] font-extrabold text-sm sm:text-base border border-[#14213D]/15 shadow-2xs flex items-center justify-center active:scale-95 transition-transform ${
                      item.colorClass || (isSend ? 'bg-[#FF6F61] text-white border-[#FF6F61]' : '')
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleKeyClick(item)}
                      className="w-full h-full flex items-center justify-center px-1 truncate pointer-events-auto"
                    >
                      {isBackspace ? (
                        <Delete className="w-4 h-4 sm:w-5 sm:h-5 text-amber-900" />
                      ) : isSend && actionLabel === 'Tìm' ? (
                        <div className="flex items-center gap-1 text-white font-black text-xs sm:text-sm">
                          <Search className="w-3.5 h-3.5" />
                          <span>Tìm</span>
                        </div>
                      ) : isSend ? (
                        <div className="flex items-center gap-1 text-white font-black text-xs sm:text-sm">
                          <Send className="w-3.5 h-3.5 fill-white" />
                          <span>{buttonLabel}</span>
                        </div>
                      ) : (
                        <span>{buttonLabel}</span>
                      )}
                    </button>
                  </EyeFocusable>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
