export type LabStatus = 'LOW' | 'NORMAL' | 'HIGH' | 'ABNORMAL' | 'UNCERTAIN' | 'UNKNOWN';
export type ValueType = 'NUMERIC' | 'QUALITATIVE';
export type OcrDocumentStatus = 'VALID' | 'UNKNOWN';

export interface ReferenceRange {
  low: number | null;
  high: number | null;
  text: string | null;
}

export interface OcrResultItem {
  testCode: string;
  testName: string;
  value: number | string;
  valueType?: ValueType;
  unit: string;
  referenceRange: ReferenceRange;
  ocrConfidence: number;
  isUncertain?: boolean;
  flag?: LabStatus;
  note?: string | null;
}

export interface OcrScanResponse {
  reportId: string;
  provider: string;
  documentStatus?: OcrDocumentStatus;
  isValidMedicalDocument?: boolean;
  detectedSubject?: string | null;
  results: OcrResultItem[];
  hospitalOrLabName?: string | null;
  patientName?: string | null;
  sampleDate?: string | null;
}

export interface ConfirmedLabResult {
  testCode: string;
  testName: string;
  value: number | string;
  valueType?: ValueType;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
  isUncertain?: boolean;
  note?: string | null;
}

export interface AnalyzedLabResult extends ConfirmedLabResult {
  status: LabStatus;
  explanation: string;
  sourceCitation?: string;
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
  imageProvider?: string | null;
  imageSearchQuery?: string | null;
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
  videoProvider?: string | null;
  videoSearchQuery?: string | null;
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
