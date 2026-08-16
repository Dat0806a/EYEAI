import React, { memo } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from '../../modules/eye-control/useEyeTracking';
import { Eye, EyeOff } from 'lucide-react';
import { CameraPreview } from '../../modules/eye-control/CameraPreview';
import { useAuth } from '../../hooks/useAuth';

export interface GlobalEyeHUDProps {
  variant?: 'floating' | 'keyboard-bar' | 'auto';
  currentRoute?: string;
}

export const GlobalEyeHUD = memo(function GlobalEyeHUD({
  variant = 'auto',
  currentRoute,
}: GlobalEyeHUDProps) {
  const { settings, setEyeControlEnabled, isKeyboardOpen } = useEyeTrackingSettings();
  const { trackingState } = useEyeTrackingTelemetry();
  const { profile } = useAuth();

  // Do not render Camera HUD for patient accounts
  if (profile?.account_type === 'patient') {
    return null;
  }

  // Do not render Camera HUD on Auth / Login / Register screens
  const isAuthRoute = currentRoute === 'auth' || currentRoute === 'login' || currentRoute === 'register';
  if (isAuthRoute) {
    return null;
  }

  // Human Chat ('chat') and AI Chat ('ai') convert to long bar mode immediately
  const isChatRoute = currentRoute === 'chat' || currentRoute === 'ai';
  const shouldRenderLongBar = isChatRoute || isKeyboardOpen;

  // Determine mode
  const mode = variant === 'auto'
    ? (shouldRenderLongBar ? 'keyboard-bar' : 'floating')
    : variant;

  // If Eye Control mode is disabled, render floating quick-re-enable button for floating variant
  if (!settings.eyeControlEnabled) {
    if (mode === 'floating') {
      return (
        <div
          id="global-eye-hud-re-enable"
          className="fixed z-[60] pointer-events-auto transition-all duration-200 ease-out"
          style={{
            left: 'max(12px, env(safe-area-inset-left))',
            bottom: 'calc(14px + env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button"
            onClick={() => setEyeControlEnabled(true)}
            className="bg-[#14213D] text-[#6AC9F0] border-2 border-[#6AC9F0]/60 shadow-[0_8px_20px_rgba(20,33,61,0.25)] rounded-full px-3.5 py-2 flex items-center gap-2 hover:bg-[#1d2f56] active:scale-95 transition-all text-xs font-black select-none cursor-pointer"
            title="Bật Camera HUD"
          >
            <Eye className="w-4 h-4 text-[#6AC9F0] animate-pulse" />
            <span>Bật Camera HUD</span>
          </button>
        </div>
      );
    }
    return null;
  }

  // Floating mode hides on chat routes or when keyboard is open
  if (mode === 'floating' && shouldRenderLongBar) {
    return null;
  }

  // Keyboard-bar mode renders ONLY on chat routes OR when keyboard is open
  if (mode === 'keyboard-bar' && !shouldRenderLongBar) {
    return null;
  }

  const {
    faceDetected,
    eyesClosed,
    blinkCount,
    closedDuration,
  } = trackingState;

  // Border glow styling for camera preview
  const borderStyle = !faceDetected
    ? 'border-slate-300'
    : eyesClosed
    ? 'border-[#FF6F61] shadow-[0_0_8px_rgba(255,111,97,0.4)]'
    : 'border-[#6AC9F0] shadow-[0_0_8px_rgba(106,201,240,0.4)]';

  return (
    <>
      {mode === 'keyboard-bar' ? (
        /* LONG HORIZONTAL BAR (Placed directly below header as the first content item) */
        <div
          id="keyboard-eye-hud-bar"
          className="w-full bg-[#FFF2D6]/98 backdrop-blur-md border-b-2 border-[#14213D]/15 py-2 px-3 sm:px-4 transition-all select-none shadow-xs"
        >
          <div className="max-w-md md:max-w-xl mx-auto w-full flex items-center justify-between gap-2.5">
            {/* Left: Camera Preview Thumbnail & Status Badge */}
            <div className="flex items-center gap-2 min-w-0">
              <div className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 bg-slate-900 flex-shrink-0 transition-all duration-150 ${borderStyle}`}>
                <CameraPreview className="w-full h-full" mirrored showOverlay={false} />
              </div>

              <div className="flex items-center gap-2 min-w-0 truncate">
                <span
                  className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border whitespace-nowrap ${
                    !faceDetected
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : eyesClosed
                      ? 'bg-[#FF6F61] text-white border-[#FF6F61] animate-pulse'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {!faceDetected ? 'Chưa thấy mặt' : eyesClosed ? 'MẮT NHẮM' : 'Đang theo dõi'}
                </span>

                <span className="text-[10px] sm:text-[11px] font-bold text-[#3B4B68] truncate">
                  Nháy: <strong className="font-black text-[#14213D]">{blinkCount}</strong>
                  <span className="mx-1 text-slate-300">-</span>
                  Nhắm: <strong className={closedDuration > 0 ? "font-black text-[#FF6F61]" : "font-bold text-[#14213D]"}>{closedDuration.toFixed(1)}s</strong>
                </span>
              </div>
            </div>

            {/* Right: Quick Turn Off Camera Button */}
            <button
              type="button"
              onClick={() => setEyeControlEnabled(false)}
              title="Tắt Camera"
              className="p-1.5 rounded-full hover:bg-rose-100/80 text-rose-700 transition-colors cursor-pointer flex-shrink-0"
              aria-label="Tắt Camera"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* FLOATING MINI HUD (Fixed at Bottom-Left when on non-chat screens & keyboard is closed) */
        <div
          id="global-eye-hud-floating"
          className="fixed z-[60] pointer-events-none transition-all duration-200 ease-out"
          style={{
            left: 'max(12px, env(safe-area-inset-left))',
            bottom: 'calc(14px + env(safe-area-inset-bottom))',
          }}
        >
          <div className="pointer-events-auto bg-[#FFF2D6]/95 backdrop-blur-md border-2 border-[#14213D]/15 shadow-[0_8px_24px_rgba(20,33,61,0.16)] rounded-[20px] p-2 sm:p-2.5 flex items-center justify-between gap-2.5 w-[210px] sm:w-[240px] select-none transition-all duration-200">
            {/* Left: Compact Camera Preview */}
            <div className="flex items-center gap-2 min-w-0">
              <div className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 bg-slate-900 flex-shrink-0 transition-all duration-150 ${borderStyle}`}>
                <CameraPreview className="w-full h-full" mirrored showOverlay={false} />
              </div>

              {/* Status & Telemetry text */}
              <div className="flex flex-col min-w-0 leading-tight">
                <span
                  className={`text-[9px] sm:text-[10px] font-black uppercase tracking-tight ${
                    !faceDetected
                      ? 'text-rose-700 font-extrabold'
                      : eyesClosed
                      ? 'text-[#FF6F61] font-black animate-pulse'
                      : 'text-emerald-700 font-black'
                  }`}
                >
                  {!faceDetected ? 'Chưa thấy mặt' : eyesClosed ? 'MẮT NHẮM' : 'Đang theo dõi'}
                </span>
                <span className="text-[10px] font-bold text-[#3B4B68] mt-0.5 truncate">
                  Nháy {blinkCount} - Nhắm {closedDuration.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Right: Quick Turn Off Camera Button */}
            <button
              type="button"
              onClick={() => setEyeControlEnabled(false)}
              title="Tắt Camera"
              className="p-1.5 rounded-full hover:bg-rose-100/80 text-rose-700 transition-colors cursor-pointer flex-shrink-0"
              aria-label="Tắt Camera"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
});

