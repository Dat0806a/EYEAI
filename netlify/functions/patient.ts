import { GoogleGenAI } from "@google/genai";
import { verifyPatientAuthHeader } from "../../server/patientAuth";
import {
  PATIENT_VISION_OCR_PROMPT,
  validateAndNormalizeOcrPayload,
} from "../../server/patientOcrValidation";
import { enrichMealAndExerciseMedia } from "../../server/patientMediaSearch";

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

function getApiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function callGemini(contents: any[], systemInstruction?: string, jsonMode = true): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY trên hệ thống máy chủ Netlify.");
  }

  let lastError: any = null;
  for (const model of MODELS_TO_TRY) {
    try {
      const config: any = {};
      if (systemInstruction) config.systemInstruction = systemInstruction;
      if (jsonMode) config.responseMimeType = "application/json";

      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[NETLIFY-PATIENT-AI] Model ${model} failed:`, err?.message || err);
    }
  }

  throw new Error(lastError?.message || "Không thể kết nối dịch vụ Gemini AI.");
}

function parseJsonSafely(rawJson: string): any {
  let cleaned = (rawJson || "").trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }
  return JSON.parse(cleaned);
}

// 1. Handle OCR
async function handleOcr(body: any) {
  const { fileBase64, mimeType, fileName } = body;
  if (!fileBase64 || typeof fileBase64 !== "string") {
    return { status: 400, data: { error: "Dữ liệu tệp tải lên không hợp lệ." } };
  }

  const rawBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const reportId = "rep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const cleanMime = (mimeType || "").toLowerCase().trim();

  const prompt = PATIENT_VISION_OCR_PROMPT;

  let contents: any[] = [];
  if (cleanMime === "text/plain") {
    const textContent = Buffer.from(rawBase64, "base64").toString("utf8");
    contents = [{ text: `${prompt}\n\nNỘI DUNG PHIẾU XÉT NGHIỆM DẠNG VĂN BẢN:\n${textContent}` }];
  } else {
    const standardMime = cleanMime.includes("pdf")
      ? "application/pdf"
      : cleanMime.includes("png")
      ? "image/png"
      : cleanMime.includes("webp")
      ? "image/webp"
      : "image/jpeg";
    contents = [
      { text: prompt },
      {
        inlineData: {
          data: rawBase64,
          mimeType: standardMime,
        },
      },
    ];
  }

  const rawJson = await callGemini(contents, undefined, true);
  const parsed = parseJsonSafely(rawJson);
  const validated = validateAndNormalizeOcrPayload(parsed);

  if (!validated.valid) {
    return {
      status: 422,
      data: {
        success: false,
        reportId,
        provider: "GEMINI_VISION",
        documentStatus: validated.documentStatus,
        status: validated.status,
        isValidMedicalDocument: false,
        detectedSubject: validated.detectedSubject,
        hospitalOrLabName: null,
        patientName: null,
        sampleDate: null,
        results: [],
        errorCode: validated.errorCode,
        error: validated.error,
      },
    };
  }

  return {
    status: 200,
    data: {
      success: true,
      reportId,
      provider: "GEMINI_VISION",
      documentStatus: validated.documentStatus,
      status: validated.status,
      isValidMedicalDocument: true,
      detectedSubject: validated.detectedSubject,
      hospitalOrLabName: validated.hospitalOrLabName,
      patientName: validated.patientName,
      sampleDate: validated.sampleDate,
      results: validated.results,
    },
  };
}

// 2. Handle Analyze
async function handleAnalyze(body: any) {
  const { reportId, results, age = 35, gender = "Chung" } = body;
  if (!Array.isArray(results) || results.length === 0) {
    return { status: 400, data: { error: "Danh sách chỉ số xét nghiệm không được để trống." } };
  }

  const prompt = `Bạn là Chuyên gia Y tế & Dinh dưỡng tư vấn giải thích kết quả xét nghiệm y khoa.
Dưới đây là danh sách kết quả xét nghiệm đã được người dùng rà soát và xác nhận:
Độ tuổi bệnh nhân: ${age} tuổi. Giới tính: ${gender}.
Danh sách chỉ số:
${JSON.stringify(results, null, 2)}

NGUYÊN TẮC AN TOÀN Y TẾ & KIỂM CHỨNG:
1. KHÔNG TỰ ĐẶT NGƯỠNG HOẶC CHẨN ĐOÁN BỆNH:
   - Bạn chỉ đóng vai trò người giải thích thông tin tham khảo. Tuyệt đối KHÔNG khẳng định chẩn đoán bệnh tật hoặc kê đơn thuốc.
   - Nhận xét từng chỉ số PHẢI DỰA TRÊN KHOẢNG THAM CHIẾU ĐÃ GHI TRÊN PHIẾU (referenceText / referenceLow / referenceHigh).
   - Nếu chỉ số không có khoảng tham chiếu, giải thích ý nghĩa sinh lý thông thường và khuyên hỏi bác sĩ chỉ định.
2. CÓ NGUỒN KIỂM CHỨNG/CĂN CỨ Y KHOA:
   - Trong mỗi chỉ số hoặc trong phần tóm tắt, hãy nêu ngắn gọn nguồn tài liệu hoặc chuẩn y tế tham chiếu đáng tin cậy (ví dụ: "Theo Hướng dẫn Chẩn đoán của Bộ Y tế Việt Nam", "Theo Khuyến cáo của Hội Tim mạch Việt Nam / VNHA", "Theo Hướng dẫn Lâm sàng của WHO / ADA").
3. GỢI Ý DINH DƯỠNG & BẬN ĐỘNG HỖ TRỢ AN TOÀN:
   - Thực đơn 1 ngày (5 bữa: BREAKFAST, LUNCH, DINNER, SNACK, DRINK) hỗ trợ cải thiện tình trạng dựa trên các chỉ số cần lưu ý (hoặc duy trì sức khỏe nếu các chỉ số bình thường).
   - Bài tập thể chất (2-3 bài tập nhẹ nhàng, vừa sức, có thời lượng và mức độ an toàn phù hợp lứa tuổi).

HÃY TRẢ VỀ DUY NHẤT ĐỐI TƯỢNG JSON CÓ CẤU TRÚC SAU:
{
  "overallSummary": "Đoạn tóm tắt tổng quan khách quan 3-5 câu, điểm mặt các chỉ số cần lưu ý (nếu có), phân tích mối liên hệ tổng thể một cách dễ hiểu và nhấn mạnh trao đổi với bác sĩ điều trị.",
  "results": [
    {
      "testCode": "MÃ CHỈ SỐ",
      "testName": "TÊN CHỈ SỐ",
      "value": 7.2,
      "valueType": "NUMERIC hoặc QUALITATIVE",
      "unit": "đơn vị",
      "referenceLow": số hoặc null,
      "referenceHigh": số hoặc null,
      "referenceText": "chuỗi tham chiếu",
      "status": "NORMAL | LOW | HIGH | ABNORMAL | UNKNOWN",
      "explanation": "Lời giải thích y khoa dễ hiểu",
      "sourceCitation": "Căn cứ y khoa tham chiếu"
    }
  ],
  "mealPlan": {
    "title": "Thực đơn dinh dưỡng hỗ trợ sức khỏe",
    "description": "Mô tả định hướng dinh dưỡng",
    "items": [
      { "mealType": "BREAKFAST", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "...", "imageSearchQuery": "English food photo query" },
      { "mealType": "LUNCH", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "...", "imageSearchQuery": "English food photo query" },
      { "mealType": "DINNER", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "...", "imageSearchQuery": "English food photo query" },
      { "mealType": "SNACK", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "...", "imageSearchQuery": "English food photo query" },
      { "mealType": "DRINK", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "...", "imageSearchQuery": "English drink photo query" }
    ]
  },
  "exercisePlan": {
    "title": "Kế hoạch vận động an toàn hỗ trợ thể trạng",
    "items": [
      { "name": "...", "description": "...", "duration": 20, "difficulty": "EASY", "rationale": "...", "videoSearchQuery": "YouTube search query for exercise video" }
    ]
  }
}`;

  const rawJson = await callGemini([{ text: prompt }], undefined, true);
  const parsed = parseJsonSafely(rawJson);
  const targetReportId = reportId || "rep_" + Date.now();
  const { meals: enrichedMeals, exercises: enrichedExercises } = await enrichMealAndExerciseMedia(
    parsed.mealPlan?.items || [],
    parsed.exercisePlan?.items || []
  );

  return {
    status: 200,
    data: {
      success: true,
      bundle: {
        analysis: {
          reportId: targetReportId,
          overallSummary: parsed.overallSummary || "Đã phân tích các chỉ số xét nghiệm của bạn.",
          results: parsed.results || [],
        },
        mealPlan: {
          reportId: targetReportId,
          title: parsed.mealPlan?.title || "Thực đơn dinh dưỡng cá nhân hóa",
          description: parsed.mealPlan?.description || "Thực đơn hỗ trợ cải thiện các chỉ số xét nghiệm.",
          items: enrichedMeals,
        },
        exercisePlan: {
          reportId: targetReportId,
          title: parsed.exercisePlan?.title || "Kế hoạch vận động thể chất an toàn",
          items: enrichedExercises,
        },
      },
    },
  };
}

// 3. Handle Chat
async function handleChat(body: any) {
  const { message, reportSummary, labResults } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return { status: 400, data: { error: "Nội dung tin nhắn không được để trống." } };
  }

  const systemPrompt = `Bạn là Trợ lý Y tế & Sức khỏe thông minh thuộc hệ thống EYEAI (Chế độ Bệnh nhân).
Nhiệm vụ: Giải thích các thắc mắc của bệnh nhân về chỉ số xét nghiệm, dinh dưỡng, lối sống và bài tập thể lực.
NGUYÊN TẮC:
- Trả lời bằng Tiếng Việt thân thiện, ân cần, rõ ràng, giải thích dễ hiểu.
- Độ dài khoảng 3-6 câu, súc tích, tránh dùng biệt ngữ y khoa quá phức tạp mà không giải nghĩa.
- Tuyệt đối KHÔNG tự chẩn đoán bệnh hay thay đổi chỉ định của bác sĩ. Luôn khuyến khích bệnh nhân tham khảo bác sĩ chuyên môn khi cần quyết định điều trị.
- Dựa vào bối cảnh xét nghiệm được cung cấp (nếu có).`;

  const contextParts: string[] = [];
  if (reportSummary) {
    contextParts.push(`Tóm tắt xét nghiệm của người dùng: ${reportSummary}`);
  }
  if (Array.isArray(labResults) && labResults.length > 0) {
    contextParts.push(`Các chỉ số: ${JSON.stringify(labResults)}`);
  }

  const userText = contextParts.length > 0
    ? `[BỐI CẢNH XÉT NGHIỆM]\n${contextParts.join("\n")}\n\n[CÂU HỎI CỦA NGƯỜI BỆNH]\n${message}`
    : message;

  const reply = await callGemini([{ text: userText }], systemPrompt, false);
  return { status: 200, data: { reply, message: reply } };
}

async function handleMediaSearch(body: any) {
  const mealItems = Array.isArray(body?.mealItems) ? body.mealItems : [];
  const exerciseItems = Array.isArray(body?.exerciseItems) ? body.exerciseItems : [];
  const enriched = await enrichMealAndExerciseMedia(mealItems, exerciseItems);
  return { status: 200, data: { success: true, ...enriched } };
}

function detectAction(urlStr: string, body: any): "ocr" | "analyze" | "chat" | "media-search" {
  const lowerUrl = urlStr.toLowerCase();
  if (lowerUrl.includes("/media-search") || lowerUrl.endsWith("media-search")) return "media-search";
  if (lowerUrl.includes("/ocr") || lowerUrl.endsWith("ocr")) return "ocr";
  if (lowerUrl.includes("/analyze") || lowerUrl.endsWith("analyze")) return "analyze";
  if (lowerUrl.includes("/chat") || lowerUrl.endsWith("chat")) return "chat";

  // Fallback to inspecting body
  if (body) {
    if (body.mealItems || body.exerciseItems) return "media-search";
    if (body.fileBase64 || body.fileName) return "ocr";
    if (body.results && (body.reportId || body.age)) return "analyze";
    if (body.message) return "chat";
  }
  return "ocr";
}

// Netlify Functions V2 (Standard)
export default async function (req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("authorization") || undefined;
    const authRes = await verifyPatientAuthHeader(authHeader);
    if (!authRes.ok || !authRes.identity) {
      return new Response(
        JSON.stringify({
          success: false,
          error: authRes.error || "Không có quyền truy cập.",
          code: authRes.code,
          requiredAal: authRes.requiredAal,
          currentAal: authRes.currentAal,
        }),
        {
          status: authRes.status,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const action = detectAction(req.url, body);
    let result: { status: number; data: any };

    if (action === "analyze") {
      result = await handleAnalyze(body);
    } else if (action === "media-search") {
      result = await handleMediaSearch(body);
    } else if (action === "chat") {
      result = await handleChat(body);
    } else {
      result = await handleOcr(body);
    }

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    console.error("[NETLIFY-PATIENT-FUNCTION] Error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Lỗi xử lý yêu cầu y tế." }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export const config = {
  path: "/api/patient/*",
};

// Netlify Functions V1 (AWS Lambda Fallback)
export async function handler(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || undefined;
    const authRes = await verifyPatientAuthHeader(authHeader);
    if (!authRes.ok || !authRes.identity) {
      return {
        statusCode: authRes.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          success: false,
          error: authRes.error || "Không có quyền truy cập.",
          code: authRes.code,
          requiredAal: authRes.requiredAal,
          currentAal: authRes.currentAal,
        }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const action = detectAction(event.path || "", body);
    let result: { status: number; data: any };

    if (action === "analyze") {
      result = await handleAnalyze(body);
    } else if (action === "media-search") {
      result = await handleMediaSearch(body);
    } else if (action === "chat") {
      result = await handleChat(body);
    } else {
      result = await handleOcr(body);
    }

    return {
      statusCode: result.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result.data),
    };
  } catch (err: any) {
    console.error("[NETLIFY-PATIENT-FUNCTION-V1] Error:", err);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: err?.message || "Lỗi xử lý yêu cầu y tế." }),
    };
  }
}
