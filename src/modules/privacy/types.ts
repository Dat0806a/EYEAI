export const PRIVACY_POLICY_VERSION = '1.0.0';

export type ConsentType = 'face_processing' | 'calibration_storage';

export type ConsentAction = 'GRANTED' | 'REVOKED' | 'EXPIRED_POLICY' | 'DATA_DELETED';

export type ConsentTrigger =
  | 'consent_modal'
  | 'privacy_dashboard'
  | 'camera_toggle'
  | 'calibration_action'
  | 'multi_tab_sync'
  | 'policy_update'
  | 'account_logout';

export interface ConsentRecord {
  granted: boolean;
  policyVersion: string;
  updatedAt: string | null;
  consentId: string | null;
}

export interface UserConsentState {
  userId: string;
  faceProcessing: ConsentRecord;
  calibrationStorage: ConsentRecord;
}

export interface ConsentLogEntry {
  consentId: string;
  consentType: ConsentType | 'local_data';
  policyVersion: string;
  action: ConsentAction;
  timestamp: string;
  userId: string;
  trigger: ConsentTrigger;
}
