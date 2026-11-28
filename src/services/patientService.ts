import { supabase } from '../lib/supabase';
import {
  AnalysisBundle,
  ConfirmedLabResult,
  HistoryReport,
  OcrResultItem,
  OcrScanResponse,
} from '../types/patient';
import { parseOcrText } from './patientOcrNormalizer';
import { buildCompleteBundle, classifyResult } from './patientAnalysisService';
import { GoogleGenAI } from '@google/genai';

const LEGACY_STORAGE_KEY_REPORTS = 'eyetalk_patient_reports';
const LEGACY_STORAGE_KEY_BUNDLES_PREFIX = 'eyetalk_patient_bundles';
const SCOPED_STORAGE_PREFIX = 'eyetalk_patient_v2';

/**
 * Resolves the verified Supabase user ID for user-scoped patient storage isolation.
 * Fails closed (returns null) if no authenticated user session is active.
 */
export async function resolvePatientUserId(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) {
      return sessionData.session.user.id;
    }
    const { data: userData } = await supabase.auth.getUser();
    return userData?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Detects pre-existing un-namespaced legacy keys without mutating or exposing them.
 */
export function hasUnownedLegacyPatientStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    if (localStorage.getItem(LEGACY_STORAGE_KEY_REPORTS) !== null) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${LEGACY_STORAGE_KEY_BUNDLES_PREFIX}_`)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function getScopedReportsKey(userId: string): string {
  return `${SCOPED_STORAGE_PREFIX}_${userId}_reports`;
}

function getScopedBundleKey(userId: string, reportId: string): string {
  return `${SCOPED_STORAGE_PREFIX}_${userId}_bundles_${reportId}`;
}

function getLocalReports(userId: string | null): HistoryReport[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getScopedReportsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => !r.user_id || r.user_id === userId);
  } catch {
    return [];
  }
}

function saveLocalReport(report: HistoryReport, userId: string | null) {
  if (!userId) return;
  try {
    const scopedReport: HistoryReport = { ...report, user_id: userId };
    const reports = getLocalReports(userId);
    const filtered = reports.filter((r) => r.id !== scopedReport.id);
    localStorage.setItem(getScopedReportsKey(userId), JSON.stringify([scopedReport, ...filtered]));
  } catch {
    // Ignore
  }
}

function getLocalBundle(reportId: string, userId: string | null): AnalysisBundle | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(getScopedBundleKey(userId, reportId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalBundle(reportId: string, bundle: AnalysisBundle, userId: string | null) {
  if (!userId) return;
  try {
    localStorage.setItem(getScopedBundleKey(userId, reportId), JSON.stringify(bundle));
  } catch {
    // Ignore
  }
}

const CLIENT_MODELS_TO_TRY = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
];

function getClientGeminiApiKey(): string {
  const env = import.meta.env;
  return (
    env?.VITE_GEMINI_API_KEY ||
    env?.GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY) : '') ||
    ''
  ).trim();
}

/**
 * Resizes image client-side if it exceeds max dimension (e.g. mobile photo > 2048px)
 * Keeps file size optimal for fast OCR and avoids Netlify 6MB serverless payload limit
 */
function resizeImageIfNeeded(file: File, maxDimension: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size < 1.5 * 1024 * 1024) {
          return resolve(e.target?.result as string);
        }
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    try {
      const optimized = await resizeImageIfNeeded(file, 2048);
      if (optimized) return optimized;
    } catch {
      // Fallback to normal FileReader
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

const OCR_PROMPT = `Bạn là hệ thống Vision OCR y tế chuyên nghiệp hàng đầu.
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

/**
 * Direct client-side Gemini Vision OCR execution
 * Runs when backend serverless endpoint is 404 or unreachable
 */
async function performClientVisionOcr(
  fileBase64: string,
  mimeType: string
): Promise<Partial<OcrScanResponse> | null> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình API Key cho dịch vụ Gemini AI.');
  }

  const rawBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const cleanMime = (mimeType || '').toLowerCase().trim();

  let contents: any[] = [];
  if (cleanMime === 'text/plain') {
    const textContent = atob(rawBase64);
    contents = [{ text: `${OCR_PROMPT}\n\nNỘI DUNG PHIẾU XÉT NGHIỆM DẠNG VĂN BẢN:\n${textContent}` }];
  } else {
    const standardMime = cleanMime.includes('pdf')
      ? 'application/pdf'
      : cleanMime.includes('png')
      ? 'image/png'
      : cleanMime.includes('webp')
      ? 'image/webp'
      : 'image/jpeg';
    contents = [
      { text: OCR_PROMPT },
      {
        inlineData: {
          data: rawBase64,
          mimeType: standardMime,
        },
      },
    ];
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let lastError: any = null;
  for (const model of CLIENT_MODELS_TO_TRY) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response && response.text) {
        let cleaned = response.text.trim();
        if (cleaned.startsWith('```json')) {
          cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
        }
        const parsed = JSON.parse(cleaned);
        const results: OcrResultItem[] = Array.isArray(parsed.results) ? parsed.results : [];
        return {
          results,
          hospitalOrLabName: parsed.hospitalOrLabName || null,
          patientName: parsed.patientName || null,
          sampleDate: parsed.sampleDate || null,
          provider: `GEMINI_VISION (${model})`,
        };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[PATIENT-CLIENT-OCR] Model ${model} failed:`, err?.message || err);
    }
  }

  throw new Error(lastError?.message || 'Không thể nhận diện hình ảnh qua dịch vụ Gemini Vision.');
}

/**
 * Scan lab report file (Image, PDF, or Text) via real Gemini Vision OCR API
 * With automatic dynamic schema extraction and graceful local fallback
 */
export async function scanOcr(file: File): Promise<OcrScanResponse> {
  const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  let results: OcrResultItem[] = [];
  let provider = 'GEMINI_VISION';
  let hospitalOrLabName: string | null = null;
  let patientName: string | null = null;
  let sampleDate: string | null = null;

  // 1. Convert file to base64 for API delivery
  const fileBase64 = await fileToBase64(file);
  const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.txt') ? 'text/plain' : 'image/jpeg');

  // 2. Try calling backend Patient OCR endpoint first
  let serverSucceeded = false;
  try {
    const res = await fetch('/api/patient/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        mimeType,
        fileName: file.name,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        results = data.results;
        provider = data.provider || 'GEMINI_VISION';
        hospitalOrLabName = data.hospitalOrLabName || null;
        patientName = data.patientName || null;
        sampleDate = data.sampleDate || null;
        serverSucceeded = true;
      }
    } else {
      console.warn(`[PATIENT-SERVICE] Server /api/patient/ocr returned ${res.status}. Switching to direct client OCR.`);
    }
  } catch (apiErr: any) {
    console.warn('[PATIENT-SERVICE] Server Vision OCR unreachable, switching to direct client OCR:', apiErr);
  }

  // 3. Fallback to direct client-side Gemini Vision OCR if backend failed, returned 404, or had empty results
  if (!serverSucceeded || results.length === 0) {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const rawText = await file.text();
      results = parseOcrText(rawText);
      provider = 'LOCAL_TEXT_PARSER';
    } else {
      try {
        const clientRes = await performClientVisionOcr(fileBase64, mimeType);
        if (clientRes && Array.isArray(clientRes.results) && clientRes.results.length > 0) {
          results = clientRes.results;
          provider = clientRes.provider || 'GEMINI_VISION_DIRECT';
          hospitalOrLabName = clientRes.hospitalOrLabName || null;
          patientName = clientRes.patientName || null;
          sampleDate = clientRes.sampleDate || null;
        }
      } catch (clientErr: any) {
        console.error('[PATIENT-SERVICE] Client Vision OCR error:', clientErr);
        const msg = clientErr?.message || '';
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          throw new Error('Dịch vụ Gemini đang quá tải lượt gọi (429). Vui lòng đợi 30 giây rồi thử lại.');
        }
        throw new Error(
          'Không thể nhận diện được chỉ số xét nghiệm từ hình ảnh tải lên. Vui lòng kiểm tra độ sáng, góc chụp và chụp lại rõ nét hơn.'
        );
      }
    }
  }

  // 4. Validate results
  if (results.length === 0) {
    throw new Error(
      'Không thể nhận diện được chỉ số xét nghiệm từ hình ảnh tải lên. Vui lòng kiểm tra ảnh rõ nét và chụp đúng phiếu kết quả xét nghiệm.'
    );
  }

  // 5. Create and persist initial report metadata scoped to authenticated patient
  const activeUserId = await resolvePatientUserId();
  const reportObj: HistoryReport = {
    id: reportId,
    user_id: activeUserId ?? undefined,
    created_at: new Date().toISOString(),
    status: 'PROCESSED',
    source_type: file.type.includes('image') ? 'CAMERA' : 'UPLOAD',
    results_count: results.length,
  };
  saveLocalReport(reportObj, activeUserId);

  // 6. Sync to Supabase if user is authenticated
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from('lab_reports').insert({
        id: reportId,
        user_id: userData.user.id,
        status: 'PROCESSED',
        source_type: file.type.includes('image') ? 'CAMERA' : 'UPLOAD',
        image_reference: file.name,
      });
    }
  } catch {
    // Ignore database write failures (fallback to local state)
  }

  return {
    reportId,
    provider,
    results,
    hospitalOrLabName,
    patientName,
    sampleDate,
  };
}

/**
 * Direct client-side Gemini Lab Analysis execution
 */
async function performClientAnalysis(
  reportId: string,
  confirmedResults: ConfirmedLabResult[],
  age: number
): Promise<AnalysisBundle | null> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) return null;

  try {
    const prompt = `Bạn là Chuyên gia Y tế & Dinh dưỡng tư vấn giải thích kết quả xét nghiệm y khoa.
Dưới đây là danh sách kết quả xét nghiệm đã được người dùng rà soát và xác nhận:
Độ tuổi bệnh nhân: ${age} tuổi.
Danh sách chỉ số:
${JSON.stringify(confirmedResults, null, 2)}

NGUYÊN TẮC AN TOÀN Y TẾ & KIỂM CHỨNG:
1. KHÔNG TỰ ĐẶT NGƯỠNG HOẶC CHẨN ĐOÁN BỆNH:
   - Bạn chỉ đóng vai trò người giải thích thông tin tham khảo. Tuyệt đối KHÔNG khẳng định chẩn đoán bệnh tật hoặc kê đơn thuốc.
   - Nhận xét từng chỉ số PHẢI DỰA TRÊN KHOẢNG THAM CHIẾU ĐÃ GHI TRÊN PHIẾU (referenceText / referenceLow / referenceHigh).
   - Nếu chỉ số không có khoảng tham chiếu, giải thích ý nghĩa sinh lý thông thường và khuyên hỏi bác sĩ chỉ định.
2. CÓ NGUỒN KIỂM CHỨNG/CĂN CỨ Y KHOA:
   - Trong mỗi chỉ số hoặc trong phần tóm tắt, hãy nêu ngắn gọn nguồn tài liệu hoặc chuẩn y tế tham chiếu đáng tin cậy (ví dụ: "Theo Hướng dẫn Chẩn đoán của Bộ Y tế Việt Nam", "Theo Khuyến cáo của Hội Tim mạch Việt Nam / VNHA", "Theo Hướng dẫn Lâm sàng của WHO / ADA").
3. GỢI Ý DINH DƯỠNG & BẬN ĐỘNG HỖ TRỢ AN TOÀN:
   - Thực đơn 1 ngày (5 bữa: BREAKFAST, LUNCH, DINNER, SNACK, DRINK) hỗ trợ cải thiện tình trạng dựa trên các chỉ số cần lưu ý.
   - Bài tập thể chất (2-3 bài tập nhẹ nhàng, vừa sức, an toàn).

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

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    for (const model of CLIENT_MODELS_TO_TRY) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ text: prompt }],
          config: { responseMimeType: 'application/json' },
        });

        if (response && response.text) {
          let cleaned = response.text.trim();
          if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
          }
          const parsed = JSON.parse(cleaned);
          const baseBundle = buildCompleteBundle(reportId, confirmedResults, age);

          return {
            analysis: {
              reportId,
              overallSummary: parsed.overallSummary || baseBundle.analysis.overallSummary,
              results: Array.isArray(parsed.results) && parsed.results.length > 0 ? parsed.results : baseBundle.analysis.results,
            },
            mealPlan: {
              reportId,
              title: parsed.mealPlan?.title || baseBundle.mealPlan.title,
              description: parsed.mealPlan?.description || baseBundle.mealPlan.description,
              items: Array.isArray(parsed.mealPlan?.items) && parsed.mealPlan.items.length > 0
                ? parsed.mealPlan.items.map((m: any, i: number) => ({
                    ...(baseBundle.mealPlan.items[i] || baseBundle.mealPlan.items[0]),
                    ...m,
                  }))
                : baseBundle.mealPlan.items,
            },
            exercisePlan: {
              reportId,
              title: parsed.exercisePlan?.title || baseBundle.exercisePlan.title,
              items: Array.isArray(parsed.exercisePlan?.items) && parsed.exercisePlan.items.length > 0
                ? parsed.exercisePlan.items.map((ex: any, i: number) => ({
                    ...(baseBundle.exercisePlan.items[i] || baseBundle.exercisePlan.items[0]),
                    ...ex,
                  }))
                : baseBundle.exercisePlan.items,
            },
          };
        }
      } catch (modelErr) {
        console.warn(`[PATIENT-CLIENT-ANALYSIS] Model ${model} failed:`, modelErr);
      }
    }
  } catch (err) {
    console.warn('[PATIENT-CLIENT-ANALYSIS] Error:', err);
  }
  return null;
}

/**
 * Confirm reviewed lab results and create full AI analysis bundle
 * Calls Gemini LLM for verified explanation + dietary & exercise recommendations
 */
export async function confirmAnalysis(
  reportId: string,
  confirmedResults: ConfirmedLabResult[],
  age: number = 35
): Promise<AnalysisBundle> {
  let bundle: AnalysisBundle | null = null;

  try {
    // 1. Try dedicated Patient LLM analysis endpoint
    const res = await fetch('/api/patient/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId,
        results: confirmedResults,
        age,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.bundle && data.bundle.analysis) {
        bundle = data.bundle;
      }
    }
  } catch (err) {
    console.warn('[PATIENT-SERVICE] Server AI Analysis endpoint failed, trying client AI:', err);
  }

  // 2. Fallback to client-side Gemini LLM analysis
  if (!bundle) {
    try {
      bundle = await performClientAnalysis(reportId, confirmedResults, age);
    } catch (clientErr) {
      console.warn('[PATIENT-SERVICE] Client AI analysis fallback notice:', clientErr);
    }
  }

  // 3. Fallback to local rule engine if offline or model unavailable
  if (!bundle) {
    bundle = buildCompleteBundle(reportId, confirmedResults, age);
  }

  // 4. Save bundle locally scoped to authenticated patient
  const activeUserId = await resolvePatientUserId();
  saveLocalBundle(reportId, bundle, activeUserId);

  // 5. Update history report status
  if (activeUserId) {
    const reports = getLocalReports(activeUserId);
    const index = reports.findIndex((r) => r.id === reportId);
    if (index !== -1) {
      reports[index].results_count = confirmedResults.length;
      localStorage.setItem(getScopedReportsKey(activeUserId), JSON.stringify(reports));
    } else {
      saveLocalReport(
        {
          id: reportId,
          user_id: activeUserId,
          created_at: new Date().toISOString(),
          status: 'PROCESSED',
          source_type: 'UPLOAD',
          results_count: confirmedResults.length,
        },
        activeUserId
      );
    }
  }

  // 6. Sync to Supabase with type-safe numeric value handling
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from('lab_reports').upsert({
        id: reportId,
        user_id: userData.user.id,
        status: 'PROCESSED',
        source_type: 'UPLOAD',
      });

      const insertRows = confirmedResults.map((r) => {
        const numVal = typeof r.value === 'number' ? r.value : Number(r.value);
        const safeNum = Number.isFinite(numVal) ? numVal : 0;
        const status = classifyResult(r);

        return {
          report_id: reportId,
          test_code: r.testCode,
          test_name: r.testName,
          value: safeNum,
          unit: r.unit,
          reference_low: r.referenceLow,
          reference_high: r.referenceHigh,
          reference_text: r.referenceText,
          status,
          ocr_confidence: 1.0,
          explanation: typeof r.value === 'string' && !Number.isFinite(numVal) ? `[Định tính: ${r.value}]` : null,
        };
      });

      await supabase.from('lab_results').delete().eq('report_id', reportId);
      await supabase.from('lab_results').insert(insertRows);
    }
  } catch (dbErr) {
    console.warn('[PATIENT-SERVICE] Supabase sync notice:', dbErr);
  }

  return bundle;
}

/**
 * Get detail analysis bundle for a report
 */
export async function getReportDetail(reportId: string): Promise<AnalysisBundle> {
  const activeUserId = await resolvePatientUserId();
  if (!activeUserId) {
    throw new Error('Phiên đăng nhập chưa xác thực. Vui lòng đăng nhập lại để xem kết quả.');
  }

  // 1. Try user-scoped local storage first
  const local = getLocalBundle(reportId, activeUserId);
  if (local) return local;

  // 2. Try fetching from Supabase after verifying report ownership
  try {
    const { data: ownReport } = await supabase
      .from('lab_reports')
      .select('id, user_id')
      .eq('id', reportId)
      .eq('user_id', activeUserId)
      .maybeSingle();

    if (ownReport) {
      const { data: results, error } = await supabase
        .from('lab_results')
        .select('*')
        .eq('report_id', reportId);

      if (!error && results && results.length > 0) {
        const confirmed: ConfirmedLabResult[] = results.map((r) => {
          const isQual = typeof r.explanation === 'string' && r.explanation.startsWith('[Định tính: ');
          const qualVal = isQual ? r.explanation.replace('[Định tính: ', '').replace(']', '') : '';
          return {
            testCode: r.test_code,
            testName: r.test_name,
            value: isQual ? qualVal : Number(r.value),
            valueType: isQual ? 'QUALITATIVE' : 'NUMERIC',
            unit: r.unit,
            referenceLow: r.reference_low ? Number(r.reference_low) : null,
            referenceHigh: r.reference_high ? Number(r.reference_high) : null,
            referenceText: r.reference_text,
          };
        });
        const bundle = buildCompleteBundle(reportId, confirmed);
        saveLocalBundle(reportId, bundle, activeUserId);
        return bundle;
      }
    }
  } catch {
    // Ignore
  }

  throw new Error('Không tìm thấy dữ liệu kết quả xét nghiệm cho phiếu này. Vui lòng rà soát hoặc quét lại.');
}

/**
 * Get user's lab history list
 */
export async function getHistory(): Promise<HistoryReport[]> {
  const activeUserId = await resolvePatientUserId();
  if (!activeUserId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('lab_reports')
      .select('*')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as HistoryReport[];
    }
  } catch {
    // Ignore
  }

  return getLocalReports(activeUserId);
}

/**
 * Send chat message to specialized Patient AI Health Chatbot
 */
export async function sendPatientChatMessage(
  message: string,
  reportSummary?: string,
  labResults?: any[]
): Promise<string> {
  // 1. Try Patient Chat server endpoint
  try {
    const res = await fetch('/api/patient/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, reportSummary, labResults }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      if (json.reply || json.message) {
        return json.reply || json.message;
      }
    }
  } catch {
    // Fallback
  }

  // 2. Try shared AI chat endpoint
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: reportSummary ? `[Bối cảnh xét nghiệm: ${reportSummary}] ${message}` : message,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      if (json.reply || json.message || json.text) {
        return json.reply || json.message || json.text;
      }
    }
  } catch {
    // Fallback
  }

  // 3. Direct client-side Gemini fallback
  const apiKey = getClientGeminiApiKey();
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const systemPrompt = `Bạn là Trợ lý Y tế & Sức khỏe thông minh thuộc hệ thống EYEAI (Chế độ Bệnh nhân).
Nhiệm vụ: Giải thích các thắc mắc của bệnh nhân về chỉ số xét nghiệm, dinh dưỡng, lối sống và bài tập thể lực.
NGUYÊN TẮC:
- Trả lời bằng Tiếng Việt thân thiện, ân cần, rõ ràng, giải thích dễ hiểu.
- Độ dài khoảng 3-6 câu, súc tích.
- Tuyệt đối KHÔNG tự chẩn đoán bệnh hay thay đổi chỉ định của bác sĩ. Luôn khuyến khích bệnh nhân tham khảo bác sĩ chuyên môn khi cần quyết định điều trị.`;

      const promptText = reportSummary
        ? `[Bối cảnh xét nghiệm: ${reportSummary}]\n[Câu hỏi]: ${message}`
        : message;

      for (const model of CLIENT_MODELS_TO_TRY) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ text: promptText }],
            config: { systemInstruction: systemPrompt },
          });
          if (response && response.text) {
            return response.text;
          }
        } catch {
          // Continue to next model
        }
      }
    } catch {
      // Ignore
    }
  }

  return 'Cảm ơn câu hỏi của bạn. Về các chỉ số xét nghiệm và sức khỏe, bạn nên duy trì lối sống lành mạnh, ăn uống đủ chất và tham khảo ý kiến bác sĩ khi cần.';
}
