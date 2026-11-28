import { GoogleGenAI } from "@google/genai";
import { verifyAuthHeader } from "../../server/patientAuth";
import { checkInMemoryRateLimit } from "../../server/securityMiddleware";

const MAX_AI_BODY_BYTES = 100 * 1024;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;
const AI_RATE_LIMIT_MAX_REQUESTS = 30;

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  let allowedOrigin = appUrl || "null";
  if (origin) {
    const clean = origin.trim().replace(/\/$/, "");
    if (
      (appUrl && clean === appUrl) ||
      clean.startsWith("http://localhost:") ||
      clean.startsWith("http://127.0.0.1:")
    ) {
      allowedOrigin = clean;
    }
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

const MODELS_TO_TRY = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
];

const SYSTEM_INSTRUCTION =
  "Bạn là Trợ lý AI giao tiếp và hỗ trợ hàng ngày thuộc hệ thống LUCKY DREAM – EYEAI (phần mềm hỗ trợ người dùng và bệnh nhân cần tiếp cận bằng ánh mắt). " +
  "Trả lời bằng Tiếng Việt thân thiện, rõ ràng, dễ đọc, khoảng 2 đến 5 câu ngắn gọn. " +
  "Tuyệt đối không tự nhận là bác sĩ, không chẩn đoán bệnh tật từ câu hỏi sức khỏe. " +
  "Nếu người dùng hỏi về sức khỏe, hãy đưa ra lời khuyên chăm sóc chung và khuyến khích tham khảo ý kiến chuyên gia y tế khi cần. " +
  "Nếu người dùng cần hỗ trợ khẩn cấp hoặc cấp cứu, hãy gợi ý họ sử dụng tính năng SOS trên màn hình chính của LUCKY DREAM. " +
  "Tránh viết các đoạn quá dài, danh sách dài dòng hoặc bảng biểu phức tạp trừ khi người dùng yêu cầu chi tiết.";

/**
 * Lay khoa Gemini API tu bien moi truong runtime (`process.env.GEMINI_API_KEY`).
 * Dung cho hai duong dan ham dam may `/api/ai/chat` va `/api/gemini/chat` khi trien khai len Netlify.
 */
function getApiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

/**
 * Xu ly yeu cau hoi dap AI phia ham dam may: kiem tra hop le tin nhan, lay toi da 15 luot lich su gan nhat
 * va goi tuan tu cac mo hinh Gemini du phong cho den khi co cau tra loi hop le.
 */
async function processChat(body: any, authHeader?: string) {
  const authRes = await verifyAuthHeader(authHeader, { requirePatient: false });
  if (!authRes.ok) {
    return {
      status: authRes.status,
      data: {
        error: authRes.error || "Không có quyền truy cập.",
        code: authRes.code,
        requiredAal: authRes.requiredAal,
        currentAal: authRes.currentAal,
      },
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: 500,
      data: { error: "Chưa cấu hình GEMINI_API_KEY trong hệ thống Netlify." },
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  let userMessage = "";
  let historyMessages: any[] = [];

  if (body.message && typeof body.message === "string") {
    userMessage = body.message.trim();
    if (Array.isArray(body.history)) {
      historyMessages = body.history;
    }
  } else if (Array.isArray(body.messages) && body.messages.length > 0) {
    const lastMsg = body.messages[body.messages.length - 1];
    userMessage = (lastMsg?.text || lastMsg?.content || "").trim();
    historyMessages = body.messages.slice(0, -1);
  }

  if (!userMessage) {
    return { status: 400, data: { error: "Nội dung tin nhắn không được để trống." } };
  }
  if (userMessage.length > 2000) {
    return { status: 400, data: { error: "Tin nhắn quá dài (vượt quá 2000 ký tự)." } };
  }

  const recentHistory = historyMessages.slice(-15);
  const contents: any[] = [];

  for (const msg of recentHistory) {
    const text = (msg.text || msg.content || "").trim();
    if (!text) continue;
    const role = msg.sender === "user" ? "user" : "model";
    contents.push({ role, parts: [{ text }] });
  }

  contents.push({ role: "user", parts: [{ text: userMessage }] });

  let lastError: any = null;
  let replyText = "";

  for (const modelName of MODELS_TO_TRY) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      if (response && response.text) {
        replyText = response.text;
        break;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[NETLIFY-AI] Model ${modelName} failed:`, err?.message || err);
    }
  }

  if (replyText) {
    return {
      status: 200,
      data: { message: replyText, text: replyText, reply: replyText },
    };
  }

  const errStr = typeof lastError === "string" ? lastError : lastError?.message || "";
  let statusCode = 500;
  let userFacingError = "Hiện tôi chưa thể trả lời. Bạn thử lại nhé.";

  if (errStr.includes("PERMISSION_DENIED") || errStr.includes("403")) {
    statusCode = 403;
    userFacingError = "GEMINI_API_KEY bị từ chối quyền (403).";
  } else if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429")) {
    statusCode = 429;
    userFacingError = "Hệ thống Gemini đang quá tải hoặc đạt giới hạn lượt gọi (429).";
  }

  return { status: statusCode, data: { error: userFacingError } };
}

// Netlify Functions V2
export default async function (req: Request) {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-nf-client-connection-ip") ||
    "unknown";
  const rate = checkInMemoryRateLimit({
    key: `netlify-ai:${clientIp}`,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
    maxRequests: AI_RATE_LIMIT_MAX_REQUESTS,
  });
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(rate.retryAfterSec ?? 1),
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_AI_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Dữ liệu yêu cầu vượt quá giới hạn 100KB." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = rawBody ? JSON.parse(rawBody) : {};

    const authHeader = req.headers.get("authorization") || undefined;
    const result = await processChat(body, authHeader);
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Lỗi xử lý AI chat." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

export const config = {
  path: ["/api/ai/chat", "/api/gemini/chat"],
};

// Netlify Functions V1
export async function handler(event: any) {
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const corsHeaders = getCorsHeaders(origin);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const clientIp =
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers?.["x-nf-client-connection-ip"] ||
    "unknown";
  const rate = checkInMemoryRateLimit({
    key: `netlify-ai:${clientIp}`,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
    maxRequests: AI_RATE_LIMIT_MAX_REQUESTS,
  });
  if (!rate.allowed) {
    return {
      statusCode: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": String(rate.retryAfterSec ?? 1),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.",
      }),
    };
  }

  try {
    const rawBody = typeof event.body === "string" ? event.body : "";
    if (Buffer.byteLength(rawBody, "utf8") > MAX_AI_BODY_BYTES) {
      return {
        statusCode: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Dữ liệu yêu cầu vượt quá giới hạn 100KB." }),
      };
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || undefined;
    const result = await processChat(body, authHeader);
    return {
      statusCode: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    };
  } catch {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Lỗi xử lý AI chat." }),
    };
  }
}
