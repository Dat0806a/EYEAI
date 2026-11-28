import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOcrText } from '../../../../services/patientOcrNormalizer';
import {
  classifyResult,
  generateLabAnalysis,
  generateMealPlan,
  generateExercisePlan,
  buildCompleteBundle,
} from '../../../../services/patientAnalysisService';
import { VERIFIED_FOOD_IMAGES, VERIFIED_EXERCISE_VIDEOS } from '../../../../services/patientCatalog';
import {
  getHistory,
  getReportDetail,
  hasUnownedLegacyPatientStorage,
  confirmAnalysis,
} from '../../../../services/patientService';
import { supabase } from '../../../../lib/supabase';
import { extractBearerToken, verifyPatientAuthHeader } from '../../../../../server/patientAuth';

describe('Phase 1: Patient Regression Baseline & Security Foundation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Existing Patient Business Logic Baseline', () => {
    it('parses structured and unstructured lab reports without whitelisting', () => {
      const sample = [
        'GLUCOSE | Đường huyết | 7.8 | mmol/L | 3.9 - 6.1',
        'CUSTOM_MARKER_X | Chỉ số mới | 12,5* | U/L | 0 - 10',
        'HBSAG | Kháng nguyên B | Âm tính | | Âm tính',
      ].join('\n');

      const parsed = parseOcrText(sample);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].testCode).toBe('GLUCOSE');
      expect(parsed[0].value).toBe(7.8);
      expect(parsed[1].testCode).toBe('CUSTOM_MARKER_X');
      expect(parsed[1].value).toBe(12.5);
      expect(parsed[1].isUncertain).toBe(true);
      expect(parsed[2].valueType).toBe('QUALITATIVE');
    });

    it('classifies numeric and qualitative results accurately and preserves disclaimers', () => {
      expect(
        classifyResult({
          testCode: 'GLUCOSE',
          testName: 'Glucose',
          value: 7.5,
          valueType: 'NUMERIC',
          unit: 'mmol/L',
          referenceLow: 3.9,
          referenceHigh: 6.1,
          referenceText: '3.9 - 6.1',
        })
      ).toBe('HIGH');

      expect(
        classifyResult({
          testCode: 'HBSAG',
          testName: 'HBsAg',
          value: 'Dương tính',
          valueType: 'QUALITATIVE',
          unit: '',
          referenceLow: null,
          referenceHigh: null,
          referenceText: 'Âm tính',
        })
      ).toBe('ABNORMAL');

      const analysis = generateLabAnalysis('rep_test', [
        {
          testCode: 'WBC',
          testName: 'Bạch cầu',
          value: 6.5,
          valueType: 'NUMERIC',
          unit: '10^9/L',
          referenceLow: 4.0,
          referenceHigh: 10.0,
          referenceText: '4.0 - 10.0',
          isUncertain: true,
        },
      ]);
      expect(analysis.results[0].status).toBe('UNCERTAIN');
      expect(analysis.overallSummary).toContain('không thay thế chẩn đoán');
    });

    it('generates verified meal plans and exercise plans referencing catalog assets', () => {
      const results = [
        {
          testCode: 'GLUCOSE',
          testName: 'Đường huyết',
          value: 8.1,
          valueType: 'NUMERIC' as const,
          unit: 'mmol/L',
          referenceLow: 3.9,
          referenceHigh: 6.1,
          referenceText: '3.9 - 6.1',
        },
      ];

      const bundle = buildCompleteBundle('rep_1', results, 65);
      expect(bundle.mealPlan.items).toHaveLength(5);
      expect(bundle.exercisePlan.items).toHaveLength(2);
      expect(bundle.exercisePlan.items[0].duration).toBe(15); // Senior adjustment
      expect(Object.keys(VERIFIED_FOOD_IMAGES).length).toBeGreaterThanOrEqual(6);
      expect(Object.keys(VERIFIED_EXERCISE_VIDEOS).length).toBeGreaterThanOrEqual(3);
      expect(generateMealPlan('rep_1', results).title).toBeTruthy();
      expect(generateExercisePlan('rep_1', results, 65).items[0].youtubeVerified).toBe(true);
    });
  });

  describe('Patient Session & Storage Isolation (Fail-Closed)', () => {
    it('fails closed when unauthenticated and isolates records per user_id', async () => {
      // Seed legacy un-owned record without deleting it
      localStorage.setItem(
        'eyetalk_patient_reports',
        JSON.stringify([{ id: 'legacy_1', created_at: '2026-01-01T00:00:00Z', status: 'PROCESSED', source_type: 'UPLOAD' }])
      );
      expect(hasUnownedLegacyPatientStorage()).toBe(true);

      // Unauthenticated user cannot see legacy records or any history
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as any);
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: null } as any);

      expect(await getHistory()).toEqual([]);
      await expect(getReportDetail('legacy_1')).rejects.toThrow();
      // Legacy storage remains untouched
      expect(localStorage.getItem('eyetalk_patient_reports')).not.toBeNull();
    });

    it('prevents cross-account localStorage leakage between patient A and patient B', async () => {
      let currentUid = 'patient-user-a';
      vi.spyOn(supabase.auth, 'getSession').mockImplementation(async () => ({
        data: { session: { user: { id: currentUid } } },
        error: null,
      }) as any);
      vi.spyOn(supabase.auth, 'getUser').mockImplementation(async () => ({
        data: { user: { id: currentUid } },
        error: null,
      }) as any);
      vi.spyOn(supabase, 'from').mockImplementation(
        () =>
          ({
            upsert: async () => ({ error: new Error('offline test') }),
            delete: () => ({ eq: async () => ({ error: new Error('offline test') }) }),
            insert: async () => ({ error: new Error('offline test') }),
            select: () => ({
              eq: () => ({
                order: async () => ({ data: null, error: new Error('offline test') }),
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }) as any
      );
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline test'));

      await confirmAnalysis('rep_user_a', [
        {
          testCode: 'GLUCOSE',
          testName: 'Đường huyết',
          value: 5.2,
          valueType: 'NUMERIC',
          unit: 'mmol/L',
          referenceLow: 3.9,
          referenceHigh: 6.1,
          referenceText: '3.9 - 6.1',
        },
      ]);

      const historyA = await getHistory();
      expect(historyA).toHaveLength(1);
      expect(historyA[0].id).toBe('rep_user_a');

      // Switch session to patient B
      currentUid = 'patient-user-b';
      const historyB = await getHistory();
      expect(historyB).toHaveLength(0);
      await expect(getReportDetail('rep_user_a')).rejects.toThrow();
    });
  });

  describe('Server-side Patient Auth Verification', () => {
    it('extracts bearer tokens strictly and rejects unauthenticated or impaired callers', async () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken('Basic abc')).toBeNull();
      expect(extractBearerToken('Bearer tok_123')).toBe('tok_123');

      const missingRes = await verifyPatientAuthHeader(undefined);
      expect(missingRes.ok).toBe(false);
      expect(missingRes.status).toBe(401);

      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');

      // Mock Supabase returning an impaired account
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_imp', email: 'an@eyetalk.app', user_metadata: { account_type: 'impaired' } }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 'u_imp', account_type: 'impaired', display_name: 'An' }]), {
            status: 200,
          })
        );

      const impairedRes = await verifyPatientAuthHeader('Bearer valid_imp_jwt');
      expect(impairedRes.ok).toBe(false);
      expect(impairedRes.status).toBe(403);

      // Mock Supabase returning a patient account
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_pat', email: 'binh@eyetalk.app', user_metadata: { account_type: 'patient' } }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 'u_pat', account_type: 'patient', display_name: 'Bình' }]), {
            status: 200,
          })
        );

      const patientRes = await verifyPatientAuthHeader('Bearer valid_pat_jwt');
      expect(patientRes.ok).toBe(true);
      expect(patientRes.status).toBe(200);
      expect(patientRes.identity?.userId).toBe('u_pat');
      expect(patientRes.identity?.accountType).toBe('patient');
    });
  });
});
