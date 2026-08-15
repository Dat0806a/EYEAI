import { RuleBasedAIProvider } from '../src/services/ai/ruleBasedProvider';
import { analyzeConfirmedLabResults } from '../src/services/ai/labAnalysis';
import { ConfirmedLabResult } from '../src/services/ai/types';
import {
  goldenConfirmedLabResults,
  goldenLabAnalysis,
  goldenLabReportId,
} from './fixtures/labAnalysisGolden';

const provider = new RuleBasedAIProvider();

const normal: ConfirmedLabResult = {
  testCode: 'WBC',
  testName: 'Số lượng bạch cầu',
  value: 7.2,
  unit: '10^9/L',
  referenceLow: 4,
  referenceHigh: 10,
  referenceText: '4 - 10',
};

const low: ConfirmedLabResult = {
  ...normal,
  testCode: 'RBC',
  testName: 'Số lượng hồng cầu',
  value: 3.8,
  unit: '10^12/L',
  referenceLow: 4,
  referenceHigh: 5.5,
  referenceText: '4 - 5.5',
};

describe('RuleBasedAIProvider', () => {
  it('returns the exact golden LabAnalysis for mixed confirmed results', async () => {
    expect(analyzeConfirmedLabResults(goldenLabReportId, goldenConfirmedLabResults)).toEqual(
      goldenLabAnalysis,
    );
    await expect(
      provider.analyzeLabResults(goldenLabReportId, goldenConfirmedLabResults, 30),
    ).resolves.toEqual(goldenLabAnalysis);
  });

  it('classifies values inside the reference range as NORMAL', async () => {
    const analysis = await provider.analyzeLabResults('report-1', [normal], 30);
    expect(analysis.results[0].status).toBe('NORMAL');
    expect(analysis.overallSummary).toContain('nằm trong khoảng tham chiếu');
  });

  it('classifies values below the range as LOW and explains in Vietnamese', async () => {
    const analysis = await provider.analyzeLabResults('report-1', [low], 30);
    expect(analysis.results[0].status).toBe('LOW');
    expect(analysis.results[0].explanation).toContain('thấp hơn khoảng tham chiếu');
    expect(analysis.overallSummary).toContain('ngoài khoảng tham chiếu');
  });

  it('preserves duplicate testCode occurrences and classifies one-sided bounds', async () => {
    const results: ConfirmedLabResult[] = [
      {
        ...normal,
        testCode: 'DUPLICATE',
        testName: 'Lower-bound occurrence',
        value: 3.9,
        referenceLow: 4,
        referenceHigh: null,
        referenceText: '>= 4',
      },
      {
        ...normal,
        testCode: 'DUPLICATE',
        testName: 'Upper-bound occurrence',
        value: 10.1,
        referenceLow: null,
        referenceHigh: 10,
        referenceText: '<= 10',
      },
      {
        ...normal,
        testCode: 'LOWER_ONLY_NORMAL',
        value: 4,
        referenceLow: 4,
        referenceHigh: null,
        referenceText: '>= 4',
      },
      {
        ...normal,
        testCode: 'UPPER_ONLY_NORMAL',
        value: 10,
        referenceLow: null,
        referenceHigh: 10,
        referenceText: '<= 10',
      },
    ];

    const analysis = await provider.analyzeLabResults('report-duplicates', results, 30);

    expect(analysis.results.map(({ testCode, status }) => ({ testCode, status }))).toEqual([
      { testCode: 'DUPLICATE', status: 'LOW' },
      { testCode: 'DUPLICATE', status: 'HIGH' },
      { testCode: 'LOWER_ONLY_NORMAL', status: 'NORMAL' },
      { testCode: 'UPPER_ONLY_NORMAL', status: 'NORMAL' },
    ]);
  });

  it('returns a neutral informational summary when no confirmed results exist', () => {
    expect(analyzeConfirmedLabResults('report-empty', [])).toEqual({
      reportId: 'report-empty',
      overallSummary: 'Chưa có kết quả xét nghiệm đã xác nhận để phân tích.',
      results: [],
    });
  });

  it('describes all UNKNOWN results without calling them normal or outside range', () => {
    const unknownResults: ConfirmedLabResult[] = [
      {
        ...normal,
        testCode: 'UNKNOWN_1',
        testName: 'Unknown one',
        referenceLow: null,
        referenceHigh: null,
        referenceText: null,
      },
      {
        ...normal,
        testCode: 'UNKNOWN_2',
        testName: 'Unknown two',
        referenceLow: null,
        referenceHigh: null,
        referenceText: null,
      },
    ];

    const analysis = analyzeConfirmedLabResults('report-all-unknown', unknownResults);

    expect(analysis.overallSummary).toBe(
      'Có 2 chỉ số chưa đủ thông tin khoảng tham chiếu để phân loại: Unknown one (UNKNOWN_1), Unknown two (UNKNOWN_2). Đây chỉ là thông tin tham khảo, bạn nên trao đổi với bác sĩ khi có điều kiện.',
    );
    expect(analysis.overallSummary).not.toContain('nằm ngoài');
    expect(analysis.overallSummary).not.toContain('bình thường');
  });

  it('separates LOW/HIGH and UNKNOWN results into distinct summary groups', () => {
    const high: ConfirmedLabResult = {
      ...normal,
      testCode: 'HIGH_RESULT',
      testName: 'High result',
      value: 10.1,
    };
    const unknown: ConfirmedLabResult = {
      ...normal,
      testCode: 'UNKNOWN_RESULT',
      testName: 'Unknown result',
      referenceLow: null,
      referenceHigh: null,
      referenceText: null,
    };

    const analysis = analyzeConfirmedLabResults('report-mixed-summary', [low, high, unknown]);

    expect(analysis.overallSummary).toBe(
      'Có 2 chỉ số nằm ngoài khoảng tham chiếu cần lưu ý: Số lượng hồng cầu (RBC), High result (HIGH_RESULT). Có 1 chỉ số chưa đủ thông tin khoảng tham chiếu để phân loại: Unknown result (UNKNOWN_RESULT). Đây chỉ là thông tin tham khảo, bạn nên trao đổi với bác sĩ khi có điều kiện.',
    );
  });

  it('generates a meal plan with required meal types', async () => {
    const plan = await provider.generateMealPlan('report-1', [low], 30);
    const types = plan.items.map((i) => i.mealType);
    expect(types).toEqual(expect.arrayContaining(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK']));
    expect(plan.items.every((i) => i.rationale.length > 0)).toBe(true);
    expect(plan.description).toContain('không phải phác đồ điều trị');
  });

  it('generates exercises appropriate for senior users', async () => {
    const plan = await provider.generateExercisePlan('report-1', [normal], 65);
    expect(plan.items.length).toBeGreaterThanOrEqual(2);
    expect(plan.items[0].difficulty).toBe('EASY');
  });

  it('never mentions diagnosis or medication in chat replies', async () => {
    const reply = await provider.answerChat('Tôi có bệnh gì không?', {});
    expect(reply).toContain('không thay thế chẩn đoán');
    expect(reply.toLowerCase()).not.toContain('kê thuốc');
  });
});
