import {
  ActionExecutionRecord,
  GenericAction,
  PatientRuntimeSnapshot,
} from '../types/agentTypes';
import {
  ObservationSnapshot,
  scanPatientWorkspace,
  validateFreshReference,
} from '../observation/semanticObserver';
import { evaluateActionPolicy, isAllowedPatientRoute } from '../policy/permissionPolicy';
import {
  getPatientRuntimeSnapshot,
  subscribePatientRuntimeSnapshot,
} from '../context/patientRuntimeStore';

export interface ExecutorContext {
  sessionId: string;
  taskId: string;
  contextVersion: number;
  currentRoute: string;
  observation: ObservationSnapshot;
  isAgentActingRef: { current: boolean };
  navigateTo: (route: string, params?: Record<string, any>) => void;
  refreshObservation: () => ObservationSnapshot;
  abortSignal?: AbortSignal;
}

export interface ExecutionOutcome {
  record: ActionExecutionRecord;
  requiresConfirmation?: boolean;
  requiresUserGesture?: boolean;
  updatedObservation?: ObservationSnapshot;
}

function setReactInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setReactSelectValue(el: HTMLSelectElement, value: string): boolean {
  const matchedOption = Array.from(el.options).find(
    (opt) => opt.value === value || opt.text.trim().toLowerCase() === value.trim().toLowerCase()
  );
  if (!matchedOption) return false;
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, matchedOption.value);
  } else {
    el.value = matchedOption.value;
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function matchWaitCondition(condition: string, snap: PatientRuntimeSnapshot): boolean {
  const c = condition.toLowerCase();
  if (c.includes('ocr_ready') || c.includes('ocr_complete')) {
    return snap.ocrStatus === 'ready' || snap.currentRoute === 'patient-review';
  }
  if (c.includes('analysis_ready') || c.includes('analysis_complete')) {
    if (snap.analysisStatus === 'running') return false;
    return snap.analysisStatus === 'ready' || (snap.currentRoute === 'patient-analysis' && snap.reportSummary !== null);
  }
  if (c.includes('camera_active')) {
    return snap.cameraStatus === 'active' || snap.cameraStatus === 'captured';
  }
  if (c.startsWith('route:')) {
    return snap.currentRoute === condition.slice('route:'.length).trim();
  }
  if (c.startsWith('tab:')) {
    return snap.currentResultTab === condition.slice('tab:'.length).trim();
  }
  return false;
}

async function waitForStableObservation(
  refreshObservation: () => ObservationSnapshot,
  abortSignal?: AbortSignal,
  maxWaitMs = 360
): Promise<ObservationSnapshot> {
  let obs = refreshObservation();
  if (obs.elements.length > 0 || abortSignal?.aborted) {
    return obs;
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline && !abortSignal?.aborted) {
    await new Promise((r) => setTimeout(r, 45));
    obs = refreshObservation();
    if (obs.elements.length > 0) {
      return obs;
    }
  }
  return obs;
}

async function waitForRuntimeCondition(
  condition: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<{ met: boolean; snapshot: PatientRuntimeSnapshot }> {
  const current = getPatientRuntimeSnapshot();
  if (matchWaitCondition(condition, current)) {
    return { met: true, snapshot: current };
  }

  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (met: boolean) => {
      if (done) return;
      done = true;
      unsub();
      if (timer) clearTimeout(timer);
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      resolve({ met, snapshot: getPatientRuntimeSnapshot() });
    };

    const onAbort = () => finish(false);
    if (abortSignal) {
      if (abortSignal.aborted) {
        resolve({ met: false, snapshot: current });
        return;
      }
      abortSignal.addEventListener('abort', onAbort);
    }

    const unsub = subscribePatientRuntimeSnapshot(() => {
      const latest = getPatientRuntimeSnapshot();
      if (matchWaitCondition(condition, latest) || latest.errorStatus) {
        finish(matchWaitCondition(condition, latest));
      }
    });

    timer = setTimeout(() => finish(false), Math.min(Math.max(timeoutMs, 200), 15000));
  });
}

export async function executeGenericAction(
  action: GenericAction,
  ctx: ExecutorContext,
  options?: { confirmedByUser?: boolean }
): Promise<ExecutionOutcome> {
  const makeRecord = (
    success: boolean,
    verified: boolean,
    outcomeSummary: string,
    errorClassification?: string
  ): ActionExecutionRecord => ({
    actionId: action.actionId,
    sessionId: ctx.sessionId,
    taskId: ctx.taskId,
    contextVersion: ctx.contextVersion,
    actionType: action.type,
    targetRef: action.targetRef,
    success,
    verified,
    outcomeSummary,
    errorClassification,
    timestamp: new Date().toISOString(),
  });

  if (ctx.abortSignal?.aborted) {
    return {
      record: makeRecord(false, false, 'Tác vụ đã bị hủy trước khi thực thi.', 'CANCELLED'),
    };
  }

  switch (action.type) {
    case 'observe_workspace': {
      const nextObs = scanPatientWorkspace(ctx.currentRoute, ctx.observation.stateEpoch + 1);
      return {
        record: makeRecord(true, true, `Đã quan sát ${nextObs.elements.length} phần tử trên giao diện.`),
        updatedObservation: nextObs,
      };
    }

    case 'inspect_context': {
      const snap = getPatientRuntimeSnapshot();
      return {
        record: makeRecord(
          true,
          true,
          `Màn hình hiện tại: ${ctx.currentRoute}, OCR: ${snap.ocrStatus}, Phân tích: ${snap.analysisStatus}.`
        ),
      };
    }

    case 'navigate_view': {
      const policy = evaluateActionPolicy(action);
      if (!policy.allowed || !isAllowedPatientRoute(action.route)) {
        return {
          record: makeRecord(
            false,
            false,
            policy.reason || 'Điều hướng bị từ chối.',
            'FORBIDDEN_ROUTE'
          ),
        };
      }
      ctx.isAgentActingRef.current = true;
      try {
        ctx.navigateTo(action.route);
      } finally {
        setTimeout(() => {
          ctx.isAgentActingRef.current = false;
        }, 50);
      }
      const nextObs = ctx.refreshObservation();
      return {
        record: makeRecord(true, true, `Đã điều hướng tới màn hình ${action.route}.`),
        updatedObservation: nextObs,
      };
    }

    case 'scroll_surface': {
      const dir = action.direction || 'down';
      const workspace = document.querySelector('[data-patient-workspace="true"]');
      if (typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
        if (dir === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (dir === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        else window.scrollBy({ top: dir === 'up' ? -360 : 360, behavior: 'smooth' });
      } else if (workspace) {
        workspace.scrollTop += dir === 'up' ? -360 : 360;
      }
      return {
        record: makeRecord(true, true, `Đã cuộn giao diện (${dir}).`),
      };
    }

    case 'wait_for_state': {
      const cond = action.condition || 'ocr_ready';
      const timeoutMs = action.timeoutMs ?? 8000;
      const res = await waitForRuntimeCondition(cond, timeoutMs, ctx.abortSignal);
      const nextObs = ctx.refreshObservation();
      if (res.met) {
        return {
          record: makeRecord(true, true, `Đã xác minh trạng thái "${cond}" đạt yêu cầu.`),
          updatedObservation: nextObs,
        };
      }
      return {
        record: makeRecord(
          false,
          false,
          res.snapshot.errorStatus || `Hết thời gian chờ trạng thái "${cond}".`,
          res.snapshot.errorStatus ? 'STATE_ERROR' : 'WAIT_TIMEOUT'
        ),
        updatedObservation: nextObs,
      };
    }

    case 'activate_element':
    case 'select_list_item': {
      const check = validateFreshReference(ctx.observation, action.targetRef || '', ctx.observation.stateEpoch);
      if (check.valid === false) {
        return {
          record: makeRecord(false, false, check.reason, 'STALE_OR_MISSING_REF'),
        };
      }
      const policy = evaluateActionPolicy(action, check.entry.semantic);
      if (!policy.allowed) {
        return {
          record: makeRecord(false, false, policy.reason || 'Không đủ quyền thao tác.', 'POLICY_DENIED'),
        };
      }
      if (policy.requiresUserGesture) {
        return {
          record: makeRecord(false, false, 'Cần xác nhận một chạm trực tiếp của người dùng.', 'USER_GESTURE_REQUIRED'),
          requiresUserGesture: true,
        };
      }
      if (policy.requiresConfirmation && !options?.confirmedByUser) {
        return {
          record: makeRecord(false, false, 'Cần xác nhận an toàn từ người dùng trước khi thực hiện.', 'CONFIRMATION_REQUIRED'),
          requiresConfirmation: true,
        };
      }

      const el = check.entry.element;
      const beforeSelected = check.entry.semantic.selected;
      ctx.isAgentActingRef.current = true;
      try {
        el.click();
      } finally {
        setTimeout(() => {
          ctx.isAgentActingRef.current = false;
        }, 50);
      }

      // Allow React state microtask flush before observing verification
      await new Promise((r) => setTimeout(r, 30));
      const nextObs = ctx.refreshObservation();
      const postEntry = nextObs.registry.get(action.targetRef || '');
      const selectionChanged =
        postEntry && beforeSelected !== undefined && postEntry.semantic.selected !== beforeSelected;

      return {
        record: makeRecord(
          true,
          true,
          selectionChanged
            ? `Đã chọn "${check.entry.semantic.label}" và xác minh trạng thái đã thay đổi.`
            : `Đã kích hoạt "${check.entry.semantic.label}".`
        ),
        updatedObservation: nextObs,
      };
    }

    case 'set_input_value': {
      const check = validateFreshReference(ctx.observation, action.targetRef || '', ctx.observation.stateEpoch);
      if (check.valid === false) {
        return {
          record: makeRecord(false, false, check.reason, 'STALE_OR_MISSING_REF'),
        };
      }
      const policy = evaluateActionPolicy(action, check.entry.semantic);
      if (!policy.allowed) {
        return {
          record: makeRecord(false, false, policy.reason || 'Không đủ quyền nhập liệu.', 'POLICY_DENIED'),
        };
      }
      if (policy.requiresConfirmation && !options?.confirmedByUser) {
        return {
          record: makeRecord(false, false, 'Chỉnh sửa dữ liệu y tế cần xác nhận từ người dùng.', 'CONFIRMATION_REQUIRED'),
          requiresConfirmation: true,
        };
      }
      const el = check.entry.element;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        return {
          record: makeRecord(false, false, 'Phần tử mục tiêu không phải ô nhập liệu.', 'INVALID_TARGET'),
        };
      }
      const val = action.value ?? '';
      ctx.isAgentActingRef.current = true;
      try {
        setReactInputValue(el, val);
      } finally {
        setTimeout(() => {
          ctx.isAgentActingRef.current = false;
        }, 50);
      }
      const verified = el.value === val;
      const nextObs = ctx.refreshObservation();
      return {
        record: makeRecord(
          verified,
          verified,
          verified ? `Đã cập nhật giá trị cho "${check.entry.semantic.label}".` : 'Không thể xác minh giá trị sau khi nhập.'
        ),
        updatedObservation: nextObs,
      };
    }

    case 'select_option': {
      const check = validateFreshReference(ctx.observation, action.targetRef || '', ctx.observation.stateEpoch);
      if (check.valid === false) {
        return {
          record: makeRecord(false, false, check.reason, 'STALE_OR_MISSING_REF'),
        };
      }
      const policy = evaluateActionPolicy(action, check.entry.semantic);
      if (!policy.allowed) {
        return {
          record: makeRecord(false, false, policy.reason || 'Không được phép chọn mục này.', 'POLICY_DENIED'),
        };
      }
      const el = check.entry.element;
      if (!(el instanceof HTMLSelectElement)) {
        return {
          record: makeRecord(false, false, 'Phần tử không phải danh sách chọn.', 'INVALID_TARGET'),
        };
      }
      ctx.isAgentActingRef.current = true;
      let ok = false;
      try {
        ok = setReactSelectValue(el, action.value ?? '');
      } finally {
        setTimeout(() => {
          ctx.isAgentActingRef.current = false;
        }, 50);
      }
      const nextObs = ctx.refreshObservation();
      return {
        record: makeRecord(
          ok,
          ok,
          ok
            ? `Đã chọn "${action.value}" trong "${check.entry.semantic.label}".`
            : `Không tìm thấy tùy chọn "${action.value}".`,
          ok ? undefined : 'OPTION_NOT_FOUND'
        ),
        updatedObservation: nextObs,
      };
    }

    case 'request_confirmation':
      return {
        record: makeRecord(true, true, 'Đang chờ người dùng xác nhận.'),
        requiresConfirmation: true,
      };

    case 'request_user_gesture':
      return {
        record: makeRecord(true, true, 'Đang chờ người dùng chạm xác nhận.'),
        requiresUserGesture: true,
      };

    case 'clarify_user':
    case 'cancel_task':
    case 'finish_task':
      return {
        record: makeRecord(true, true, action.summary || action.reason || 'Hoàn tất bước điều khiển.'),
      };

    default:
      return {
        record: makeRecord(false, false, 'Hành động không được hỗ trợ.', 'UNSUPPORTED_ACTION'),
      };
  }
}
