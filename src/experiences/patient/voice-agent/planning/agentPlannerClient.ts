import { supabase } from '../../../../lib/supabase';
import {
  ActionExecutionRecord,
  AgentApplicationContext,
  AgentDecision,
  SemanticElement,
} from '../types/agentTypes';
import { PlannerConversationEntry } from '../memory/conversationMemory';

export interface PlanTurnRequest {
  sessionId: string;
  taskId: string;
  turnId: string;
  userMessage: string;
  userGoal: string | null;
  conversationHistory: PlannerConversationEntry[];
  applicationContext: AgentApplicationContext;
  semanticElements: SemanticElement[];
  actionHistory: ActionExecutionRecord[];
  stepIndex: number;
  maxSteps: number;
}

export interface PlanTurnResponse {
  decision: AgentDecision;
  modelUsed?: string;
}

const PLANNER_TIMEOUT_MS = 30_000;

async function getBearerAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function requestAgentPlannerTurn(
  payload: PlanTurnRequest,
  abortSignal?: AbortSignal
): Promise<PlanTurnResponse> {
  const token = await getBearerAccessToken();
  if (!token) {
    throw new Error('Phiên đăng nhập chưa được xác thực để gọi AI Agent.');
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), PLANNER_TIMEOUT_MS);

  const onExternalAbort = () => timeoutController.abort();
  if (abortSignal) {
    if (abortSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    abortSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    const res = await fetch('/api/patient/agent/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Máy chủ AI Agent phản hồi không hợp lệ (HTTP ${res.status}).`);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `Lỗi AI Agent (HTTP ${res.status}).`);
    }

    if (!data?.decision || typeof data.decision.type !== 'string') {
      throw new Error('Phản hồi kế hoạch từ AI Agent không đúng định dạng.');
    }

    return {
      decision: data.decision as AgentDecision,
      modelUsed: data.modelUsed,
    };
  } finally {
    clearTimeout(timeoutId);
    if (abortSignal) {
      abortSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
