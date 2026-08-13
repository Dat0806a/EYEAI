import React, { memo } from 'react';
import { Eye, Settings as SettingsIcon, ArrowLeft } from 'lucide-react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';
import { KeyboardHudSlot } from './KeyboardHudSlot';

interface PageHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

export const PageHeader = memo(function PageHeader({
  title = 'LUCKY DREAM',
  showBack = false,
  onBack,
  onOpenSettings,
}: PageHeaderProps) {
  const { settings, setEyeControlEnabled } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  return (
    <div className="sticky top-0 z-[50] w-full flex flex-col">
      <header className="bg-[#FFF2D6]/95 backdrop-blur-md border-b-2 border-[#14213D]/10 py-3.5 px-4 md:px-6 flex items-center justify-between shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          {showBack && onBack ? (
            <EyeFocusable id="btn-header-back" onSelect={onBack} speakLabel="Quay lại">
              <div className="p-3 rounded-[16px] bg-white border-2 border-[#14213D]/15 text-[#14213D] hover:bg-slate-50 active:scale-95 transition-transform min-h-[48px] min-w-[48px] flex items-center justify-center shadow-xs">
                <ArrowLeft className="w-5 h-5" />
              </div>
            </EyeFocusable>
          ) : (
            <div className="flex items-center gap-2.5">
              {/* Custom Orbital Brand Eye Mark */}
              <div className="relative w-10 h-10 rounded-[14px] bg-gradient-to-tr from-[#14213D] to-[#3B4B68] text-[#6AC9F0] border-2 border-[#6AC9F0]/60 flex items-center justify-center shadow-xs flex-shrink-0">
                <Eye className="w-5 h-5 text-[#6AC9F0] animate-pulse" />
                <div className="absolute inset-0 rounded-[14px] border border-[#6AC9F0]/40 pointer-events-none" />
              </div>

              {/* Brand Typography Hierarchy */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-black text-xl md:text-2xl tracking-tight text-[#14213D] uppercase">
                    LUCKY
                  </span>
                  <span className="font-black text-xl md:text-2xl tracking-tight text-[#6AC9F0] uppercase">
                    DREAM
                  </span>
                </div>
                <span className="text-[10px] font-extrabold text-[#3B4B68] tracking-widest uppercase mt-0.5">
                  EYEAI ACCESSIBILITY
                </span>
              </div>
            </div>
          )}

          {showBack && (
            <h1 className="font-black text-lg md:text-xl text-[#14213D] truncate ml-1">
              {title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Eye Mode Interactive Toggle Button Pill */}
          <EyeFocusable
            id="btn-header-eyemode-toggle"
            onSelect={() => setEyeControlEnabled(!isEyeMode)}
            speakLabel={isEyeMode ? 'Chế độ mắt đang bật' : 'Chế độ mắt đang tắt'}
          >
            <button
              type="button"
              onClick={() => setEyeControlEnabled(!isEyeMode)}
              title={isEyeMode ? 'Tắt Eye Mode' : 'Bật Eye Mode'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border-2 transition-all cursor-pointer active:scale-95 select-none ${
                isEyeMode
                  ? 'bg-[#6AC9F0]/20 text-[#14213D] border-[#6AC9F0]/60 shadow-xs hover:bg-[#6AC9F0]/30'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isEyeMode ? 'bg-[#6AC9F0] animate-pulse shadow-[0_0_8px_#6AC9F0]' : 'bg-rose-500'
                }`}
              />
              <span className="tracking-wide">EYE MODE {isEyeMode ? 'ON' : 'OFF'}</span>
            </button>
          </EyeFocusable>

          {/* Accessible Settings Button with Generous Hitbox */}
          {onOpenSettings && (
            <EyeFocusable id="btn-header-settings" onSelect={onOpenSettings} speakLabel="Cài đặt hệ thống">
              <div
                className="p-2.5 rounded-[16px] bg-white border-2 border-[#14213D]/15 text-[#14213D] hover:bg-slate-50 active:scale-95 transition-transform min-h-[48px] min-w-[48px] flex items-center justify-center shadow-xs"
                aria-label="Cài đặt hệ thống"
              >
                <SettingsIcon className="w-5 h-5 text-[#14213D]" />
              </div>
            </EyeFocusable>
          )}
        </div>
      </header>

      {/* Camera HUD Bar Slot (First content element directly below header when keyboard is open) */}
      <KeyboardHudSlot />
    </div>
  );
});
