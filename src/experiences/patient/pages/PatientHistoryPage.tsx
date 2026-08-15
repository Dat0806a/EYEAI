import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { History, FileText, ArrowRight, Camera, Loader2 } from 'lucide-react';
import { getHistory } from '../../../services/patientService';
import { HistoryReport } from '../../../types/patient';

interface PatientHistoryPageProps {
  onBack: () => void;
  onOpenSettings?: () => void;
  onSelectReport: (reportId: string) => void;
  onNavigateScan: () => void;
}

export function PatientHistoryPage({
  onBack,
  onOpenSettings,
  onSelectReport,
  onNavigateScan,
}: PatientHistoryPageProps) {
  const [reports, setReports] = useState<HistoryReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHistory()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Lịch sử xét nghiệm" showBack onBack={onBack} onOpenSettings={onOpenSettings} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-5">
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Lịch sử kết quả</h3>
                <p className="text-xs font-bold text-slate-500">
                  Xem lại toàn bộ danh sách các lần quét xét nghiệm trước đây
                </p>
              </div>
            </div>

            <AppButton
              id="btn-scan-new"
              variant="primary"
              size="sm"
              onClick={onNavigateScan}
              icon={<Camera className="w-4 h-4" />}
            >
              <span>Quét mới</span>
            </AppButton>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-[#0E6C99] animate-spin" />
              <span className="text-xs font-black text-slate-600">Đang tải lịch sử xét nghiệm...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-3 bg-slate-50 rounded-[20px] border border-slate-200 p-6">
              <FileText className="w-12 h-12 text-slate-300" />
              <span className="font-black text-sm text-[#14213D]">Bạn chưa có lượt quét nào</span>
              <p className="text-xs font-bold text-slate-500">
                Hãy bắt đầu bằng việc tải ảnh hoặc chụp phiếu xét nghiệm đầu tiên.
              </p>
              <AppButton
                id="btn-start-first-scan"
                variant="primary"
                size="md"
                onClick={onNavigateScan}
              >
                <span>Quét OCR ngay</span>
              </AppButton>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectReport(r.id)}
                  className="p-4 rounded-[20px] border-2 border-slate-200 hover:border-[#0E6C99] bg-slate-50/80 hover:bg-sky-50/50 flex items-center justify-between text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-[#0E6C99]">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-black text-sm text-[#14213D]">Phiếu xét nghiệm</span>
                      <span className="text-xs font-bold text-slate-500">
                        {new Date(r.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-black text-[#0E6C99] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Chi tiết <ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
