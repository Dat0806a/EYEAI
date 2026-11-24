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

const DEFAULT_FOOD_IMAGES: Record<string, any> = {
  BREAKFAST: {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg",
    imageAlt: "Bữa sáng lành mạnh giàu đạm và rau tươi",
    imageLicense: "CC BY-SA 4.0",
    imageAuthor: "Deborah Tjituka",
  },
  LUNCH: {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg",
    imageAlt: "Cơm trắng kèm cá và rau xanh thanh nhẹ",
    imageLicense: "CC BY-SA 4.0",
    imageAuthor: "Cheikh cherif",
  },
  DINNER: {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG",
    imageAlt: "Bát canh rau củ tươi nhẹ bụng ban đêm",
    imageLicense: "CC BY-SA 4.0",
    imageAuthor: "Kolforn",
  },
  SNACK: {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg",
    imageAlt: "Trái cây tươi và hạt dinh dưỡng",
    imageLicense: "CC0",
    imageAuthor: "Roberta Sorge",
  },
  DRINK: {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg",
    imageAlt: "Tách trà xanh thanh lọc và nước ấm",
    imageLicense: "CC BY-SA 4.0",
    imageAuthor: "Major Lyte",
  },
};

const DEFAULT_EXERCISE_VIDEOS = [
  {
    youtubeVideoId: "u08lo0bESJc",
    youtubeTitle: "Heart Healthy - 1 Mile Walk | Walk at Home",
    youtubeAuthor: "Walk at Home",
    youtubeAuthorUrl: "https://www.youtube.com/@LeslieSansonesWalkatHome",
    youtubeThumbnailUrl: "https://i.ytimg.com/vi/u08lo0bESJc/hqdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=u08lo0bESJc",
    youtubeVerified: true,
  },
  {
    youtubeVideoId: "v7AYKMP6rOE",
    youtubeTitle: "Yoga For Complete Beginners - 20 Minute Home Yoga Workout!",
    youtubeAuthor: "Yoga With Adriene",
    youtubeAuthorUrl: "https://www.youtube.com/@yogawithadriene",
    youtubeThumbnailUrl: "https://i.ytimg.com/vi/v7AYKMP6rOE/hqdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=v7AYKMP6rOE",
    youtubeVerified: true,
  },
  {
    youtubeVideoId: "E_gi_O71e_4",
    youtubeTitle: "Gentle Chair Yoga Routine | Safe Movement",
    youtubeAuthor: "Senior Fitness With Meredith",
    youtubeAuthorUrl: "https://www.youtube.com/@SeniorFitnessWithMeredith",
    youtubeThumbnailUrl: "https://i.ytimg.com/vi/E_gi_O71e_4/hqdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=E_gi_O71e_4",
    youtubeVerified: true,
  },
];

function getApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ""
  ).trim();
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

  const prompt = `Bạn là hệ thống Vision OCR y tế chuyên nghiệp hàng đầu.
Nhiệm vụ của bạn là đọc phiếu kết quả xét nghiệm y tế và trích xuất TOÀN BỘ các chỉ số xét nghiệm xuất hiện trên phiếu thành định dạng JSON có cấu trúc.

CÁC NGUYÊN TẮC BẮT BUỘC:
1. TRÍCH XUẤT ĐỘNG KHÔNG GIỚI HẠN:
   - Trích xuất TOÀN BỘ mọi chỉ số xuất hiện trên phiếu (Huyết học, Sinh hóa máu, Miễn dịch, Nước tiểu, Vi sinh, v.v.).
   - Tuyệt đối KHÔNG giới hạn hay loại bỏ bất kỳ chỉ số nào.
2. TRUNG THỰC - TUYỆT ĐỐI KHÔNG BỊA ĐẶT:
   - Chỉ trích xuất thông tin THỰC SỰ CÓ TRÊN PHIẾU. Tuyệt đối không tự suy diễn hoặc thêm các chỉ số không xuất hiện trong tài liệu.
3. ĐÁNH DẤU CHỈ SỐ KHÔNG CHẮC CHẮN ĐỂ NGƯỜI DÙNG RÀ SOÁT:
   - Nếu bất kỳ trường nào bị mờ, khó đọc, nếp gấp, hoặc không thể khẳng định 100% chính xác:
     * Đặt "isUncertain": true
     * Đặt "ocrConfidence" < 0.70 (ví dụ 0.5 - 0.65)
     * Ghi rõ lý do vào trường "note" (ví dụ: "Số liệu bị mờ phần thập phân, vui lòng đối chiếu lại")
   - Nếu rõ ràng, sắc nét:
     * Đặt "isUncertain": false
     * Đặt "ocrConfidence": >= 0.90
4. GIÁ TRỊ ĐỊNH LƯỢNG VÀ ĐỊNH TÍNH:
   - Với chỉ số có giá trị số (ví dụ: 7.2; 112; 4.5): "value": 7.2, "valueType": "NUMERIC".
   - Với chỉ số định tính (ví dụ: "Âm tính", "Dương tính", "Vàng trong", "Không tìm thấy"): "value": "Âm tính", "valueType": "QUALITATIVE".
5. KHOẢNG THAM CHIẾU NGUYÊN GỐC:
   - Trích xuất chính xác khoảng tham chiếu (Reference Range) ĐƯỢC IN TRÊN PHIẾU.
   - "referenceRange": {
       "low": số cận dưới (hoặc null nếu không có),
       "high": số cận trên (hoặc null nếu không có),
       "text": "chuỗi tham chiếu nguyên gốc in trên phiếu" (hoặc null nếu không in)
     }
   - KHÔNG tự đặt ngưỡng tham chiếu nếu phiếu không có. Để null nếu phiếu không in.
6. PHÂN LOẠI TRẠNG THÁI SƠ BỘ ("flag"):
   - "NORMAL": nếu giá trị nằm trong khoảng tham chiếu trên phiếu.
   - "LOW": nếu giá trị thấp hơn cận dưới trên phiếu.
   - "HIGH": nếu giá trị cao hơn cận trên trên phiếu.
   - "ABNORMAL": nếu là kết quả định tính bất thường (ví dụ: Dương tính ở xét nghiệm vi khuẩn/virus).
   - "UNCERTAIN": nếu số liệu bị mờ hoặc nghi ngờ.
   - "UNKNOWN": nếu phiếu không in khoảng tham chiếu để so sánh.

HÃY TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON VỚI CẤU TRÚC SAU:
{
  "hospitalOrLabName": "Tên cơ sở y tế (nếu đọc được, không có thì null)",
  "patientName": "Tên bệnh nhân (nếu đọc được, không có thì null)",
  "sampleDate": "Ngày lấy mẫu/xét nghiệm (nếu đọc được, không có thì null)",
  "results": [
    {
      "testCode": "MÃ CHỈ SỐ (viết hoa, ví dụ: WBC, RBC, HGB, GLUCOSE, SGOT, ALT, URIC_ACID...)",
      "testName": "Tên chỉ số xét nghiệm (ví dụ: Số lượng bạch cầu, Đường huyết...)",
      "value": 7.2,
      "valueType": "NUMERIC",
      "unit": "10^9/L",
      "referenceRange": {
        "low": 4.0,
        "high": 10.0,
        "text": "4.0 - 10.0"
      },
      "ocrConfidence": 0.95,
      "isUncertain": false,
      "flag": "NORMAL",
      "note": null
    }
  ]
}`;

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
  const results = Array.isArray(parsed.results) ? parsed.results : [];

  return {
    status: 200,
    data: {
      success: true,
      reportId,
      provider: "GEMINI_VISION",
      hospitalOrLabName: parsed.hospitalOrLabName || null,
      patientName: parsed.patientName || null,
      sampleDate: parsed.sampleDate || null,
      results,
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
      { "mealType": "BREAKFAST", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "..." },
      { "mealType": "LUNCH", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "..." },
      { "mealType": "DINNER", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "..." },
      { "mealType": "SNACK", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "..." },
      { "mealType": "DRINK", "name": "...", "description": "...", "ingredients": "...", "preparation": "...", "rationale": "..." }
    ]
  },
  "exercisePlan": {
    "title": "Kế hoạch vận động an toàn hỗ trợ thể trạng",
    "items": [
      { "name": "...", "description": "...", "duration": 20, "difficulty": "EASY", "rationale": "..." }
    ]
  }
}`;

  const rawJson = await callGemini([{ text: prompt }], undefined, true);
  const parsed = parseJsonSafely(rawJson);
  const targetReportId = reportId || "rep_" + Date.now();

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
          items: (parsed.mealPlan?.items || []).map((m: any) => {
            const defaultFood = DEFAULT_FOOD_IMAGES[m.mealType] || DEFAULT_FOOD_IMAGES.BREAKFAST;
            return { ...defaultFood, ...m };
          }),
        },
        exercisePlan: {
          reportId: targetReportId,
          title: parsed.exercisePlan?.title || "Kế hoạch vận động thể chất an toàn",
          items: (parsed.exercisePlan?.items || []).map((ex: any, idx: number) => {
            const defaultVideo = DEFAULT_EXERCISE_VIDEOS[idx % DEFAULT_EXERCISE_VIDEOS.length];
            return { ...defaultVideo, ...ex };
          }),
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

function detectAction(urlStr: string, body: any): "ocr" | "analyze" | "chat" {
  const lowerUrl = urlStr.toLowerCase();
  if (lowerUrl.includes("/ocr") || lowerUrl.endsWith("ocr")) return "ocr";
  if (lowerUrl.includes("/analyze") || lowerUrl.endsWith("analyze")) return "analyze";
  if (lowerUrl.includes("/chat") || lowerUrl.endsWith("chat")) return "chat";

  // Fallback to inspecting body
  if (body) {
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
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const action = detectAction(req.url, body);
    let result: { status: number; data: any };

    if (action === "analyze") {
      result = await handleAnalyze(body);
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
    const body = event.body ? JSON.parse(event.body) : {};
    const action = detectAction(event.path || "", body);
    let result: { status: number; data: any };

    if (action === "analyze") {
      result = await handleAnalyze(body);
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
