export type LabStatus = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export interface ReferenceRange {
  low: number | null;
  high: number | null;
  text: string | null;
}

export interface OcrResultItem {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceRange: ReferenceRange;
  ocrConfidence: number;
}

export interface OcrScanResponse {
  reportId: string;
  provider: string;
  results: OcrResultItem[];
}

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

export interface MealPlanItem {
  mealType: MealType;
  name: string;
  description: string;
  ingredients: string;
  preparation: string;
  rationale: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageSourceUrl?: string | null;
  imageLicense?: string | null;
  imageAuthor?: string | null;
}

export interface MealPlan {
  reportId: string;
  title: string;
  description: string;
  items: MealPlanItem[];
}

export type ExerciseDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ExercisePlanItem {
  name: string;
  description: string;
  duration: number;
  difficulty: ExerciseDifficulty;
  rationale: string;
  youtubeUrl?: string | null;
  youtubeVideoId?: string | null;
  youtubeTitle?: string | null;
  youtubeAuthor?: string | null;
  youtubeAuthorUrl?: string | null;
  youtubeThumbnailUrl?: string | null;
  youtubeVerified?: boolean;
}

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

export interface HistoryReport {
  id: string;
  user_id?: string;
  created_at: string;
  status: string;
  source_type: string;
  results_count?: number;
}

export interface PatientChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
