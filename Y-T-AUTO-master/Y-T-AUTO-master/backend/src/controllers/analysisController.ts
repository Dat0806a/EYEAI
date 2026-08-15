import { Request, Response } from 'express';
import {
  getDb,
  openConfiguredDatabase,
  withReadTransaction,
  withTransaction,
} from '../database';
import { createAIProvider } from '../services/ai';
import { ConfirmedLabResult, LabAnalysis } from '../services/ai/types';
import { AuthedRequest } from '../middleware/auth';
import { getProfile } from '../repositories/authRepository';
import { calculateAge, uuid } from '../utils/age';
import { analyzeConfirmedLabResults } from '../services/ai/labAnalysis';
import {
  assertTrustedPlanMedia,
  sanitizeExerciseYoutubeMedia,
  sanitizeMealImageMedia,
} from '../services/ai/verifiedMediaTrust';

interface ConfirmBody {
  reportId: string;
  results: Array<{
    testCode: string;
    testName: string;
    value: number;
    unit: string;
    referenceRange?: { low?: number | null; high?: number | null; text?: string | null };
  }>;
}

interface PersistedLabResultRow {
  test_code: string;
  test_name: string;
  value: number;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  status: string;
  ocr_confidence: number;
  explanation: string | null;
}

function hasNarrative(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertAnalysisAlignment(
  expectedReportId: string,
  confirmed: ConfirmedLabResult[],
  analysis: LabAnalysis,
): LabAnalysis {
  const expected = analyzeConfirmedLabResults(expectedReportId, confirmed);
  if (
    analysis.reportId !== expectedReportId
    || !hasNarrative(analysis.overallSummary)
    || analysis.results.length !== confirmed.length
  ) {
    throw new Error('Analysis narrative does not align with confirmed lab results.');
  }

  for (const [index, result] of analysis.results.entries()) {
    const source = confirmed[index];
    const expectedResult = expected.results[index];
    if (
      !source
      || !expectedResult
      || result.testCode !== source.testCode
      || result.testName !== source.testName
      || result.value !== source.value
      || result.unit !== source.unit
      || result.referenceLow !== source.referenceLow
      || result.referenceHigh !== source.referenceHigh
      || result.referenceText !== source.referenceText
      || result.status !== expectedResult.status
      || !hasNarrative(result.explanation)
    ) {
      throw new Error('Analysis narrative does not align with confirmed lab results.');
    }
  }

  return expected;
}

export async function confirmAndAnalyze(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const { reportId, results } = req.body as ConfirmBody;
    const userId = req.userId as string;
    const readDb = await getDb();

    const report = await readDb.get<{ id: string; user_id: string }>('SELECT id, user_id FROM lab_reports WHERE id = ?', reportId);
    if (!report || report.user_id !== userId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu xét nghiệm.' },
      });
      return;
    }

    const confirmed: ConfirmedLabResult[] = results.map((r) => ({
      testCode: r.testCode,
      testName: r.testName,
      value: r.value,
      unit: r.unit,
      referenceLow: r.referenceRange?.low ?? null,
      referenceHigh: r.referenceRange?.high ?? null,
      referenceText: r.referenceRange?.text ?? null,
    }));

    const profile = await getProfile(userId);
    const age = profile ? calculateAge(profile.date_of_birth) : 30;
    const provider = createAIProvider();

    const bundle = await (async () => {
      const analysis = await provider.analyzeLabResults(reportId, confirmed, age);
      const mealPlan = await provider.generateMealPlan(reportId, confirmed, age);
      const exercisePlan = await provider.generateExercisePlan(reportId, confirmed, age);
      return { analysis, mealPlan, exercisePlan };
    })();
    assertTrustedPlanMedia(bundle.mealPlan, bundle.exercisePlan);

    const transactionDb = await openConfiguredDatabase();
    try {
      await withTransaction(transactionDb, async () => {
        await transactionDb.run(
          'DELETE FROM lab_results WHERE report_id = ?',
          reportId,
        );
        const deterministicAnalysis = assertAnalysisAlignment(reportId, confirmed, bundle.analysis);
        await transactionDb.run(
          'UPDATE lab_reports SET analysis_summary = ? WHERE id = ?',
          bundle.analysis.overallSummary,
          reportId,
        );
        for (const [index, r] of confirmed.entries()) {
          await transactionDb.run(
            'INSERT INTO lab_results (id, report_id, test_code, test_name, value, unit, reference_low, reference_high, reference_text, status, ocr_confidence, reference_source, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            uuid(),
            reportId,
            r.testCode,
            r.testName,
            r.value,
            r.unit,
            r.referenceLow,
            r.referenceHigh,
            r.referenceText,
            deterministicAnalysis.results[index].status,
            1.0,
            'LAB_REPORT',
            bundle.analysis.results[index].explanation,
          );
        }

        await transactionDb.run('DELETE FROM meal_plans WHERE lab_report_id = ?', reportId);
        await transactionDb.run('DELETE FROM exercise_plans WHERE lab_report_id = ?', reportId);

        const mealPlanId = uuid();
        await transactionDb.run(
          'INSERT INTO meal_plans (id, user_id, lab_report_id, title, description) VALUES (?, ?, ?, ?, ?)',
          mealPlanId,
          userId,
          reportId,
          bundle.mealPlan.title ?? 'Thực đơn gợi ý hỗ trợ sức khỏe',
          bundle.mealPlan.description ?? '',
        );
        for (const item of bundle.mealPlan.items ?? []) {
          await transactionDb.run(
            'INSERT INTO meal_plan_items (id, meal_plan_id, meal_type, name, description, ingredients, preparation, image_url, image_alt, image_source_url, image_license, image_author, image_verified_at, rationale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            uuid(),
            mealPlanId,
            item.mealType,
            item.name,
            item.description ?? '',
            item.ingredients ?? '',
            item.preparation ?? '',
            item.imageUrl ?? null,
            item.imageAlt ?? null,
            item.imageSourceUrl ?? null,
            item.imageLicense ?? null,
            item.imageAuthor ?? null,
            item.imageVerifiedAt ?? null,
            item.rationale ?? '',
          );
        }

        const exercisePlanId = uuid();
        await transactionDb.run(
          'INSERT INTO exercise_plans (id, user_id, lab_report_id, title) VALUES (?, ?, ?, ?)',
          exercisePlanId,
          userId,
          reportId,
          bundle.exercisePlan.title ?? 'Kế hoạch vận động hỗ trợ sức khỏe',
        );
        for (const item of bundle.exercisePlan.items ?? []) {
          await transactionDb.run(
            'INSERT INTO exercise_items (id, exercise_plan_id, name, description, duration, difficulty, rationale, youtube_url, youtube_video_id, youtube_title, youtube_author, youtube_author_url, youtube_thumbnail_url, youtube_verified, youtube_source, youtube_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            uuid(),
            exercisePlanId,
            item.name,
            item.description ?? '',
            item.duration ?? 15,
            item.difficulty ?? 'EASY',
            item.rationale ?? '',
            item.youtubeUrl ?? null,
            item.youtubeVideoId ?? null,
            item.youtubeTitle ?? null,
            item.youtubeAuthor ?? null,
            item.youtubeAuthorUrl ?? null,
            item.youtubeThumbnailUrl ?? null,
            item.youtubeVerified ? 1 : 0,
            item.youtubeSource ?? null,
            item.youtubeVerifiedAt ?? null,
          );
        }
      });
    } finally {
      await transactionDb.close();
    }

    res.json({
      success: true,
      data: { analysis: bundle.analysis, mealPlan: bundle.mealPlan, exercisePlan: bundle.exercisePlan },
      error: null,
    });
  } catch (err) {
    const e = err as Error;
    console.error(e);
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'ANALYSIS_FAILED', message: e.message ?? 'Không thể phân tích kết quả.' },
    });
  }
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.all<Array<Record<string, unknown>>>(
      'SELECT id, image_reference, status, source_type, created_at FROM lab_reports WHERE user_id = ? ORDER BY created_at DESC',
      req.userId,
    );
    res.json({ success: true, data: { reports: rows }, error: null });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'HISTORY_FAILED', message: e.message ?? 'Không thể lấy lịch sử.' },
    });
  }
}

export async function getReportDetail(req: AuthedRequest, res: Response): Promise<void> {
  let detailDb: Awaited<ReturnType<typeof openConfiguredDatabase>> | null = null;
  try {
    await getDb();
    detailDb = await openConfiguredDatabase();
    const reportId = req.params.reportId as string;
    const reportDetail = await withReadTransaction(detailDb, async () => {
      const report = await detailDb!.get<{
        id: string;
        user_id: string;
        analysis_summary: string | null;
      }>(
        'SELECT id, user_id, analysis_summary FROM lab_reports WHERE id = ?',
        reportId,
      );
      if (!report || report.user_id !== req.userId) return null;

      const storedResults = await detailDb!.all<PersistedLabResultRow[]>(
        'SELECT test_code, test_name, value, unit, reference_low, reference_high, reference_text, status, ocr_confidence, explanation FROM lab_results WHERE report_id = ? ORDER BY rowid',
        reportId,
      );
      const fallback = analyzeConfirmedLabResults(
        reportId,
        storedResults.map((result) => ({
          testCode: result.test_code,
          testName: result.test_name,
          value: result.value,
          unit: result.unit,
          referenceLow: result.reference_low,
          referenceHigh: result.reference_high,
          referenceText: result.reference_text,
        })),
      );
      const results = storedResults.map((result, index) => ({
        ...result,
        status: fallback.results[index].status,
        explanation: hasNarrative(result.explanation)
          ? result.explanation
          : fallback.results[index].explanation,
      }));
      const overallSummary = hasNarrative(report.analysis_summary)
        ? report.analysis_summary
        : fallback.overallSummary;
      const mealPlan = await detailDb!.get<{
        id: string;
        title: string;
        description: string | null;
      }>(
        `SELECT mp.id, mp.title, mp.description
         FROM meal_plans mp
         WHERE mp.lab_report_id = ?
           AND mp.user_id = ?
           AND length(trim(COALESCE(mp.title, ''))) > 0
           AND length(trim(COALESCE(mp.description, ''))) > 0
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id) = 5
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND meal_type = 'BREAKFAST') = 1
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND meal_type = 'LUNCH') = 1
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND meal_type = 'DINNER') = 1
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND meal_type = 'SNACK') = 1
           AND (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND meal_type = 'DRINK') = 1
           AND NOT EXISTS (
             SELECT 1
             FROM meal_plan_items mpi
             WHERE mpi.meal_plan_id = mp.id
               AND (
                 length(trim(COALESCE(mpi.name, ''))) = 0
                 OR length(trim(COALESCE(mpi.description, ''))) = 0
                 OR length(trim(COALESCE(mpi.ingredients, ''))) = 0
                 OR length(trim(COALESCE(mpi.preparation, ''))) = 0
                 OR length(trim(COALESCE(mpi.rationale, ''))) = 0
               )
           )
         ORDER BY mp.created_at DESC, mp.rowid DESC
         LIMIT 1`,
        reportId,
        req.userId,
      );
      const mealItems = mealPlan
        ? (
            await detailDb!.all<Array<Record<string, unknown>>>(
              `SELECT meal_type AS mealType, name, description, ingredients, preparation,
                image_url AS imageUrl, image_alt AS imageAlt, image_source_url AS imageSourceUrl,
                image_license AS imageLicense, image_author AS imageAuthor, image_verified_at AS imageVerifiedAt, rationale
               FROM meal_plan_items WHERE meal_plan_id = ?
               ORDER BY CASE meal_type WHEN 'BREAKFAST' THEN 1 WHEN 'LUNCH' THEN 2 WHEN 'DINNER' THEN 3 WHEN 'SNACK' THEN 4 ELSE 5 END`,
              mealPlan.id,
            )
          ).map((item) => ({ ...item, ...sanitizeMealImageMedia(item) }))
        : [];
      const exercisePlan = await detailDb!.get<{ id: string; title: string }>(
        `SELECT ep.id, ep.title
         FROM exercise_plans ep
         WHERE ep.lab_report_id = ?
           AND ep.user_id = ?
           AND length(trim(COALESCE(ep.title, ''))) > 0
           AND (SELECT COUNT(*) FROM exercise_items WHERE exercise_plan_id = ep.id) BETWEEN 2 AND 3
           AND NOT EXISTS (
             SELECT 1
             FROM exercise_items ei
             WHERE ei.exercise_plan_id = ep.id
               AND (
                 length(trim(COALESCE(ei.name, ''))) = 0
                 OR length(trim(COALESCE(ei.description, ''))) = 0
                 OR length(trim(COALESCE(ei.rationale, ''))) = 0
                 OR ei.duration NOT BETWEEN 1 AND 120
                 OR CAST(ei.duration AS INTEGER) <> ei.duration
                 OR ei.difficulty NOT IN ('EASY', 'MEDIUM', 'HARD')
               )
           )
         ORDER BY ep.created_at DESC, ep.rowid DESC
         LIMIT 1`,
        reportId,
        req.userId,
      );
      const exerciseItems = exercisePlan
        ? (
            await detailDb!.all<Array<Record<string, unknown>>>(
              'SELECT name, description, duration, difficulty, rationale, youtube_url AS youtubeUrl, youtube_video_id AS youtubeVideoId, youtube_title AS youtubeTitle, youtube_author AS youtubeAuthor, youtube_author_url AS youtubeAuthorUrl, youtube_thumbnail_url AS youtubeThumbnailUrl, youtube_verified AS youtubeVerified, youtube_source AS youtubeSource, youtube_verified_at AS youtubeVerifiedAt FROM exercise_items WHERE exercise_plan_id = ? ORDER BY rowid',
              exercisePlan.id,
            )
          ).map((item) => ({ ...item, ...sanitizeExerciseYoutubeMedia(item) }))
        : [];

      return {
        id: report.id,
        overallSummary,
        results,
        mealPlan: mealPlan
          ? {
              reportId,
              title: mealPlan.title,
              description: mealPlan.description ?? 'Thực đơn hỗ trợ sức khỏe.',
              items: mealItems,
            }
          : null,
        exercisePlan: exercisePlan
          ? { reportId, title: exercisePlan.title, items: exerciseItems }
          : null,
      };
    });

    if (!reportDetail) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu xét nghiệm.' },
      });
      return;
    }
    res.json({
      success: true,
      data: { report: reportDetail },
      error: null,
    });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'DETAIL_FAILED', message: e.message ?? 'Không thể lấy chi tiết.' },
    });
  } finally {
    if (detailDb) {
      try {
        await detailDb.close();
      } catch (closeError) {
        console.error('Failed to close report detail database connection.', closeError);
      }
    }
  }
}
