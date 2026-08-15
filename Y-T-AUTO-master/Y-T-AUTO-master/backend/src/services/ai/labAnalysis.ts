import {
  AnalyzedLabResult,
  ConfirmedLabResult,
  LabAnalysis,
  LabStatus,
} from './types';

function classify(value: number, low: number | null, high: number | null): LabStatus {
  if (low === null && high === null) return 'UNKNOWN';
  if (low !== null && value < low) return 'LOW';
  if (high !== null && value > high) return 'HIGH';
  return 'NORMAL';
}

function explain(result: ConfirmedLabResult, status: LabStatus): string {
  const range = result.referenceText
    ? `khoảng tham chiếu ${result.referenceText}`
    : 'không có khoảng tham chiếu trên phiếu';
  const base = `${result.testName} (${result.testCode}) của bạn là ${result.value} ${result.unit}, ${range}. `;
  switch (status) {
    case 'NORMAL':
      return base + 'Chỉ số này nằm trong khoảng bình thường, không có dấu hiệu cần lo ngại đặc biệt.';
    case 'LOW':
      return base + 'Chỉ số này thấp hơn khoảng tham chiếu. Đây chỉ là thông tin tham khảo; bạn nên theo dõi chế độ ăn, nghỉ ngơi và tham khảo ý kiến bác sĩ nếu cần.';
    case 'HIGH':
      return base + 'Chỉ số này cao hơn khoảng tham chiếu. Đây chỉ là thông tin tham khảo; bạn nên điều chỉnh lối sống và tham khảo ý kiến bác sĩ nếu cần.';
    default:
      return base + 'Không đủ thông tin khoảng tham chiếu để đánh giá chính xác. Vui lòng kiểm tra lại phiếu xét nghiệm.';
  }
}

export function analyzeConfirmedLabResults(
  reportId: string,
  results: ConfirmedLabResult[],
): LabAnalysis {
  if (results.length === 0) {
    return {
      reportId,
      overallSummary: 'Chưa có kết quả xét nghiệm đã xác nhận để phân tích.',
      results: [],
    };
  }

  const analyzed: AnalyzedLabResult[] = results.map((result) => {
    const status = classify(result.value, result.referenceLow, result.referenceHigh);
    return { ...result, status, explanation: explain(result, status) };
  });
  const abnormal = analyzed.filter(
    (result) => result.status === 'LOW' || result.status === 'HIGH',
  );
  const unknown = analyzed.filter((result) => result.status === 'UNKNOWN');
  const disclaimer =
    'Đây chỉ là thông tin tham khảo, bạn nên trao đổi với bác sĩ khi có điều kiện.';
  const sections: string[] = [];
  if (abnormal.length > 0) {
    sections.push(
      `Có ${abnormal.length} chỉ số nằm ngoài khoảng tham chiếu cần lưu ý: ${abnormal
        .map((result) => `${result.testName} (${result.testCode})`)
        .join(', ')}.`,
    );
  }
  if (unknown.length > 0) {
    sections.push(
      `Có ${unknown.length} chỉ số chưa đủ thông tin khoảng tham chiếu để phân loại: ${unknown
        .map((result) => `${result.testName} (${result.testCode})`)
        .join(', ')}.`,
    );
  }
  const overallSummary = sections.length === 0
    ? 'Các chỉ số xét nghiệm của bạn đều nằm trong khoảng tham chiếu được ghi trên phiếu.'
    : `${sections.join(' ')} ${disclaimer}`;

  return { reportId, overallSummary, results: analyzed };
}
