import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../../config';
import {
  ConfirmedLabResult,
  ExercisePlan,
  ExercisePlanItem,
  IAIProvider,
  LabAnalysis,
  MealPlan,
  MealPlanItem,
} from './types';
import { analyzeConfirmedLabResults } from './labAnalysis';

const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK'] as const;

const mealDraftItemSchema = z
  .object({
    mealType: z.enum(mealTypes),
    name: z.string().min(1),
    description: z.string().min(1),
    ingredients: z.string().min(1),
    preparation: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();

const mealDraftSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    items: z.array(mealDraftItemSchema).length(5),
  })
  .strict()
  .superRefine((draft, context) => {
    const received = new Set(draft.items.map((item) => item.mealType));
    if (received.size !== mealTypes.length || mealTypes.some((mealType) => !received.has(mealType))) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Mỗi loại bữa ăn phải xuất hiện đúng một lần.' });
    }
  });

const exerciseDraftItemSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    duration: z.number().int().positive().max(120),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    rationale: z.string().min(1),
  })
  .strict();

const exerciseDraftSchema = z
  .object({
    title: z.string().min(1),
    items: z.array(exerciseDraftItemSchema).min(2).max(3),
  })
  .strict();

/**
 * Gemini AI provider for medical explanations, meal plans, exercises, and chat.
 * Returns informational text only; never diagnoses or prescribes.
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'GEMINI';
  private genAI: GoogleGenerativeAI | null;

  constructor() {
    this.genAI = config.geminiApiKey ? new GoogleGenerativeAI(config.geminiApiKey) : null;
  }

  private async text(prompt: string, systemInstruction: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình cho AI provider.');
    }
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction,
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async analyzeLabResults(
    reportId: string,
    results: ConfirmedLabResult[],
    _age: number,
  ): Promise<LabAnalysis> {
    return analyzeConfirmedLabResults(reportId, results);
  }

  async generateMealPlan(
    reportId: string,
    results: { testCode: string; testName: string; value: number; unit: string }[],
    age: number,
  ): Promise<MealPlan> {
    const system =
      'Bạn là chuyên gia dinh dưỡng hỗ trợ. Gợi ý thực đơn là gợi ý hỗ trợ, không phải phác đồ điều trị. Không bịa link ảnh.';
    const prompt =
      `Hãy gợi ý thực đơn 1 ngày (sáng, trưa, tối, phụ, đồ uống) cho người ${age} tuổi dựa trên chỉ số: ` +
      JSON.stringify(results) +
      '. Trả về JSON dạng {"title":"...","description":"...","items":[{"mealType":"BREAKFAST|LUNCH|DINNER|SNACK|DRINK","name":"...","description":"...","ingredients":"...","preparation":"...","rationale":"..."}]}. Mỗi loại bữa ăn xuất hiện đúng một lần và không thêm trường ảnh.';
    const raw = await this.text(prompt, system);
    try {
      const parsed = mealDraftSchema.parse(JSON.parse(raw));
      return {
        reportId,
        title: parsed.title,
        description: parsed.description,
        items: parsed.items.map(
          (item): MealPlanItem => ({
            mealType: item.mealType,
            name: item.name,
            description: item.description,
            ingredients: item.ingredients,
            preparation: item.preparation,
            rationale: item.rationale,
            imageUrl: null,
            imageAlt: null,
            imageSourceUrl: null,
            imageLicense: null,
            imageAuthor: null,
            imageVerifiedAt: null,
          }),
        ),
      };
    } catch {
      throw new Error('AI trả về thực đơn không đúng định dạng.');
    }
  }

  async generateExercisePlan(
    reportId: string,
    results: { testCode: string; testName: string; value: number; unit: string }[],
    age: number,
  ): Promise<ExercisePlan> {
    const system =
      'Bạn là chuyên gia vận động. Chỉ gợi ý bài tập an toàn, không bịa link YouTube nếu chưa xác minh.';
    const prompt =
      `Hãy gợi ý 2-3 bài tập phù hợp người ${age} tuổi dựa trên chỉ số: ` +
      JSON.stringify(results) +
      '. Trả về JSON dạng {"title":"...","items":[{"name":"...","description":"...","duration":30,"difficulty":"EASY|MEDIUM|HARD","rationale":"..."}]}';
    const raw = await this.text(prompt, system);
    try {
      const parsed = exerciseDraftSchema.parse(JSON.parse(raw));
      return {
        reportId,
        title: parsed.title,
        items: parsed.items.map(
          (item): ExercisePlanItem => ({
            name: item.name,
            description: item.description,
            duration: item.duration,
            difficulty: item.difficulty,
            rationale: item.rationale,
            youtubeUrl: null,
            youtubeVideoId: null,
            youtubeTitle: null,
            youtubeAuthor: null,
            youtubeAuthorUrl: null,
            youtubeThumbnailUrl: null,
            youtubeVerified: false,
            youtubeSource: null,
            youtubeVerifiedAt: null,
          }),
        ),
      };
    } catch {
      throw new Error('AI trả về bài tập không đúng định dạng.');
    }
  }

  async answerChat(message: string, context: { profile?: { age: number; gender: string }; reportSummary?: string }): Promise<string> {
    const system =
      'Bạn là trợ lý sức khỏe thân thiện. Trả lời tiếng Việt dễ hiểu. ' +
      'KHÔNG chẩn đoán bệnh, KHÔNG kê thuốc, KHÔNG khẳng định khi thiếu thông tin. ' +
      'Luôn nhắc rằng đây là thông tin hỗ trợ và nên tham khảo bác sĩ khi cần.';
    const contextText = [
      context.profile ? `Người dùng ${context.profile.age} tuổi, giới tính ${context.profile.gender}.` : '',
      context.reportSummary ? `Tóm tắt kết quả xét nghiệm gần nhất: ${context.reportSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return this.text(`${contextText}\n\nCâu hỏi: ${message}`, system);
  }
}
