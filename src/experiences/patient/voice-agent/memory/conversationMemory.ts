import { ActionExecutionRecord, AgentConversationMessage } from '../types/agentTypes';

export interface PlannerConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Ephemeral in-session conversation memory for multi-turn contextual understanding.
 * Scoped strictly to active userId + sessionId in memory; never persisted unencrypted.
 */
export function buildPlannerConversationHistory(
  messages: AgentConversationMessage[],
  maxTurns = 10
): PlannerConversationEntry[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.kind !== 'progress')
    .slice(-maxTurns)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content.slice(0, 350),
    }));
}

export function summarizeRecentActionHistory(
  records: ActionExecutionRecord[],
  maxRecords = 10
): ActionExecutionRecord[] {
  return records.slice(-maxRecords);
}
