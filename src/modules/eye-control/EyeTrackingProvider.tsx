import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { EyeAction, EyeCalibrationData, EyeTrackingState, EyeControlSettings } from './types';
import { analyzeEyes, EYE_INDICES } from './eyeTracker';
import { speakVietnamese } from '../../utils/speech';

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
  toggleCamera: () => Promise<void>;
  startCalibration: () => void;
  calibrationStage: 'idle' | 'countdown' | 'collecting' | 'completed';
  calibrationProgress: number;
  calibrationMessage: string;
  registerGestureCallback: (cb: (action: EyeAction) => void) => () => void;
  triggerManualAction: (action: EyeAction) => void;
}

export interface EyeTrackingTelemetryContextType {
  trackingState: EyeTrackingState;
}

const EyeTrackingSettingsContext = createContext<EyeTrackingSettingsContextType | undefined>(undefined);
const EyeTrackingTelemetryContext = createContext<EyeTrackingTelemetryContextType | undefined>(undefined);

// Telemetry update interval for UI rendering (approx 10-11 FPS)
const TELEMETRY_THROTTLE_MS = 90;

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

  // Settings with localStorage persistence
  const [settings, setSettings] = useState<EyeControlSettings>(() => {
    const saved = localStorage.getItem('luckydream_eye_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return {
      eyeControlEnabled: true,
      dwellTimeMs: 1500,
      soundFeedback: true,
      simulatorMode: true,
    };
  });

  useEffect(() => {
    localStorage.setItem('luckydream_eye_settings', JSON.stringify(settings));
  }, [settings]);

  const [calibration, setCalibration] = useState<EyeCalibrationData>({
    neutralEAR: 0.25,
    blinkThreshold: 0.15,
    neutralIrisH: 0.5,
    neutralIrisV: 0.5,
    isCalibrated: false,
  });

  const [calibrationStage, setCalibrationStage] = useState<'idle' | 'countdown' | 'collecting' | 'completed'>('idle');
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState('Bấm nút để bắt đầu hiệu chỉnh');

  // React State for UI Telemetry (Throttled to 8-12 FPS)
  const [trackingState, setTrackingState] = useState<EyeTrackingState>({
    rawEAR: 0.25,
    leftEAR: 0.25,
    rightEAR: 0.25,
    directionH: 'CENTER',
    directionV: 'CENTER',
    currentAction: 'NONE',
    actionProgress: 0,
    lastActionTriggered: '—',
    faceDetected: false,
    cameraActive: false,
    eyesClosed: false,
    blinkCount: 0,
    closedDuration: 0.0,
    cameraError: null,
  });

  // High-frequency mutable state in refs (Zero-overhead 30-60 FPS tracking)
  const latestTelemetryRef = useRef<EyeTrackingState>({ ...trackingState });
  const latestMetricsRef = useRef<{ avgEAR: number; leftEAR: number; rightEAR: number; avgIrisH: number; avgIrisV: number }>({
    avgEAR: 0.25,
    leftEAR: 0.25,
    rightEAR: 0.25,
    avgIrisH: 0.5,
    avgIrisV: 0.5,
  });
  const lastTelemetryDispatchTime = useRef<number>(0);

  const gestureCallbacksRef = useRef<Array<(action: EyeAction) => void>>([]);

  const registerGestureCallback = useCallback((cb: (action: EyeAction) => void) => {
    gestureCallbacksRef.current.push(cb);
    return () => {
      gestureCallbacksRef.current = gestureCallbacksRef.current.filter(c => c !== cb);
    };
  }, []);

  const dispatchAction = useCallback((action: EyeAction) => {
    if (action === 'NONE') return;
    if (settings.soundFeedback) {
      const soundMap: Record<EyeAction, string> = {
        SELECT: 'Chọn',
        NEXT: 'Sang phải',
        BACK: 'Sang trái',
        DOWN: 'Xuống',
        UP: 'Lên',
        NONE: '',
      };
      speakVietnamese(soundMap[action]);
    }
    gestureCallbacksRef.current.forEach(cb => cb(action));
  }, [settings.soundFeedback]);

  const triggerManualAction = useCallback((action: EyeAction) => {
    const updated: EyeTrackingState = {
      ...latestTelemetryRef.current,
      currentAction: action,
      lastActionTriggered: `${action} (Manual)`,
    };
    latestTelemetryRef.current = updated;
    setTrackingState(updated);
    dispatchAction(action);
  }, [dispatchAction]);

  // High precision state machine refs
  const isEyesClosed = useRef<boolean>(false);
  const closeStartTime = useRef<number | null>(null);
  const blinkTimestamps = useRef<number[]>([]);
  const jstBlinksTimeout = useRef<any>(null);
  const lastFrameTime = useRef<number>(performance.now());
  const cooldownTimer = useRef<number>(0);

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
    const elapsed = now - lastFrameTime.current;
    lastFrameTime.current = now;

    const landmarks = results.multiFaceLandmarks?.[0];
    const canvas = canvasRef.current;

    // Fast exit if no face detected
    if (!landmarks) {
      const prev = latestTelemetryRef.current;
      const shouldDispatch = prev.faceDetected || prev.eyesClosed || (now - lastTelemetryDispatchTime.current > TELEMETRY_THROTTLE_MS);
      
      latestTelemetryRef.current = {
        ...prev,
        faceDetected: false,
        eyesClosed: false,
        closedDuration: 0.0,
        currentAction: 'NONE',
        actionProgress: 0,
      };

      if (canvas && canvas.isConnected) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (shouldDispatch) {
        lastTelemetryDispatchTime.current = now;
        setTrackingState({ ...latestTelemetryRef.current });
      }
      return;
    }

    const metrics = analyzeEyes(landmarks);
    if (!metrics) return;

    // Cache metrics in ref for zero-I/O calibration access
    latestMetricsRef.current = metrics;

    // Direct 2D Canvas Landmark Overlay Drawing (Zero React overhead)
    if (canvas && canvas.isConnected) {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const leftEyeLoop = [33, 160, 158, 133, 153, 144];
        const rightEyeLoop = [362, 385, 387, 263, 373, 380];

        const drawEyeOutline = (indices: number[], color: string) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          indices.forEach((idx, i) => {
            const pt = landmarks[idx];
            if (pt) {
              const x = pt.x * canvas.width;
              const y = pt.y * canvas.height;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          });
          ctx.closePath();
          ctx.stroke();
        };

        drawEyeOutline(leftEyeLoop, 'rgba(106, 201, 240, 0.8)');
        drawEyeOutline(rightEyeLoop, 'rgba(106, 201, 240, 0.8)');

        const drawPupil = (idx: number, color: string) => {
          const pt = landmarks[idx];
          if (pt) {
            ctx.beginPath();
            ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        };

        drawPupil(EYE_INDICES.leftIris, '#FF6F61');
        drawPupil(EYE_INDICES.rightIris, '#FF6F61');
      }
    }

    // High Precision Gesture Detection State Machine
    if (cooldownTimer.current > 0) {
      cooldownTimer.current -= elapsed;
      if (cooldownTimer.current < 0) cooldownTimer.current = 0;
    }

    const isClosedNow = metrics.avgEAR < calibration.blinkThreshold;
    let actionDetected: EyeAction = 'NONE';
    let actionProg = 0;
    let dirV: 'CENTER' | 'UP' | 'DOWN' = 'CENTER';

    let curClosedDuration = 0.0;
    if (isClosedNow) {
      if (!isEyesClosed.current) {
        isEyesClosed.current = true;
        closeStartTime.current = now;
      }
      const holdDurationMs = now - (closeStartTime.current || now);
      curClosedDuration = parseFloat((holdDurationMs / 1000).toFixed(1));
    } else {
      if (isEyesClosed.current) {
        isEyesClosed.current = false;
        const finalDurationMs = now - (closeStartTime.current || now);
        closeStartTime.current = null;
        curClosedDuration = 0.0;

        // Process blink release sequences
        if (finalDurationMs >= 50 && finalDurationMs < 450) {
          const len = blinkTimestamps.current.length;
          const lastBlink = len > 0 ? blinkTimestamps.current[len - 1] : 0;
          if (!lastBlink || (now - lastBlink >= 250)) {
            if (jstBlinksTimeout.current) clearTimeout(jstBlinksTimeout.current);

            blinkTimestamps.current.push(now);
            blinkTimestamps.current = blinkTimestamps.current.filter(t => now - t <= 3500);

            const blinksCount = blinkTimestamps.current.length;
            if (blinksCount === 1) {
              jstBlinksTimeout.current = setTimeout(() => {
                cooldownTimer.current = 600;
                dispatchAction('SELECT');
                const updated: EyeTrackingState = {
                  ...latestTelemetryRef.current,
                  lastActionTriggered: 'SELECT',
                  currentAction: 'NONE',
                  blinkCount: 0,
                };
                latestTelemetryRef.current = updated;
                setTrackingState(updated);
                blinkTimestamps.current = [];
              }, 1000);
            } else if (blinksCount === 2) {
              const holdsWithin1_5s = (blinkTimestamps.current[1] - blinkTimestamps.current[0]) <= 1500;
              if (holdsWithin1_5s) {
                jstBlinksTimeout.current = setTimeout(() => {
                  cooldownTimer.current = 600;
                  dispatchAction('NEXT');
                  const updated: EyeTrackingState = {
                    ...latestTelemetryRef.current,
                    lastActionTriggered: 'RIGHT',
                    currentAction: 'NONE',
                    blinkCount: 0,
                  };
                  latestTelemetryRef.current = updated;
                  setTrackingState(updated);
                  blinkTimestamps.current = [];
                }, 1100);
              } else {
                blinkTimestamps.current = [now];
                jstBlinksTimeout.current = setTimeout(() => {
                  cooldownTimer.current = 600;
                  dispatchAction('SELECT');
                  const updated: EyeTrackingState = {
                    ...latestTelemetryRef.current,
                    lastActionTriggered: 'SELECT',
                    currentAction: 'NONE',
                    blinkCount: 0,
                  };
                  latestTelemetryRef.current = updated;
                  setTrackingState(updated);
                  blinkTimestamps.current = [];
                }, 1000);
              }
            } else if (blinksCount >= 3) {
              const currentLen = blinkTimestamps.current.length;
              const holdsWithin3_5s = (blinkTimestamps.current[currentLen - 1] - blinkTimestamps.current[currentLen - 3]) <= 3500;
              if (holdsWithin3_5s) {
                cooldownTimer.current = 600;
                dispatchAction('BACK');
                const updated: EyeTrackingState = {
                  ...latestTelemetryRef.current,
                  lastActionTriggered: 'LEFT',
                  currentAction: 'NONE',
                  blinkCount: 0,
                };
                latestTelemetryRef.current = updated;
                setTrackingState(updated);
              }
              blinkTimestamps.current = [];
            }
          }
        } else if (finalDurationMs >= 800 && finalDurationMs <= 1300) {
          cooldownTimer.current = 500;
          dispatchAction('SELECT');
          const updated: EyeTrackingState = {
            ...latestTelemetryRef.current,
            lastActionTriggered: 'SELECT',
            currentAction: 'NONE',
            blinkCount: 0,
          };
          latestTelemetryRef.current = updated;
          setTrackingState(updated);
        } else if (finalDurationMs >= 1400 && finalDurationMs <= 2200) {
          cooldownTimer.current = 500;
          dispatchAction('DOWN');
          const updated: EyeTrackingState = {
            ...latestTelemetryRef.current,
            lastActionTriggered: 'DOWN',
            currentAction: 'NONE',
            blinkCount: 0,
          };
          latestTelemetryRef.current = updated;
          setTrackingState(updated);
        } else if (finalDurationMs >= 2300) {
          cooldownTimer.current = 500;
          dispatchAction('UP');
          const updated: EyeTrackingState = {
            ...latestTelemetryRef.current,
            lastActionTriggered: 'UP',
            currentAction: 'NONE',
            blinkCount: 0,
          };
          latestTelemetryRef.current = updated;
          setTrackingState(updated);
        }
      }
    }

    if (cooldownTimer.current <= 0 && isClosedNow && closeStartTime.current) {
      const holdDuration = now - closeStartTime.current;
      if (holdDuration >= 450 && holdDuration <= 1300) {
        actionDetected = 'SELECT';
        actionProg = Math.min(100, Math.round(((holdDuration - 450) / 450) * 100));
      } else if (holdDuration > 1300 && holdDuration <= 2200) {
        actionDetected = 'DOWN';
        dirV = 'DOWN';
        actionProg = Math.min(100, Math.round(((holdDuration - 1300) / 600) * 100));
      } else if (holdDuration > 2200) {
        actionDetected = 'UP';
        dirV = 'UP';
        actionProg = Math.min(100, Math.round(((holdDuration - 2200) / 400) * 100));
      }
    }

    const prevTelemetry = latestTelemetryRef.current;
    const currentBlinkCount = blinkTimestamps.current.length;

    // Check if significant state transition occurred
    const hasMajorTransition =
      prevTelemetry.faceDetected !== true ||
      prevTelemetry.eyesClosed !== isClosedNow ||
      prevTelemetry.blinkCount !== currentBlinkCount ||
      prevTelemetry.currentAction !== actionDetected ||
      prevTelemetry.directionV !== dirV;

    const timeSinceLastDispatch = now - lastTelemetryDispatchTime.current;
    const isThrottleDue = timeSinceLastDispatch >= TELEMETRY_THROTTLE_MS;

    const nextTelemetry: EyeTrackingState = {
      ...prevTelemetry,
      rawEAR: metrics.avgEAR,
      leftEAR: metrics.leftEAR,
      rightEAR: metrics.rightEAR,
      directionH: 'CENTER',
      directionV: dirV,
      currentAction: actionDetected,
      actionProgress: actionProg,
      faceDetected: true,
      eyesClosed: isClosedNow,
      blinkCount: currentBlinkCount,
      closedDuration: curClosedDuration,
    };

    latestTelemetryRef.current = nextTelemetry;

    // Only dispatch to React state if major transition or throttled timer elapsed
    if (hasMajorTransition || isThrottleDue) {
      lastTelemetryDispatchTime.current = now;
      setTrackingState(nextTelemetry);
    }
  }, [calibration.blinkThreshold, dispatchAction]);

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
      // Concurrency lock: skip frame if previous send() is still processing
      if (video && video.readyState >= 2 && !isProcessingRef.current && faceMeshRef.current) {
        isProcessingRef.current = true;
        try {
          await faceMeshRef.current.send({ image: video });
        } catch (e) {
          // Drop frame on error
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
    console.log('[EYE CAMERA] stopTrackingLoop called');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isProcessingRef.current = false;
    if (mediaStreamRef.current) {
      console.log('[EYE CAMERA] Stopping camera tracks...');
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[EYE CAMERA] Track stopped: ${track.label || 'video track'}`);
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
    console.log('[EYE CAMERA] startCamera called');

    const isSec = typeof window !== 'undefined' ? window.isSecureContext : false;
    const hasMediaDevices = typeof navigator !== 'undefined' ? !!navigator.mediaDevices : false;
    const hasGetUserMedia = typeof navigator !== 'undefined' ? !!navigator.mediaDevices?.getUserMedia : false;

    console.log('[EYE CAMERA] isSecureContext:', isSec);
    console.log('[EYE CAMERA] mediaDevices:', hasMediaDevices);
    console.log('[EYE CAMERA] getUserMedia:', hasGetUserMedia);

    if (typeof window !== 'undefined' && !isSec) {
      const errMsg = 'Trình duyệt yêu cầu ngữ cảnh bảo mật (HTTPS hoặc localhost) để mở Camera.';
      console.error('[EYE CAMERA] Secure context check failed:', errMsg);
      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
      return;
    }

    if (!hasMediaDevices || !hasGetUserMedia) {
      const errMsg = 'Trình duyệt không hỗ trợ WebRTC / MediaDevices getUserMedia.';
      console.error('[EYE CAMERA] mediaDevices check failed:', errMsg);
      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
      return;
    }

    // Reuse stream if already active
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      const activeTracks = mediaStreamRef.current.getVideoTracks().filter(t => t.readyState === 'live');
      if (activeTracks.length > 0) {
        console.log('[EYE CAMERA] Stream already active, reusing existing stream.');
        if (videoRef.current) {
          if (videoRef.current.srcObject !== mediaStreamRef.current) {
            console.log('[EYE CAMERA] assigning srcObject');
            videoRef.current.srcObject = mediaStreamRef.current;
          }
          try {
            await videoRef.current.play();
            console.log('[EYE CAMERA] video playing');
          } catch (e) {
            console.warn('[EYE CAMERA] video.play() warning:', e);
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

      console.log('[EYE CAMERA] requesting getUserMedia');

      let stream: MediaStream;
      try {
        // Preferred constraint: front camera ideal at lightweight 640x480 resolution
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (firstErr: any) {
        console.warn('[EYE CAMERA] Preferred getUserMedia constraints failed, trying basic fallback:', firstErr?.name || firstErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      console.log('[EYE CAMERA] stream received');
      const tracks = stream.getVideoTracks();
      console.log(`[EYE CAMERA] video tracks = ${tracks.length}`);

      if (tracks.length === 0) {
        throw new Error('No video tracks available in stream');
      }

      const primaryTrack = tracks[0];
      console.log(`[EYE CAMERA] track readyState = ${primaryTrack.readyState}`);
      console.log(`[EYE CAMERA] track enabled = ${primaryTrack.enabled}`);

      mediaStreamRef.current = stream;
      setCameraStream(stream);

      if (videoRef.current) {
        console.log('[EYE CAMERA] assigning srcObject');
        videoRef.current.srcObject = stream;

        // Ensure metadata is loaded
        if (videoRef.current.readyState >= 1) {
          console.log('[EYE CAMERA] metadata loaded');
        } else {
          await new Promise<void>((resolve) => {
            if (!videoRef.current) return resolve();
            videoRef.current.onloadedmetadata = () => {
              console.log('[EYE CAMERA] metadata loaded');
              resolve();
            };
          });
        }

        try {
          if (videoRef.current) {
            await videoRef.current.play();
            console.log('[EYE CAMERA] video playing');
          }
        } catch (playErr: any) {
          console.warn('[EYE CAMERA] video.play() warning:', playErr);
        }

        startTrackingLoop();
      }

      const readyState = { ...latestTelemetryRef.current, cameraActive: true, cameraError: null };
      latestTelemetryRef.current = readyState;
      setTrackingState(readyState);
    } catch (err: any) {
      console.error(`[EYE CAMERA] getUserMedia failed: ${err.name || 'Error'} - ${err.message || err}`);
      let errMsg = 'Không khởi tạo được camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Quyền truy cập máy ảnh bị từ chối. Vui lòng cho phép quyền Camera trên trình duyệt.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'Không tìm thấy thiết bị camera trên máy.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errMsg = 'Camera đang bị ứng dụng khác chiếm giữ hoặc lỗi phần cứng.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        errMsg = 'Cấu hình camera không phù hợp với thiết bị.';
      } else if (err.name === 'AbortError') {
        errMsg = 'Quá trình mở camera bị gián đoạn.';
      } else if (err.name === 'SecurityError') {
        errMsg = 'Ngữ cảnh không bảo mật hoặc bị chính sách bảo mật chặn camera.';
      }

      const errState = { ...latestTelemetryRef.current, cameraActive: false, cameraError: errMsg };
      latestTelemetryRef.current = errState;
      setTrackingState(errState);
    }
  }, [startTrackingLoop]);

  // Lifecycle control: Automatically start/stop camera on eyeControlEnabled toggle
  useEffect(() => {
    console.log(`[EYE CAMERA] eyeControlEnabled = ${settings.eyeControlEnabled}`);
    if (settings.eyeControlEnabled) {
      startCamera();
    } else {
      stopTrackingLoop();
    }
  }, [settings.eyeControlEnabled, startCamera, stopTrackingLoop]);

  const toggleCamera = useCallback(async () => {
    if (latestTelemetryRef.current.cameraActive) {
      stopTrackingLoop();
    } else {
      await startCamera();
    }
  }, [startCamera, stopTrackingLoop]);

  // Keyboard simulator handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!settings.simulatorMode) return;
      
      let act: EyeAction = 'NONE';
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          act = 'NEXT';
          break;
        case 'ArrowLeft':
          e.preventDefault();
          act = 'BACK';
          break;
        case 'ArrowUp':
          e.preventDefault();
          act = 'UP';
          break;
        case 'ArrowDown':
          e.preventDefault();
          act = 'DOWN';
          break;
        case 'Enter':
          e.preventDefault();
          act = 'SELECT';
          break;
        default:
          return;
      }

      const updated: EyeTrackingState = {
        ...latestTelemetryRef.current,
        currentAction: act,
        lastActionTriggered: act === 'NEXT' ? 'RIGHT' : act === 'BACK' ? 'LEFT' : act,
      };
      latestTelemetryRef.current = updated;
      setTrackingState(updated);

      dispatchAction(act);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.simulatorMode, dispatchAction]);

  const startCalibration = useCallback(() => {
    setCalibrationStage('countdown');
    setCalibrationProgress(0);
    setCalibrationMessage('Nhìn thẳng vào chấm đỏ ở giữa webcam...');

    let countdown = 3;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        setCalibrationStage('collecting');
        setCalibrationMessage('Đang thu thập dữ liệu mắt... Hãy nhìn thẳng!');
        collectCalibrationPoints();
      } else {
        setCalibrationMessage(`Chuẩn bị... Nhìn thẳng trong ${countdown}s`);
      }
    }, 1000);
  }, []);

  const collectCalibrationPoints = useCallback(() => {
    const collectedEAR: number[] = [];
    const collectedIrisH: number[] = [];
    const collectedIrisV: number[] = [];
    let samples = 0;
    const maxSamples = 40;

    const checkFrame = () => {
      if (samples >= maxSamples) {
        const avgEAR = collectedEAR.reduce((a, b) => a + b, 0) / (collectedEAR.length || 1);
        const avgH = collectedIrisH.reduce((a, b) => a + b, 0) / (collectedIrisH.length || 1);
        const avgV = collectedIrisV.reduce((a, b) => a + b, 0) / (collectedIrisV.length || 1);
        const blinkThresh = avgEAR * 0.58;

        setCalibration({
          neutralEAR: avgEAR,
          blinkThreshold: blinkThresh,
          neutralIrisH: avgH,
          neutralIrisV: avgV,
          isCalibrated: true
        });

        setCalibrationStage('completed');
        setCalibrationMessage('Hiệu chỉnh thành công!');
        speakVietnamese('Hiệu chỉnh hoàn tất');

        setTimeout(() => setCalibrationStage('idle'), 1500);
        return;
      }

      // Read from ultra-fast in-memory ref
      const currentRawEAR = latestMetricsRef.current.avgEAR;
      const currentRawH = latestMetricsRef.current.avgIrisH;
      const currentRawV = latestMetricsRef.current.avgIrisV;

      if (currentRawEAR > 0) {
        collectedEAR.push(currentRawEAR);
        collectedIrisH.push(currentRawH);
        collectedIrisV.push(currentRawV);
        samples++;
        setCalibrationProgress(Math.round((samples / maxSamples) * 100));
      }

      setTimeout(checkFrame, 50);
    };

    checkFrame();
  }, []);

  const setEyeControlEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, eyeControlEnabled: enabled }));
  }, []);

  const setSimulatorMode = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, simulatorMode: enabled }));
  }, []);

  const setSoundFeedback = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, soundFeedback: enabled }));
  }, []);

  const [isKeyboardOpen, setKeyboardOpen] = useState(false);

  // Stable Memoized Settings Context Value (Never re-renders during normal eye tracking)
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
    toggleCamera,
    startCalibration,
    calibrationStage,
    calibrationProgress,
    calibrationMessage,
    registerGestureCallback,
    triggerManualAction,
  }), [
    settings,
    calibration,
    libsLoading,
    libError,
    cameraStream,
    isKeyboardOpen,
    setKeyboardOpen,
    calibrationStage,
    calibrationProgress,
    calibrationMessage,
    setEyeControlEnabled,
    setSimulatorMode,
    setSoundFeedback,
    toggleCamera,
    startCalibration,
    registerGestureCallback,
    triggerManualAction,
  ]);

  // Throttled Telemetry Context Value (Updates at ~10 FPS only for HUD / SOS)
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

// Backward compatibility context consumer
export function useEyeTrackingContext() {
  const settingsCtx = useEyeTrackingSettingsContext();
  const telemetryCtx = useEyeTrackingTelemetryContext();
  return {
    ...settingsCtx,
    ...telemetryCtx,
  };
}
