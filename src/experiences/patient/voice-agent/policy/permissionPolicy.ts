import {
  AgentSafetyClassification,
  GenericAction,
  PatientRouteName,
  SemanticElement,
} from '../types/agentTypes';

export const ALLOWED_PATIENT_ROUTES: readonly PatientRouteName[] = [
  'patient-home',
  'patient-scan',
  'patient-review',
  'patient-analysis',
  'patient-history',
] as const;

const MEDICAL_CONFIRMATION_IDS = new Set([
  'btn-confirm-analysis',
  'eye-focusable-btn-confirm-analysis',
]);

const USER_GESTURE_IDS = new Set([
  'btn-upload-file',
  'eye-focusable-btn-upload-file',
  'btn-camera-capture',
  'eye-focusable-btn-camera-capture',
  'btn-patient-live-camera',
]);

export function isAllowedPatientRoute(route: string | undefined | null): route is PatientRouteName {
  if (!route) return false;
  return (ALLOWED_PATIENT_ROUTES as readonly string[]).includes(route);
}

export function isElementInsidePatientWorkspace(el: Element | null): boolean {
  if (!el || !el.isConnected) return false;
  const workspace = el.closest('[data-patient-workspace="true"]');
  if (!workspace) return false;
  // Never allow targeting elements inside the agent overlay itself or explicit deny zones
  if (el.closest('[data-testid="patient-agent-runtime-root"]')) return false;
  if (el.closest('[data-agent-deny="true"]')) return false;
  if (el.closest('[data-protected-ui="true"]')) return false;
  return true;
}

export function isSensitiveElement(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'password' || t === 'hidden') return true;
  }
  if (el.hasAttribute('data-sensitive')) return true;
  const name = (el.getAttribute('name') || el.id || '').toLowerCase();
  if (
    name.includes('password') ||
    name.includes('secret') ||
    name.includes('token') ||
    name.includes('apikey')
  ) {
    return true;
  }
  return false;
}

export function isExternalAnchor(el: Element): boolean {
  if (!(el instanceof HTMLAnchorElement)) return false;
  const href = (el.getAttribute('href') || '').trim();
  if (!href) return false;
  const lower = href.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('//') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:')
  ) {
    return true;
  }
  return el.target === '_blank';
}

/**
 * Computes trusted safety classification strictly from application policy and verified DOM semantics.
 * Never trusts DOM-provided classification attributes.
 */
export function classifySemanticElementPolicy(
  el: Element,
  currentRoute: string,
  normalizedRole: string,
  label: string
): {
  classification: AgentSafetyClassification;
  requiresUserGesture: boolean;
  requiresConfirmation: boolean;
} {
  if (!isElementInsidePatientWorkspace(el)) {
    return { classification: 'forbidden', requiresUserGesture: false, requiresConfirmation: false };
  }

  if (isSensitiveElement(el) || isExternalAnchor(el)) {
    return { classification: 'forbidden', requiresUserGesture: false, requiresConfirmation: false };
  }

  if (el.getAttribute('data-patient-permission') === 'denied') {
    return { classification: 'restricted', requiresUserGesture: false, requiresConfirmation: false };
  }

  if (!label || !label.trim()) {
    return { classification: 'not_verified', requiresUserGesture: false, requiresConfirmation: false };
  }

  const elId = el.id || '';

  // Browser user activation required for native file pickers, camera access, or media triggers
  if (
    (el instanceof HTMLInputElement && el.type === 'file') ||
    USER_GESTURE_IDS.has(elId) ||
    Boolean(el.closest('#eye-focusable-btn-upload-file, #eye-focusable-btn-camera-capture'))
  ) {
    return {
      classification: 'user_gesture_required',
      requiresUserGesture: true,
      requiresConfirmation: false,
    };
  }

  // Medical safety confirmation gates: finalizing/confirming OCR lab data or editing medical results
  if (
    MEDICAL_CONFIRMATION_IDS.has(elId) ||
    Boolean(el.closest('#eye-focusable-btn-confirm-analysis')) ||
    (currentRoute === 'patient-review' &&
      (normalizedRole === 'textbox' ||
        el.getAttribute('title')?.includes('Xóa') ||
        label.toLowerCase().includes('xóa chỉ số') ||
        label.toLowerCase().includes('xác nhận & phân tích')))
  ) {
    return {
      classification: 'confirmation_required',
      requiresUserGesture: false,
      requiresConfirmation: true,
    };
  }

  if (normalizedRole === 'read_only') {
    return { classification: 'read_only', requiresUserGesture: false, requiresConfirmation: false };
  }

  return { classification: 'low_risk', requiresUserGesture: false, requiresConfirmation: false };
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  requiresUserGesture: boolean;
  classification: AgentSafetyClassification;
  reason?: string;
}

export function evaluateActionPolicy(
  action: GenericAction,
  targetElement?: SemanticElement | null
): PolicyEvaluationResult {
  switch (action.type) {
    case 'observe_workspace':
    case 'inspect_context':
    case 'scroll_surface':
    case 'wait_for_state':
    case 'clarify_user':
    case 'cancel_task':
    case 'finish_task':
      return {
        allowed: true,
        requiresConfirmation: false,
        requiresUserGesture: false,
        classification: 'read_only',
      };

    case 'request_confirmation':
      return {
        allowed: true,
        requiresConfirmation: true,
        requiresUserGesture: false,
        classification: 'confirmation_required',
      };

    case 'request_user_gesture':
      return {
        allowed: true,
        requiresConfirmation: false,
        requiresUserGesture: true,
        classification: 'user_gesture_required',
      };

    case 'navigate_view':
      if (!isAllowedPatientRoute(action.route)) {
        return {
          allowed: false,
          requiresConfirmation: false,
          requiresUserGesture: false,
          classification: 'forbidden',
          reason: `Điều hướng ngoài phạm vi bệnh nhân bị từ chối: ${String(action.route)}`,
        };
      }
      return {
        allowed: true,
        requiresConfirmation: false,
        requiresUserGesture: false,
        classification: 'low_risk',
      };

    case 'activate_element':
    case 'set_input_value':
    case 'select_option':
    case 'select_list_item': {
      if (!targetElement) {
        return {
          allowed: false,
          requiresConfirmation: false,
          requiresUserGesture: false,
          classification: 'not_verified',
          reason: 'Phần tử mục tiêu không tồn tại hoặc tham chiếu đã cũ.',
        };
      }
      if (
        targetElement.safetyClassification === 'forbidden' ||
        targetElement.safetyClassification === 'restricted' ||
        targetElement.safetyClassification === 'not_verified'
      ) {
        return {
          allowed: false,
          requiresConfirmation: false,
          requiresUserGesture: false,
          classification: targetElement.safetyClassification,
          reason: `Hành động trên "${targetElement.label}" bị từ chối theo chính sách bảo mật (${targetElement.safetyClassification}).`,
        };
      }
      if (!targetElement.visible || !targetElement.enabled) {
        return {
          allowed: false,
          requiresConfirmation: false,
          requiresUserGesture: false,
          classification: 'restricted',
          reason: `Phần tử "${targetElement.label}" hiện không hiển thị hoặc đang bị vô hiệu hóa.`,
        };
      }
      if (action.type === 'set_input_value' && targetElement.inputType === 'file') {
        return {
          allowed: false,
          requiresConfirmation: false,
          requiresUserGesture: true,
          classification: 'user_gesture_required',
          reason: 'Không thể gán giá trị file trực tiếp bằng script; cần thao tác chọn tệp từ người dùng.',
        };
      }
      return {
        allowed: true,
        requiresConfirmation: targetElement.requiresConfirmation,
        requiresUserGesture: targetElement.requiresUserGesture,
        classification: targetElement.safetyClassification,
      };
    }

    default:
      return {
        allowed: false,
        requiresConfirmation: false,
        requiresUserGesture: false,
        classification: 'forbidden',
        reason: 'Loại hành động không nằm trong danh sách được cấp phép.',
      };
  }
}
