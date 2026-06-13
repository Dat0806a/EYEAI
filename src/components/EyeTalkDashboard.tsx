import React, { useRef, useState, useEffect } from 'react';
import { KEYBOARD_LAYOUT, applyVietnameseAccents } from '../utils/keyboardLayout';
import { analyzeEyes, dist, EYE_INDICES } from '../utils/eyeTracker';
import { speakVietnamese } from '../utils/speech';
import { GridItem, EyeCalibrationData, EyeAction, EyeTrackingState, ChatMessage } from '../types';
import { Camera, RefreshCw, Volume2, User, Sparkles, Keyboard, KeyboardOff, Eye, Send, RotateCcw, AlertTriangle, Monitor, Play, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EyeTalkDashboardProps {
  onBackToHome: () => void;
}

export default function EyeTalkDashboard({ onBackToHome }: EyeTalkDashboardProps) {
  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const faceMeshRef = useRef<any>(null);

  // Loaded libraries state
  const [libsLoading, setLibsLoading] = useState(true);
  const [libError, setLibError] = useState<string | null>(null);

  // Simulator mode
  const [simulatorMode, setSimulatorMode] = useState(true);

  // Active state for coordinates
  const [grid, setGrid] = useState<GridItem[][]>(KEYBOARD_LAYOUT);
  const [focusIndex, setFocusIndex] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const focusedRow = focusIndex.row;
  const focusedCol = focusIndex.col;

  // Sync state to refs for the tracking closure
  const focusedRowRef = useRef<number>(focusedRow);
  const focusedColRef = useRef<number>(focusedCol);
  focusedRowRef.current = focusedRow;
  focusedColRef.current = focusedCol;

  // Draft inputs
  const [draft, setDraft] = useState<string>('');

  const draftRef = useRef<string>(draft);
  draftRef.current = draft;
  
  // Simulated chat list
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', text: 'Chào mừng bạn đến với EyeTalk Assistant!', sender: 'system', timestamp: new Date() },
    { id: '2', text: 'Chọn "Bật Camera" hoặc sử dụng "Cảm biến Bàn phím" giả lập để thử giao tiếp bằng mắt.', sender: 'system', timestamp: new Date() }
  ]);

  // Eye Calibration State
  const [calibration, setCalibration] = useState<EyeCalibrationData>({
    neutralEAR: 0.25,
    blinkThreshold: 0.15,
    neutralIrisH: 0.5,
    neutralIrisV: 0.5,
    isCalibrated: false
  });
  
  // Calibration countdown and stages
  const [calibrationStage, setCalibrationStage] = useState<'idle' | 'countdown' | 'collecting' | 'completed'>('idle');
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState('Bấm nút để bắt đầu hiệu chỉnh');

  // Eye Tracking State
  const [trackingState, setTrackingState] = useState<EyeTrackingState>({
    rawEAR: 0.25,
    directionH: 'CENTER',
    directionV: 'CENTER',
    currentAction: 'NONE',
    actionProgress: 0,
    lastActionTriggered: '(Chưa kích hoạt)',
    faceDetected: false,
    cameraActive: false
  });

  // Action Timer tracking for actual operations
  const durationAccumulator = useRef<{ [key in EyeAction]?: number }>({});
  const lastFrameTime = useRef<number>(Date.now());
  const cooldownTimer = useRef<number>(0);

  // New state machine refs for blink and hold gestures:
  const isEyesClosed = useRef<boolean>(false);
  const closeStartTime = useRef<number | null>(null);
  const blinkTimestamps = useRef<number[]>([]);
  const jstBlinksTimeout = useRef<any>(null);
  
  // Tracking logs for debugging
  const [debugLog, setDebugLog] = useState<{ label: string; value: string | number }[]>([
    { label: 'Trạng thái', value: 'Simulator Active' }
  ]);

  // Load MediaPipe Libraries dynamically
  useEffect(() => {
    let active = true;

    async function loadLibraries() {
      try {
        if ((window as any).FaceMesh) {
          if (active) setLibsLoading(false);
          return;
        }

        // Add MediaPipe CSS if any (not needed standard)
        // Load main face_mesh script
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
        script.async = true;
        
        const scriptPromise = new Promise((resolve, reject) => {
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load FaceMesh library from CDN.'));
        });

        document.head.appendChild(script);
        await scriptPromise;

        if (active) {
          setLibsLoading(false);
          // Auto enable simulator first, user can activate webcam optionally
          setSimulatorMode(true);
        }
      } catch (err: any) {
        if (active) {
          setLibError(err.message || 'Không thể nạp thư viện camera!');
          setLibsLoading(false);
        }
      }
    }

    loadLibraries();

    return () => {
      active = false;
    };
  }, []);

  // Physical keyboard support for immediate simulator controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!simulatorMode) return;

      let act: EyeAction = 'NONE';
      
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          act = 'NEXT';
          navigateCursor('NEXT');
          setTrackingState(prev => ({
            ...prev,
            directionH: 'RIGHT',
            currentAction: 'NEXT',
            lastActionTriggered: 'NEXT (Phím mũi tên phải)'
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          act = 'BACK';
          navigateCursor('BACK');
          setTrackingState(prev => ({
            ...prev,
            directionH: 'LEFT',
            currentAction: 'BACK',
            lastActionTriggered: 'BACK (Phím mũi tên trái)'
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          act = 'UP';
          navigateCursor('UP');
          setTrackingState(prev => ({
            ...prev,
            directionV: 'UP',
            currentAction: 'UP',
            lastActionTriggered: 'UP (Phím mũi tên lên)'
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          act = 'DOWN';
          navigateCursor('DOWN');
          setTrackingState(prev => ({
            ...prev,
            directionV: 'DOWN',
            currentAction: 'DOWN',
            lastActionTriggered: 'DOWN (Phím mũi tên xuống)'
          }));
          break;
        case 'Enter':
          e.preventDefault();
          act = 'SELECT';
          triggerSelection();
          setTrackingState(prev => ({
            ...prev,
            currentAction: 'SELECT',
            lastActionTriggered: 'SELECT (Phím Enter)'
          }));
          break;
        default:
          return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [simulatorMode, focusIndex, draft]);

  // Navigate keyboard cursor
  const navigateCursor = (direction: EyeAction) => {
    setFocusIndex(prev => {
      let r = prev.row;
      let c = prev.col;

      if (direction === 'NEXT') {
        c = (c + 1) % grid[r].length;
      } else if (direction === 'BACK') {
        c = (c - 1 + grid[r].length) % grid[r].length;
      } else if (direction === 'DOWN') {
        r = (r + 1) % grid.length;
        c = Math.min(c, grid[r].length - 1);
      } else if (direction === 'UP') {
        r = (r - 1 + grid.length) % grid.length;
        c = Math.min(c, grid[r].length - 1);
      }

      return { row: r, col: c };
    });
  };

  // Perform letter selection on virtual keyboard
  const triggerSelection = () => {
    const item = grid[focusedRowRef.current][focusedColRef.current];
    if (!item) return;

    if (item.type === 'phrase') {
      setDraft(prev => {
        const nextDraft = prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + item.value;
        return applyVietnameseAccents(nextDraft);
      });
    } else if (item.type === 'letter') {
      setDraft(prev => {
        const nextDraft = prev + item.value;
        return applyVietnameseAccents(nextDraft);
      });
    } else if (item.type === 'action') {
      if (item.value === ' ' || item.id === 'l_space') {
        setDraft(prev => prev + ' ');
      } else if (item.value === 'BACKSPACE') {
        setDraft(prev => prev.slice(0, -1));
      } else if (item.value === 'CLEAR_ALL') {
        setDraft('');
      } else if (item.value === 'SEND') {
        const currentDraft = draftRef.current;
        if (currentDraft.trim() === '') return;
        
        const textToSend = currentDraft.trim();
        const newMsg: ChatMessage = {
          id: Date.now().toString(),
          text: textToSend,
          sender: 'user',
          timestamp: new Date()
        };

        setChatMessages(prev => [...prev, newMsg]);
        speakVietnamese(textToSend); // Read aloud for physical assistance
        setDraft('');
        
        // Return focus to first helpful phrase
        setFocusIndex({ row: 0, col: 0 });
      }
    }
  };

  // Turn ON / OFF camera and Eye-tracking
  const toggleCamera = async () => {
    if (trackingState.cameraActive) {
      // Turn OFF
      stopTrackingLoop();
      setTrackingState(prev => ({
        ...prev,
        cameraActive: false,
        faceDetected: false
      }));
      setSimulatorMode(true);
    } else {
      // Turn ON
      setSimulatorMode(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            startTrackingLoop();
          };
          setTrackingState(prev => ({ ...prev, cameraActive: true }));
        }
      } catch (err) {
        console.error('Không thể mở camera:', err);
        alert('Không khởi tạo được camera. Vui lòng xác nhận quyền truy cập máy ảnh và thử lại hoặc tiếp tục dùng chế độ Giả lập.');
        setSimulatorMode(true);
      }
    }
  };

  // Stop camera tracking loop
  const stopTrackingLoop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTrackingLoop();
      if (jstBlinksTimeout.current) {
        clearTimeout(jstBlinksTimeout.current);
      }
    };
  }, []);

  // Set up MediaPipe FaceMesh
  const startTrackingLoop = () => {
    if (!(window as any).FaceMesh) {
      console.error('FaceMesh library is not available in global scope.');
      return;
    }

    if (!faceMeshRef.current) {
      const faceMesh = new (window as any).FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // Need this for precise irises (468, 473)
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      faceMesh.onResults((results: any) => {
        processFaceMeshResults(results);
      });

      faceMeshRef.current = faceMesh;
    }

    lastFrameTime.current = Date.now();
    
    const render = async () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          await faceMeshRef.current.send({ image: video });
        } catch (e) {
          console.error('Failed to send frame to FaceMesh:', e);
        }
      }
      if (trackingState.cameraActive || videoRef.current?.srcObject) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };

    animationFrameRef.current = requestAnimationFrame(render);
  };

  // Calibration routine
  const startCalibration = () => {
    setCalibrationStage('countdown');
    setCalibrationProgress(0);
    setCalibrationMessage('Hãy nhìn thẳng vào chấm đỏ ở giữa webcam trong...');
    
    let countdown = 3;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        setCalibrationStage('collecting');
        setCalibrationMessage('Đang thu thập thông tin cử chỉ mắt... Hãy nhìn thẳng!');
        collectCalibrationPoints();
      } else {
        setCalibrationMessage(`Chuẩn bị hiệu chỉnh... Nhìn thẳng trong ${countdown} giây`);
      }
    }, 1000);
  };

  const collectCalibrationPoints = () => {
    const collectedEAR: number[] = [];
    const collectedIrisH: number[] = [];
    const collectedIrisV: number[] = [];
    let samples = 0;
    const maxSamples = 50;

    const checkFrame = () => {
      if (samples >= maxSamples) {
        // Compute averages
        const avgEAR = collectedEAR.reduce((a, b) => a + b, 0) / collectedEAR.length;
        const avgH = collectedIrisH.reduce((a, b) => a + b, 0) / collectedIrisH.length;
        const avgV = collectedIrisV.reduce((a, b) => a + b, 0) / collectedIrisV.length;
        
        // Blinking aspect ratio threshold is usually 50-60% of open-eye aspect ratio
        const blinkThresh = avgEAR * 0.58;

        setCalibration({
          neutralEAR: avgEAR,
          blinkThreshold: blinkThresh,
          neutralIrisH: avgH,
          neutralIrisV: avgV,
          isCalibrated: true
        });

        setCalibrationStage('completed');
        setCalibrationMessage('Hiệu chỉnh mắt thành công! Đang tự động chuyển về chế độ theo dõi.');
        speakVietnamese('Hiệu chỉnh hoàn tất');
        
        setTimeout(() => {
          setCalibrationStage('idle');
        }, 1500);
        return;
      }

      // Read current tracking values directly from temporary frames
      // which are populated in processFaceMeshResults index changes
      const currentRawEAR = parseFloat(sessionStorage.getItem('tmp_raw_ear') || '0');
      const currentRawH = parseFloat(sessionStorage.getItem('tmp_raw_h') || '0');
      const currentRawV = parseFloat(sessionStorage.getItem('tmp_raw_v') || '0');

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
  };

  // Process coordinates & Draw on canvas
  const processFaceMeshResults = (results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !video || !ctx) return;

    // Direct match size
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = results.multiFaceLandmarks?.[0];

    if (!landmarks) {
      setTrackingState(prev => ({ ...prev, faceDetected: false }));
      return;
    }

    // High quality coordinates evaluation
    const metrics = analyzeEyes(landmarks);
    if (!metrics) {
      setTrackingState(prev => ({ ...prev, faceDetected: false }));
      return;
    }

    // Save temporary data in session storage to facilitate Calibration collector
    sessionStorage.setItem('tmp_raw_ear', metrics.avgEAR.toString());
    sessionStorage.setItem('tmp_raw_h', metrics.avgIrisH.toString());
    sessionStorage.setItem('tmp_raw_v', metrics.avgIrisV.toString());

    // Compute delta variations
    const deltaH = metrics.avgIrisH - calibration.neutralIrisH;
    const deltaV = metrics.avgIrisV - calibration.neutralIrisV;

    // Draw interactive overlay on frame
    // 1. Plot complete face oval in subtle color
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)'; // Sky blue
    ctx.lineWidth = 1;
    
    // Draw left and right eye outline
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

    // Left eye outline: standard landmarks indices loop
    const leftEyeLoop = [33, 160, 158, 133, 153, 144];
    const rightEyeLoop = [362, 385, 387, 263, 373, 380];
    
    drawEyeOutline(leftEyeLoop, 'rgba(16, 185, 129, 0.6)'); // Emerald
    drawEyeOutline(rightEyeLoop, 'rgba(16, 185, 129, 0.6)');

    // Draw Iris/Pupils as bright spots
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

    drawPupil(EYE_INDICES.leftIris, '#ef4444'); // Red iris dot
    drawPupil(EYE_INDICES.rightIris, '#ef4444');

    // 2. Identify eye actions based strictly on straight-gaze blinking and holding durations
    const now = Date.now();
    const elapsed = now - lastFrameTime.current;
    lastFrameTime.current = now;

    // Handle cooldown logic cleanly
    if (cooldownTimer.current > 0) {
      cooldownTimer.current -= elapsed;
      if (cooldownTimer.current < 0) cooldownTimer.current = 0;
    }

    const isClosedNow = metrics.avgEAR < calibration.blinkThreshold;
    let actionDetected: EyeAction = 'NONE';
    let actionProg = 0;
    let dirV: 'CENTER' | 'UP' | 'DOWN' = 'CENTER';

    if (cooldownTimer.current > 0) {
      // While in cooldown, keep tracking variables synchronized but ignore triggers
      isEyesClosed.current = isClosedNow;
      closeStartTime.current = isClosedNow ? now : null;

      setTrackingState(prev => ({
        ...prev,
        rawEAR: metrics.avgEAR,
        directionH: 'CENTER',
        directionV: 'CENTER',
        currentAction: 'NONE',
        actionProgress: 0,
        faceDetected: true
      }));
    } else {
      if (isClosedNow) {
        if (!isEyesClosed.current) {
          isEyesClosed.current = true;
          closeStartTime.current = now;
        }

        const holdDuration = now - (closeStartTime.current || now);

        if (holdDuration >= 450 && holdDuration <= 1300) {
          actionDetected = 'SELECT';
          // Scale progress targeting roughly 800ms to 1000ms
          actionProg = Math.min(100, Math.round(((holdDuration - 450) / 450) * 100));
        } else if (holdDuration > 1300 && holdDuration <= 2200) {
          actionDetected = 'DOWN';
          dirV = 'DOWN';
          // Scale progress targeting roughly 1500ms to 2000ms
          actionProg = Math.min(100, Math.round(((holdDuration - 1300) / 600) * 100));
        } else if (holdDuration > 2200) {
          actionDetected = 'UP';
          dirV = 'UP';
          // Scale progress targeting roughly 2500ms
          actionProg = Math.min(100, Math.round(((holdDuration - 2200) / 400) * 100));
        }

        setTrackingState(prev => ({
          ...prev,
          rawEAR: metrics.avgEAR,
          directionH: 'CENTER',
          directionV: dirV,
          currentAction: actionDetected,
          actionProgress: actionProg,
          faceDetected: true
        }));
      } else {
        // Eyes are currently OPEN
        if (isEyesClosed.current) {
          // Closed -> Open transition detected!
          isEyesClosed.current = false;
          const finalDuration = now - (closeStartTime.current || now);
          closeStartTime.current = null;

          if (finalDuration >= 50 && finalDuration < 450) {
            // Short blink detected
            const len = blinkTimestamps.current.length;
            const lastBlink = len > 0 ? blinkTimestamps.current[len - 1] : 0;
            if (lastBlink && (now - lastBlink < 250)) {
              // Ignore high frequency jitter
            } else {
              if (jstBlinksTimeout.current) {
                clearTimeout(jstBlinksTimeout.current);
              }

              blinkTimestamps.current.push(now);
              // Maintain timestamps up to 3.5s
              blinkTimestamps.current = blinkTimestamps.current.filter(t => now - t <= 3500);

              const blinksCount = blinkTimestamps.current.length;
              if (blinksCount === 1) {
                // Wait to see if a second blink occurs. If not, trigger selection!
                jstBlinksTimeout.current = setTimeout(() => {
                  cooldownTimer.current = 600; // safe cooldown
                  triggerSelection();
                  
                  const selectedItem = grid[focusedRowRef.current][focusedColRef.current];
                  const speakText = selectedItem ? `Chọn ${selectedItem.label}` : 'Chọn';

                  setTrackingState(prev => ({
                    ...prev,
                    lastActionTriggered: `🎯 CHỌN (Nháy 1 lần) - ${new Date().toLocaleTimeString()}`,
                    currentAction: 'NONE',
                    actionProgress: 0
                  }));
                  speakVietnamese(speakText);
                  
                  blinkTimestamps.current = [];
                }, 1000); // 1 second wait window
              } else if (blinksCount === 2) {
                // Check if the 2 blinks occurred within 1.5s
                const holdsWithin1_5s = (blinkTimestamps.current[1] - blinkTimestamps.current[0]) <= 1500;
                if (holdsWithin1_5s) {
                  // Wait to see if there is a 3rd blink coming
                  jstBlinksTimeout.current = setTimeout(() => {
                    cooldownTimer.current = 600; // 0.6s safe cooldown
                    navigateCursor('NEXT');
                    setTrackingState(prev => ({
                      ...prev,
                      lastActionTriggered: `➡️ PHẢI (Nháy 2 lần trong 1.5s) - ${new Date().toLocaleTimeString()}`,
                      currentAction: 'NONE',
                      actionProgress: 0
                    }));
                    speakVietnamese('Sang phải');
                    blinkTimestamps.current = [];
                  }, 1100);
                } else {
                  // The 2 blinks were too far apart. Treat the second blink as the start of a new sequence
                  blinkTimestamps.current = [now];
                  jstBlinksTimeout.current = setTimeout(() => {
                    cooldownTimer.current = 600; // safe cooldown
                    triggerSelection();
                    
                    const selectedItem = grid[focusedRowRef.current][focusedColRef.current];
                    const speakText = selectedItem ? `Chọn ${selectedItem.label}` : 'Chọn';

                    setTrackingState(prev => ({
                      ...prev,
                      lastActionTriggered: `🎯 CHỌN (Nháy 1 lần) - ${new Date().toLocaleTimeString()}`,
                      currentAction: 'NONE',
                      actionProgress: 0
                    }));
                    speakVietnamese(speakText);

                    blinkTimestamps.current = [];
                  }, 1000);
                }
              } else if (blinksCount >= 3) {
                // Check if the last 3 blinks are within 3.5s
                const currentLen = blinkTimestamps.current.length;
                const holdsWithin3_5s = (blinkTimestamps.current[currentLen - 1] - blinkTimestamps.current[currentLen - 3]) <= 3500;
                if (holdsWithin3_5s) {
                  cooldownTimer.current = 600; // 0.6s safe cooldown
                  navigateCursor('BACK');
                  setTrackingState(prev => ({
                    ...prev,
                    lastActionTriggered: `⬅️ TRÁI (Nháy 3 lần trong 3.5s) - ${new Date().toLocaleTimeString()}`,
                    currentAction: 'NONE',
                    actionProgress: 0
                  }));
                  speakVietnamese('Sang trái');
                }
                blinkTimestamps.current = [];
              }
            }
          } else if (finalDuration >= 800 && finalDuration <= 1300) {
            // Chọn (SELECT) -> Nhắm giữ 0.8s - 1s rồi thả
            cooldownTimer.current = 500;
            triggerSelection();
            
            const selectedItem = grid[focusedRowRef.current][focusedColRef.current];
            const speakText = selectedItem ? `Chọn ${selectedItem.label}` : 'Chọn';

            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: `🎯 CHỌN (Nhắm giữ 0.8-1s) - ${new Date().toLocaleTimeString()}`,
              currentAction: 'NONE',
              actionProgress: 0
            }));
            speakVietnamese(speakText);
          } else if (finalDuration >= 1400 && finalDuration <= 2200) {
            // Xuống (DOWN) -> Nhắm giữ 1.5s - 2s rồi thả
            cooldownTimer.current = 500;
            navigateCursor('DOWN');
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: `⬇️ XUỐNG (Nhắm giữ 1.5-2s) - ${new Date().toLocaleTimeString()}`,
              currentAction: 'NONE',
              actionProgress: 0
            }));
            speakVietnamese('Xuống');
          } else if (finalDuration >= 2300) {
            // Lên (UP) -> Nhắm giữ 2.5s rồi thả
            cooldownTimer.current = 500;
            navigateCursor('UP');
            setTrackingState(prev => ({
              ...prev,
              lastActionTriggered: `⬆️ LÊN (Nhắm giữ 2.5s) - ${new Date().toLocaleTimeString()}`,
              currentAction: 'NONE',
              actionProgress: 0
            }));
            speakVietnamese('Lên');
          }
        }

        // Keep standard look state
        setTrackingState(prev => ({
          ...prev,
          rawEAR: metrics.avgEAR,
          directionH: 'CENTER',
          directionV: 'CENTER',
          currentAction: 'NONE',
          actionProgress: 0,
          faceDetected: true
        }));
      }
    }

    // Dynamically update debugging telemetry on panel
    const curHoldSecs = isEyesClosed.current && closeStartTime.current ? ((now - closeStartTime.current) / 1000).toFixed(2) : 0;
    setDebugLog([
      { label: 'Chỉ số EAR trung bình (Độ mở mắt)', value: metrics.avgEAR.toFixed(3) },
      { label: 'Ngưỡng Nhắm mắt (Calibrated)', value: calibration.blinkThreshold.toFixed(3) },
      { label: 'Thời gian Nhắm mắt hiện tại', value: `${curHoldSecs} giây` },
      { label: 'Số phát phát hiện Nháy mắt liên tiếp', value: `${blinkTimestamps.current.length} lần` },
      { label: 'Thời gian Phục hồi (Cooldown)', value: `${(cooldownTimer.current / 1000).toFixed(2)}s` },
      { label: 'Cử chỉ Chọn (SELECT)', value: 'Nháy mắt 1 lần' },
      { label: 'Khoảng nhắm giữ Xuống (DOWN)', value: '1.5 giây – 2.0 giây' },
      { label: 'Khoảng nhắm giữ Lên (UP)', value: '>= 2.5 giây' }
    ]);
  };

  return (
    <div id="eyetalk-dashboard" className="w-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50 dark:bg-slate-900 min-height-screen">
      
      {/* 1. Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-lg">
              <Eye className="w-6 h-6 animate-pulse" />
            </span>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              EyeTalk Assistant <span className="text-sm font-normal text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 px-3 py-1 rounded-full ml-2">v2.1</span>
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Giao diện bàn phím trực tiếp hỗ trợ giao tiếp cho người bại liệt, người già bị hạn chế vận động.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <button 
            id="btn-toggle-simulator"
            onClick={() => setSimulatorMode(!simulatorMode)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
              simulatorMode 
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900' 
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            {simulatorMode ? <Keyboard className="w-4 h-4" /> : <KeyboardOff className="w-4 h-4" />}
            <span>Giả lập bàn phím: {simulatorMode ? 'BẬT' : 'TẮT'}</span>
          </button>

          <button
            id="btn-toggle-camera"
            onClick={toggleCamera}
            className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg shadow-sm text-sm transition-all ${
              trackingState.cameraActive
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 dark:shadow-none'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{trackingState.cameraActive ? 'Tắt Camera' : 'Bật Camera'}</span>
          </button>

          <button
            id="btn-back-home"
            onClick={() => {
              stopTrackingLoop();
              onBackToHome();
            }}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 dark:text-slate-300 bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-all"
          >
            Quay lại trang chủ
          </button>
        </div>
      </div>

      {trackingState.cameraActive && !calibration.isCalibrated && calibrationStage === 'idle' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold">Hệ thống chưa được hiệu chỉnh mắt!</p>
              <p className="text-sm">Hãy thực hiện hiệu chỉnh để hướng nhìn của bạn khớp hoàn toàn với góc camera.</p>
            </div>
          </div>
          <button
            id="btn-start-calibration"
            onClick={startCalibration}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Hiệu Chỉnh Ngay</span>
          </button>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Webcam, Eye status, Debug panel */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Webcam Widget */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                <Camera className="w-4 h-4 text-indigo-500" />
                <span>Camera Nhận Diện Mắt</span>
              </div>
              
              {/* Dynamic Status Badges */}
              <div className="flex items-center gap-2">
                {trackingState.cameraActive ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full animate-pulse">
                    Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 rounded-full">
                    Off
                  </span>
                )}
                {trackingState.faceDetected ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full">
                    Có khuôn mặt
                  </span>
                ) : (
                  trackingState.cameraActive && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-full animate-bounce">
                      Tìm gương mặt...
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Video & Canvas Overlay Viewport */}
            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
              {!trackingState.cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-400 bg-slate-900/65">
                  <Camera className="w-12 h-12 mb-3 text-slate-600" />
                  <p className="font-semibold text-slate-200">Camera hiện đã tắt</p>
                  <p className="text-xs max-w-xs mt-1">Bấm nút "Bật Camera" ở góc trên để bắt đầu nhận diện chuyển động mắt của bạn.</p>
                  
                  {simulatorMode && (
                    <div className="mt-4 px-3 py-1.5 bg-amber-950/60 text-amber-300 rounded-lg text-xs border border-amber-900/50 flex items-center gap-1.5 animate-pulse">
                      <Keyboard className="w-3.5 h-3.5" />
                      Yêu cầu sử dụng các PHÍM MŨI TÊN & ENTER để điều khiển bàn phím giả lập.
                    </div>
                  )}
                </div>
              )}

              {/* Real HTML Video element */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
                style={{ display: trackingState.cameraActive ? 'block' : 'none' }}
              />

              {/* Dynamic canvas drawing over eyes tracker */}
              <canvas
                ref={canvasRef}
                className="absolute inset-x-0 inset-y-0 w-full h-full object-cover scale-x-[-1]"
                style={{ pointerEvents: 'none', display: trackingState.cameraActive ? 'block' : 'none' }}
              />

              {/* Calibration Floating Screen */}
              {calibrationStage !== 'idle' && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-6 text-white z-10">
                  {calibrationStage === 'countdown' && (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-rose-600 animate-ping mb-4" />
                      <div className="text-4xl font-black text-rose-500 mb-2">⏱️</div>
                      <p className="font-bold px-4 max-w-sm text-sm">{calibrationMessage}</p>
                    </motion.div>
                  )}

                  {calibrationStage === 'collecting' && (
                    <div className="w-full max-w-xs flex flex-col items-center">
                      {/* Active Red dot for patient eye tracking anchor */}
                      <div className="w-5 h-5 rounded-full bg-rose-600 border-4 border-white animate-pulse mb-6" />
                      <p className="font-bold text-rose-400 mb-1">Hãy nhìn thẳng vào chấm đỏ</p>
                      <p className="text-xs text-slate-300 mb-4">Không quay đầu, cố gắng giữ mắt mở tự nhiên</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                        <div 
                          className="bg-rose-500 h-full transition-all duration-75"
                          style={{ width: `${calibrationProgress}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 mt-2 font-mono">{calibrationProgress}% Hoàn thành</span>
                    </div>
                  )}

                  {calibrationStage === 'completed' && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
                      <p className="font-bold text-emerald-400 text-lg">{calibrationMessage}</p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Quick calibration option */}
            {trackingState.cameraActive && (
              <div className="mt-3 flex justify-between gap-2">
                <button
                  id="btn-recalibrate"
                  onClick={startCalibration}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Hiệu chỉnh lại mắt
                </button>
              </div>
            )}
          </div>

          {/* Current Eye Action HUD Progress */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Cử Chỉ Nhận Diện Bằng Mắt (Gaze-Straight)</span>
            </h2>

            {/* Current Eye Looks indicators split into State, consecutive Blinks, and Hold Duration */}
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Mở / Nhắm mắt</p>
                <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-1">
                  {trackingState.rawEAR < calibration.blinkThreshold ? '🔴 NHẮM MẮT' : '🟢 MỞ MẮT'}
                </p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Lượt Nháy (3.5s)</p>
                <p className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  ⚡ {blinkTimestamps.current.length} lần
                </p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Thời gian Nhắm</p>
                <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-1 font-mono">
                  ⏱️ {isEyesClosed.current && closeStartTime.current ? `${((Date.now() - closeStartTime.current) / 1000).toFixed(1)}s` : '0.0s'}
                </p>
              </div>
            </div>

            {/* Dynamic loading feedback for keeping hold of direction */}
            {trackingState.currentAction !== 'NONE' ? (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900 flex items-center gap-3">
                <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
                  {/* SVG Circle indicator */}
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle cx="24" cy="24" r="20" stroke="rgba(224, 231, 255, 1)" strokeWidth="4" fill="transparent" className="dark:stroke-slate-700" />
                    <circle 
                      cx="24" 
                      cy="24" 
                      r="20" 
                      stroke="rgba(79, 70, 229, 1)" 
                      strokeWidth="4" 
                      fill="transparent" 
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - trackingState.actionProgress / 100)}`}
                      className="transition-all duration-75 text-indigo-600"
                    />
                  </svg>
                  <span className="absolute text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400">
                    {trackingState.actionProgress}%
                  </span>
                </div>
                
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Nhắm giữ và mở ra để kích hoạt</p>
                  <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {trackingState.currentAction === 'SELECT' && '🎯 Thả ra để: CHỌN'}
                    {trackingState.currentAction === 'DOWN' && '👇 Thả ra để: XUỐNG HÀNG'}
                    {trackingState.currentAction === 'UP' && '👆 Thả ra để: LÊN HÀNG'}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {trackingState.currentAction === 'SELECT' && 'Giữ tiếp 1.5s để di chuyển xuống hàng...'}
                    {trackingState.currentAction === 'DOWN' && 'Giữ tiếp 2.5s để di chuyển lên hàng...'}
                    {trackingState.currentAction === 'UP' && 'Mở mắt ra ngay để kích hoạt đi Lên hàng!'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-center text-slate-500 dark:text-slate-400 flex items-center justify-center h-[74px]">
                <p className="text-xs">Đang chờ cử chỉ mắt từ bạn... (Nháy 1 lần = Chọn, Nháy 2 lần = Phải, Nháy 3 lần = Trái, Nhắm mắt giữ = Lên/Xuống)</p>
              </div>
            )}

            {/* Logs showing latest triggered and simulator helper */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-between text-xs text-slate-400">
              <span>Lịch sử thao tác:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">{trackingState.lastActionTriggered}</span>
            </div>
          </div>

          {/* Interactive Debug telemetry and parameters details */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
              <span>📊 Dữ Liệu Báo Cáo Chi Tiết</span>
            </h2>
            <div className="flex flex-col gap-2 font-mono text-xs text-slate-600 dark:text-slate-300">
              {debugLog.map((log, index) => (
                <div key={index} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/40">
                  <span className="text-slate-400">{log.label}:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{log.value}</span>
                </div>
              ))}
            </div>
            
            {simulatorMode && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
                <span className="font-bold block mb-1">🎮 Chế độ giả lập bàn phím:</span>
                Nhấn các nút <kbd className="px-1 py-0.5 bg-white dark:bg-slate-950 border rounded shadow font-sans">←</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-950 border rounded shadow font-sans">→</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-950 border rounded shadow font-sans">↑</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-950 border rounded shadow font-sans">↓</kbd> để di chuyển ô chọn ngay tức khắc, nhấn <kbd className="px-1 py-0.5 bg-white dark:bg-slate-950 border rounded shadow text-[10px] font-sans">Enter</kbd> để chọn phím đang tô đậm.
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Chat History, Composer, Virtual Keyboard */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Chat history list */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col max-h-[300px] min-h-[220px]">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 uppercase tracking-wider">
              Nội Dung Trò Chuyện (Gốc)
            </h2>
            
            {/* Scrollable chat body */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[140px]">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Chưa có tin nhắn nào. Bấm Gửi để bắt đầu nhắn.
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${
                      msg.sender === 'user' 
                        ? 'justify-end' 
                        : msg.sender === 'system' 
                          ? 'justify-center' 
                          : 'justify-start'
                    }`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm md:text-base ${
                        msg.sender === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none font-medium'
                          : msg.sender === 'system'
                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-950 dark:text-slate-400 text-xs text-center border border-slate-200/50 dark:border-slate-800'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100 rounded-bl-none'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <span>{msg.text}</span>
                          {msg.sender === 'user' && (
                            <button 
                              onClick={() => speakVietnamese(msg.text)} 
                              className="p-1 hover:bg-indigo-500 rounded bg-indigo-700/60 transition-all text-white"
                              title="Phát lại giọng nói"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] opacity-75 self-end mt-0.5">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Interactive Composer Editor */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-900">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1 shadow-sm">
              Ô NHẬP TIN NHẮN (BẢN THẢO)
            </p>
            
            <div className="flex items-center justify-between gap-4 py-2">
              <div className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-50 bg-transparent outline-none flex-1 break-all min-h-[44px] flex items-center pr-2">
                {draft === '' ? (
                  <span className="text-slate-300 dark:text-slate-600 selection:bg-indigo-200">
                    Bắt đầu chọn các chữ bên dưới...
                  </span>
                ) : (
                  <span className="relative">
                    {draft}
                    {/* Pulsing blinking cursor for patients validation */}
                    <span className="w-1.5 h-8 bg-indigo-500 inline-block animate-pulse absolute -right-2 ml-1" />
                  </span>
                )}
              </div>

              {draft !== '' && (
                <button
                  id="btn-keyboard-clear-inline"
                  onClick={() => setDraft('')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg text-sm font-semibold transition-all"
                >
                  Xóa hết
                </button>
              )}
            </div>
          </div>

          {/* 3. Combined Keyboard Grid (Quick phrases + Letters + Functions) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>BÀN PHÍM ĐIỀU KHIỂN BẰNG MẮT</span>
              <span className="text-xs text-indigo-500 font-semibold normal-case">
                Sử dụng cử chỉ Mắt hoặc các phím Mũi Tên và Enter để chọn
              </span>
            </h2>

            {/* Virtual Keyboard Matrix Grid Wrapper */}
            <div className="flex flex-col gap-3" id="vietnamese-virtual-keyboard-grid">
              {grid.map((rowItems, rowIndex) => {
                // If it's a Quick Phrase row (Rows 0 and 1)
                const isPhraseRow = rowIndex === 0 || rowIndex === 1;
                // If it's the action row (Row 7)
                const isActionRow = rowIndex === grid.length - 1;

                return (
                  <div 
                    key={rowIndex} 
                    className={`grid gap-2 ${
                      isPhraseRow 
                        ? 'grid-cols-2 md:grid-cols-4' 
                        : isActionRow 
                          ? 'grid-cols-1 md:grid-cols-3' 
                          : 'grid-cols-7'
                    }`}
                  >
                    {rowItems.map((item, colIndex) => {
                      const isFocused = focusedRow === rowIndex && focusedCol === colIndex;
                      
                      // Base typography size
                      let textClasses = 'text-center text-sm md:text-base font-bold';
                      let btnHeight = 'min-h-[50px] md:min-h-[60px]';

                      if (item.type === 'phrase') {
                        textClasses = 'text-left text-xs md:text-sm font-bold break-words px-2 py-1 leading-normal';
                        btnHeight = 'min-h-[60px] md:min-h-[70px]';
                      } else if (item.type === 'action') {
                        textClasses = 'text-center text-xs md:text-sm font-bold uppercase';
                        btnHeight = 'min-h-[55px] md:min-h-[64px]';
                      } else {
                        // Standard alphabetical key
                        textClasses = 'text-center text-xl md:text-2xl font-black uppercase';
                        btnHeight = 'min-h-[50px] md:min-h-[64px]';
                      }

                      // Default backgrounds
                      const defaultBg = item.colorClass 
                        ? item.colorClass
                        : item.type === 'phrase'
                          ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 dark:bg-slate-900 dark:hover:bg-slate-950/80 dark:text-indigo-200 border-indigo-200/60 dark:border-indigo-900/60'
                          : 'bg-white hover:bg-slate-100 text-slate-800 dark:bg-slate-700/60 dark:hover:bg-slate-700 dark:text-slate-100 border-slate-200 dark:border-slate-600/80';

                      return (
                        <button
                          key={item.id}
                          id={`btn-kb-key-${item.id}`}
                          onClick={() => {
                            // Enable intuitive pointing via mouse/touch as standard accessibility fallback
                            setFocusIndex({ row: rowIndex, col: colIndex });
                            triggerSelection();
                          }}
                          className={`
                            relative flex items-center justify-center border-2 rounded-xl transition-all duration-150 cursor-pointer select-none active:scale-95 ${btnHeight} ${defaultBg}
                            ${
                              isFocused 
                                ? 'scale-[1.03] -translate-y-1 shadow-lg ring-4 ring-indigo-500/40 border-indigo-600 z-10 bg-indigo-500 text-slate-950 dark:bg-indigo-600 dark:text-white dark:border-indigo-400 font-bold' 
                                : 'shadow-sm'
                            }
                          `}
                        >
                          <span className={`${isFocused ? 'text-white font-bold' : ''} ${textClasses}`}>
                            {item.label}
                          </span>

                          {/* Top loading bar indicator when holding action over this key */}
                          {isFocused && trackingState.currentAction === 'SELECT' && trackingState.actionProgress > 0 && (
                            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20 rounded-b-lg overflow-hidden">
                              <div 
                                className="bg-white h-full transition-all duration-75"
                                style={{ width: `${trackingState.actionProgress}%` }}
                              />
                            </div>
                          )}

                          {/* Miniature highlight badge */}
                          {isFocused && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Quick interactive shortcuts instruction guide for elderlies */}
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                💡 Cẩm nang cử chỉ Mắt (Nhìn thẳng màn hình):
              </span>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 leading-relaxed">
                <span className="flex items-center gap-1">➡️ <strong className="text-slate-700 dark:text-slate-200">Phải:</strong> Nháy mắt 2 lần trong 1.5 giây để di chuyển sang phải</span>
                <span className="flex items-center gap-1">⬅️ <strong className="text-slate-700 dark:text-slate-200">Trái:</strong> Nháy mắt 3 lần trong 3.5 giây để di chuyển sang trái</span>
                <span className="flex items-center gap-1">🎯 <strong className="text-slate-700 dark:text-slate-200">Chọn:</strong> Nháy mắt 1 lần để Chọn phím</span>
                <span className="flex items-center gap-1">👇 <strong className="text-slate-700 dark:text-slate-200">Xuống:</strong> Nhắm mắt 1.5–2 giây rồi mở ra để xuống hàng dưới</span>
                <span className="flex items-center gap-1">👆 <strong className="text-slate-700 dark:text-slate-200">Lên:</strong> Nhắm mắt từ 2.5 giây trở lên rồi mở ra để lên hàng trên</span>
              </div>
            </div>
            
          </div>

        </div>

      </div>

    </div>
  );
}
