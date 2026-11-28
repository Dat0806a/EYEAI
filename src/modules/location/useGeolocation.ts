import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEVICE_PERMISSIONS_CHANGED_EVENT,
  isDevicePermissionEnabled,
  readDevicePermissions,
  writeDevicePermissions,
} from '../permissions/devicePermissions';

export type GeolocationStatus =
  | 'REQUESTING_PERMISSION'
  | 'LOCATING'
  | 'LOCATED'
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'ERROR';

export interface LocationCoords {
  lat: number;
  lng: number;
}

export interface GeolocationState {
  status: GeolocationStatus;
  coords: LocationCoords;
  accuracy: number | null;
  errorMessage: string | null;
  isRealGps: boolean;
}

// Fallback center if GPS is not available (Ho Chi Minh City, Vietnam)
const FALLBACK_COORDS: LocationCoords = {
  lat: 10.7769,
  lng: 106.7009,
};

export function useGeolocation(enableWatch: boolean = false, userId?: string | null) {
  const [state, setState] = useState<GeolocationState>({
    status: 'REQUESTING_PERMISSION',
    coords: FALLBACK_COORDS,
    accuracy: null,
    errorMessage: null,
    isRealGps: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const requestSeqRef = useRef<number>(0);

  const clearActiveWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const requestLocation = useCallback(
    (bypassAppSetting: boolean = false) => {
      const seq = ++requestSeqRef.current;

      if (!bypassAppSetting && !isDevicePermissionEnabled('geolocation', userId)) {
        clearActiveWatch();
        setState((prev) => ({
          ...prev,
          status: 'PERMISSION_DENIED',
          errorMessage: 'Quyền vị trí (GPS) đang được tắt trong cài đặt.',
          isRealGps: false,
        }));
        return;
      }

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        clearActiveWatch();
        setState((prev) => ({
          ...prev,
          status: 'PERMISSION_DENIED',
          errorMessage: 'Trình duyệt yêu cầu kết nối HTTPS an toàn để bật định vị GPS.',
          isRealGps: false,
        }));
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setState({
          status: 'UNAVAILABLE',
          coords: FALLBACK_COORDS,
          accuracy: null,
          errorMessage: 'Trình duyệt không hỗ trợ dịch vụ vị trí GPS.',
          isRealGps: false,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'LOCATING',
        errorMessage: null,
      }));

      const highAccuracyOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 15000,
      };

      const fallbackOptions: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60000,
      };

      const startWatch = () => {
        if (!enableWatch || watchIdRef.current !== null || !navigator.geolocation) return;
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            if (seq !== requestSeqRef.current) return;
            const { latitude, longitude, accuracy } = position.coords;
            setState((prev) => {
              const distanceMoved = Math.hypot(
                latitude - prev.coords.lat,
                longitude - prev.coords.lng
              );
              if (distanceMoved < 0.00005 && prev.status === 'LOCATED') {
                return prev;
              }
              return {
                status: 'LOCATED',
                coords: { lat: latitude, lng: longitude },
                accuracy: accuracy || null,
                errorMessage: null,
                isRealGps: true,
              };
            });
          },
          (watchError) => {
            if (seq !== requestSeqRef.current) return;
            if (watchError.code === watchError.PERMISSION_DENIED) {
              clearActiveWatch();
              setState((prev) => ({
                ...prev,
                status: 'PERMISSION_DENIED',
                errorMessage:
                  'Quyền truy cập vị trí bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt.',
                isRealGps: false,
              }));
            }
            // Keep existing fix if we already have a real GPS position and only hit transient watch timeout/unavailable
          },
          fallbackOptions
        );
      };

      const handleSuccess = (position: GeolocationPosition) => {
        if (seq !== requestSeqRef.current) return;
        const { latitude, longitude, accuracy } = position.coords;

        setState({
          status: 'LOCATED',
          coords: { lat: latitude, lng: longitude },
          accuracy: accuracy || null,
          errorMessage: null,
          isRealGps: true,
        });
        startWatch();
      };

      const mapErrorState = (error: GeolocationPositionError) => {
        if (seq !== requestSeqRef.current) return;
        let status: GeolocationStatus = 'ERROR';
        let message = 'Không thể xác định vị trí hiện tại.';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            status = 'PERMISSION_DENIED';
            message =
              'Quyền truy cập vị trí bị từ chối. Vui lòng bấm biểu tượng ổ khóa trên thanh địa chỉ để cho phép Vị trí.';
            break;
          case error.POSITION_UNAVAILABLE:
            status = 'UNAVAILABLE';
            message = 'Thiết bị hiện chưa nhận được tín hiệu GPS hoặc Dịch vụ vị trí đang tắt.';
            break;
          case error.TIMEOUT:
            status = 'TIMEOUT';
            message = 'Yêu cầu vị trí bị quá thời gian. Vui lòng thử định vị lại.';
            break;
        }

        setState((prev) => ({
          ...prev,
          status,
          errorMessage: message,
        }));
      };

      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (firstError) => {
          if (seq !== requestSeqRef.current) return;
          if (firstError.code === firstError.PERMISSION_DENIED) {
            mapErrorState(firstError);
            return;
          }
          // Fallback to network / low-accuracy geolocation (fixes Windows/desktop timeouts)
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            mapErrorState,
            fallbackOptions
          );
        },
        highAccuracyOptions
      );
    },
    [enableWatch, userId, clearActiveWatch]
  );

  const enableAndRefreshLocation = useCallback(() => {
    const currentPrefs = readDevicePermissions(userId);
    if (!currentPrefs.geolocation) {
      // writeDevicePermissions dispatches DEVICE_PERMISSIONS_CHANGED_EVENT which invokes requestLocation()
      writeDevicePermissions({ ...currentPrefs, geolocation: true }, userId);
      return;
    }
    requestLocation(true);
  }, [userId, requestLocation]);

  useEffect(() => {
    requestLocation();

    const handlePermissionChange = () => {
      requestLocation();
    };
    window.addEventListener(DEVICE_PERMISSIONS_CHANGED_EVENT, handlePermissionChange);

    return () => {
      window.removeEventListener(DEVICE_PERMISSIONS_CHANGED_EVENT, handlePermissionChange);
      clearActiveWatch();
    };
  }, [requestLocation, clearActiveWatch]);

  return {
    ...state,
    refreshLocation: () => requestLocation(false),
    enableAndRefreshLocation,
  };
}
