import React, { useRef, useEffect, memo } from 'react';
import { useEyeTrackingSettings, useEyeTrackingTelemetry } from './useEyeTracking';
import {
  FACIAL_TESSELLATION_LINES,
  FACE_OVAL_CONTOUR,
  NOSE_CONTOUR,
  LIPS_CONTOUR,
  LEFT_EYEBROW,
  RIGHT_EYEBROW,
  LEFT_EYE_CONTOUR,
  RIGHT_EYE_CONTOUR,
  LEFT_IRIS_POINTS,
  RIGHT_IRIS_POINTS,
  EYE_INDICES,
  Point,
} from './eyeTracker';

interface LiveCameraOverlayProps {
  className?: string;
  videoElement: HTMLVideoElement | null;
  mirrored?: boolean;
}

export const LiveCameraOverlay = memo(function LiveCameraOverlay({
  className = '',
  videoElement,
  mirrored = true,
}: LiveCameraOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { overlaySettings } = useEyeTrackingSettings();
  const { trackingState } = useEyeTrackingTelemetry();

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Sync canvas dimensions with display size (and handle devicePixelRatio for retina crispness)
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.round(rect.width);
      const displayH = Math.round(rect.height);

      if (displayW === 0 || displayH === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayW, displayH);

      // Access latest face mesh landmarks cached globally from tracking pipeline
      const landmarks: Point[] | undefined = (window as any).__eyeai_latest_landmarks;

      if (!landmarks || landmarks.length < 468 || !trackingState.faceDetected) {
        ctx.restore();
        animId = requestAnimationFrame(render);
        return;
      }

      // Calculate object-fit: cover mapping
      // Video source dimensions
      const vidW = videoElement && videoElement.videoWidth > 0 ? videoElement.videoWidth : 640;
      const vidH = videoElement && videoElement.videoHeight > 0 ? videoElement.videoHeight : 480;

      const scale = Math.max(displayW / vidW, displayH / vidH);
      const renderedW = vidW * scale;
      const renderedH = vidH * scale;
      const offsetX = (displayW - renderedW) / 2;
      const offsetY = (displayH - renderedH) / 2;

      // Coordinate projection function
      const project = (pt: Point): { x: number; y: number } => {
        let normX = pt.x;
        if (mirrored) {
          normX = 1 - pt.x;
        }
        return {
          x: offsetX + normX * renderedW,
          y: offsetY + pt.y * renderedH,
        };
      };

      // 1. Draw Futuristic Face Mesh Lines
      if (overlaySettings.showMesh) {
        ctx.strokeStyle = 'rgba(106, 201, 240, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < FACIAL_TESSELLATION_LINES.length; i++) {
          const [i1, i2] = FACIAL_TESSELLATION_LINES[i];
          const p1 = landmarks[i1];
          const p2 = landmarks[i2];
          if (p1 && p2) {
            const sc1 = project(p1);
            const sc2 = project(p2);
            ctx.moveTo(sc1.x, sc1.y);
            ctx.lineTo(sc2.x, sc2.y);
          }
        }
        ctx.stroke();

        // Draw Face Oval Perimeter
        const drawContour = (indices: number[], color: string, width = 1) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          indices.forEach((idx, i) => {
            const pt = landmarks[idx];
            if (pt) {
              const sc = project(pt);
              if (i === 0) ctx.moveTo(sc.x, sc.y);
              else ctx.lineTo(sc.x, sc.y);
            }
          });
          ctx.stroke();
        };

        drawContour(FACE_OVAL_CONTOUR, 'rgba(106, 201, 240, 0.35)', 1.2);
        drawContour(NOSE_CONTOUR, 'rgba(106, 201, 240, 0.35)', 1);
        drawContour(LIPS_CONTOUR, 'rgba(255, 111, 97, 0.35)', 1);
        drawContour(LEFT_EYEBROW, 'rgba(106, 201, 240, 0.45)', 1.2);
        drawContour(RIGHT_EYEBROW, 'rgba(106, 201, 240, 0.45)', 1.2);
      }

      // 2. Draw Eye Contours
      if (overlaySettings.showEyes) {
        const drawClosedContour = (indices: number[], strokeColor: string, fillColor?: string) => {
          ctx.beginPath();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1.6;
          indices.forEach((idx, i) => {
            const pt = landmarks[idx];
            if (pt) {
              const sc = project(pt);
              if (i === 0) ctx.moveTo(sc.x, sc.y);
              else ctx.lineTo(sc.x, sc.y);
            }
          });
          ctx.closePath();
          if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
          }
          ctx.stroke();
        };

        // Eye Contours with subtle glow
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 4;
        drawClosedContour(LEFT_EYE_CONTOUR, 'rgba(56, 189, 248, 0.9)', 'rgba(56, 189, 248, 0.08)');
        drawClosedContour(RIGHT_EYE_CONTOUR, 'rgba(56, 189, 248, 0.9)', 'rgba(56, 189, 248, 0.08)');
        ctx.shadowBlur = 0;

        // Draw Canthi Crosshair Anchors
        const canthiIndices = [EYE_INDICES.leftOuter, EYE_INDICES.leftInner, EYE_INDICES.rightInner, EYE_INDICES.rightOuter];
        ctx.fillStyle = '#38bdf8';
        canthiIndices.forEach(idx => {
          const pt = landmarks[idx];
          if (pt) {
            const sc = project(pt);
            ctx.fillRect(sc.x - 1.5, sc.y - 1.5, 3, 3);
          }
        });
      }

      // 3. Draw Iris Boundaries & Pupil Centers
      if (overlaySettings.showIris) {
        const drawIrisRing = (indices: number[]) => {
          ctx.beginPath();
          ctx.strokeStyle = '#FF6F61';
          ctx.lineWidth = 1.4;
          indices.forEach((idx, i) => {
            const pt = landmarks[idx];
            if (pt) {
              const sc = project(pt);
              if (i === 0) ctx.moveTo(sc.x, sc.y);
              else ctx.lineTo(sc.x, sc.y);
            }
          });
          ctx.closePath();
          ctx.stroke();
        };

        drawIrisRing(LEFT_IRIS_POINTS);
        drawIrisRing(RIGHT_IRIS_POINTS);

        // Pupil Center Dots with Neon Glow
        const leftIrisCenter = landmarks[EYE_INDICES.leftIris];
        const rightIrisCenter = landmarks[EYE_INDICES.rightIris];

        const drawPupilDot = (pt: Point | undefined) => {
          if (!pt) return;
          const sc = project(pt);
          // Outer halo
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 111, 97, 0.35)';
          ctx.fill();

          // Center solid point
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = '#FF6F61';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        };

        drawPupilDot(leftIrisCenter);
        drawPupilDot(rightIrisCenter);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [overlaySettings, mirrored, videoElement, trackingState.faceDetected]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none w-full h-full ${className}`}
      aria-hidden="true"
    />
  );
});
