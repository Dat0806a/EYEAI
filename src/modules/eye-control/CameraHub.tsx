import React, { memo, useState, useEffect } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from './useEyeTracking';
import { CameraPreview } from './CameraPreview';
import { EyeFocusable } from './EyeFocusable';
import { EyeAction, GazeDirection } from './types';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  RotateCcw,
  Clock,
  Zap,
  Activity,
  Layers,
  Sliders,
  ChevronDown,
  ChevronUp,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Crosshair,
  Eye,
  Minimize2,
  PhoneCall,
  Sun,
} from 'lucide-react';

interface CameraHubProps {
  className?: string;
  compact?: boolean;
  onClose?: () => void;
}

/**
 * Bang dieu khien trung tam Camera Hub khi mo rong tu thanh `GlobalEyeHUD`:
 * - Hien thi `CameraPreview` kem lop ve luoi khuon mat, hai mat, mong mat va bo dem chop mat 0/3.
 * - Cung cap nut "Can tam" (`reZeroCenter`), "Hieu chuan" (`start5PointCalibration`), "Ho tro thieu sang".
 * - Hien thi 6 nut lenh cho phep bam thu nghiem thu cong (`triggerManualAction`), thanh thoi gian cho, cam bien do mo mat EAR va thong so ky thuat.
 */
export const CameraHub = memo(function CameraHub({
  className = '',
  compact = false,
  onClose,
}: CameraHubProps) {
  const {
    settings,
    setLowLightFilterEnabled,
    calibration,
    start5PointCalibration,
    calibrationStage,
    calibrationStep,
    calibrationProgress,
    calibrationMessage,
    cancelCalibration,
    resetCalibration,
    reZeroCenter,
    overlaySettings,
    setOverlaySettings,
    triggerManualAction,
  } = useEyeTrackingSettings();

  const isLowLightOn = Boolean(settings.lowLightFilterEnabled);
  const handleToggleLowLight = () => {
    setLowLightFilterEnabled(!isLowLightOn);
  };

  const { trackingState } = useEyeTrackingTelemetry();
  const [showDebug, setShowDebug] = useState(false);
  const [nowTime, setNowTime] = useState<number>(performance.now());

  // High-frequency UI tick for smooth cooldown countdown and badge glow decay
  useEffect(() => {
    let animId: number;
    const tick = () => {
      setNowTime(performance.now());
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const {
    faceDetected,
    eyesClosed,
    blinkCount,
    blinkWindowRemainingMs = 0,
    closedDuration,
    gazeDirection,
    gazeX,
    gazeY,
    rawGazeX,
    rawGazeY,
    headYaw,
    headPitch,
    confidence,
    cooldownRemainingMs,
    cooldownTotalMs,
    lastExecutedAction,
    lastExecutedTimestamp,
    reArmed,
    rawEAR = 0.28,
    blinkThreshold = 0.22,
    baselineEAR = 0.28,
    leftEAR = 0.28,
    rightEAR = 0.28,
  } = trackingState;

  // Determine badge state for each of the 6 required actions
  const getBadgeState = (action: EyeAction): 'IDLE' | 'ACTIVE' | 'COOLDOWN' => {
    const timeSinceExec = nowTime - lastExecutedTimestamp;
    const isThisAction =
      (action === 'LEFT' && (lastExecutedAction === 'LEFT' || lastExecutedAction === 'BACK')) ||
      (action === 'RIGHT' && (lastExecutedAction === 'RIGHT' || lastExecutedAction === 'NEXT')) ||
      (action === 'UP' && lastExecutedAction === 'UP') ||
      (action === 'DOWN' && lastExecutedAction === 'DOWN') ||
      (action === 'SELECT' && lastExecutedAction === 'SELECT') ||
      (action === 'ESCAPE' && (lastExecutedAction === 'ESCAPE' || lastExecutedAction === 'DOUBLE_BLINK'));

    if (!isThisAction) return 'IDLE';

    // Active burst duration: 420ms
    if (timeSinceExec < 420) {
      return 'ACTIVE';
    }

    // Cooldown hold state: while cooldown is still ticking down
    if (cooldownRemainingMs > 0 && timeSinceExec < (cooldownTotalMs || 2500)) {
      return 'COOLDOWN';
    }

    return 'IDLE';
  };

  const badgeConfig: { action: EyeAction; label: string; icon: React.ReactNode; keyHint: string; span?: string }[] = [
    { action: 'LEFT', label: 'SANG TRÁI', icon: <ArrowLeft className="w-4 h-4 flex-shrink-0" />, keyHint: 'Liếc trái' },
    { action: 'RIGHT', label: 'SANG PHẢI', icon: <ArrowRight className="w-4 h-4 flex-shrink-0" />, keyHint: 'Liếc phải' },
    { action: 'UP', label: 'LÊN', icon: <ArrowUp className="w-4 h-4 flex-shrink-0" />, keyHint: 'Liếc lên' },
    { action: 'DOWN', label: 'XUỐNG', icon: <ArrowDown className="w-4 h-4 flex-shrink-0" />, keyHint: 'Chớp 1 cái' },
    { action: 'SELECT', label: 'CHỌN', icon: <Check className="w-4 h-4 flex-shrink-0" />, keyHint: 'Chớp 2 cái' },
    { action: 'EMERGENCY', label: 'GỌI KHẨN CẤP', icon: <PhoneCall className="w-4 h-4 flex-shrink-0 text-rose-400" />, keyHint: 'Chớp 3 cái' },
  ];

  const cooldownSecs = (cooldownRemainingMs / 1000).toFixed(1);
  const isCooldownActive = cooldownRemainingMs > 0;
  const cooldownProgress = isCooldownActive
    ? Math.max(0, Math.min(100, ((cooldownTotalMs - cooldownRemainingMs) / cooldownTotalMs) * 100))
    : 100;

  return (
    <div
      className={`bg-[#0d1527]/98 backdrop-blur-xl border border-[#14213D]/25 rounded-[24px] shadow-[0_16px_40px_rgba(10,15,29,0.35)] text-slate-100 flex flex-col max-h-[min(88vh,740px)] overflow-hidden select-none transition-all duration-200 ${className}`}
    >
      {/* 5-Point Calibration Overlay Wizard Modal */}
      {calibrationStage !== 'idle' && (
        <div className="absolute inset-0 z-50 bg-[#0a0f1d]/95 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center">
          <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#6AC9F0] animate-spin" style={{ animationDuration: '6s' }} />
            {/* Target Reticle */}
            <div className="w-16 h-16 rounded-full bg-[#14213D] border-2 border-[#6AC9F0] flex items-center justify-center shadow-[0_0_20px_rgba(106,201,240,0.5)]">
              {calibrationStep === 'up' && <ArrowUp className="w-8 h-8 text-[#6AC9F0] animate-bounce" />}
              {calibrationStep === 'down' && <ArrowDown className="w-8 h-8 text-[#6AC9F0] animate-bounce" />}
              {calibrationStep === 'left' && <ArrowLeft className="w-8 h-8 text-[#6AC9F0] animate-bounce" />}
              {calibrationStep === 'right' && <ArrowRight className="w-8 h-8 text-[#6AC9F0] animate-bounce" />}
              {calibrationStep === 'center' && <span className="w-4 h-4 rounded-full bg-[#FF6F61] animate-ping" />}
              {calibrationStep === 'countdown' && <span className="text-2xl font-black text-[#6AC9F0]">{calibrationProgress || '3'}</span>}
              {calibrationStep === 'completed' && <CheckCircle2 className="w-8 h-8 text-emerald-400" />}
            </div>
          </div>

          <h3 className="text-base font-black text-white mb-1">HIỆU CHỈNH 5 HƯỚNG MẮT</h3>
          <p className="text-xs text-[#6AC9F0] font-bold max-w-xs mb-3">{calibrationMessage}</p>

          {/* Progress Bar */}
          <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700 mb-4">
            <div
              className="h-full bg-gradient-to-r from-[#6AC9F0] to-emerald-400 transition-all duration-150"
              style={{ width: `${calibrationProgress}%` }}
            />
          </div>

          <button
            type="button"
            onClick={cancelCalibration}
            className="px-4 py-1.5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors"
          >
            Hủy hiệu chỉnh
          </button>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="px-3.5 py-2.5 bg-[#14213D]/95 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-black tracking-wide text-white uppercase whitespace-nowrap">EYEAI CAMERA HUB</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick Re-Zero Center Button */}
          <button
            type="button"
            onClick={reZeroCenter}
            className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
            title="Lấy vị trí nhìn thẳng hiện tại làm TÂM mặc định"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Căn tâm</span>
          </button>

          {/* Quick Calibration Button */}
          <button
            type="button"
            onClick={start5PointCalibration}
            className="px-2 py-1 rounded-lg bg-[#6AC9F0]/15 hover:bg-[#6AC9F0]/25 text-[#6AC9F0] text-[11px] font-bold border border-[#6AC9F0]/30 transition-all flex items-center gap-1 cursor-pointer"
            title="Bắt đầu hiệu chỉnh 5 hướng"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Hiệu chuẩn</span>
          </button>

          {/* Debug Toggle */}
          <button
            type="button"
            onClick={() => setShowDebug(prev => !prev)}
            className={`p-1 rounded-lg border transition-all cursor-pointer ${
              showDebug
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white'
            }`}
            title="Chế độ nhà phát triển (Debug Telemetry)"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>

          {/* Close/Minimize Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-all cursor-pointer ml-0.5"
              title="Thu nhỏ Camera Hub"
              aria-label="Thu nhỏ Camera Hub"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3.5 overflow-y-auto overscroll-contain flex-1">
        {/* AREA A: LIVE CAMERA FEED WITH 3D FACE MESH & IRIS TRACKING OVERLAY */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-inner group flex-shrink-0">
          <CameraPreview
            className="w-full h-full"
            mirrored={true}
            showOverlay={true}
            showStatusPill={false}
          />

          {/* Live Blink Counter Badge on top left of video */}
          <div
            id="hub-blink-counter-badge"
            className={`absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg transition-all duration-200 select-none ${
              blinkCount === 3
                ? 'bg-rose-950/95 border-rose-400 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.7)] scale-105 animate-pulse'
                : blinkCount === 2
                ? 'bg-emerald-950/95 border-emerald-400 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.6)]'
                : blinkCount === 1
                ? 'bg-amber-950/95 border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.6)] ring-2 ring-amber-400/40 animate-pulse'
                : 'bg-slate-900/85 border-slate-700/80 text-slate-200'
            }`}
          >
            <Eye className={`w-3.5 h-3.5 ${
              blinkCount === 3 ? 'text-rose-400 animate-bounce' : blinkCount === 2 ? 'text-emerald-400' : blinkCount === 1 ? 'text-amber-400 animate-bounce' : 'text-[#6AC9F0]'
            }`} />
            <span className="text-[11px] font-black tracking-wide">
              CHỚP:{' '}
              <span className={`text-xs font-mono font-black ${
                blinkCount === 3 ? 'text-rose-400' : blinkCount === 2 ? 'text-emerald-400' : blinkCount === 1 ? 'text-amber-400' : 'text-[#6AC9F0]'
              }`}>
                {blinkCount} / 3
              </span>
            </span>

            {blinkCount === 1 && (
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-400/30">
                {(blinkWindowRemainingMs / 1000).toFixed(1)}s ➔ Xuống ↓
              </span>
            )}

            {blinkCount === 2 && (
              <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded-full border border-emerald-400/30">
                {(blinkWindowRemainingMs / 1000).toFixed(1)}s ➔ Chọn 🎯
              </span>
            )}

            {blinkCount === 3 && (
              <span className="text-[9px] font-black text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded-full border border-rose-400/30 uppercase animate-pulse">
                GỌI KHẨN CẤP 🚨
              </span>
            )}
          </div>

          {/* Realtime Gaze Direction Reticle Badge on top right of video */}
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/85 backdrop-blur-md border border-slate-700/70 text-[11px] font-black text-white shadow-md">
            <span
              className={`w-2 h-2 rounded-full ${
                gazeDirection === 'CENTER'
                  ? 'bg-emerald-400'
                  : gazeDirection === 'UNKNOWN'
                  ? 'bg-slate-400'
                  : 'bg-[#6AC9F0] animate-ping'
              }`}
            />
            <span>
              {gazeDirection === 'CENTER' && '● TÂM'}
              {gazeDirection === 'LEFT' && '← TRÁI'}
              {gazeDirection === 'RIGHT' && '→ PHẢI'}
              {gazeDirection === 'UP' && '↑ LÊN'}
              {gazeDirection === 'DOWN' && '↓ XUỐNG'}
              {gazeDirection === 'UNKNOWN' && '? CHƯA RÕ'}
            </span>
          </div>

          {/* Live Layer Toggles Bar (Bottom of Video) */}
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between gap-1 p-1 bg-slate-900/85 backdrop-blur-md rounded-xl border border-slate-800/80 text-[10px] font-bold text-slate-300">
            <span className="px-1.5 text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#6AC9F0]" /> Lớp hiển thị:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOverlaySettings(prev => ({ ...prev, showMesh: !prev.showMesh }))}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                  overlaySettings.showMesh ? 'bg-[#6AC9F0]/25 text-[#6AC9F0] font-black' : 'text-slate-500'
                }`}
              >
                Mesh
              </button>
              <button
                type="button"
                onClick={() => setOverlaySettings(prev => ({ ...prev, showEyes: !prev.showEyes }))}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                  overlaySettings.showEyes ? 'bg-[#38bdf8]/25 text-[#38bdf8] font-black' : 'text-slate-500'
                }`}
              >
                Mắt
              </button>
              <button
                type="button"
                onClick={() => setOverlaySettings(prev => ({ ...prev, showIris: !prev.showIris }))}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                  overlaySettings.showIris ? 'bg-[#FF6F61]/25 text-[#FF6F61] font-black' : 'text-slate-500'
                }`}
              >
                Mống mắt
              </button>
            </div>
          </div>
        </div>

        {/* LOW-LIGHT EXPOSURE ENHANCEMENT TOGGLE */}
        <EyeFocusable
          id="btn-camera-hub-low-light"
          onSelect={handleToggleLowLight}
          speakLabel={isLowLightOn ? 'Tắt hỗ trợ thiếu sáng' : 'Bật hỗ trợ thiếu sáng'}
          className="w-full"
        >
          <button
            type="button"
            id="camera-hub-low-light-toggle"
            aria-pressed={isLowLightOn}
            className={`w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all duration-150 cursor-pointer active:scale-[0.99] select-none ${
              isLowLightOn
                ? 'bg-amber-500/15 border-amber-400/60 text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.2)]'
                : 'bg-slate-900/75 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Sun className={`w-4 h-4 flex-shrink-0 ${isLowLightOn ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="text-xs font-bold truncate">Hỗ trợ thiếu sáng</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border flex-shrink-0 ${
                isLowLightOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isLowLightOn ? 'ON' : 'OFF'}
            </span>
          </button>
        </EyeFocusable>

        {/* AREA B: GESTURE COMMAND INDICATORS (6 REQUIRED INTERACTIVE BADGES) */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5 px-0.5">
            <span>LỆNH ĐIỀU KHIỂN EYEAI:</span>
            <span className="text-[10px] text-slate-500">Sáng khi thực thi hợp lệ</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {badgeConfig.map(badge => {
              const state = getBadgeState(badge.action);

              // Styling per state
              const isStateActive = state === 'ACTIVE';
              const isStateCooldown = state === 'COOLDOWN';

              let cardStyle = 'bg-slate-900/60 border-slate-800 text-slate-400';
              let iconStyle = 'text-slate-500';
              let glowEffect = '';

              if (isStateActive) {
                cardStyle = 'bg-[#14213D] border-[#6AC9F0] text-white scale-[1.02] shadow-[0_0_18px_rgba(106,201,240,0.6)]';
                iconStyle = 'text-[#6AC9F0] animate-pulse';
                glowEffect = 'animate-pulse';
              } else if (isStateCooldown) {
                cardStyle = 'bg-slate-900/90 border-[#6AC9F0]/50 text-slate-200';
                iconStyle = 'text-[#6AC9F0]';
              }

              return (
                <div
                  key={badge.action}
                  onClick={() => triggerManualAction(badge.action)}
                  role="button"
                  tabIndex={0}
                  title={`Nhấp để kiểm tra lệnh: ${badge.label} (${badge.keyHint})`}
                  className={`relative p-2.5 rounded-xl border flex items-center justify-between gap-1.5 transition-all duration-150 select-none cursor-pointer hover:border-[#6AC9F0]/60 active:scale-95 ${badge.span || ''} ${cardStyle} ${glowEffect}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={iconStyle}>{badge.icon}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black whitespace-nowrap tracking-tight">{badge.label}</span>
                      <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{badge.keyHint}</span>
                    </div>
                  </div>

                  {/* Active/Cooldown Indicator Dot */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        isStateActive
                          ? 'bg-[#6AC9F0] shadow-[0_0_8px_#6AC9F0]'
                          : isStateCooldown
                          ? 'bg-amber-400'
                          : 'bg-slate-700'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AREA C: COOLDOWN INDICATOR WITH REAL-TIME COUNTDOWN */}
        <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Clock className={`w-3.5 h-3.5 ${isCooldownActive ? 'text-amber-400 animate-spin' : 'text-emerald-400'}`} style={isCooldownActive ? { animationDuration: '3s' } : {}} />
              <span className="font-bold text-slate-300">CHỜ LỆNH TIẾP THEO:</span>
            </div>

            <div className="flex items-center gap-1.5">
              {isCooldownActive ? (
                <span className="font-mono font-black text-amber-400 text-xs px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                  {cooldownSecs}s
                </span>
              ) : (
                <span className="font-black text-emerald-400 text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  SẴN SÀNG
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                isCooldownActive
                  ? 'bg-gradient-to-r from-amber-500 to-[#6AC9F0]'
                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
              }`}
              style={{ width: `${cooldownProgress}%` }}
            />
          </div>
        </div>

        {/* DEDICATED BLINK SELECT COUNTER WIDGET */}
        <div
          id="camera-hub-blink-panel"
          className={`p-3 rounded-2xl border transition-all duration-200 ${
            blinkCount === 3
              ? 'bg-rose-950/40 border-rose-400/80 shadow-[0_0_18px_rgba(244,63,94,0.3)]'
              : blinkCount === 2
              ? 'bg-emerald-950/40 border-emerald-400/80 shadow-[0_0_18px_rgba(52,211,153,0.25)]'
              : blinkCount === 1
              ? 'bg-amber-950/40 border-amber-400/80 shadow-[0_0_18px_rgba(251,191,36,0.25)]'
              : 'bg-slate-900/70 border-slate-800/80'
          }`}
        >
          {/* Top row: Title and Status Badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-black text-white flex items-center gap-1.5 whitespace-nowrap">
              <Eye className="w-3.5 h-3.5 text-[#6AC9F0]" />
              ĐẾM SỐ CÁI CHỚP MẮT
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase whitespace-nowrap flex-shrink-0 ${
                blinkCount === 3
                  ? 'bg-rose-500/20 text-rose-400 border-rose-400/40 animate-pulse'
                  : blinkCount === 2
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40'
                  : blinkCount === 1
                  ? 'bg-amber-500/20 text-amber-400 border-amber-400/40 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {blinkCount === 3
                ? 'GỌI KHẨN CẤP 🚨'
                : blinkCount === 2
                ? `2: CHỌN 🎯 (${(blinkWindowRemainingMs / 1000).toFixed(1)}s)`
                : blinkCount === 1
                ? `1: XUỐNG ↓ (${(blinkWindowRemainingMs / 1000).toFixed(1)}s)`
                : 'CHỜ CHỚP MẮT'}
            </span>
          </div>

          {/* Counter display & description */}
          <div className="flex items-center gap-2.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm font-mono flex-shrink-0 transition-colors shadow-sm ${
                blinkCount === 3
                  ? 'bg-rose-500 text-white animate-pulse'
                  : blinkCount === 2
                  ? 'bg-emerald-400 text-slate-950'
                  : blinkCount === 1
                  ? 'bg-amber-400 text-slate-950 animate-pulse'
                  : 'bg-slate-800 text-[#6AC9F0] border border-slate-700'
              }`}
            >
              {blinkCount === 3 ? '🚨' : blinkCount === 2 ? '✓' : `${blinkCount}/3`}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-300 leading-snug">
                {blinkCount === 0 && 'Chớp 1 cái: Xuống ↓ • Chớp 2 cái: Chọn 🎯 • Chớp 3 cái: Gọi khẩn cấp 🚨'}
                {blinkCount === 1 && (
                  <span className="text-amber-300 font-bold">
                    Đã chớp 1 cái! Chờ {(blinkWindowRemainingMs / 1000).toFixed(1)}s để Xuống ↓, hoặc chớp tiếp (2: Chọn, 3: Gọi khẩn cấp)
                  </span>
                )}
                {blinkCount === 2 && (
                  <span className="text-emerald-300 font-bold">
                    Đã chớp 2 cái! Chờ {(blinkWindowRemainingMs / 1000).toFixed(1)}s để Chọn 🎯, hoặc chớp cái thứ 3 để Gọi khẩn cấp 🚨
                  </span>
                )}
                {blinkCount === 3 && (
                  <span className="text-rose-300 font-bold">
                    Đã chớp 3 cái: Kích hoạt cuộc gọi khẩn cấp thành công! 🚨
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Countdown progress bar */}
          {(blinkCount === 1 || blinkCount === 2) && (
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2.5 border border-slate-700/50">
              <div
                className={`h-full transition-all duration-75 ${
                  blinkCount === 2
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                    : 'bg-gradient-to-r from-amber-400 to-amber-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, (blinkWindowRemainingMs / 700) * 100))}%` }}
              />
            </div>
          )}

          {/* Real-time AI Eyelid Aspect Ratio (EAR) Telemetry Gauge */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${rawEAR < blinkThreshold ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                <span className="font-sans font-bold text-slate-300">Cảm biến EAR (Độ mở mi mắt):</span>
                <strong className={`font-mono text-xs ${rawEAR < blinkThreshold ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {rawEAR.toFixed(3)}
                </strong>
              </span>
              <span className="text-slate-400">
                Ngưỡng chớp: <span className="text-[#6AC9F0] font-mono font-bold">{blinkThreshold.toFixed(3)}</span>
              </span>
            </div>

            {/* Visual EAR Meter with Threshold Marker */}
            <div className="relative w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              {/* Fill bar */}
              <div
                className={`h-full transition-all duration-75 ${
                  rawEAR < blinkThreshold
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'bg-gradient-to-r from-[#6AC9F0] to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, ((rawEAR - 0.10) / 0.30) * 100))}%` }}
              />
              {/* Threshold indicator notch */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-amber-300 shadow-[0_0_6px_#f59e0b] -ml-0.5"
                style={{ left: `${Math.min(100, Math.max(0, ((blinkThreshold - 0.10) / 0.30) * 100))}%` }}
                title={`Vạch ngưỡng nhận diện chớp: ${blinkThreshold.toFixed(3)}`}
              />
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-400">
              <span className={rawEAR < blinkThreshold ? 'text-amber-300 font-bold' : ''}>
                {rawEAR < blinkThreshold ? '⚡ ĐÃ QUA NGƯỠNG ➔ GHI NHẬN CHỚP MẮT' : '● Mi mắt đang mở bình thường'}
              </span>
              <span>Chuẩn mở (Baseline): {baselineEAR.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* AREA D: TRACKING STATUS COMPACT SUMMARY */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/70">
            <span className="text-slate-400 block text-[10px]">AI MediaPipe Mesh</span>
            <span className={`font-black ${faceDetected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {faceDetected ? '468 ĐIỂM 3D' : 'CHƯA THẤY'}
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/70">
            <span className="text-slate-400 block text-[10px]">Tỉ số mở mắt (EAR)</span>
            <span className={`font-black font-mono ${eyesClosed || rawEAR < blinkThreshold ? 'text-amber-400' : 'text-emerald-400'}`}>
              {rawEAR.toFixed(3)} <span className="text-[9px] text-slate-400 font-normal">(ngưỡng {blinkThreshold.toFixed(2)})</span>
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/70">
            <span className="text-slate-400 block text-[10px]">Trạng thái mắt</span>
            <span className={`font-black truncate block ${eyesClosed ? 'text-[#FF6F61]' : blinkCount === 3 ? 'text-rose-400' : blinkCount === 2 ? 'text-emerald-400' : blinkCount === 1 ? 'text-amber-400' : 'text-[#6AC9F0]'}`}>
              {eyesClosed ? `NHẮM (${closedDuration.toFixed(1)}s)` : blinkCount === 3 ? 'CHỚP: 3/3 (GỌI CẤP CỨU)' : blinkCount === 2 ? 'CHỚP: 2/3 (CHỌN)' : blinkCount === 1 ? `CHỚP: 1/3 (${(blinkWindowRemainingMs / 1000).toFixed(1)}s)` : 'MỞ (Chớp 1: Xuống, 2: Chọn, 3: SOS)'}
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/70">
            <span className="text-slate-400 block text-[10px]">Hiệu chuẩn</span>
            <span className={`font-black ${calibration.isCalibrated ? 'text-emerald-400' : 'text-amber-400'}`}>
              {calibration.isCalibrated ? 'ĐÃ HIỆU CHUẨN' : 'MẶC ĐỊNH'}
            </span>
          </div>
        </div>

        {/* DEVELOPER DEBUG TELEMETRY PANEL (COLLAPSIBLE) */}
        {showDebug && (
          <div className="bg-black/80 rounded-xl p-3 border border-amber-500/30 space-y-2 text-[11px] font-mono text-slate-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-amber-400 font-bold">
              <span>DEBUG TELEMETRY</span>
              <button
                type="button"
                onClick={resetCalibration}
                className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Reset Hiệu chuẩn
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500">Raw Gaze Δ(X, Y):</span>
                <div className="font-bold text-white">
                  ΔX: {rawGazeX >= 0 ? `+${rawGazeX.toFixed(3)}` : rawGazeX.toFixed(3)} | ΔY: {rawGazeY >= 0 ? `+${rawGazeY.toFixed(3)}` : rawGazeY.toFixed(3)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Filtered Gaze (X, Y):</span>
                <div className="font-bold text-[#6AC9F0]">
                  X: {gazeX >= 0 ? `+${gazeX.toFixed(3)}` : gazeX.toFixed(3)} | Y: {gazeY >= 0 ? `+${gazeY.toFixed(3)}` : gazeY.toFixed(3)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Neutral Baseline (X, Y):</span>
                <div className="text-slate-300">
                  X0: {(calibration.neutralIrisH || 0).toFixed(3)} | Y0: {(calibration.neutralIrisV || 0).toFixed(3)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Thresh (Up, Down, L, R):</span>
                <div className="text-slate-300 text-[10px]">
                  U: {(calibration.thresholdUp || 0.04).toFixed(3)} | D: {(calibration.thresholdDown || 0.042).toFixed(3)} | L: {(calibration.thresholdLeft || 0.046).toFixed(3)} | R: {(calibration.thresholdRight || 0.046).toFixed(3)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Head Pose (Yaw, Pitch):</span>
                <div className="text-slate-300">
                  Yaw: {headYaw.toFixed(2)} | Pitch: {headPitch.toFixed(2)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Arbiter State:</span>
                <div className="text-emerald-400 font-bold">
                  Last: {lastExecutedAction} | ReArmed: {reArmed ? 'YES' : 'WAIT_CENTER'}
                </div>
              </div>

              <div>
                <span className="text-slate-500">EAR (Avg | L | R):</span>
                <div className="font-bold text-[#6AC9F0]">
                  {rawEAR.toFixed(3)} | L: {leftEAR.toFixed(3)} | R: {rightEAR.toFixed(3)}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Blink Thresh & Baseline:</span>
                <div className="text-amber-400 font-bold">
                  Thresh: {blinkThreshold.toFixed(3)} | Base: {baselineEAR.toFixed(3)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
