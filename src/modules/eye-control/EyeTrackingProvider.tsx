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
import { LowLightExposureProcessor, extractFaceRoiFromLandmarks } from './lowLightFilter';
import { speakVietnamese, updateSpeechSettings, recoverAudioSession } from '../../utils/speech';
import { AccountType } from '../../types/account';
import {
  PRIVACY_POLICY_VERSION,
  ConsentTrigger,
  UserConsentState,
  ConsentLogEntry,
} from '../privacy/types';
import {
  getConsentState,
  grantConsent,
  revokeConsent,
  getConsentLogs,
  subscribeConsentChanges,
  clearUserEyeControlLocalData,
  createEmptyConsentState,
  appendConsentLog,
  hasValidFaceProcessingConsent,
} from '../privacy/consentService';
import {
  bindEphemeralStoreSession,
  setEphemeralLandmarks,
  setEphemeralLowLightStats,
  clearEphemeralEyeData,
  getLatestLandmarks,
} from './landmarkStore';
import {
  DEFAULT_CALIBRATION_DATA,
  DEFAULT_CALIBRATION_RETENTION_DAYS,
  StoredCalibrationProfileV1,
  loadCalibrationProfile,
  saveCalibrationProfile,
  deleteCalibrationProfile,
  readPersistedCalibrationProfile,
} from './calibrationStorage';

export interface EyeTrackingAuthContextInput {
  isAuthenticated: boolean;
  loading: boolean;
  userId: string | null;
  accountType: AccountType | null;
}

export interface EyeTrackingProviderProps {
  children: ReactNode;
  auth?: EyeTrackingAuthContextInput;
}

export interface EyeTrackingSettingsContextType {
  settings: EyeControlSettings;
  calibration: EyeCalibrationData;
  libsLoading: boolean;
  libError: string | null;
  cameraStream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  processedCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isKeyboardOpen: boolean;
  setKeyboardOpen: (open: boolean) => void;
  setEyeControlEnabled: (enabled: boolean) => void;
  setSimulatorMode: (enabled: boolean) => void;
  setSoundFeedback: (enabled: boolean) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  setSpeechVolume: (volume: number) => void;
  setSpeechRate: (rate: number) => void;
  setLowLightFilterEnabled: (enabled: boolean) => void;
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
  consentState: UserConsentState;
  consentLogs: ConsentLogEntry[];
  isConsentModalOpen: boolean;
  openConsentModal: () => void;
  closeConsentModal: () => void;
  grantFaceProcessingConsent: (alsoGrantCalibrationStorage?: boolean, trigger?: ConsentTrigger) => void;
  revokeFaceProcessingConsent: (trigger?: ConsentTrigger) => void;
  grantCalibrationStorageConsent: (trigger?: ConsentTrigger) => void;
  revokeCalibrationStorageConsent: (trigger?: ConsentTrigger) => void;
  deleteCalibrationData: () => void;
  deleteAllLocalEyeData: () => void;
  persistedCalibrationProfile: StoredCalibrationProfileV1 | null;
  calibrationRetentionDays: number;
  activeSessionId: number;
  privacyPolicyVersion: string;
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

/**
 * Bo cung cap ngu canh trung tam cua phan he dieu khien bang mat (che do Nguoi suy giam).
 * Nhiem vu:
 * 1. Nap thu vien MediaPipe FaceMesh tu CDN va quan ly luong webcam (`getUserMedia` 640x480).
 * 2. Tien xu ly thieu sang tuy chon (`LowLightExposureProcessor`) truoc khi dua vao AI nhan dien.
 * 3. Chay may trang thai nhan dien cu chi mat:
 *    - Dem so lan chop mat (cua so 700ms): 1 chop = XUONG, 2 chop = CHON, 3 chop = KHAN CAP.
 *    - Phan loai huong liec mat: Liec TRAI/PHAI/LEN (tat XUONG), lam muot EMA 0.45, giu 220ms, nha ve tam 140ms.
 * 4. Hieu chuan 5 huong (`start5PointCalibration`), can tam nhanh (`reZeroCenter`) va che do mo phong.
 * 5. Tach doi 2 ngu canh (`SettingsContext` va `TelemetryContext`) de tranh ve lai toan bo giao dien o 15 khung hinh/giay.
 */
export function EyeTrackingProvider({ children, auth }: EyeTrackingProviderProps) {
  const resolvedAuth: EyeTrackingAuthContextInput = auth ?? {
    isAuthenticated: false,
    loading: false,
    userId: null,
    accountType: null,
  };
  const authRef = useRef<EyeTrackingAuthContextInput>(resolvedAuth);
  authRef.current = resolvedAuth;

  const isAccountAuthorized = Boolean(
    resolvedAuth.isAuthenticated &&
      !resolvedAuth.loading &&
      resolvedAuth.userId &&
      resolvedAuth.accountType === 'impaired'
  );
  const authorizedUserId = isAccountAuthorized ? resolvedAuth.userId : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lowLightProcessorRef = useRef<LowLightExposureProcessor | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const faceMeshRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const faceMeshSendingRef = useRef<boolean>(false);

  // Tracking Session Generation Token & concurrency guard
  const sessionTokenRef = useRef<number>(0);
  const inFlightStartTokenRef = useRef<number | null>(null);
  const sendingSessionTokenRef = useRef<number | null>(null);
  const trackCleanupRef = useRef<(() => void) | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number>(0);

  // Dual-layer Privacy Consent State (fail-closed when unauthenticated or loading)
  const [consentState, setConsentState] = useState<UserConsentState>(() =>
    getConsentState(authorizedUserId)
  );
  const [consentLogs, setConsentLogs] = useState<ConsentLogEntry[]>(() =>
    getConsentLogs(authorizedUserId)
  );
  const [isConsentModalOpen, setConsentModalOpen] = useState<boolean>(false);
  const [persistedCalibrationProfile, setPersistedCalibrationProfile] =
    useState<StoredCalibrationProfileV1 | null>(() =>
      authorizedUserId ? readPersistedCalibrationProfile(authorizedUserId) : null
    );
  const pendingCameraStartAfterConsentRef = useRef<boolean>(false);
  const promptedUserRef = useRef<string | null>(null);

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

    const defaultSpeakerEnabled = savedSpeakerEnabled !== null ? savedSpeakerEnabled === 'true' : true;
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
      lowLightFilterEnabled: false,
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const resolvedSpeaker =
          savedSpeakerEnabled !== null
            ? savedSpeakerEnabled === 'true'
            : (parsed.speakerEnabled !== undefined ? parsed.speakerEnabled : true);
        return {
          ...base,
          ...parsed,
          speakerEnabled: resolvedSpeaker,
        };
      } catch (e) {
        // Fallback
      }
    }
    return base;
  });

  // Synchronize speakerEnabled if changed externally (e.g. via AudioUnlockBanner or speech module)
  useEffect(() => {
    const handleSpeechSync = (e: any) => {
      if (e?.detail && typeof e.detail.speakerEnabled === 'boolean') {
        setSettings(prev => {
          if (prev.speakerEnabled !== e.detail.speakerEnabled) {
            return { ...prev, speakerEnabled: e.detail.speakerEnabled };
          }
          return prev;
        });
      }
    };
    window.addEventListener('eyetalk:speech-settings-changed', handleSpeechSync);
    return () => window.removeEventListener('eyetalk:speech-settings-changed', handleSpeechSync);
  }, []);

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

  const lowLightFilterEnabledRef = useRef<boolean>(settings.lowLightFilterEnabled);
  useEffect(() => {
    lowLightFilterEnabledRef.current = settings.lowLightFilterEnabled;
    if (!settings.lowLightFilterEnabled) {
      lowLightProcessorRef.current?.reset();
      processedCanvasRef.current = null;
      setEphemeralLowLightStats(sessionTokenRef.current, null);
    }
  }, [settings.lowLightFilterEnabled]);

  // Calibration state with 5 directions (RAM-by-default; user-scoped storage only with valid consent)
  const [calibration, setCalibration] = useState<EyeCalibrationData>(() =>
    loadCalibrationProfile(authorizedUserId).data
  );

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

  /**
   * Dang ky callback nhan lenh cu chi mat (vi du EyeNavigationProvider).
   * Tra ve ham cleanup de go bo khi component unmount.
   */
  const registerGestureCallback = useCallback((cb: (action: EyeAction) => boolean | void) => {
    gestureCallbacksRef.current.push(cb);
    return () => {
      gestureCallbacksRef.current = gestureCallbacksRef.current.filter(c => c !== cb);
    };
  }, []);

  /**
   * Phat lenh dieu khien (`EyeAction`) toi tat ca subscriber da dang ky.
   * - Xac dinh `executed = true` neu it nhat 1 subscriber xu ly thanh cong (khong dung bien).
   * - Neu bat `soundFeedback`, phat am thanh tieng Viet tuong ung hoac bao dung bien.
   * - Neu la `EMERGENCY`, phat them CustomEvent `eyeai:emergency` de mo ngay trang SOS.
   */
  const dispatchAction = useCallback((action: EyeAction, expectedSessionToken?: number): boolean => {
    if (action === 'NONE') return false;
    if (expectedSessionToken !== undefined && expectedSessionToken !== sessionTokenRef.current) {
      return false;
    }

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
          EMERGENCY: 'Kích hoạt cuộc gọi khẩn cấp',
          NONE: '',
        };
        const soundText = soundMap[action];
        if (soundText) {
          speakVietnamese(soundText);
        }
      } else {
        if (action === 'EMERGENCY') {
          speakVietnamese('Kích hoạt cuộc gọi khẩn cấp');
        } else if (['RIGHT', 'NEXT', 'LEFT', 'BACK', 'UP', 'DOWN'].includes(action)) {
          speakVietnamese('Không có phần tử theo hướng này');
        }
      }
    }

    if (action === 'EMERGENCY') {
      window.dispatchEvent(new CustomEvent('eyeai:emergency'));
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

  // Triple-Blink state machine refs (1 blink: DOWN, 2 blinks: SELECT, 3 blinks: EMERGENCY)
  const isEyesClosed = useRef<boolean>(false);
  const closeStartTime = useRef<number | null>(null);
  const blinkCountInGesture = useRef<number>(0);
  const firstBlinkTime = useRef<number>(0);
  const lastBlinkEndTime = useRef<number>(0);
  const selectSuccessUntil = useRef<number>(0);
  const emergencySuccessUntil = useRef<number>(0);

  // Command Arbiter Cooldown ref (1000ms standard)
  const cooldownTimer = useRef<number>(0);
  const lastExecutedActionRef = useRef<EyeAction>('NONE');
  const lastExecutedTimestampRef = useRef<number>(0);

  const lastFrameTime = useRef<number>(performance.now());

  // Load pinned self-hosted MediaPipe FaceMesh script once
  useEffect(() => {
    let active = true;
    async function loadLibraries() {
      try {
        if ((window as any).FaceMesh) {
          if (active) setLibsLoading(false);
          return;
        }
        const script = document.createElement('script');
        script.src = '/mediapipe/face_mesh/face_mesh.js';
        script.async = true;

        const scriptPromise = new Promise((resolve, reject) => {
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load self-hosted FaceMesh library.'));
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

  /**
   * Ham xu ly chinh o tan so camera (~30 khung hinh/giay) moi khi MediaPipe FaceMesh tra ve 478 diem moc:
   * - Luu toa do tho vao `window.__eyeai_latest_landmarks` de `LiveCameraOverlay` ve luoi 60 khung hinh/giay.
   * - Neu mat khuon mat qua 60 khung hinh (~2 giay): dat lai qua trinh khoi dong can tam tu dong (`initFramesCount = 0`).
   * - Goi `analyzeEyes(landmarks)` de tinh do mo mat `EAR` va toa do liec theo duong noi khoe mat.
   * - Uu tien 1 (May trang thai dem chop mat trong 700ms): 1 chop = XUONG, 2 chop = CHON, 3 chop = KHAN CAP.
   * - Uu tien 2 (May trang thai phan loai huong liec): Khoi dong 35 khung hinh -> Bu troi tam -> Cong an toan (`isGazeAllowed`)
   *   -> Lam muot EMA 0.45 -> Phan loai TRAI/PHAI/LEN (tat XUONG) voi vung tre 0.55 -> Nha ve tam 140ms -> Giu nhin 220ms.
   * - Gui `trackingState` len giao dien React co dieu tiet tan suat (65ms binh thuong, 40ms khi dang dem chop).
   */
  const processFaceMeshResults = useCallback((results: any, expectedSessionToken?: number) => {
    if (
      expectedSessionToken !== undefined &&
      expectedSessionToken !== sessionTokenRef.current
    ) {
      return;
    }

    const now = performance.now();
    const elapsed = Math.min(100, Math.max(1, now - lastFrameTime.current));
    lastFrameTime.current = now;

    const landmarks = results.multiFaceLandmarks?.[0];

    // Cache latest landmarks inside encapsulated module store (never on window)
    setEphemeralLandmarks(sessionTokenRef.current, landmarks ?? null);

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

    const BLINK_DECISION_WINDOW_MS = 700; // 700ms window to decide between 1 blink (DOWN), 2 blinks (SELECT), and 3 blinks (EMERGENCY)

    // 1. Check expiration of window for 1st blink:
    // If user blinked 1 time and did NOT blink again within 700ms -> Trigger DOWN (Xuống dưới)!
    if (blinkCountInGesture.current === 1) {
      const elapsedSinceFirstBlink = now - firstBlinkTime.current;
      if (elapsedSinceFirstBlink >= BLINK_DECISION_WINDOW_MS && !isClosedNow && !isEyesClosed.current) {
        blinkCountInGesture.current = 0;
        firstBlinkTime.current = 0;
        lastBlinkEndTime.current = now;

        const executed = dispatchAction('DOWN', expectedSessionToken);
        const nowTs = performance.now();
        cooldownTimer.current = 1200; // 1.2s cooldown
        actionTriggeredThisFrame = 'DOWN';
        lastExecutedActionRef.current = 'DOWN';
        lastExecutedTimestampRef.current = nowTs;
        reArmedRef.current = false;

        smoothGazeX.current = 0;
        smoothGazeY.current = 0;
        gazeDirState.current = 'CENTER';
        currentGazeCandidate.current = 'CENTER';
        gazeDwellStart.current = 0;
        gazeFiredInThisLook.current = false;
        centerStabilityStart.current = 0;

        const updatedDown: EyeTrackingState = {
          ...latestTelemetryRef.current,
          rawEAR: parseFloat(metrics.avgEAR.toFixed(3)),
          blinkThreshold: parseFloat(blinkThresh.toFixed(3)),
          baselineEAR: parseFloat(openBaselineEAR.toFixed(3)),
          lastActionTriggered: executed ? 'DOWN (Chớp mắt 1 cái - Xuống dưới)' : 'Không có phần tử phía dưới',
          currentAction: 'DOWN',
          lastExecutedAction: 'DOWN',
          lastExecutedTimestamp: nowTs,
          gazeDirection: 'CENTER',
          directionH: 'CENTER',
          directionV: 'CENTER',
          gazeX: 0,
          gazeY: 0,
          rawGazeX: 0,
          rawGazeY: 0,
          blinkCount: 1,
          blinkWindowRemainingMs: 0,
          closedDuration: 0,
          actionProgress: 100,
          cooldownRemainingMs: 1200,
          cooldownTotalMs: 1200,
        };
        latestTelemetryRef.current = updatedDown;
        setTrackingState(updatedDown);
      }
    }

    // 2. Check expiration of window for 2nd blink:
    // If user blinked 2 times and did NOT blink 3rd time within 700ms -> Trigger SELECT (Chọn)!
    if (blinkCountInGesture.current === 2) {
      const elapsedSinceSecondBlink = now - lastBlinkEndTime.current;
      if (elapsedSinceSecondBlink >= BLINK_DECISION_WINDOW_MS && !isClosedNow && !isEyesClosed.current) {
        blinkCountInGesture.current = 0;
        firstBlinkTime.current = 0;
        lastBlinkEndTime.current = now;
        selectSuccessUntil.current = now + 1200; // Keep showing 2 / 3 on UI for 1.2s

        const executed = dispatchAction('SELECT', expectedSessionToken);
        const nowTs = performance.now();
        cooldownTimer.current = ACTION_COOLDOWN_MS; // 2.5s cooldown
        actionTriggeredThisFrame = 'SELECT';
        lastExecutedActionRef.current = 'SELECT';
        lastExecutedTimestampRef.current = nowTs;
        reArmedRef.current = false;

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
          lastActionTriggered: executed ? 'SELECT (Chớp mắt 2 cái - Đã Chọn 🎯)' : 'Chưa có phần tử được chọn',
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
            lastBlinkEndTime.current = now;
          } else if (blinkCountInGesture.current === 1) {
            // Second blink registered!
            const interval = now - lastBlinkEndTime.current;
            if (interval <= BLINK_DECISION_WINDOW_MS + 250) {
              blinkCountInGesture.current = 2;
              lastBlinkEndTime.current = now;
            } else {
              // Exceeded window: Start new cycle with this blink as #1
              blinkCountInGesture.current = 1;
              firstBlinkTime.current = now;
              lastBlinkEndTime.current = now;
            }
          } else if (blinkCountInGesture.current === 2) {
            // Third blink registered! IMMEDIATELY TRIGGER EMERGENCY CALL!
            const interval = now - lastBlinkEndTime.current;
            if (interval <= BLINK_DECISION_WINDOW_MS + 250) {
              blinkCountInGesture.current = 0;
              firstBlinkTime.current = 0;
              lastBlinkEndTime.current = now;
              emergencySuccessUntil.current = now + 2000; // Keep showing 3 / 3 on UI for 2s

              const executed = dispatchAction('EMERGENCY', expectedSessionToken);
              if (expectedSessionToken === undefined || expectedSessionToken === sessionTokenRef.current) {
                window.dispatchEvent(new CustomEvent('eyeai:emergency'));
              }
              const nowTs = performance.now();
              cooldownTimer.current = ACTION_COOLDOWN_MS + 500; // 3.0s cooldown
              actionTriggeredThisFrame = 'EMERGENCY';
              lastExecutedActionRef.current = 'EMERGENCY';
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

              const updatedEmergency: EyeTrackingState = {
                ...latestTelemetryRef.current,
                rawEAR: parseFloat(metrics.avgEAR.toFixed(3)),
                blinkThreshold: parseFloat(blinkThresh.toFixed(3)),
                baselineEAR: parseFloat(openBaselineEAR.toFixed(3)),
                lastActionTriggered: 'EMERGENCY (Nháy mắt 3 lần - Kích hoạt gọi khẩn cấp 🚨)',
                currentAction: 'EMERGENCY',
                lastExecutedAction: 'EMERGENCY',
                lastExecutedTimestamp: nowTs,
                gazeDirection: 'CENTER',
                directionH: 'CENTER',
                directionV: 'CENTER',
                gazeX: 0,
                gazeY: 0,
                rawGazeX: 0,
                rawGazeY: 0,
                blinkCount: 3,
                blinkWindowRemainingMs: 0,
                closedDuration: 0,
                actionProgress: 100,
                cooldownRemainingMs: ACTION_COOLDOWN_MS + 500,
                cooldownTotalMs: ACTION_COOLDOWN_MS + 500,
              };
              latestTelemetryRef.current = updatedEmergency;
              setTrackingState(updatedEmergency);
            } else {
              // Exceeded window: Start new cycle with this blink as #1
              blinkCountInGesture.current = 1;
              firstBlinkTime.current = now;
              lastBlinkEndTime.current = now;
            }
          }
        } else if (blinkDuration > 800) {
          // Prolonged closure: not a blink gesture, reset window
          blinkCountInGesture.current = 0;
          firstBlinkTime.current = 0;
        }
      }
    }

    // Telemetry feedback during waiting window for 2nd or 3rd blink
    if (blinkCountInGesture.current === 1 && actionTriggeredThisFrame === 'NONE' && cooldownTimer.current <= 0) {
      const remainingMs = Math.max(0, BLINK_DECISION_WINDOW_MS - (now - firstBlinkTime.current));
      const remainingSecs = (remainingMs / 1000).toFixed(1);
      actionProg = Math.min(100, Math.round((remainingMs / BLINK_DECISION_WINDOW_MS) * 100));

      latestTelemetryRef.current = {
        ...latestTelemetryRef.current,
        blinkCount: 1,
        blinkWindowRemainingMs: Math.round(remainingMs),
        actionProgress: actionProg,
        lastActionTriggered: `Đã chớp 1/3 (chờ ${remainingSecs}s để Xuống dưới ↓, hoặc chớp tiếp: 2=Chọn, 3=Khẩn cấp)...`,
      };
    } else if (blinkCountInGesture.current === 2 && actionTriggeredThisFrame === 'NONE' && cooldownTimer.current <= 0) {
      const remainingMs = Math.max(0, BLINK_DECISION_WINDOW_MS - (now - lastBlinkEndTime.current));
      const remainingSecs = (remainingMs / 1000).toFixed(1);
      actionProg = Math.min(100, Math.round((remainingMs / BLINK_DECISION_WINDOW_MS) * 100));

      latestTelemetryRef.current = {
        ...latestTelemetryRef.current,
        blinkCount: 2,
        blinkWindowRemainingMs: Math.round(remainingMs),
        actionProgress: actionProg,
        lastActionTriggered: `Đã chớp 2/3 (chờ ${remainingSecs}s để Chọn 🎯, hoặc chớp cái thứ 3 để Gọi khẩn cấp 🚨)...`,
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
          // Downward gaze is disabled (replaced by 1 blink for Down)
          detectedDir = curGy < 0 ? 'UP' : 'CENTER';
        } else {
          detectedDir = 'CENTER';
        }
      } else if (curGazeState === 'RIGHT') {
        detectedDir = curGx < relRight ? 'CENTER' : 'RIGHT';
      } else if (curGazeState === 'LEFT') {
        detectedDir = curGx > -relLeft ? 'CENTER' : 'LEFT';
      } else if (curGazeState === 'DOWN') {
        detectedDir = 'CENTER';
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

              const executed = dispatchAction(mappedAction, expectedSessionToken);
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
      detectedDir === 'UP' ? 'UP' : 'CENTER';
    const curGx = smoothGazeX.current;
    const curGy = smoothGazeY.current;

    // =========================================================================
    // 4. REACT STATE TELEMETRY DISPATCH (THROTTLED & SYNCED WITH ARBITER)
    // =========================================================================
    const prevTelemetry = latestTelemetryRef.current;
    let currentBlinkCount = blinkCountInGesture.current;
    let currentBlinkRemainingMs = 0;

    if (now < emergencySuccessUntil.current) {
      currentBlinkCount = 3;
      currentBlinkRemainingMs = 0;
    } else if (now < selectSuccessUntil.current) {
      currentBlinkCount = 2;
      currentBlinkRemainingMs = 0;
    } else if (blinkCountInGesture.current === 2) {
      currentBlinkCount = 2;
      currentBlinkRemainingMs = Math.max(0, BLINK_DECISION_WINDOW_MS - (now - lastBlinkEndTime.current));
    } else if (blinkCountInGesture.current === 1) {
      currentBlinkCount = 1;
      currentBlinkRemainingMs = Math.max(0, BLINK_DECISION_WINDOW_MS - (now - firstBlinkTime.current));
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
    const isThrottleDue = timeSinceLastDispatch >= (currentBlinkCount > 0 ? 40 : TELEMETRY_THROTTLE_MS);

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
    let spacePendingCount = 0;

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
            // Space simulates Blink in simulator mode:
            // 1 Space press (after 700ms) -> DOWN
            // 2 Space presses (within 700ms) -> SELECT
            // 3 Space presses (within 700ms) -> EMERGENCY
            if (spacePendingCount === 0) {
              spacePendingCount = 1;
              setTrackingState(prev => ({
                ...prev,
                blinkCount: 1,
                blinkWindowRemainingMs: 700,
                lastActionTriggered: 'Chớp 1/3 (chờ 0.7s để Xuống ↓, hoặc bấm Space tiếp: 2=Chọn, 3=Khẩn cấp)...',
              }));
              if (spaceTimer) clearTimeout(spaceTimer);
              spaceTimer = setTimeout(() => {
                spacePendingCount = 0;
                const executed = dispatchAction('DOWN');
                const nowTs = performance.now();
                cooldownTimer.current = 1200;
                lastExecutedActionRef.current = 'DOWN';
                lastExecutedTimestampRef.current = nowTs;
                setTrackingState(prev => ({
                  ...prev,
                  blinkCount: 0,
                  blinkWindowRemainingMs: 0,
                  lastExecutedAction: 'DOWN',
                  lastExecutedTimestamp: nowTs,
                  lastActionTriggered: executed ? 'DOWN (Chớp 1 cái phím Space - Xuống dưới)' : 'Không có phần tử phía dưới',
                  currentAction: 'DOWN',
                  cooldownRemainingMs: 1200,
                  cooldownTotalMs: 1200,
                }));
              }, 700);
            } else if (spacePendingCount === 1) {
              if (spaceTimer) clearTimeout(spaceTimer);
              spacePendingCount = 2;
              setTrackingState(prev => ({
                ...prev,
                blinkCount: 2,
                blinkWindowRemainingMs: 700,
                lastActionTriggered: 'Chớp 2/3 (chờ 0.7s để Chọn 🎯, hoặc bấm Space cái thứ 3 để Gọi khẩn cấp 🚨)...',
              }));
              spaceTimer = setTimeout(() => {
                spacePendingCount = 0;
                selectSuccessUntil.current = performance.now() + 1200;
                const executed = dispatchAction('SELECT');
                const execTs = performance.now();
                cooldownTimer.current = ACTION_COOLDOWN_MS;
                lastExecutedActionRef.current = 'SELECT';
                lastExecutedTimestampRef.current = execTs;

                setTrackingState(prev => ({
                  ...prev,
                  lastActionTriggered: executed ? 'SELECT (Chớp 2 cái phím Space - Đã Chọn 🎯)' : 'Chưa có phần tử được chọn',
                  currentAction: 'SELECT',
                  lastExecutedAction: 'SELECT',
                  lastExecutedTimestamp: execTs,
                  blinkCount: 2,
                  blinkWindowRemainingMs: 0,
                  cooldownRemainingMs: ACTION_COOLDOWN_MS,
                  cooldownTotalMs: ACTION_COOLDOWN_MS,
                }));
              }, 700);
            } else if (spacePendingCount === 2) {
              // 3rd Space press -> IMMEDIATELY TRIGGER EMERGENCY!
              if (spaceTimer) clearTimeout(spaceTimer);
              spacePendingCount = 0;
              emergencySuccessUntil.current = performance.now() + 1500;
              const executed = dispatchAction('EMERGENCY');
              window.dispatchEvent(new CustomEvent('eyeai:emergency'));
              const execTs = performance.now();
              cooldownTimer.current = ACTION_COOLDOWN_MS + 500;
              lastExecutedActionRef.current = 'EMERGENCY';
              lastExecutedTimestampRef.current = execTs;

              setTrackingState(prev => ({
                ...prev,
                lastActionTriggered: 'EMERGENCY (Nháy 3 cái phím Space - Kích hoạt gọi khẩn cấp 🚨)',
                currentAction: 'EMERGENCY',
                lastExecutedAction: 'EMERGENCY',
                lastExecutedTimestamp: execTs,
                blinkCount: 3,
                blinkWindowRemainingMs: 0,
                cooldownRemainingMs: ACTION_COOLDOWN_MS + 500,
                cooldownTotalMs: ACTION_COOLDOWN_MS + 500,
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
      } else if (e.key === 'F1') {
        // F1 directly triggers EMERGENCY for fast testing
        e.preventDefault();
        const executed = dispatchAction('EMERGENCY');
        window.dispatchEvent(new CustomEvent('eyeai:emergency'));
        const nowTs = performance.now();
        cooldownTimer.current = ACTION_COOLDOWN_MS + 500;
        lastExecutedActionRef.current = 'EMERGENCY';
        lastExecutedTimestampRef.current = nowTs;
        setTrackingState(prev => ({
          ...prev,
          lastActionTriggered: 'EMERGENCY (Phím F1 - Kích hoạt gọi khẩn cấp 🚨)',
          currentAction: 'EMERGENCY',
          lastExecutedAction: 'EMERGENCY',
          lastExecutedTimestamp: nowTs,
          blinkCount: 3,
          cooldownRemainingMs: ACTION_COOLDOWN_MS + 500,
          cooldownTotalMs: ACTION_COOLDOWN_MS + 500,
        }));
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

  const isAuthorizedForCamera = useCallback((): boolean => {
    const a = authRef.current;
    if (!a.isAuthenticated || a.loading || !a.userId || a.accountType !== 'impaired') {
      return false;
    }
    return hasValidFaceProcessingConsent(a.userId);
  }, []);

  const calibrationCancelRef = useRef<boolean>(false);

  /**
   * Centralized idempotent teardown for Eye Tracking session (Phase 2.2).
   * Enforces deterministic cleanup order and guards against closing/overwriting a newer session.
   */
  const teardownTrackingSession = useCallback(() => {
    // 1. Invalidate session token so any pending async callbacks/actions are rejected
    const nextInvalidToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = nextInvalidToken;
    inFlightStartTokenRef.current = null;
    sendingSessionTokenRef.current = null;
    bindEphemeralStoreSession(nextInvalidToken);
    setActiveSessionId(0);

    // 2-3. Cancel any active calibration
    calibrationCancelRef.current = true;
    setCalibrationStage(prev => (prev !== 'idle' ? 'idle' : prev));
    setCalibrationStep(prev => (prev !== 'idle' ? 'idle' : prev));
    setCalibrationProgress(0);

    // 4. Cancel requestAnimationFrame and clear current session send lock
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isProcessingRef.current = false;

    // 5. Detach track listeners & stop all MediaStream tracks
    if (trackCleanupRef.current) {
      try {
        trackCleanupRef.current();
      } catch {
        // Ignore
      }
      trackCleanupRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      mediaStreamRef.current = null;
      setCameraStream(null);
    }

    // 6. Pause video and detach srcObject
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore
      }
      videoRef.current.srcObject = null;
    }

    // 7. Release FaceMesh instance safely (defer close if send() is mid-flight)
    const oldFaceMesh = faceMeshRef.current;
    faceMeshRef.current = null;
    if (oldFaceMesh && !faceMeshSendingRef.current) {
      try {
        if (typeof oldFaceMesh.close === 'function') {
          Promise.resolve(oldFaceMesh.close()).catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
    faceMeshSendingRef.current = false;

    // 8. Release Canvas & Low-Light resources
    lowLightProcessorRef.current?.reset();
    processedCanvasRef.current = null;

    // 9. Clear ephemeral landmarks & low-light telemetry
    clearEphemeralEyeData();

    // 10. Reset EyeMetrics ref
    latestMetricsRef.current = {
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
    };

    // 11. Reset runtime calibration warm-up counters
    initFramesCount.current = 0;
    noFaceFramesCount.current = 0;
    neutralRunningX.current = 0;
    neutralRunningY.current = 0;
    neutralRunningEAR.current = 0.26;

    // 12. Reset Gesture FSM state
    isEyesClosed.current = false;
    closeStartTime.current = null;
    blinkCountInGesture.current = 0;
    firstBlinkTime.current = 0;
    lastBlinkEndTime.current = 0;
    selectSuccessUntil.current = 0;
    emergencySuccessUntil.current = 0;
    smoothGazeX.current = 0;
    smoothGazeY.current = 0;
    gazeDirState.current = 'CENTER';
    currentGazeCandidate.current = 'CENTER';
    gazeDwellStart.current = 0;
    gazeFiredInThisLook.current = false;
    reArmedRef.current = true;
    centerStabilityStart.current = 0;

    // 13. Reset cooldown timers
    cooldownTimer.current = 0;
    lastExecutedActionRef.current = 'NONE';
    lastExecutedTimestampRef.current = 0;

    // 14. Reset telemetry UI state to inactive
    const stoppedState: EyeTrackingState = {
      ...latestTelemetryRef.current,
      cameraActive: false,
      faceDetected: false,
      eyesClosed: false,
      closedDuration: 0.0,
      blinkCount: 0,
      blinkWindowRemainingMs: 0,
      currentAction: 'NONE',
      actionProgress: 0,
      gazeDirection: 'CENTER',
      directionH: 'CENTER',
      directionV: 'CENTER',
      rawGazeX: 0,
      rawGazeY: 0,
      gazeX: 0,
      gazeY: 0,
      confidence: 0,
      cooldownRemainingMs: 0,
      reArmed: true,
    };
    latestTelemetryRef.current = stoppedState;
    setTrackingState(stoppedState);

    // Auto-revive audio session after camera stream teardown
    recoverAudioSession();
  }, []);

  /**
   * Khoi chay vong lap xu ly khung hinh MediaPipe FaceMesh qua `requestAnimationFrame`:
   * - Khoi tao thuc the FaceMesh gan voi `sessionToken` hien tai.
   * - Kiem tra `sessionToken` o moi ranh gioi bat dong bo (`onResults`, `send`, `requestAnimationFrame`).
   */
  const startTrackingLoop = useCallback((sessionToken: number) => {
    if (!(window as any).FaceMesh) return;
    if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) return;

    if (!faceMeshRef.current) {
      const faceMesh = new (window as any).FaceMesh({
        locateFile: (file: string) => `/mediapipe/face_mesh/${file}`,
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      faceMesh.onResults((res: any) => {
        if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
          return;
        }
        processFaceMeshResults(res, sessionToken);
      });
      faceMeshRef.current = faceMesh;
    }

    lastFrameTime.current = performance.now();

    const render = async () => {
      if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
        return;
      }
      const video = videoRef.current;
      const activeFaceMesh = faceMeshRef.current;
      if (video && video.readyState >= 2 && !isProcessingRef.current && activeFaceMesh) {
        isProcessingRef.current = true;
        faceMeshSendingRef.current = true;
        sendingSessionTokenRef.current = sessionToken;
        try {
          let frameSource: HTMLVideoElement | HTMLCanvasElement = video;
          if (lowLightFilterEnabledRef.current) {
            try {
              if (!lowLightProcessorRef.current) {
                lowLightProcessorRef.current = new LowLightExposureProcessor();
              }
              const faceRoi = extractFaceRoiFromLandmarks(getLatestLandmarks() as Point[] | null);
              const processed = lowLightProcessorRef.current.processFrame(video, faceRoi);
              if (processed) {
                processedCanvasRef.current = processed;
                frameSource = processed;
                setEphemeralLowLightStats(sessionToken, lowLightProcessorRef.current.getState());
              } else {
                processedCanvasRef.current = null;
              }
            } catch (filterErr) {
              console.warn('[LowLightFilter] Safe fallback to raw video frame:', filterErr);
              processedCanvasRef.current = null;
              frameSource = video;
            }
          } else {
            processedCanvasRef.current = null;
          }

          if (sessionToken !== sessionTokenRef.current || faceMeshRef.current !== activeFaceMesh) {
            return;
          }
          await activeFaceMesh.send({ image: frameSource });
        } catch (e) {
          if (sessionToken === sessionTokenRef.current) {
            console.error('[FaceMesh send error]:', e);
          }
        } finally {
          if (sendingSessionTokenRef.current === sessionToken) {
            faceMeshSendingRef.current = false;
            isProcessingRef.current = false;
            sendingSessionTokenRef.current = null;
          }
          // If session was torn down while send() was in-flight, close the orphaned instance safely
          if (faceMeshRef.current !== activeFaceMesh && typeof activeFaceMesh.close === 'function') {
            try {
              Promise.resolve(activeFaceMesh.close()).catch(() => {});
            } catch {
              // Ignore
            }
          }
        }
      }
      if (
        sessionToken === sessionTokenRef.current &&
        isAuthorizedForCamera() &&
        mediaStreamRef.current &&
        mediaStreamRef.current.active
      ) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };
    animationFrameRef.current = requestAnimationFrame(render);
  }, [processFaceMeshResults, isAuthorizedForCamera]);

  const stopTrackingLoop = useCallback(() => {
    teardownTrackingSession();
  }, [teardownTrackingSession]);

  /**
   * Khoi tao va bat camera qua WebRTC `navigator.mediaDevices.getUserMedia`.
   * Enforce Auth Guard + Profile Guard + Account Type Guard + Face Processing Consent Guard + Session Token.
   */
  const startCamera = useCallback(async (options?: { userInitiated?: boolean }) => {
    const a = authRef.current;
    if (!a.isAuthenticated || a.loading || !a.userId || a.accountType !== 'impaired') {
      teardownTrackingSession();
      return;
    }

    if (!hasValidFaceProcessingConsent(a.userId)) {
      teardownTrackingSession();
      if (options?.userInitiated) {
        pendingCameraStartAfterConsentRef.current = true;
        setConsentModalOpen(true);
      }
      return;
    }

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
      if (activeTracks.length > 0 && sessionTokenRef.current > 0) {
        const currentToken = sessionTokenRef.current;
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.defaultMuted = true;
          videoRef.current.volume = 0;
          if (videoRef.current.srcObject !== mediaStreamRef.current) {
            videoRef.current.srcObject = mediaStreamRef.current;
          }
          try {
            await videoRef.current.play();
          } catch (e) {
            // Ignore
          }
          if (currentToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
            teardownTrackingSession();
            return;
          }
          startTrackingLoop(currentToken);
        }
        const activeState = { ...latestTelemetryRef.current, cameraActive: true, cameraError: null };
        latestTelemetryRef.current = activeState;
        setTrackingState(activeState);
        recoverAudioSession();
        return;
      }
    }

    // Prevent concurrent getUserMedia calls
    if (inFlightStartTokenRef.current !== null) {
      return;
    }

    const sessionToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = sessionToken;
    inFlightStartTokenRef.current = sessionToken;
    bindEphemeralStoreSession(sessionToken);

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
        if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
          inFlightStartTokenRef.current = null;
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Immediately stop tracks if session was invalidated or consent/auth revoked while awaiting getUserMedia
      if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch {
            // Ignore
          }
        });
        inFlightStartTokenRef.current = null;
        return;
      }

      const tracks = stream.getVideoTracks();
      if (tracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('No video tracks available in stream');
      }

      if (trackCleanupRef.current) {
        try {
          trackCleanupRef.current();
        } catch {
          // Ignore
        }
        trackCleanupRef.current = null;
      }

      const handleTrackEnded = () => {
        if (sessionToken !== sessionTokenRef.current) return;
        teardownTrackingSession();
      };
      tracks.forEach((track) => {
        if (typeof track.addEventListener === 'function') {
          track.addEventListener('ended', handleTrackEnded);
        }
      });
      trackCleanupRef.current = () => {
        tracks.forEach((track) => {
          if (typeof track.removeEventListener === 'function') {
            track.removeEventListener('ended', handleTrackEnded);
          }
        });
      };

      mediaStreamRef.current = stream;
      setCameraStream(stream);
      setActiveSessionId(sessionToken);

      initFramesCount.current = 0;
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.defaultMuted = true;
        videoRef.current.volume = 0;
        videoRef.current.setAttribute('muted', '');
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('webkit-playsinline', '');
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('[EYE CAMERA] video.play() notice:', e);
        }

        if (sessionToken !== sessionTokenRef.current || !isAuthorizedForCamera()) {
          stream.getTracks().forEach(t => t.stop());
          if (mediaStreamRef.current === stream) {
            mediaStreamRef.current = null;
            setCameraStream(null);
          }
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
          inFlightStartTokenRef.current = null;
          return;
        }

        startTrackingLoop(sessionToken);
      }

      inFlightStartTokenRef.current = null;

      const readyState = { ...latestTelemetryRef.current, cameraActive: true, cameraError: null };
      latestTelemetryRef.current = readyState;
      setTrackingState(readyState);

      // Auto-revive audio session after camera stream activation
      recoverAudioSession();
    } catch (err: any) {
      inFlightStartTokenRef.current = null;
      if (sessionToken === sessionTokenRef.current) {
        const errMsg = err.message || 'Không thể truy cập camera. Vui lòng cấp quyền camera.';
        const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
        latestTelemetryRef.current = errState;
        setTrackingState(errState);
      }
      recoverAudioSession();
    }
  }, [startTrackingLoop, teardownTrackingSession, isAuthorizedForCamera]);

  const toggleCamera = useCallback(async () => {
    if (!isAccountAuthorized) {
      teardownTrackingSession();
      return;
    }
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      teardownTrackingSession();
    } else {
      await startCamera({ userInitiated: true });
    }
    recoverAudioSession();
  }, [isAccountAuthorized, startCamera, teardownTrackingSession]);

  // Synchronize auth, account switch, consent, and multi-tab revocation
  useEffect(() => {
    if (!isAccountAuthorized || !authorizedUserId) {
      teardownTrackingSession();
      setConsentModalOpen(false);
      setConsentState(createEmptyConsentState(null));
      setConsentLogs([]);
      setPersistedCalibrationProfile(null);
      setCalibration({ ...DEFAULT_CALIBRATION_DATA });
      promptedUserRef.current = null;
      return;
    }

    const loadedConsent = getConsentState(authorizedUserId);
    setConsentState(loadedConsent);
    setConsentLogs(getConsentLogs(authorizedUserId));
    const loadedCalib = loadCalibrationProfile(authorizedUserId);
    setCalibration(loadedCalib.data);
    setPersistedCalibrationProfile(loadedCalib.storedProfile);

    const unsubscribe = subscribeConsentChanges(authorizedUserId, (nextConsent) => {
      setConsentState(nextConsent);
      setConsentLogs(getConsentLogs(authorizedUserId));
      setPersistedCalibrationProfile(readPersistedCalibrationProfile(authorizedUserId));
      if (!nextConsent.faceProcessing.granted || nextConsent.faceProcessing.policyVersion !== PRIVACY_POLICY_VERSION) {
        teardownTrackingSession();
        localStorage.setItem('luckydream_eye_enabled', 'false');
        setSettings(prev => (prev.eyeControlEnabled ? { ...prev, eyeControlEnabled: false } : prev));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAccountAuthorized, authorizedUserId, teardownTrackingSession]);

  // Camera lifecycle controller: starts ONLY when authorized + consented + enabled + libs ready
  useEffect(() => {
    if (!isAccountAuthorized || !authorizedUserId) {
      teardownTrackingSession();
      return;
    }

    const faceGranted =
      consentState.faceProcessing.granted &&
      consentState.faceProcessing.policyVersion === PRIVACY_POLICY_VERSION;

    if (settings.eyeControlEnabled && !faceGranted) {
      teardownTrackingSession();
      if (promptedUserRef.current !== authorizedUserId) {
        promptedUserRef.current = authorizedUserId;
        pendingCameraStartAfterConsentRef.current = true;
        setConsentModalOpen(true);
      }
      return;
    }

    if (settings.eyeControlEnabled && faceGranted && !libsLoading && !libError) {
      startCamera();
    } else if (!settings.eyeControlEnabled || !faceGranted) {
      teardownTrackingSession();
    }
  }, [
    isAccountAuthorized,
    authorizedUserId,
    consentState.faceProcessing.granted,
    consentState.faceProcessing.policyVersion,
    settings.eyeControlEnabled,
    libsLoading,
    libError,
    startCamera,
    teardownTrackingSession,
  ]);

  // Clean teardown on unmount
  useEffect(() => {
    return () => {
      teardownTrackingSession();
      lowLightProcessorRef.current?.dispose();
      lowLightProcessorRef.current = null;
      processedCanvasRef.current = null;
    };
  }, [teardownTrackingSession]);

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
    const uid = authRef.current.userId;
    deleteCalibrationProfile(uid);
    setPersistedCalibrationProfile(null);
    setCalibrationMessage('Đã đặt lại hiệu chỉnh mặc định.');
    speakVietnamese('Đã đặt lại hiệu chỉnh');
  }, []);

  /**
   * Dat lai tam nhin trung tinh ngay lap tuc theo tu the mat hien tai.
   * - Lay mau `irisRatio` va `gazeRatio` hien thoi tu `latestMetricsRef` lam goc toa do trung tam moi.
   * - Giup nguoi dung bu sai lech neu thay doi tu the ngoi hoac goc dat camera.
   */
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

    const uid = authRef.current.userId;
    setCalibration(prev => {
      const updated: EyeCalibrationData = {
        ...prev,
        neutralIrisH: neutralRunningX.current,
        neutralIrisV: neutralRunningY.current,
      };
      const saveRes = saveCalibrationProfile(uid, updated);
      if (saveRes.saved && saveRes.profile) {
        setPersistedCalibrationProfile(saveRes.profile);
      }
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

  /**
   * Chay quy trinh hieu chuan 5 diem (giua, trai, phai, tren, duoi).
   * - Kiem tra session generation token o moi buoc bat dong bo.
   * - Luu thong số tối giản vào User-scoped LocalStorage CHỈ KHI có Calibration Storage Consent hợp lệ;
   *   nếu từ chối hoặc thu hồi quyền lưu, calibration vẫn chạy bình thường trong RAM (RAM-only).
   */
  const start5PointCalibration = useCallback(async () => {
    if (!isAuthorizedForCamera()) {
      setCalibrationMessage('Vui lòng cấp quyền xử lý camera trước khi hiệu chỉnh.');
      return;
    }

    const calibSessionToken = sessionTokenRef.current;
    const calibUserId = authRef.current.userId;
    calibrationCancelRef.current = false;
    setCalibrationStage('countdown');
    setCalibrationProgress(0);

    const isStillValid = () =>
      !calibrationCancelRef.current &&
      sessionTokenRef.current === calibSessionToken &&
      authRef.current.userId === calibUserId &&
      isAuthorizedForCamera();

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Helper to collect frames for a specific step
    const collectStepFrames = async (stepName: CalibrationStep, promptText: string, voicePrompt: string) => {
      if (!isStillValid()) return null;

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
        if (!isStillValid()) return null;
        await sleep(55);
        if (!isStillValid()) return null;

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
        if (!isStillValid()) return;
        setCalibrationMessage(`Chuẩn bị... Giữ đầu thẳng trong ${cd}s`);
        await sleep(1000);
      }

      // Step 2: CENTER (Nhìn thẳng)
      const centerData = await collectStepFrames(
        'center',
        'Bước 1/5: Hãy nhìn thẳng vào tâm camera',
        'Bước 1: Hãy nhìn thẳng vào tâm camera'
      );
      if (!centerData || !isStillValid()) {
        throw new Error('Không thu thập đủ dữ liệu nhìn thẳng. Vui lòng thử lại.');
      }
      await sleep(400);

      // Step 3: UP (Nhìn lên)
      const upData = await collectStepFrames(
        'up',
        'Bước 2/5: Hãy nhìn lên phía trên',
        'Bước 2: Hãy nhìn lên phía trên'
      );
      if (!upData || !isStillValid()) {
        throw new Error('Không thu thập đủ dữ liệu nhìn lên.');
      }
      await sleep(400);

      // Step 4: DOWN (Nhìn xuống)
      const downData = await collectStepFrames(
        'down',
        'Bước 3/5: Hãy nhìn xuống phía dưới',
        'Bước 3: Hãy nhìn xuống phía dưới'
      );
      if (!downData || !isStillValid()) {
        throw new Error('Không thu thập đủ dữ liệu nhìn xuống.');
      }
      await sleep(400);

      // Step 5: LEFT (Nhìn sang trái)
      const leftData = await collectStepFrames(
        'left',
        'Bước 4/5: Hãy nhìn sang bên trái',
        'Bước 4: Hãy nhìn sang bên trái'
      );
      if (!leftData || !isStillValid()) {
        throw new Error('Không thu thập đủ dữ liệu nhìn trái.');
      }
      await sleep(400);

      // Step 6: RIGHT (Nhìn sang phải)
      const rightData = await collectStepFrames(
        'right',
        'Bước 5/5: Hãy nhìn sang bên phải',
        'Bước 5: Hãy nhìn sang bên phải'
      );
      if (!rightData || !isStillValid()) {
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

      // Guard against stale async completion after session reset/logout/account switch
      if (!isStillValid()) return;

      setCalibration(finalCalibration);
      neutralRunningX.current = neutralX;
      neutralRunningY.current = neutralY;
      initFramesCount.current = 0;

      // Persist ONLY if Calibration Storage Consent is currently valid for this user
      const saveResult = saveCalibrationProfile(calibUserId, finalCalibration);
      setPersistedCalibrationProfile(saveResult.saved && saveResult.profile ? saveResult.profile : null);

      setCalibrationStep('completed');
      setCalibrationStage('completed');
      setCalibrationMessage(
        saveResult.saved
          ? 'Hiệu chỉnh 5 hướng thành công!'
          : 'Hiệu chỉnh 5 hướng thành công (Chế độ RAM-only)!'
      );
      speakVietnamese('Hiệu chỉnh 5 hướng thành công');

      await sleep(1800);
      if (sessionTokenRef.current === calibSessionToken) {
        setCalibrationStep('idle');
        setCalibrationStage('idle');
      }
    } catch (err: any) {
      if (sessionTokenRef.current === calibSessionToken) {
        setCalibrationStage('idle');
        setCalibrationStep('idle');
        setCalibrationMessage(err.message || 'Lỗi trong quá trình hiệu chỉnh.');
        speakVietnamese('Hiệu chỉnh chưa hoàn thành');
      }
    }
  }, [isAuthorizedForCamera]);

  // Quick 1-point center calibration for backwards compatibility
  const startCalibration = useCallback(() => {
    start5PointCalibration();
  }, [start5PointCalibration]);

  const setEyeControlEnabled = useCallback((enabled: boolean) => {
    if (enabled && isAccountAuthorized && authorizedUserId && !hasValidFaceProcessingConsent(authorizedUserId)) {
      pendingCameraStartAfterConsentRef.current = true;
      setConsentModalOpen(true);
    }
    localStorage.setItem('luckydream_eye_enabled', String(enabled));
    setSettings(prev => ({ ...prev, eyeControlEnabled: enabled }));
    setTimeout(() => {
      recoverAudioSession();
    }, 50);
  }, [isAccountAuthorized, authorizedUserId]);

  const openConsentModal = useCallback(() => {
    if (isAccountAuthorized) {
      setConsentModalOpen(true);
    }
  }, [isAccountAuthorized]);

  const closeConsentModal = useCallback(() => {
    pendingCameraStartAfterConsentRef.current = false;
    setConsentModalOpen(false);
  }, []);

  const grantFaceProcessingConsent = useCallback(
    (alsoGrantCalibrationStorage = false, trigger: ConsentTrigger = 'consent_modal') => {
      const uid = authRef.current.userId;
      if (!uid || authRef.current.accountType !== 'impaired') return;
      let nextState = grantConsent(uid, 'face_processing', trigger);
      if (alsoGrantCalibrationStorage) {
        nextState = grantConsent(uid, 'calibration_storage', trigger);
      }
      setConsentState(nextState);
      setConsentLogs(getConsentLogs(uid));
      setConsentModalOpen(false);

      if (pendingCameraStartAfterConsentRef.current || trigger === 'consent_modal') {
        pendingCameraStartAfterConsentRef.current = false;
        localStorage.setItem('luckydream_eye_enabled', 'true');
        setSettings(prev => ({ ...prev, eyeControlEnabled: true }));
      }
    },
    []
  );

  const revokeFaceProcessingConsent = useCallback(
    (trigger: ConsentTrigger = 'privacy_dashboard') => {
      const uid = authRef.current.userId;
      teardownTrackingSession();
      if (uid) {
        const nextState = revokeConsent(uid, 'face_processing', trigger);
        setConsentState(nextState);
        setConsentLogs(getConsentLogs(uid));
      }
      localStorage.setItem('luckydream_eye_enabled', 'false');
      setSettings(prev => ({ ...prev, eyeControlEnabled: false }));
    },
    [teardownTrackingSession]
  );

  const grantCalibrationStorageConsent = useCallback(
    (trigger: ConsentTrigger = 'privacy_dashboard') => {
      const uid = authRef.current.userId;
      if (!uid) return;
      const nextState = grantConsent(uid, 'calibration_storage', trigger);
      setConsentState(nextState);
      setConsentLogs(getConsentLogs(uid));
      // Do not automatically write defaults until user calibrates/re-zeros
      setPersistedCalibrationProfile(readPersistedCalibrationProfile(uid));
    },
    []
  );

  const revokeCalibrationStorageConsent = useCallback(
    (trigger: ConsentTrigger = 'privacy_dashboard') => {
      const uid = authRef.current.userId;
      if (!uid) return;
      const nextState = revokeConsent(uid, 'calibration_storage', trigger);
      deleteCalibrationProfile(uid);
      setConsentState(nextState);
      setConsentLogs(getConsentLogs(uid));
      setPersistedCalibrationProfile(null);
    },
    []
  );

  const deleteCalibrationData = useCallback(() => {
    const uid = authRef.current.userId;
    deleteCalibrationProfile(uid);
    setPersistedCalibrationProfile(null);
    initFramesCount.current = 0;
    neutralRunningX.current = 0;
    neutralRunningY.current = 0;
    smoothGazeX.current = 0;
    smoothGazeY.current = 0;
    gazeDirState.current = 'CENTER';
    setCalibration({ ...DEFAULT_CALIBRATION_DATA });
    if (uid) {
      appendConsentLog(uid, {
        consentType: 'calibration_storage',
        action: 'DATA_DELETED',
        trigger: 'privacy_dashboard',
      });
      setConsentLogs(getConsentLogs(uid));
    }
    setCalibrationMessage('Đã xóa dữ liệu hiệu chỉnh.');
  }, []);

  const deleteAllLocalEyeData = useCallback(() => {
    const uid = authRef.current.userId;
    teardownTrackingSession();
    clearUserEyeControlLocalData(uid);
    setConsentState(createEmptyConsentState(uid));
    setConsentLogs([]);
    setPersistedCalibrationProfile(null);
    setCalibration({ ...DEFAULT_CALIBRATION_DATA });
    setSettings(prev => ({ ...prev, eyeControlEnabled: false }));
  }, [teardownTrackingSession]);

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

  const setLowLightFilterEnabled = useCallback((enabled: boolean) => {
    lowLightFilterEnabledRef.current = enabled;
    if (!enabled) {
      lowLightProcessorRef.current?.reset();
      processedCanvasRef.current = null;
      setEphemeralLowLightStats(sessionTokenRef.current, null);
    }
    setSettings(prev => ({ ...prev, lowLightFilterEnabled: enabled }));
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
    processedCanvasRef,
    isKeyboardOpen,
    setKeyboardOpen,
    setEyeControlEnabled,
    setSimulatorMode,
    setSoundFeedback,
    setSpeakerEnabled,
    setSpeechVolume,
    setSpeechRate,
    setLowLightFilterEnabled,
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
    consentState,
    consentLogs,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
    grantFaceProcessingConsent,
    revokeFaceProcessingConsent,
    grantCalibrationStorageConsent,
    revokeCalibrationStorageConsent,
    deleteCalibrationData,
    deleteAllLocalEyeData,
    persistedCalibrationProfile,
    calibrationRetentionDays: DEFAULT_CALIBRATION_RETENTION_DAYS,
    activeSessionId,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
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
    setLowLightFilterEnabled,
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
    consentState,
    consentLogs,
    isConsentModalOpen,
    openConsentModal,
    closeConsentModal,
    grantFaceProcessingConsent,
    revokeFaceProcessingConsent,
    grantCalibrationStorageConsent,
    revokeCalibrationStorageConsent,
    deleteCalibrationData,
    deleteAllLocalEyeData,
    persistedCalibrationProfile,
    activeSessionId,
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

