import React, { useEffect, useRef, memo } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from './useEyeTracking';
import { Camera, AlertTriangle } from 'lucide-react';

interface CameraPreviewProps {
  className?: string;
  mirrored?: boolean;
  showOverlay?: boolean;
}

export const CameraPreview = memo(function CameraPreview({
  className = '',
  mirrored = true,
  showOverlay = true,
}: CameraPreviewProps) {
  const { cameraStream } = useEyeTrackingSettings();
  const { trackingState } = useEyeTrackingTelemetry();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (cameraStream) {
      if (video.srcObject !== cameraStream) {
        console.log('[EYE CAMERA] assigning srcObject to preview video');
        video.srcObject = cameraStream;
      }
      video.play().catch(err => {
        console.warn('[EYE CAMERA] preview video.play() warning:', err);
      });
    } else {
      video.srcObject = null;
    }
  }, [cameraStream, trackingState.cameraActive]);

  const { cameraActive, cameraError } = trackingState;

  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover ${mirrored ? 'transform -scale-x-100' : ''}`}
      />

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

      {cameraActive && showOverlay && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold tracking-wide select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </div>
      )}
    </div>
  );
});
