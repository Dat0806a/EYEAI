import { Router, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { PatientAuthVerifier, verifyPatientAuthHeader } from "./patientAuth";
import {
  PATIENT_VISION_OCR_PROMPT,
  validateAndNormalizeOcrPayload,
  ValidatedOcrItem,
} from "./patientOcrValidation";
import { enrichMealAndExerciseMedia } from "./patientMediaSearch";

export type DynamicOcrResult = ValidatedOcrItem;

export function createPatientRouter(
  ai: GoogleGenAI | null,
  apiKey?: string,
  verifyAuth: PatientAuthVerifier = verifyPatientAuthHeader
): Router {
  const router = Router();

  // Enforce verified JWT + patient role + AAL2 MFA on all /api/patient/* endpoints
  router.use(async (req: Request, res: Response, next) => {
    const authRes = await verifyAuth(req.headers.authorization);
    if (!authRes.ok || !authRes.identity) {
      res.status(authRes.status).json({
        success: false,
        error: authRes.error || "Không có quyền truy cập.",
        code: authRes.code,
        requiredAal: authRes.requiredAal,
        currentAal: authRes.currentAal,
      });
      return;
    }
    (req as any).verifiedIdentity = authRes.identity;
    next();
  });

  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
  ];

  // Helper to call Gemini with official fallback models
  async function callGemini(contents: any, systemInstruction?: string, jsonMode = true): Promise<string> {
    if (!ai || !apiKey) {
      throw new Error("Chưa cấu hình GEMINI_API_KEY trên hệ thống máy chủ.");
    }

    let lastError: any = null;
    for (const model of modelsToTry) {
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
        console.warn(`[PATIENT-AI] Model ${model} failed:`, err?.message || err);
      }
    }

    throw new Error(lastError?.message || "Không thể kết nối dịch vụ Gemini AI.");
  }

  // 1. POST /api/patient/ocr - Real Multimodal Vision OCR extraction
  router.post("/ocr", async (req: Request, res: Response) => {
    try {
      const { fileBase64, mimeType, fileName } = req.body;

      if (!fileBase64 || typeof fileBase64 !== "string") {
        res.status(400).json({ error: "Dữ liệu tệp tải lên không hợp lệ." });
        return;
      }

      const supportedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
        "application/pdf",
        "text/plain",
      ];

      const cleanMime = (mimeType || "").toLowerCase().trim();
      const isSupported = supportedMimeTypes.some((t) => cleanMime.includes(t) || cleanMime.includes(t.split("/")[1]));
      if (!isSupported && !cleanMime.startsWith("image/")) {
        res.status(400).json({
          error: "Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPG, PNG, WEBP, PDF hoặc văn bản.",
        });
        return;
      }

      // Remove data URL prefix if present (e.g. data:image/png;base64,...) and strip any whitespace
      const rawBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");

      const reportId = "rep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

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
      let cleanedJson = (rawJson || "").trim();
      if (cleanedJson.startsWith("```json")) {
        cleanedJson = cleanedJson.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (cleanedJson.startsWith("```")) {
        cleanedJson = cleanedJson.replace(/^```/, "").replace(/```$/, "").trim();
      }
      const parsed = JSON.parse(cleanedJson);
      const validated = validateAndNormalizeOcrPayload(parsed);

      if (!validated.valid) {
        res.status(422).json({
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
        });
        return;
      }

      res.json({
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
      });
    } catch (error: any) {
      console.error("[PATIENT-OCR] Error scanning document:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Không thể nhận diện tài liệu xét nghiệm. Vui lòng thử lại với ảnh rõ nét hơn.",
      });
    }
  });

  // 2. POST /api/patient/analyze - Comprehensive LLM Lab Analysis with verified medical citations
  router.post("/analyze", async (req: Request, res: Response) => {
    try {
      const { reportId, results, age = 35, gender = "Chung" } = req.body;

      if (!Array.isArray(results) || results.length === 0) {
        res.status(400).json({ error: "Danh sách chỉ số xét nghiệm không được để trống." });
        return;
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
      "explanation": "Lời giải thích y khoa dễ hiểu: chỉ số này phản ánh cơ quan/chức năng nào, việc chỉ số này cao/thấp hơn tham chiếu có ý nghĩa thế nào và người bệnh nên lưu ý điều gì.",
      "sourceCitation": "Căn cứ y khoa tham chiếu (ví dụ: Hướng dẫn Lâm sàng Bộ Y tế / ADA / WHO)"
    }
  ],
  "mealPlan": {
    "title": "Thực đơn dinh dưỡng hỗ trợ sức khỏe",
    "description": "Mô tả định hướng dinh dưỡng (ví dụ: thực đơn thanh đạm, giảm tải gánh nặng cho gan/thận...)",
    "items": [
      {
        "mealType": "BREAKFAST",
        "name": "Tên món ăn sáng",
        "description": "Mô tả ngắn món ăn",
        "ingredients": "Nguyên liệu chính",
        "preparation": "Cách chế biến lành mạnh (luộc, hấp, ít dầu mỡ/muối)",
        "rationale": "Lợi ích sức khỏe cụ thể liên quan tới các chỉ số xét nghiệm",
        "imageSearchQuery": "Từ khóa tiếng Anh ngắn gọn để tìm ảnh món ăn này (ví dụ: vietnamese beef pho noodle soup)"
      },
      {
        "mealType": "LUNCH",
        "name": "Tên món ăn trưa",
        "description": "Mô tả món ăn trưa",
        "ingredients": "Nguyên liệu",
        "preparation": "Cách chế biến",
        "rationale": "Lợi ích sức khỏe",
        "imageSearchQuery": "Từ khóa tiếng Anh tìm ảnh món ăn trưa"
      },
      {
        "mealType": "DINNER",
        "name": "Tên món ăn tối",
        "description": "Mô tả món ăn tối",
        "ingredients": "Nguyên liệu",
        "preparation": "Cách chế biến",
        "rationale": "Lợi ích sức khỏe",
        "imageSearchQuery": "Từ khóa tiếng Anh tìm ảnh món ăn tối"
      },
      {
        "mealType": "SNACK",
        "name": "Tên món ăn nhẹ/phụ",
        "description": "Mô tả",
        "ingredients": "Nguyên liệu",
        "preparation": "Cách chuẩn bị",
        "rationale": "Lợi ích sức khỏe",
        "imageSearchQuery": "Từ khóa tiếng Anh tìm ảnh món ăn nhẹ"
      },
      {
        "mealType": "DRINK",
        "name": "Thức uống hỗ trợ",
        "description": "Mô tả thức uống",
        "ingredients": "Nguyên liệu",
        "preparation": "Cách pha chế",
        "rationale": "Lợi ích sức khỏe",
        "imageSearchQuery": "Từ khóa tiếng Anh tìm ảnh thức uống"
      }
    ]
  },
  "exercisePlan": {
    "title": "Kế hoạch vận động an toàn hỗ trợ thể trạng",
    "items": [
      {
        "name": "Tên bài tập (ví dụ: Đi bộ thư giãn, Yoga phục hồi...)",
        "description": "Hướng dẫn động tác an toàn",
        "duration": 20,
        "difficulty": "EASY",
        "rationale": "Lợi ích cho tuần hoàn và cơ bắp",
        "videoSearchQuery": "Từ khóa tiếng Việt hoặc tiếng Anh tìm video hướng dẫn bài tập trên YouTube (ví dụ: bài tập đi bộ nhẹ nhàng tại nhà)"
      },
      {
        "name": "Tên bài tập 2",
        "description": "Hướng dẫn động tác",
        "duration": 15,
        "difficulty": "EASY",
        "rationale": "Lợi ích cho sức khỏe",
        "videoSearchQuery": "Từ khóa tìm video bài tập 2 trên YouTube"
      }
    ]
  }
}`;

      const rawJson = await callGemini([{ text: prompt }], undefined, true);
      let cleanedJson = (rawJson || "").trim();
      if (cleanedJson.startsWith("```json")) {
        cleanedJson = cleanedJson.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (cleanedJson.startsWith("```")) {
        cleanedJson = cleanedJson.replace(/^```/, "").replace(/```$/, "").trim();
      }
      const parsed = JSON.parse(cleanedJson);

      const targetReportId = reportId || "rep_" + Date.now();
      const { meals: enrichedMeals, exercises: enrichedExercises } = await enrichMealAndExerciseMedia(
        parsed.mealPlan?.items || [],
        parsed.exercisePlan?.items || []
      );

      res.json({
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
      });
    } catch (error: any) {
      console.error("[PATIENT-ANALYZE] Error analyzing results:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Không thể phân tích kết quả xét nghiệm.",
      });
    }
  });

  // 3. POST /api/patient/media-search - Dynamic Google/Web food images & embeddable exercise videos
  router.post("/media-search", async (req: Request, res: Response) => {
    try {
      const mealItems = Array.isArray(req.body?.mealItems) ? req.body.mealItems : [];
      const exerciseItems = Array.isArray(req.body?.exerciseItems) ? req.body.exerciseItems : [];
      const enriched = await enrichMealAndExerciseMedia(mealItems, exerciseItems);
      res.json({ success: true, ...enriched });
    } catch (error: any) {
      console.error("[PATIENT-MEDIA-SEARCH] Error:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Không thể tìm kiếm hình ảnh và video gợi ý.",
      });
    }
  });

  // 4. POST /api/patient/chat - Specialized medical conversation context
  router.post("/chat", async (req: Request, res: Response) => {
    try {
      const { message, reportSummary, labResults } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "Nội dung tin nhắn không được để trống." });
        return;
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
      res.json({ reply, message: reply });
    } catch (error: any) {
      console.error("[PATIENT-CHAT] Error in chat:", error);
      res.status(500).json({
        error: "Hiện tại trợ lý sức khỏe chưa thể trả lời. Vui lòng thử lại sau.",
      });
    }
  });

  return router;
}
