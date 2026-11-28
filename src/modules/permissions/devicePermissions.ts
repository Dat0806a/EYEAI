export interface DevicePermissionPreferences {
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
}

export type DevicePermissionKey = keyof DevicePermissionPreferences;

export const DEVICE_PERMISSIONS_CHANGED_EVENT = 'eyetalk:device-permissions-changed';

function getStorageKey(userId?: string | null): string {
  return `luckydream_device_permissions_${userId || 'default'}`;
}

export function getDefaultDevicePermissions(): DevicePermissionPreferences {
  let cameraDefault = true;
  if (typeof window !== 'undefined') {
    const savedEye = localStorage.getItem('luckydream_eye_enabled');
    if (savedEye !== null) {
      cameraDefault = savedEye === 'true';
    }
  }
  return {
    camera: cameraDefault,
    microphone: true,
    geolocation: true,
  };
}

export function readDevicePermissions(userId?: string | null): DevicePermissionPreferences {
  const defaults = getDefaultDevicePermissions();
  if (typeof window === 'undefined') return defaults;

  try {
    const raw =
      localStorage.getItem(getStorageKey(userId)) ??
      localStorage.getItem(getStorageKey(null));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DevicePermissionPreferences>;
    return {
      camera: typeof parsed.camera === 'boolean' ? parsed.camera : defaults.camera,
      microphone:
        typeof parsed.microphone === 'boolean' ? parsed.microphone : defaults.microphone,
      geolocation:
        typeof parsed.geolocation === 'boolean' ? parsed.geolocation : defaults.geolocation,
    };
  } catch {
    return defaults;
  }
}

export function writeDevicePermissions(
  prefs: DevicePermissionPreferences,
  userId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(prefs);
    localStorage.setItem(getStorageKey(userId), serialized);
    localStorage.setItem(getStorageKey(null), serialized);
    window.dispatchEvent(
      new CustomEvent(DEVICE_PERMISSIONS_CHANGED_EVENT, { detail: prefs })
    );
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function isDevicePermissionEnabled(
  key: DevicePermissionKey,
  userId?: string | null
): boolean {
  return readDevicePermissions(userId)[key];
}
