import { supabase } from '../lib/supabase';
import { ApiAuthError, buildAuthHeaders, throwIfAuthRejected } from '../lib/authHeaders';
import {
  AnalysisBundle,
  ConfirmedLabResult,
  HistoryReport,
  OcrDocumentStatus,
  OcrResultItem,
  OcrScanResponse,
} from '../types/patient';
import { parseOcrText } from './patientOcrNormalizer';
import { buildCompleteBundle, classifyResult } from './patientAnalysisService';

export const DEFAULT_INVALID_IMAGE_ERROR =
  'Hình ảnh không hợp lệ. Ảnh tải lên không phải phiếu khám bệnh hoặc không chứa chỉ số xét nghiệm y khoa.';

export class InvalidMedicalImageError extends Error {
  public readonly documentStatus: OcrDocumentStatus = 'UNKNOWN';
  public readonly status: OcrDocumentStatus = 'UNKNOWN';
  public readonly errorCode = 'INVALID_MEDICAL_IMAGE' as const;
  public readonly detectedSubject: string | null;

  constructor(message: string = DEFAULT_INVALID_IMAGE_ERROR, detectedSubject: string | null = null) {
    super(message);
    this.name = 'InvalidMedicalImageError';
    this.detectedSubject = detectedSubject;
  }
}

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

/**
 * Scan lab report file (Image, PDF, or Text) via Backend Gemini Vision OCR API (/api/patient/ocr)
 * Supports local text parser for .txt files without exposing any API secrets to the browser.
 */
export async function scanOcr(file: File): Promise<OcrScanResponse> {
  const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  let results: OcrResultItem[] = [];
  let provider = 'GEMINI_VISION';
  let hospitalOrLabName: string | null = null;
  let patientName: string | null = null;
  let sampleDate: string | null = null;
  let detectedSubject: string | null = null;

  // 1. Convert file to base64 for API delivery
  const fileBase64 = await fileToBase64(file);
  const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.txt') ? 'text/plain' : 'image/jpeg');

  // 2. Try calling backend Patient OCR endpoint first
  let serverSucceeded = false;
  try {
    const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/patient/ocr', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileBase64,
        mimeType,
        fileName: file.name,
      }),
    });

    await throwIfAuthRejected(res);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const rawDocStatus =
        typeof data?.documentStatus === 'string' ? data.documentStatus.trim().toUpperCase() : '';
      const rawStatus = typeof data?.status === 'string' ? data.status.trim().toUpperCase() : '';
      const isRejectedAsInvalidImage =
        res.status === 422 ||
        rawDocStatus === 'UNKNOWN' ||
        rawDocStatus === 'UNKNOW' ||
        rawStatus === 'UNKNOWN' ||
        rawStatus === 'UNKNOW' ||
        data?.isValidMedicalDocument === false ||
        data?.errorCode === 'INVALID_MEDICAL_IMAGE';

      if (isRejectedAsInvalidImage) {
        throw new InvalidMedicalImageError(
          data?.error || DEFAULT_INVALID_IMAGE_ERROR,
          data?.detectedSubject || null
        );
      }

      if (res.ok) {
        if (Array.isArray(data.results) && data.results.length > 0) {
          results = data.results;
          provider = data.provider || 'GEMINI_VISION';
          hospitalOrLabName = data.hospitalOrLabName || null;
          patientName = data.patientName || null;
          sampleDate = data.sampleDate || null;
          detectedSubject = data.detectedSubject || null;
          serverSucceeded = true;
        } else {
          throw new InvalidMedicalImageError(
            data?.error || DEFAULT_INVALID_IMAGE_ERROR,
            data?.detectedSubject || null
          );
        }
      } else if (res.status === 429) {
        throw new Error('Dịch vụ Gemini đang quá tải lượt gọi (429). Vui lòng đợi 30 giây rồi thử lại.');
      } else {
        console.warn(`[PATIENT-SERVICE] Server /api/patient/ocr returned ${res.status}.`);
      }
    } else if (res.status === 429) {
      throw new Error('Dịch vụ Gemini đang quá tải lượt gọi (429). Vui lòng đợi 30 giây rồi thử lại.');
    } else {
      console.warn(`[PATIENT-SERVICE] Server /api/patient/ocr returned ${res.status}.`);
    }
  } catch (apiErr: any) {
    if (apiErr instanceof ApiAuthError || apiErr instanceof InvalidMedicalImageError) {
      throw apiErr;
    }
    if (apiErr?.message?.includes('429')) {
      throw apiErr;
    }
    console.warn('[PATIENT-SERVICE] Server Vision OCR unreachable:', apiErr);
  }

  // 3. Offline local text parser fallback (.txt only) — NEVER calls direct client Gemini
  if (!serverSucceeded || results.length === 0) {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const rawText = await file.text();
      results = parseOcrText(rawText);
      provider = 'LOCAL_TEXT_PARSER';
    } else {
      throw new Error(
        'Không thể kết nối dịch vụ phân tích phiếu xét nghiệm trên máy chủ. Vui lòng kiểm tra kết nối và thử lại.'
      );
    }
  }

  // 4. Validate results
  if (results.length === 0) {
    throw new InvalidMedicalImageError(DEFAULT_INVALID_IMAGE_ERROR);
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
    documentStatus: 'VALID',
    isValidMedicalDocument: true,
    detectedSubject,
    results,
    hospitalOrLabName,
    patientName,
    sampleDate,
  };
}

/**
 * Confirm reviewed lab results and create full AI analysis bundle
 * Calls backend Gemini LLM (/api/patient/analyze) with safe offline rule-engine fallback (`buildCompleteBundle`).
 */
export async function confirmAnalysis(
  reportId: string,
  confirmedResults: ConfirmedLabResult[],
  age: number = 35
): Promise<AnalysisBundle> {
  let bundle: AnalysisBundle | null = null;

  try {
    // 1. Try dedicated Patient LLM analysis endpoint
    const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/patient/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reportId,
        results: confirmedResults,
        age,
      }),
    });

    await throwIfAuthRejected(res);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.bundle && data.bundle.analysis) {
        bundle = data.bundle;
      }
    }
  } catch (err) {
    if (err instanceof ApiAuthError) {
      throw err;
    }
    console.warn('[PATIENT-SERVICE] Server AI Analysis endpoint unavailable, falling back to local rule engine:', err);
  }

  // 2. Fallback to local deterministic rule engine if backend unavailable
  if (!bundle) {
    bundle = buildCompleteBundle(reportId, confirmedResults, age);
    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      const mediaRes = await fetch('/api/patient/media-search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mealItems: bundle.mealPlan.items.map((m) => ({
            ...m,
            imageSearchQuery: m.name,
          })),
          exerciseItems: bundle.exercisePlan.items.map((e) => ({
            ...e,
            videoSearchQuery: e.name,
          })),
        }),
      });
      if (mediaRes.ok && (mediaRes.headers.get('content-type') || '').includes('application/json')) {
        const mediaJson = await mediaRes.json();
        if (Array.isArray(mediaJson?.meals) && mediaJson.meals.length > 0) {
          bundle.mealPlan.items = mediaJson.meals;
        }
        if (Array.isArray(mediaJson?.exercises) && mediaJson.exercises.length > 0) {
          bundle.exercisePlan.items = mediaJson.exercises;
        }
      }
    } catch {
      // Keep local deterministic catalog fallback when offline
    }
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
    const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/patient/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, reportSummary, labResults }),
    });

    await throwIfAuthRejected(res);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      if (json.reply || json.message) {
        return json.reply || json.message;
      }
    }
  } catch (err) {
    if (err instanceof ApiAuthError) {
      throw err;
    }
    // Fallback
  }

  // 2. Try shared AI chat endpoint
  try {
    const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: reportSummary ? `[Bối cảnh xét nghiệm: ${reportSummary}] ${message}` : message,
      }),
    });

    await throwIfAuthRejected(res);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      if (json.reply || json.message || json.text) {
        return json.reply || json.message || json.text;
      }
    }
  } catch (err) {
    if (err instanceof ApiAuthError) {
      throw err;
    }
    // Safe static medical advice fallback when backend unreachable (no client API secrets)
  }

  return 'Cảm ơn câu hỏi của bạn. Hiện hệ thống trợ lý AI trên máy chủ đang tạm bận hoặc ngoại tuyến. Về các chỉ số xét nghiệm và sức khỏe, bạn nên duy trì lối sống lành mạnh, ăn uống đủ chất và tham khảo ý kiến bác sĩ khi cần.';
}
