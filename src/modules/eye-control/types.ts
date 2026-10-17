export type EyeAction =
  | 'NEXT'
  | 'BACK'
  | 'UP'
  | 'DOWN'
  | 'RIGHT'
  | 'LEFT'
  | 'SELECT'
  | 'ESCAPE'
  | 'DOUBLE_BLINK'
  | 'NONE';

export type GazeDirection = 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'UNKNOWN';

export type CalibrationStep = 'idle' | 'countdown' | 'center' | 'up' | 'down' | 'left' | 'right' | 'completed';

export interface EyeCalibrationData {
  neutralEAR: number;
  blinkThreshold: number;
  neutralIrisH: number;
  neutralIrisV: number;
  upIrisV?: number;
  downIrisV?: number;
  leftIrisH?: number;
  rightIrisH?: number;
  thresholdH: number;
  thresholdV: number;
  thresholdUp?: number;
  thresholdDown?: number;
  thresholdLeft?: number;
  thresholdRight?: number;
  neutralYaw?: number;
  neutralPitch?: number;
  isCalibrated: boolean;
  calibrationDate?: string;
}

export interface OverlayDisplaySettings {
  showMesh: boolean;
  showEyes: boolean;
  showIris: boolean;
  showGazeVector?: boolean;
}

export interface EyeTrackingState {
  rawEAR: number;
  leftEAR: number;
  rightEAR: number;
  blinkThreshold: number;
  baselineEAR: number;
  gazeDirection: GazeDirection;
  directionH: 'LEFT' | 'RIGHT' | 'CENTER';
  directionV: 'UP' | 'DOWN' | 'CENTER';
  currentAction: EyeAction;
  lastExecutedAction: EyeAction;
  lastExecutedTimestamp: number;
  actionProgress: number; // 0 to 100 for visual dwell loading
  lastActionTriggered: string;
  faceDetected: boolean;
  cameraActive: boolean;
  eyesClosed: boolean; // true = NHẮM, false = MỞ
  blinkCount: number;  // 0, 1, 2 in current gesture window
  blinkWindowRemainingMs: number; // Remaining time in 1.5s window (0 if idle)
  closedDuration: number; // in seconds (e.g. 0.0, 0.4, 1.8)
  cameraError: string | null;
  rawGazeX: number;
  rawGazeY: number;
  gazeX: number; // Normalized filtered horizontal gaze (-1 to +1)
  gazeY: number; // Normalized filtered vertical gaze (-1 to +1)
  headYaw: number;
  headPitch: number;
  confidence: number;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
  reArmed: boolean;
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

