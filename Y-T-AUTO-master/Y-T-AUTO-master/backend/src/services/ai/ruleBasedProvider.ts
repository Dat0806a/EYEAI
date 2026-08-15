import {
  AnalysisBundle,
  ConfirmedLabResult,
  ExercisePlan,
  ExercisePlanItem,
  IAIProvider,
  LabAnalysis,
  MealPlan,
  MealPlanItem,
  VerifiedMealImageFields,
  VerifiedExerciseYoutubeFields,
} from './types';
import { EXERCISE_VIDEO_SOURCE, ExerciseVideoKey, verifiedExerciseVideos } from './exerciseCatalog';
import { FoodImageKey, verifiedFoodImages } from './foodImageCatalog';
import { analyzeConfirmedLabResults } from './labAnalysis';

function verifiedYoutubeFields(key: ExerciseVideoKey): VerifiedExerciseYoutubeFields {
  const video = verifiedExerciseVideos[key];
  return {
    youtubeUrl: video.youtubeUrl,
    youtubeVideoId: video.videoId,
    youtubeTitle: video.title,
    youtubeAuthor: video.authorName,
    youtubeAuthorUrl: video.authorUrl,
    youtubeThumbnailUrl: video.thumbnailUrl,
    youtubeVerified: video.verified,
    youtubeSource: EXERCISE_VIDEO_SOURCE,
    youtubeVerifiedAt: video.verifiedAt,
  };
}

function verifiedImageFields(key: FoodImageKey): VerifiedMealImageFields {
  const image = verifiedFoodImages[key];
  return {
    imageUrl: image.imageUrl,
    imageAlt: image.alt,
    imageSourceUrl: image.sourceUrl,
    imageLicense: image.license,
    imageAuthor: image.author,
    imageVerifiedAt: image.verifiedAt,
  };
}

function makeMealPlan(reportId: string, results: ConfirmedLabResult[]): MealPlan {
  const analyzed = analyzeConfirmedLabResults(reportId, results).results;
  const abnormal = analyzed.filter((result) => result.status !== 'NORMAL');
  const lowRbc = analyzed.some((result) => result.testCode === 'RBC' && result.status === 'LOW');
  const highGlucose = analyzed.some((result) => result.testCode === 'GLUCOSE' && result.status === 'HIGH');
  const highCholesterol = analyzed.some(
    (result) => result.testCode === 'CHOLESTEROL' && result.status === 'HIGH',
  );

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
      ...verifiedImageFields(lowRbc ? 'beef-noodle-breakfast' : 'egg-toast-breakfast'),
      rationale: lowRbc
        ? 'Thịt bò cung cấp sắt và protein; rau xanh bổ sung vitamin và chất xơ hỗ trợ bữa ăn cân đối.'
        : 'Bánh mì nguyên cám cung cấp chất xơ, trứng cung cấp protein và rau tươi bổ sung vitamin.',
    },
    {
      mealType: 'LUNCH',
      name: 'Cơm, cá và rau xanh',
      description: 'Cơm, cá và rau xanh là bữa trưa cân đối giữa tinh bột, đạm và chất xơ.',
      ingredients: 'Cơm trắng hoặc gạo lứt, cá tươi, rau xanh theo mùa, gừng và gia vị ít muối',
      preparation: 'Nấu cơm, hấp hoặc áp chảo cá với ít dầu và luộc rau xanh; dùng nước chấm nhạt.',
      ...verifiedImageFields('fish-rice-lunch'),
      rationale: highGlucose || highCholesterol
        ? 'Gạo lứt và cá hấp giúp kiểm soát đường huyết và mỡ máu tốt hơn.'
        : 'Cá cung cấp protein, rau xanh cung cấp chất xơ và vitamin, phù hợp chế độ ăn lành mạnh.',
    },
    {
      mealType: 'DINNER',
      name: 'Canh rau củ và đậu hũ non',
      description: 'Canh rau củ và đậu hũ non là bữa tối nhẹ, nhiều nước và dễ tiêu hóa.',
      ingredients: 'Rau củ gồm cà rốt, bắp cải, bí xanh và nấm; đậu hũ non, hành lá và gia vị ít muối',
      preparation: 'Nấu mềm rau củ trong nước dùng nhạt, cho đậu hũ non vào sau cùng và đun sôi nhẹ.',
      ...verifiedImageFields('vegetable-soup-dinner'),
      rationale: 'Rau củ bổ sung chất xơ và vitamin; đậu hũ non cung cấp protein thực vật cho bữa tối nhẹ.',
    },
    {
      mealType: 'SNACK',
      name: 'Trái cây tươi và các loại hạt',
      description: 'Trái cây tươi và các loại hạt là bữa phụ bổ sung vitamin, chất xơ và chất béo tốt.',
      ingredients: 'Một phần táo, chuối hoặc quả mọng và 15g hạnh nhân hoặc óc chó không muối',
      preparation: 'Rửa sạch, cắt trái cây vừa ăn và dùng cùng một phần nhỏ hạt rang không muối.',
      ...verifiedImageFields('fruit-nuts-snack'),
      rationale: 'Trái cây và hạt cung cấp vitamin, chất xơ và chất béo tốt, hỗ trợ kiểm soát cơn đói.',
    },
    {
      mealType: 'DRINK',
      name: 'Nước lọc / trà xanh ít đường',
      description: 'Nước lọc hoặc trà xanh ít đường giúp bổ sung nước trong ngày mà không thêm nhiều đường.',
      ingredients: 'Nước lọc hoặc lá trà xanh và lượng đường tối thiểu nếu cần',
      preparation: 'Hãm trà xanh với nước nóng, để nguội bớt và uống không đường hoặc chỉ thêm rất ít đường.',
      ...verifiedImageFields('green-tea-drink'),
      rationale: 'Đủ nước giúp thận và hệ tuần hoàn hoạt động tốt hơn.',
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

function makeExercisePlan(reportId: string, results: ConfirmedLabResult[], age: number): ExercisePlan {
  const items: ExercisePlanItem[] = [
    {
      name: 'Đi bộ nhanh',
      description: 'Đi bộ với tốc độ vừa phải giúp tăng tuần hoàn máu và cải thiện sức bền tim mạch.',
      duration: 30,
      difficulty: 'EASY',
      rationale: 'Phù hợp với hầu hết mọi lứa tuổi, an toàn cho người mới bắt đầu tập luyện.',
      ...verifiedYoutubeFields('walk-at-home'),
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
      ...verifiedYoutubeFields(age >= 60 ? 'chair-yoga' : 'beginner-yoga'),
    },
  ];
  return { reportId, title: 'Kế hoạch vận động hỗ trợ sức khỏe', items };
}

export class RuleBasedAIProvider implements IAIProvider {
  readonly name = 'RULE_BASED_DEV';

  async analyzeLabResults(reportId: string, results: ConfirmedLabResult[], _age: number): Promise<LabAnalysis> {
    return analyzeConfirmedLabResults(reportId, results);
  }

  async generateMealPlan(reportId: string, results: ConfirmedLabResult[], age: number): Promise<MealPlan> {
    return makeMealPlan(reportId, results);
  }

  async generateExercisePlan(reportId: string, results: ConfirmedLabResult[], age: number): Promise<ExercisePlan> {
    return makeExercisePlan(reportId, results, age);
  }

  async answerChat(message: string, context: { profile?: { age: number; gender: string }; reportSummary?: string }): Promise<string> {
    const hasAbnormal = context.reportSummary ? context.reportSummary.includes('ngoài khoảng tham chiếu') : false;
    return (
      `Cảm ơn câu hỏi của bạn. ` +
      (context.reportSummary ? `Dựa trên kết quả xét nghiệm gần nhất: ${context.reportSummary} ` : '') +
      (hasAbnormal
        ? 'Một số chỉ số của bạn nằm ngoài khoảng tham chiếu, vì vậy nên ưu tiên chế độ ăn lành mạnh, vận động nhẹ nhàng và trao đổi với bác sĩ. '
        : '') +
      `Đây là thông tin hỗ trợ tham khảo và không thay thế chẩn đoán y tế. Nếu bạn muốn biết thêm về một chỉ số cụ thể, hãy cho tôi biết thêm.`
    );
  }
}

export function buildAnalysisBundle(
  reportId: string,
  results: ConfirmedLabResult[],
  age: number,
  provider: IAIProvider,
): Promise<AnalysisBundle> {
  const analysisPromise = provider.analyzeLabResults(reportId, results, age);
  const mealPromise = provider.generateMealPlan(reportId, results, age);
  const exercisePromise = provider.generateExercisePlan(reportId, results, age);
  return Promise.all([analysisPromise, mealPromise, exercisePromise]).then(([analysis, mealPlan, exercisePlan]) => ({
    analysis,
    mealPlan,
    exercisePlan,
  }));
}
