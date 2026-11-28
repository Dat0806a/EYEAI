import { GoogleGenAI } from "@google/genai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
 * Lay khoa Gemini API tu bien moi truong Netlify (`GEMINI_API_KEY` hoac `VITE_GEMINI_API_KEY`).
 * Dung cho hai duong dan ham dam may `/api/ai/chat` va `/api/gemini/chat` khi trien khai len Netlify.
 */
function getApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ""
  ).trim();
}

/**
 * Xu ly yeu cau hoi dap AI phia ham dam may: kiem tra hop le tin nhan, lay toi da 15 luot lich su gan nhat
 * va goi tuan tu cac mo hinh Gemini du phong cho den khi co cau tra loi hop le.
 */
async function processChat(body: any) {
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const result = await processChat(body);
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Lỗi xử lý AI chat." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}

export const config = {
  path: ["/api/ai/chat", "/api/gemini/chat"],
};

// Netlify Functions V1
export async function handler(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const result = await processChat(body);
    return {
      statusCode: result.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Lỗi xử lý AI chat." }),
    };
  }
}
