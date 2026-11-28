import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  estimateMeanLuminance,
  estimateSceneLuminance,
  extractFaceRoiFromLandmarks,
  computeAdaptiveGamma,
  buildGammaLUT,
  applyGammaLUT,
  updateLuminanceAndGamma,
  LowLightExposureProcessor,
} from '../lowLightFilter';
import { analyzeEyes, Point } from '../eyeTracker';
import { EyeTrackingProvider } from '../EyeTrackingProvider';
import { EyeNavigationProvider, useEyeNavigationContext } from '../EyeNavigationProvider';
import { useEyeTrackingSettings } from '../useEyeTracking';
import { CameraHub } from '../CameraHub';
import { CameraPreview } from '../CameraPreview';

// Mock speech module so jsdom doesn't touch AudioContext/speechSynthesis
vi.mock('../../../utils/speech', () => ({
  speakVietnamese: vi.fn(),
  updateSpeechSettings: vi.fn(),
  recoverAudioSession: vi.fn(),
  isSpeechSupported: () => false,
}));

describe('lowLightFilter - Unit Tests (Adaptive Gamma, LUT, EMA, Deadband)', () => {
  it('estimateMeanLuminance handles empty, dark, and bright buffers', () => {
    expect(estimateMeanLuminance(new Uint8ClampedArray(0))).toBe(0);

    // 4 dark pixels (20, 20, 20, 255)
    const dark = new Uint8ClampedArray([
      20, 20, 20, 255,
      20, 20, 20, 255,
      20, 20, 20, 255,
      20, 20, 20, 255,
    ]);
    expect(estimateMeanLuminance(dark, 1)).toBeCloseTo(20, 4);

    // 2 bright pixels (200, 200, 200, 255)
    const bright = new Uint8ClampedArray([
      200, 200, 200, 255,
      200, 200, 200, 255,
    ]);
    expect(estimateMeanLuminance(bright, 1)).toBeCloseTo(200, 4);
  });

  it('computeAdaptiveGamma clamps within [minGamma, maxGamma] and relaxes to 1.0 in bright scenes', () => {
    const gammaVeryDark = computeAdaptiveGamma(5);
    const gammaDim = computeAdaptiveGamma(60);
    const gammaSlightlyDim = computeAdaptiveGamma(105);
    const gammaNormal = computeAdaptiveGamma(138);
    const gammaBright = computeAdaptiveGamma(210);

    expect(gammaVeryDark).toBe(0.28); // capped at minGamma to limit noise
    expect(gammaDim).toBeGreaterThanOrEqual(0.28);
    expect(gammaDim).toBeLessThan(0.5);
    expect(gammaSlightlyDim).toBeLessThan(0.75); // noticeable boost even in mildly dim rooms
    expect(gammaVeryDark).toBeLessThanOrEqual(gammaDim);
    expect(gammaNormal).toBe(1.0);
    expect(gammaBright).toBe(1.0);
    expect(computeAdaptiveGamma(Number.NaN)).toBe(1.0);
  });

  it('estimateSceneLuminance prioritizes face/eye region and resists bright background glare', () => {
    const width = 40;
    const height = 40;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Bright background (230) with dark central face/eye region (30)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inCenterFace = x >= 10 && x <= 30 && y >= 8 && y <= 32;
        const val = inCenterFace ? 30 : 230;
        buffer[idx] = val;
        buffer[idx + 1] = val;
        buffer[idx + 2] = val;
        buffer[idx + 3] = 255;
      }
    }

    const wholeFrameMean = estimateMeanLuminance(buffer, 1);
    const sceneLum = estimateSceneLuminance(buffer, width, height, 1);

    // Whole-frame unweighted average is ~143 (nearly bright!), which would barely boost the dark face
    expect(wholeFrameMean).toBeGreaterThan(130);
    // Face-prioritized highlight-suppressed metering stays anchored near the dark face
    expect(sceneLum).toBeLessThan(55);
  });

  it('extractFaceRoiFromLandmarks extracts normalized face & eye bounds safely', () => {
    expect(extractFaceRoiFromLandmarks(null)).toBeNull();
    expect(extractFaceRoiFromLandmarks([])).toBeNull();

    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.7, y: 0.45 }));
    landmarks[10] = { x: 0.7, y: 0.2 };
    landmarks[152] = { x: 0.7, y: 0.7 };
    landmarks[234] = { x: 0.55, y: 0.45 };
    landmarks[454] = { x: 0.85, y: 0.45 };
    landmarks[33] = { x: 0.62, y: 0.35 };
    landmarks[263] = { x: 0.78, y: 0.35 };
    landmarks[159] = { x: 0.65, y: 0.34 };
    landmarks[145] = { x: 0.65, y: 0.37 };

    const roi = extractFaceRoiFromLandmarks(landmarks);
    expect(roi).not.toBeNull();
    expect(roi!.minX).toBeGreaterThan(0.55);
    expect(roi!.maxX).toBeLessThan(0.85);
    expect(roi!.minX).toBeLessThan(0.62);
    expect(roi!.maxX).toBeGreaterThan(0.78);
    expect(roi!.eyeMinY).toBeLessThan(0.35);
    expect(roi!.eyeMaxY).toBeGreaterThan(0.37);
  });

  it('buildGammaLUT produces 256-entry Uint8Array with identity at gamma=1.0, noise-safe toe, and monotonic lift at gamma<1.0', () => {
    const identity = buildGammaLUT(1.0);
    expect(identity).toBeInstanceOf(Uint8Array);
    expect(identity.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(identity[i]).toBe(i);
    }

    const lifted = buildGammaLUT(0.35);
    expect(lifted.length).toBe(256);
    expect(lifted[0]).toBe(0);
    expect(lifted[255]).toBe(255);
    // Extreme dark sensor noise (i=2) stays controlled compared to raw 255*(2/255)^0.35 (~46)
    expect(lifted[2]).toBeLessThan(35);
    // Facial/eye shadow tones are strongly lifted
    expect(lifted[30]).toBeGreaterThan(100);
    expect(lifted[64]).toBeGreaterThan(140);
    for (let i = 1; i < 256; i++) {
      expect(lifted[i]).toBeGreaterThanOrEqual(lifted[i - 1]);
    }
  });

  it('applyGammaLUT transforms RGB channels in-place and preserves alpha channel', () => {
    const lut = buildGammaLUT(0.5);
    const pixels = new Uint8ClampedArray([30, 60, 90, 128, 0, 255, 10, 200]);
    applyGammaLUT(pixels, lut);

    expect(pixels[0]).toBe(lut[30]);
    expect(pixels[1]).toBe(lut[60]);
    expect(pixels[2]).toBe(lut[90]);
    expect(pixels[3]).toBe(128);
    expect(pixels[4]).toBe(0);
    expect(pixels[5]).toBe(255);
    expect(pixels[6]).toBe(lut[10]);
    expect(pixels[7]).toBe(200);
  });

  it('updateLuminanceAndGamma applies adaptive EMA, deadband, and clean snap to 1.0 on bright recovery', () => {
    // First frame initializes EMA directly
    const step1 = updateLuminanceAndGamma(null, 1.0, 40, {
      emaAlpha: 0.26,
      gammaDeadband: 0.01,
    });
    expect(step1.smoothedLuminance).toBe(40);
    expect(step1.lutUpdated).toBe(true);
    expect(step1.gamma).toBeLessThan(1.0);

    // Tiny change in luminance produces deltaGamma < deadband -> no LUT update
    const step2 = updateLuminanceAndGamma(step1.smoothedLuminance, step1.gamma, 41, {
      emaAlpha: 0.26,
      gammaDeadband: 0.05,
    });
    expect(step2.smoothedLuminance).toBeCloseTo(40.26, 4);
    expect(step2.lutUpdated).toBe(false);
    expect(step2.gamma).toBe(step1.gamma);

    // Sudden light drop triggers fast EMA response (> base emaAlpha)
    const suddenDark = updateLuminanceAndGamma(170, 1.0, 15, {
      emaAlpha: 0.26,
      fastEmaAlpha: 0.72,
      suddenChangeThreshold: 8,
    });
    expect(suddenDark.smoothedLuminance).toBeLessThan(80);
    expect(suddenDark.lutUpdated).toBe(true);
    expect(suddenDark.gamma).toBeLessThan(0.55);

    // Crossing back above targetLuminance snaps cleanly to 1.0 even within deadband
    const snapBright = updateLuminanceAndGamma(150, 0.985, 190, {
      emaAlpha: 0.24,
      fastEmaAlpha: 0.65,
      gammaDeadband: 0.05,
    });
    expect(snapBright.gamma).toBe(1.0);
    expect(snapBright.lutUpdated).toBe(true);
  });

  it('LowLightExposureProcessor reuses canvas, boosts dark frames, and handles zero-dimension fallback', () => {
    const processor = new LowLightExposureProcessor();

    // Zero dimensions -> null (fallback trigger)
    const emptyVideo = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    expect(processor.processFrame(emptyVideo)).toBeNull();

    // Mock Canvas2D context on created canvas
    const width = 4;
    const height = 4;
    const pixelData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = 25;
      pixelData[i + 1] = 25;
      pixelData[i + 2] = 25;
      pixelData[i + 3] = 255;
    }

    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({ data: pixelData, width, height } as ImageData));
    const putImageData = vi.fn();
    const mockCtx = { drawImage, getImageData, putImageData } as unknown as CanvasRenderingContext2D;

    const origCreateElement = document.createElement.bind(document);
    const createdCanvases: HTMLCanvasElement[] = [];
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'canvas') {
        createdCanvases.push(el as HTMLCanvasElement);
        vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(mockCtx);
      }
      return el;
    });

    const validVideo = { videoWidth: width, videoHeight: height } as HTMLVideoElement;
    const out1 = processor.processFrame(validVideo);
    const out2 = processor.processFrame(validVideo);

    expect(out1).not.toBeNull();
    expect(out1).toBe(out2); // Same reusable canvas
    expect(createdCanvases.length).toBe(1);
    expect(putImageData).toHaveBeenCalledTimes(2);
    expect(pixelData[0]).toBeGreaterThan(25); // Boosted luminance
    expect(processor.getState().currentGamma).toBeLessThan(1.0);

    processor.reset();
    expect(processor.getState().smoothedLuminance).toBeNull();
    expect(processor.getState().currentGamma).toBe(1.0);

    processor.dispose();
    expect(createdCanvases[0].width).toBe(0);
    expect(createdCanvases[0].height).toBe(0);

    createSpy.mockRestore();
  });
});

describe('EyeTrackingProvider & CameraHub - Integration & Regression Tests', () => {
  let sendMock: ReturnType<typeof vi.fn>;
  let onResultsCb: ((res: any) => void) | null = null;
  let rafQueue: FrameRequestCallback[] = [];
  let rafIdCounter = 1;

  beforeEach(() => {
    localStorage.clear();
    rafQueue = [];
    sendMock = vi.fn().mockResolvedValue(undefined);
    onResultsCb = null;

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });

    // Mock global FaceMesh loaded already so CDN script load skips
    (window as any).FaceMesh = class MockFaceMesh {
      setOptions = vi.fn();
      onResults = vi.fn((cb: (res: any) => void) => {
        onResultsCb = cb;
      });
      send = sendMock;
    };

    // Mock mediaDevices.getUserMedia
    const mockTrack = { readyState: 'live', stop: vi.fn() };
    const mockStream = {
      active: true,
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
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
    vi.restoreAllMocks();
  });

  function Harness() {
    const { settings, videoRef, setLowLightFilterEnabled, toggleCamera, triggerManualAction, registerGestureCallback } = useEyeTrackingSettings();
    const { setFocusId, triggerSelect } = useEyeNavigationContext();
    const [lastGesture, setLastGesture] = React.useState<string>('NONE');

    React.useEffect(() => {
      return registerGestureCallback((action) => {
        setLastGesture(action);
        return true;
      });
    }, [registerGestureCallback]);

    return (
      <div>
        <span data-testid="low-light-state">{String(settings.lowLightFilterEnabled)}</span>
        <span data-testid="last-gesture">{lastGesture}</span>
        <button data-testid="eye-select-lowlight" onClick={() => {
          setFocusId('btn-camera-hub-low-light');
          triggerSelect();
        }}>
          EyeSelect
        </button>
        <button data-testid="toggle-camera-btn" onClick={() => void toggleCamera()}>
          ToggleCam
        </button>
        <button data-testid="manual-down" onClick={() => triggerManualAction('DOWN')}>
          ManualDown
        </button>
        <button data-testid="force-off" onClick={() => setLowLightFilterEnabled(false)}>
          ForceOff
        </button>
        <CameraHub />
        <CameraPreview className="test-preview" />
        <span data-testid="has-video-ref">{String(Boolean(videoRef.current))}</span>
      </div>
    );
  }

  const flushRafFrame = async (ts: number) => {
    const pending = rafQueue.splice(0, rafQueue.length);
    for (const cb of pending) {
      await cb(ts);
    }
  };

  it('defaults Low-Light filter to OFF, renders single button in CameraHub, and supports mouse + eye-control toggle', async () => {
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    render(
      <EyeTrackingProvider>
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    const toggleBtn = await screen.findByRole('button', { name: /Hỗ trợ thiếu sáng/i });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('low-light-state')).toHaveTextContent('false');
    expect(toggleBtn).toHaveTextContent('OFF');

    // Toggle ON via mouse/touch click
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('low-light-state')).toHaveTextContent('true');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
    expect(toggleBtn).toHaveTextContent('ON');

    // Advance past EyeFocusable 350ms click-debounce, then toggle OFF via EyeNavigationProvider triggerSelect
    fakeNow += 400;
    fireEvent.click(screen.getByTestId('eye-select-lowlight'));
    expect(screen.getByTestId('low-light-state')).toHaveTextContent('false');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    expect(toggleBtn).toHaveTextContent('OFF');

    nowSpy.mockRestore();
  });

  it('bypasses filter completely when OFF, processes canvas & syncs CameraPreview when ON, handles camera restart, and falls back safely on error', async () => {
    const origCreateElement = document.createElement.bind(document);
    let throwOnGetImageData = false;

    const pixelData = new Uint8ClampedArray(640 * 480 * 4);
    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = 30;
      pixelData[i + 1] = 30;
      pixelData[i + 2] = 30;
      pixelData[i + 3] = 255;
    }

    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        if (throwOnGetImageData) {
          throw new Error('Simulated canvas readback failure');
        }
        return { data: pixelData, width: 640, height: 480 } as ImageData;
      }),
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'canvas') {
        vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(mockCtx);
      }
      return el;
    });

    const { container } = render(
      <EyeTrackingProvider>
        <EyeNavigationProvider>
          <Harness />
        </EyeNavigationProvider>
      </EyeTrackingProvider>
    );

    // Wait for camera loop to initialize
    await waitFor(() => {
      expect(rafQueue.length).toBeGreaterThan(0);
    });

    // Configure master hidden video element with readyState=4, 640x480
    const masterVideo = container.parentElement?.querySelector('video[aria-hidden="true"]') as HTMLVideoElement;
    expect(masterVideo).toBeTruthy();
    Object.defineProperty(masterVideo, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(masterVideo, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(masterVideo, 'videoHeight', { configurable: true, value: 480 });

    // 1. Frame with filter OFF -> MUST pass exact raw HTMLVideoElement, no preview canvas rendered
    await act(async () => {
      await flushRafFrame(16);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].image).toBe(masterVideo);
    expect(mockCtx.getImageData).not.toHaveBeenCalled();
    expect(container.querySelector('.test-preview canvas.object-cover')).toBeNull();

    // 2. Toggle filter ON -> MUST pass processed HTMLCanvasElement (640x480) & mount synced CameraPreview canvas
    const toggleBtn = screen.getByRole('button', { name: /Hỗ trợ thiếu sáng/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('low-light-state')).toHaveTextContent('true');
    expect(container.querySelector('.test-preview canvas.object-cover')).not.toBeNull();

    await act(async () => {
      await flushRafFrame(32);
    });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const secondPayload = sendMock.mock.calls[1][0].image;
    expect(secondPayload).toBeInstanceOf(HTMLCanvasElement);
    expect(secondPayload.width).toBe(640);
    expect(secondPayload.height).toBe(480);
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(1);

    // 3. Simulate filter error -> MUST fall back cleanly to masterVideo without breaking tracking loop
    throwOnGetImageData = true;
    await act(async () => {
      await flushRafFrame(48);
    });
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(sendMock.mock.calls[2][0].image).toBe(masterVideo);

    // 4. Rapid toggle OFF -> back to raw video immediately & removes preview canvas
    throwOnGetImageData = false;
    fireEvent.click(screen.getByTestId('force-off'));
    expect(container.querySelector('.test-preview canvas.object-cover')).toBeNull();
    await act(async () => {
      await flushRafFrame(64);
    });
    expect(sendMock).toHaveBeenCalledTimes(4);
    expect(sendMock.mock.calls[3][0].image).toBe(masterVideo);

    // 5. Camera stop & restart lifecycle preserves single FaceMesh instance and resumes cleanly
    await act(async () => {
      fireEvent.click(screen.getByTestId('toggle-camera-btn')); // stop
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('toggle-camera-btn')); // restart
    });
    await act(async () => {
      await flushRafFrame(80);
    });
    expect(sendMock.mock.calls.length).toBeGreaterThanOrEqual(5);

    // 6. Existing manual / gesture dispatch regression check
    fireEvent.click(screen.getByTestId('manual-down'));
    expect(screen.getByTestId('last-gesture')).toHaveTextContent('DOWN');
  });

  it('preserves core analyzeEyes EAR, Iris Ratio, and Confidence outputs unchanged (Regression)', () => {
    const landmarks: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    // Set canonical face & eye landmarks
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

    const metrics = analyzeEyes(landmarks);
    expect(metrics).not.toBeNull();
    expect(metrics!.avgEAR).toBeCloseTo(0.3, 4);
    expect(metrics!.rawGazeX).toBeCloseTo(0, 4);
    expect(metrics!.rawGazeY).toBeCloseTo(0, 4);
    expect(metrics!.faceDetected).toBe(true);
    expect(metrics!.confidence).toBeGreaterThan(0.9);
  });
});
