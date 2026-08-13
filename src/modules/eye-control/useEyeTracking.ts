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

export function useAudioSettings() {
  const ctx = useEyeTrackingSettingsContext();
  return {
    speakerEnabled: ctx.settings.speakerEnabled,
    speechVolume: ctx.settings.speechVolume,
    speechRate: ctx.settings.speechRate,
    setSpeakerEnabled: ctx.setSpeakerEnabled,
    setSpeechVolume: ctx.setSpeechVolume,
    setSpeechRate: ctx.setSpeechRate,
  };
}
