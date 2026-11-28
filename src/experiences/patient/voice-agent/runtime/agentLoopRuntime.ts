import {
  ActionExecutionRecord,
  AgentDecision,
  AgentTaskState,
  ConfirmationRequest,
  GenericAction,
  UserGestureRequest,
} from '../types/agentTypes';
import { ObservationSnapshot, scanPatientWorkspace } from '../observation/semanticObserver';
import { buildSanitizedApplicationContext } from '../context/applicationContextEngine';
import { getPatientRuntimeSnapshot } from '../context/patientRuntimeStore';
import { executeGenericAction } from '../execution/genericActionExecutor';
import {
  buildPlannerConversationHistory,
  summarizeRecentActionHistory,
} from '../memory/conversationMemory';
import { requestAgentPlannerTurn, PlanTurnRequest, PlanTurnResponse } from '../planning/agentPlannerClient';

export const MAX_STEPS_PER_SEGMENT = 8;
export const MAX_CONSECUTIVE_IDENTICAL_ACTIONS = 2;

export interface AgentLoopHooks {
  sessionId: string;
  taskId: string;
  userMessage: string;
  userGoal: string;
  getCurrentRoute: () => string;
  getPreviousRoute: () => string | null;
  getStateEpoch: () => number;
  bumpStateEpoch: () => number;
  getStateVersion: () => number;
  getMessages: () => any[];
  getActionHistory: () => ActionExecutionRecord[];
  pushActionRecord: (record: ActionExecutionRecord) => void;
  setTaskState: (state: AgentTaskState) => void;
  setActiveActionSummary: (summary: string | null) => void;
  addAssistantMessage: (content: string, kind?: 'chat' | 'progress' | 'clarification' | 'error') => void;
  setPendingConfirmation: (req: ConfirmationRequest | null) => void;
  setPendingGesture: (req: UserGestureRequest | null) => void;
  minimizePopup: () => void;
  openPopup: () => void;
  speakIfEnabled: (text: string) => void;
  navigateTo: (route: string, params?: Record<string, any>) => void;
  isAgentActingRef: { current: boolean };
  isManualInterventionTriggered: () => boolean;
  abortSignal: AbortSignal;
  plannerFn?: (payload: PlanTurnRequest, signal?: AbortSignal) => Promise<PlanTurnResponse>;
}

function getActionFingerprint(action: GenericAction): string {
  return `${action.type}:${action.route || ''}:${action.targetRef || ''}:${action.value || ''}:${action.condition || ''}`;
}

export async function runAutonomousAgentLoop(hooks: AgentLoopHooks): Promise<void> {
  const planner = hooks.plannerFn || requestAgentPlannerTurn;
  let lastActionKey = '';
  let consecutiveSameCount = 0;

  for (let stepIndex = 0; stepIndex < MAX_STEPS_PER_SEGMENT; stepIndex++) {
    if (hooks.abortSignal.aborted || hooks.isManualInterventionTriggered()) {
      return;
    }

    // 1. OBSERVE
    hooks.setTaskState('OBSERVING');
    const epoch = hooks.getStateEpoch();
    let observation: ObservationSnapshot = scanPatientWorkspace(hooks.getCurrentRoute(), epoch);
    const context = buildSanitizedApplicationContext({
      stateVersion: hooks.getStateVersion(),
      stateEpoch: epoch,
      currentRoute: hooks.getCurrentRoute(),
      previousRoute: hooks.getPreviousRoute(),
      runtimeSnapshot: getPatientRuntimeSnapshot(),
      taskState: 'PLANNING',
      activeActionSummary: null,
      manualIntervention: hooks.isManualInterventionTriggered(),
      pendingConfirmation: false,
      pendingUserGesture: false,
      semanticElements: observation.elements,
    });

    // 2. UNDERSTAND & PLAN
    hooks.setTaskState('PLANNING');
    hooks.setActiveActionSummary('Đang phân tích ngữ cảnh và lập kế hoạch...');

    const turnId = `turn_${hooks.taskId}_${stepIndex}_${Date.now()}`;
    let decision: AgentDecision;

    try {
      const resp = await planner(
        {
          sessionId: hooks.sessionId,
          taskId: hooks.taskId,
          turnId,
          userMessage: hooks.userMessage,
          userGoal: hooks.userGoal,
          conversationHistory: buildPlannerConversationHistory(hooks.getMessages()),
          applicationContext: context,
          semanticElements: observation.elements,
          actionHistory: summarizeRecentActionHistory(hooks.getActionHistory()),
          stepIndex,
          maxSteps: MAX_STEPS_PER_SEGMENT,
        },
        hooks.abortSignal
      );
      decision = resp.decision;
    } catch (err: any) {
      if (hooks.abortSignal.aborted || err?.name === 'AbortError') {
        return;
      }
      const errMsg = err?.message || 'Không thể kết nối AI Planner.';
      hooks.setTaskState('FAILED');
      hooks.setActiveActionSummary(null);
      hooks.openPopup();
      hooks.addAssistantMessage(errMsg, 'error');
      return;
    }

    if (hooks.abortSignal.aborted || hooks.isManualInterventionTriggered()) {
      return;
    }

    // 3. HANDLE DECISION
    if (decision.type === 'respond') {
      hooks.setTaskState('COMPLETED');
      hooks.setActiveActionSummary(null);
      hooks.addAssistantMessage(decision.message, 'chat');
      hooks.speakIfEnabled(decision.message);
      return;
    }

    if (decision.type === 'clarify') {
      hooks.setTaskState('WAITING_FOR_USER');
      hooks.setActiveActionSummary(null);
      hooks.openPopup();
      hooks.addAssistantMessage(decision.question, 'clarification');
      hooks.speakIfEnabled(decision.question);
      return;
    }

    if (decision.type === 'confirm') {
      hooks.setTaskState('WAITING_FOR_USER');
      hooks.setActiveActionSummary(null);
      hooks.openPopup();
      hooks.setPendingConfirmation(decision.request);
      hooks.speakIfEnabled(decision.request.summary);
      return;
    }

    if (decision.type === 'gesture') {
      hooks.minimizePopup();
      hooks.setTaskState('WAITING_FOR_GESTURE');
      hooks.setActiveActionSummary(decision.request.title);
      hooks.setPendingGesture(decision.request);
      hooks.speakIfEnabled(decision.request.description);
      return;
    }

    if (decision.type === 'complete') {
      hooks.setTaskState('COMPLETED');
      hooks.setActiveActionSummary(decision.message);
      hooks.addAssistantMessage(decision.message, 'chat');
      hooks.speakIfEnabled(decision.message);
      // Do NOT force-reopen popup if minimized so patient can view camera/meals/videos/results uninterrupted!
      return;
    }

    if (decision.type === 'cancel') {
      hooks.setTaskState('CANCELLED');
      hooks.setActiveActionSummary(null);
      hooks.addAssistantMessage(decision.reason, 'progress');
      hooks.speakIfEnabled(decision.reason);
      return;
    }

    if (decision.type === 'action') {
      const action = decision.action;
      const fp = getActionFingerprint(action);
      if (fp === lastActionKey) {
        consecutiveSameCount += 1;
      } else {
        lastActionKey = fp;
        consecutiveSameCount = 1;
      }

      if (consecutiveSameCount > MAX_CONSECUTIVE_IDENTICAL_ACTIONS) {
        hooks.setTaskState('FAILED');
        hooks.setActiveActionSummary(null);
        const msg = 'Tôi phát hiện thao tác lặp lại không thay đổi được giao diện nên đã dừng để tránh vòng lặp.';
        hooks.openPopup();
        hooks.addAssistantMessage(msg, 'error');
        hooks.speakIfEnabled(msg);
        return;
      }

      if (decision.announcement) {
        hooks.setActiveActionSummary(decision.announcement);
      }

      // Minimize popup before executing visible UI actions so the patient watches the real UI update
      const isUiAction =
        action.type !== 'observe_workspace' &&
        action.type !== 'inspect_context' &&
        action.type !== 'clarify_user';
      if (isUiAction) {
        hooks.minimizePopup();
      }

      // 4. ACT & VERIFY
      hooks.setTaskState(action.type === 'wait_for_state' ? 'WAITING_FOR_RESULT' : 'EXECUTING');
      const outcome = await executeGenericAction(action, {
        sessionId: hooks.sessionId,
        taskId: hooks.taskId,
        contextVersion: hooks.getStateVersion(),
        currentRoute: hooks.getCurrentRoute(),
        observation,
        isAgentActingRef: hooks.isAgentActingRef,
        navigateTo: hooks.navigateTo,
        refreshObservation: () => {
          const nextEpoch = hooks.bumpStateEpoch();
          observation = scanPatientWorkspace(hooks.getCurrentRoute(), nextEpoch);
          return observation;
        },
        abortSignal: hooks.abortSignal,
      });

      hooks.pushActionRecord(outcome.record);

      if (outcome.requiresConfirmation) {
        hooks.setTaskState('WAITING_FOR_USER');
        hooks.setActiveActionSummary(null);
        hooks.openPopup();
        hooks.setPendingConfirmation({
          confirmationId: `conf_${Date.now()}`,
          title: 'Xác nhận thao tác y tế',
          summary: outcome.record.outcomeSummary,
          action,
          contextVersion: hooks.getStateVersion(),
        });
        return;
      }

      if (outcome.requiresUserGesture) {
        const targetEl = observation.elements.find((e) => e.ref === action.targetRef);
        hooks.setTaskState('WAITING_FOR_GESTURE');
        hooks.setActiveActionSummary(targetEl?.label || 'Cần chạm xác nhận');
        hooks.setPendingGesture({
          gestureId: `gest_${Date.now()}`,
          title: targetEl?.label || 'Mở chức năng thiết bị',
          description: `Vui lòng chạm vào nút "${targetEl?.label || 'Thực hiện'}" để trình duyệt cho phép.`,
          buttonLabel: targetEl?.label || 'Thực hiện ngay',
          gestureKind: 'element_activation',
          targetRef: action.targetRef,
          contextVersion: hooks.getStateVersion(),
        });
        return;
      }

      // Allow React route transition / DOM render to settle before next OBSERVE iteration
      hooks.setTaskState('VERIFYING');
      await new Promise((r) => setTimeout(r, 80));
      hooks.bumpStateEpoch();
    }
  }

  // Max automatic steps reached
  hooks.setTaskState('PAUSED');
  hooks.setActiveActionSummary(null);
  const limitMsg = 'Tôi đã hoàn tất các bước tự động tối đa cho lượt này. Bạn muốn tôi làm gì tiếp theo?';
  hooks.addAssistantMessage(limitMsg, 'progress');
  hooks.speakIfEnabled(limitMsg);
}
