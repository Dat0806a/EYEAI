import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import {
  EyeAction,
  GazeDirection,
  CalibrationStep,
  EyeCalibrationData,
  EyeTrackingState,
  EyeControlSettings,
  OverlayDisplaySettings,
} from './types';
import { analyzeEyes, Point } from './eyeTracker';
import { speakVietnamese, updateSpeechSettings } from '../../utils/speech';

export interface EyeTrackingSettingsContextType {
  settings: EyeControlSettings;
  calibration: EyeCalibrationData;
  libsLoading: boolean;
  libError: string | null;
  cameraStream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isKeyboardOpen: boolean;
  setKeyboardOpen: (open: boolean) => void;
  setEyeControlEnabled: (enabled: boolean) => void;
  setSimulatorMode: (enabled: boolean) => void;
  setSoundFeedback: (enabled: boolean) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  setSpeechVolume: (volume: number) => void;
  setSpeechRate: (rate: number) => void;
  toggleCamera: () => Promise<void>;
  startCalibration: () => void;
  start5PointCalibration: () => void;
  cancelCalibration: () => void;
  resetCalibration: () => void;
  reZeroCenter: () => void;
  calibrationStage: 'idle' | 'countdown' | 'collecting' | 'completed';
  calibrationStep: CalibrationStep;
  calibrationProgress: number;
  calibrationMessage: string;
  overlaySettings: OverlayDisplaySettings;
  setOverlaySettings: (updater: Partial<OverlayDisplaySettings> | ((prev: OverlayDisplaySettings) => OverlayDisplaySettings)) => void;
  registerGestureCallback: (cb: (action: EyeAction) => boolean | void) => () => void;
  triggerManualAction: (action: EyeAction) => void;
  isVisualizerOpen: boolean;
  setVisualizerOpen: (open: boolean) => void;
}

export interface EyeTrackingTelemetryContextType {
  trackingState: EyeTrackingState;
}

const EyeTrackingSettingsContext = createContext<EyeTrackingSettingsContextType | undefined>(undefined);
const EyeTrackingTelemetryContext = createContext<EyeTrackingTelemetryContextType | undefined>(undefined);

// Telemetry update interval for UI rendering (approx 12-15 FPS to prevent UI churn)
const TELEMETRY_THROTTLE_MS = 65;

// Cooldown between eye operations (2.5 seconds)
const ACTION_COOLDOWN_MS = 2500;

export function EyeTrackingProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const faceMeshRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [libsLoading, setLibsLoading] = useState(true);
  const [libError, setLibError] = useState<string | null>(null);
  const [isVisualizerOpen, setVisualizerOpen] = useState(false);

  // Overlay visual layer toggles
  const [overlaySettings, setOverlaySettingsState] = useState<OverlayDisplaySettings>(() => {
    const saved = localStorage.getItem('luckydream_overlay_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return {
      showMesh: true,
      showEyes: true,
      showIris: true,
    };
  });

  const setOverlaySettings = useCallback((updater: Partial<OverlayDisplaySettings> | ((prev: OverlayDisplaySettings) => OverlayDisplaySettings)) => {
    setOverlaySettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      localStorage.setItem('luckydream_overlay_settings', JSON.stringify(next));
      return next;
    });
  }, []);

  // Settings with localStorage persistence
  const [settings, setSettings] = useState<EyeControlSettings>(() => {
    const saved = localStorage.getItem('luckydream_eye_settings');
    const savedSpeakerEnabled = localStorage.getItem('luckyDream.speakerEnabled');
    const savedSpeechVolume = localStorage.getItem('luckyDream.speechVolume');
    const savedSpeechRate = localStorage.getItem('luckyDream.speechRate');

    const defaultSpeakerEnabled = savedSpeakerEnabled !== null ? savedSpeakerEnabled === 'true' : false;
    const defaultSpeechVolume = savedSpeechVolume !== null ? Math.max(0, Math.min(1, parseFloat(savedSpeechVolume))) : 1.0;
    const defaultSpeechRate = savedSpeechRate !== null ? Math.max(0.7, Math.min(1.5, parseFloat(savedSpeechRate))) : 1.0;

    const savedEyeEnabled = localStorage.getItem('luckydream_eye_enabled');
    const defaultEyeEnabled = savedEyeEnabled !== null ? savedEyeEnabled === 'true' : true;

    const base: EyeControlSettings = {
      eyeControlEnabled: defaultEyeEnabled,
      dwellTimeMs: 1500,
      soundFeedback: true,
      simulatorMode: true,
      speakerEnabled: defaultSpeakerEnabled,
      speechVolume: defaultSpeechVolume,
      speechRate: defaultSpeechRate,
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...base, ...parsed };
      } catch (e) {
        // Fallback
      }
    }
    return base;
  });

  useEffect(() => {
    localStorage.setItem('luckydream_eye_settings', JSON.stringify(settings));
    localStorage.setItem('luckyDream.speakerEnabled', String(settings.speakerEnabled));
    localStorage.setItem('luckyDream.speechVolume', String(settings.speechVolume));
    localStorage.setItem('luckyDream.speechRate', String(settings.speechRate));

    updateSpeechSettings({
      speakerEnabled: settings.speakerEnabled,
      speechVolume: settings.speechVolume,
      speechRate: settings.speechRate,
    });
  }, [settings]);

  // Calibration state with 5 directions
  const [calibration, setCalibration] = useState<EyeCalibrationData>(() => {
    const saved = localStorage.getItem('eyeai_calibration') || localStorage.getItem('luckydream_eye_calibration');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          thresholdUp: Math.max(0.016, Math.min(parsed.thresholdUp || 0.018, 0.026)),
          thresholdDown: Math.max(0.016, Math.min(parsed.thresholdDown || 0.018, 0.026)),
          thresholdLeft: Math.max(0.024, Math.min(parsed.thresholdLeft || 0.028, 0.036)),
          thresholdRight: Math.max(0.024, Math.min(parsed.thresholdRight || 0.028, 0.036)),
          thresholdV: Math.max(0.016, Math.min(parsed.thresholdV || 0.018, 0.026)),
          thresholdH: Math.max(0.024, Math.min(parsed.thresholdH || 0.028, 0.036)),
          isCalibrated: false, // Ensure dynamic auto-centering on fresh startup
        };
      } catch (e) {
        // Fallback
      }
    }
    return {
      neutralEAR: 0.25,
      blinkThreshold: 0.15,
      neutralIrisH: 0.0,
      neutralIrisV: 0.0,
      thresholdH: 0.026,
      thresholdV: 0.018,
      thresholdUp: 0.018,
      thresholdDown: 0.018,
      thresholdLeft: 0.026,
      thresholdRight: 0.026,
      isCalibrated: false,
    };
  });

  const [calibrationStage, setCalibrationStage] = useState<'idle' | 'countdown' | 'collecting' | 'completed'>('idle');
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState('Bấm nút để bắt đầu hiệu chỉnh');

  // React State for UI Telemetry & Command Arbiter
  const [trackingState, setTrackingState] = useState<EyeTrackingState>({
    rawEAR: 0.28,
    leftEAR: 0.28,
    rightEAR: 0.28,
    blinkThreshold: 0.22,
    baselineEAR: 0.28,
    gazeDirection: 'CENTER',
    directionH: 'CENTER',
    directionV: 'CENTER',
    currentAction: 'NONE',
    lastExecutedAction: 'NONE',
    lastExecutedTimestamp: 0,
    actionProgress: 0,
    lastActionTriggered: '—',
    faceDetected: false,
    cameraActive: false,
    eyesClosed: false,
    blinkCount: 0,
    blinkWindowRemainingMs: 0,
    closedDuration: 0.0,
    cameraError: null,
    rawGazeX: 0,
    rawGazeY: 0,
    gazeX: 0,
    gazeY: 0,
    headYaw: 0,
    headPitch: 0,
    confidence: 0,
    cooldownRemainingMs: 0,
    cooldownTotalMs: ACTION_COOLDOWN_MS,
    reArmed: true,
  });

  // High-frequency mutable state in refs
  const latestTelemetryRef = useRef<EyeTrackingState>({ ...trackingState });
  const latestMetricsRef = useRef<{
    avgEAR: number;
    leftEAR: number;
    rightEAR: number;
    compensatedGazeX: number;
    compensatedGazeY: number;
    rawGazeX: number;
    rawGazeY: number;
    headYaw: number;
    headPitch: number;
    confidence: number;
  }>({
    avgEAR: 0.25,
    leftEAR: 0.25,
    rightEAR: 0.25,
    compensatedGazeX: 0,
    compensatedGazeY: 0,
    rawGazeX: 0,
    rawGazeY: 0,
    headYaw: 0,
    headPitch: 0,
    confidence: 0,
  });
  const lastTelemetryDispatchTime = useRef<number>(0);

  const gestureCallbacksRef = useRef<Array<(action: EyeAction) => boolean | void>>([]);

  const registerGestureCallback = useCallback((cb: (action: EyeAction) => boolean | void) => {
    gestureCallbacksRef.current.push(cb);
    return () => {
      gestureCallbacksRef.current = gestureCallbacksRef.current.filter(c => c !== cb);
    };
  }, []);

  const dispatchAction = useCallback((action: EyeAction): boolean => {
    if (action === 'NONE') return false;

    let executed = false;
    gestureCallbacksRef.current.forEach(cb => {
      const res = cb(action);
      if (res === true) {
        executed = true;
      }
    });

    if (settings.soundFeedback) {
      if (executed) {
        const soundMap: Record<EyeAction, string> = {
          SELECT: 'Chọn',
          NEXT: 'Sang phải',
          RIGHT: 'Sang phải',
          BACK: 'Sang trái',
          LEFT: 'Sang trái',
          DOWN: 'Xuống',
          UP: 'Lên',
          ESCAPE: 'Hủy thao tác',
          DOUBLE_BLINK: 'Hủy thao tác',
          NONE: '',
        };
        const soundText = soundMap[action];
        if (soundText) {
          speakVietnamese(soundText);
        }
      } else {
        if (['RIGHT', 'NEXT', 'LEFT', 'BACK', 'UP', 'DOWN'].includes(action)) {
          speakVietnamese('Không có phần tử theo hướng này');
        }
      }
    }

    return executed;
  }, [settings.soundFeedback]);

  const triggerManualAction = useCallback((action: EyeAction) => {
    const now = performance.now();
    const executed = dispatchAction(action);
    if (executed) {
      cooldownTimer.current = ACTION_COOLDOWN_MS;
      smoothGazeX.current = 0;
      smoothGazeY.current = 0;
      gazeDirState.current = 'CENTER';
      currentGazeCandidate.current = 'CENTER';
      gazeDwellStart.current = 0;
      gazeFiredInThisLook.current = false;
      reArmedRef.current = false;
      centerStabilityStart.current = 0;
      lastExecutedActionRef.current = action;
      lastExecutedTimestampRef.current = now;
      const updated: EyeTrackingState = {
        ...latestTelemetryRef.current,
        currentAction: action,
        lastExecutedAction: action,
        lastExecutedTimestamp: now,
        lastActionTriggered: `${action} (Thủ công)`,
        gazeDirection: 'CENTER',
        directionH: 'CENTER',
        directionV: 'CENTER',
        gazeX: 0,
        gazeY: 0,
        rawGazeX: 0,
        rawGazeY: 0,
        cooldownRemainingMs: ACTION_COOLDOWN_MS,
        cooldownTotalMs: ACTION_COOLDOWN_MS,
        reArmed: false,
      };
      latestTelemetryRef.current = updated;
      setTrackingState(updated);
    } else {
      smoothGazeX.current = 0;
      smoothGazeY.current = 0;
      gazeDirState.current = 'CENTER';
      currentGazeCandidate.current = 'CENTER';
      const updated: EyeTrackingState = {
        ...latestTelemetryRef.current,
        lastActionTriggered: `Không có phần tử ${action === 'RIGHT' ? 'bên phải' : action === 'LEFT' ? 'bên trái' : action === 'UP' ? 'phía trên' : action === 'DOWN' ? 'phía dưới' : 'hợp lệ'}`,
        gazeDirection: 'CENTER',
        directionH: 'CENTER',
        directionV: 'CENTER',
        gazeX: 0,
        gazeY: 0,
      };
      latestTelemetryRef.current = updated;
      setTrackingState(updated);
    }
  }, [dispatchAction]);

  // Gaze classification & Re-Arm state machine refs
  const smoothGazeX = useRef<number>(0);
  const smoothGazeY = useRef<number>(0);
  const neutralRunningX = useRef<number>(0);
  const neutralRunningY = useRef<number>(0);
  const neutralRunningEAR = useRef<number>(0.26);
  const initFramesCount = useRef<number>(0);
  const noFaceFramesCount = useRef<number>(0);
  const gazeDirState = useRef<GazeDirection>('CENTER');
  const currentGazeCandidate = useRef<GazeDirection>('CENTER');
  const gazeDwellStart = useRef<number>(0);
  const gazeFiredInThisLook = useRef<boolean>(false);
  const reArmedRef = useRef<boolean>(true);
  const centerStabilityStart = useRef<number>(0);

  // Double-Blink state machine refs (2 blinks in <= 1.5s = SELECT)
  const isEyesClosed = useRef<boolean>(false);
  const closeStartTime = useRef<number | null>(null);
  const blinkCountInGesture = useRef<number>(0);
  const firstBlinkTime = useRef<number>(0);
  const lastBlinkEndTime = useRef<number>(0);
  const selectSuccessUntil = useRef<number>(0);

  // Command Arbiter Cooldown ref (1000ms standard)
  const cooldownTimer = useRef<number>(0);
  const lastExecutedActionRef = useRef<EyeAction>('NONE');
  const lastExecutedTimestampRef = useRef<number>(0);

  const lastFrameTime = useRef<number>(performance.now());

  // Load MediaPipe CDN Script once
  useEffect(() => {
    let active = true;
    async function loadLibraries() {
      try {
        if ((window as any).FaceMesh) {
          if (active) setLibsLoading(false);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
        script.async = true;

        const scriptPromise = new Promise((resolve, reject) => {
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load FaceMesh library from CDN.'));
        });

        document.head.appendChild(script);
        await scriptPromise;

        if (active) setLibsLoading(false);
      } catch (err: any) {
        if (active) {
          setLibError(err.message || 'Không thể nạp thư viện camera!');
          setLibsLoading(false);
        }
      }
    }
    loadLibraries();
    return () => { active = false; };
  }, []);

  // Process face mesh frame results at high frequency (30 FPS)
  const processFaceMeshResults = useCallback((results: any) => {
    const now = performance.now();
    const elapsed = Math.min(100, Math.max(1, now - lastFrameTime.current));
    lastFrameTime.current = now;

    const landmarks = results.multiFaceLandmarks?.[0];

    // Cache latest landmarks globally for live canvas overlays
    (window as any).__eyeai_latest_landmarks = landmarks;

    // Fast exit if no face detected
    if (!landmarks) {
      noFaceFramesCount.current += 1;
      // If face has been missing for over ~2 seconds, reset auto-centering warm-up
      if (noFaceFramesCount.current > 60) {
        initFramesCount.current = 0;
      }

      const prev = latestTelemetryRef.current;
      const shouldDispatch = prev.faceDetected || prev.eyesClosed || (now - lastTelemetryDispatchTime.current > TELEMETRY_THROTTLE_MS);

      if (cooldownTimer.current > 0) {
        cooldownTimer.current = Math.max(0, cooldownTimer.current - elapsed);
      }

      latestTelemetryRef.current = {
        ...prev,
        faceDetected: false,
        eyesClosed: false,
        closedDuration: 0.0,
        currentAction: 'NONE',
        actionProgress: 0,
        gazeDirection: 'UNKNOWN',
        directionH: 'CENTER',
        directionV: 'CENTER',
        rawGazeX: 0,
        rawGazeY: 0,
        gazeX: 0,
        gazeY: 0,
        confidence: 0,
        blinkCount: 0,
        blinkWindowRemainingMs: 0,
        cooldownRemainingMs: Math.round(cooldownTimer.current),
      };

      if (shouldDispatch) {
        lastTelemetryDispatchTime.current = now;
        setTrackingState({ ...latestTelemetryRef.current });
      }
      return;
    }

    noFaceFramesCount.current = 0;

    const metrics = analyzeEyes(landmarks);
    if (!metrics) return;

    // Cache metrics in ref
    latestMetricsRef.current = {
      avgEAR: metrics.avgEAR,
      leftEAR: metrics.leftEAR,
      rightEAR: metrics.rightEAR,
      compensatedGazeX: metrics.compensatedGazeX,
      compensatedGazeY: metrics.compensatedGazeY,
      rawGazeX: metrics.rawGazeX,
      rawGazeY: metrics.rawGazeY,
      headYaw: metrics.headYaw,
      headPitch: metrics.headPitch,
      confidence: metrics.confidence,
    };

    // Decrement Command Arbiter Cooldown Timer
    if (cooldownTimer.current > 0) {
      cooldownTimer.current -= elapsed;
      if (cooldownTimer.current < 0) cooldownTimer.current = 0;
    }

    // =========================================================================
    // 1. DOUBLE-BLINK TO SELECT STATE MACHINE (PRIORITY #1 - Evaluates BEFORE Gaze)
    // - Chớp mắt 2 cái trong vòng 1.5s: CHỌN (SELECT)
    // - Sau mỗi 1.5s nếu chưa đủ 2 cái sẽ tự động về 0
    // - Cộng dồn đến 2 cái chớp là thực hiện thao tác chọn
    // - Khi chớp mắt, TUYỆT ĐỐI KHÔNG nhận diện sang thao tác chuyển hướng khác
    // =========================================================================
    // Robust human baseline EAR (typically 0.26 - 0.38 when open)
    const openBaselineEAR = Math.max(0.22, Math.min(0.42, neutralRunningEAR.current || calibration.neutralEAR || 0.29));
    // When a human blinks naturally, EAR drops by ~22-38% from open baseline.
    // Setting threshold to 78% of open baseline provides rapid, highly reliable detection without requiring hard squinting.
    const dynamicBlinkThresh = Math.max(0.16, Math.min(0.28, openBaselineEAR * 0.78));
    const blinkThresh = calibration.isCalibrated && calibration.blinkThreshold
      ? Math.max(0.16, Math.min(0.29, calibration.blinkThreshold))
      : dynamicBlinkThresh;
    // Hysteresis: to close, drop below blinkThresh. To reopen, rise above blinkThresh + 0.015
    const currentThresh = isEyesClosed.current ? (blinkThresh + 0.015) : blinkThresh;
    const isClosedNow = metrics.avgEAR < currentThresh || (metrics.leftEAR < currentThresh && metrics.rightEAR < currentThresh);
    let curClosedDuration = 0.0;
    let actionTriggeredThisFrame: EyeAction = 'NONE';
    let actionProg = 0;

    // Check expiration of 1.5s window for 2nd blink
    if (blinkCountInGesture.current === 1) {
      const elapsedSinceFirstBlink = now - firstBlinkTime.current;
      if (elapsedSinceFirstBlink > 1500) {
        blinkCountInGesture.current = 0;
        firstBlinkTime.current = 0;
        lastBlinkEndTime.current = now; // Add refractory buffer after window expires
      }
    }

    if (isClosedNow) {
      // While eyes are closing or closed, gaze is strictly locked at CENTER
      smoothGazeX.current = 0;
      smoothGazeY.current = 0;
      gazeDirState.current = 'CENTER';
      currentGazeCandidate.current = 'CENTER';
      gazeDwellStart.current = 0;
      gazeFiredInThisLook.current = false;
      centerStabilityStart.current = 0;

      if (!isEyesClosed.current) {
        isEyesClosed.current = true;
        closeStartTime.current = now;
      }
      const holdMs = now - (closeStartTime.current || now);
      curClosedDuration = parseFloat((holdMs / 1000).toFixed(1));
    } else {
      if (isEyesClosed.current) {
        // Eyes JUST REOPENED! Evaluate blink duration
        const blinkDuration = now - (closeStartTime.current || now);
        isEyesClosed.current = false;
        closeStartTime.current = null;
        curClosedDuration = 0.0;
        lastBlinkEndTime.current = now; // Mark blink finished timestamp

        // Force gaze to CENTER upon reopening
        smoothGazeX.current = 0;
        smoothGazeY.current = 0;
        gazeDirState.current = 'CENTER';
        currentGazeCandidate.current = 'CENTER';
        gazeDwellStart.current = 0;
        gazeFiredInThisLook.current = false;
        centerStabilityStart.current = 0;

        // Valid deliberate human blink is between 25ms and 750ms
        const isValidBlink = blinkDuration >= 25 && blinkDuration <= 750;

        if (isValidBlink && cooldownTimer.current <= 0) {
          if (blinkCountInGesture.current === 0) {
            // First blink registered!
            blinkCountInGesture.current = 1;
            firstBlinkTime.current = now;
          } else if (blinkCountInGesture.current === 1) {
            // Second blink registered!
            const interval = now - firstBlinkTime.current;
            if (interval <= 1500) {
              // Valid Double-Blink within 1.5s -> Trigger SELECT!
              blinkCountInGesture.current = 0;
              firstBlinkTime.current = 0;
              selectSuccessUntil.current = now + 1200; // Keep showing 2 / 2 on UI for 1.2s

              const executed = dispatchAction('SELECT');
              const nowTs = performance.now();
              cooldownTimer.current = ACTION_COOLDOWN_MS; // 2.5s cooldown
              actionTriggeredThisFrame = 'SELECT';
              lastExecutedActionRef.current = 'SELECT';
              lastExecutedTimestampRef.current = nowTs;
              reArmedRef.current = false;

              // Firmly lock gaze
              smoothGazeX.current = 0;
              smoothGazeY.current = 0;
              gazeDirState.current = 'CENTER';
              currentGazeCandidate.current = 'CENTER';
              gazeDwellStart.current = 0;
              gazeFiredInThisLook.current = false;
              centerStabilityStart.current = 0;

              const updatedSelect: EyeTrackingState = {
                ...latestTelemetryRef.current,
                rawEAR: parseFloat(metrics.avgEAR.toFixed(3)),
                blinkThreshold: parseFloat(blinkThresh.toFixed(3)),
                baselineEAR: parseFloat(openBaselineEAR.toFixed(3)),
                lastActionTriggered: executed ? 'SELECT (Chớp mắt 2 cái - Đã Chọn)' : 'Chưa có phần tử được chọn',
                currentAction: 'SELECT',
                lastExecutedAction: 'SELECT',
                lastExecutedTimestamp: nowTs,
                gazeDirection: 'CENTER',
                directionH: 'CENTER',
                directionV: 'CENTER',
                gazeX: 0,
                gazeY: 0,
                rawGazeX: 0,
                rawGazeY: 0,
                blinkCount: 2,
                blinkWindowRemainingMs: 0,
                closedDuration: 0,
                actionProgress: 100,
                cooldownRemainingMs: ACTION_COOLDOWN_MS,
                cooldownTotalMs: ACTION_COOLDOWN_MS,
              };
              latestTelemetryRef.current = updatedSelect;
              setTrackingState(updatedSelect);
            } else {
              // Exceeded 1.5s: Start new cycle with this blink as #1
              blinkCountInGesture.current = 1;
              firstBlinkTime.current = now;
            }
          }
        } else if (blinkDuration > 800) {
          // Prolonged closure: not a blink gesture, reset window
          blinkCountInGesture.current = 0;
          firstBlinkTime.current = 0;
        }
      }
    }

    // Telemetry feedback during 1.5s waiting window for 2nd blink
    if (blinkCountInGesture.current === 1 && actionTriggeredThisFrame === 'NONE' && cooldownTimer.current <= 0) {
      const remainingMs = Math.max(0, 1500 - (now - firstBlinkTime.current));
      const remainingSecs = (remainingMs / 1000).toFixed(1);
      actionProg = Math.min(100, Math.round((remainingMs / 1500) * 100));

      latestTelemetryRef.current = {
        ...latestTelemetryRef.current,
        blinkCount: 1,
        blinkWindowRemainingMs: Math.round(remainingMs),
        actionProgress: actionProg,
        lastActionTriggered: `Đã chớp 1 cái (Chớp cái 2 trong ${remainingSecs}s để Chọn)...`,
      };
    }

    // =========================================================================
    // 2. CANTHAL-REFERENCED GAZE DIRECTION CLASSIFIER (PRIORITY #2)
    // =========================================================================
    // Dynamic thresholds from calibration (or robust defaults)
    const threshUp = Math.max(0.014, Math.min(calibration.thresholdUp || 0.018, 0.024));
    const threshDown = Math.max(0.014, Math.min(calibration.thresholdDown || 0.018, 0.024));
    const threshLeft = Math.max(0.020, Math.min(calibration.thresholdLeft || 0.026, 0.034));
    const threshRight = Math.max(0.020, Math.min(calibration.thresholdRight || 0.026, 0.034));

    // AUTO-ZERO WARM-UP (First 35 frames when face is detected)
    if (initFramesCount.current < 35) {
      initFramesCount.current += 1;
      if (initFramesCount.current === 1) {
        neutralRunningX.current = metrics.compensatedGazeX;
        neutralRunningY.current = metrics.compensatedGazeY;
        neutralRunningEAR.current = Math.max(0.24, metrics.avgEAR);
      } else {
        neutralRunningX.current = 0.25 * metrics.compensatedGazeX + 0.75 * neutralRunningX.current;
        neutralRunningY.current = 0.25 * metrics.compensatedGazeY + 0.75 * neutralRunningY.current;
        if (metrics.avgEAR > 0.20) {
          neutralRunningEAR.current = 0.15 * metrics.avgEAR + 0.85 * neutralRunningEAR.current;
        }
      }
      smoothGazeX.current = 0;
      smoothGazeY.current = 0;
      gazeDirState.current = 'CENTER';
    } else {
      // Continuous gentle drift compensation while user rests at CENTER and eyes are open
      if (gazeDirState.current === 'CENTER' && !isEyesClosed.current && !isClosedNow && metrics.avgEAR >= blinkThresh + 0.025) {
        const driftAlpha = 0.012;
        neutralRunningX.current = driftAlpha * metrics.compensatedGazeX + (1 - driftAlpha) * neutralRunningX.current;
        neutralRunningY.current = driftAlpha * metrics.compensatedGazeY + (1 - driftAlpha) * neutralRunningY.current;
        if (metrics.avgEAR >= blinkThresh + 0.03) {
          neutralRunningEAR.current = 0.005 * metrics.avgEAR + 0.995 * neutralRunningEAR.current;
        }
      }
    }

    const neutralX = calibration.isCalibrated && calibration.neutralIrisH
      ? calibration.neutralIrisH
      : neutralRunningX.current;
    const neutralY = calibration.isCalibrated && calibration.neutralIrisV
      ? calibration.neutralIrisV
      : neutralRunningY.current;

    const rawDeltaX = metrics.compensatedGazeX - neutralX;
    const rawDeltaY = metrics.compensatedGazeY - neutralY;

    // GAZE CLASSIFICATION SAFETY GATE:
    // Gaze movement is strictly prohibited if:
    // - Cooldown is active (> 0)
    // - Eyes are closed or closing (isClosedNow || isEyesClosed.current)
    // - Eyes are narrowed or in mid-blink (metrics.avgEAR < blinkThresh + 0.015)
    // - Within 300ms of eyes reopening after closing (prevents landmark jitter)
    // - Blink gesture is pending (blinkCountInGesture.current > 0) -> LOCK GAZE COMPLETELY
    // - Action already triggered this frame
    const isGazeAllowed =
      initFramesCount.current >= 35 &&
      cooldownTimer.current <= 0 &&
      !isClosedNow &&
      !isEyesClosed.current &&
      metrics.avgEAR >= blinkThresh + 0.015 &&
      (now - lastBlinkEndTime.current >= 300) &&
      blinkCountInGesture.current === 0 &&
      actionTriggeredThisFrame === 'NONE';

    let detectedDir: GazeDirection = 'CENTER';
    actionProg = 0;

    if (!isGazeAllowed) {
      smoothGazeX.current = 0;
      smoothGazeY.current = 0;
      detectedDir = 'CENTER';
      currentGazeCandidate.current = 'CENTER';
      gazeDwellStart.current = 0;
      gazeFiredInThisLook.current = false;
      centerStabilityStart.current = 0;
    } else {
      // Exponential Moving Average smoothing
      const alpha = 0.45;
      smoothGazeX.current = alpha * rawDeltaX + (1 - alpha) * smoothGazeX.current;
      smoothGazeY.current = alpha * rawDeltaY + (1 - alpha) * smoothGazeY.current;

      const curGx = smoothGazeX.current;
      const curGy = smoothGazeY.current;

      // Hysteresis release thresholds
      const relUp = threshUp * 0.55;
      const relDown = threshDown * 0.55;
      const relLeft = threshLeft * 0.55;
      const relRight = threshRight * 0.55;

      const curGazeState = gazeDirState.current;

      if (curGazeState === 'CENTER' || curGazeState === 'UNKNOWN') {
        const normH = Math.abs(curGx) / (curGx >= 0 ? threshRight : threshLeft);
        const normV = Math.abs(curGy) / (curGy >= 0 ? threshDown : threshUp);

        if (normH >= 1.0 && normH > normV * 1.05) {
          detectedDir = curGx > 0 ? 'RIGHT' : 'LEFT';
        } else if (normV >= 1.0 && normV > normH * 1.05) {
          detectedDir = curGy > 0 ? 'DOWN' : 'UP';
        } else {
          detectedDir = 'CENTER';
        }
      } else if (curGazeState === 'RIGHT') {
        detectedDir = curGx < relRight ? 'CENTER' : 'RIGHT';
      } else if (curGazeState === 'LEFT') {
        detectedDir = curGx > -relLeft ? 'CENTER' : 'LEFT';
      } else if (curGazeState === 'DOWN') {
        detectedDir = curGy < relDown ? 'CENTER' : 'DOWN';
      } else if (curGazeState === 'UP') {
        detectedDir = curGy > -relUp ? 'CENTER' : 'UP';
      }

      if (metrics.confidence < 0.35) {
        detectedDir = 'UNKNOWN';
      }

      gazeDirState.current = detectedDir;

      // Re-arm state check
      if (detectedDir === 'CENTER') {
        if (centerStabilityStart.current === 0) {
          centerStabilityStart.current = now;
        } else if (now - centerStabilityStart.current >= 140) {
          reArmedRef.current = true;
        }
      } else {
        centerStabilityStart.current = 0;
      }

      // Intentional Dwell Confirmation (220ms = deliberate glance)
      const targetDwellMs = 220;
      if (detectedDir !== 'CENTER' && detectedDir !== 'UNKNOWN') {
        if (currentGazeCandidate.current !== detectedDir) {
          currentGazeCandidate.current = detectedDir;
          gazeDwellStart.current = now;
          gazeFiredInThisLook.current = false;
        } else {
          const dwellDuration = now - gazeDwellStart.current;
          actionProg = Math.min(100, Math.round((dwellDuration / targetDwellMs) * 100));

          if (dwellDuration >= targetDwellMs) {
            if (
              !gazeFiredInThisLook.current &&
              reArmedRef.current &&
              cooldownTimer.current <= 0
            ) {
              const mappedAction: EyeAction =
                detectedDir === 'RIGHT' ? 'RIGHT' :
                detectedDir === 'LEFT' ? 'LEFT' :
                detectedDir === 'UP' ? 'UP' : 'DOWN';

              actionTriggeredThisFrame = mappedAction;
              gazeFiredInThisLook.current = true;
              reArmedRef.current = false;

              const executed = dispatchAction(mappedAction);
              if (executed) {
                lastExecutedActionRef.current = mappedAction;
                lastExecutedTimestampRef.current = now;
                cooldownTimer.current = ACTION_COOLDOWN_MS; // 2.5s cooldown
                smoothGazeX.current = 0;
                smoothGazeY.current = 0;
                gazeDirState.current = 'CENTER';
                currentGazeCandidate.current = 'CENTER';
                gazeDwellStart.current = 0;
                gazeFiredInThisLook.current = false;
                reArmedRef.current = false;
                centerStabilityStart.current = 0;

                const updated: EyeTrackingState = {
                  ...latestTelemetryRef.current,
                  lastActionTriggered: `${mappedAction} (Ánh mắt)`,
                  currentAction: mappedAction,
                  lastExecutedAction: mappedAction,
                  lastExecutedTimestamp: now,
                  gazeDirection: 'CENTER',
                  directionH: 'CENTER',
                  directionV: 'CENTER',
                  gazeX: 0,
                  gazeY: 0,
                  rawGazeX: 0,
                  rawGazeY: 0,
                  cooldownRemainingMs: ACTION_COOLDOWN_MS,
                  cooldownTotalMs: ACTION_COOLDOWN_MS,
                  reArmed: false,
                };
                latestTelemetryRef.current = updated;
                setTrackingState(updated);
              } else {
                smoothGazeX.current = 0;
                smoothGazeY.current = 0;
                gazeDirState.current = 'CENTER';
                currentGazeCandidate.current = 'CENTER';
                gazeDwellStart.current = 0;
                gazeFiredInThisLook.current = false;
                reArmedRef.current = false;
                centerStabilityStart.current = 0;
                cooldownTimer.current = 1000;
                const dirText =
                  mappedAction === 'RIGHT' ? 'bên phải' :
                  mappedAction === 'LEFT' ? 'bên trái' :
                  mappedAction === 'UP' ? 'phía trên' : 'phía dưới';

                const updated: EyeTrackingState = {
                  ...latestTelemetryRef.current,
                  lastActionTriggered: `Không có phần tử ${dirText}`,
                  currentAction: 'NONE',
                  gazeDirection: 'CENTER',
                  directionH: 'CENTER',
                  directionV: 'CENTER',
                  gazeX: 0,
                  gazeY: 0,
                  reArmed: false,
                };
                latestTelemetryRef.current = updated;
                setTrackingState(updated);
              }
            }
          }
        }
      } else {
        currentGazeCandidate.current = detectedDir;
        gazeFiredInThisLook.current = false;
      }
    }

    const detectedDirH: 'LEFT' | 'RIGHT' | 'CENTER' =
      detectedDir === 'RIGHT' ? 'RIGHT' : detectedDir === 'LEFT' ? 'LEFT' : 'CENTER';
    const detectedDirV: 'UP' | 'DOWN' | 'CENTER' =
      detectedDir === 'UP' ? 'UP' : detectedDir === 'DOWN' ? 'DOWN' : 'CENTER';
    const curGx = smoothGazeX.current;
    const curGy = smoothGazeY.current;

    // =========================================================================
    // 4. REACT STATE TELEMETRY DISPATCH (THROTTLED & SYNCED WITH ARBITER)
    // =========================================================================
    const prevTelemetry = latestTelemetryRef.current;
    let currentBlinkCount = blinkCountInGesture.current;
    let currentBlinkRemainingMs = 0;

    if (now < selectSuccessUntil.current) {
      currentBlinkCount = 2;
      currentBlinkRemainingMs = 0;
    } else if (blinkCountInGesture.current === 1) {
      currentBlinkCount = 1;
      currentBlinkRemainingMs = Math.max(0, 1500 - (now - firstBlinkTime.current));
    } else {
      currentBlinkCount = 0;
      currentBlinkRemainingMs = 0;
    }

    const hasMajorTransition =
      prevTelemetry.faceDetected !== true ||
      prevTelemetry.eyesClosed !== isClosedNow ||
      prevTelemetry.blinkCount !== currentBlinkCount ||
      prevTelemetry.gazeDirection !== detectedDir ||
      actionTriggeredThisFrame !== 'NONE';

    const timeSinceLastDispatch = now - lastTelemetryDispatchTime.current;
    const isThrottleDue = timeSinceLastDispatch >= (currentBlinkCount === 1 ? 40 : TELEMETRY_THROTTLE_MS);

    const nextTelemetry: EyeTrackingState = {
      ...prevTelemetry,
      rawEAR: parseFloat(metrics.avgEAR.toFixed(3)),
      leftEAR: parseFloat(metrics.leftEAR.toFixed(3)),
      rightEAR: parseFloat(metrics.rightEAR.toFixed(3)),
      blinkThreshold: parseFloat(blinkThresh.toFixed(3)),
      baselineEAR: parseFloat(openBaselineEAR.toFixed(3)),
      gazeDirection: detectedDir,
      directionH: detectedDirH,
      directionV: detectedDirV,
      currentAction: actionTriggeredThisFrame !== 'NONE' ? actionTriggeredThisFrame : prevTelemetry.currentAction,
      lastExecutedAction: lastExecutedActionRef.current,
      lastExecutedTimestamp: lastExecutedTimestampRef.current,
      actionProgress: actionProg,
      faceDetected: true,
      eyesClosed: isClosedNow,
      blinkCount: currentBlinkCount,
      blinkWindowRemainingMs: Math.round(currentBlinkRemainingMs),
      closedDuration: curClosedDuration,
      rawGazeX: parseFloat(rawDeltaX.toFixed(3)),
      rawGazeY: parseFloat(rawDeltaY.toFixed(3)),
      gazeX: parseFloat(curGx.toFixed(3)),
      gazeY: parseFloat(curGy.toFixed(3)),
      headYaw: parseFloat(metrics.headYaw.toFixed(2)),
      headPitch: parseFloat(metrics.headPitch.toFixed(2)),
      confidence: parseFloat(metrics.confidence.toFixed(2)),
      cooldownRemainingMs: Math.round(cooldownTimer.current),
      cooldownTotalMs: ACTION_COOLDOWN_MS,
      reArmed: reArmedRef.current,
    };

    latestTelemetryRef.current = nextTelemetry;

    if (hasMajorTransition || isThrottleDue) {
      lastTelemetryDispatchTime.current = now;
      setTrackingState(nextTelemetry);
    }
  }, [calibration, dispatchAction]);

  // Simulator Keyboard Support
  useEffect(() => {
    if (!settings.simulatorMode) return;

    let spaceTimer: any = null;
    let spacePending = false;

    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const now = performance.now();

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (cooldownTimer.current <= 0) {
          const executed = dispatchAction('RIGHT');
          if (executed) {
            cooldownTimer.current = ACTION_COOLDOWN_MS;
            smoothGazeX.current = 0;
            smoothGazeY.current = 0;
            gazeDirState.current = 'CENTER';
            currentGazeCandidate.current = 'CENTER';
            reArmedRef.current = false;
            centerStabilityStart.current = 0;
            lastExecutedActionRef.current = 'RIGHT';
            lastExecutedTimestampRef.current = now;
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'RIGHT (Phím bấm)',
              currentAction: 'RIGHT',
              lastExecutedAction: 'RIGHT',
              lastExecutedTimestamp: now,
              gazeDirection: 'CENTER',
              directionH: 'CENTER',
              directionV: 'CENTER',
              gazeX: 0,
              gazeY: 0,
              rawGazeX: 0,
              rawGazeY: 0,
              blinkCount: 0,
              cooldownRemainingMs: ACTION_COOLDOWN_MS,
              cooldownTotalMs: ACTION_COOLDOWN_MS,
            }));
          } else {
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'Không có phần tử bên phải',
            }));
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (cooldownTimer.current <= 0) {
          const executed = dispatchAction('LEFT');
          if (executed) {
            cooldownTimer.current = ACTION_COOLDOWN_MS;
            smoothGazeX.current = 0;
            smoothGazeY.current = 0;
            gazeDirState.current = 'CENTER';
            currentGazeCandidate.current = 'CENTER';
            reArmedRef.current = false;
            centerStabilityStart.current = 0;
            lastExecutedActionRef.current = 'LEFT';
            lastExecutedTimestampRef.current = now;
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'LEFT (Phím bấm)',
              currentAction: 'LEFT',
              lastExecutedAction: 'LEFT',
              lastExecutedTimestamp: now,
              gazeDirection: 'CENTER',
              directionH: 'CENTER',
              directionV: 'CENTER',
              gazeX: 0,
              gazeY: 0,
              rawGazeX: 0,
              rawGazeY: 0,
              blinkCount: 0,
              cooldownRemainingMs: ACTION_COOLDOWN_MS,
              cooldownTotalMs: ACTION_COOLDOWN_MS,
            }));
          } else {
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'Không có phần tử bên trái',
            }));
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cooldownTimer.current <= 0) {
          const executed = dispatchAction('UP');
          if (executed) {
            cooldownTimer.current = ACTION_COOLDOWN_MS;
            smoothGazeX.current = 0;
            smoothGazeY.current = 0;
            gazeDirState.current = 'CENTER';
            currentGazeCandidate.current = 'CENTER';
            reArmedRef.current = false;
            centerStabilityStart.current = 0;
            lastExecutedActionRef.current = 'UP';
            lastExecutedTimestampRef.current = now;
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'UP (Phím bấm)',
              currentAction: 'UP',
              lastExecutedAction: 'UP',
              lastExecutedTimestamp: now,
              gazeDirection: 'CENTER',
              directionH: 'CENTER',
              directionV: 'CENTER',
              gazeX: 0,
              gazeY: 0,
              rawGazeX: 0,
              rawGazeY: 0,
              blinkCount: 0,
              cooldownRemainingMs: ACTION_COOLDOWN_MS,
              cooldownTotalMs: ACTION_COOLDOWN_MS,
            }));
          } else {
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'Không có phần tử phía trên',
            }));
          }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cooldownTimer.current <= 0) {
          const executed = dispatchAction('DOWN');
          if (executed) {
            cooldownTimer.current = ACTION_COOLDOWN_MS;
            smoothGazeX.current = 0;
            smoothGazeY.current = 0;
            gazeDirState.current = 'CENTER';
            currentGazeCandidate.current = 'CENTER';
            reArmedRef.current = false;
            centerStabilityStart.current = 0;
            lastExecutedActionRef.current = 'DOWN';
            lastExecutedTimestampRef.current = now;
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'DOWN (Phím bấm)',
              currentAction: 'DOWN',
              lastExecutedAction: 'DOWN',
              lastExecutedTimestamp: now,
              gazeDirection: 'CENTER',
              directionH: 'CENTER',
              directionV: 'CENTER',
              gazeX: 0,
              gazeY: 0,
              rawGazeX: 0,
              rawGazeY: 0,
              blinkCount: 0,
              cooldownRemainingMs: ACTION_COOLDOWN_MS,
              cooldownTotalMs: ACTION_COOLDOWN_MS,
            }));
          } else {
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: 'Không có phần tử phía dưới',
            }));
          }
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (cooldownTimer.current <= 0) {
          if (e.key === ' ') {
            // Space simulates Double Blink in simulator mode
            if (!spacePending) {
              spacePending = true;
              setTrackingState(prev => ({
                ...prev,
                blinkCount: 1,
                blinkWindowRemainingMs: 1500,
                lastActionTriggered: 'Đã chớp 1 cái (Bấm Space lần nữa trong 1.5s để Chọn)...',
              }));
              if (spaceTimer) clearTimeout(spaceTimer);
              spaceTimer = setTimeout(() => {
                spacePending = false;
                setTrackingState(prev => ({
                  ...prev,
                  blinkCount: 0,
                  blinkWindowRemainingMs: 0,
                  lastActionTriggered: 'Hết 1.5s - Bộ đếm chớp mắt về 0',
                }));
              }, 1500);
            } else {
              // 2nd press within 1.5s -> Trigger SELECT!
              if (spaceTimer) clearTimeout(spaceTimer);
              spacePending = false;
              selectSuccessUntil.current = performance.now() + 1200;
              const executed = dispatchAction('SELECT');
              const execTs = performance.now();
              cooldownTimer.current = ACTION_COOLDOWN_MS;
              smoothGazeX.current = 0;
              smoothGazeY.current = 0;
              gazeDirState.current = 'CENTER';
              currentGazeCandidate.current = 'CENTER';
              reArmedRef.current = false;
              centerStabilityStart.current = 0;
              lastExecutedActionRef.current = 'SELECT';
              lastExecutedTimestampRef.current = execTs;

              setTrackingState(prev => ({
                ...prev,
                lastActionTriggered: executed ? 'SELECT (Chớp 2 cái phím Space - Đã Chọn)' : 'Chưa có phần tử được chọn',
                currentAction: 'SELECT',
                lastExecutedAction: 'SELECT',
                lastExecutedTimestamp: execTs,
                blinkCount: 2,
                blinkWindowRemainingMs: 0,
                cooldownRemainingMs: ACTION_COOLDOWN_MS,
                cooldownTotalMs: ACTION_COOLDOWN_MS,
              }));
            }
          } else {
            // Enter key directly triggers SELECT
            const executed = dispatchAction('SELECT');
            const execTs = performance.now();
            cooldownTimer.current = ACTION_COOLDOWN_MS;
            smoothGazeX.current = 0;
            smoothGazeY.current = 0;
            gazeDirState.current = 'CENTER';
            currentGazeCandidate.current = 'CENTER';
            reArmedRef.current = false;
            centerStabilityStart.current = 0;
            lastExecutedActionRef.current = 'SELECT';
            lastExecutedTimestampRef.current = execTs;

            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: executed ? 'SELECT (Phím Enter)' : 'Chưa có phần tử được chọn',
              currentAction: 'SELECT',
              lastExecutedAction: 'SELECT',
              lastExecutedTimestamp: execTs,
              blinkCount: 0,
              blinkWindowRemainingMs: 0,
              cooldownRemainingMs: ACTION_COOLDOWN_MS,
              cooldownTotalMs: ACTION_COOLDOWN_MS,
            }));
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const executed = dispatchAction('ESCAPE');
        if (executed) {
          cooldownTimer.current = ACTION_COOLDOWN_MS;
          smoothGazeX.current = 0;
          smoothGazeY.current = 0;
          gazeDirState.current = 'CENTER';
          currentGazeCandidate.current = 'CENTER';
          reArmedRef.current = false;
          centerStabilityStart.current = 0;
          lastExecutedActionRef.current = 'DOUBLE_BLINK';
          lastExecutedTimestampRef.current = now;
          setTrackingState(prev => ({
            ...prev,
            lastActionTriggered: 'HỦY THAO TÁC (Phím Escape)',
            currentAction: 'ESCAPE',
            lastExecutedAction: 'DOUBLE_BLINK',
            lastExecutedTimestamp: now,
            blinkCount: 0,
            cooldownRemainingMs: ACTION_COOLDOWN_MS,
            cooldownTotalMs: ACTION_COOLDOWN_MS,
          }));
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (spaceTimer) clearTimeout(spaceTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settings.simulatorMode, dispatchAction]);

  // Render loop using single FaceMesh instance with Concurrency Lock (Backpressure)
  const startTrackingLoop = useCallback(() => {
    if (!(window as any).FaceMesh) return;

    if (!faceMeshRef.current) {
      const faceMesh = new (window as any).FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      faceMesh.onResults(processFaceMeshResults);
      faceMeshRef.current = faceMesh;
    }

    lastFrameTime.current = performance.now();

    const render = async () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !isProcessingRef.current && faceMeshRef.current) {
        isProcessingRef.current = true;
        try {
          await faceMeshRef.current.send({ image: video });
        } catch (e) {
          console.error('[FaceMesh send error]:', e);
        } finally {
          isProcessingRef.current = false;
        }
      }
      if (mediaStreamRef.current && mediaStreamRef.current.active) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };
    animationFrameRef.current = requestAnimationFrame(render);
  }, [processFaceMeshResults]);

  const stopTrackingLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isProcessingRef.current = false;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      mediaStreamRef.current = null;
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    const stoppedState: EyeTrackingState = {
      ...latestTelemetryRef.current,
      cameraActive: false,
      faceDetected: false,
      eyesClosed: false,
      closedDuration: 0.0,
      blinkCount: 0,
      currentAction: 'NONE',
    };
    latestTelemetryRef.current = stoppedState;
    setTrackingState(stoppedState);
  }, []);

  const startCamera = useCallback(async () => {
    const isSec = typeof window !== 'undefined' ? window.isSecureContext : false;
    const hasMediaDevices = typeof navigator !== 'undefined' ? !!navigator.mediaDevices : false;
    const hasGetUserMedia = typeof navigator !== 'undefined' ? !!navigator.mediaDevices?.getUserMedia : false;

    if (typeof window !== 'undefined' && !isSec) {
      const errMsg = 'Trình duyệt yêu cầu ngữ cảnh bảo mật (HTTPS hoặc localhost) để mở Camera.';
      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
      return;
    }

    if (!hasMediaDevices || !hasGetUserMedia) {
      const errMsg = 'Trình duyệt không hỗ trợ WebRTC / MediaDevices getUserMedia.';
      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
      return;
    }

    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      const activeTracks = mediaStreamRef.current.getVideoTracks().filter(t => t.readyState === 'live');
      if (activeTracks.length > 0) {
        if (videoRef.current) {
          if (videoRef.current.srcObject !== mediaStreamRef.current) {
            videoRef.current.srcObject = mediaStreamRef.current;
          }
          try {
            await videoRef.current.play();
          } catch (e) {
            // Ignore
          }
          startTrackingLoop();
        }
        const activeState = { ...latestTelemetryRef.current, cameraActive: true, cameraError: null };
        latestTelemetryRef.current = activeState;
        setTrackingState(activeState);
        return;
      }
    }

    try {
      const clearingState = { ...latestTelemetryRef.current, cameraError: null };
      latestTelemetryRef.current = clearingState;
      setTrackingState(clearingState);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (firstErr: any) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      const tracks = stream.getVideoTracks();
      if (tracks.length === 0) {
        throw new Error('No video tracks available in stream');
      }

      mediaStreamRef.current = stream;
      setCameraStream(stream);

      initFramesCount.current = 0;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startTrackingLoop();
      }

      const readyState = { ...latestTelemetryRef.current, cameraActive: true, cameraError: null };
      latestTelemetryRef.current = readyState;
      setTrackingState(readyState);
    } catch (err: any) {
      const errMsg = err.message || 'Không thể truy cập camera. Vui lòng cấp quyền camera.';
      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
    }
  }, [startTrackingLoop]);

  const toggleCamera = useCallback(async () => {
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      stopTrackingLoop();
    } else {
      await startCamera();
    }
  }, [startCamera, stopTrackingLoop]);

  useEffect(() => {
    if (settings.eyeControlEnabled && !libsLoading && !libError) {
      startCamera();
    } else if (!settings.eyeControlEnabled) {
      stopTrackingLoop();
    }
  }, [settings.eyeControlEnabled, libsLoading, libError, startCamera, stopTrackingLoop]);

  // Clean teardown on unmount
  useEffect(() => {
    return () => {
      stopTrackingLoop();
    };
  }, [stopTrackingLoop]);

  // =========================================================================
  // 5. FIVE-POINT CALIBRATION WORKFLOW (CENTER -> UP -> DOWN -> LEFT -> RIGHT)
  // =========================================================================
  const calibrationCancelRef = useRef<boolean>(false);

  const cancelCalibration = useCallback(() => {
    calibrationCancelRef.current = true;
    setCalibrationStep('idle');
    setCalibrationStage('idle');
    setCalibrationProgress(0);
    setCalibrationMessage('Đã hủy hiệu chỉnh.');
  }, []);

  const resetCalibration = useCallback(() => {
    initFramesCount.current = 0;
    neutralRunningX.current = 0;
    neutralRunningY.current = 0;
    smoothGazeX.current = 0;
    smoothGazeY.current = 0;
    gazeDirState.current = 'CENTER';
    const defaultCalib: EyeCalibrationData = {
      neutralEAR: 0.25,
      blinkThreshold: 0.16,
      neutralIrisH: 0.0,
      neutralIrisV: 0.0,
      thresholdH: 0.028,
      thresholdV: 0.018,
      thresholdUp: 0.018,
      thresholdDown: 0.018,
      thresholdLeft: 0.028,
      thresholdRight: 0.028,
      isCalibrated: false,
    };
    setCalibration(defaultCalib);
    localStorage.removeItem('luckydream_eye_calibration');
    localStorage.removeItem('eyeai_calibration');
    setCalibrationMessage('Đã đặt lại hiệu chỉnh mặc định.');
    speakVietnamese('Đã đặt lại hiệu chỉnh');
  }, []);

  const reZeroCenter = useCallback(() => {
    const currentMetrics = latestMetricsRef.current;
    if (currentMetrics && currentMetrics.confidence >= 0.3) {
      neutralRunningX.current = currentMetrics.compensatedGazeX;
      neutralRunningY.current = currentMetrics.compensatedGazeY;
    }
    initFramesCount.current = 0;
    smoothGazeX.current = 0;
    smoothGazeY.current = 0;
    gazeDirState.current = 'CENTER';
    currentGazeCandidate.current = 'CENTER';
    reArmedRef.current = true;
    centerStabilityStart.current = performance.now();

    setCalibration(prev => {
      const updated: EyeCalibrationData = {
        ...prev,
        neutralIrisH: neutralRunningX.current,
        neutralIrisV: neutralRunningY.current,
      };
      try {
        localStorage.setItem('eyeai_calibration', JSON.stringify(updated));
        localStorage.setItem('luckydream_eye_calibration', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setTrackingState(prev => ({
      ...prev,
      gazeDirection: 'CENTER',
      directionH: 'CENTER',
      directionV: 'CENTER',
      rawGazeX: 0,
      rawGazeY: 0,
      gazeX: 0,
      gazeY: 0,
      lastActionTriggered: 'Đã căn tâm',
    }));

    speakVietnamese('Đã căn tâm');
  }, []);

  const start5PointCalibration = useCallback(async () => {
    calibrationCancelRef.current = false;
    setCalibrationStage('countdown');
    setCalibrationProgress(0);

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Helper to collect frames for a specific step
    const collectStepFrames = async (stepName: CalibrationStep, promptText: string, voicePrompt: string) => {
      if (calibrationCancelRef.current) return null;

      setCalibrationStep(stepName);
      setCalibrationStage('collecting');
      setCalibrationMessage(promptText);
      speakVietnamese(voicePrompt);

      const collectedEAR: number[] = [];
      const collectedX: number[] = [];
      const collectedY: number[] = [];

      const requiredSamples = 32;
      let samples = 0;

      for (let i = 0; i < 60 && samples < requiredSamples; i++) {
        if (calibrationCancelRef.current) return null;
        await sleep(55);

        const currentMetrics = latestMetricsRef.current;
        if (currentMetrics.avgEAR > 0.12 && currentMetrics.confidence > 0.4) {
          collectedEAR.push(currentMetrics.avgEAR);
          collectedX.push(currentMetrics.compensatedGazeX);
          collectedY.push(currentMetrics.compensatedGazeY);
          samples++;
          setCalibrationProgress(Math.round((samples / requiredSamples) * 100));
        }
      }

      if (samples < 15) {
        // Not enough samples
        return null;
      }

      // Sort and take trimmed median to discard outliers
      collectedEAR.sort((a, b) => a - b);
      collectedX.sort((a, b) => a - b);
      collectedY.sort((a, b) => a - b);

      const midIdx = Math.floor(samples / 2);
      const medianEAR = collectedEAR[midIdx];
      const medianX = collectedX[midIdx];
      const medianY = collectedY[midIdx];

      return { medianEAR, medianX, medianY };
    };

    try {
      // Step 1: Countdown
      for (let cd = 3; cd > 0; cd--) {
        if (calibrationCancelRef.current) return;
        setCalibrationMessage(`Chuẩn bị... Giữ đầu thẳng trong ${cd}s`);
        await sleep(1000);
      }

      // Step 2: CENTER (Nhìn thẳng)
      const centerData = await collectStepFrames(
        'center',
        'Bước 1/5: Hãy nhìn thẳng vào tâm camera',
        'Bước 1: Hãy nhìn thẳng vào tâm camera'
      );
      if (!centerData || calibrationCancelRef.current) {
        throw new Error('Không thu thập đủ dữ liệu nhìn thẳng. Vui lòng thử lại.');
      }
      await sleep(400);

      // Step 3: UP (Nhìn lên)
      const upData = await collectStepFrames(
        'up',
        'Bước 2/5: Hãy nhìn lên phía trên',
        'Bước 2: Hãy nhìn lên phía trên'
      );
      if (!upData || calibrationCancelRef.current) {
        throw new Error('Không thu thập đủ dữ liệu nhìn lên.');
      }
      await sleep(400);

      // Step 4: DOWN (Nhìn xuống)
      const downData = await collectStepFrames(
        'down',
        'Bước 3/5: Hãy nhìn xuống phía dưới',
        'Bước 3: Hãy nhìn xuống phía dưới'
      );
      if (!downData || calibrationCancelRef.current) {
        throw new Error('Không thu thập đủ dữ liệu nhìn xuống.');
      }
      await sleep(400);

      // Step 5: LEFT (Nhìn sang trái)
      const leftData = await collectStepFrames(
        'left',
        'Bước 4/5: Hãy nhìn sang bên trái',
        'Bước 4: Hãy nhìn sang bên trái'
      );
      if (!leftData || calibrationCancelRef.current) {
        throw new Error('Không thu thập đủ dữ liệu nhìn trái.');
      }
      await sleep(400);

      // Step 6: RIGHT (Nhìn sang phải)
      const rightData = await collectStepFrames(
        'right',
        'Bước 5/5: Hãy nhìn sang bên phải',
        'Bước 5: Hãy nhìn sang bên phải'
      );
      if (!rightData || calibrationCancelRef.current) {
        throw new Error('Không thu thập đủ dữ liệu nhìn phải.');
      }

      // Compute adaptive personalized thresholds
      const neutralEAR = centerData.medianEAR;
      const neutralX = centerData.medianX;
      const neutralY = centerData.medianY;

      const deltaUp = Math.abs(upData.medianY - neutralY);
      const deltaDown = Math.abs(downData.medianY - neutralY);
      const deltaLeft = Math.abs(leftData.medianX - neutralX);
      const deltaRight = Math.abs(rightData.medianX - neutralX);

      // Set personalized sensitivity margins (clamped to safe anatomical bounds)
      const thresholdUp = Math.max(0.014, Math.min(0.030, deltaUp * 0.50));
      const thresholdDown = Math.max(0.014, Math.min(0.030, deltaDown * 0.50));
      const thresholdLeft = Math.max(0.020, Math.min(0.040, deltaLeft * 0.50));
      const thresholdRight = Math.max(0.020, Math.min(0.040, deltaRight * 0.50));
      const blinkThresh = Math.max(0.12, Math.min(0.20, neutralEAR * 0.62));

      const finalCalibration: EyeCalibrationData = {
        neutralEAR,
        blinkThreshold: blinkThresh,
        neutralIrisH: neutralX,
        neutralIrisV: neutralY,
        upIrisV: upData.medianY,
        downIrisV: downData.medianY,
        leftIrisH: leftData.medianX,
        rightIrisH: rightData.medianX,
        thresholdH: (thresholdLeft + thresholdRight) / 2,
        thresholdV: (thresholdUp + thresholdDown) / 2,
        thresholdUp,
        thresholdDown,
        thresholdLeft,
        thresholdRight,
        isCalibrated: true,
        calibrationDate: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setCalibration(finalCalibration);
      neutralRunningX.current = neutralX;
      neutralRunningY.current = neutralY;
      initFramesCount.current = 0;
      try {
        localStorage.setItem('eyeai_calibration', JSON.stringify(finalCalibration));
        localStorage.setItem('luckydream_eye_calibration', JSON.stringify(finalCalibration));
      } catch (e) {}

      setCalibrationStep('completed');
      setCalibrationStage('completed');
      setCalibrationMessage('Hiệu chỉnh 5 hướng thành công!');
      speakVietnamese('Hiệu chỉnh 5 hướng thành công');

      await sleep(1800);
      setCalibrationStep('idle');
      setCalibrationStage('idle');
    } catch (err: any) {
      setCalibrationStage('idle');
      setCalibrationStep('idle');
      setCalibrationMessage(err.message || 'Lỗi trong quá trình hiệu chỉnh.');
      speakVietnamese('Hiệu chỉnh chưa hoàn thành');
    }
  }, []);

  // Quick 1-point center calibration for backwards compatibility
  const startCalibration = useCallback(() => {
    start5PointCalibration();
  }, [start5PointCalibration]);

  const setEyeControlEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem('luckydream_eye_enabled', String(enabled));
    setSettings(prev => ({ ...prev, eyeControlEnabled: enabled }));
  }, []);

  const setSimulatorMode = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, simulatorMode: enabled }));
  }, []);

  const setSoundFeedback = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, soundFeedback: enabled }));
  }, []);

  const setSpeakerEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, speakerEnabled: enabled }));
  }, []);

  const setSpeechVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setSettings(prev => ({ ...prev, speechVolume: clamped }));
  }, []);

  const setSpeechRate = useCallback((rate: number) => {
    const clamped = Math.max(0.7, Math.min(1.5, rate));
    setSettings(prev => ({ ...prev, speechRate: clamped }));
  }, []);

  const [isKeyboardOpen, setKeyboardOpen] = useState(false);

  // Stable Memoized Settings Context Value
  const settingsContextValue = useMemo<EyeTrackingSettingsContextType>(() => ({
    settings,
    calibration,
    libsLoading,
    libError,
    cameraStream,
    videoRef,
    canvasRef,
    isKeyboardOpen,
    setKeyboardOpen,
    setEyeControlEnabled,
    setSimulatorMode,
    setSoundFeedback,
    setSpeakerEnabled,
    setSpeechVolume,
    setSpeechRate,
    toggleCamera,
    startCalibration,
    start5PointCalibration,
    cancelCalibration,
    resetCalibration,
    reZeroCenter,
    calibrationStage,
    calibrationStep,
    calibrationProgress,
    calibrationMessage,
    overlaySettings,
    setOverlaySettings,
    registerGestureCallback,
    triggerManualAction,
    isVisualizerOpen,
    setVisualizerOpen,
  }), [
    settings,
    calibration,
    libsLoading,
    libError,
    cameraStream,
    isKeyboardOpen,
    setKeyboardOpen,
    calibrationStage,
    calibrationStep,
    calibrationProgress,
    calibrationMessage,
    overlaySettings,
    setOverlaySettings,
    setEyeControlEnabled,
    setSimulatorMode,
    setSoundFeedback,
    setSpeakerEnabled,
    setSpeechVolume,
    setSpeechRate,
    toggleCamera,
    startCalibration,
    start5PointCalibration,
    cancelCalibration,
    resetCalibration,
    reZeroCenter,
    registerGestureCallback,
    triggerManualAction,
    isVisualizerOpen,
    setVisualizerOpen,
  ]);

  // Throttled Telemetry Context Value
  const telemetryContextValue = useMemo<EyeTrackingTelemetryContextType>(() => ({
    trackingState,
  }), [trackingState]);

  return (
    <EyeTrackingSettingsContext.Provider value={settingsContextValue}>
      <EyeTrackingTelemetryContext.Provider value={telemetryContextValue}>
        {/* Permanent Master Video & Canvas Elements for WebRTC Stream & MediaPipe Processing */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none w-[640px] h-[480px]"
          aria-hidden="true"
        />
        <div className="fixed -top-[9999px] -left-[9999px] w-1 h-1 overflow-hidden pointer-events-none opacity-0" aria-hidden="true">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
        {children}
      </EyeTrackingTelemetryContext.Provider>
    </EyeTrackingSettingsContext.Provider>
  );
}

export function useEyeTrackingSettingsContext() {
  const ctx = useContext(EyeTrackingSettingsContext);
  if (!ctx) throw new Error('useEyeTrackingSettingsContext must be used within EyeTrackingProvider');
  return ctx;
}

export function useEyeTrackingTelemetryContext() {
  const ctx = useContext(EyeTrackingTelemetryContext);
  if (!ctx) throw new Error('useEyeTrackingTelemetryContext must be used within EyeTrackingProvider');
  return ctx;
}

export function useEyeTrackingContext() {
  const settingsCtx = useEyeTrackingSettingsContext();
  const telemetryCtx = useEyeTrackingTelemetryContext();
  return {
    ...settingsCtx,
    ...telemetryCtx,
  };
}

