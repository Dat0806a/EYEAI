import { ConfirmedLabResult, LabAnalysis } from '../../src/services/ai/types';

export const goldenLabReportId = 'report-golden';

export const goldenConfirmedLabResults: ConfirmedLabResult[] = [
  {
    testCode: 'NORMAL_FULL',
    testName: 'Full range normal',
    value: 7,
    unit: 'unit',
    referenceLow: 4,
    referenceHigh: 10,
    referenceText: '4 - 10',
  },
  {
    testCode: 'DUPLICATE',
    testName: 'Lower only low',
    value: 3.9,
    unit: 'unit',
    referenceLow: 4,
    referenceHigh: null,
    referenceText: '>= 4',
  },
  {
    testCode: 'DUPLICATE',
    testName: 'Lower only boundary',
    value: 4,
    unit: 'unit',
    referenceLow: 4,
    referenceHigh: null,
    referenceText: '>= 4',
  },
  {
    testCode: 'UPPER_ONLY_HIGH',
    testName: 'Upper only high',
    value: 10.1,
    unit: 'unit',
    referenceLow: null,
    referenceHigh: 10,
    referenceText: '<= 10',
  },
  {
    testCode: 'UPPER_ONLY_BOUNDARY',
    testName: 'Upper only boundary',
    value: 10,
    unit: 'unit',
    referenceLow: null,
    referenceHigh: 10,
    referenceText: '<= 10',
  },
  {
    testCode: 'UNKNOWN',
    testName: 'No reference',
    value: 5,
    unit: 'unit',
    referenceLow: null,
    referenceHigh: null,
    referenceText: null,
  },
];

export const goldenLabAnalysis: LabAnalysis = {
  reportId: goldenLabReportId,
  overallSummary:
    'Có 2 chỉ số nằm ngoài khoảng tham chiếu cần lưu ý: Lower only low (DUPLICATE), Upper only high (UPPER_ONLY_HIGH). Có 1 chỉ số chưa đủ thông tin khoảng tham chiếu để phân loại: No reference (UNKNOWN). Đây chỉ là thông tin tham khảo, bạn nên trao đổi với bác sĩ khi có điều kiện.',
  results: [
    {
      testCode: 'NORMAL_FULL',
      testName: 'Full range normal',
      value: 7,
      unit: 'unit',
      referenceLow: 4,
      referenceHigh: 10,
      referenceText: '4 - 10',
      status: 'NORMAL',
      explanation:
        'Full range normal (NORMAL_FULL) của bạn là 7 unit, khoảng tham chiếu 4 - 10. Chỉ số này nằm trong khoảng bình thường, không có dấu hiệu cần lo ngại đặc biệt.',
    },
    {
      testCode: 'DUPLICATE',
      testName: 'Lower only low',
      value: 3.9,
      unit: 'unit',
      referenceLow: 4,
      referenceHigh: null,
      referenceText: '>= 4',
      status: 'LOW',
      explanation:
        'Lower only low (DUPLICATE) của bạn là 3.9 unit, khoảng tham chiếu >= 4. Chỉ số này thấp hơn khoảng tham chiếu. Đây chỉ là thông tin tham khảo; bạn nên theo dõi chế độ ăn, nghỉ ngơi và tham khảo ý kiến bác sĩ nếu cần.',
    },
    {
      testCode: 'DUPLICATE',
      testName: 'Lower only boundary',
      value: 4,
      unit: 'unit',
      referenceLow: 4,
      referenceHigh: null,
      referenceText: '>= 4',
      status: 'NORMAL',
      explanation:
        'Lower only boundary (DUPLICATE) của bạn là 4 unit, khoảng tham chiếu >= 4. Chỉ số này nằm trong khoảng bình thường, không có dấu hiệu cần lo ngại đặc biệt.',
    },
    {
      testCode: 'UPPER_ONLY_HIGH',
      testName: 'Upper only high',
      value: 10.1,
      unit: 'unit',
      referenceLow: null,
      referenceHigh: 10,
      referenceText: '<= 10',
      status: 'HIGH',
      explanation:
        'Upper only high (UPPER_ONLY_HIGH) của bạn là 10.1 unit, khoảng tham chiếu <= 10. Chỉ số này cao hơn khoảng tham chiếu. Đây chỉ là thông tin tham khảo; bạn nên điều chỉnh lối sống và tham khảo ý kiến bác sĩ nếu cần.',
    },
    {
      testCode: 'UPPER_ONLY_BOUNDARY',
      testName: 'Upper only boundary',
      value: 10,
      unit: 'unit',
      referenceLow: null,
      referenceHigh: 10,
      referenceText: '<= 10',
      status: 'NORMAL',
      explanation:
        'Upper only boundary (UPPER_ONLY_BOUNDARY) của bạn là 10 unit, khoảng tham chiếu <= 10. Chỉ số này nằm trong khoảng bình thường, không có dấu hiệu cần lo ngại đặc biệt.',
    },
    {
      testCode: 'UNKNOWN',
      testName: 'No reference',
      value: 5,
      unit: 'unit',
      referenceLow: null,
      referenceHigh: null,
      referenceText: null,
      status: 'UNKNOWN',
      explanation:
        'No reference (UNKNOWN) của bạn là 5 unit, không có khoảng tham chiếu trên phiếu. Không đủ thông tin khoảng tham chiếu để đánh giá chính xác. Vui lòng kiểm tra lại phiếu xét nghiệm.',
    },
  ],
};
