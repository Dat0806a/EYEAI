import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Mic,
  MapPin,
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import {
  DevicePermissionKey,
  DevicePermissionPreferences,
  readDevicePermissions,
  writeDevicePermissions,
} from '../../modules/permissions/devicePermissions';

export type { DevicePermissionKey };
export type DevicePermissionStatus =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'requesting'
  | 'unsupported';

export interface ImpairedPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  cameraEnabled?: boolean;
  onCameraToggle?: (enabled: boolean) => void;
}

type PermissionStateMap = Record<DevicePermissionKey, DevicePermissionStatus>;

const INITIAL_STATUS: PermissionStateMap = {
  camera: 'prompt',
  microphone: 'prompt',
  geolocation: 'prompt',
};

const STATUS_BADGE_MAP: Record<
  DevicePermissionStatus,
  { label: string; className: string }
> = {
  granted: {
    label: 'Trình duyệt: Đã cấp',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  denied: {
    label: 'Trình duyệt: Đã chặn',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  requesting: {
    label: 'Đang yêu cầu...',
    className: 'bg-sky-100 text-[#0E6C99] border-sky-300',
  },
  unsupported: {
    label: 'Không hỗ trợ',
    className: 'bg-slate-100 text-slate-600 border-slate-300',
  },
  prompt: {
    label: 'Chưa cấp quyền',
    className: 'bg-amber-100 text-amber-900 border-amber-300',
  },
};

const PERMISSION_ITEMS: Array<{
  key: DevicePermissionKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: 'camera',
    title: 'Quyền Camera',
    description: 'Theo dõi ánh mắt & nháy mắt để điều khiển giao diện không cần chạm tay.',
    icon: Camera,
  },
  {
    key: 'microphone',
    title: 'Quyền Micro',
    description: 'Thực hiện cuộc gọi thoại / video trực tiếp với người thân và bác sĩ.',
    icon: Mic,
  },
  {
    key: 'geolocation',
    title: 'Quyền Vị trí (GPS)',
    description: 'Hiển thị bản đồ vị trí hiện tại và gửi tọa độ khẩn cấp khi bật SOS.',
    icon: MapPin,
  },
];

async function queryBrowserPermission(
  name: DevicePermissionKey
): Promise<DevicePermissionStatus> {
  if (typeof navigator === 'undefined') return 'unsupported';

  if (name === 'geolocation' && !navigator.geolocation) {
    return 'unsupported';
  }
  if ((name === 'camera' || name === 'microphone') && !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  if (!navigator.permissions?.query) {
    return 'prompt';
  }

  try {
    const result = await navigator.permissions.query({
      name: name as PermissionName,
    });
    if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
      return result.state;
    }
  } catch {
    // Some browsers (e.g. Safari/Firefox) do not support querying camera/microphone
  }
  return 'prompt';
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const code = 'code' in err ? Number((err as { code?: unknown }).code) : NaN;
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    code === 1
  );
}

/**
 * Popup yêu cầu và cho phép người dùng tự tay bật/tắt các quyền thiết bị
 * (Camera, Micro, Vị trí GPS) khi vào chế độ người suy giảm.
 */
export function ImpairedPermissionsModal({
  isOpen,
  onClose,
  userId,
  cameraEnabled,
  onCameraToggle,
}: ImpairedPermissionsModalProps) {
  const [statuses, setStatuses] = useState<PermissionStateMap>(INITIAL_STATUS);
  const [enabledPrefs, setEnabledPrefs] = useState<DevicePermissionPreferences>(() => ({
    ...readDevicePermissions(userId),
    ...(typeof cameraEnabled === 'boolean' ? { camera: cameraEnabled } : {}),
  }));
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const interactionEpochRef = useRef<number>(0);

  const refreshPermissionStatuses = useCallback(async () => {
    const epoch = interactionEpochRef.current;
    const [camera, microphone, geolocation] = await Promise.all([
      queryBrowserPermission('camera'),
      queryBrowserPermission('microphone'),
      queryBrowserPermission('geolocation'),
    ]);
    if (interactionEpochRef.current !== epoch) return;
    setStatuses({ camera, microphone, geolocation });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    interactionEpochRef.current += 1;
    setFeedbackMessage(null);
    const saved = readDevicePermissions(userId);
    setEnabledPrefs({
      ...saved,
      ...(typeof cameraEnabled === 'boolean' ? { camera: cameraEnabled } : {}),
    });
    void refreshPermissionStatuses();
  }, [isOpen, userId, cameraEnabled, refreshPermissionStatuses]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const requestMediaPermission = useCallback(
    async (key: 'camera' | 'microphone'): Promise<DevicePermissionStatus> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return 'unsupported';
      }
      setStatuses(prev => ({ ...prev, [key]: 'requesting' }));
      try {
        const constraints = key === 'camera' ? { video: true } : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(track => track.stop());
        setStatuses(prev => ({ ...prev, [key]: 'granted' }));
        return 'granted';
      } catch (err) {
        const nextStatus: DevicePermissionStatus = isPermissionDeniedError(err)
          ? 'denied'
          : 'prompt';
        setStatuses(prev => ({ ...prev, [key]: nextStatus }));
        return nextStatus;
      }
    },
    []
  );

  const requestGeolocationPermission = useCallback(async (): Promise<DevicePermissionStatus> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'unsupported';
    }
    setStatuses(prev => ({ ...prev, geolocation: 'requesting' }));
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setStatuses(prev => ({ ...prev, geolocation: 'granted' }));
          resolve('granted');
        },
        err => {
          const nextStatus: DevicePermissionStatus =
            err?.code === 1 ? 'denied' : 'prompt';
          setStatuses(prev => ({ ...prev, geolocation: nextStatus }));
          resolve(nextStatus);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
  }, []);

  const requestSinglePermission = useCallback(
    async (key: DevicePermissionKey): Promise<DevicePermissionStatus> => {
      interactionEpochRef.current += 1;
      setFeedbackMessage(null);
      if (key === 'geolocation') {
        return requestGeolocationPermission();
      }
      return requestMediaPermission(key);
    },
    [requestGeolocationPermission, requestMediaPermission]
  );

  const persistPrefs = useCallback(
    (nextPrefs: DevicePermissionPreferences) => {
      setEnabledPrefs(nextPrefs);
      writeDevicePermissions(nextPrefs, userId);
      if (onCameraToggle) {
        onCameraToggle(nextPrefs.camera);
      }
    },
    [userId, onCameraToggle]
  );

  const handleToggleItem = async (key: DevicePermissionKey) => {
    if (isApplying || statuses[key] === 'requesting' || statuses[key] === 'unsupported') {
      return;
    }

    interactionEpochRef.current += 1;
    setFeedbackMessage(null);

    const currentlyEnabled = enabledPrefs[key];
    if (currentlyEnabled) {
      const nextPrefs = { ...enabledPrefs, [key]: false };
      persistPrefs(nextPrefs);
      return;
    }

    // Turning ON
    if (statuses[key] === 'granted') {
      const nextPrefs = { ...enabledPrefs, [key]: true };
      persistPrefs(nextPrefs);
      return;
    }

    // Needs browser permission first
    const result = await requestSinglePermission(key);
    if (result === 'granted') {
      const nextPrefs = { ...enabledPrefs, [key]: true };
      persistPrefs(nextPrefs);
    } else if (result === 'denied') {
      const nextPrefs = { ...enabledPrefs, [key]: false };
      persistPrefs(nextPrefs);
      setFeedbackMessage(
        'Một số quyền đã bị chặn trên trình duyệt. Bạn có thể bấm biểu tượng ổ khóa trên thanh địa chỉ để cấp lại quyền bất cứ lúc nào.'
      );
    }
  };

  const handleConfirmAndContinue = async () => {
    interactionEpochRef.current += 1;
    setIsApplying(true);
    setFeedbackMessage(null);

    const nextPrefs = { ...enabledPrefs };
    let anyDenied = false;

    for (const item of PERMISSION_ITEMS) {
      if (!nextPrefs[item.key]) continue;
      if (statuses[item.key] === 'granted' || statuses[item.key] === 'unsupported') {
        continue;
      }
      const result = await requestSinglePermission(item.key);
      if (result !== 'granted') {
        nextPrefs[item.key] = false;
        if (result === 'denied') anyDenied = true;
      }
    }

    persistPrefs(nextPrefs);
    setIsApplying(false);

    if (anyDenied) {
      setFeedbackMessage(
        'Một số quyền đã bị chặn trên trình duyệt. Bạn có thể bấm biểu tượng ổ khóa trên thanh địa chỉ để cấp lại quyền bất cứ lúc nào.'
      );
      return;
    }

    onClose();
  };

  if (!isOpen) return null;

  const hasPendingBrowserPrompt = PERMISSION_ITEMS.some(
    item => enabledPrefs[item.key] && statuses[item.key] === 'prompt'
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impaired-permissions-modal-title"
      className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-[#14213D]/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white rounded-[28px] p-5 sm:p-6 border-2 border-[#14213D]/15 shadow-[0_24px_48px_rgba(20,33,61,0.28)] text-[#14213D] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#6AC9F0]/20 border border-[#6AC9F0]/60 flex items-center justify-center text-[#0E6C99] shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2
                id="impaired-permissions-modal-title"
                className="text-lg sm:text-xl font-black text-[#14213D]"
              >
                Cấp quyền cho chế độ Người suy giảm
              </h2>
              <p className="text-xs font-bold text-[#3B4B68] mt-0.5">
                Tích chọn bật hoặc tắt các quyền thiết bị theo nhu cầu sử dụng của bạn.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng yêu cầu quyền hạn"
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-[#14213D] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission Items List with Manual Toggle Switches */}
        <div className="py-4 space-y-3">
          {PERMISSION_ITEMS.map(item => {
            const Icon = item.icon;
            const status = statuses[item.key];
            const badge = STATUS_BADGE_MAP[status];
            const isUnsupported = status === 'unsupported';
            const isRequesting = status === 'requesting';
            const isChecked = !isUnsupported && enabledPrefs[item.key];

            return (
              <div
                key={item.key}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 flex items-center justify-between gap-3 transition-colors ${
                  isChecked
                    ? 'bg-[#FFF2D6]/55 border-[#6AC9F0]/60'
                    : 'bg-slate-50/80 border-[#14213D]/10'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#14213D]/12 flex items-center justify-center text-[#14213D] shrink-0 shadow-2xs">
                    <Icon className="w-5 h-5 text-[#0E6C99]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-sm sm:text-base text-[#14213D]">
                        {item.title}
                      </h3>
                      <span
                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#3B4B68] mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Interactive ON/OFF Switch */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {isRequesting ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#0E6C99] px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xin...</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChecked}
                      aria-label={`Bật hoặc tắt ${item.title}`}
                      disabled={isUnsupported || isApplying}
                      onClick={() => void handleToggleItem(item.key)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border-2 font-black text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isChecked
                          ? 'bg-[#6AC9F0]/25 border-[#0E6C99] text-[#14213D]'
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          isChecked ? 'bg-[#0E6C99]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                            isChecked ? 'translate-x-4.5' : 'translate-x-1'
                          }`}
                        />
                      </span>
                      <span className="min-w-[26px] text-left">
                        {isChecked ? 'Bật' : 'Tắt'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {feedbackMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{feedbackMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            id="btn-permissions-skip"
            onClick={onClose}
            disabled={isApplying}
            className="flex-1 min-h-[48px] px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#14213D] font-extrabold text-sm cursor-pointer disabled:opacity-60 transition-colors"
          >
            Để sau
          </button>

          <button
            type="button"
            id="btn-permissions-grant-all"
            onClick={() => void handleConfirmAndContinue()}
            disabled={isApplying}
            className="flex-1 min-h-[48px] px-4 py-3 rounded-2xl bg-[#6AC9F0] hover:bg-[#5bbce3] text-[#14213D] font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-60 transition-colors"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang áp dụng...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {hasPendingBrowserPrompt ? 'Cấp quyền & Tiếp tục' : 'Lưu & Tiếp tục'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
