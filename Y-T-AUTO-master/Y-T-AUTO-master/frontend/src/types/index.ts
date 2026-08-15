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
  referenceRange: ReferenceRange | null;
  ocrConfidence: number;
}

export interface OcrScanResponse {
  reportId: string;
  provider: string;
  results: OcrResultItem[];
}

export interface ConfirmedResult {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceRange?: ReferenceRange;
}

export interface AnalyzedResult {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
  status: LabStatus;
  explanation: string;
}

export interface LabAnalysis {
  reportId: string;
  overallSummary: string;
  results: AnalyzedResult[];
}

export interface MealPlanItemBase {
  mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DRINK';
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

export interface ExercisePlanItemBase {
  name: string;
  description: string;
  duration: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
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

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
}

export interface MeResponse {
  userId: string;
  hasProfile: boolean;
  profile: Profile | null;
  phone: PhoneAccountStatus;
}

export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';
export type AuthIntent = 'LOGIN' | 'REGISTER' | 'LINK';

export interface AuthSession {
  userId: string;
  token: string;
}

export interface OAuthSession extends AuthSession {
  intent: AuthIntent;
}

export interface PhoneOtpChallenge {
  challengeToken: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface PhoneAccountStatus {
  phoneVerified: boolean;
  maskedPhone: string | null;
}

export interface OAuthAuthorization {
  provider: OAuthProvider;
  authorizationUrl: string;
}

export interface HistoryReport {
  id: string;
  image_reference: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  source_type: 'CAMERA' | 'UPLOAD';
  created_at: string;
}

export interface PersistedLabResult {
  test_code: string;
  test_name: string;
  value: number;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  status: LabStatus;
  ocr_confidence: number;
  explanation: string;
}

export interface ReportDetail {
  id: string;
  overallSummary: string;
  results: PersistedLabResult[];
  mealPlan: MealPlan | null;
  exercisePlan: ExercisePlan | null;
}
