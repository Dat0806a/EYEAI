import {
  PRIVACY_POLICY_VERSION,
  ConsentType,
  ConsentAction,
  ConsentTrigger,
  ConsentRecord,
  UserConsentState,
  ConsentLogEntry,
} from './types';

const CONSENT_STORAGE_PREFIX = 'eyeai_privacy_consent_v1_';
const CONSENT_LOG_STORAGE_PREFIX = 'eyeai_privacy_consent_log_v1_';
const CALIBRATION_STORAGE_PREFIX = 'eyeai_calibration_profile_v1_';
const PRIVACY_SYNC_CHANNEL = 'eyeai_privacy_sync_v1';
const CONSENT_EVENT_NAME = 'eyeai:consent-changed';
const MAX_CONSENT_LOG_ENTRIES = 50;

const LEGACY_CALIBRATION_KEYS = ['eyeai_calibration', 'luckydream_eye_calibration'] as const;
const EYE_CONTROL_PREF_KEYS = [
  'luckydream_eye_enabled',
  'luckydream_eye_settings',
  'luckydream_overlay_settings',
] as const;

function createEmptyRecord(): ConsentRecord {
  return {
    granted: false,
    policyVersion: PRIVACY_POLICY_VERSION,
    updatedAt: null,
    consentId: null,
  };
}

export function createEmptyConsentState(userId: string | null): UserConsentState {
  return {
    userId: userId || '',
    faceProcessing: createEmptyRecord(),
    calibrationStorage: createEmptyRecord(),
  };
}

export function getConsentStorageKey(userId: string): string {
  return `${CONSENT_STORAGE_PREFIX}${userId}`;
}

export function getConsentLogStorageKey(userId: string): string {
  return `${CONSENT_LOG_STORAGE_PREFIX}${userId}`;
}

function generateConsentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidConsentRecord(rec: unknown): rec is ConsentRecord {
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as Record<string, unknown>;
  if (typeof r.granted !== 'boolean') return false;
  if (typeof r.policyVersion !== 'string') return false;
  if (r.updatedAt !== null && typeof r.updatedAt !== 'string') return false;
  if (r.consentId !== null && typeof r.consentId !== 'string') return false;
  return true;
}

function normalizeRecordForPolicy(rec: unknown): ConsentRecord {
  if (!isValidConsentRecord(rec)) {
    return createEmptyRecord();
  }
  if (rec.policyVersion !== PRIVACY_POLICY_VERSION) {
    return {
      granted: false,
      policyVersion: PRIVACY_POLICY_VERSION,
      updatedAt: rec.updatedAt,
      consentId: rec.consentId,
    };
  }
  return rec;
}

/**
 * Reads the persisted consent state for a specific authenticated user.
 * Fails closed (all consents false) if userId is missing, JSON is corrupt, or policy version mismatches.
 */
export function getConsentState(userId: string | null): UserConsentState {
  if (!userId || typeof localStorage === 'undefined') {
    return createEmptyConsentState(userId);
  }
  try {
    const raw = localStorage.getItem(getConsentStorageKey(userId));
    if (!raw) {
      return createEmptyConsentState(userId);
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || parsed.userId !== userId) {
      return createEmptyConsentState(userId);
    }
    return {
      userId,
      faceProcessing: normalizeRecordForPolicy(parsed.faceProcessing),
      calibrationStorage: normalizeRecordForPolicy(parsed.calibrationStorage),
    };
  } catch {
    return createEmptyConsentState(userId);
  }
}

export function hasValidFaceProcessingConsent(userId: string | null): boolean {
  if (!userId) return false;
  const state = getConsentState(userId);
  return (
    state.faceProcessing.granted === true &&
    state.faceProcessing.policyVersion === PRIVACY_POLICY_VERSION
  );
}

export function hasValidCalibrationStorageConsent(userId: string | null): boolean {
  if (!userId) return false;
  const state = getConsentState(userId);
  return (
    state.calibrationStorage.granted === true &&
    state.calibrationStorage.policyVersion === PRIVACY_POLICY_VERSION
  );
}

export function getConsentLogs(userId: string | null): ConsentLogEntry[] {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getConsentLogStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ConsentLogEntry =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.consentId === 'string' &&
        typeof item.consentType === 'string' &&
        typeof item.policyVersion === 'string' &&
        typeof item.action === 'string' &&
        typeof item.timestamp === 'string' &&
        item.userId === userId &&
        typeof item.trigger === 'string'
    );
  } catch {
    return [];
  }
}

export function appendConsentLog(
  userId: string,
  entry: {
    consentId?: string;
    consentType: ConsentType | 'local_data';
    action: ConsentAction;
    trigger: ConsentTrigger;
  }
): ConsentLogEntry[] {
  if (!userId || typeof localStorage === 'undefined') return [];
  const nextEntry: ConsentLogEntry = {
    consentId: entry.consentId || generateConsentId(),
    consentType: entry.consentType,
    policyVersion: PRIVACY_POLICY_VERSION,
    action: entry.action,
    timestamp: new Date().toISOString(),
    userId,
    trigger: entry.trigger,
  };
  const existing = getConsentLogs(userId);
  const updated = [nextEntry, ...existing].slice(0, MAX_CONSENT_LOG_ENTRIES);
  try {
    localStorage.setItem(getConsentLogStorageKey(userId), JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}

function broadcastConsentChange(userId: string, state: UserConsentState) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(CONSENT_EVENT_NAME, {
        detail: { userId, state },
      })
    );
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(PRIVACY_SYNC_CHANNEL);
      channel.postMessage({ type: 'CONSENT_UPDATED', userId, state });
      channel.close();
    } catch {
      // BroadcastChannel may be unavailable in restricted contexts
    }
  }
}

function saveConsentState(userId: string, state: UserConsentState) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getConsentStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
  broadcastConsentChange(userId, state);
}

/**
 * Grants a specific independent consent layer for the authenticated user.
 */
export function grantConsent(
  userId: string,
  type: ConsentType,
  trigger: ConsentTrigger = 'consent_modal'
): UserConsentState {
  if (!userId) return createEmptyConsentState(null);
  const current = getConsentState(userId);
  const consentId = generateConsentId();
  const updatedAt = new Date().toISOString();
  const record: ConsentRecord = {
    granted: true,
    policyVersion: PRIVACY_POLICY_VERSION,
    updatedAt,
    consentId,
  };

  const next: UserConsentState = {
    userId,
    faceProcessing: type === 'face_processing' ? record : current.faceProcessing,
    calibrationStorage: type === 'calibration_storage' ? record : current.calibrationStorage,
  };

  saveConsentState(userId, next);
  appendConsentLog(userId, {
    consentId,
    consentType: type,
    action: 'GRANTED',
    trigger,
  });
  return next;
}

/**
 * Revokes a specific consent layer.
 * If calibration_storage is revoked, deletes the user's persisted calibration profile immediately.
 */
export function revokeConsent(
  userId: string,
  type: ConsentType,
  trigger: ConsentTrigger = 'privacy_dashboard'
): UserConsentState {
  if (!userId) return createEmptyConsentState(null);
  const current = getConsentState(userId);
  const consentId = generateConsentId();
  const updatedAt = new Date().toISOString();
  const record: ConsentRecord = {
    granted: false,
    policyVersion: PRIVACY_POLICY_VERSION,
    updatedAt,
    consentId,
  };

  const next: UserConsentState = {
    userId,
    faceProcessing: type === 'face_processing' ? record : current.faceProcessing,
    calibrationStorage: type === 'calibration_storage' ? record : current.calibrationStorage,
  };

  if (type === 'calibration_storage' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(`${CALIBRATION_STORAGE_PREFIX}${userId}`);
    } catch {
      // Ignore
    }
  }

  saveConsentState(userId, next);
  appendConsentLog(userId, {
    consentId,
    consentType: type,
    action: 'REVOKED',
    trigger,
  });
  return next;
}

/**
 * Deletes all Eye Control local data scoped to the current user (plus identified legacy Eye Control keys).
 * Never uses localStorage.clear() and never touches Patient or Supabase auth storage.
 */
export function clearUserEyeControlLocalData(userId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(`${CALIBRATION_STORAGE_PREFIX}${userId}`);
      localStorage.removeItem(getConsentStorageKey(userId));
      localStorage.removeItem(getConsentLogStorageKey(userId));
    }
    for (const key of LEGACY_CALIBRATION_KEYS) {
      localStorage.removeItem(key);
    }
    for (const key of EYE_CONTROL_PREF_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
  if (userId) {
    broadcastConsentChange(userId, createEmptyConsentState(userId));
  }
}

/**
 * Subscribes to same-tab and multi-tab consent changes for the given userId.
 */
export function subscribeConsentChanges(
  userId: string | null,
  onChange: (state: UserConsentState) => void
): () => void {
  if (typeof window === 'undefined' || !userId) {
    return () => {};
  }

  const targetKey = getConsentStorageKey(userId);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === targetKey || e.key === null) {
      onChange(getConsentState(userId));
    }
  };

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ userId: string; state: UserConsentState }>).detail;
    if (!detail || detail.userId === userId) {
      onChange(getConsentState(userId));
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(CONSENT_EVENT_NAME, handleCustomEvent);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(PRIVACY_SYNC_CHANNEL);
      channel.onmessage = (msg) => {
        if (msg?.data?.type === 'CONSENT_UPDATED' && msg?.data?.userId === userId) {
          onChange(getConsentState(userId));
        }
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CONSENT_EVENT_NAME, handleCustomEvent);
    if (channel) {
      try {
        channel.close();
      } catch {
        // Ignore
      }
    }
  };
}
