/**
 * Video Cache & Chained Preloader Service for Netlify & Modern Web Browsers
 * Solves MP4 stuttering, video frame loss, and cache stale issues by pre-buffering videos as Blob URLs.
 */

// Cache-busting version key to invalidate old browser disk cache whenever videos are updated
export const VIDEO_CACHE_VERSION = '2026.08.15.v2';

class VideoCacheManager {
  private cacheMap = new Map<
    string,
    {
      blobUrl: string | null;
      status: 'idle' | 'loading' | 'loaded' | 'error';
      promise?: Promise<string>;
    }
  >();

  private videoElementCache = new Map<string, HTMLVideoElement>();

  /**
   * Appends a cache-busting version query string to force fresh fetches on new deployments.
   */
  public getVersionedUrl(url: string): string {
    if (!url) return url;
    if (url.startsWith('blob:') || url.includes('?v=')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${VIDEO_CACHE_VERSION}`;
  }

  /**
   * Preloads a video file via fetch into an Object URL (Blob) and warms up the video decoder buffer.
   */
  public preloadVideo(rawUrl: string): Promise<string> {
    const url = this.getVersionedUrl(rawUrl);

    const existing = this.cacheMap.get(url);
    if (existing) {
      if (existing.status === 'loaded' && existing.blobUrl) {
        return Promise.resolve(existing.blobUrl);
      }
      if (existing.status === 'loading' && existing.promise) {
        return existing.promise;
      }
    }

    if (typeof window === 'undefined') {
      return Promise.resolve(url);
    }

    const promise = (async () => {
      this.cacheMap.set(url, { blobUrl: null, status: 'loading' });

      try {
        if (import.meta.env.DEV) {
          console.log(`[VideoCacheManager] Preloading versioned video: ${url}`);
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch video ${url}: HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Warm up HTMLVideoElement in background DOM to prime GPU decoder
        const videoEl = document.createElement('video');
        videoEl.preload = 'auto';
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.src = blobUrl;
        videoEl.load();

        this.videoElementCache.set(url, videoEl);

        this.cacheMap.set(url, {
          blobUrl,
          status: 'loaded',
        });

        if (import.meta.env.DEV) {
          console.log(`[VideoCacheManager] Successfully cached & warmed blob: ${url} -> ${blobUrl}`);
        }

        return blobUrl;
      } catch (err) {
        console.warn(`[VideoCacheManager] Fetch preload failed for ${url}, falling back to versioned URL:`, err);
        this.cacheMap.set(url, {
          blobUrl: url,
          status: 'error',
        });
        return url;
      }
    })();

    this.cacheMap.set(url, {
      blobUrl: null,
      status: 'loading',
      promise,
    });

    return promise;
  }

  /**
   * Returns the preloaded Blob URL if available, otherwise returns the versioned URL.
   */
  public getCachedVideoUrl(rawUrl: string): string {
    const url = this.getVersionedUrl(rawUrl);
    const entry = this.cacheMap.get(url);
    if (entry && entry.status === 'loaded' && entry.blobUrl) {
      return entry.blobUrl;
    }
    return url;
  }

  /**
   * Clear all active Object URLs and reset memory cache map.
   */
  public clearCache(): void {
    this.cacheMap.forEach((entry) => {
      if (entry.blobUrl && entry.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(entry.blobUrl);
      }
    });
    this.cacheMap.clear();
    this.videoElementCache.clear();
    if (import.meta.env.DEV) {
      console.log('[VideoCacheManager] Cleared all blob video memory caches.');
    }
  }

  /**
   * Chained Preload Stage 1: Call while Splash Video is running to preload Auth Video.
   */
  public preloadLoginRegisterVideo(): Promise<string> {
    return this.preloadVideo('/login_register.mp4');
  }

  /**
   * Chained Preload Stage 2: Call while Auth Video is running to preload BG Video.
   */
  public preloadBgVideo(): Promise<string> {
    return this.preloadVideo('/bg.mp4');
  }
}

export const videoCacheManager = new VideoCacheManager();
