export type GridItemType = 'phrase' | 'letter' | 'action';

export interface GridItem {
  id: string;
  type: GridItemType;
  label: string;
  value: string;
  colorClass?: string; // custom Tailwind style for visual hierarchy
}

export type EyeAction = 'NEXT' | 'BACK' | 'UP' | 'DOWN' | 'SELECT' | 'NONE';

export interface EyeCalibrationData {
  neutralEAR: number;
  blinkThreshold: number;
  neutralIrisH: number; // left-right look baseline
  neutralIrisV: number; // up-down look baseline
  isCalibrated: boolean;
}

export interface EyeTrackingState {
  rawEAR: number;
  directionH: 'LEFT' | 'RIGHT' | 'CENTER';
  directionV: 'UP' | 'DOWN' | 'CENTER';
  currentAction: EyeAction;
  actionProgress: number; // 0 to 100 for visual timer loading
  lastActionTriggered: string;
  faceDetected: boolean;
  cameraActive: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: Date;
}
