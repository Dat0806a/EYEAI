import React from 'react';
import { Volume2, Send, Keyboard, Trash2, Delete } from 'lucide-react';
import { speakVietnamese } from '../../utils/speech';
import { EyeFocusable } from '../eye-control/EyeFocusable';

interface EyeTextComposerProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  actionLabel?: string;
  onSubmit: () => void;
  onToggleKeyboard?: () => void;
  isKeyboardOpen?: boolean;
}

export function EyeTextComposer({
  value,
  onChange,
  placeholder = 'Nội dung hiển thị tại đây...',
  actionLabel = 'GỬI',
  onSubmit,
  onToggleKeyboard,
  isKeyboardOpen = false,
}: EyeTextComposerProps) {
  const handleSpeak = () => {
    if (value.trim()) {
      speakVietnamese(value);
    }
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="w-full bg-white rounded-[20px] p-2.5 sm:p-3 border-2 border-[#14213D]/10 shadow-[0_4px_20px_-4px_rgba(20,33,61,0.08)] flex flex-col gap-2">
      {/* Draft text display box */}
      <div className="relative w-full min-h-[46px] bg-[#FFF2D6]/40 rounded-[14px] px-3 py-2 border border-[#14213D]/10 flex items-center justify-between">
        <div className="flex-1 pr-2 overflow-hidden text-ellipsis whitespace-nowrap text-base sm:text-lg font-bold text-[#14213D]">
          {value ? value : <span className="text-[#3B4B68]/50 font-normal italic text-sm sm:text-base">{placeholder}</span>}
        </div>

        {/* Dynamic Action Buttons inside composer */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {value.trim() && (
            <button
              type="button"
              onClick={handleSpeak}
              className="p-1.5 rounded-full bg-[#6AC9F0]/20 text-[#14213D] hover:bg-[#6AC9F0]/40 transition-all cursor-pointer"
              title="Phát âm ra loa"
            >
              <Volume2 className="w-4 h-4 text-[#14213D]" />
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={handleBackspace}
              className="p-1.5 rounded-full bg-amber-100 text-amber-900 hover:bg-amber-200 transition-all cursor-pointer"
              title="Xóa 1 ký tự"
            >
              <Delete className="w-4 h-4" />
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-full bg-rose-100 text-rose-900 hover:bg-rose-200 transition-all cursor-pointer"
              title="Xóa tất cả"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between gap-2">
        {onToggleKeyboard && (
          <EyeFocusable
            id="btn-toggle-keyboard"
            onSelect={onToggleKeyboard}
            className="flex-1"
          >
            <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-[14px] bg-[#14213D]/5 hover:bg-[#14213D]/10 border border-[#14213D]/15 text-[#14213D] font-extrabold text-xs sm:text-sm min-h-[44px]">
              <Keyboard className="w-4 h-4 text-[#6AC9F0]" />
              <span>{isKeyboardOpen ? 'Ẩn phím' : 'Bàn phím'}</span>
            </div>
          </EyeFocusable>
        )}

        <EyeFocusable
          id="btn-composer-submit"
          onSelect={onSubmit}
          className="flex-1"
        >
          <div
            className={`flex items-center justify-center gap-1.5 py-2 px-4 rounded-[14px] font-black text-xs sm:text-sm shadow-xs min-h-[44px] ${
              actionLabel.includes('Nói')
                ? 'bg-[#6AC9F0] hover:bg-[#52BBE6] text-[#14213D] border border-[#14213D]/20'
                : 'bg-[#FF6F61] hover:bg-[#FF6F61]/90 text-white'
            }`}
          >
            {actionLabel.includes('Nói') ? (
              <Volume2 className="w-4 h-4 text-[#14213D]" />
            ) : (
              <Send className="w-4 h-4 fill-white" />
            )}
            <span>{actionLabel}</span>
          </div>
        </EyeFocusable>
      </div>
    </div>
  );
}
