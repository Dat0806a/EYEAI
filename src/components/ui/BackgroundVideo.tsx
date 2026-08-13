import React, { useRef, useEffect, useState, memo } from 'react';

const FADE_DURATION_MS = 800; // 800ms smooth optical crossfade

export const BackgroundVideo = memo(function BackgroundVideo() {
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  const [activeVideo, setActiveVideo] = useState<'A' | 'B'>('A');
  const activeVideoRef = useRef<'A' | 'B'>('A');

  // Sync ref with active state
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  }, [activeVideo]);

  useEffect(() => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;
    if (!vA || !vB) return;

    let isCrossfading = false;

    // Start Video A from beginning
    vA.currentTime = 0;
    vA.play().catch(() => {});

    // Pre-seek Video B
    vB.currentTime = 0;
    vB.pause();

    const interval = setInterval(() => {
      const currentActive = activeVideoRef.current;
      const currentVideo = currentActive === 'A' ? vA : vB;
      const nextVideo = currentActive === 'A' ? vB : vA;

      if (!currentVideo || !nextVideo || !currentVideo.duration) return;

      const fadeTimeSec = FADE_DURATION_MS / 1000;
      const endTime = Math.max(0.5, currentVideo.duration - fadeTimeSec);

      // Trigger crossfade when current video reaches the end boundary
      if (currentVideo.currentTime >= endTime && !isCrossfading && currentVideo.currentTime > 0.5) {
        isCrossfading = true;

        // Pre-roll and start next video
        nextVideo.currentTime = 0;
        nextVideo.play().catch(() => {});

        // Switch active buffer for smooth CSS crossfade
        const nextBuffer = currentActive === 'A' ? 'B' : 'A';
        setActiveVideo(nextBuffer);

        // Reset the previous video once crossfade completes
        setTimeout(() => {
          currentVideo.pause();
          currentVideo.currentTime = 0;
          isCrossfading = false;
        }, FADE_DURATION_MS);
      }
    }, 150);

    // Resume video if page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const active = activeVideoRef.current === 'A' ? vA : vB;
        if (active && active.paused) {
          active.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden select-none">
      {/* Video Buffer A */}
      <video
        ref={videoRefA}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          filter: 'contrast(1.1) brightness(1.05) saturate(1.05)',
        }}
        className={`absolute inset-0 w-full h-full object-cover ${
          activeVideo === 'A' ? 'opacity-100' : 'opacity-0'
        }`}
        src="/bg.mp4?v=20260813_v5"
      />

      {/* Video Buffer B */}
      <video
        ref={videoRefB}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          filter: 'contrast(1.1) brightness(1.05) saturate(1.05)',
        }}
        className={`absolute inset-0 w-full h-full object-cover ${
          activeVideo === 'B' ? 'opacity-100' : 'opacity-0'
        }`}
        src="/bg.mp4?v=20260813_v5"
      />

      {/* 38% Soft Warm Overlay for UI readability & enhanced video clarity */}
      <div className="absolute inset-0 bg-[#FFF2D6]/38" />
    </div>
  );
});
