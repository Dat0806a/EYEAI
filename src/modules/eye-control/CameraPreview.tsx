import React, { useEffect, useRef, memo } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from './useEyeTracking';
import { Camera, AlertTriangle } from 'lucide-react';
import { LiveCameraOverlay } from './LiveCameraOverlay';

interface CameraPreviewProps {
  className?: string;
  mirrored?: boolean;
  showOverlay?: boolean;
  showStatusPill?: boolean;
}

/**
 * Thanh phan `CameraPreview`: Hien thi khung hinh webcam truc tiep cho nguoi suy giam.
 * - Dong bo luong video vao the `<video>` va ho tro lat guong (`mirrored`).
 * - Neu bat che do thieu sang, ve khung anh da tang cuong do sang gamma thay cho video goc.
 * - Tich hop `LiveCameraOverlay` de ve luoi diem mat MediaPipe theo thoi gian thuc.
 */
export const CameraPreview = memo(function CameraPreview({
  className = '',
  mirrored = true,
  showOverlay = true,
  showStatusPill = true,
}: CameraPreviewProps) {
  const { cameraStream, settings, processedCanvasRef } = useEyeTrackingSettings();
  const { trackingState } = useEyeTrackingTelemetry();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (cameraStream) {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      if (video.srcObject !== cameraStream) {
        console.log('[EYE CAMERA] assigning srcObject to preview video');
        video.srcObject = cameraStream;
      }
      video.play().catch(err => {
        console.warn('[EYE CAMERA] preview video.play() warning:', err);
      });
    } else {
      try {
        video.pause();
      } catch {}
      video.srcObject = null;
    }
  }, [cameraStream, trackingState.cameraActive]);

  const { cameraActive, cameraError } = trackingState;
  const isLowLightPreviewActive = Boolean(settings.lowLightFilterEnabled && cameraActive);

  useEffect(() => {
    const video = videoRef.current;
    if (!isLowLightPreviewActive) {
      previewCtxRef.current = null;
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.opacity = '0';
      }
      if (video) {
        video.style.opacity = '1';
      }
      return;
    }

    let animId = 0;
    let active = true;

    const syncProcessedPreview = () => {
      if (!active) return;
      const targetCanvas = previewCanvasRef.current;
      const sourceCanvas = processedCanvasRef.current;
      const vid = videoRef.current;

      if (targetCanvas && sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        if (targetCanvas.width !== sourceCanvas.width || targetCanvas.height !== sourceCanvas.height) {
          targetCanvas.width = sourceCanvas.width;
          targetCanvas.height = sourceCanvas.height;
          previewCtxRef.current = targetCanvas.getContext('2d');
        }
        const ctx = previewCtxRef.current ?? targetCanvas.getContext('2d');
        if (ctx) {
          previewCtxRef.current = ctx;
          ctx.drawImage(sourceCanvas, 0, 0);
          targetCanvas.style.opacity = '1';
          if (vid) {
            vid.style.opacity = '0';
          }
        }
      } else {
        if (targetCanvas) {
          targetCanvas.style.opacity = '0';
        }
        if (vid) {
          vid.style.opacity = '1';
        }
      }

      animId = requestAnimationFrame(syncProcessedPreview);
    };

    // Paint immediately if a processed frame is already available, then keep syncing at rAF
    syncProcessedPreview();
    return () => {
      active = false;
      cancelAnimationFrame(animId);
      previewCtxRef.current = null;
      if (videoRef.current) {
        videoRef.current.style.opacity = '1';
      }
    };
  }, [isLowLightPreviewActive, processedCanvasRef]);

  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover ${mirrored ? 'transform -scale-x-100' : ''}`}
      />

      {isLowLightPreviewActive && (
        <canvas
          ref={previewCanvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none opacity-0 ${mirrored ? 'transform -scale-x-100' : ''}`}
          aria-hidden="true"
        />
      )}

      {/* Real-time 3D Face Mesh & Iris Tracking Canvas Overlay */}
      {cameraActive && showOverlay && (
        <LiveCameraOverlay videoElement={videoRef.current} mirrored={mirrored} />
      )}

      {!cameraActive && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-slate-900/90 text-white text-xs text-center select-none">
          <Camera className="w-6 h-6 text-[#6AC9F0] animate-pulse mb-1.5" />
          <span className="font-semibold text-slate-300">Camera đang tắt</span>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-rose-950/90 text-white text-xs text-center select-none">
          <AlertTriangle className="w-6 h-6 text-[#FF6F61] mb-1.5" />
          <span className="font-bold text-[#FF6F61] mb-1">Lỗi Camera</span>
          <span className="text-[11px] text-rose-200 line-clamp-2">{cameraError}</span>
        </div>
      )}

      {cameraActive && showOverlay && showStatusPill && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold tracking-wide select-none backdrop-blur-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE AI
        </div>
      )}
    </div>
  );
});
