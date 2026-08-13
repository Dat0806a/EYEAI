import { useState, useEffect, useCallback, useRef } from 'react';

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

export function useGeolocation(enableWatch: boolean = false) {
  const [state, setState] = useState<GeolocationState>({
    status: 'REQUESTING_PERMISSION',
    coords: FALLBACK_COORDS,
    accuracy: null,
    errorMessage: null,
    isRealGps: false,
  });

  const watchIdRef = useRef<number | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
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

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;

      setState({
        status: 'LOCATED',
        coords: { lat: latitude, lng: longitude },
        accuracy: accuracy || null,
        errorMessage: null,
        isRealGps: true,
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      let status: GeolocationStatus = 'ERROR';
      let message = 'Không thể xác định vị trí hiện tại.';

      switch (error.code) {
        case error.PERMISSION_DENIED:
          status = 'PERMISSION_DENIED';
          message = 'Quyền truy cập vị trí bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt.';
          break;
        case error.POSITION_UNAVAILABLE:
          status = 'UNAVAILABLE';
          message = 'Tín hiệu GPS hiện không khả dụng.';
          break;
        case error.TIMEOUT:
          status = 'TIMEOUT';
          message = 'Yêu cầu vị trí bị quá thời gian. Đang thử lại...';
          break;
      }

      setState((prev) => ({
        ...prev,
        status,
        errorMessage: message,
      }));
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);

    if (enableWatch && !watchIdRef.current) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          // Only trigger state updates if moved significantly to prevent React render storms
          setState((prev) => {
            const distanceMoved = Math.hypot(
              latitude - prev.coords.lat,
              longitude - prev.coords.lng
            );
            if (distanceMoved < 0.00005 && prev.status === 'LOCATED') {
              return prev; // No significant movement
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
        handleError,
        options
      );
    }
  }, [enableWatch]);

  useEffect(() => {
    requestLocation();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [requestLocation]);

  return {
    ...state,
    refreshLocation: requestLocation,
  };
}
