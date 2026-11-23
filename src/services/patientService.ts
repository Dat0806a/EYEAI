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

const LOCAL_STORAGE_KEY_REPORTS = 'eyetalk_patient_reports';
const LOCAL_STORAGE_KEY_BUNDLES = 'eyetalk_patient_bundles';

function getLocalReports(): HistoryReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalReport(report: HistoryReport) {
  try {
    const reports = getLocalReports();
    const filtered = reports.filter((r) => r.id !== report.id);
    localStorage.setItem(LOCAL_STORAGE_KEY_REPORTS, JSON.stringify([report, ...filtered]));
  } catch {
    // Ignore
  }
}

function getLocalBundle(reportId: string): AnalysisBundle | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_BUNDLES}_${reportId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalBundle(reportId: string, bundle: AnalysisBundle) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_BUNDLES}_${reportId}`, JSON.stringify(bundle));
  } catch {
    // Ignore
  }
}

function fileToBase64(file: File): Promise<string> {
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
 * Scan lab report file (Image, PDF, or Text) via real Gemini Vision OCR API
 * with automatic dynamic schema extraction and graceful local fallback
 */
export async function scanOcr(file: File): Promise<OcrScanResponse> {
  const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  let results: OcrResultItem[] = [];
  let provider = 'GEMINI_VISION';

  try {
    // 1. Convert file to base64 for API delivery
    const fileBase64 = await fileToBase64(file);
    const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.txt') ? 'text/plain' : 'image/jpeg');

    // 2. Call dedicated Patient OCR endpoint on Express server
    const res = await fetch('/api/patient/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        mimeType,
        fileName: file.name,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        results = data.results;
        provider = data.provider || 'GEMINI_VISION';
      }
    } else {
      const errorJson = await res.json().catch(() => null);
      const serverErrMsg = errorJson?.error || `Lỗi máy chủ (${res.status})`;
      console.error('[PATIENT-SERVICE] Vision OCR returned non-ok status:', res.status, serverErrMsg);
      throw new Error(serverErrMsg);
    }
  } catch (apiErr: any) {
    console.warn('[PATIENT-SERVICE] Vision OCR error:', apiErr);
    if (apiErr?.message && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
  }

  // 3. Handle non-image text file parsing or report real error (no mock substitution)
  if (results.length === 0) {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const rawText = await file.text();
      results = parseOcrText(rawText);
      provider = 'LOCAL_TEXT_PARSER';
    } else {
      throw new Error(
        'Không thể nhận diện được chỉ số xét nghiệm từ hình ảnh tải lên. Vui lòng kiểm tra độ sáng, góc chụp và chụp lại rõ nét hơn.'
      );
    }
  }

  // 4. Create and persist initial report metadata
  const reportObj: HistoryReport = {
    id: reportId,
    created_at: new Date().toISOString(),
    status: 'PROCESSED',
    source_type: file.type.includes('image') ? 'CAMERA' : 'UPLOAD',
    results_count: results.length,
  };
  saveLocalReport(reportObj);

  // 5. Sync to Supabase if user is authenticated
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
  };
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
    // 1. Call dedicated Patient LLM analysis endpoint
    const res = await fetch('/api/patient/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId,
        results: confirmedResults,
        age,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.bundle && data.bundle.analysis) {
        bundle = data.bundle;
      }
    }
  } catch (err) {
    console.warn('[PATIENT-SERVICE] AI Analysis endpoint failed, using local rule-based engine:', err);
  }

  // 2. Fallback to local rule engine if offline or server error
  if (!bundle) {
    bundle = buildCompleteBundle(reportId, confirmedResults, age);
  }

  // 3. Save bundle locally
  saveLocalBundle(reportId, bundle);

  // 4. Update history report status
  const reports = getLocalReports();
  const index = reports.findIndex((r) => r.id === reportId);
  if (index !== -1) {
    reports[index].results_count = confirmedResults.length;
    localStorage.setItem(LOCAL_STORAGE_KEY_REPORTS, JSON.stringify(reports));
  } else {
    saveLocalReport({
      id: reportId,
      created_at: new Date().toISOString(),
      status: 'PROCESSED',
      source_type: 'UPLOAD',
      results_count: confirmedResults.length,
    });
  }

  // 5. Sync to Supabase with type-safe numeric value handling
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
  // 1. Try local storage first
  const local = getLocalBundle(reportId);
  if (local) return local;

  // 2. Try fetching from Supabase
  try {
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
      saveLocalBundle(reportId, bundle);
      return bundle;
    }
  } catch {
    // Ignore
  }

  // 3. No fallback mock bundle in production
  throw new Error('Không tìm thấy dữ liệu kết quả xét nghiệm cho phiếu này. Vui lòng rà soát hoặc quét lại.');
}

/**
 * Get user's lab history list
 */
export async function getHistory(): Promise<HistoryReport[]> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data, error } = await supabase
        .from('lab_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as HistoryReport[];
      }
    }
  } catch {
    // Ignore
  }

  return getLocalReports();
}

/**
 * Send chat message to specialized Patient AI Health Chatbot
 */
export async function sendPatientChatMessage(
  message: string,
  reportSummary?: string,
  labResults?: any[]
): Promise<string> {
  try {
    const res = await fetch('/api/patient/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, reportSummary, labResults }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.reply || json.message) {
        return json.reply || json.message;
      }
    }
  } catch {
    // Fallback to shared AI chat endpoint if patient endpoint is not defined
  }

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: reportSummary ? `[Bối cảnh xét nghiệm: ${reportSummary}] ${message}` : message,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return json.reply || json.message || json.text || 'Cảm ơn câu hỏi của bạn. Đây là thông tin tham khảo sức khỏe.';
    }
  } catch {
    // Ignore
  }

  return 'Cảm ơn câu hỏi của bạn. Về các chỉ số xét nghiệm và sức khỏe, bạn nên duy trì lối sống lành mạnh, ăn uống đủ chất và tham khảo ý kiến bác sĩ khi cần.';
}
