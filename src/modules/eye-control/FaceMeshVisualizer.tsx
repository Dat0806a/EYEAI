import React, { useRef, useEffect, useState, memo, useCallback } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from './useEyeTracking';
import {
  LEFT_EYE_CONTOUR,
  RIGHT_EYE_CONTOUR,
  LEFT_IRIS_POINTS,
  RIGHT_IRIS_POINTS,
  FACE_OVAL_CONTOUR,
  LIPS_CONTOUR,
  NOSE_CONTOUR,
  LEFT_EYEBROW,
  RIGHT_EYEBROW,
  Point,
} from './eyeTracker';
import { X, RefreshCw, Eye, Compass, Rotate3d, Layers, ShieldCheck, Zap } from 'lucide-react';

interface FaceMeshVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FaceMeshVisualizer = memo(function FaceMeshVisualizer({
  isOpen,
  onClose,
}: FaceMeshVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { videoRef, startCalibration, calibrationStage, calibrationProgress } = useEyeTrackingSettings();
  const { trackingState } = useEyeTrackingTelemetry();

  // 3D Orbit view state
  const [orbitRotX, setOrbitRotX] = useState<number>(0);
  const [orbitRotY, setOrbitRotY] = useState<number>(0);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; rotX: number; rotY: number }>({
    x: 0,
    y: 0,
    rotX: 0,
    rotY: 0,
  });

  const animFrameRef = useRef<number | null>(null);

  // Mouse & Touch Orbit Controls
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: orbitRotX,
      rotY: orbitRotY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [orbitRotX, orbitRotY]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    // Map drag distance to rotation angles
    setOrbitRotY(dragStartRef.current.rotY + dx * 0.006);
    setOrbitRotX(Math.max(-0.8, Math.min(0.8, dragStartRef.current.rotX - dy * 0.006)));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, []);

  const handleResetOrbit = useCallback(() => {
    setOrbitRotX(0);
    setOrbitRotY(0);
  }, []);

  // Real-time Canvas Rendering Loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;

    const renderLoop = () => {
      if (!active) return;

      const ctx = canvas.getContext('2d');
      const video = videoRef.current;
      const w = canvas.width;
      const h = canvas.height;

      if (ctx) {
        // Deep modern space background
        ctx.fillStyle = '#0a0f1d';
        ctx.fillRect(0, 0, w, h);

        // Draw fine grid backdrop
        ctx.strokeStyle = 'rgba(106, 201, 240, 0.06)';
        ctx.lineWidth = 1;
        const gridSize = 24;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Access raw landmarks from window cache or provider ref
        const latestLandmarks: Point[] | undefined = (window as any).__eyeai_latest_landmarks;

        if (latestLandmarks && latestLandmarks.length >= 468) {
          // Center of face for 3D rotation pivot
          const nose = latestLandmarks[1] || { x: 0.5, y: 0.5, z: 0 };
          const pivotX = nose.x;
          const pivotY = nose.y;
          const pivotZ = nose.z || 0;

          const cosY = Math.cos(orbitRotY);
          const sinY = Math.sin(orbitRotY);
          const cosX = Math.cos(orbitRotX);
          const sinX = Math.sin(orbitRotX);

          // 3D projection function with perspective
          const project3D = (pt: Point): { x: number; y: number; z: number } => {
            if (!is3DMode) {
              return {
                x: (1 - pt.x) * w, // Mirrored for user intuition
                y: pt.y * h,
                z: pt.z,
              };
            }

            // Center around pivot
            let rx = (1 - pt.x) - (1 - pivotX);
            let ry = pt.y - pivotY;
            let rz = (pt.z || 0) - pivotZ;

            // Rotate around Y axis (yaw)
            const x1 = rx * cosY + rz * sinY;
            const z1 = -rx * sinY + rz * cosY;

            // Rotate around X axis (pitch)
            const y2 = ry * cosX - z1 * sinX;
            const z2 = ry * sinX + z1 * cosX;

            // Perspective factor
            const fov = 1.6;
            const factor = fov / (fov + z2 * 2.2);

            return {
              x: w / 2 + x1 * w * factor * 1.05,
              y: h / 2 + y2 * h * factor * 1.05,
              z: z2,
            };
          };

          // Draw Face Mesh Wireframe Tessellation
          const tessellation = (window as any).FACEMESH_TESSELLATION;
          if (tessellation && Array.isArray(tessellation)) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(74, 144, 226, 0.18)';
            ctx.lineWidth = 0.75;
            for (let i = 0; i < tessellation.length; i += 2) {
              const edge = tessellation[i];
              if (!edge) continue;
              const pA = latestLandmarks[edge[0]];
              const pB = latestLandmarks[edge[1]];
              if (pA && pB) {
                const a2 = project3D(pA);
                const b2 = project3D(pB);
                ctx.moveTo(a2.x, a2.y);
                ctx.lineTo(b2.x, b2.y);
              }
            }
            ctx.stroke();
          }

          // Helper to draw connected contour loops
          const drawContour = (indices: number[], color: string, lineWidth = 1.5, close = true) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            indices.forEach((idx, i) => {
              const pt = latestLandmarks[idx];
              if (pt) {
                const proj = project3D(pt);
                if (i === 0) ctx.moveTo(proj.x, proj.y);
                else ctx.lineTo(proj.x, proj.y);
              }
            });
            if (close) ctx.closePath();
            ctx.stroke();
          };

          // Draw Facial Contours
          drawContour(FACE_OVAL_CONTOUR, 'rgba(106, 201, 240, 0.35)', 1.2);
          drawContour(LIPS_CONTOUR, 'rgba(255, 111, 97, 0.4)', 1.2);
          drawContour(NOSE_CONTOUR, 'rgba(106, 201, 240, 0.45)', 1.2, false);
          drawContour(LEFT_EYEBROW, 'rgba(106, 201, 240, 0.6)', 1.5, false);
          drawContour(RIGHT_EYEBROW, 'rgba(106, 201, 240, 0.6)', 1.5, false);

          // Highlight Eye Contours (Vivid Cyan Glow)
          ctx.shadowColor = '#6AC9F0';
          ctx.shadowBlur = 10;
          drawContour(LEFT_EYE_CONTOUR, '#6AC9F0', 2.2);
          drawContour(RIGHT_EYE_CONTOUR, '#6AC9F0', 2.2);
          ctx.shadowBlur = 0;

          // Highlight Iris Contours & Pupil Centers (Vivid Coral Glow)
          ctx.shadowColor = '#FF6F61';
          ctx.shadowBlur = 12;
          drawContour(LEFT_IRIS_POINTS, '#FF6F61', 2.0);
          drawContour(RIGHT_IRIS_POINTS, '#FF6F61', 2.0);
          ctx.shadowBlur = 0;

          // Draw Pupil Centers & Crosshairs
          const leftPupil = project3D(latestLandmarks[468]);
          const rightPupil = project3D(latestLandmarks[473]);

          [leftPupil, rightPupil].forEach(pupil => {
            ctx.beginPath();
            ctx.arc(pupil.x, pupil.y, 4.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF6F61';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Pupil target reticle
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pupil.x - 9, pupil.y);
            ctx.lineTo(pupil.x + 9, pupil.y);
            ctx.moveTo(pupil.x, pupil.y - 9);
            ctx.lineTo(pupil.x, pupil.y + 9);
            ctx.stroke();
          });
        } else {
          // No face found state on canvas
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = '13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Đang đợi nhận diện khuôn mặt...', w / 2, h / 2);
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isOpen, orbitRotX, orbitRotY, is3DMode, trackingState.gazeX, trackingState.gazeY, videoRef]);

  if (!isOpen) return null;

  const {
    directionH,
    directionV,
    gazeX,
    gazeY,
    rawEAR,
    leftEAR,
    rightEAR,
    eyesClosed,
    blinkCount,
    cooldownRemainingMs,
    confidence,
    faceDetected,
  } = trackingState;

  // Active gaze label & visual styling
  let gazeDirectionLabel = 'CENTER';
  let gazeColor = 'text-slate-200';
  let gazeBg = 'bg-slate-800/80 border-slate-700';

  if (directionH === 'RIGHT') {
    gazeDirectionLabel = 'NHÌN PHẢI (RIGHT)';
    gazeColor = 'text-[#6AC9F0]';
    gazeBg = 'bg-[#6AC9F0]/15 border-[#6AC9F0]';
  } else if (directionH === 'LEFT') {
    gazeDirectionLabel = 'NHÌN TRÁI (LEFT)';
    gazeColor = 'text-[#6AC9F0]';
    gazeBg = 'bg-[#6AC9F0]/15 border-[#6AC9F0]';
  } else if (directionV === 'UP') {
    gazeDirectionLabel = 'NHÌN LÊN (UP)';
    gazeColor = 'text-[#6AC9F0]';
    gazeBg = 'bg-[#6AC9F0]/15 border-[#6AC9F0]';
  } else if (directionV === 'DOWN') {
    gazeDirectionLabel = 'NHÌN XUỐNG (DOWN)';
    gazeColor = 'text-[#6AC9F0]';
    gazeBg = 'bg-[#6AC9F0]/15 border-[#6AC9F0]';
  }

  const cooldownPercent = Math.max(0, Math.min(100, Math.round((cooldownRemainingMs / 2500) * 100)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mạng lưới khuôn mặt 3D & Hướng nhìn"
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-[#0a0f1d]/85 backdrop-blur-md select-none"
    >
      <div className="relative w-full max-w-4xl bg-[#11192e] border-2 border-[#6AC9F0]/40 rounded-[28px] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-[#0e1526] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#6AC9F0]/20 border border-[#6AC9F0]/50 flex items-center justify-center text-[#6AC9F0]">
              <Rotate3d className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-white font-black text-sm sm:text-base flex items-center gap-2">
                Mạng Lưới Khuôn Mặt 3D & Iris Tracking
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  REALTIME
                </span>
              </h2>
              <p className="text-slate-400 text-[11px]">
                Theo dõi mống mắt, độ lệch hướng nhìn & bù trừ chuyển động đầu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetOrbit}
              title="Đặt lại góc xoay 3D"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Góc Nhìn Gốc</span>
            </button>

            <button
              type="button"
              onClick={() => setIs3DMode(!is3DMode)}
              className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                is3DMode
                  ? 'bg-[#6AC9F0]/20 border-[#6AC9F0]/60 text-[#6AC9F0]'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{is3DMode ? 'Chế độ 3D' : 'Chế độ 2D'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer ml-1"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Canvas + Side Telemetry Panel */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0 overflow-hidden relative">
          {/* Main 3D Canvas Area */}
          <div className="md:col-span-2 relative bg-[#0a0f1d] flex items-center justify-center overflow-hidden min-h-[320px] sm:min-h-[420px]">
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="w-full h-full object-contain cursor-grab active:cursor-grabbing touch-none"
            />

            {/* Orbit Drag Tip */}
            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-full px-3 py-1 text-[10px] text-slate-300 pointer-events-none flex items-center gap-1.5">
              <Rotate3d className="w-3 h-3 text-[#6AC9F0]" />
              <span>Kéo chuột/chạm để xoay mô hình 3D</span>
            </div>

            {/* Real-time Gaze Direction Badge */}
            <div
              className={`absolute bottom-3 left-3 right-3 sm:right-auto px-4 py-2 rounded-2xl border backdrop-blur-md flex items-center gap-3 transition-all ${gazeBg}`}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hướng nhìn hiện tại
                </span>
                <span className={`text-sm sm:text-base font-black ${gazeColor}`}>
                  {gazeDirectionLabel}
                </span>
              </div>
              <div className="h-7 w-px bg-slate-700/80" />
              <div className="text-[11px] text-slate-300 flex flex-col">
                <span>ΔX: <strong className="text-[#6AC9F0] font-mono">{(gazeX >= 0 ? '+' : '') + gazeX.toFixed(2)}</strong></span>
                <span>ΔY: <strong className="text-[#6AC9F0] font-mono">{(gazeY >= 0 ? '+' : '') + gazeY.toFixed(2)}</strong></span>
              </div>
            </div>
          </div>

          {/* Right Telemetry & Control Panel */}
          <div className="bg-[#0e1526] border-t md:border-t-0 md:border-l border-slate-800 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Cooldown Status Progress */}
              <div className="bg-[#141d33] p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Bộ đếm Cooldown (2.5s)
                  </span>
                  <span className="font-mono text-white text-[11px]">
                    {cooldownRemainingMs > 0 ? `${cooldownRemainingMs}ms` : 'SẴN SÀNG'}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      cooldownRemainingMs > 0 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${cooldownPercent}%` }}
                  />
                </div>
              </div>

              {/* Blink & Eye State */}
              <div className="bg-[#141d33] p-3 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  Trạng thái mắt & Chớp mắt
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">Trạng thái</div>
                    <div className={`font-black text-xs ${eyesClosed ? 'text-[#FF6F61]' : 'text-emerald-400'}`}>
                      {eyesClosed ? 'MẮT NHẮM' : 'MẮT MỞ'}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">Chớp mắt</div>
                    <div className="font-black text-xs text-white">
                      {blinkCount === 1 ? '1 LẦN (Chờ nháy 2)' : blinkCount >= 2 ? '2 LẦN (Chọn)' : '0'}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">EAR Trái / Phải</div>
                    <div className="font-mono text-[11px] text-slate-200">
                      {leftEAR.toFixed(2)} / {rightEAR.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">Độ tin cậy (Score)</div>
                    <div className="font-mono text-[11px] text-emerald-400">
                      {Math.round(confidence * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Calibration Action */}
              <div className="bg-[#141d33] p-3 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Hiệu chuẩn người dùng
                  </span>
                  <button
                    type="button"
                    onClick={startCalibration}
                    disabled={calibrationStage !== 'idle'}
                    className="px-2.5 py-1 rounded-lg bg-[#6AC9F0] text-[#14213D] text-[11px] font-black hover:bg-[#86d7f7] active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${calibrationStage !== 'idle' ? 'animate-spin' : ''}`} />
                    <span>{calibrationStage === 'idle' ? 'Hiệu Chuẩn Ngay' : `${calibrationProgress}%`}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Nhìn thẳng vào tâm camera trong 2 giây để lưu mốc nhìn trung hòa của bạn.
                </p>
              </div>

              {/* Technical Disclaimer on 3D Depth */}
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#6AC9F0] flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Lưu ý kỹ thuật:</strong> Tọa độ chiều sâu Z được suy diễn tương đối từ mô hình hình học khuôn mặt MediaPipe, không phải phép đo độ sâu vật lý (LiDAR/ToF).
                </span>
              </div>
            </div>

            {/* Bottom Dismiss Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Đóng Trực Quan Hóa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
