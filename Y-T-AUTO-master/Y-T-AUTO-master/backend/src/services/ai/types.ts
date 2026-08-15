export type LabStatus = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export interface ConfirmedLabResult {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
}

export interface AnalyzedLabResult extends ConfirmedLabResult {
  status: LabStatus;
  explanation: string;
}

export interface LabAnalysis {
  reportId: string;
  overallSummary: string;
  results: AnalyzedLabResult[];
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DRINK';

export interface MealPlanItemBase {
  mealType: MealType;
  name: string;
  description: string;
  ingredients: string;
  preparation: string;
  rationale: string;
}

export interface VerifiedMealImageFields {
  imageUrl: string;
  imageAlt: string;
  imageSourceUrl: string;
  imageLicense: string;
  imageAuthor: string;
  imageVerifiedAt: string;
}

export interface UnverifiedMealImageFields {
  imageUrl: null;
  imageAlt: null;
  imageSourceUrl: null;
  imageLicense: null;
  imageAuthor: null;
  imageVerifiedAt: null;
}

export type MealPlanItem = MealPlanItemBase & (VerifiedMealImageFields | UnverifiedMealImageFields);

export interface MealPlan {
  reportId: string;
  title: string;
  description: string;
  items: MealPlanItem[];
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ExercisePlanItemBase {
  name: string;
  description: string;
  duration: number;
  difficulty: Difficulty;
  rationale: string;
}

export interface VerifiedExerciseYoutubeFields {
  youtubeUrl: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeAuthor: string;
  youtubeAuthorUrl: string;
  youtubeThumbnailUrl: string;
  youtubeVerified: true;
  youtubeSource: 'YouTube oEmbed';
  youtubeVerifiedAt: string;
}

export interface UnverifiedExerciseYoutubeFields {
  youtubeUrl: null;
  youtubeVideoId: null;
  youtubeTitle: null;
  youtubeAuthor: null;
  youtubeAuthorUrl: null;
  youtubeThumbnailUrl: null;
  youtubeVerified: false;
  youtubeSource: null;
  youtubeVerifiedAt: null;
}

export type ExercisePlanItem = ExercisePlanItemBase &
  (VerifiedExerciseYoutubeFields | UnverifiedExerciseYoutubeFields);

export interface ExercisePlan {
  reportId: string;
  title: string;
  items: ExercisePlanItem[];
}

export interface AnalysisBundle {
  analysis: LabAnalysis;
  mealPlan: MealPlan;
  exercisePlan: ExercisePlan;
}

export interface IAIProvider {
  readonly name: string;
  analyzeLabResults(reportId: string, results: ConfirmedLabResult[], age: number): Promise<LabAnalysis>;
  generateMealPlan(reportId: string, results: ConfirmedLabResult[], age: number): Promise<MealPlan>;
  generateExercisePlan(reportId: string, results: ConfirmedLabResult[], age: number): Promise<ExercisePlan>;
  answerChat(message: string, context: { profile?: { age: number; gender: string }; reportSummary?: string }): Promise<string>;
}
