import {
  useEyeTrackingSettingsContext,
  useEyeTrackingTelemetryContext,
  useEyeTrackingContext,
} from './EyeTrackingProvider';

export function useEyeTrackingSettings() {
  return useEyeTrackingSettingsContext();
}

export function useEyeTrackingTelemetry() {
  return useEyeTrackingTelemetryContext();
}

export function useEyeTracking() {
  return useEyeTrackingContext();
}
