export type EyeAction = 'NEXT' | 'BACK' | 'UP' | 'DOWN' | 'SELECT' | 'NONE';

export interface EyeCalibrationData {
  neutralEAR: number;
  blinkThreshold: number;
  neutralIrisH: number;
  neutralIrisV: number;
  isCalibrated: boolean;
}

export interface EyeTrackingState {
  rawEAR: number;
  leftEAR: number;
  rightEAR: number;
  directionH: 'LEFT' | 'RIGHT' | 'CENTER';
  directionV: 'UP' | 'DOWN' | 'CENTER';
  currentAction: EyeAction;
  actionProgress: number; // 0 to 100 for visual timer loading
  lastActionTriggered: string;
  faceDetected: boolean;
  cameraActive: boolean;
  eyesClosed: boolean; // true = NHẮM, false = MỞ
  blinkCount: number;  // 0, 1, 2, 3 in current gesture window
  closedDuration: number; // in seconds (e.g. 0.0, 0.4, 1.8, 8.0)
  cameraError: string | null;
}

export interface EyeControlSettings {
  eyeControlEnabled: boolean;
  dwellTimeMs: number;
  soundFeedback: boolean;
  simulatorMode: boolean;
  speakerEnabled: boolean;
  speechVolume: number;
  speechRate: number;
}

export interface EyeFocusNode {
  id: string;
  element: HTMLElement;
  groupId?: string;
  scopeId?: string | null;
  row?: number;
  col?: number;
  onSelect?: () => void;
}
