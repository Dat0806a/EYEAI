import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { YouTubePlayerView } from '../../modules/entertainment/YouTubePlayerView';
import { useGeolocation } from '../../modules/location/useGeolocation';
import {
  readDevicePermissions,
  writeDevicePermissions,
} from '../../modules/permissions/devicePermissions';
import {
  SECURITY_CSP_POLICY,
  applyBrowserSecurityHeaders,
} from '../../../server/securityMiddleware';
import entSearchV2 from '../../../netlify/functions/entertainment-search';

vi.mock('../../utils/speech', () => ({
  speakVietnamese: vi.fn(),
  stopSpeech: vi.fn(),
  isSpeechSupported: () => true,
}));

vi.mock('../../modules/eye-control/EyeFocusable', () => ({
  EyeFocusable: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Impaired Experience Video & GPS Fixes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as any).YT;
    delete (window as any).onYouTubeIframeAPIReady;
  });

  it('sets strict-origin-when-cross-origin Referrer-Policy and allows Google Maps embed frames in CSP', () => {
    const headers: Record<string, string> = {};
    const resMock: any = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    const nextFn = vi.fn();
    applyBrowserSecurityHeaders({} as any, resMock, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(SECURITY_CSP_POLICY).toContain('https://www.google.com');
    expect(SECURITY_CSP_POLICY).toContain('https://maps.gstatic.com');
    expect(SECURITY_CSP_POLICY).toContain('https://www.youtube-nocookie.com');
    expect(SECURITY_CSP_POLICY).toContain('https://www.youtube.com');
  });

  it('renders YouTubePlayerView iframe with strict-origin-when-cross-origin, origin param, and falls back to youtube.com on embed error', async () => {
    let capturedHandlers: any = null;
    (window as any).YT = {
      Player: class MockYTPlayer {
        constructor(_el: any, opts: any) {
          capturedHandlers = opts.events;
        }
        destroy = vi.fn();
      },
    };

    render(
      <YouTubePlayerView
        item={{
          videoId: 'dQw4w9WgXcQ',
          title: 'Video kiểm tra',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          channelTitle: 'Kênh Test',
          publishedAt: '2026-01-01T00:00:00Z',
          description: 'Mô tả',
        }}
        onBack={vi.fn()}
      />
    );

    const iframe = screen.getByTitle('Video kiểm tra') as HTMLIFrameElement;
    expect(iframe.getAttribute('referrerPolicy') || iframe.referrerPolicy).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(iframe.src).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe.src).toContain('playsinline=1');
    expect(iframe.src).toContain('origin=');

    await waitFor(() => {
      expect(capturedHandlers).not.toBeNull();
    });

    // Simulate Error 153 / embed block on youtube-nocookie.com -> automatically falls back to www.youtube.com
    act(() => {
      capturedHandlers.onError({ data: 153 });
    });

    await waitFor(() => {
      const updatedIframe = screen.getByTitle('Video kiểm tra') as HTMLIFrameElement;
      expect(updatedIframe.src).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });
  });

  it('preserves books and radio entertainment modes in Netlify entertainment-search function', async () => {
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.YOUTUBE_API_KEY = 'yt-test-key';

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'imp-1', aal: 'aal1' })).toString('base64url');
    const jwt = `${header}.${body}.sig`;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const target = String(url);
        if (target.endsWith('/auth/v1/user')) {
          return new Response(
            JSON.stringify({ id: 'imp-1', app_metadata: { account_type: 'impaired' } }),
            { status: 200 }
          );
        }
        if (target.includes('user_account_policies')) {
          return new Response(
            JSON.stringify([
              {
                account_type: 'impaired',
                mfa_enforced: false,
                role_verified: true,
                requires_role_review: false,
              },
            ]),
            { status: 200 }
          );
        }
        if (target.includes('profiles')) {
          return new Response(JSON.stringify([{ id: 'imp-1', display_name: 'Test' }]), {
            status: 200,
          });
        }
        if (target.includes('googleapis.com/youtube/v3/search')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response('[]', { status: 200 });
      })
    );

    const res = await entSearchV2(
      new Request('https://eyetalk.example.com/api/entertainment/search?q=Thoi%20su&mode=radio', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-forwarded-for': '203.0.113.55',
        },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe('radio');
    expect(json.searchQueryUsed).toBe('Thoi su radio');
  });

  it('useGeolocation falls back to low-accuracy on timeout and enableAndRefreshLocation turns GPS ON when previously disabled', async () => {
    const getCurrentPositionMock = vi.fn(
      (success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) => {
        if (options?.enableHighAccuracy) {
          error?.({
            code: 3,
            message: 'Timeout',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
          return;
        }
        success({
          coords: { latitude: 21.0285, longitude: 105.8542, accuracy: 35 },
          timestamp: Date.now(),
        } as GeolocationPosition);
      }
    );

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: getCurrentPositionMock,
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    });

    // Seed GPS as disabled in app preferences for user 'u_loc'
    writeDevicePermissions({ camera: true, microphone: true, geolocation: false }, 'u_loc');

    function GpsHarness() {
      const geo = useGeolocation(true, 'u_loc');
      return (
        <div>
          <span data-testid="geo-status">{geo.status}</span>
          <span data-testid="geo-real">{String(geo.isRealGps)}</span>
          <span data-testid="geo-lat">{geo.coords.lat.toFixed(4)}</span>
          <button data-testid="btn-enable-gps" onClick={geo.enableAndRefreshLocation}>
            EnableGPS
          </button>
        </div>
      );
    }

    render(<GpsHarness />);

    expect(screen.getByTestId('geo-status')).toHaveTextContent('PERMISSION_DENIED');
    expect(screen.getByTestId('geo-real')).toHaveTextContent('false');

    // User clicks "BẬT GPS & ĐỊNH VỊ LẠI"
    act(() => {
      screen.getByTestId('btn-enable-gps').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('geo-status')).toHaveTextContent('LOCATED');
      expect(screen.getByTestId('geo-real')).toHaveTextContent('true');
      expect(screen.getByTestId('geo-lat')).toHaveTextContent('21.0285');
    });

    expect(readDevicePermissions('u_loc').geolocation).toBe(true);
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(2);
  });
});
