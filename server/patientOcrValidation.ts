export type OcrDocumentStatus = 'VALID' | 'UNKNOWN';

export interface ValidatedOcrItem {
  testCode: string;
  testName: string;
  value: number | string;
  valueType: 'NUMERIC' | 'QUALITATIVE';
  unit: string;
  referenceRange: {
    low: number | null;
    high: number | null;
    text: string | null;
  };
  ocrConfidence: number;
  isUncertain?: boolean;
  flag?: 'LOW' | 'NORMAL' | 'HIGH' | 'ABNORMAL' | 'UNCERTAIN' | 'UNKNOWN';
  note?: string | null;
}

export interface ValidatedOcrPayload {
  valid: boolean;
  documentStatus: OcrDocumentStatus;
  status: OcrDocumentStatus;
  isValidMedicalDocument: boolean;
  detectedSubject: string | null;
  hospitalOrLabName: string | null;
  patientName: string | null;
  sampleDate: string | null;
  results: ValidatedOcrItem[];
  errorCode?: 'INVALID_MEDICAL_IMAGE';
  error?: string;
}

export const INVALID_MEDICAL_IMAGE_MESSAGE =
  'Hình ảnh không hợp lệ. Ảnh tải lên không phải phiếu khám bệnh hoặc không chứa chỉ số xét nghiệm y khoa.';

export const PATIENT_VISION_OCR_PROMPT = `Bạn là hệ thống Vision Computer & OCR y tế chuyên nghiệp hàng đầu.
Nhiệm vụ của bạn gồm 2 BƯỚC BẮT BUỘC:

BƯỚC 1 — KIỂM TRA TÍNH HỢP LỆ (VALIDATION GATE):
- Xác định xem hình ảnh/tài liệu đầu vào có phải là PHIẾU KẾT QUẢ XÉT NGHIỆM Y KHOA hoặc TÀI LIỆU CÓ CHỈ SỐ KHÁM BỆNH thực sự hay không (ví dụ: xét nghiệm máu, sinh hóa, nước tiểu, miễn dịch, phiếu chỉ số sinh tồn/khám bệnh có số liệu y tế rõ ràng).
- NẾU hình ảnh KHÔNG PHẢI là tài liệu có chỉ số khám bệnh/xét nghiệm (ví dụ: ảnh khuôn mặt con người, ảnh chân dung/selfie, phong cảnh, đồ ăn, động vật, vật dụng, hóa đơn mua hàng, giấy tờ tùy thân, ảnh chụp màn hình không liên quan, ảnh trắng/mờ không đọc được chỉ số y khoa):
  * BẮT BUỘC đặt "documentStatus": "UNKNOWN"
  * BẮT BUỘC đặt "isValidMedicalDocument": false
  * Ghi mô tả ngắn nội dung thực tế nhìn thấy vào "detectedSubject" (ví dụ: "Ảnh khuôn mặt con người", "Ảnh phong cảnh", "Không phải phiếu chỉ số khám bệnh")
  * BẮT BUỘC trả về "results": [] (mảng rỗng tuyệt đối, KHÔNG được bịa đặt hoặc suy diễn chỉ số).
  * Trả về ngay JSON từ chối theo cấu trúc bên dưới.

BƯỚC 2 — TRÍCH XUẤT CHỈ SỐ (CHỈ KHI LÀ PHIẾU KHÁM BỆNH/XÉT NGHIỆM HỢP LỆ):
- Đặt "documentStatus": "VALID"
- Đặt "isValidMedicalDocument": true
- Đặt "detectedSubject": "Phiếu kết quả xét nghiệm / chỉ số khám bệnh"
1. TRÍCH XUẤT ĐỘNG KHÔNG GIỚI HẠN:
   - Trích xuất TOÀN BỘ mọi chỉ số xuất hiện trên phiếu (Huyết học, Sinh hóa máu, Miễn dịch, Nước tiểu, Vi sinh, chỉ số khám bệnh, v.v.).
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
  "documentStatus": "VALID hoặc UNKNOWN",
  "isValidMedicalDocument": true,
  "detectedSubject": "Phiếu kết quả xét nghiệm y khoa (hoặc mô tả ảnh không hợp lệ)",
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

const INVALID_TOKENS = new Set([
  'UNKNOWN',
  'UNKNOW',
  'NONE',
  'N/A',
  'NA',
  'NULL',
  'UNDEFINED',
  'INVALID',
  'OTHER',
  'KHÔNG XÁC ĐỊNH',
  'KHÔNG RÕ',
  'KHÔNG CÓ',
]);

const NON_MEDICAL_SUBJECT_PATTERNS = [
  /khuôn\s*mặt/i,
  /chân\s*dung/i,
  /\bselfie\b/i,
  /\bhuman\s*face\b/i,
  /\bportrait\b/i,
  /phong\s*cảnh/i,
  /\blandscape\b/i,
  /động\s*vật/i,
  /\banimal\b/i,
  /không\s*phải\s*(?:phiếu|ảnh\s*xét\s*nghiệm|tài\s*liệu\s*y\s*tế|chỉ\s*số)/i,
  /\bnot\s+a?\s*medical\b/i,
  /\bnon[-_\s]?medical\b/i,
  /ảnh\s*không\s*hợp\s*lệ/i,
];

function isPlaceholderToken(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).trim();
  if (!s) return true;
  return INVALID_TOKENS.has(s.toUpperCase());
}

function normalizeResultItem(item: any): ValidatedOcrItem | null {
  if (!item || typeof item !== 'object') return null;

  const rawCode = typeof item.testCode === 'string' ? item.testCode.trim() : '';
  const rawName = typeof item.testName === 'string' ? item.testName.trim() : '';

  if (isPlaceholderToken(rawCode) || isPlaceholderToken(rawName)) {
    return null;
  }

  let value: number | string | null = null;
  let valueType: 'NUMERIC' | 'QUALITATIVE' = 'NUMERIC';

  if (typeof item.value === 'number') {
    if (!Number.isFinite(item.value)) return null;
    value = item.value;
    valueType = item.valueType === 'QUALITATIVE' ? 'QUALITATIVE' : 'NUMERIC';
  } else if (typeof item.value === 'string') {
    const trimmed = item.value.trim();
    if (isPlaceholderToken(trimmed)) return null;
    const parsedNum = Number(trimmed.replace(',', '.'));
    if (Number.isFinite(parsedNum) && item.valueType !== 'QUALITATIVE') {
      value = parsedNum;
      valueType = 'NUMERIC';
    } else {
      value = trimmed;
      valueType = 'QUALITATIVE';
    }
  } else {
    return null;
  }

  const refRange = item.referenceRange && typeof item.referenceRange === 'object' ? item.referenceRange : {};
  const low = typeof refRange.low === 'number' && Number.isFinite(refRange.low) ? refRange.low : null;
  const high = typeof refRange.high === 'number' && Number.isFinite(refRange.high) ? refRange.high : null;
  const text = typeof refRange.text === 'string' && refRange.text.trim() ? refRange.text.trim() : null;

  const ocrConfidence =
    typeof item.ocrConfidence === 'number' && Number.isFinite(item.ocrConfidence)
      ? Math.max(0, Math.min(1, item.ocrConfidence))
      : 0.9;

  return {
    testCode: rawCode.toUpperCase(),
    testName: rawName,
    value,
    valueType,
    unit: typeof item.unit === 'string' ? item.unit.trim() : '',
    referenceRange: { low, high, text },
    ocrConfidence,
    isUncertain: Boolean(item.isUncertain),
    flag: item.flag,
    note: typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null,
  };
}

/**
 * Enforces strict Vision Computer medical-document validation.
 * Any non-medical or unrecognizable input (e.g. human face, scenery, empty results)
 * is overridden to `documentStatus: 'UNKNOWN'` with `results: []`.
 */
export function validateAndNormalizeOcrPayload(parsed: any): ValidatedOcrPayload {
  const detectedSubject =
    parsed && typeof parsed.detectedSubject === 'string' && parsed.detectedSubject.trim()
      ? parsed.detectedSubject.trim()
      : null;

  const makeUnknown = (subject: string | null = detectedSubject): ValidatedOcrPayload => ({
    valid: false,
    documentStatus: 'UNKNOWN',
    status: 'UNKNOWN',
    isValidMedicalDocument: false,
    detectedSubject: subject,
    hospitalOrLabName: null,
    patientName: null,
    sampleDate: null,
    results: [],
    errorCode: 'INVALID_MEDICAL_IMAGE',
    error: INVALID_MEDICAL_IMAGE_MESSAGE,
  });

  if (!parsed || typeof parsed !== 'object') {
    return makeUnknown(null);
  }

  const rawDocStatus =
    typeof parsed.documentStatus === 'string' ? parsed.documentStatus.trim().toUpperCase() : '';

  if (parsed.isValidMedicalDocument === false) {
    return makeUnknown();
  }

  if (rawDocStatus && rawDocStatus !== 'VALID') {
    return makeUnknown();
  }

  if (
    rawDocStatus !== 'VALID' &&
    parsed.isValidMedicalDocument !== true &&
    detectedSubject &&
    NON_MEDICAL_SUBJECT_PATTERNS.some((re) => re.test(detectedSubject))
  ) {
    return makeUnknown();
  }

  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const validResults = rawResults
    .map(normalizeResultItem)
    .filter((item): item is ValidatedOcrItem => item !== null);

  if (validResults.length === 0) {
    return makeUnknown();
  }

  return {
    valid: true,
    documentStatus: 'VALID',
    status: 'VALID',
    isValidMedicalDocument: true,
    detectedSubject: detectedSubject || 'Phiếu kết quả xét nghiệm y khoa',
    hospitalOrLabName:
      typeof parsed.hospitalOrLabName === 'string' && parsed.hospitalOrLabName.trim()
        ? parsed.hospitalOrLabName.trim()
        : null,
    patientName:
      typeof parsed.patientName === 'string' && parsed.patientName.trim() ? parsed.patientName.trim() : null,
    sampleDate: typeof parsed.sampleDate === 'string' && parsed.sampleDate.trim() ? parsed.sampleDate.trim() : null,
    results: validResults,
  };
}
