import { normalizeOcrLines } from '../src/services/ocr/normalizer';

describe('normalizeOcrLines', () => {
  it('extracts structured lab results from typical report lines', () => {
    const raw = [
      'WBC | Số lượng bạch cầu | 7.2 | 10^9/L | 4.0 - 10.0',
      'RBC | Số lượng hồng cầu | 3.8 | 10^12/L | 4.0 - 5.5',
      'GLUCOSE | Đường huyết | 6.8 | mmol/L | 3.9 - 6.1',
    ].join('\n');
    const results = normalizeOcrLines(raw);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ testCode: 'WBC', value: 7.2, unit: '10^9/L' });
    expect(results[0].referenceRange).toEqual({ low: 4, high: 10, text: '4 - 10' });
    expect(results[1]).toMatchObject({ testCode: 'RBC', value: 3.8 });
    expect(results[2]).toMatchObject({ testCode: 'GLUCOSE', value: 6.8, ocrConfidence: 0.92 });
  });

  it('marks ambiguous values with lower confidence', () => {
    const results = normalizeOcrLines('PLT ? | Tiểu cầu | 300? | 10^9/L | 150 - 400');
    expect(results).toHaveLength(1);
    expect(results[0].ocrConfidence).toBeLessThan(0.6);
  });

  it('returns empty array when no known tests are found', () => {
    expect(normalizeOcrLines('No useful content here')).toEqual([]);
  });

  it('handles decimal comma values', () => {
    const results = normalizeOcrLines('WBC | Bạch cầu | 7,2 | 10^9/L | 4.0 - 10.0');
    expect(results[0].value).toBe(7.2);
  });
});
