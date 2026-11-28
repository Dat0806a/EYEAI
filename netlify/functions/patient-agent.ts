import { GoogleGenAI } from '@google/genai';
import { verifyPatientAuthHeader } from '../../server/patientAuth';
import { planPatientAgentTurn, PlannerTurnInput } from '../../server/patientAgentPlanner';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getServerApiKey(): string {
  return (
    process.env.PATIENT_AGENT_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
}

async function processAgentTurn(body: any, authHeader?: string) {
  const authRes = await verifyPatientAuthHeader(authHeader);
  if (!authRes.ok || !authRes.identity) {
    return {
      status: authRes.status,
      data: {
        error: authRes.error || 'Không có quyền truy cập.',
        code: authRes.code,
        requiredAal: authRes.requiredAal,
        currentAal: authRes.currentAal,
      },
    };
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
  const turnId = typeof body?.turnId === 'string' ? body.turnId.trim() : '';
  const userMessage = typeof body?.userMessage === 'string' ? body.userMessage.trim() : '';

  if (!sessionId || !taskId || !turnId || !userMessage) {
    return {
      status: 400,
      data: { error: 'Thiếu sessionId, taskId, turnId hoặc userMessage.' },
    };
  }

  const apiKey = getServerApiKey();
  if (!apiKey) {
    return {
      status: 503,
      data: { error: 'Chưa cấu hình API Key cho Patient AI Agent trên máy chủ Netlify.' },
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

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

  const planned = await planPatientAgentTurn(ai, plannerInput);
  return {
    status: 200,
    data: {
      success: true,
      decision: planned.decision,
      modelUsed: planned.modelUsed,
    },
  };
}

export default async function (req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const authHeader = req.headers.get('authorization') || undefined;
    const result = await processAgentTurn(body, authHeader);
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Lỗi xử lý AI Agent.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

export const config = {
  path: ['/api/patient/agent', '/api/patient/agent/*'],
};

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || undefined;
    const result = await processAgentTurn(body, authHeader);
    return {
      statusCode: result.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(result.data),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Lỗi xử lý AI Agent.' }),
    };
  }
}
