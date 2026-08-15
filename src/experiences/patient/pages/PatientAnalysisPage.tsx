import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import {
  FileText,
  Utensils,
  Dumbbell,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { AnalysisBundle, MealPlanItem, ExercisePlanItem } from '../../../types/patient';
import { getReportDetail } from '../../../services/patientService';
import { VerifiedMedia } from '../components/VerifiedMedia';
import { PatientChatWidget } from '../components/PatientChatWidget';

interface PatientAnalysisPageProps {
  reportId: string;
  initialBundle?: AnalysisBundle | null;
  initialTab?: 'analysis' | 'meal' | 'exercise';
  onBack: () => void;
  onOpenSettings?: () => void;
}

const MEAL_TYPE_LABELS: Record<MealPlanItem['mealType'], string> = {
  BREAKFAST: 'Bữa sáng',
  LUNCH: 'Bữa trưa',
  DINNER: 'Bữa tối',
  SNACK: 'Bữa phụ',
  DRINK: 'Thức uống',
};

const DIFFICULTY_LABELS = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Thử thách',
};

export function PatientAnalysisPage({
  reportId,
  initialBundle,
  initialTab = 'analysis',
  onBack,
  onOpenSettings,
}: PatientAnalysisPageProps) {
  const [bundle, setBundle] = useState<AnalysisBundle | null>(initialBundle || null);
  const [tab, setTab] = useState<'analysis' | 'meal' | 'exercise'>(initialTab);
  const [loading, setLoading] = useState(!initialBundle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialBundle) return;
    setLoading(true);
    getReportDetail(reportId)
      .then((res) => {
        setBundle(res);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Không thể tải chi tiết phân tích.');
      })
      .finally(() => setLoading(false));
  }, [reportId, initialBundle]);

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader
        title="Giải thích & Gợi ý Y tế"
        showBack
        onBack={onBack}
        onOpenSettings={onOpenSettings}
      />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-5">
        {/* Disclaimer Warning Banner */}
        <div className="p-4 rounded-[22px] bg-amber-500/15 border-2 border-amber-500/30 text-amber-950 text-xs font-bold flex items-start gap-2.5 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-amber-900">Lưu ý quan trọng</span>
            <span>
              Thông tin giải thích và gợi ý thực đơn, vận động dưới đây chỉ mang tính chất hỗ trợ tham khảo, không thay thế chẩn đoán hoặc phác đồ điều trị y tế chính thức từ bác sĩ.
            </span>
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-[22px] bg-white border-2 border-[#14213D]/10 shadow-xs">
          <button
            onClick={() => setTab('analysis')}
            className={`py-2.5 px-2 rounded-2xl font-black text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
              tab === 'analysis'
                ? 'bg-[#0E6C99] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Kết quả</span>
          </button>

          <button
            onClick={() => setTab('meal')}
            className={`py-2.5 px-2 rounded-2xl font-black text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
              tab === 'meal'
                ? 'bg-[#0E6C99] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Thực đơn</span>
          </button>

          <button
            onClick={() => setTab('exercise')}
            className={`py-2.5 px-2 rounded-2xl font-black text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
              tab === 'exercise'
                ? 'bg-[#0E6C99] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Dumbbell className="w-4 h-4" />
            <span>Bài tập</span>
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-[#0E6C99] animate-spin" />
            <span className="font-black text-xs text-slate-600">Đang tổng hợp thông tin giải thích...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6 rounded-[28px] bg-white border-2 border-rose-200 text-center flex flex-col items-center gap-3">
            <AlertTriangle className="w-10 h-10 text-rose-600" />
            <span className="font-black text-sm text-rose-950">{error}</span>
            <AppButton id="btn-back-error" variant="secondary" size="sm" onClick={onBack}>
              <span>Trở về</span>
            </AppButton>
          </div>
        )}

        {/* TAB 1: KẾT QUẢ & GIẢI THÍCH */}
        {!loading && bundle && tab === 'analysis' && (
          <div className="flex flex-col gap-4">
            {/* Overall Summary Card */}
            {bundle.analysis.overallSummary && (
              <div className="p-5 rounded-[28px] bg-gradient-to-br from-sky-50 to-indigo-50 border-2 border-sky-200/80 shadow-xs flex flex-col gap-2">
                <h3 className="font-black text-sm text-[#14213D] flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#0E6C99]" />
                  <span>Tóm tắt tổng quan</span>
                </h3>
                <p className="text-xs font-bold text-slate-700 leading-relaxed">
                  {bundle.analysis.overallSummary}
                </p>
              </div>
            )}

            {/* List of Analyzed Results */}
            {bundle.analysis.results.map((res, idx) => (
              <div
                key={idx}
                className="bg-white rounded-[24px] p-5 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <h4 className="font-black text-base text-[#14213D]">{res.testName}</h4>
                    <span className="text-[11px] font-bold text-slate-500">{res.testCode}</span>
                  </div>

                  <StatusBadge
                    label={
                      res.status === 'LOW'
                        ? 'Thấp'
                        : res.status === 'HIGH'
                        ? 'Cao'
                        : res.status === 'NORMAL'
                        ? 'Bình thường'
                        : 'Cần kiểm tra'
                    }
                    status={
                      res.status === 'LOW' || res.status === 'HIGH'
                        ? 'error'
                        : res.status === 'NORMAL'
                        ? 'active'
                        : 'idle'
                    }
                  />
                </div>

                <div className="flex items-center gap-2 font-black text-sm text-[#14213D]">
                  <span className="text-lg text-[#0E6C99] font-black">{res.value}</span>
                  <span>{res.unit}</span>
                  {res.referenceText && (
                    <span className="text-xs font-bold text-slate-500 ml-auto">
                      (Chuẩn: {res.referenceText})
                    </span>
                  )}
                </div>

                <p className="text-xs font-bold text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  {res.explanation}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: THỰC ĐƠN GỢI Ý */}
        {!loading && bundle && tab === 'meal' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-[24px] bg-amber-50 border border-amber-200 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                <Utensils className="w-5 h-5 text-amber-700" />
                <span>{bundle.mealPlan.title}</span>
              </div>
              <p className="text-xs font-bold text-amber-900 leading-relaxed">
                {bundle.mealPlan.description}
              </p>
            </div>

            {bundle.mealPlan.items.map((meal, idx) => (
              <div
                key={idx}
                className="bg-white rounded-[24px] p-5 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-sky-100 text-[#0E6C99] font-black text-xs">
                    {MEAL_TYPE_LABELS[meal.mealType]}
                  </span>
                </div>

                <h4 className="font-black text-base text-[#14213D]">{meal.name}</h4>
                <p className="text-xs font-bold text-slate-600">{meal.description}</p>

                <div className="flex flex-col gap-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="font-black text-[#14213D]">Nguyên liệu:</span>{' '}
                    <span>{meal.ingredients}</span>
                  </div>
                  <div>
                    <span className="font-black text-[#14213D]">Cách chế biến:</span>{' '}
                    <span>{meal.preparation}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950">
                  <span className="font-black text-emerald-800">Lợi ích sức khỏe:</span>{' '}
                  <span>{meal.rationale}</span>
                </div>

                <VerifiedMedia kind="meal" item={meal} />
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: BÀI TẬP VẬN ĐỘNG */}
        {!loading && bundle && tab === 'exercise' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-[24px] bg-emerald-50 border border-emerald-200 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                <Dumbbell className="w-5 h-5 text-emerald-700" />
                <span>{bundle.exercisePlan.title}</span>
              </div>
              <p className="text-xs font-bold text-emerald-900 leading-relaxed">
                Vận động nhẹ nhàng thường xuyên giúp cải thiện tuần hoàn và hỗ trợ hồi phục thể trạng.
              </p>
            </div>

            {bundle.exercisePlan.items.map((ex, idx) => (
              <div
                key={idx}
                className="bg-white rounded-[24px] p-5 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-black text-base text-[#14213D]">{ex.name}</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black text-[11px]">
                      {ex.duration} phút
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-[#0E6C99] font-black text-[11px]">
                      {DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}
                    </span>
                  </div>
                </div>

                <p className="text-xs font-bold text-slate-600">{ex.description}</p>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950">
                  <span className="font-black text-emerald-800">Lý do khuyên dùng:</span>{' '}
                  <span>{ex.rationale}</span>
                </div>

                <VerifiedMedia kind="exercise" item={ex} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Chatbot Widget with context summary */}
      <PatientChatWidget reportSummary={bundle?.analysis?.overallSummary} />
    </div>
  );
}
