import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export interface SplashScreenProps {
  isPreloadComplete: boolean;
  preloadProgress: number; // 0 - 100
  preloadStatusText?: string;
  preloadError?: string | null;
  onRetryPreload?: () => void;
  onSplashFinished: () => void;
}

export function SplashScreen({
  isPreloadComplete,
  preloadProgress,
  preloadStatusText = 'Đang chuẩn bị...',
  preloadError = null,
  onRetryPreload,
  onSplashFinished,
}: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const hasTriggeredFinishedRef = useRef<boolean>(false);

  // Smooth numeric display
  const displayProgress = preloadError ? 0 : Math.min(100, Math.max(0, preloadProgress));
  const isReadyToContinue = (isPreloadComplete || displayProgress >= 100) && !preloadError;

  const handleContinue = useCallback(() => {
    if (hasTriggeredFinishedRef.current) return;
    hasTriggeredFinishedRef.current = true;
    if (import.meta.env.DEV) {
      console.log('[SPLASH] User triggered splash screen exit.');
    }
    setIsFadingOut(true);
    setTimeout(() => {
      onSplashFinished();
    }, 350);
  }, [onSplashFinished]);

  // Play video with autoplay fallback
  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    const promise = video.play();
    if (promise && typeof promise.then === 'function') {
      promise.catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[SPLASH][VIDEO] Autoplay deferred / waiting for interaction:', err);
        }
      });
    }
  }, []);

  useEffect(() => {
    attemptPlay();

    const handleUserInteraction = () => {
      attemptPlay();
      if (isReadyToContinue) {
        handleContinue();
      }
    };

    window.addEventListener('pointerdown', handleUserInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', handleUserInteraction, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction, { capture: true });
      window.removeEventListener('touchstart', handleUserInteraction, { capture: true });
      window.removeEventListener('keydown', handleUserInteraction, { capture: true });
    };
  }, [attemptPlay, isReadyToContinue, handleContinue]);

  const handleVideoError = () => {
    console.warn('[SPLASH][VIDEO] Video failed to load or play. Activating fallback background.');
    setVideoError(true);
  };

  return (
    <div
      onClick={() => {
        if (isReadyToContinue) {
          handleContinue();
        }
      }}
      className={`fixed inset-0 w-[100dvw] h-[100dvh] z-[9999] overflow-hidden select-none bg-[#7AD5F8] pointer-events-auto transition-opacity duration-400 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      } ${isReadyToContinue ? 'cursor-pointer' : ''}`}
      style={{
        margin: 0,
        padding: 0,
      }}
    >
      {/* 1. Fullscreen Splash Video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={attemptPlay}
        onLoadedData={attemptPlay}
        onError={handleVideoError}
        style={{
          filter: 'contrast(1.04) saturate(1.06) brightness(1.02)',
          objectPosition: '50% 50%',
        }}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          videoError ? 'opacity-0' : 'opacity-100'
        }`}
        src="/login.mp4"
      />

      {/* Fallback Ambient Gradient in case video is loading or failed */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          videoError ? 'opacity-100' : 'opacity-20'
        }`}
        style={{
          background: 'linear-gradient(180deg, #7AD5F8 0%, #6AC9F0 40%, #FFF2D6 100%)',
        }}
      />

      {/* Subtle bottom vignette for UI contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent 55%, rgba(10, 25, 47, 0.4) 85%, rgba(10, 25, 47, 0.7) 100%)',
        }}
      />

      {/* 2. Splash UI Container - Bottom Center */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center w-[75vw] max-w-[360px] px-2 z-30"
        style={{
          bottom: 'calc(12vh + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <AnimatePresence mode="wait">
          {preloadError ? (
            /* Error & Retry State */
            <motion.div
              key="splash-error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 bg-[#14213D]/85 backdrop-blur-md text-white p-4 rounded-2xl border border-white/20 shadow-xl text-center w-full"
            >
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <AlertCircle className="w-5 h-5" />
                <span>Không thể tải ứng dụng</span>
              </div>
              <p className="text-xs text-white/80">{preloadError}</p>
              {onRetryPreload && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryPreload();
                  }}
                  className="mt-1 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#F6C445] text-[#14213D] font-extrabold text-xs shadow-md hover:bg-[#FFD45C] active:scale-95 transition-transform"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Thử lại</span>
                </button>
              )}
            </motion.div>
          ) : isReadyToContinue ? (
            /* Ready State: Prompt "Bấm để tiếp tục" replacing the progress bar */
            <motion.div
              key="splash-continue"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full flex flex-col items-center gap-2 select-none cursor-pointer"
            >
              <motion.div
                animate={{ opacity: [0.75, 1, 0.75], scale: [0.98, 1.03, 0.98] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                className="w-full py-3 px-6 rounded-2xl bg-[#14213D]/80 backdrop-blur-md border border-[#F6C445]/60 shadow-[0_6px_25px_rgba(246,196,69,0.35)] text-center flex items-center justify-center gap-2"
              >
                <span className="text-[#F6C445] font-black text-sm sm:text-base tracking-wider uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  Bấm để tiếp tục
                </span>
              </motion.div>
              <p className="text-[11px] sm:text-xs font-bold text-white/90 tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
                Chạm vào màn hình để bắt đầu
              </p>
            </motion.div>
          ) : (
            /* Loading State: Clean Minimal Yellow Loading Bar */
            <motion.div
              key="splash-loader"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center gap-2"
            >
              {/* Progress Percentage Badge */}
              <div className="flex items-center justify-center">
                <span className="text-white font-black text-xs sm:text-sm tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                  {displayProgress}%
                </span>
              </div>

              {/* Loader Track with Translucent Glass */}
              <div className="w-full h-2 sm:h-2.5 rounded-full bg-white/30 backdrop-blur-xs p-[1px] border border-white/25 shadow-[0_2px_10px_rgba(0,0,0,0.2)] overflow-hidden">
                {/* Yellow Progress Fill */}
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${displayProgress}%`,
                    backgroundColor: '#F6C445',
                    backgroundImage: 'linear-gradient(90deg, #F6C445 0%, #FFD45C 50%, #F6C445 100%)',
                    boxShadow: '0 0 10px rgba(246, 196, 69, 0.85), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
                  }}
                />
              </div>

              {/* Status Caption */}
              <div className="flex items-center justify-center min-h-[20px] mt-0.5">
                <p className="text-[11px] sm:text-xs font-extrabold text-white/95 tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                  {preloadStatusText || 'Đang chuẩn bị...'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

