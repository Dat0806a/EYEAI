import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EyeTrackingProvider, EyeTrackingAuthContextInput } from '../EyeTrackingProvider';
import { EyeNavigationProvider } from '../EyeNavigationProvider';
import { useEyeTracking } from '../useEyeTracking';
import { ConsentModal } from '../../../components/privacy/ConsentModal';
import { PrivacyDashboard } from '../../../components/privacy/PrivacyDashboard';
import {
  grantConsent,
  revokeConsent,
  getConsentLogs,
  hasValidFaceProcessingConsent,
  hasValidCalibrationStorageConsent,
} from '../../privacy/consentService';
import {
  getCalibrationStorageKey,
  loadCalibrationProfile,
  saveCalibrationProfile,
  DEFAULT_CALIBRATION_DATA,
} from '../calibrationStorage';
import { getLatestLandmarks, getLatestLowLightStats } from '../landmarkStore';
import { LiveCameraOverlay } from '../LiveCameraOverlay';
import { createCustomOverlayMarker } from '../../location/CustomOverlayMarker';
import { searchEntertainment } from '../../../services/entertainmentService';
import { createInMemoryRateLimiter, resolveAllowedCorsOrigin } from '../../../../server/securityMiddleware';

vi.mock('../../../utils/speech', () => ({
  speakVietnamese: vi.fn(),
  updateSpeechSettings: vi.fn(),
  recoverAudioSession: vi.fn(),
  isSpeechSupported: () => true,
  stopSpeech: vi.fn(),
}));

function buildMockLandmarks() {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[33] = { x: 0.35, y: 0.4, z: 0 };
  landmarks[133] = { x: 0.43, y: 0.4, z: 0 };
  landmarks[159] = { x: 0.39, y: 0.388, z: 0 };
  landmarks[145] = { x: 0.39, y: 0.412, z: 0 };
  landmarks[158] = { x: 0.40, y: 0.388, z: 0 };
  landmarks[144] = { x: 0.40, y: 0.412, z: 0 };
  landmarks[468] = { x: 0.39, y: 0.4, z: 0 };
  landmarks[362] = { x: 0.57, y: 0.4, z: 0 };
  landmarks[263] = { x: 0.65, y: 0.4, z: 0 };
  landmarks[386] = { x: 0.61, y: 0.388, z: 0 };
  landmarks[374] = { x: 0.61, y: 0.412, z: 0 };
  landmarks[385] = { x: 0.60, y: 0.388, z: 0 };
  landmarks[373] = { x: 0.60, y: 0.412, z: 0 };
  landmarks[473] = { x: 0.61, y: 0.4, z: 0 };
  landmarks[1] = { x: 0.5, y: 0.52, z: 0 };
  landmarks[10] = { x: 0.5, y: 0.25, z: 0 };
  landmarks[152] = { x: 0.5, y: 0.80, z: 0 };
  landmarks[234] = { x: 0.25, y: 0.5, z: 0 };
  landmarks[454] = { x: 0.75, y: 0.5, z: 0 };
  return landmarks;
}

describe('EYEAI Security & Privacy Verification Suite', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;
  let mockTrackStop: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;
  let onResultsCallbacks: Array<(res: any) => void>;
  let rafQueue: FrameRequestCallback[];
  let rafIdCounter: number;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    rafQueue = [];
    rafIdCounter = 1;
    onResultsCallbacks = [];
    closeMock = vi.fn().mockResolvedValue(undefined);
    mockTrackStop = vi.fn();

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });

    (window as any).FaceMesh = class MockFaceMesh {
      setOptions = vi.fn();
      onResults = vi.fn((cb: (res: any) => void) => {
        onResultsCallbacks.push(cb);
      });
      send = vi.fn().mockResolvedValue(undefined);
      close = closeMock;
    };

    const mockTrack = { readyState: 'live', stop: mockTrackStop };
    const mockStream = {
      active: true,
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafIdCounter++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete (window as any).FaceMesh;
    delete (window as any).__eyeai_latest_landmarks;
    delete (window as any).__eyeai_lowlight_stats;
    vi.restoreAllMocks();
  });

  function Harness({ showDashboard = false }: { showDashboard?: boolean }) {
    const ctx = useEyeTracking();
    const [lastAction, setLastAction] = React.useState('NONE');
    React.useEffect(() => {
      return ctx.registerGestureCallback((a) => {
        setLastAction(a);
        return true;
      });
    }, [ctx.registerGestureCallback]);

    return (
      <div>
        <span data-testid="cam-active">{String(ctx.trackingState.cameraActive)}</span>
        <span data-testid="session-id">{String(ctx.activeSessionId)}</span>
        <span data-testid="consent-modal-open">{String(ctx.isConsentModalOpen)}</span>
        <span data-testid="face-consent">{String(ctx.consentState.faceProcessing.granted)}</span>
        <span data-testid="calib-consent">{String(ctx.consentState.calibrationStorage.granted)}</span>
        <span data-testid="last-action">{lastAction}</span>
        <span data-testid="calib-neutral-ear">{ctx.calibration.neutralEAR.toFixed(3)}</span>
        <button data-testid="btn-toggle-cam" onClick={() => void ctx.toggleCamera()}>
          ToggleCam
        </button>
        <button data-testid="btn-rezero" onClick={() => ctx.reZeroCenter()}>
          ReZero
        </button>
        <button data-testid="btn-revoke-face" onClick={() => ctx.revokeFaceProcessingConsent('privacy_dashboard')}>
          RevokeFace
        </button>
        <ConsentModal
          isOpen={ctx.isConsentModalOpen}
          onAccept={(saveCalib) => ctx.grantFaceProcessingConsent(saveCalib, 'consent_modal')}
          onDecline={() => {
            ctx.closeConsentModal();
            ctx.setEyeControlEnabled(false);
          }}
        />
        {showDashboard && <PrivacyDashboard />}
      </div>
    );
  }

  it('Phase 1.1: blocks camera when unauthenticated, loading, or patient account', async () => {
    const cases: EyeTrackingAuthContextInput[] = [
      { isAuthenticated: false, loading: false, userId: null, accountType: null },
      { isAuthenticated: true, loading: true, userId: 'u1', accountType: 'impaired' },
      { isAuthenticated: true, loading: false, userId: 'u_pat', accountType: 'patient' },
    ];

    for (const auth of cases) {
      if (auth.userId) {
        grantConsent(auth.userId, 'face_processing', 'consent_modal');
      }
      const { unmount } = render(
        <EyeTrackingProvider auth={auth}>
          <EyeNavigationProvider>
            <Harness />
          </EyeNavigationProvider>
        </EyeTrackingProvider>
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(getUserMediaMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('cam-active')).toHaveTextContent('false');
      unmount();
    }
  });

  it('Phase 1.2: blocks camera without consent, opens accessible ConsentModal, and allows RAM-only Eye Tracking if calibration storage is declined', async () => {
    const auth: EyeTrackingAuthContextInput = {
      isAuthenticated: true,
      loading: false,
      userId: 'impaired-user-1',
      accountType: 'impaired',
    };

    render(
      <EyeTrackingProvider auth={auth}>
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('consent-modal-open')).toHaveTextContent('true');
    });
    expect(getUserMediaMock).not.toHaveBeenCalled();

    // Accept Face Processing Consent ONLY (leave Calibration Storage unchecked)
    fireEvent.click(screen.getByRole('button', { name: /Đồng ý xử lý cục bộ/i }));

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('face-consent')).toHaveTextContent('true');
    expect(screen.getByTestId('calib-consent')).toHaveTextContent('false');

    // Triggering reZeroCenter keeps calibration in RAM only without writing to localStorage
    fireEvent.click(screen.getByTestId('btn-rezero'));
    expect(localStorage.getItem(getCalibrationStorageKey('impaired-user-1'))).toBeNull();
  });

  it('Phase 1.3 & 1.4: stops camera on logout/patient-switch, rejects late getUserMedia streams, and ignores stale session callbacks', async () => {
    grantConsent('user-a', 'face_processing', 'consent_modal');

    // Deferred getUserMedia so we can simulate slow camera resolution after logout/cancel
    let resolveLateStream!: (s: MediaStream) => void;
    const lateTrackStop = vi.fn();
    const lateStream = {
      active: true,
      getVideoTracks: () => [{ readyState: 'live', stop: lateTrackStop }],
      getTracks: () => [{ readyState: 'live', stop: lateTrackStop }],
    } as unknown as MediaStream;

    getUserMediaMock.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveLateStream = resolve;
        })
    );

    const { rerender } = render(
      <EyeTrackingProvider
        auth={{ isAuthenticated: true, loading: false, userId: 'user-a', accountType: 'impaired' }}
      >
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    // Simulate user switching to Patient / Logging out BEFORE getUserMedia resolves
    rerender(
      <EyeTrackingProvider
        auth={{ isAuthenticated: false, loading: false, userId: null, accountType: null }}
      >
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await act(async () => {
      resolveLateStream(lateStream);
      await Promise.resolve();
    });

    // Late-arriving stream MUST be stopped immediately and camera MUST remain inactive
    expect(lateTrackStop).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cam-active')).toHaveTextContent('false');

    // Now start a real authorized session for user-a, capture its onResults callback, then revoke
    const activeTrackStop = vi.fn();
    const activeStream = {
      active: true,
      getVideoTracks: () => [{ readyState: 'live', stop: activeTrackStop }],
      getTracks: () => [{ readyState: 'live', stop: activeTrackStop }],
    } as unknown as MediaStream;
    getUserMediaMock.mockResolvedValueOnce(activeStream);

    rerender(
      <EyeTrackingProvider
        auth={{ isAuthenticated: true, loading: false, userId: 'user-a', accountType: 'impaired' }}
      >
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });

    // Trigger one rAF frame to bind FaceMesh.onResults
    const pendingRaf = rafQueue.splice(0, rafQueue.length);
    for (const cb of pendingRaf) {
      await act(async () => {
        await cb(16);
      });
    }
    expect(onResultsCallbacks.length).toBeGreaterThan(0);
    const staleCallback = onResultsCallbacks[0];

    // Revoke consent -> tears down session, stops tracks, closes FaceMesh, clears landmarks
    fireEvent.click(screen.getByTestId('btn-revoke-face'));
    expect(activeTrackStop).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    expect(screen.getByTestId('cam-active')).toHaveTextContent('false');
    expect(getLatestLandmarks()).toBeNull();

    // Calling stale FaceMesh callback from invalidated session must NOT populate landmarks or trigger actions
    act(() => {
      staleCallback({ multiFaceLandmarks: [buildMockLandmarks()] });
    });
    expect(getLatestLandmarks()).toBeNull();
    expect((window as any).__eyeai_latest_landmarks).toBeUndefined();
    expect((window as any).__eyeai_lowlight_stats).toBeUndefined();
    expect(getLatestLowLightStats()).toBeNull();
  });

  it('Phase 3: enforces user-scoped calibration storage, rejects corrupt/foreign profiles, and deletes on revocation', () => {
    // Seed legacy un-owned keys AND user A's profile
    localStorage.setItem('eyeai_calibration', JSON.stringify({ neutralEAR: 0.35, isCalibrated: true }));
    localStorage.setItem('luckydream_eye_calibration', JSON.stringify({ neutralEAR: 0.36 }));
    localStorage.setItem('eyetalk_patient_v2_pat1_reports', JSON.stringify([{ id: 'r1' }]));

    grantConsent('user-a', 'calibration_storage', 'privacy_dashboard');
    const saveRes = saveCalibrationProfile('user-a', {
      ...DEFAULT_CALIBRATION_DATA,
      neutralEAR: 0.31,
      blinkThreshold: 0.19,
      thresholdUp: 0.021,
      thresholdDown: 0.022,
      thresholdLeft: 0.029,
      thresholdRight: 0.030,
    });
    expect(saveRes.saved).toBe(true);

    // Ensure raw landmarks / gaze history are NOT stored
    const rawStored = localStorage.getItem(getCalibrationStorageKey('user-a'))!;
    const parsedStored = JSON.parse(rawStored);
    expect(parsedStored.schemaVersion).toBe(1);
    expect(parsedStored.userId).toBe('user-a');
    expect(parsedStored.upIrisV).toBeUndefined();
    expect(parsedStored.neutralIrisH).toBeUndefined();

    // User B with calibration storage consent CANNOT load User A's profile or legacy keys
    grantConsent('user-b', 'calibration_storage', 'privacy_dashboard');
    const loadedB = loadCalibrationProfile('user-b');
    expect(loadedB.persisted).toBe(false);
    expect(loadedB.data.neutralEAR).toBe(DEFAULT_CALIBRATION_DATA.neutralEAR);
    // Legacy keys cleaned without adopting
    expect(localStorage.getItem('eyeai_calibration')).toBeNull();
    expect(localStorage.getItem('luckydream_eye_calibration')).toBeNull();
    // Patient storage untouched!
    expect(localStorage.getItem('eyetalk_patient_v2_pat1_reports')).toBeTruthy();

    // Corrupt / NaN / mismatched userId JSON fails closed safely
    localStorage.setItem(getCalibrationStorageKey('user-b'), '{bad-json');
    expect(loadCalibrationProfile('user-b').persisted).toBe(false);
    localStorage.setItem(
      getCalibrationStorageKey('user-b'),
      JSON.stringify({ schemaVersion: 1, userId: 'user-a', updatedAt: Date.now(), neutralEAR: 0.31 })
    );
    expect(loadCalibrationProfile('user-b').persisted).toBe(false);

    // Revoking calibration storage deletes profile immediately
    revokeConsent('user-a', 'calibration_storage', 'privacy_dashboard');
    expect(hasValidCalibrationStorageConsent('user-a')).toBe(false);
    expect(localStorage.getItem(getCalibrationStorageKey('user-a'))).toBeNull();
  });

  it('Phase 5: synchronizes multi-tab consent revocation and PrivacyDashboard reflects live runtime state', async () => {
    grantConsent('user-mt', 'face_processing', 'consent_modal');
    grantConsent('user-mt', 'calibration_storage', 'consent_modal');

    render(
      <EyeTrackingProvider
        auth={{ isAuthenticated: true, loading: false, userId: 'user-mt', accountType: 'impaired' }}
      >
        <EyeNavigationProvider>
          <Harness showDashboard />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });
    expect(screen.getByText(/Quyền riêng tư và dữ liệu/i)).toBeInTheDocument();

    // Simulate Tab B revoking consent in localStorage and firing StorageEvent
    revokeConsent('user-mt', 'face_processing', 'multi_tab_sync');
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'eyeai_privacy_consent_v1_user-mt',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('false');
      expect(hasValidFaceProcessingConsent('user-mt')).toBe(false);
    });

    // Consent logs recorded without sensitive biometric fields
    const logs = getConsentLogs('user-mt');
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(logs)).not.toContain('landmarks');
  });

  it('Phase 4.4 & 6: prevents DOM XSS in CustomOverlayMarker, enforces backend-only YouTube search, and enforces rate limit / CORS', async () => {
    // 1. CustomOverlayMarker XSS prevention
    const panes = { overlayMouseTarget: document.createElement('div') };
    (globalThis as any).google = {
      maps: {
        OverlayView: class {
          setMap() {}
          getPanes() {
            return panes;
          }
          getProjection() {
            return null;
          }
        },
      },
    };

    const marker = createCustomOverlayMarker({} as any, {} as any, {
      name: '<img src=x onerror="window.__xss=1">',
      isCurrentUser: false,
      avatarUrl: 'javascript:alert(1)',
      isEyeMode: false,
    });
    expect(marker).not.toBeNull();
    marker && (marker as any).onAdd();
    expect(panes.overlayMouseTarget.innerHTML).not.toContain('javascript:alert');
    expect(panes.overlayMouseTarget.querySelector('img')).toBeNull();
    expect(panes.overlayMouseTarget.textContent).toContain('<img src=x onerror="window.__xss=1">');
    delete (globalThis as any).google;

    // 2. Entertainment service fails closed when backend returns 404 HTML (no direct client key fallback)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })
    );
    const searchRes = await searchEntertainment('nhac tre', 'music');
    expect(searchRes.success).toBe(false);
    expect(searchRes.error).toBe('BACKEND_UNAVAILABLE');

    // 3. CORS origin helper & rate limiter
    expect(resolveAllowedCorsOrigin('https://evil.example.com')).toBeNull();
    expect(resolveAllowedCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173');

    const limiter = createInMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2, bucketPrefix: 'test' });
    const nextFn = vi.fn();
    const resMock: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const reqMock: any = { headers: {}, ip: '10.0.0.1' };
    limiter(reqMock, resMock, nextFn);
    limiter(reqMock, resMock, nextFn);
    limiter(reqMock, resMock, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(2);
    expect(resMock.status).toHaveBeenCalledWith(429);
  });

  it('Task 7: guards in-flight FaceMesh.send() across session restart, handles track ended events, and clears 20-cycle toggles without leaks', async () => {
    grantConsent('user-race', 'face_processing', 'consent_modal');

    let resolveSession1Send!: () => void;
    const session1Close = vi.fn().mockRejectedValue(new Error('already closed'));
    const session2Close = vi.fn().mockResolvedValue(undefined);
    let sendCallCount = 0;

    (window as any).FaceMesh = class RaceFaceMesh {
      setOptions = vi.fn();
      onResults = vi.fn((cb: (res: any) => void) => {
        onResultsCallbacks.push(cb);
      });
      send = vi.fn(() => {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          return new Promise<void>((res) => {
            resolveSession1Send = res;
          });
        }
        return Promise.resolve();
      });
      close = sendCallCount === 0 ? session1Close : session2Close;
    };

    const listeners1: Record<string, Set<() => void>> = { ended: new Set() };
    const track1Stop = vi.fn();
    const track1 = {
      readyState: 'live',
      stop: track1Stop,
      addEventListener: (ev: string, cb: () => void) => listeners1[ev]?.add(cb),
      removeEventListener: (ev: string, cb: () => void) => listeners1[ev]?.delete(cb),
    };
    const stream1 = {
      active: true,
      getVideoTracks: () => [track1],
      getTracks: () => [track1],
    } as unknown as MediaStream;

    const listeners2: Record<string, Set<() => void>> = { ended: new Set() };
    const track2Stop = vi.fn();
    const track2 = {
      readyState: 'live',
      stop: track2Stop,
      addEventListener: (ev: string, cb: () => void) => listeners2[ev]?.add(cb),
      removeEventListener: (ev: string, cb: () => void) => listeners2[ev]?.delete(cb),
    };
    const stream2 = {
      active: true,
      getVideoTracks: () => [track2],
      getTracks: () => [track2],
    } as unknown as MediaStream;

    getUserMediaMock.mockResolvedValueOnce(stream1).mockResolvedValueOnce(stream2);

    const videoReadySpy = vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);

    render(
      <EyeTrackingProvider
        auth={{ isAuthenticated: true, loading: false, userId: 'user-race', accountType: 'impaired' }}
      >
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });

    // Kick off session 1 rAF -> starts in-flight FaceMesh.send()
    const firstRaf = rafQueue.splice(0, rafQueue.length);
    await act(async () => {
      firstRaf[0](16);
      await Promise.resolve();
    });
    expect(sendCallCount).toBe(1);

    // Tear down session 1 WHILE session 1 send() is still pending, then immediately start session 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-toggle-cam'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('cam-active')).toHaveTextContent('false');

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-toggle-cam'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });

    // Resolve orphaned session 1 send() -> must NOT throw unhandled rejection on close() and must NOT break session 2
    await act(async () => {
      resolveSession1Send();
      await Promise.resolve();
    });
    expect(session1Close).toHaveBeenCalledTimes(1);

    // Firing stale track1 'ended' event MUST NOT tear down session 2
    await act(async () => {
      listeners1.ended.forEach((cb) => cb());
    });
    expect(screen.getByTestId('cam-active')).toHaveTextContent('true');

    // Firing active track2 'ended' event MUST tear down session 2 cleanly
    await act(async () => {
      listeners2.ended.forEach((cb) => cb());
    });
    expect(screen.getByTestId('cam-active')).toHaveTextContent('false');
    expect(track2Stop).toHaveBeenCalled();

    // 20-cycle rapid camera toggle stress test (zero lingering landmarks, every track stopped)
    const cycleStops: ReturnType<typeof vi.fn>[] = [];
    getUserMediaMock.mockImplementation(async () => {
      const s = vi.fn();
      cycleStops.push(s);
      const t = { readyState: 'live', stop: s, addEventListener: vi.fn(), removeEventListener: vi.fn() };
      return {
        active: true,
        getVideoTracks: () => [t],
        getTracks: () => [t],
      } as unknown as MediaStream;
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-toggle-cam'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-toggle-cam'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('cam-active')).toHaveTextContent('false');
      });
    }
    expect(cycleStops).toHaveLength(20);
    expect(cycleStops.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(getLatestLandmarks()).toBeNull();
    videoReadySpy.mockRestore();
  });

  it('Task 7 & 8: StrictMode unmount releases camera, landmarks are immutable/frozen, and LiveCameraOverlay recovers when face reappears', async () => {
    grantConsent('user-strict', 'face_processing', 'consent_modal');
    const strictStop = vi.fn();
    const strictStream = {
      active: true,
      getVideoTracks: () => [{ readyState: 'live', stop: strictStop, addEventListener: vi.fn(), removeEventListener: vi.fn() }],
      getTracks: () => [{ readyState: 'live', stop: strictStop, addEventListener: vi.fn(), removeEventListener: vi.fn() }],
    } as unknown as MediaStream;
    getUserMediaMock.mockResolvedValue(strictStream);

    const { unmount } = render(
      <React.StrictMode>
        <EyeTrackingProvider
          auth={{ isAuthenticated: true, loading: false, userId: 'user-strict', accountType: 'impaired' }}
        >
          <EyeNavigationProvider>
            <Harness />
          </EyeNavigationProvider>
        </EyeTrackingProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cam-active')).toHaveTextContent('true');
    });

    // Emit valid landmarks and verify frozen immutability
    const firstRaf = rafQueue.splice(0, rafQueue.length);
    for (const cb of firstRaf) {
      await act(async () => {
        await cb(16);
      });
    }
    const landmarks = buildMockLandmarks();
    act(() => {
      onResultsCallbacks[onResultsCallbacks.length - 1]({ multiFaceLandmarks: [landmarks] });
    });
    const stored = getLatestLandmarks();
    expect(stored).not.toBeNull();
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored![0])).toBe(true);

    unmount();
    expect(strictStop).toHaveBeenCalled();
    expect(getLatestLandmarks()).toBeNull();

    // Verify LiveCameraOverlay clears on faceDetected=false and resumes stroke on faceDetected=true
    const canvasCtxMock: any = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasCtxMock);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 240,
      top: 0,
      left: 0,
      right: 320,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const authOverlay: EyeTrackingAuthContextInput = {
      isAuthenticated: true,
      loading: false,
      userId: 'user-overlay',
      accountType: 'impaired',
    };
    grantConsent('user-overlay', 'face_processing', 'consent_modal');

    function OverlayHarness() {
      const ctx = useEyeTracking();
      return (
        <div>
          <span data-testid="ov-cam">{String(ctx.trackingState.cameraActive)}</span>
          <span data-testid="ov-face">{String(ctx.trackingState.faceDetected)}</span>
          <LiveCameraOverlay videoElement={ctx.videoRef.current} />
        </div>
      );
    }

    onResultsCallbacks = [];
    rafQueue = [];
    render(
      <EyeTrackingProvider auth={authOverlay}>
        <EyeNavigationProvider>
          <OverlayHarness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ov-cam')).toHaveTextContent('true');
    });
    // Start tracking loop to bind onResults
    for (const cb of rafQueue.splice(0, rafQueue.length)) {
      await act(async () => {
        await cb(16);
      });
    }
    const ovCallback = onResultsCallbacks[onResultsCallbacks.length - 1];

    // Step 1: face detected -> draws landmarks
    act(() => {
      ovCallback({ multiFaceLandmarks: [buildMockLandmarks()] });
    });
    expect(screen.getByTestId('ov-face')).toHaveTextContent('true');
    for (const cb of rafQueue.splice(0, rafQueue.length)) {
      await act(async () => {
        await cb(32);
      });
    }
    const strokesBeforeLoss = canvasCtxMock.stroke.mock.calls.length;
    expect(strokesBeforeLoss).toBeGreaterThan(0);

    // Step 2: face lost (>10 frames threshold is 11) -> faceDetected becomes false
    for (let f = 0; f < 12; f++) {
      act(() => {
        ovCallback({ multiFaceLandmarks: [] });
      });
    }
    expect(screen.getByTestId('ov-face')).toHaveTextContent('false');

    // Step 3: face reappears -> LiveCameraOverlay resumes drawing automatically
    act(() => {
      ovCallback({ multiFaceLandmarks: [buildMockLandmarks()] });
    });
    expect(screen.getByTestId('ov-face')).toHaveTextContent('true');
    for (const cb of rafQueue.splice(0, rafQueue.length)) {
      await act(async () => {
        await cb(48);
      });
    }
    expect(canvasCtxMock.stroke.mock.calls.length).toBeGreaterThan(strokesBeforeLoss);
  });

  it('Task 9: enforces Infinity/retention/policy-version/quota fail-safe boundaries on consent & calibration storage', () => {
    // 1. Policy version mismatch fails closed
    localStorage.setItem(
      'eyeai_privacy_consent_v1_user-old-policy',
      JSON.stringify({
        userId: 'user-old-policy',
        faceProcessing: { granted: true, policyVersion: '0.9-legacy', updatedAt: '2025-01-01T00:00:00Z', consentId: 'old' },
        calibrationStorage: { granted: true, policyVersion: '0.9-legacy', updatedAt: '2025-01-01T00:00:00Z', consentId: 'old2' },
      })
    );
    expect(hasValidFaceProcessingConsent('user-old-policy')).toBe(false);
    expect(hasValidCalibrationStorageConsent('user-old-policy')).toBe(false);

    // 2. Reject Infinity, expired (>90 days), and future timestamps on calibration profile
    grantConsent('user-edge', 'calibration_storage', 'privacy_dashboard');
    const key = getCalibrationStorageKey('user-edge');

    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        userId: 'user-edge',
        updatedAt: Date.now(),
        neutralEAR: Infinity,
        blinkThreshold: 0.15,
        thresholdUp: 0.018,
        thresholdDown: 0.018,
        thresholdLeft: 0.026,
        thresholdRight: 0.026,
      })
    );
    expect(loadCalibrationProfile('user-edge').persisted).toBe(false);

    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        userId: 'user-edge',
        updatedAt: Date.now() - 91 * 24 * 60 * 60 * 1000,
        neutralEAR: 0.25,
        blinkThreshold: 0.15,
        thresholdUp: 0.018,
        thresholdDown: 0.018,
        thresholdLeft: 0.026,
        thresholdRight: 0.026,
      })
    );
    expect(loadCalibrationProfile('user-edge').persisted).toBe(false);

    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        userId: 'user-edge',
        updatedAt: Date.now() + 120_000,
        neutralEAR: 0.25,
        blinkThreshold: 0.15,
        thresholdUp: 0.018,
        thresholdDown: 0.018,
        thresholdLeft: 0.026,
        thresholdRight: 0.026,
      })
    );
    expect(loadCalibrationProfile('user-edge').persisted).toBe(false);

    // 3. QuotaExceededError on localStorage.setItem fails safely without throwing
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    expect(() => grantConsent('user-quota', 'face_processing', 'consent_modal')).not.toThrow();
    expect(saveCalibrationProfile('user-edge', { ...DEFAULT_CALIBRATION_DATA }).saved).toBe(false);
    setItemSpy.mockRestore();
  });
});
