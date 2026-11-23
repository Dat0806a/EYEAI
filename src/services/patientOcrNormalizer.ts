import { OcrResultItem } from '../types/patient';

// Dictionary used ONLY for enriching missing human names/units when known, NEVER as a filter/whitelist
const KNOWN_TEST_HINTS: Record<string, { name: string; unit: string; low?: number; high?: number }> = {
  WBC: { name: 'Số lượng bạch cầu', unit: '10^9/L', low: 4.0, high: 10.0 },
  RBC: { name: 'Số lượng hồng cầu', unit: '10^12/L', low: 4.0, high: 5.5 },
  HGB: { name: 'Hemoglobin', unit: 'g/L', low: 120, high: 160 },
  HCT: { name: 'Hematocrit', unit: '%', low: 36, high: 48 },
  PLT: { name: 'Số lượng tiểu cầu', unit: '10^9/L', low: 150, high: 400 },
  ALT: { name: 'ALT (men gan SGPT)', unit: 'U/L', low: 0, high: 40 },
  AST: { name: 'AST (men gan SGOT)', unit: 'U/L', low: 0, high: 40 },
  GGT: { name: 'GGT (men gan)', unit: 'U/L', low: 0, high: 50 },
  CREATININE: { name: 'Creatinin máu', unit: 'umol/L', low: 53, high: 106 },
  UREA: { name: 'Ure máu', unit: 'mmol/L', low: 2.5, high: 7.5 },
  GLUCOSE: { name: 'Đường huyết (Glucose)', unit: 'mmol/L', low: 3.9, high: 6.1 },
  HBA1C: { name: 'HbA1c', unit: '%', low: 4.0, high: 5.6 },
  CHOLESTEROL: { name: 'Cholesterol toàn phần', unit: 'mmol/L', low: 0, high: 5.2 },
  TRIGLYCERIDE: { name: 'Triglyceride', unit: 'mmol/L', low: 0, high: 1.7 },
  LDL: { name: 'LDL Cholesterol', unit: 'mmol/L', low: 0, high: 3.4 },
  HDL: { name: 'HDL Cholesterol', unit: 'mmol/L', low: 1.0, high: 100 },
  URIC: { name: 'Acid Uric máu', unit: 'umol/L', low: 180, high: 420 },
  URIC_ACID: { name: 'Acid Uric máu', unit: 'umol/L', low: 180, high: 420 },
  BILIRUBIN_TP: { name: 'Bilirubin toàn phần', unit: 'umol/L', low: 5, high: 21 },
  TSH: { name: 'TSH (Tuyến giáp)', unit: 'uIU/mL', low: 0.27, high: 4.2 },
  FT4: { name: 'FT4 (Tuyến giáp)', unit: 'pmol/L', low: 12, high: 22 },
};

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dynamic parser for plain text / tabular fallback without hard-coded whitelist
 */
export function parseOcrText(rawText: string): OcrResultItem[] {
  const results: OcrResultItem[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // 1. Structured pipe syntax: CODE | NAME | VALUE | UNIT | REFERENCE
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3) {
        const testCode = parts[0].toUpperCase().replace(/\s+/g, '_');
        const testName = parts[1] || KNKNOWN_HINT(testCode)?.name || testCode;
        const valStr = parts[2];
        const valNum = parseNumber(valStr);
        const value = valNum !== null ? valNum : valStr;
        const valueType = valNum !== null ? 'NUMERIC' : 'QUALITATIVE';
        const unit = parts[3] || KNKNOWN_HINT(testCode)?.unit || '';
        const refRaw = parts[4] || '';

        let refLow: number | null = null;
        let refHigh: number | null = null;
        if (refRaw) {
          const rangeMatch = refRaw.match(/(\d+(?:[.,]\d+)?)\s*[-–—~]\s*(\d+(?:[.,]\d+)?)/);
          if (rangeMatch) {
            refLow = parseNumber(rangeMatch[1]);
            refHigh = parseNumber(rangeMatch[2]);
          }
        }

        const isUncertain = line.includes('?') || line.includes('*');
        const confidence = isUncertain ? 0.6 : 0.95;

        results.push({
          testCode,
          testName,
          value,
          valueType,
          unit,
          referenceRange: {
            low: refLow,
            high: refHigh,
            text: refRaw || null,
          },
          ocrConfidence: confidence,
          isUncertain,
          flag: isUncertain ? 'UNCERTAIN' : 'NORMAL',
          note: isUncertain ? 'Chỉ số có ký hiệu cảnh báo mờ hoặc nghi ngờ' : null,
        });
        continue;
      }
    }

    // 2. Unstructured line parsing: Code, Value, Range
    const codeMatch = line.match(/\b([A-Za-z][A-Za-z0-9_\-]{1,12})\b/);
    if (!codeMatch) continue;

    const rawCode = codeMatch[1].toUpperCase();
    // Exclude common noise words
    if (['KẾT', 'QUẢ', 'XÉT', 'NGHIỆM', 'BỆNH', 'VIỆN', 'NGÀY', 'THÁNG', 'NĂM', 'NAME', 'DATE', 'PAGE', 'TRANG'].includes(rawCode)) {
      continue;
    }

    const testCode = rawCode;
    const hint = KNKNOWN_HINT(testCode);
    const testName = hint?.name || testCode;

    // Check for qualitative values first (Âm tính, Dương tính, etc.)
    const qualMatch = line.match(/(Âm\s*tính|Dương\s*tính|Negative|Positive|Không\s*tìm\s*thấy|Vàng\s*trong|Bình\s*thường)/i);
    let value: number | string = 0;
    let valueType: 'NUMERIC' | 'QUALITATIVE' = 'NUMERIC';

    if (qualMatch) {
      value = qualMatch[1].trim();
      valueType = 'QUALITATIVE';
    } else {
      const valueMatch = line.match(/(\d+(?:[.,]\d+)?)/);
      if (!valueMatch) continue;
      const num = parseNumber(valueMatch[1]);
      if (num === null) continue;
      value = num;
      valueType = 'NUMERIC';
    }

    // Extract reference range from line
    let refLow: number | null = null;
    let refHigh: number | null = null;
    let refText: string | null = null;

    const rangeMatch = line.match(/(\d+(?:[.,]\d+)?)\s*[-–—~]\s*(\d+(?:[.,]\d+)?)/g);
    if (rangeMatch && rangeMatch.length > 0) {
      // The last range match on line is typically the reference range
      const lastRange = rangeMatch[rangeMatch.length - 1];
      const bounds = lastRange.match(/(\d+(?:[.,]\d+)?)\s*[-–—~]\s*(\d+(?:[.,]\d+)?)/);
      if (bounds) {
        refLow = parseNumber(bounds[1]);
        refHigh = parseNumber(bounds[2]);
        refText = `${refLow} - ${refHigh}`;
      }
    } else if (hint && hint.low !== undefined && hint.high !== undefined) {
      // Fallback hint only if range was not found on line
      refLow = hint.low;
      refHigh = hint.high;
      refText = `${hint.low} - ${hint.high}`;
    }

    const isUncertain = line.includes('?') || line.includes('*');
    const confidence = isUncertain ? 0.6 : 0.92;

    results.push({
      testCode,
      testName,
      value,
      valueType,
      unit: hint?.unit || '',
      referenceRange: {
        low: refLow,
        high: refHigh,
        text: refText,
      },
      ocrConfidence: confidence,
      isUncertain,
      flag: isUncertain ? 'UNCERTAIN' : 'NORMAL',
      note: isUncertain ? 'Dữ liệu có dấu hiệu mờ, vui lòng kiểm tra lại' : null,
    });
  }

  return results;
}

function KNKNOWN_HINT(code: string) {
  return KNOWN_TEST_HINTS[code] || null;
}
