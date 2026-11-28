import { ALLOWED_PATIENT_ROUTES } from '../policy/permissionPolicy';
import {
  AgentApplicationContext,
  AgentTaskState,
  PatientRuntimeSnapshot,
  SemanticElement,
} from '../types/agentTypes';

const ROUTE_TITLES: Record<string, string> = {
  'patient-home': 'Trang chủ Bệnh nhân',
  'patient-scan': 'Quét giấy xét nghiệm',
  'patient-review': 'Rà soát kết quả OCR',
  'patient-analysis': 'Giải thích & Gợi ý Y tế',
  'patient-history': 'Lịch sử xét nghiệm',
};

export function buildSanitizedApplicationContext(params: {
  stateVersion: number;
  stateEpoch: number;
  currentRoute: string;
  previousRoute: string | null;
  runtimeSnapshot: PatientRuntimeSnapshot;
  taskState: AgentTaskState;
  activeActionSummary: string | null;
  manualIntervention: boolean;
  pendingConfirmation: boolean;
  pendingUserGesture: boolean;
  semanticElements: SemanticElement[];
}): AgentApplicationContext {
  const {
    stateVersion,
    stateEpoch,
    currentRoute,
    previousRoute,
    runtimeSnapshot,
    taskState,
    activeActionSummary,
    manualIntervention,
    pendingConfirmation,
    pendingUserGesture,
    semanticElements,
  } = params;

  const isBusy =
    taskState === 'PLANNING' ||
    taskState === 'EXECUTING' ||
    taskState === 'OBSERVING' ||
    taskState === 'VERIFYING' ||
    taskState === 'WAITING_FOR_RESULT';

  return {
    stateVersion,
    stateEpoch,
    currentRoute,
    previousRoute,
    currentScreen: ROUTE_TITLES[currentRoute] || 'Màn hình Bệnh nhân',
    verifiedState: {
      ...runtimeSnapshot,
      currentRoute,
    },
    pendingState: {
      isBusy,
      taskState,
      activeAction: activeActionSummary,
    },
    errorStatus: runtimeSnapshot.errorStatus,
    manualIntervention,
    pendingConfirmation,
    pendingUserGesture,
    availableControlsCount: semanticElements.length,
    availableRoutes: [...ALLOWED_PATIENT_ROUTES],
  };
}
