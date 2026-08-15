import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Utensils, Dumbbell } from 'lucide-react';
import type { AnalysisBundle, ExercisePlan, MealPlan, MealPlanItem } from '../types';
import { apiError, getReportDetail } from '../services/api';
import { Alert, Badge, Card, Spinner } from '../components/ui';
import { ChatWidget } from '../components/ChatWidget';
import { VerifiedMedia } from '../components/VerifiedMedia';
import { statusColor, statusLabel } from '../utils/status';

type Tab = 'analysis' | 'meal' | 'exercise';

const mealTypeLabels: Record<MealPlanItem['mealType'], string> = {
  BREAKFAST: 'Sáng',
  LUNCH: 'Trưa',
  DINNER: 'Tối',
  SNACK: 'Bữa phụ',
  DRINK: 'Đồ uống',
};

const difficultyLabels = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó' } as const;

export function AnalysisPage() {
  const { reportId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stateBundle = (location.state as { bundle?: AnalysisBundle } | null)?.bundle ?? null;
  const [bundle, setBundle] = useState<AnalysisBundle | null>(stateBundle);
  const [tab, setTab] = useState<Tab>('analysis');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!stateBundle);

  useEffect(() => {
    if (stateBundle) return;
    getReportDetail(reportId)
      .then((detail) => {
        const mealPlan: MealPlan = detail.mealPlan ?? {
          reportId,
          title: '',
          description: '',
          items: [],
        };
        const exercisePlan: ExercisePlan = detail.exercisePlan ?? {
          reportId,
          title: '',
          items: [],
        };
        const analysisResults = detail.results.map((r) => ({
          testCode: r.test_code,
          testName: r.test_name,
          value: r.value,
          unit: r.unit,
          referenceLow: r.reference_low,
          referenceHigh: r.reference_high,
          referenceText: r.reference_text,
          status: r.status,
          explanation: r.explanation,
        }));
        setBundle({
          analysis: { reportId, overallSummary: detail.overallSummary, results: analysisResults },
          mealPlan,
          exercisePlan,
        });
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, [reportId, stateBundle]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-soft-gray">
        <Spinner label="Đang tải kết quả..." />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen bg-soft-gray px-4 py-8">
        {error && <Alert>{error}</Alert>}
        <button onClick={() => navigate('/dashboard')} className="mt-3 text-sm font-semibold text-sky-blue hover:underline">
          ← Trở về Dashboard
        </button>
      </div>
    );
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'analysis', label: 'Kết quả & giải thích' },
    { key: 'meal', label: 'Thực đơn' },
    { key: 'exercise', label: 'Bài tập' },
  ];

  return (
    <div className="min-h-screen bg-soft-gray">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-sky-blue hover:underline">
          ← Trở về Dashboard
        </button>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Alert tone="info">
          Thông tin này chỉ mang tính tham khảo, không thay thế chẩn đoán hoặc điều trị y tế chính thức từ bác sĩ.
        </Alert>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`touch-target whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t.key ? 'bg-navy text-white' : 'border border-gray-200 bg-white text-navy'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'analysis' && (
          <div className="mt-4 space-y-4">
            {bundle.analysis.overallSummary && (
              <Card className="bg-gradient-to-br from-sky-blue/15 to-cream/70">
                <h2 className="text-lg font-bold text-navy">Tóm tắt kết quả</h2>
                <p className="mt-1 text-sm text-navy/80">{bundle.analysis.overallSummary}</p>
              </Card>
            )}
            {bundle.analysis.results.map((r, i) => (
              <Card key={`${r.testCode}-${i}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-navy">{r.testName}</h3>
                    <p className="text-xs text-gray-500">{r.testCode}</p>
                  </div>
                  <Badge className={statusColor(r.status)}>{statusLabel(r.status)}</Badge>
                </div>
                <p className="mt-2 text-sm text-navy">
                  <span className="font-bold">{r.value}</span> {r.unit}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.explanation}</p>
              </Card>
            ))}
          </div>
        )}

        {tab === 'meal' && (
          <div className="mt-4 space-y-4">
            <Card className="bg-cream/70">
              <div className="flex items-center gap-2">
                <Utensils className="h-5 w-5 text-coral" />
                <h2 className="font-bold text-navy">Gợi ý dinh dưỡng hỗ trợ</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">{bundle.mealPlan.description || bundle.mealPlan.title}</p>
            </Card>
            {bundle.mealPlan.items.map((item, i) => (
              <Card key={i}>
                <Badge className="border-sky-blue/40 bg-sky-blue/10 text-navy">{mealTypeLabels[item.mealType]}</Badge>
                <h3 className="mt-2 font-bold text-navy">{item.name}</h3>
                <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-navy">Nguyên liệu:</span> {item.ingredients}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-navy">Chế biến:</span> {item.preparation}
                </p>
                <p className="mt-2 rounded-xl bg-green-50 p-3 text-sm text-health-green">
                  <span className="font-semibold">Vì sao tốt cho bạn:</span> {item.rationale}
                </p>
                <VerifiedMedia kind="meal" item={item} />
              </Card>
            ))}
          </div>
        )}

        {tab === 'exercise' && (
          <div className="mt-4 space-y-4">
            <Card className="bg-cream/70">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-health-green" />
                <h2 className="font-bold text-navy">Gợi ý vận động hỗ trợ</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">{bundle.exercisePlan.title}</p>
            </Card>
            {bundle.exercisePlan.items.map((item, i) => (
              <Card key={i}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-navy">{item.name}</h3>
                  <div className="flex gap-2">
                    <Badge className="border-gray-200 bg-gray-50 text-gray-600">{item.duration} phút</Badge>
                    <Badge className="border-gray-200 bg-gray-50 text-gray-600">
                      {difficultyLabels[item.difficulty as keyof typeof difficultyLabels] ?? item.difficulty}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                <p className="mt-2 rounded-xl bg-green-50 p-3 text-sm text-health-green">
                  <span className="font-semibold">Vì sao tốt cho bạn:</span> {item.rationale}
                </p>
                <VerifiedMedia kind="exercise" item={item} />
              </Card>
            ))}
          </div>
        )}
      </main>
      <ChatWidget />
    </div>
  );
}
