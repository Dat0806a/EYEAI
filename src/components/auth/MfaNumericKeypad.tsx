import React from 'react';
import { Delete, RotateCcw } from 'lucide-react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';

export interface MfaNumericKeypadProps {
  value: string;
  onChange: (nextValue: string) => void;
  maxLength?: number;
  disabled?: boolean;
  idPrefix?: string;
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function MfaNumericKeypad({
  value,
  onChange,
  maxLength = 6,
  disabled = false,
  idPrefix = 'mfa-pad',
}: MfaNumericKeypadProps) {
  const handleDigit = (digit: string) => {
    if (disabled) return;
    if (value.length >= maxLength) return;
    onChange(`${value}${digit}`);
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled || value.length === 0) return;
    onChange('');
  };

  return (
    <div className="flex flex-col gap-2 select-none" role="group" aria-label="Bàn phím số OTP">
      <div className="grid grid-cols-3 gap-2">
        {DIGIT_ROWS.map((rowDigits, rowIdx) =>
          rowDigits.map((digit, colIdx) => (
            <EyeFocusable
              key={digit}
              id={`${idPrefix}-digit-${digit}`}
              onSelect={() => handleDigit(digit)}
              row={rowIdx}
              col={colIdx}
              speakLabel={`Số ${digit}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleDigit(digit)}
                className="w-full h-11 rounded-xl bg-white/80 hover:bg-white border border-[#14213D]/15 text-[#0A192F] font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {digit}
              </button>
            </EyeFocusable>
          ))
        )}

        <EyeFocusable
          id={`${idPrefix}-clear`}
          onSelect={handleClear}
          row={3}
          col={0}
          speakLabel="Xóa hết mã OTP"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={handleClear}
            aria-label="Xóa hết"
            className="w-full h-11 rounded-xl bg-amber-100/90 hover:bg-amber-200/90 border border-amber-300 text-amber-950 font-black text-xs flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Xóa hết</span>
          </button>
        </EyeFocusable>

        <EyeFocusable
          id={`${idPrefix}-digit-0`}
          onSelect={() => handleDigit('0')}
          row={3}
          col={1}
          speakLabel="Số 0"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDigit('0')}
            className="w-full h-11 rounded-xl bg-white/80 hover:bg-white border border-[#14213D]/15 text-[#0A192F] font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            0
          </button>
        </EyeFocusable>

        <EyeFocusable
          id={`${idPrefix}-backspace`}
          onSelect={handleBackspace}
          row={3}
          col={2}
          speakLabel="Xóa một số"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={handleBackspace}
            aria-label="Xóa lùi"
            className="w-full h-11 rounded-xl bg-slate-200/90 hover:bg-slate-300 border border-slate-300 text-[#0A192F] font-black text-xs flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Delete className="w-4 h-4" />
            <span>Xóa</span>
          </button>
        </EyeFocusable>
      </div>
    </div>
  );
}
