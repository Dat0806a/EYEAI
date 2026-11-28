export type PatientRouteName =
  | 'patient-home'
  | 'patient-scan'
  | 'patient-review'
  | 'patient-analysis'
  | 'patient-history';

export type AgentTaskState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'VERIFYING'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_GESTURE'
  | 'WAITING_FOR_RESULT'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AgentSafetyClassification =
  | 'read_only'
  | 'low_risk'
  | 'user_gesture_required'
  | 'confirmation_required'
  | 'restricted'
  | 'forbidden'
  | 'not_verified';

export interface SemanticElement {
  ref: string;
  role: string;
  label: string;
  description?: string;
  group?: string;
  visible: boolean;
  enabled: boolean;
  selected?: boolean;
  valuePreview?: string;
  inputType?: string;
  requiresUserGesture: boolean;
  requiresConfirmation: boolean;
  safetyClassification: AgentSafetyClassification;
  stateEpoch: number;
}

export interface VerifiedLabHighlight {
  testCode: string;
  testName: string;
  value: string | number;
  unit: string;
  status: string;
  referenceText: string | null;
}

export interface PatientRuntimeSnapshot {
  currentRoute: string;
  selectedImageName: string | null;
  hasSelectedImage: boolean;
  cameraStatus: 'idle' | 'requesting' | 'active' | 'captured' | 'denied' | 'error';
  uploadStatus: 'idle' | 'uploading' | 'done' | 'error';
  ocrStatus: 'idle' | 'running' | 'ready' | 'error';
  reviewRequired: boolean;
  uncertainCount: number;
  ocrResultCount: number;
  analysisStatus: 'idle' | 'running' | 'ready' | 'error';
  activeReportId: string | null;
  currentResultTab: 'analysis' | 'meal' | 'exercise' | null;
  reportSummary: string | null;
  labHighlights: VerifiedLabHighlight[];
  mealTitles: string[];
  exerciseTitles: string[];
  recommendationCounts: {
    results: number;
    meals: number;
    exercises: number;
  };
  selectedItem: string | null;
  recentReportsCount: number;
  lastPickerCancelledAt?: number | null;
  errorStatus: string | null;
}

export interface AgentApplicationContext {
  stateVersion: number;
  stateEpoch: number;
  currentRoute: string;
  previousRoute: string | null;
  currentScreen: string;
  verifiedState: PatientRuntimeSnapshot;
  pendingState: {
    isBusy: boolean;
    taskState: AgentTaskState;
    activeAction: string | null;
  };
  errorStatus: string | null;
  manualIntervention: boolean;
  pendingConfirmation: boolean;
  pendingUserGesture: boolean;
  availableControlsCount: number;
  availableRoutes: PatientRouteName[];
}

export type GenericActionType =
  | 'observe_workspace'
  | 'inspect_context'
  | 'activate_element'
  | 'set_input_value'
  | 'select_option'
  | 'select_list_item'
  | 'navigate_view'
  | 'scroll_surface'
  | 'wait_for_state'
  | 'request_user_gesture'
  | 'request_confirmation'
  | 'clarify_user'
  | 'cancel_task'
  | 'finish_task';

export interface GenericAction {
  actionId: string;
  type: GenericActionType;
  targetRef?: string;
  value?: string;
  route?: PatientRouteName;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  condition?: string;
  timeoutMs?: number;
  reason?: string;
  label?: string;
  summary?: string;
}

export interface ConfirmationRequest {
  confirmationId: string;
  title: string;
  summary: string;
  details?: string[];
  action: GenericAction;
  contextVersion: number;
}

export interface UserGestureRequest {
  gestureId: string;
  title: string;
  description: string;
  buttonLabel: string;
  gestureKind: 'file_picker' | 'camera_open' | 'media_play' | 'element_activation';
  targetRef?: string;
  contextVersion: number;
}

export type AgentDecision =
  | {
      type: 'respond';
      message: string;
    }
  | {
      type: 'clarify';
      question: string;
    }
  | {
      type: 'action';
      action: GenericAction;
      announcement?: string;
    }
  | {
      type: 'confirm';
      request: ConfirmationRequest;
    }
  | {
      type: 'gesture';
      request: UserGestureRequest;
    }
  | {
      type: 'complete';
      message: string;
    }
  | {
      type: 'cancel';
      reason: string;
    };

export interface ActionExecutionRecord {
  actionId: string;
  sessionId: string;
  taskId: string;
  contextVersion: number;
  actionType: GenericActionType;
  targetRef?: string;
  success: boolean;
  verified: boolean;
  outcomeSummary: string;
  errorClassification?: string;
  timestamp: string;
}

export interface AgentConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  source?: 'text' | 'voice';
  kind?: 'chat' | 'progress' | 'clarification' | 'confirmation' | 'gesture' | 'error';
}
