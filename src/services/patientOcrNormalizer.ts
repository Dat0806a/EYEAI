import { OcrResultItem } from '../types/patient';

const COMMON_TESTS: Record<string, { name: string; unit: string; low: number | null; high: number | null }> = {
  WBC: { name: 'Số lượng bạch cầu', unit: '10^9/L', low: 4.0, high: 10.0 },
  RBC: { name: 'Số lượng hồng cầu', unit: '10^12/L', low: 4.0, high: 5.5 },
  HGB: { name: 'Hemoglobin', unit: 'g/L', low: 120, high: 160 },
  HCT: { name: 'Hematocrit', unit: '%', low: 36, high: 48 },
  PLT: { name: 'Số lượng tiểu cầu', unit: '10^9/L', low: 150, high: 400 },
  ALT: { name: 'ALT (men gan)', unit: 'U/L', low: 0, high: 40 },
  AST: { name: 'AST (men gan)', unit: 'U/L', low: 0, high: 40 },
  CREATININE: { name: 'Creatinin', unit: 'umol/L', low: 53, high: 106 },
  GLUCOSE: { name: 'Đường huyết (Glucose)', unit: 'mmol/L', low: 3.9, high: 6.1 },
  CHOLESTEROL: { name: 'Cholesterol toàn phần', unit: 'mmol/L', low: 0, high: 5.2 },
  TRIGLYCERIDE: { name: 'Triglyceride', unit: 'mmol/L', low: 0, high: 1.7 },
  LDL: { name: 'LDL Cholesterol', unit: 'mmol/L', low: 0, high: 3.4 },
  HDL: { name: 'HDL Cholesterol', unit: 'mmol/L', low: 1.0, high: 100 },
};

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseOcrText(rawText: string): OcrResultItem[] {
  const results: OcrResultItem[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const codeMatch = line.match(/\b([A-Z][A-Z0-9]{1,6})\b/);
    if (!codeMatch) continue;
    const testCode = codeMatch[1].toUpperCase();
    const known = COMMON_TESTS[testCode];
    if (!known) continue;
    const valueMatch = line.match(/(\d+(?:[.,]\d+)?)/);
    if (!valueMatch) continue;
    const value = parseNumber(valueMatch[1]);
    if (value === null) continue;
    const confidence = line.includes('?') || line.includes('*') ? 0.6 : 0.95;
    const referenceRange =
      known.low !== null && known.high !== null
        ? {
            low: known.low,
            high: known.high,
            text: `${known.low} - ${known.high}`,
          }
        : { low: null, high: null, text: null };
    results.push({
      testCode,
      testName: known.name,
      value,
      unit: known.unit,
      referenceRange,
      ocrConfidence: confidence,
    });
  }
  return results;
}
