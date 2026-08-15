import {
  AnalysisBundle,
  AnalyzedLabResult,
  ConfirmedLabResult,
  ExercisePlan,
  ExercisePlanItem,
  LabAnalysis,
  LabStatus,
  MealPlan,
  MealPlanItem,
} from '../types/patient';
import { VERIFIED_EXERCISE_VIDEOS, VERIFIED_FOOD_IMAGES } from './patientCatalog';

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

export function generateLabAnalysis(reportId: string, results: ConfirmedLabResult[]): LabAnalysis {
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

  const abnormal = analyzed.filter((r) => r.status === 'LOW' || r.status === 'HIGH');
  const unknown = analyzed.filter((r) => r.status === 'UNKNOWN');
  const disclaimer = 'Đây chỉ là thông tin tham khảo, bạn nên trao đổi với bác sĩ khi có điều kiện.';

  const sections: string[] = [];
  if (abnormal.length > 0) {
    sections.push(
      `Có ${abnormal.length} chỉ số nằm ngoài khoảng tham chiếu cần lưu ý: ${abnormal
        .map((r) => `${r.testName} (${r.testCode})`)
        .join(', ')}.`
    );
  }
  if (unknown.length > 0) {
    sections.push(
      `Có ${unknown.length} chỉ số chưa đủ thông tin khoảng tham chiếu để phân loại: ${unknown
        .map((r) => `${r.testName} (${r.testCode})`)
        .join(', ')}.`
    );
  }

  const overallSummary =
    sections.length === 0
      ? 'Các chỉ số xét nghiệm của bạn đều nằm trong khoảng tham chiếu được ghi trên phiếu.'
      : `${sections.join(' ')} ${disclaimer}`;

  return { reportId, overallSummary, results: analyzed };
}

export function generateMealPlan(reportId: string, results: ConfirmedLabResult[]): MealPlan {
  const analyzed = generateLabAnalysis(reportId, results).results;
  const abnormal = analyzed.filter((r) => r.status !== 'NORMAL');
  const lowRbc = analyzed.some((r) => r.testCode === 'RBC' && r.status === 'LOW');
  const highGlucose = analyzed.some((r) => r.testCode === 'GLUCOSE' && r.status === 'HIGH');
  const highCholesterol = analyzed.some((r) => r.testCode === 'CHOLESTEROL' && r.status === 'HIGH');

  const items: MealPlanItem[] = [
    {
      mealType: 'BREAKFAST',
      name: lowRbc ? 'Phở bò rau xanh' : 'Bánh mì nguyên cám, trứng và rau tươi',
      description: lowRbc
        ? 'Phở bò rau xanh là bữa sáng ấm, kết hợp bánh phở, thịt bò và rau ăn kèm.'
        : 'Bánh mì nguyên cám, trứng và rau tươi tạo thành bữa sáng cân đối, dễ chuẩn bị.',
      ingredients: lowRbc
        ? 'Bánh phở, thịt bò nạc, hành lá, rau thơm, giá đỗ và nước dùng ít muối'
        : 'Bánh mì nguyên cám, trứng gà, cà chua, xà lách và dưa leo',
      preparation: lowRbc
        ? 'Trụng bánh phở, xếp thịt bò và rau xanh vào bát rồi chan nước dùng nóng đã nêm nhạt.'
        : 'Nướng bánh mì, luộc hoặc áp chảo trứng ít dầu rồi ăn cùng rau tươi đã rửa sạch.',
      rationale: lowRbc
        ? 'Thịt bò cung cấp sắt và protein; rau xanh bổ sung vitamin và chất xơ hỗ trợ bữa ăn cân đối.'
        : 'Bánh mì nguyên cám cung cấp chất xơ, trứng cung cấp protein và rau tươi bổ sung vitamin.',
      ...VERIFIED_FOOD_IMAGES[lowRbc ? 'beef-noodle-breakfast' : 'egg-toast-breakfast'],
    },
    {
      mealType: 'LUNCH',
      name: 'Cơm, cá và rau xanh',
      description: 'Cơm, cá và rau xanh là bữa trưa cân đối giữa tinh bột, đạm và chất xơ.',
      ingredients: 'Cơm trắng hoặc gạo lứt, cá tươi, rau xanh theo mùa, gừng và gia vị ít muối',
      preparation: 'Nấu cơm, hấp hoặc áp chảo cá với ít dầu và luộc rau xanh; dùng nước chấm nhạt.',
      rationale:
        highGlucose || highCholesterol
          ? 'Gạo lứt và cá hấp giúp kiểm soát đường huyết và mỡ máu tốt hơn.'
          : 'Cá cung cấp protein, rau xanh cung cấp chất xơ và vitamin, phù hợp chế độ ăn lành mạnh.',
      ...VERIFIED_FOOD_IMAGES['fish-rice-lunch'],
    },
    {
      mealType: 'DINNER',
      name: 'Canh rau củ và đậu hũ non',
      description: 'Canh rau củ và đậu hũ non là bữa tối nhẹ, nhiều nước và dễ tiêu hóa.',
      ingredients: 'Rau củ gồm cà rốt, bắp cải, bí xanh và nấm; đậu hũ non, hành lá và gia vị ít muối',
      preparation: 'Nấu mềm rau củ trong nước dùng nhạt, cho đậu hũ non vào sau cùng và đun sôi nhẹ.',
      rationale: 'Rau củ bổ sung chất xơ và vitamin; đậu hũ non cung cấp protein thực vật cho bữa tối nhẹ.',
      ...VERIFIED_FOOD_IMAGES['vegetable-soup-dinner'],
    },
    {
      mealType: 'SNACK',
      name: 'Trái cây tươi và các loại hạt',
      description: 'Trái cây tươi và các loại hạt là bữa phụ bổ sung vitamin, chất xơ và chất béo tốt.',
      ingredients: 'Một phần táo, chuối hoặc quả mọng và 15g hạnh nhân hoặc óc chó không muối',
      preparation: 'Rửa sạch, cắt trái cây vừa ăn và dùng cùng một phần nhỏ hạt rang không muối.',
      rationale: 'Trái cây và hạt cung cấp vitamin, chất xơ và chất béo tốt, hỗ trợ kiểm soát cơn đói.',
      ...VERIFIED_FOOD_IMAGES['fruit-nuts-snack'],
    },
    {
      mealType: 'DRINK',
      name: 'Nước lọc / trà xanh ít đường',
      description: 'Nước lọc hoặc trà xanh ít đường giúp bổ sung nước trong ngày mà không thêm nhiều đường.',
      ingredients: 'Nước lọc hoặc lá trà xanh và lượng đường tối thiểu nếu cần',
      preparation: 'Hãm trà xanh với nước nóng, để nguội bớt và uống không đường hoặc chỉ thêm rất ít đường.',
      rationale: 'Đủ nước giúp thận và hệ tuần hoàn hoạt động tốt hơn.',
      ...VERIFIED_FOOD_IMAGES['green-tea-drink'],
    },
  ];

  return {
    reportId,
    title: 'Thực đơn gợi ý hỗ trợ sức khỏe',
    description:
      abnormal.length > 0
        ? 'Thực đơn được gợi ý dựa trên các chỉ số xét nghiệm cần lưu ý. Đây chỉ là gợi ý dinh dưỡng hỗ trợ, không phải phác đồ điều trị.'
        : 'Thực đơn cân đối phù hợp với người có chỉ số xét nghiệm bình thường. Đây chỉ là gợi ý dinh dưỡng hỗ trợ.',
    items,
  };
}

export function generateExercisePlan(reportId: string, age: number = 35): ExercisePlan {
  const items: ExercisePlanItem[] = [
    {
      name: 'Đi bộ nhanh',
      description: 'Đi bộ với tốc độ vừa phải giúp tăng tuần hoàn máu và cải thiện sức bền tim mạch.',
      duration: 30,
      difficulty: 'EASY',
      rationale: 'Phù hợp với hầu hết mọi lứa tuổi, an toàn cho người mới bắt đầu tập luyện.',
      youtubeUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].youtubeUrl,
      youtubeVideoId: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].videoId,
      youtubeTitle: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].title,
      youtubeAuthor: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].authorName,
      youtubeAuthorUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].authorUrl,
      youtubeThumbnailUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].thumbnailUrl,
      youtubeVerified: true,
    },
    {
      name: age >= 60 ? 'Yoga ghế nhẹ nhàng' : 'Yoga cơ bản tại nhà',
      description:
        age >= 60
          ? 'Thực hiện các động tác yoga nhẹ nhàng khi ngồi trên ghế, phù hợp người lớn tuổi và người cần hỗ trợ thăng bằng.'
          : 'Thực hiện bài yoga 20 phút dành cho người mới bắt đầu, tập chậm và trong phạm vi thoải mái.',
      duration: age >= 60 ? 15 : 20,
      difficulty: 'EASY',
      rationale: 'Tăng cường cơ bắp, xương khớp và hỗ trợ kiểm soát cân nặng.',
      youtubeUrl: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].youtubeUrl,
      youtubeVideoId: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].videoId,
      youtubeTitle: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].title,
      youtubeAuthor: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].authorName,
      youtubeAuthorUrl: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].authorUrl,
      youtubeThumbnailUrl: VERIFIED_EXERCISE_VIDEOS[age >= 60 ? 'chair-yoga' : 'beginner-yoga'].thumbnailUrl,
      youtubeVerified: true,
    },
  ];

  return { reportId, title: 'Kế hoạch vận động hỗ trợ sức khỏe', items };
}

export function buildCompleteBundle(
  reportId: string,
  results: ConfirmedLabResult[],
  age: number = 35
): AnalysisBundle {
  return {
    analysis: generateLabAnalysis(reportId, results),
    mealPlan: generateMealPlan(reportId, results),
    exercisePlan: generateExercisePlan(reportId, age),
  };
}
