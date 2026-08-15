import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReportDetail } from '../services/api';
import type { ReportDetail } from '../types';
import { AnalysisPage } from './AnalysisPage';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getReportDetail: vi.fn(),
  };
});

const persistedReport: ReportDetail = {
  id: 'report-history-123',
  overallSummary: 'Tóm tắt đã lưu: có một chỉ số thấp và một chỉ số cao cần được trao đổi với bác sĩ.',
  results: [
    {
      test_code: 'HGB',
      test_name: 'Hemoglobin',
      value: 10.2,
      unit: 'g/dL',
      reference_low: 12,
      reference_high: 16,
      reference_text: '12-16',
      status: 'LOW',
      ocr_confidence: 0.98,
      explanation: 'Giải thích đã lưu cho HGB: giá trị nằm dưới giới hạn tham chiếu đã xác nhận.',
    },
    {
      test_code: 'GLU',
      test_name: 'Glucose',
      value: 132,
      unit: 'mg/dL',
      reference_low: 70,
      reference_high: 99,
      reference_text: '70-99',
      status: 'HIGH',
      ocr_confidence: 0.97,
      explanation: 'Giải thích đã lưu cho GLU: giá trị nằm trên giới hạn tham chiếu đã xác nhận.',
    },
  ],
  mealPlan: null,
  exercisePlan: null,
};

describe('AnalysisPage direct load', () => {
  beforeEach(() => {
    vi.mocked(getReportDetail).mockReset();
  });

  it('renders the persisted summary and result explanations without navigation state', async () => {
    vi.mocked(getReportDetail).mockResolvedValue(persistedReport);

    render(
      <MemoryRouter initialEntries={['/analysis/report-history-123']}>
        <Routes>
          <Route path="/analysis/:reportId" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(persistedReport.overallSummary)).toBeVisible();
    expect(screen.getByText(persistedReport.results[0].explanation)).toBeVisible();
    expect(screen.getByText(persistedReport.results[1].explanation)).toBeVisible();
  });
});
