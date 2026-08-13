import React, { useRef, useEffect, useState, memo } from 'react';

const FADE_DURATION_MS = 800; // 800ms smooth optical crossfade

export const BackgroundVideo = memo(function BackgroundVideo() {
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  const [activeVideo, setActiveVideo] = useState<'A' | 'B'>('A');
  const [hasBufferBLoaded, setHasBufferBLoaded] = useState(false);
  const activeVideoRef = useRef<'A' | 'B'>('A');

  // Sync ref with active state
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  }, [activeVideo]);

  useEffect(() => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;

    const attemptPlay = (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      const promise = video.play();
      if (promise && typeof promise.then === 'function') {
        promise.catch((err) => {
          console.warn('[BackgroundVideo] Autoplay waiting for user interaction:', err);
        });
      }
    };

    // Force play Video A immediately on mount
    if (vA) {
      attemptPlay(vA);
    }

    // Lazy-load Buffer B source after 2s so Buffer A gets 100% network bandwidth on first open
    const lazyTimer = setTimeout(() => {
      setHasBufferBLoaded(true);
    }, 2000);

    // Seamless loop crossfade checker
    const interval = setInterval(() => {
      const currentActive = activeVideoRef.current;
      const currentVideo = currentActive === 'A' ? vA : vB;
      const nextVideo = currentActive === 'A' ? vB : vA;

      if (!currentVideo || !nextVideo || !currentVideo.duration) return;

      const fadeTimeSec = FADE_DURATION_MS / 1000;
      const endTime = Math.max(0.5, currentVideo.duration - fadeTimeSec);

      // Trigger crossfade when current video reaches the end boundary
      if (currentVideo.currentTime >= endTime && currentVideo.currentTime > 0.5) {
        nextVideo.currentTime = 0;
        attemptPlay(nextVideo);

        const nextBuffer = currentActive === 'A' ? 'B' : 'A';
        setActiveVideo(nextBuffer);

        setTimeout(() => {
          currentVideo.pause();
          currentVideo.currentTime = 0;
        }, FADE_DURATION_MS);
      }
    }, 150);

    // Interaction fallback listeners
    const handleInteraction = () => {
      const active = activeVideoRef.current === 'A' ? vA : vB;
      attemptPlay(active);
    };

    window.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', handleInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', handleInteraction, { capture: true, passive: true });

    return () => {
      clearTimeout(lazyTimer);
      clearInterval(interval);
      window.removeEventListener('pointerdown', handleInteraction, { capture: true });
      window.removeEventListener('touchstart', handleInteraction, { capture: true });
      window.removeEventListener('keydown', handleInteraction, { capture: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden select-none">
      {/* Video Buffer A - Primary Instant Load Buffer */}
      <video
        ref={videoRefA}
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
        style={{
          transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          filter: 'contrast(1.1) brightness(1.05) saturate(1.05)',
        }}
        className={`absolute inset-0 w-full h-full object-cover ${
          activeVideo === 'A' ? 'opacity-100' : 'opacity-0'
        }`}
        src="/bg.mp4"
      />

      {/* Video Buffer B - Secondary Buffer (Loaded lazily after Buffer A is active) */}
      <video
        ref={videoRefB}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={(e) => {
          e.currentTarget.muted = true;
        }}
        style={{
          transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          filter: 'contrast(1.1) brightness(1.05) saturate(1.05)',
        }}
        className={`absolute inset-0 w-full h-full object-cover ${
          activeVideo === 'B' ? 'opacity-100' : 'opacity-0'
        }`}
        src={hasBufferBLoaded ? "/bg.mp4" : undefined}
      />

      {/* 38% Soft Warm Overlay for UI readability & enhanced video clarity */}
      <div className="absolute inset-0 bg-[#FFF2D6]/38" />
    </div>
  );
});
