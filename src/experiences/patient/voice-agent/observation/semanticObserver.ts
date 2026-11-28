import {
  classifySemanticElementPolicy,
  isElementInsidePatientWorkspace,
  isSensitiveElement,
} from '../policy/permissionPolicy';
import { SemanticElement } from '../types/agentTypes';

export interface ObservedControlEntry {
  semantic: SemanticElement;
  element: HTMLElement;
}

export interface ObservationSnapshot {
  stateEpoch: number;
  elements: SemanticElement[];
  registry: Map<string, ObservedControlEntry>;
  observedAt: number;
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="listitem"]',
  '[role="option"]',
].join(',');

function sanitizeLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
    return false;
  }
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
      return false;
    }
  }
  // In real layout browsers (where documentElement has non-zero bounding box), enforce geometry check
  const docRect = document.documentElement?.getBoundingClientRect?.();
  if (docRect && (docRect.width > 0 || docRect.height > 0)) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0 && !(el instanceof HTMLInputElement && el.type === 'file')) {
      return false;
    }
  }
  return true;
}

function resolveAccessibleLabel(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return sanitizeLabel(ariaLabel);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return sanitizeLabel(labelEl.textContent);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel?.textContent) return sanitizeLabel(explicitLabel.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel?.textContent) return sanitizeLabel(parentLabel.textContent);
    // Check sibling label in wrapper container (common in PatientReviewPage)
    const prevEl = el.previousElementSibling;
    if (prevEl && prevEl.tagName === 'LABEL' && prevEl.textContent) {
      return sanitizeLabel(prevEl.textContent);
    }
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder) {
      return sanitizeLabel(el.placeholder);
    }
  }

  const titleAttr = el.getAttribute('title');
  if (titleAttr) return sanitizeLabel(titleAttr);

  const text = el.textContent || '';
  return sanitizeLabel(text);
}

function resolveGroupLabel(el: HTMLElement): string | undefined {
  const customGroup = el.closest('[data-agent-group]');
  const attrVal = customGroup?.getAttribute('data-agent-group');
  if (attrVal) {
    return sanitizeLabel(attrVal).slice(0, 60);
  }
  const listItem = el.closest('[role="listitem"]');
  if (listItem) {
    const heading = listItem.querySelector('h1, h2, h3, h4');
    if (heading?.textContent) {
      return sanitizeLabel(heading.textContent).slice(0, 60);
    }
  }
  const container = el.closest('section, [role="region"], article, fieldset, form, main > div');
  if (!container) return undefined;
  const heading = container.querySelector('h1, h2, h3, h4');
  if (heading?.textContent) {
    return sanitizeLabel(heading.textContent).slice(0, 60);
  }
  return undefined;
}

function resolveNormalizedRole(el: HTMLElement): string {
  const explicitRole = el.getAttribute('role');
  if (explicitRole) return explicitRole.toLowerCase();
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLAnchorElement) return 'link';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'file') return 'file_input';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    return 'textbox';
  }
  return 'button';
}

function isElementEnabled(el: HTMLElement): boolean {
  if ('disabled' in el && Boolean((el as HTMLButtonElement | HTMLInputElement).disabled)) {
    return false;
  }
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function isElementSelected(el: HTMLElement): boolean | undefined {
  const ariaSelected = el.getAttribute('aria-selected');
  if (ariaSelected === 'true') return true;
  if (ariaSelected === 'false') return false;
  const ariaPressed = el.getAttribute('aria-pressed');
  if (ariaPressed === 'true') return true;
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked;
  }
  return undefined;
}

export function scanPatientWorkspace(currentRoute: string, stateEpoch: number): ObservationSnapshot {
  const workspace = document.querySelector('[data-patient-workspace="true"]');
  const registry = new Map<string, ObservedControlEntry>();
  const elements: SemanticElement[] = [];

  if (!workspace) {
    return {
      stateEpoch,
      elements,
      registry,
      observedAt: Date.now(),
    };
  }

  const candidates = Array.from(workspace.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  let counter = 1;

  for (const el of candidates) {
    // Skip elements inside agent overlay or protected markers
    if (!isElementInsidePatientWorkspace(el)) continue;
    if (isSensitiveElement(el)) continue;

    // Skip passive container elements (e.g. li[role="listitem"], div[role="button"]) that wrap a native interactive control
    const isNativeControl =
      el instanceof HTMLButtonElement ||
      el instanceof HTMLAnchorElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement;
    if (!isNativeControl && el.querySelector('button, a[href], input, select, textarea')) {
      continue;
    }

    const visible = isElementVisible(el);
    const isFileInput = el instanceof HTMLInputElement && el.type === 'file';
    if (!visible && !isFileInput) continue;

    const role = resolveNormalizedRole(el);
    const label = resolveAccessibleLabel(el) || (isFileInput ? 'Chọn tệp phiếu xét nghiệm' : '');
    if (!label) continue;

    const enabled = isElementEnabled(el);
    const policy = classifySemanticElementPolicy(el, currentRoute, role, label);

    // Fail-closed: do not expose forbidden controls as actionable targets
    if (policy.classification === 'forbidden') continue;

    const ref = `el_e${stateEpoch}_${counter++}`;
    const semantic: SemanticElement = {
      ref,
      role,
      label,
      description: el.getAttribute('aria-description') || undefined,
      group: resolveGroupLabel(el),
      visible: visible || isFileInput,
      enabled,
      selected: isElementSelected(el),
      inputType: el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : undefined,
      valuePreview:
        el instanceof HTMLInputElement && el.type !== 'file'
          ? el.value.slice(0, 40)
          : el instanceof HTMLSelectElement
          ? el.options[el.selectedIndex]?.text?.slice(0, 40)
          : undefined,
      requiresUserGesture: policy.requiresUserGesture,
      requiresConfirmation: policy.requiresConfirmation,
      safetyClassification: policy.classification,
      stateEpoch,
    };

    elements.push(semantic);
    registry.set(ref, { semantic, element: el });
  }

  return {
    stateEpoch,
    elements,
    registry,
    observedAt: Date.now(),
  };
}

export function validateFreshReference(
  snapshot: ObservationSnapshot,
  ref: string,
  expectedEpoch?: number
): { valid: true; entry: ObservedControlEntry } | { valid: false; reason: string } {
  if (!ref) {
    return { valid: false, reason: 'Thiếu mã tham chiếu phần tử (ref).' };
  }
  if (expectedEpoch !== undefined && snapshot.stateEpoch !== expectedEpoch) {
    return { valid: false, reason: 'Tham chiếu phần tử đã cũ do giao diện vừa thay đổi.' };
  }
  const entry = snapshot.registry.get(ref);
  if (!entry) {
    return { valid: false, reason: `Không tìm thấy phần tử với ref="${ref}" trong phiên hiện tại.` };
  }
  if (!entry.element.isConnected) {
    return { valid: false, reason: `Phần tử "${entry.semantic.label}" không còn tồn tại trên màn hình.` };
  }
  if (!isElementInsidePatientWorkspace(entry.element)) {
    return { valid: false, reason: 'Phần tử nằm ngoài phạm vi màn hình bệnh nhân.' };
  }
  if (!entry.semantic.enabled || !isElementEnabled(entry.element)) {
    return { valid: false, reason: `Phần tử "${entry.semantic.label}" hiện đang bị vô hiệu hóa.` };
  }
  const isFileInput = entry.element instanceof HTMLInputElement && entry.element.type === 'file';
  if (!isFileInput && !isElementVisible(entry.element)) {
    return { valid: false, reason: `Phần tử "${entry.semantic.label}" hiện không còn hiển thị.` };
  }
  return { valid: true, entry };
}

export function observeWorkspaceMutations(onMutation: () => void, debounceMs = 150): () => void {
  const target = document.querySelector('[data-patient-workspace="true"]');
  if (!target || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onMutation();
    }, debounceMs);
  });

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'aria-selected', 'hidden', 'class'],
  });

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}
