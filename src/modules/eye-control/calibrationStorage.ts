import { EyeCalibrationData } from './types';
import { hasValidCalibrationStorageConsent } from '../privacy/consentService';

export const CALIBRATION_SCHEMA_VERSION = 1;
export const CALIBRATION_STORAGE_PREFIX = 'eyeai_calibration_profile_v1_';
export const DEFAULT_CALIBRATION_RETENTION_DAYS = 90;
export const DEFAULT_CALIBRATION_RETENTION_MS =
  DEFAULT_CALIBRATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const LEGACY_UNSCOPED_KEYS = ['eyeai_calibration', 'luckydream_eye_calibration'] as const;

export interface StoredCalibrationProfileV1 {
  schemaVersion: 1;
  userId: string;
  updatedAt: number;
  neutralEAR: number;
  blinkThreshold: number;
  thresholdUp: number;
  thresholdDown: number;
  thresholdLeft: number;
  thresholdRight: number;
}

export const DEFAULT_CALIBRATION_DATA: EyeCalibrationData = {
  neutralEAR: 0.25,
  blinkThreshold: 0.15,
  neutralIrisH: 0.0,
  neutralIrisV: 0.0,
  thresholdH: 0.026,
  thresholdV: 0.018,
  thresholdUp: 0.018,
  thresholdDown: 0.018,
  thresholdLeft: 0.026,
  thresholdRight: 0.026,
  isCalibrated: false,
};

export function getCalibrationStorageKey(userId: string): string {
  return `${CALIBRATION_STORAGE_PREFIX}${userId}`;
}

/**
 * Removes legacy un-scoped Eye Control calibration keys without assigning them to any user.
 * Never uses localStorage.clear().
 */
export function cleanupLegacyCalibrationKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of LEGACY_UNSCOPED_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateStoredCalibrationProfile(
  raw: unknown,
  expectedUserId: string,
  retentionMs: number = DEFAULT_CALIBRATION_RETENTION_MS
): StoredCalibrationProfileV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== CALIBRATION_SCHEMA_VERSION) return null;
  if (typeof obj.userId !== 'string' || obj.userId !== expectedUserId) return null;

  const now = Date.now();
  if (
    typeof obj.updatedAt !== 'number' ||
    !Number.isFinite(obj.updatedAt) ||
    obj.updatedAt <= 0 ||
    obj.updatedAt > now + 60_000 ||
    now - obj.updatedAt > retentionMs
  ) {
    return null;
  }

  if (!isFiniteInRange(obj.neutralEAR, 0.12, 0.48)) return null;
  if (!isFiniteInRange(obj.blinkThreshold, 0.10, 0.32)) return null;
  if (!isFiniteInRange(obj.thresholdUp, 0.010, 0.040)) return null;
  if (!isFiniteInRange(obj.thresholdDown, 0.010, 0.040)) return null;
  if (!isFiniteInRange(obj.thresholdLeft, 0.015, 0.050)) return null;
  if (!isFiniteInRange(obj.thresholdRight, 0.015, 0.050)) return null;

  return {
    schemaVersion: 1,
    userId: expectedUserId,
    updatedAt: obj.updatedAt,
    neutralEAR: obj.neutralEAR,
    blinkThreshold: obj.blinkThreshold,
    thresholdUp: obj.thresholdUp,
    thresholdDown: obj.thresholdDown,
    thresholdLeft: obj.thresholdLeft,
    thresholdRight: obj.thresholdRight,
  };
}

export interface LoadedCalibrationResult {
  data: EyeCalibrationData;
  persisted: boolean;
  storedProfile: StoredCalibrationProfileV1 | null;
}

/**
 * Loads user-scoped calibration profile ONLY if userId is authenticated and
 * Calibration Storage Consent is valid. Otherwise fails closed to RAM defaults.
 */
export function loadCalibrationProfile(
  userId: string | null,
  retentionMs: number = DEFAULT_CALIBRATION_RETENTION_MS
): LoadedCalibrationResult {
  cleanupLegacyCalibrationKeys();

  if (!userId || !hasValidCalibrationStorageConsent(userId) || typeof localStorage === 'undefined') {
    return {
      data: { ...DEFAULT_CALIBRATION_DATA },
      persisted: false,
      storedProfile: null,
    };
  }

  try {
    const rawText = localStorage.getItem(getCalibrationStorageKey(userId));
    if (!rawText) {
      return {
        data: { ...DEFAULT_CALIBRATION_DATA },
        persisted: false,
        storedProfile: null,
      };
    }
    const parsed = JSON.parse(rawText);
    const validated = validateStoredCalibrationProfile(parsed, userId, retentionMs);
    if (!validated) {
      return {
        data: { ...DEFAULT_CALIBRATION_DATA },
        persisted: false,
        storedProfile: null,
      };
    }

    const clampedUp = Math.max(0.016, Math.min(validated.thresholdUp, 0.026));
    const clampedDown = Math.max(0.016, Math.min(validated.thresholdDown, 0.026));
    const clampedLeft = Math.max(0.024, Math.min(validated.thresholdLeft, 0.036));
    const clampedRight = Math.max(0.024, Math.min(validated.thresholdRight, 0.036));

    return {
      persisted: true,
      storedProfile: validated,
      data: {
        neutralEAR: validated.neutralEAR,
        blinkThreshold: validated.blinkThreshold,
        neutralIrisH: 0.0,
        neutralIrisV: 0.0,
        thresholdUp: clampedUp,
        thresholdDown: clampedDown,
        thresholdLeft: clampedLeft,
        thresholdRight: clampedRight,
        thresholdV: (clampedUp + clampedDown) / 2,
        thresholdH: (clampedLeft + clampedRight) / 2,
        isCalibrated: false, // Preserve existing dynamic auto-centering on fresh startup
      },
    };
  } catch {
    return {
      data: { ...DEFAULT_CALIBRATION_DATA },
      persisted: false,
      storedProfile: null,
    };
  }
}

/**
 * Persists minimal calibration thresholds to user-scoped localStorage ONLY when
 * Calibration Storage Consent is valid. Raw landmarks, frames, and gaze history are never stored.
 */
export function saveCalibrationProfile(
  userId: string | null,
  data: EyeCalibrationData
): { saved: boolean; profile?: StoredCalibrationProfileV1; reason?: string } {
  if (!userId) {
    return { saved: false, reason: 'NO_USER' };
  }
  if (!hasValidCalibrationStorageConsent(userId)) {
    return { saved: false, reason: 'NO_CONSENT' };
  }
  if (typeof localStorage === 'undefined') {
    return { saved: false, reason: 'NO_STORAGE' };
  }

  const profile: StoredCalibrationProfileV1 = {
    schemaVersion: 1,
    userId,
    updatedAt: Date.now(),
    neutralEAR: Number.isFinite(data.neutralEAR) ? data.neutralEAR : DEFAULT_CALIBRATION_DATA.neutralEAR,
    blinkThreshold: Number.isFinite(data.blinkThreshold)
      ? data.blinkThreshold
      : DEFAULT_CALIBRATION_DATA.blinkThreshold,
    thresholdUp: Number.isFinite(data.thresholdUp)
      ? (data.thresholdUp as number)
      : DEFAULT_CALIBRATION_DATA.thresholdV,
    thresholdDown: Number.isFinite(data.thresholdDown)
      ? (data.thresholdDown as number)
      : DEFAULT_CALIBRATION_DATA.thresholdV,
    thresholdLeft: Number.isFinite(data.thresholdLeft)
      ? (data.thresholdLeft as number)
      : DEFAULT_CALIBRATION_DATA.thresholdH,
    thresholdRight: Number.isFinite(data.thresholdRight)
      ? (data.thresholdRight as number)
      : DEFAULT_CALIBRATION_DATA.thresholdH,
  };

  const validated = validateStoredCalibrationProfile(profile, userId);
  if (!validated) {
    return { saved: false, reason: 'VALIDATION_FAILED' };
  }

  try {
    localStorage.setItem(getCalibrationStorageKey(userId), JSON.stringify(validated));
    return { saved: true, profile: validated };
  } catch {
    return { saved: false, reason: 'STORAGE_WRITE_ERROR' };
  }
}

export function deleteCalibrationProfile(userId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(getCalibrationStorageKey(userId));
    }
    cleanupLegacyCalibrationKeys();
  } catch {
    // Ignore
  }
}

export function readPersistedCalibrationProfile(
  userId: string | null,
  retentionMs: number = DEFAULT_CALIBRATION_RETENTION_MS
): StoredCalibrationProfileV1 | null {
  if (!userId || !hasValidCalibrationStorageConsent(userId) || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(getCalibrationStorageKey(userId));
    if (!raw) return null;
    return validateStoredCalibrationProfile(JSON.parse(raw), userId, retentionMs);
  } catch {
    return null;
  }
}
