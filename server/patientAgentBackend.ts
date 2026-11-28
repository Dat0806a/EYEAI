import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { PatientAuthVerifier, verifyPatientAuthHeader } from './patientAuth';
import { planPatientAgentTurn, PlannerTurnInput } from './patientAgentPlanner';

export interface PatientAgentRouterOptions {
  ai?: GoogleGenAI | null;
  apiKey?: string;
  verifyAuth?: PatientAuthVerifier;
}

const RECENT_TURN_CACHE_LIMIT = 200;

export function createPatientAgentRouter(options: PatientAgentRouterOptions = {}): Router {
  const router = Router();
  const verifyAuth = options.verifyAuth || verifyPatientAuthHeader;

  // Prefer isolated Patient Agent credential if provided, falling back to server GEMINI_API_KEY
  const serverApiKey = (
    options.apiKey ||
    process.env.PATIENT_AGENT_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  const aiClient =
    options.ai ??
    (serverApiKey
      ? new GoogleGenAI({
          apiKey: serverApiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        })
      : null);

  // Dedupe / replay guard scoped by verified userId + sessionId + taskId + turnId
  const processedTurns = new Map<string, { decision: Record<string, any>; modelUsed: string }>();

  router.post('/turn', async (req: Request, res: Response) => {
    try {
      // 1. Verify caller identity, patient role & AAL2 MFA server-side (never trust req.body userId/role)
      const authRes = await verifyAuth(req.headers.authorization);
      if (!authRes.ok || !authRes.identity) {
        res.status(authRes.status).json({
          error: authRes.error || 'Không có quyền truy cập.',
          code: authRes.code,
          requiredAal: authRes.requiredAal,
          currentAal: authRes.currentAal,
        });
        return;
      }

      const body = req.body || {};
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      const turnId = typeof body.turnId === 'string' ? body.turnId.trim() : '';
      const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';

      if (!sessionId || !taskId || !turnId || !userMessage) {
        res.status(400).json({ error: 'Thiếu sessionId, taskId, turnId hoặc userMessage.' });
        return;
      }

      if (userMessage.length > 1500) {
        res.status(400).json({ error: 'Yêu cầu vượt quá độ dài tối đa cho phép.' });
        return;
      }

      if (!aiClient) {
        res.status(503).json({
          error: 'Chưa cấu hình API Key cho Patient AI Agent trên máy chủ.',
        });
        return;
      }

      // 2. Prevent duplicate/replay processing for identical turnId
      const dedupeKey = `${authRes.identity.userId}:${sessionId}:${taskId}:${turnId}`;
      const cached = processedTurns.get(dedupeKey);
      if (cached) {
        res.json({
          success: true,
          deduplicated: true,
          decision: cached.decision,
          modelUsed: cached.modelUsed,
        });
        return;
      }

      const plannerInput: PlannerTurnInput = {
        sessionId,
        taskId,
        turnId,
        userMessage,
        userGoal: body.userGoal,
        conversationHistory: Array.isArray(body.conversationHistory) ? body.conversationHistory : [],
        applicationContext:
          body.applicationContext && typeof body.applicationContext === 'object'
            ? body.applicationContext
            : {},
        semanticElements: Array.isArray(body.semanticElements) ? body.semanticElements : [],
        actionHistory: Array.isArray(body.actionHistory) ? body.actionHistory : [],
        stepIndex: body.stepIndex,
        maxSteps: body.maxSteps,
      };

      const planned = await planPatientAgentTurn(aiClient, plannerInput);

      if (processedTurns.size >= RECENT_TURN_CACHE_LIMIT) {
        const firstKey = processedTurns.keys().next().value;
        if (firstKey) processedTurns.delete(firstKey);
      }
      processedTurns.set(dedupeKey, planned);

      res.json({
        success: true,
        decision: planned.decision,
        modelUsed: planned.modelUsed,
      });
    } catch (err: any) {
      const msg = err?.message || 'Lỗi xử lý kế hoạch AI Agent.';
      const status = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429 : 500;
      res.status(status).json({
        success: false,
        error: status === 429 ? 'Hệ thống AI đang bận. Vui lòng thử lại sau ít giây.' : msg,
      });
    }
  });

  return router;
}
