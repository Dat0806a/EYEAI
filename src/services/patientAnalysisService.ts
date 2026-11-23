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

export function classifyResult(result: ConfirmedLabResult): LabStatus {
  if (result.valueType === 'QUALITATIVE' || typeof result.value === 'string') {
    const str = String(result.value).toLowerCase();
    if (str.includes('dương tính') || str.includes('positive') || str.includes('bất thường')) {
      return 'ABNORMAL';
    }
    if (str.includes('âm tính') || str.includes('negative') || str.includes('bình thường') || str.includes('không tìm thấy')) {
      return 'NORMAL';
    }
    return 'UNKNOWN';
  }

  const num = Number(result.value);
  if (!Number.isFinite(num)) return 'UNKNOWN';

  const low = result.referenceLow;
  const high = result.referenceHigh;

  if (low === null && high === null) return 'UNKNOWN';
  if (low !== null && num < low) return 'LOW';
  if (high !== null && num > high) return 'HIGH';
  return 'NORMAL';
}

function explainResult(result: ConfirmedLabResult, status: LabStatus): { explanation: string; sourceCitation: string } {
  const rangeStr = result.referenceText
    ? `khoảng tham chiếu ghi trên phiếu: ${result.referenceText}`
    : 'không có khoảng tham chiếu ghi trên phiếu';

  const valStr = `${result.value} ${result.unit}`.trim();
  const base = `Chỉ số ${result.testName} (${result.testCode}) ghi nhận ${valStr} (${rangeStr}). `;

  let citation = 'Hướng dẫn Thực hành Xét nghiệm Lâm sàng - Bộ Y tế Việt Nam';
  const code = (result.testCode || '').toUpperCase();
  const name = (result.testName || '').toLowerCase();

  if (['GLUCOSE', 'HBA1C'].includes(code) || name.includes('đường') || name.includes('glucose') || name.includes('hba1c')) {
    citation = 'Hướng dẫn Chẩn đoán & Điều trị Đái tháo đường - Bộ Y tế / ADA';
  } else if (['CHOLESTEROL', 'TRIGLYCERIDE', 'LDL', 'HDL'].includes(code) || name.includes('cholesterol') || name.includes('triglycerid') || name.includes('mỡ máu')) {
    citation = 'Khuyến cáo Hội Tim mạch học Quốc gia Việt Nam (VNHA)';
  } else if (['ALT', 'AST', 'GGT', 'BILIRUBIN', 'BILIRUBIN_TP'].includes(code) || name.includes('men gan') || name.includes('gan') || name.includes('bilirubin')) {
    citation = 'Hướng dẫn Đánh giá Chức năng Gan - Hội Gan Mật Việt Nam';
  } else if (['CREATININE', 'UREA', 'BUN', 'URIC', 'URIC_ACID'].includes(code) || name.includes('creatinin') || name.includes('ure') || name.includes('uric') || name.includes('thận')) {
    citation = 'Khuyến cáo Đánh giá Chức năng Thận & Chuyển hóa - KDIGO / Bộ Y tế';
  } else if (['WBC', 'RBC', 'HGB', 'HCT', 'PLT', 'NEUT', 'LYMPH', 'MCV', 'MCH'].includes(code) || name.includes('bạch cầu') || name.includes('hồng cầu') || name.includes('tiểu cầu') || name.includes('huyết sắc tố')) {
    citation = 'Trị số Huyết học Lâm sàng Thường quy - Viện Huyết học Truyền máu Trung ương';
  } else if (name.includes('tuyến giáp') || ['TSH', 'FT3', 'FT4', 'T3', 'T4'].includes(code)) {
    citation = 'Khuyến cáo Bệnh lý Tuyến giáp - Hội Nội tiết & Đái tháo đường Việt Nam (VADE)';
  } else if (name.includes('điện giải') || ['NA', 'K', 'CL', 'CALCIUM', 'CA'].includes(code)) {
    citation = 'Hướng dẫn Cân bằng Nước & Điện giải Lâm sàng - Bộ Y tế';
  } else if (name.includes('nước tiểu') || code.startsWith('U_') || code.includes('URINE')) {
    citation = 'Hướng dẫn Phân tích Nước tiểu Thường quy - Bộ Y tế Việt Nam';
  } else if (name.includes('viêm') || ['CRP', 'ESR', 'PROCALCITONIN'].includes(code)) {
    citation = 'Hướng dẫn Đánh giá Các Chỉ số Viêm Lâm sàng - Bộ Y tế';
  }

  switch (status) {
    case 'NORMAL':
      return {
        explanation: base + 'Kết quả nằm trong giới hạn sinh lý bình thường theo mẫu phiếu này.',
        sourceCitation: citation,
      };
    case 'LOW':
      return {
        explanation: base + 'Chỉ số thấp hơn khoảng tham chiếu trên phiếu. Đây là thông tin tham khảo, bạn nên theo dõi triệu chứng và tham khảo ý kiến bác sĩ điều trị.',
        sourceCitation: citation,
      };
    case 'HIGH':
      return {
        explanation: base + 'Chỉ số cao hơn khoảng tham chiếu trên phiếu. Cần lưu ý chế độ ăn uống, sinh hoạt và tái khám hoặc trao đổi với bác sĩ nếu cần.',
        sourceCitation: citation,
      };
    case 'ABNORMAL':
      return {
        explanation: base + 'Kết quả định tính bất thường. Vui lòng mang phiếu xét nghiệm gặp bác sĩ chuyên khoa để được tư vấn chính xác.',
        sourceCitation: citation,
      };
    case 'UNCERTAIN':
      return {
        explanation: base + 'Số liệu nhận diện có dấu hiệu chưa rõ nét. Vui lòng đối chiếu với phiếu gốc trước khi sử dụng thông tin này.',
        sourceCitation: 'Phiếu kết quả xét nghiệm gốc của bệnh nhân',
      };
    default:
      return {
        explanation: base + 'Phiếu xét nghiệm không ghi khoảng tham chiếu cụ thể để phân loại. Vui lòng hỏi ý kiến bác sĩ chỉ định.',
        sourceCitation: 'Phiếu xét nghiệm lâm sàng',
      };
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
    const status = result.isUncertain ? 'UNCERTAIN' : classifyResult(result);
    const { explanation, sourceCitation } = explainResult(result, status);
    return {
      ...result,
      status,
      explanation,
      sourceCitation,
    };
  });

  const abnormal = analyzed.filter((r) => r.status === 'LOW' || r.status === 'HIGH' || r.status === 'ABNORMAL');
  const uncertain = analyzed.filter((r) => r.status === 'UNCERTAIN');
  const unknown = analyzed.filter((r) => r.status === 'UNKNOWN');

  const disclaimer = 'Mọi thông tin nhận xét và gợi ý chỉ mang tính chất tham khảo, không thay thế chẩn đoán hay phác đồ của bác sĩ.';

  const sections: string[] = [];
  if (abnormal.length > 0) {
    sections.push(
      `Có ${abnormal.length} chỉ số ngoài khoảng tham chiếu cần lưu ý: ${abnormal
        .map((r) => `${r.testName} (${r.testCode})`)
        .join(', ')}.`
    );
  }
  if (uncertain.length > 0) {
    sections.push(
      `Có ${uncertain.length} chỉ số mờ hoặc nghi ngờ cần bạn rà soát lại đối chiếu phiếu gốc: ${uncertain
        .map((r) => `${r.testName} (${r.testCode})`)
        .join(', ')}.`
    );
  }
  if (unknown.length > 0) {
    sections.push(
      `Có ${unknown.length} chỉ số chưa đủ thông tin khoảng tham chiếu in trên phiếu để so sánh: ${unknown
        .map((r) => `${r.testName} (${r.testCode})`)
        .join(', ')}.`
    );
  }

  const overallSummary =
    sections.length === 0
      ? `Toàn bộ ${analyzed.length} chỉ số xét nghiệm đều nằm trong khoảng tham chiếu được in trên phiếu. ${disclaimer}`
      : `${sections.join(' ')} ${disclaimer}`;

  return { reportId, overallSummary, results: analyzed };
}

export function generateMealPlan(reportId: string, results: ConfirmedLabResult[]): MealPlan {
  const analyzed = generateLabAnalysis(reportId, results).results;
  const abnormal = analyzed.filter((r) => r.status === 'LOW' || r.status === 'HIGH' || r.status === 'ABNORMAL');
  
  const lowRbc = analyzed.find((r) => (r.testCode === 'RBC' || r.testCode === 'HGB' || r.testName.toLowerCase().includes('hồng cầu')) && r.status === 'LOW');
  const highGlucose = analyzed.find((r) => (r.testCode === 'GLUCOSE' || r.testCode === 'HBA1C' || r.testName.toLowerCase().includes('đường')) && r.status === 'HIGH');
  const highLipid = analyzed.find(
    (r) => (['CHOLESTEROL', 'TRIGLYCERIDE', 'LDL'].includes(r.testCode) || r.testName.toLowerCase().includes('cholesterol') || r.testName.toLowerCase().includes('mỡ')) && r.status === 'HIGH'
  );
  const highUric = analyzed.find((r) => (['URIC', 'URIC_ACID'].includes(r.testCode) || r.testName.toLowerCase().includes('uric')) && r.status === 'HIGH');
  const highLiver = analyzed.find((r) => (['ALT', 'AST', 'GGT', 'SGPT', 'SGOT'].includes(r.testCode) || r.testName.toLowerCase().includes('men gan')) && r.status === 'HIGH');
  const highKidney = analyzed.find((r) => (['CREATININE', 'UREA', 'BUN'].includes(r.testCode) || r.testName.toLowerCase().includes('creatinin')) && r.status === 'HIGH');

  let dietRationale = 'Thực đơn bốn nhóm dưỡng chất lành mạnh, hạn chế gia vị cay nóng, tăng cường rau củ quả tươi.';
  let planTitle = 'Thực đơn dinh dưỡng duy trì thể trạng tối ưu';

  if (abnormal.length > 0) {
    const focusNames = abnormal.slice(0, 3).map((r) => `${r.testName} (${r.value} ${r.unit})`).join(', ');
    planTitle = `Thực đơn dinh dưỡng cá nhân hóa hỗ trợ: ${abnormal.slice(0, 2).map((r) => r.testName).join(', ')}`;

    const hints: string[] = [];
    if (highGlucose) hints.push(`kiểm soát đường huyết (${highGlucose.testName} ${highGlucose.value} ${highGlucose.unit}) qua tinh bột hấp thu chậm`);
    if (highLipid) hints.push(`giảm mỡ bão hòa và nội tạng để cân bằng mỡ máu (${highLipid.testName} ${highLipid.value} ${highLipid.unit})`);
    if (highUric) hints.push(`kiềm hóa khẩu phần, giảm purin hỗ trợ đào thải acid uric (${highUric.testName} ${highUric.value} ${highUric.unit})`);
    if (highLiver) hints.push(`chế biến hấp luộc thanh đạm để giảm áp lực chuyển hóa cho tế bào gan (${highLiver.testName} ${highLiver.value} ${highLiver.unit})`);
    if (highKidney) hints.push(`kiểm soát lượng muối và đạm động vật vừa phải cho chức năng lọc (${highKidney.testName} ${highKidney.value} ${highKidney.unit})`);
    if (lowRbc) hints.push(`bổ sung nguyên liệu giàu sắt và folate tự nhiên (${lowRbc.testName} ${lowRbc.value} ${lowRbc.unit})`);

    if (hints.length > 0) {
      dietRationale = `Thực đơn được tối ưu hóa cho các chỉ số ghi nhận ngoài tham chiếu (${focusNames}), tập trung ${hints.join('; ')}.`;
    } else {
      dietRationale = `Khẩu phần ăn được điều chỉnh nhạt và giàu chất xơ tự nhiên nhằm hỗ trợ các chỉ số cần lưu ý (${focusNames}).`;
    }
  }

  const breakfastRationale = lowRbc
    ? `Bổ sung protein và sắt tự nhiên hỗ trợ cải thiện ${lowRbc.testName} (${lowRbc.value} ${lowRbc.unit}).`
    : highGlucose
    ? `Tinh bột nguyên cám giúp giải phóng năng lượng từ từ, ổn định ${highGlucose.testName} (${highGlucose.value} ${highGlucose.unit}).`
    : 'Cung cấp năng lượng khởi đầu ngày mới cân đối, no lâu và dễ hấp thu.';

  const lunchRationale = highLipid || highGlucose
    ? `Cá giàu axit béo omega-3 và rau luộc hỗ trợ cải thiện ${highLipid?.testName || highGlucose?.testName || 'chuyển hóa'}.`
    : highLiver
    ? `Món hấp thanh nhẹ, ít dầu mỡ giúp giảm tải công suất lọc của gan.`
    : 'Bữa trưa đầy đủ đạm lành mạnh và vi chất, nhẹ nhàng cho đường tiêu hóa.';

  const dinnerRationale = highKidney || highUric
    ? `Canh thanh đạm giàu nước hỗ trợ bài tiết qua thận (${highKidney?.testName || highUric?.testName || 'thận'}).`
    : 'Bữa tối nhẹ bụng, nhiều chất xơ giúp cơ thể nghỉ ngơi và phục hồi ban đêm.';

  const snackRationale = highGlucose
    ? 'Hạt dinh dưỡng và trái cây ít ngọt giúp tránh hạ đường huyết mà không gây tăng vọt đường sau ăn.'
    : 'Cung cấp vitamin và chất chống oxy hóa tự nhiên giữa các bữa chính.';

  const drinkRationale = highUric || highKidney
    ? `Uống đủ nước lọc giúp tăng độ hòa tan và đào thải qua đường tiết niệu.`
    : 'Duy trì đủ lượng nước sinh lý 1.5 - 2 lít/ngày hỗ trợ tuần hoàn toàn thân.';

  const items: MealPlanItem[] = [
    {
      mealType: 'BREAKFAST',
      name: lowRbc ? 'Phở bò tái nạc rau thơm' : 'Bánh mì nguyên cám, trứng áp chảo và dưa leo',
      description: lowRbc
        ? 'Bữa sáng ấm nóng kết hợp bánh phở tươi, thịt bò nạc giàu sắt và rau thơm giá đỗ.'
        : 'Bánh mì nguyên cám ăn kèm trứng ốp la ít dầu và rau củ quả tươi giòn.',
      ingredients: lowRbc
        ? 'Bánh phở, thịt bò thăn nạc, hành lá, rau thơm, giá đỗ và nước hầm nêm nhạt'
        : 'Bánh mì nguyên cám 2 lát, 1 quả trứng gà, cà chua bi, xà lách và dưa chuột',
      preparation: lowRbc
        ? 'Trần bánh phở và thịt bò chín tới, chan nước dùng nóng ít béo, ăn kèm rau thơm sạch.'
        : 'Áp chảo trứng với 1 thìa nhỏ dầu thực vật, kẹp cùng bánh mì nướng và rau tươi.',
      rationale: breakfastRationale,
      ...VERIFIED_FOOD_IMAGES[lowRbc ? 'beef-noodle-breakfast' : 'egg-toast-breakfast'],
    },
    {
      mealType: 'LUNCH',
      name: 'Cơm gạo lứt, cá phi lê hấp gừng hành và rau xanh',
      description: 'Bữa trưa giàu đạm cá dễ hấp thu, tinh bột phức và chất xơ hòa tan thanh nhẹ.',
      ingredients: '1 chén cơm gạo lứt, 150g cá tươi phi lê (cá hồi/cá lóc/cá diêu hồng), gừng, hành, rau cải luộc',
      preparation: 'Ướp cá với gừng thái chỉ và hành lá rồi hấp cách thủy 12 phút. Luộc chín tới rau cải chấm nhẹ.',
      rationale: lunchRationale,
      ...VERIFIED_FOOD_IMAGES['fish-rice-lunch'],
    },
    {
      mealType: 'DINNER',
      name: 'Canh rau củ đậu hũ non nấm hương thanh đạm',
      description: 'Bữa tối ấm nóng, nhẹ bụng, dồi dào khoáng chất và đạm thực vật thực dưỡng.',
      ingredients: 'Bí xanh hoặc cà rốt, nấm tươi, 1 miếng đậu hũ non, hành ngò và gia vị giảm muối',
      preparation: 'Nấu chín mềm rau củ ngọt nước, cho nấm và đậu hũ non cắt miếng vào sau cùng rồi tắt bếp.',
      rationale: dinnerRationale,
      ...VERIFIED_FOOD_IMAGES['vegetable-soup-dinner'],
    },
    {
      mealType: 'SNACK',
      name: 'Táo tươi giòn và hạt hạnh nhân nguyên vị',
      description: 'Bữa xế chiều cung cấp chất béo không bão hòa và vi chất chống oxy hóa.',
      ingredients: '1/2 quả táo tươi hoặc ổi giòn, 8-10 hạt hạnh nhân hoặc óc chó không ướp muối',
      preparation: 'Rửa sạch hoa quả, cắt miếng vừa ăn và dùng trực tiếp cùng hạt dinh dưỡng.',
      rationale: snackRationale,
      ...VERIFIED_FOOD_IMAGES['fruit-nuts-snack'],
    },
    {
      mealType: 'DRINK',
      name: 'Nước lọc tinh khiết và trà xanh ấm loãng',
      description: 'Cung cấp đủ nước tuần hoàn và chất chống oxy hóa EGCG tự nhiên.',
      ingredients: 'Nước lọc ấm, lá trà xanh tươi hoặc túi trà thảo mộc không đường',
      preparation: 'Hãm trà bằng nước nóng 80°C loãng vừa phải, uống ấm rải đều trong ngày.',
      rationale: drinkRationale,
      ...VERIFIED_FOOD_IMAGES['green-tea-drink'],
    },
  ];

  return {
    reportId,
    title: planTitle,
    description: `${dietRationale} (Lưu ý: Thực đơn gợi ý hỗ trợ cải thiện sinh hoạt, không thay thế chế độ ăn bệnh lý đặc thù do bác sĩ chuyên khoa chỉ định).`,
    items,
  };
}

export function generateExercisePlan(
  reportId: string,
  results: ConfirmedLabResult[] = [],
  age: number = 35
): ExercisePlan {
  const isSenior = age >= 60;
  const analyzed = generateLabAnalysis(reportId, results).results;
  const highGlucoseOrLipid = analyzed.some((r) =>
    (['GLUCOSE', 'HBA1C', 'CHOLESTEROL', 'TRIGLYCERIDE', 'LDL'].includes(r.testCode) ||
      r.testName.toLowerCase().includes('đường') ||
      r.testName.toLowerCase().includes('mỡ')) &&
    r.status === 'HIGH'
  );
  const highUric = analyzed.some((r) =>
    (['URIC', 'URIC_ACID'].includes(r.testCode) || r.testName.toLowerCase().includes('uric')) && r.status === 'HIGH'
  );
  const lowRbc = analyzed.some((r) =>
    (['RBC', 'HGB'].includes(r.testCode) || r.testName.toLowerCase().includes('hồng cầu')) && r.status === 'LOW'
  );

  let planTitle = 'Kế hoạch vận động thể chất an toàn';
  if (highGlucoseOrLipid) {
    planTitle = 'Vận động nhịp điệu hỗ trợ chuyển hóa & tuần hoàn';
  } else if (highUric) {
    planTitle = 'Bài tập kéo giãn nhẹ nhàng bảo vệ khớp xương';
  } else if (lowRbc) {
    planTitle = 'Vận động hít thở điều hòa nhẹ nhàng phục hồi sức bền';
  }

  const duration1 = isSenior || lowRbc ? 15 : highGlucoseOrLipid ? 30 : 25;
  const duration2 = isSenior ? 15 : 20;

  const rationale1 = highGlucoseOrLipid
    ? 'Đi bộ nhịp nhàng giúp cơ bắp tăng tiêu thụ glucose và cải thiện lưu thông máu, hỗ trợ chỉ số đường và mỡ máu.'
    : highUric
    ? 'Đi bộ trên mặt phẳng nhịp nhàng giúp tuần hoàn dịch khớp mà không gây áp lực va đập mạnh lên các ổ khớp.'
    : lowRbc
    ? 'Vận động hiếu khí mức độ nhẹ nhàng vừa sức giúp tăng lượng oxy đến các mô mà không gây kiệt sức.'
    : 'Tăng cường tuần hoàn máu, hỗ trợ tim mạch và duy trì vận động khớp an toàn.';

  const rationale2 = highUric
    ? 'Các động tác kéo giãn mềm mại giải phóng áp lực quanh khớp gối và cổ chân, hỗ trợ độ linh hoạt.'
    : isSenior
    ? 'Các động tác xoay khớp an toàn trên ghế vững chãi, không lo mất thăng bằng.'
    : 'Cải thiện độ dẻo dai cơ bắp, điều hòa nhịp thở và giải tỏa căng thẳng thần kinh.';

  const items: ExercisePlanItem[] = [
    {
      name: isSenior || lowRbc ? 'Đi bộ thư giãn cự ly ngắn' : 'Đi bộ nhịp điệu tại nhà (Walk at Home)',
      description: 'Đi bộ trên bề mặt bằng phẳng với tốc độ vừa phải, đánh tay tự nhiên và giữ nhịp thở đều.',
      duration: duration1,
      difficulty: 'EASY',
      rationale: rationale1,
      youtubeUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].youtubeUrl,
      youtubeVideoId: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].videoId,
      youtubeTitle: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].title,
      youtubeAuthor: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].authorName,
      youtubeAuthorUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].authorUrl,
      youtubeThumbnailUrl: VERIFIED_EXERCISE_VIDEOS['walk-at-home'].thumbnailUrl,
      youtubeVerified: true,
    },
    {
      name: isSenior || highUric ? 'Yoga ghế nhẹ nhàng bảo vệ khớp' : 'Yoga kéo giãn cơ bản phục hồi',
      description: isSenior || highUric
        ? 'Các động tác xoay khớp cổ tay, cổ chân và kéo giãn thân trên khi ngồi vững trên ghế, an toàn tuyệt đối.'
        : 'Bài tập hít thở sâu và kéo giãn cơ thể nhẹ nhàng, giải phóng ứ trệ cơ bắp.',
      duration: duration2,
      difficulty: 'EASY',
      rationale: rationale2,
      youtubeUrl: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].youtubeUrl,
      youtubeVideoId: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].videoId,
      youtubeTitle: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].title,
      youtubeAuthor: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].authorName,
      youtubeAuthorUrl: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].authorUrl,
      youtubeThumbnailUrl: VERIFIED_EXERCISE_VIDEOS[isSenior || highUric ? 'chair-yoga' : 'beginner-yoga'].thumbnailUrl,
      youtubeVerified: true,
    },
  ];

  return { reportId, title: planTitle, items };
}

export function buildCompleteBundle(
  reportId: string,
  results: ConfirmedLabResult[],
  age: number = 35
): AnalysisBundle {
  return {
    analysis: generateLabAnalysis(reportId, results),
    mealPlan: generateMealPlan(reportId, results),
    exercisePlan: generateExercisePlan(reportId, results, age),
  };
}
