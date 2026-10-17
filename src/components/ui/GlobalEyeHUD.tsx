import React, { memo, useState } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from '../../modules/eye-control/useEyeTracking';
import { Eye, EyeOff, Rotate3d, Maximize2, Minimize2, Zap, Clock, Compass } from 'lucide-react';
import { CameraPreview } from '../../modules/eye-control/CameraPreview';
import { CameraHub } from '../../modules/eye-control/CameraHub';
import { FaceMeshVisualizer } from '../../modules/eye-control/FaceMeshVisualizer';
import { useAuth } from '../../hooks/useAuth';

export interface GlobalEyeHUDProps {
  variant?: 'floating' | 'keyboard-bar' | 'auto';
  currentRoute?: string;
}

export const GlobalEyeHUD = memo(function GlobalEyeHUD({
  variant = 'auto',
  currentRoute,
}: GlobalEyeHUDProps) {
  const {
    settings,
    setEyeControlEnabled,
    isKeyboardOpen,
    isVisualizerOpen,
    setVisualizerOpen,
    start5PointCalibration,
  } = useEyeTrackingSettings();

  const { trackingState } = useEyeTrackingTelemetry();
  const { profile } = useAuth();
  const [isHubExpanded, setIsHubExpanded] = useState<boolean>(false);

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
    blinkWindowRemainingMs = 0,
    closedDuration,
    gazeDirection,
    cooldownRemainingMs,
    lastExecutedAction,
  } = trackingState;

  // Border glow styling for camera preview
  const borderStyle = !faceDetected
    ? 'border-slate-400'
    : eyesClosed
    ? 'border-[#FF6F61] shadow-[0_0_8px_rgba(255,111,97,0.5)]'
    : 'border-[#6AC9F0] shadow-[0_0_8px_rgba(106,201,240,0.5)]';

  const isCooldownActive = cooldownRemainingMs > 0;
  const cooldownSecs = (cooldownRemainingMs / 1000).toFixed(1);

  return (
    <>
      {mode === 'keyboard-bar' ? (
        /* LONG HORIZONTAL BAR (Placed directly below header as the first content item) */
        <div
          id="keyboard-eye-hud-bar"
          className="w-full bg-[#FFF2D6]/98 backdrop-blur-md border-b-2 border-[#14213D]/15 py-1.5 px-3 sm:px-4 transition-all select-none shadow-xs"
        >
          <div className="max-w-md md:max-w-xl mx-auto w-full flex items-center justify-between gap-2">
            {/* Left: Camera Preview Thumbnail & Direction Badge */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsHubExpanded(prev => !prev)}
                className={`relative w-8 h-8 rounded-full overflow-hidden border-2 bg-slate-900 flex-shrink-0 transition-all duration-150 cursor-pointer ${borderStyle}`}
                title="Mở Camera Hub đầy đủ"
              >
                <CameraPreview className="w-full h-full" mirrored showOverlay={false} />
              </button>

              <div className="flex items-center gap-1.5 min-w-0 truncate">
                {/* Gaze Direction Badge */}
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#14213D] text-[#6AC9F0] border border-[#6AC9F0]/30 whitespace-nowrap shadow-xs">
                  {gazeDirection === 'CENTER' && '● TÂM'}
                  {gazeDirection === 'LEFT' && '← TRÁI'}
                  {gazeDirection === 'RIGHT' && '→ PHẢI'}
                  {gazeDirection === 'UP' && '↑ LÊN'}
                  {gazeDirection === 'DOWN' && '↓ XUỐNG'}
                  {gazeDirection === 'UNKNOWN' && '? CHƯA RÕ'}
                </span>

                {/* Cooldown / Ready indicator */}
                {isCooldownActive ? (
                  <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-2.5 h-2.5" /> Chờ: {cooldownSecs}s
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 whitespace-nowrap">
                    <Zap className="w-2.5 h-2.5 text-emerald-600" /> Sẵn sàng
                  </span>
                )}

                {eyesClosed ? (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 hidden sm:inline truncate">
                    Mắt đang nhắm ({closedDuration.toFixed(1)}s)
                  </span>
                ) : blinkCount === 2 ? (
                  <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 hidden sm:inline truncate shadow-xs">
                    Chớp: 2 / 2 • ĐÃ CHỌN 🎯
                  </span>
                ) : blinkCount === 1 ? (
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 hidden sm:inline truncate animate-pulse shadow-xs">
                    Chớp 1: Xuống ↓ (còn {(blinkWindowRemainingMs / 1000).toFixed(1)}s, hoặc chớp tiếp để Chọn)
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-[#3B4B68] hidden sm:inline truncate">
                    Chớp 1 cái: Xuống ↓ • Chớp 2 cái: Chọn 🎯
                  </span>
                )}
              </div>
            </div>

            {/* Right: Quick Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsHubExpanded(prev => !prev)}
                title={isHubExpanded ? "Thu nhỏ Camera Hub" : "Phóng to Camera Hub"}
                className="p-1.5 rounded-full hover:bg-[#6AC9F0]/20 text-[#14213D] transition-colors cursor-pointer"
                aria-label="Toggle Camera Hub"
              >
                {isHubExpanded ? <Minimize2 className="w-4 h-4 text-[#14213D]" /> : <Maximize2 className="w-4 h-4 text-[#14213D]" />}
              </button>

              <button
                type="button"
                onClick={() => setVisualizerOpen(true)}
                title="Xem mạng lưới 3D & Iris tracking"
                className="p-1.5 rounded-full hover:bg-[#6AC9F0]/20 text-[#14213D] transition-colors cursor-pointer"
                aria-label="Xem mạng lưới 3D"
              >
                <Rotate3d className="w-4 h-4 text-[#14213D]" />
              </button>

              <button
                type="button"
                onClick={() => setEyeControlEnabled(false)}
                title="Tắt Camera"
                className="p-1.5 rounded-full hover:bg-rose-100/80 text-rose-700 transition-colors cursor-pointer"
                aria-label="Tắt Camera"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* FLOATING HUD (Bottom-Left) */
        <div
          id="global-eye-hud-floating"
          className="fixed z-[60] pointer-events-none transition-all duration-200 ease-out"
          style={{
            left: 'max(12px, env(safe-area-inset-left))',
            bottom: 'calc(14px + env(safe-area-inset-bottom))',
          }}
        >
          {isHubExpanded ? (
            /* EXPANDED FULL CAMERA HUB CARD */
            <div className="pointer-events-auto w-[320px] sm:w-[350px] max-w-[calc(100vw-24px)] transition-all">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsHubExpanded(false)}
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Thu nhỏ Camera Hub"
                  aria-label="Thu nhỏ"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <CameraHub compact={false} />
              </div>
            </div>
          ) : (
            /* COMPACT FLOATING PILL */
            <div className="pointer-events-auto bg-[#FFF2D6]/95 backdrop-blur-md border-2 border-[#14213D]/15 shadow-[0_8px_24px_rgba(20,33,61,0.18)] rounded-[20px] p-2 flex items-center justify-between gap-2 w-[240px] sm:w-[270px] select-none transition-all duration-200">
              {/* Clickable thumbnail to open full Camera Hub */}
              <button
                type="button"
                onClick={() => setIsHubExpanded(true)}
                className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
                title="Bấm để mở Camera Hub đầy đủ"
              >
                <div className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 bg-slate-900 flex-shrink-0 transition-all duration-150 ${borderStyle}`}>
                  <CameraPreview className="w-full h-full" mirrored showOverlay={false} />
                </div>

                <div className="flex flex-col min-w-0 leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-[#14213D] truncate">
                      {gazeDirection === 'CENTER' && '● TÂM'}
                      {gazeDirection === 'LEFT' && '← TRÁI'}
                      {gazeDirection === 'RIGHT' && '→ PHẢI'}
                      {gazeDirection === 'UP' && '↑ LÊN'}
                      {gazeDirection === 'DOWN' && '↓ XUỐNG'}
                      {gazeDirection === 'UNKNOWN' && '? CHƯA RÕ'}
                    </span>
                    <span className="text-[9px] text-[#0E6C99] font-black group-hover:underline">
                      (Hub)
                    </span>
                  </div>

                  <span className="text-[9px] font-bold text-[#3B4B68] truncate mt-0.5">
                    {isCooldownActive ? (
                      <span className="text-amber-700 font-black">Chờ: {cooldownSecs}s</span>
                    ) : blinkCount === 2 ? (
                      <span className="text-emerald-700 font-black">Chớp 2/2: Đã Chọn 🎯</span>
                    ) : blinkCount === 1 ? (
                      <span className="text-amber-800 font-black animate-pulse">Chớp 1: Xuống ↓ (còn {(blinkWindowRemainingMs / 1000).toFixed(1)}s)</span>
                    ) : eyesClosed ? (
                      <span className="text-amber-800 font-black">Nhắm ({closedDuration.toFixed(1)}s)</span>
                    ) : (
                      <span className="text-emerald-700 font-black">Chớp 1: Xuống | 2: Chọn</span>
                    )}
                  </span>
                </div>
              </button>

              {/* Right: Quick Action Buttons */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsHubExpanded(true)}
                  title="Mở Camera Hub đầy đủ"
                  className="p-1.5 rounded-full hover:bg-[#6AC9F0]/20 text-[#14213D] transition-colors cursor-pointer"
                  aria-label="Mở Camera Hub"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#14213D]" />
                </button>

                <button
                  type="button"
                  onClick={() => setVisualizerOpen(true)}
                  title="Xem mạng lưới 3D & Iris tracking"
                  className="p-1.5 rounded-full hover:bg-[#6AC9F0]/20 text-[#14213D] transition-colors cursor-pointer"
                  aria-label="Xem mạng lưới 3D"
                >
                  <Rotate3d className="w-3.5 h-3.5 text-[#14213D]" />
                </button>

                <button
                  type="button"
                  onClick={() => setEyeControlEnabled(false)}
                  title="Tắt Camera"
                  className="p-1.5 rounded-full hover:bg-rose-100/80 text-rose-700 transition-colors cursor-pointer"
                  aria-label="Tắt Camera"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded Modal Camera Hub when on keyboard bar or user toggles on chat routes */}
      {mode === 'keyboard-bar' && isHubExpanded && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center pointer-events-auto">
          <div className="relative w-full max-w-sm">
            <button
              type="button"
              onClick={() => setIsHubExpanded(false)}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Đóng Camera Hub"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <CameraHub compact={false} />
          </div>
        </div>
      )}

      {/* Interactive 3D Face Mesh and Gaze Vector Visualizer Modal */}
      <FaceMeshVisualizer
        isOpen={isVisualizerOpen}
        onClose={() => setVisualizerOpen(false)}
      />
    </>
  );
});


