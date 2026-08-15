import React, { useRef, useEffect, memo } from 'react';

export const AuthBackgroundVideo = memo(function AuthBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const attemptPlay = () => {
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      const promise = video.play();
      if (promise && typeof promise.then === 'function') {
        promise.catch((err) => {
          console.warn('[AuthBackgroundVideo] Autoplay waiting for interaction:', err);
        });
      }
    };

    attemptPlay();

    const handleInteraction = () => {
      attemptPlay();
    };

    window.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', handleInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', handleInteraction, { capture: true, passive: true });
    window.addEventListener('click', handleInteraction, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleInteraction, { capture: true });
      window.removeEventListener('touchstart', handleInteraction, { capture: true });
      window.removeEventListener('keydown', handleInteraction, { capture: true });
      window.removeEventListener('click', handleInteraction, { capture: true });
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden select-none">
      {/* Real High Quality Login/Register Animated Video Background */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={(e) => {
          e.currentTarget.muted = true;
          e.currentTarget.play().catch(() => {});
        }}
        onLoadedData={(e) => {
          e.currentTarget.muted = true;
          e.currentTarget.play().catch(() => {});
        }}
        onLoadedMetadata={(e) => {
          e.currentTarget.muted = true;
          e.currentTarget.play().catch(() => {});
        }}
        style={{
          filter: 'contrast(1.04) saturate(1.06) brightness(1.01)',
        }}
        className="w-full h-full object-fill pointer-events-none select-none"
        src="/login_register.mp4"
      />
    </div>
  );
});
