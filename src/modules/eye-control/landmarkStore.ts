import type { Point } from './eyeTracker';
import type { LowLightExposureProcessor } from './lowLightFilter';

export type LowLightFilterStats = ReturnType<LowLightExposureProcessor['getState']>;

/**
 * Module-scoped ephemeral store for high-frequency facial landmarks and low-light telemetry.
 * Replaces global `window.__eyeai_latest_landmarks` and `window.__eyeai_lowlight_stats`
 * so sensitive biometric coordinates are encapsulated inside the module boundary and
 * cleared on session teardown. Note: module scoping reduces accidental/third-party script
 * exposure via `window`, though it does not defend against same-origin XSS or DevTools.
 */
let latestLandmarks: readonly Point[] | null = null;
let latestLowLightStats: Readonly<LowLightFilterStats> | null = null;
let activeOwnerToken = 0;

export function bindEphemeralStoreSession(sessionToken: number): void {
  activeOwnerToken = sessionToken;
}

export function setEphemeralLandmarks(sessionToken: number, landmarks: Point[] | null | undefined): void {
  if (sessionToken !== activeOwnerToken) return;
  if (!landmarks || landmarks.length === 0) {
    latestLandmarks = null;
    return;
  }
  latestLandmarks = Object.freeze(
    landmarks.map((pt) => Object.freeze({ x: pt.x, y: pt.y, z: pt.z ?? 0 }))
  );
}

export function setEphemeralLowLightStats(sessionToken: number, stats: LowLightFilterStats | null): void {
  if (sessionToken !== activeOwnerToken) return;
  latestLowLightStats = stats ? Object.freeze({ ...stats }) : null;
}

export function clearEphemeralEyeData(sessionToken?: number): void {
  if (sessionToken !== undefined && sessionToken !== activeOwnerToken) {
    return;
  }
  latestLandmarks = null;
  latestLowLightStats = null;
}

export function getLatestLandmarks(): readonly Point[] | null {
  return latestLandmarks;
}

export function getLatestLowLightStats(): Readonly<LowLightFilterStats> | null {
  return latestLowLightStats;
}
