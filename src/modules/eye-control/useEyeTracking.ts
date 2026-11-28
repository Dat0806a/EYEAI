import {
  useEyeTrackingSettingsContext,
  useEyeTrackingTelemetryContext,
  useEyeTrackingContext,
} from './EyeTrackingProvider';

/**
 * Ham moc chi doc cau hinh, du lieu hieu chuan, tham chieu camera va cac ham dieu khien theo doi mat.
 * Tach rieng khoi du lieu cam bien thoi gian thuc giup cac nut bam khong bi ve lai 15 lan moi giay.
 */
export function useEyeTrackingSettings() {
  return useEyeTrackingSettingsContext();
}

/**
 * Ham moc chi doc du lieu cam bien mat thoi gian thuc (`trackingState`: `EAR`, huong nhin, so lan chop...).
 * Chi dung cho cac thanh trang thai theo doi nhu `GlobalEyeHUD`, `CameraHub`, `SosPage`.
 */
export function useEyeTrackingTelemetry() {
  return useEyeTrackingTelemetryContext();
}

/**
 * Ham moc gop ca cau hinh va du lieu cam bien cho cac man hinh quan tri can ca hai (vi du `SettingsPage`).
 */
export function useEyeTracking() {
  return useEyeTrackingContext();
}

/**
 * Ham moc tien ich rut trich rieng cau hinh loa va giong doc tieng Viet tu ngu canh cau hinh.
 */
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
