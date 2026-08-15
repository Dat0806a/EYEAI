import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Response } from 'express';
import { Database } from 'sqlite';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { verifiedExerciseVideos } from '../src/services/ai/exerciseCatalog';
import { verifiedFoodImages } from '../src/services/ai/foodImageCatalog';
import { analyzeConfirmedLabResults } from '../src/services/ai/labAnalysis';

interface CapturedResponse {
  statusCode: number;
  body: any;
  response: Response;
}

interface ConfirmInputResult {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceRange: { low: number | null; high: number | null; text: string | null };
}

function captureResponse(): CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: 200,
    body: undefined,
    response: undefined as unknown as Response,
  };
  captured.response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  } as Response;
  return captured;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const unverifiedMealMedia = {
  imageUrl: null,
  imageAlt: null,
  imageSourceUrl: null,
  imageLicense: null,
  imageAuthor: null,
  imageVerifiedAt: null,
};

const unverifiedYoutubeMedia = {
  youtubeUrl: null,
  youtubeVideoId: null,
  youtubeTitle: null,
  youtubeAuthor: null,
  youtubeAuthorUrl: null,
  youtubeThumbnailUrl: null,
  youtubeVerified: false,
  youtubeSource: null,
  youtubeVerifiedAt: null,
};

function mealMedia(item: Record<string, unknown>): Record<string, unknown> {
  return {
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    imageSourceUrl: item.imageSourceUrl,
    imageLicense: item.imageLicense,
    imageAuthor: item.imageAuthor,
    imageVerifiedAt: item.imageVerifiedAt,
  };
}

function youtubeMedia(item: Record<string, unknown>): Record<string, unknown> {
  return {
    youtubeUrl: item.youtubeUrl,
    youtubeVideoId: item.youtubeVideoId,
    youtubeTitle: item.youtubeTitle,
    youtubeAuthor: item.youtubeAuthor,
    youtubeAuthorUrl: item.youtubeAuthorUrl,
    youtubeThumbnailUrl: item.youtubeThumbnailUrl,
    youtubeVerified: item.youtubeVerified,
    youtubeSource: item.youtubeSource,
    youtubeVerifiedAt: item.youtubeVerifiedAt,
  };
}

function validateReportDetail(report: unknown): { valid: boolean; errors: unknown } {
  const openapi = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'contracts', 'openapi.json'), 'utf8'),
  );
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile({
    $schema: 'http://json-schema.org/draft-07/schema#',
    $ref: '#/components/schemas/ReportDetail',
    components: openapi.components,
  });
  return { valid: validate(report), errors: validate.errors };
}

describe('analysis media persistence', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const profileId = '22222222-2222-4222-8222-222222222222';
  const reportId = '33333333-3333-4333-8333-333333333333';
  let tempDir = '';
  let db: Database | null = null;
  let confirmAndAnalyze: typeof import('../src/controllers/analysisController').confirmAndAnalyze;
  let getReportDetail: typeof import('../src/controllers/analysisController').getReportDetail;
  let originalDatabasePath: string | undefined;
  let originalUploadDir: string | undefined;
  let originalGeminiKey: string | undefined;

  beforeEach(async () => {
    jest.resetModules();
    originalDatabasePath = process.env.DATABASE_PATH;
    originalUploadDir = process.env.UPLOAD_DIR;
    originalGeminiKey = process.env.GEMINI_API_KEY;
    tempDir = mkdtempSync(join(tmpdir(), 'yte-analysis-persistence-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    process.env.UPLOAD_DIR = join(tempDir, 'uploads');
    process.env.GEMINI_API_KEY = '';

    const database = await import('../src/database');
    const controller = await import('../src/controllers/analysisController');
    db = await database.getDb();
    confirmAndAnalyze = controller.confirmAndAnalyze;
    getReportDetail = controller.getReportDetail;

    await db.run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', userId, 'media@example.com', 'hash');
    await db.run(
      'INSERT INTO profiles (id, user_id, full_name, date_of_birth, gender) VALUES (?, ?, ?, ?, ?)',
      profileId,
      userId,
      'Media Test',
      '1990-01-01',
      'OTHER',
    );
    await db.run(
      'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
      reportId,
      userId,
      'test-report.jpg',
      'PROCESSED',
      'UPLOAD',
    );
  });

  afterEach(async () => {
    try {
      if (db) await db.close();
    } finally {
      db = null;
      restoreEnv('DATABASE_PATH', originalDatabasePath);
      restoreEnv('UPLOAD_DIR', originalUploadDir);
      restoreEnv('GEMINI_API_KEY', originalGeminiKey);
      jest.resetModules();
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function confirmResults(
    results: ConfirmInputResult[],
    targetReportId = reportId,
  ): Promise<CapturedResponse> {
    const response = captureResponse();
    await confirmAndAnalyze(
      {
        userId,
        body: {
          reportId: targetReportId,
          results,
        },
      } as any,
      response.response,
    );
    return response;
  }

  async function confirm(value: number, targetReportId = reportId): Promise<CapturedResponse> {
    return confirmResults([
      {
        testCode: 'RBC',
        testName: 'Số lượng hồng cầu',
        value,
        unit: '10^12/L',
        referenceRange: { low: 4, high: 5.5, text: '4 - 5.5' },
      },
    ], targetReportId);
  }

  async function detail(
    targetReportId = reportId,
    targetUserId = userId,
  ): Promise<CapturedResponse> {
    const response = captureResponse();
    await getReportDetail(
      { userId: targetUserId, params: { reportId: targetReportId } } as any,
      response.response,
    );
    return response;
  }

  async function confirmWithProviderMutation(
    mutateMealPlan: (plan: any) => any,
    mutateExercisePlan: (plan: any) => any,
  ): Promise<CapturedResponse> {
    const ai = await import('../src/services/ai');
    const trustedProvider = ai.createAIProvider();
    const provider = {
      name: 'untrusted-test-provider',
      analyzeLabResults: trustedProvider.analyzeLabResults.bind(trustedProvider),
      generateMealPlan: async (...args: any[]) => mutateMealPlan(
        await trustedProvider.generateMealPlan(args[0], args[1], args[2]),
      ),
      generateExercisePlan: async (...args: any[]) => mutateExercisePlan(
        await trustedProvider.generateExercisePlan(args[0], args[1], args[2]),
      ),
      answerChat: trustedProvider.answerChat.bind(trustedProvider),
    };
    const providerSpy = jest.spyOn(ai, 'createAIProvider').mockReturnValue(provider);
    try {
      return await confirm(4.5);
    } finally {
      providerSpy.mockRestore();
    }
  }

  it('replaces prior analysis atomically and returns the second full plan shapes from history', async () => {
    const first = await confirm(3.8);
    expect(first.statusCode).toBe(200);

    await db!.run('UPDATE profiles SET date_of_birth = ? WHERE user_id = ?', '1950-01-01', userId);
    const second = await confirm(4.5);
    expect(second.statusCode).toBe(200);
    expect(second.body.error).toBeNull();
    expect(second.body.data.mealPlan.items[0].imageUrl).not.toBe(first.body.data.mealPlan.items[0].imageUrl);
    expect(second.body.data.exercisePlan.items[1].youtubeVideoId)
      .not.toBe(first.body.data.exercisePlan.items[1].youtubeVideoId);

    expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?', reportId))!.count).toBe(1);
    expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?', reportId))!.count).toBe(1);
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM meal_plan_items WHERE meal_plan_id = (SELECT id FROM meal_plans WHERE lab_report_id = ?)',
      reportId,
    ))!.count).toBe(5);
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM exercise_items WHERE exercise_plan_id = (SELECT id FROM exercise_plans WHERE lab_report_id = ?)',
      reportId,
    ))!.count).toBe(2);

    const history = await detail();
    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.mealPlan).toEqual(second.body.data.mealPlan);
    expect(history.body.data.report.exercisePlan).toEqual(second.body.data.exercisePlan);
    expect(history.body.data.report.mealPlan).not.toHaveProperty('id');
    expect(history.body.data.report.exercisePlan).not.toHaveProperty('id');
    expect(history.body.data.report.mealPlan.reportId).toBe(reportId);
    expect(history.body.data.report.exercisePlan.reportId).toBe(reportId);
    expect(history.body.data.report.results).toEqual([
      expect.objectContaining({ test_code: 'RBC', value: 4.5, status: 'NORMAL' }),
    ]);

    expect(validateReportDetail(history.body.data.report))
      .toEqual({ valid: true, errors: null });
  });

  it('persists the exact analysis narrative and returns it after reopening the database', async () => {
    const confirmed = await confirm(3.8);
    expect(confirmed.statusCode).toBe(200);
    const expectedSummary = confirmed.body.data.analysis.overallSummary;
    const expectedExplanation = confirmed.body.data.analysis.results[0].explanation;

    expect(await db!.get(
      'SELECT analysis_summary FROM lab_reports WHERE id = ?',
      reportId,
    )).toEqual({ analysis_summary: expectedSummary });
    expect(await db!.get(
      'SELECT explanation FROM lab_results WHERE report_id = ? ORDER BY rowid',
      reportId,
    )).toEqual({ explanation: expectedExplanation });

    await db!.close();
    db = null;
    jest.resetModules();
    const reopenedDatabase = await import('../src/database');
    const reopenedController = await import('../src/controllers/analysisController');
    db = await reopenedDatabase.getDb();
    getReportDetail = reopenedController.getReportDetail;

    const history = await detail();
    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.overallSummary).toBe(expectedSummary);
    expect(history.body.data.report.results[0].explanation).toBe(expectedExplanation);
  });

  it('round-trips deterministic statuses for lower-only and upper-only reference bounds', async () => {
    const input: ConfirmInputResult[] = [
      {
        testCode: 'LOWER_ABNORMAL',
        testName: 'Lower-only abnormal',
        value: 3.9,
        unit: 'unit',
        referenceRange: { low: 4, high: null, text: '>= 4' },
      },
      {
        testCode: 'UPPER_ABNORMAL',
        testName: 'Upper-only abnormal',
        value: 10.1,
        unit: 'unit',
        referenceRange: { low: null, high: 10, text: '<= 10' },
      },
      {
        testCode: 'LOWER_BOUNDARY',
        testName: 'Lower-only exact boundary',
        value: 4,
        unit: 'unit',
        referenceRange: { low: 4, high: null, text: '>= 4' },
      },
      {
        testCode: 'UPPER_BOUNDARY',
        testName: 'Upper-only exact boundary',
        value: 10,
        unit: 'unit',
        referenceRange: { low: null, high: 10, text: '<= 10' },
      },
    ];
    const expectedStatuses = ['LOW', 'HIGH', 'NORMAL', 'NORMAL'];

    const confirmed = await confirmResults(input);
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.body.data.analysis.results.map((result: any) => result.status))
      .toEqual(expectedStatuses);
    expect((await db!.all<{ status: string }[]>(
      'SELECT status FROM lab_results WHERE report_id = ? ORDER BY rowid',
      reportId,
    )).map((result) => result.status)).toEqual(expectedStatuses);

    const history = await detail();
    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.results.map((result: any) => result.status))
      .toEqual(expectedStatuses);
    expect(history.body.data.report.results.map((result: any) => result.explanation)).toEqual(
      confirmed.body.data.analysis.results.map((result: any) => result.explanation),
    );
  });

  it('returns a neutral empty-result fallback without writing to the report', async () => {
    const history = await detail();

    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.overallSummary)
      .toBe('Chưa có kết quả xét nghiệm đã xác nhận để phân tích.');
    expect(history.body.data.report.results).toEqual([]);
    expect(await db!.get(
      'SELECT analysis_summary FROM lab_reports WHERE id = ?',
      reportId,
    )).toEqual({ analysis_summary: null });
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM lab_results WHERE report_id = ?',
      reportId,
    ))!.count).toBe(0);
  });

  it('returns deterministic legacy narrative fallbacks without mutating stored rows', async () => {
    const confirmedResults = [
      {
        testCode: 'RBC',
        testName: 'Legacy red blood cells',
        value: 3.8,
        unit: '10^12/L',
        referenceLow: 4,
        referenceHigh: 5.5,
        referenceText: '4 - 5.5',
      },
      {
        testCode: 'RBC',
        testName: 'Legacy repeated red blood cells',
        value: 4.7,
        unit: '10^12/L',
        referenceLow: 4,
        referenceHigh: 5.5,
        referenceText: '4 - 5.5',
      },
    ];
    for (const [index, result] of confirmedResults.entries()) {
      await db!.run(
        `INSERT INTO lab_results (
           id, report_id, test_code, test_name, value, unit, reference_low, reference_high,
           reference_text, status, ocr_confidence, reference_source, explanation
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `legacy-result-${index}`,
        reportId,
        result.testCode,
        result.testName,
        result.value,
        result.unit,
        result.referenceLow,
        result.referenceHigh,
        result.referenceText,
        index === 0 ? 'LOW' : 'NORMAL',
        1,
        'LAB_REPORT',
        index === 0 ? null : '   ',
      );
    }
    const expected = analyzeConfirmedLabResults(reportId, confirmedResults);

    const history = await detail();

    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.overallSummary).toBe(expected.overallSummary);
    expect(history.body.data.report.overallSummary.length).toBeGreaterThan(0);
    expect(history.body.data.report.results.map((result: any) => result.explanation)).toEqual(
      expected.results.map((result) => result.explanation),
    );
    expect(await db!.get(
      'SELECT analysis_summary FROM lab_reports WHERE id = ?',
      reportId,
    )).toEqual({ analysis_summary: null });
    expect(await db!.all(
      'SELECT explanation FROM lab_results WHERE report_id = ? ORDER BY rowid',
      reportId,
    )).toEqual([{ explanation: null }, { explanation: '   ' }]);
  });

  it('returns deterministic one-sided statuses without rewriting legacy stored status', async () => {
    const legacyResults = [
      {
        id: 'legacy-lower-only',
        testCode: 'LOWER_ONLY',
        testName: 'Legacy lower-only',
        value: 3.9,
        referenceLow: 4,
        referenceHigh: null,
        referenceText: '>= 4',
      },
      {
        id: 'legacy-upper-only',
        testCode: 'UPPER_ONLY',
        testName: 'Legacy upper-only',
        value: 10.1,
        referenceLow: null,
        referenceHigh: 10,
        referenceText: '<= 10',
      },
    ];
    await db!.run(
      'UPDATE lab_reports SET analysis_summary = ? WHERE id = ?',
      'Stored legacy one-sided summary',
      reportId,
    );
    for (const result of legacyResults) {
      await db!.run(
        `INSERT INTO lab_results (
           id, report_id, test_code, test_name, value, unit, reference_low, reference_high,
           reference_text, status, ocr_confidence, reference_source, explanation
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        result.id,
        reportId,
        result.testCode,
        result.testName,
        result.value,
        'unit',
        result.referenceLow,
        result.referenceHigh,
        result.referenceText,
        'UNKNOWN',
        1,
        'LAB_REPORT',
        `Stored explanation for ${result.testCode}`,
      );
    }

    const history = await detail();

    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.overallSummary).toBe('Stored legacy one-sided summary');
    expect(history.body.data.report.results.map((result: any) => result.status))
      .toEqual(['LOW', 'HIGH']);
    expect((await db!.all<{ status: string }[]>(
      'SELECT status FROM lab_results WHERE report_id = ? ORDER BY rowid',
      reportId,
    )).map((result) => result.status)).toEqual(['UNKNOWN', 'UNKNOWN']);
  });

  it('aligns duplicate test-code explanations by result occurrence order', async () => {
    const ai = await import('../src/services/ai');
    const trustedProvider = ai.createAIProvider();
    const providerSpy = jest.spyOn(ai, 'createAIProvider').mockReturnValue({
      name: 'duplicate-narrative-provider',
      analyzeLabResults: async (...args: any[]) => {
        const analysis = await trustedProvider.analyzeLabResults(args[0], args[1], args[2]);
        return {
          ...analysis,
          overallSummary: 'Stored duplicate occurrence summary',
          results: analysis.results.map((result, index) => ({
            ...result,
            explanation: `Stored duplicate occurrence ${index + 1}`,
          })),
        };
      },
      generateMealPlan: trustedProvider.generateMealPlan.bind(trustedProvider),
      generateExercisePlan: trustedProvider.generateExercisePlan.bind(trustedProvider),
      answerChat: trustedProvider.answerChat.bind(trustedProvider),
    });

    try {
      const confirmed = await confirmResults([
        {
          testCode: 'DUP',
          testName: 'Duplicate first',
          value: 1,
          unit: 'unit',
          referenceRange: { low: 0, high: 2, text: '0 - 2' },
        },
        {
          testCode: 'DUP',
          testName: 'Duplicate second',
          value: 3,
          unit: 'unit',
          referenceRange: { low: 0, high: 2, text: '0 - 2' },
        },
      ]);
      expect(confirmed.statusCode).toBe(200);
    } finally {
      providerSpy.mockRestore();
    }

    expect(await db!.all(
      'SELECT test_name, explanation FROM lab_results WHERE report_id = ? ORDER BY rowid',
      reportId,
    )).toEqual([
      { test_name: 'Duplicate first', explanation: 'Stored duplicate occurrence 1' },
      { test_name: 'Duplicate second', explanation: 'Stored duplicate occurrence 2' },
    ]);
    const history = await detail();
    expect(history.body.data.report.overallSummary).toBe('Stored duplicate occurrence summary');
    expect(history.body.data.report.results.map((result: any) => result.explanation)).toEqual([
      'Stored duplicate occurrence 1',
      'Stored duplicate occurrence 2',
    ]);
  });

  it('fails closed and preserves prior state when analysis result alignment is inconsistent', async () => {
    const initial = await confirm(3.8);
    expect(initial.statusCode).toBe(200);
    const beforeFailure = await detail();
    const ai = await import('../src/services/ai');
    const trustedProvider = ai.createAIProvider();
    const providerSpy = jest.spyOn(ai, 'createAIProvider').mockReturnValue({
      name: 'misaligned-narrative-provider',
      analyzeLabResults: async (...args: any[]) => {
        const analysis = await trustedProvider.analyzeLabResults(args[0], args[1], args[2]);
        return { ...analysis, results: [] };
      },
      generateMealPlan: trustedProvider.generateMealPlan.bind(trustedProvider),
      generateExercisePlan: trustedProvider.generateExercisePlan.bind(trustedProvider),
      answerChat: trustedProvider.answerChat.bind(trustedProvider),
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await confirm(4.5);
      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
    } finally {
      providerSpy.mockRestore();
      consoleError.mockRestore();
    }

    expect((await detail()).body.data.report).toEqual(beforeFailure.body.data.report);
  });

  it.each([
    {
      mismatch: 'reportId',
      mutate: (analysis: any) => ({ ...analysis, reportId: 'wrong-report-id' }),
    },
    {
      mismatch: 'status',
      mutate: (analysis: any) => ({
        ...analysis,
        results: analysis.results.map((result: any, index: number) => (
          index === 0 ? { ...result, status: 'HIGH' } : result
        )),
      }),
    },
  ])('fails closed on analysis $mismatch mismatch and preserves prior state', async ({ mutate }) => {
    const initial = await confirm(3.8);
    expect(initial.statusCode).toBe(200);
    const beforeFailure = await detail();
    const ai = await import('../src/services/ai');
    const trustedProvider = ai.createAIProvider();
    const providerSpy = jest.spyOn(ai, 'createAIProvider').mockReturnValue({
      name: 'mismatched-analysis-provider',
      analyzeLabResults: async (...args: any[]) => mutate(
        await trustedProvider.analyzeLabResults(args[0], args[1], args[2]),
      ),
      generateMealPlan: trustedProvider.generateMealPlan.bind(trustedProvider),
      generateExercisePlan: trustedProvider.generateExercisePlan.bind(trustedProvider),
      answerChat: trustedProvider.answerChat.bind(trustedProvider),
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await confirm(4.5);
      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
    } finally {
      providerSpy.mockRestore();
      consoleError.mockRestore();
    }

    expect((await detail()).body.data.report).toEqual(beforeFailure.body.data.report);
  });

  it('rolls back all changes when narrative persistence fails', async () => {
    const initial = await confirm(3.8);
    expect(initial.statusCode).toBe(200);
    const beforeFailure = await detail();
    await db!.exec(`
      CREATE TRIGGER fail_analysis_summary_write
      BEFORE UPDATE OF analysis_summary ON lab_reports
      BEGIN
        SELECT RAISE(ABORT, 'analysis narrative write failed');
      END;
    `);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await confirm(4.5);
      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
    } finally {
      consoleError.mockRestore();
      await db!.exec('DROP TRIGGER fail_analysis_summary_write');
    }

    expect((await detail()).body.data.report).toEqual(beforeFailure.body.data.report);
  });

  it('sanitizes partial, unknown, and nonbinary rolling-writer media without deleting rows', async () => {
    const confirmed = await confirm(4.5);
    expect(confirmed.statusCode).toBe(200);

    const mealPlan = await db!.get<{ id: string }>(
      'SELECT id FROM meal_plans WHERE lab_report_id = ?',
      reportId,
    );
    const exercisePlan = await db!.get<{ id: string }>(
      'SELECT id FROM exercise_plans WHERE lab_report_id = ?',
      reportId,
    );
    const mealItems = await db!.all<{ id: string; meal_type: string }[]>(
      'SELECT id, meal_type FROM meal_plan_items WHERE meal_plan_id = ? ORDER BY rowid',
      mealPlan!.id,
    );
    const exerciseItems = await db!.all<{ id: string }[]>(
      'SELECT id FROM exercise_items WHERE exercise_plan_id = ? ORDER BY rowid',
      exercisePlan!.id,
    );
    const image = verifiedFoodImages['beef-noodle-breakfast'];
    const video = verifiedExerciseVideos['walk-at-home'];

    await db!.run(
      `UPDATE meal_plan_items
       SET image_url = ?, image_alt = ?, image_source_url = ?, image_license = ?,
           image_author = NULL, image_verified_at = ?
       WHERE id = ?`,
      image.imageUrl,
      image.alt,
      image.sourceUrl,
      image.license,
      image.verifiedAt,
      mealItems[0].id,
    );
    await db!.run(
      `UPDATE meal_plan_items
       SET image_url = ?, image_alt = ?, image_source_url = ?, image_license = ?,
           image_author = ?, image_verified_at = ?
       WHERE id = ?`,
      'https://example.com/unknown-food.jpg',
      'Unknown food',
      'https://example.com/unknown-food-source',
      'CC0',
      'Unknown author',
      '2026-08-09',
      mealItems[1].id,
    );
    await db!.run(
      `UPDATE exercise_items
       SET youtube_url = ?, youtube_video_id = ?, youtube_title = ?, youtube_author = ?,
           youtube_author_url = ?, youtube_thumbnail_url = NULL, youtube_verified = 1,
           youtube_source = ?, youtube_verified_at = ?
       WHERE id = ?`,
      video.youtubeUrl,
      video.videoId,
      video.title,
      video.authorName,
      video.authorUrl,
      'YouTube oEmbed',
      video.verifiedAt,
      exerciseItems[0].id,
    );
    await db!.run(
      `UPDATE exercise_items
       SET youtube_url = ?, youtube_video_id = ?, youtube_title = ?, youtube_author = ?,
           youtube_author_url = ?, youtube_thumbnail_url = ?, youtube_verified = 1,
           youtube_source = ?, youtube_verified_at = ?
       WHERE id = ?`,
      'https://www.youtube.com/watch?v=unknown123',
      'unknown123',
      'Unknown workout',
      'Unknown author',
      'https://www.youtube.com/@unknown',
      'https://i.ytimg.com/vi/unknown123/hqdefault.jpg',
      'YouTube oEmbed',
      '2026-08-09',
      exerciseItems[1].id,
    );
    await db!.run(
      `INSERT INTO exercise_items (
         id, exercise_plan_id, name, description, duration, difficulty, rationale,
         youtube_url, youtube_video_id, youtube_title, youtube_author, youtube_author_url,
         youtube_thumbnail_url, youtube_verified, youtube_source, youtube_verified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'exercise-nonbinary-verified',
      exercisePlan!.id,
      'Nonbinary verified flag',
      'Base exercise content remains valid.',
      10,
      'EASY',
      'Used to verify history sanitization.',
      video.youtubeUrl,
      video.videoId,
      video.title,
      video.authorName,
      video.authorUrl,
      video.thumbnailUrl,
      2,
      'YouTube oEmbed',
      video.verifiedAt,
    );

    const history = await detail();
    expect(history.statusCode).toBe(200);
    const returnedMeals = history.body.data.report.mealPlan.items as Array<Record<string, unknown>>;
    const returnedExercises = history.body.data.report.exercisePlan.items as Array<Record<string, unknown>>;
    expect(mealMedia(returnedMeals.find((item) => item.mealType === mealItems[0].meal_type)!))
      .toEqual(unverifiedMealMedia);
    expect(mealMedia(returnedMeals.find((item) => item.mealType === mealItems[1].meal_type)!))
      .toEqual(unverifiedMealMedia);
    expect(returnedExercises.map(youtubeMedia)).toEqual([
      unverifiedYoutubeMedia,
      unverifiedYoutubeMedia,
      unverifiedYoutubeMedia,
    ]);
    expect(validateReportDetail(history.body.data.report)).toEqual({ valid: true, errors: null });

    const rawMeals = await db!.all<Array<Record<string, unknown>>>(
      'SELECT image_url AS imageUrl, image_author AS imageAuthor FROM meal_plan_items WHERE id IN (?, ?) ORDER BY rowid',
      mealItems[0].id,
      mealItems[1].id,
    );
    const rawExercises = await db!.all<Array<Record<string, unknown>>>(
      'SELECT youtube_verified AS youtubeVerified FROM exercise_items WHERE exercise_plan_id = ? ORDER BY rowid',
      exercisePlan!.id,
    );
    expect(rawMeals).toEqual([
      { imageUrl: image.imageUrl, imageAuthor: null },
      { imageUrl: 'https://example.com/unknown-food.jpg', imageAuthor: 'Unknown author' },
    ]);
    expect(rawExercises.map((item) => item.youtubeVerified)).toEqual([1, 1, 2]);
  });

  it('does not return otherwise valid plans owned by another user', async () => {
    const confirmed = await confirm(4.5);
    expect(confirmed.statusCode).toBe(200);
    const otherUserId = '99999999-9999-4999-8999-999999999999';
    await db!.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      otherUserId,
      'other-owner@example.com',
      'hash',
    );
    await db!.run('UPDATE meal_plans SET user_id = ? WHERE lab_report_id = ?', otherUserId, reportId);
    await db!.run('UPDATE exercise_plans SET user_id = ? WHERE lab_report_id = ?', otherUserId, reportId);

    const history = await detail();

    expect(history.statusCode).toBe(200);
    expect(history.body.data.report.mealPlan).toBeNull();
    expect(history.body.data.report.exercisePlan).toBeNull();
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?',
      reportId,
    ))!.count).toBe(1);
    expect((await db!.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?',
      reportId,
    ))!.count).toBe(1);
  });

  it('rejects a provider meal plan with partial curated image provenance before persistence', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failed = await confirmWithProviderMutation(
        (plan) => ({
          ...plan,
          items: plan.items.map((item: any, index: number) => (
            index === 0 ? { ...item, imageAlt: null } : item
          )),
        }),
        (plan) => plan,
      );

      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM lab_results'))!.count).toBe(0);
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM meal_plans'))!.count).toBe(0);
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM exercise_plans'))!.count).toBe(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects a provider exercise plan with a complete unknown YouTube tuple before persistence', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failed = await confirmWithProviderMutation(
        (plan) => plan,
        (plan) => ({
          ...plan,
          items: plan.items.map((item: any, index: number) => index === 0 ? {
            ...item,
            youtubeUrl: 'https://www.youtube.com/watch?v=unknown123',
            youtubeVideoId: 'unknown123',
            youtubeTitle: 'Unknown workout',
            youtubeAuthor: 'Unknown author',
            youtubeAuthorUrl: 'https://www.youtube.com/@unknown',
            youtubeThumbnailUrl: 'https://i.ytimg.com/vi/unknown123/hqdefault.jpg',
            youtubeVerified: true,
            youtubeSource: 'YouTube oEmbed',
            youtubeVerifiedAt: '2026-08-09',
          } : item),
        }),
      );

      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM lab_results'))!.count).toBe(0);
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM meal_plans'))!.count).toBe(0);
      expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM exercise_plans'))!.count).toBe(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rolls back every persisted change when a later plan-item write fails', async () => {
    const first = await confirm(3.8);
    expect(first.statusCode).toBe(200);
    const beforeFailure = await detail();
    await db!.exec(`
      CREATE TRIGGER fail_exercise_item_write
      BEFORE INSERT ON exercise_items
      BEGIN
        SELECT RAISE(ABORT, 'exercise write failed');
      END;
    `);
    await db!.run('UPDATE profiles SET date_of_birth = ? WHERE user_id = ?', '1950-01-01', userId);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await confirm(4.5);
      expect(failed.statusCode).toBe(500);
      expect(failed.body.error.code).toBe('ANALYSIS_FAILED');
    } finally {
      consoleError.mockRestore();
      await db!.exec('DROP TRIGGER fail_exercise_item_write');
    }

    const afterFailure = await detail();
    expect(afterFailure.body.data.report).toEqual(beforeFailure.body.data.report);
    expect(afterFailure.body.data.report.results[0].value).toBe(3.8);
    expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?', reportId))!.count).toBe(1);
    expect((await db!.get<{ count: number }>('SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?', reportId))!.count).toBe(1);
  });

  it('isolates a rolled-back analysis transaction from unrelated singleton reads and writes', async () => {
    await db!.exec(`
      CREATE TRIGGER fail_mixed_connection_exercise_write
      BEFORE INSERT ON exercise_items
      BEGIN
        SELECT RAISE(ABORT, 'mixed connection rollback');
      END;
    `);

    let signalTransactionInsert!: () => void;
    const transactionInserted = new Promise<void>((resolve) => {
      signalTransactionInsert = resolve;
    });
    let releaseTransaction!: () => void;
    const transactionRelease = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    let transactionConnection: Database | null = null;
    let paused = false;
    const databasePrototype = Object.getPrototypeOf(db!) as {
      run: (...args: any[]) => Promise<unknown>;
      close: (...args: any[]) => Promise<void>;
    };
    const originalRun = databasePrototype.run;
    const originalClose = databasePrototype.close;
    const closedConnections = new Set<Database>();
    const runSpy = jest.spyOn(databasePrototype, 'run').mockImplementation(async function (
      this: Database,
      ...args: any[]
    ) {
      const result = await originalRun.apply(this, args);
      const [sql, ...params] = args;
      if (
        !paused
        && typeof sql === 'string'
        && sql.startsWith('INSERT INTO lab_results')
        && params[1] === reportId
      ) {
        paused = true;
        transactionConnection = this;
        signalTransactionInsert();
        await transactionRelease;
      }
      return result;
    });
    const closeSpy = jest.spyOn(databasePrototype, 'close').mockImplementation(async function (
      this: Database,
      ...args: any[]
    ) {
      await originalClose.apply(this, args);
      closedConnections.add(this);
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const unrelatedSessionId = '55555555-5555-4555-8555-555555555555';

    try {
      const confirmation = confirm(4.5);
      await transactionInserted;

      const outsideRead = await db!.get(
        'SELECT id FROM lab_results WHERE report_id = ?',
        reportId,
      );
      const unrelatedInsert = db!.run(
        'INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)',
        unrelatedSessionId,
        userId,
      );

      releaseTransaction();
      const failed = await confirmation;
      await unrelatedInsert;
      const rolledBackResult = await db!.get(
        'SELECT id FROM lab_results WHERE report_id = ?',
        reportId,
      );
      const persistedSession = await db!.get(
        'SELECT id FROM chat_sessions WHERE id = ?',
        unrelatedSessionId,
      );

      expect(failed.statusCode).toBe(500);
      expect({
        transactionUsesDedicatedConnection: transactionConnection !== db,
        outsideReadSawUncommittedResult: Boolean(outsideRead),
        unrelatedInsertPersisted: Boolean(persistedSession),
        transactionResultRolledBack: rolledBackResult === undefined,
        transactionConnectionClosed: transactionConnection !== null
          && closedConnections.has(transactionConnection),
      }).toEqual({
        transactionUsesDedicatedConnection: true,
        outsideReadSawUncommittedResult: false,
        unrelatedInsertPersisted: true,
        transactionResultRolledBack: true,
        transactionConnectionClosed: true,
      });
    } finally {
      releaseTransaction();
      runSpy.mockRestore();
      closeSpy.mockRestore();
      consoleError.mockRestore();
      await db!.exec('DROP TRIGGER IF EXISTS fail_mixed_connection_exercise_write');
    }
  });

  it('returns one report-detail snapshot while a newer confirmation commits concurrently', async () => {
    const responseA = await confirm(3.8);
    expect(responseA.statusCode).toBe(200);
    const expectedA = (await detail()).body.data.report;

    let signalReportSelected!: () => void;
    const reportSelected = new Promise<void>((resolve) => {
      signalReportSelected = resolve;
    });
    let releaseReader!: () => void;
    const readerRelease = new Promise<void>((resolve) => {
      releaseReader = resolve;
    });
    const databasePrototype = Object.getPrototypeOf(db!) as {
      get: (...args: any[]) => Promise<unknown>;
    };
    const originalGet = databasePrototype.get;
    let readerConnection: Database | null = null;
    let paused = false;
    const getSpy = jest.spyOn(databasePrototype, 'get').mockImplementation(async function (
      this: Database,
      ...args: any[]
    ) {
      const result = await originalGet.apply(this, args);
      const [sql, ...params] = args;
      if (
        !paused
        && typeof sql === 'string'
        && sql.includes('SELECT id, user_id, analysis_summary FROM lab_reports')
        && params[0] === reportId
      ) {
        paused = true;
        readerConnection = this;
        signalReportSelected();
        await readerRelease;
      }
      return result;
    });
    let snapshotRequest: Promise<CapturedResponse> | null = null;

    try {
      snapshotRequest = detail();
      await reportSelected;
      await db!.run(
        'UPDATE profiles SET date_of_birth = ? WHERE user_id = ?',
        '1950-01-01',
        userId,
      );
      const responseB = await confirm(4.5);
      expect(responseB.statusCode).toBe(200);

      releaseReader();
      const snapshotResponse = await snapshotRequest;
      expect(snapshotResponse.statusCode).toBe(200);
      expect(readerConnection).not.toBeNull();
      expect(snapshotResponse.body.data.report).toEqual(expectedA);

      const freshResponse = await detail();
      expect(freshResponse.statusCode).toBe(200);
      expect(freshResponse.body.data.report.overallSummary)
        .toBe(responseB.body.data.analysis.overallSummary);
      expect(freshResponse.body.data.report.results).toEqual([
        expect.objectContaining({
          value: responseB.body.data.analysis.results[0].value,
          status: responseB.body.data.analysis.results[0].status,
          explanation: responseB.body.data.analysis.results[0].explanation,
        }),
      ]);
      expect(freshResponse.body.data.report.mealPlan).toEqual(responseB.body.data.mealPlan);
      expect(freshResponse.body.data.report.exercisePlan).toEqual(responseB.body.data.exercisePlan);
    } finally {
      releaseReader();
      getSpy.mockRestore();
      if (snapshotRequest) await snapshotRequest.catch(() => undefined);
    }
  });

  it.each([
    {
      caseName: 'missing report',
      targetReportId: '99999999-9999-4999-8999-999999999998',
      targetUserId: userId,
    },
    {
      caseName: 'unauthorized report',
      targetReportId: reportId,
      targetUserId: '99999999-9999-4999-8999-999999999999',
    },
  ])('closes the dedicated detail connection for a $caseName response', async ({
    targetReportId,
    targetUserId,
  }) => {
    const databasePrototype = Object.getPrototypeOf(db!) as {
      close: (...args: any[]) => Promise<void>;
    };
    const originalClose = databasePrototype.close;
    const closedConnections = new Set<Database>();
    const closeSpy = jest.spyOn(databasePrototype, 'close').mockImplementation(async function (
      this: Database,
      ...args: any[]
    ) {
      await originalClose.apply(this, args);
      closedConnections.add(this);
    });

    try {
      const response = await detail(targetReportId, targetUserId);
      expect(response.statusCode).toBe(404);
      expect([...closedConnections].filter((connection) => connection !== db)).toHaveLength(1);
    } finally {
      closeSpy.mockRestore();
    }
  });

  it.each([
    {
      caseName: 'successful response',
      targetReportId: reportId,
      expectedStatus: 200,
      expectedSuccess: true,
      expectedErrorCode: null,
    },
    {
      caseName: 'missing-report response',
      targetReportId: '99999999-9999-4999-8999-999999999997',
      expectedStatus: 404,
      expectedSuccess: false,
      expectedErrorCode: 'NOT_FOUND',
    },
  ])('preserves a $caseName when dedicated close rejects after closing', async ({
    targetReportId,
    expectedStatus,
    expectedSuccess,
    expectedErrorCode,
  }) => {
    if (expectedStatus === 200) {
      const confirmed = await confirm(4.5);
      expect(confirmed.statusCode).toBe(200);
    }
    const databasePrototype = Object.getPrototypeOf(db!) as {
      close: (...args: any[]) => Promise<void>;
    };
    const originalClose = databasePrototype.close;
    let injectedCloseFailure = false;
    const closeSpy = jest.spyOn(databasePrototype, 'close').mockImplementation(async function (
      this: Database,
      ...args: any[]
    ) {
      await originalClose.apply(this, args);
      if (this !== db && !injectedCloseFailure) {
        injectedCloseFailure = true;
        throw new Error('injected report detail close failure');
      }
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const responsePromise = detail(targetReportId);
      await expect(responsePromise).resolves.toEqual(
        expect.objectContaining({ statusCode: expectedStatus }),
      );
      const response = await responsePromise;
      expect(response.body.success).toBe(expectedSuccess);
      expect(response.body.error?.code ?? null).toBe(expectedErrorCode);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to close report detail database connection.',
        expect.objectContaining({ message: 'injected report detail close failure' }),
      );
    } finally {
      closeSpy.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('keeps the complete later-committing bundle for concurrent confirmations of the same report', async () => {
    const ai = await import('../src/services/ai');
    const trustedProvider = ai.createAIProvider();
    let signalAReady!: () => void;
    const aReady = new Promise<void>((resolve) => {
      signalAReady = resolve;
    });
    let releaseA!: () => void;
    const aRelease = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const decorateProvider = (label: 'A' | 'B', gateBeforeCommit: boolean) => ({
      name: `same-report-provider-${label}`,
      analyzeLabResults: async (...args: any[]) => {
        const analysis = await trustedProvider.analyzeLabResults(args[0], args[1], args[2]);
        return {
          ...analysis,
          overallSummary: `Concurrent summary ${label}`,
          results: analysis.results.map((result, index) => ({
            ...result,
            explanation: `Concurrent explanation ${label}-${index}`,
          })),
        };
      },
      generateMealPlan: async (...args: any[]) => {
        const plan = await trustedProvider.generateMealPlan(args[0], args[1], args[2]);
        return {
          ...plan,
          title: `Concurrent meal ${label}`,
          description: `Concurrent meal description ${label}`,
          items: plan.items.map((item, index) => ({
            ...item,
            rationale: `Concurrent meal rationale ${label}-${index}`,
          })),
        };
      },
      generateExercisePlan: async (...args: any[]) => {
        const plan = await trustedProvider.generateExercisePlan(args[0], args[1], args[2]);
        if (gateBeforeCommit) {
          signalAReady();
          await aRelease;
        }
        return {
          ...plan,
          title: `Concurrent exercise ${label}`,
          items: plan.items.map((item, index) => ({
            ...item,
            rationale: `Concurrent exercise rationale ${label}-${index}`,
          })),
        };
      },
      answerChat: trustedProvider.answerChat.bind(trustedProvider),
    });
    const providerSpy = jest.spyOn(ai, 'createAIProvider')
      .mockReturnValueOnce(decorateProvider('A', true))
      .mockReturnValueOnce(decorateProvider('B', false));
    let confirmationA: Promise<CapturedResponse> | null = null;

    try {
      confirmationA = confirm(3.8);
      await aReady;
      const responseB = await confirm(4.5);
      expect(responseB.statusCode).toBe(200);

      releaseA();
      const responseA = await confirmationA;
      expect(responseA.statusCode).toBe(200);

      const history = await detail();
      expect(history.statusCode).toBe(200);
      expect(history.body.data.report.overallSummary)
        .toBe(responseA.body.data.analysis.overallSummary);
      expect(history.body.data.report.results).toEqual([
        expect.objectContaining({
          value: responseA.body.data.analysis.results[0].value,
          status: responseA.body.data.analysis.results[0].status,
          explanation: responseA.body.data.analysis.results[0].explanation,
        }),
      ]);
      expect(history.body.data.report.mealPlan).toEqual(responseA.body.data.mealPlan);
      expect(history.body.data.report.exercisePlan).toEqual(responseA.body.data.exercisePlan);
      expect(history.body.data.report.overallSummary)
        .not.toBe(responseB.body.data.analysis.overallSummary);
      expect((await db!.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?',
        reportId,
      ))!.count).toBe(1);
      expect((await db!.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?',
        reportId,
      ))!.count).toBe(1);
    } finally {
      releaseA();
      providerSpy.mockRestore();
      if (confirmationA) await confirmationA.catch(() => undefined);
    }
  });

  it('serializes concurrent confirmations across dedicated database connections', async () => {
    const concurrentReportIds = Array.from(
      { length: 5 },
      (_, index) => `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    );
    for (const [index, concurrentReportId] of concurrentReportIds.entries()) {
      await db!.run(
        'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
        concurrentReportId,
        userId,
        `concurrent-${index}.jpg`,
        'PROCESSED',
        'UPLOAD',
      );
    }

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let responses: CapturedResponse[];
    try {
      responses = await Promise.all(
        concurrentReportIds.map((concurrentReportId, index) =>
          confirm(4.1 + index * 0.1, concurrentReportId),
        ),
      );
    } finally {
      consoleError.mockRestore();
    }

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200]);
    for (const concurrentReportId of concurrentReportIds) {
      expect((await db!.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM meal_plans WHERE lab_report_id = ?',
        concurrentReportId,
      ))!.count).toBe(1);
      expect((await db!.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM exercise_plans WHERE lab_report_id = ?',
        concurrentReportId,
      ))!.count).toBe(1);
    }
  });
});
