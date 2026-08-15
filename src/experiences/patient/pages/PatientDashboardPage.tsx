import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { useAuth } from '../../../hooks/useAuth';
import {
  ScanLine,
  Camera,
  History,
  Utensils,
  HeartPulse,
  Settings,
  ArrowRight,
  FileText,
  Sparkles,
} from 'lucide-react';
import { PatientChatWidget } from '../components/PatientChatWidget';
import { getHistory } from '../../../services/patientService';
import { HistoryReport } from '../../../types/patient';

interface PatientDashboardPageProps {
  onNavigate: (route: string, params?: Record<string, string>) => void;
}

export function PatientDashboardPage({ onNavigate }: PatientDashboardPageProps) {
  const { profile, user } = useAuth();
  const [recentReports, setRecentReports] = useState<HistoryReport[]>([]);

  useEffect(() => {
    getHistory().then((data) => {
      setRecentReports(data.slice(0, 3));
    });
  }, []);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Bệnh nhân';

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      {/* Header */}
      <PageHeader
        title="Trang chủ Bệnh nhân"
        onOpenSettings={() => onNavigate('settings')}
      />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {/* Welcome Greeting Banner */}
        <div className="p-6 rounded-[28px] bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-indigo-500/15 border-2 border-[#0E6C99]/20 shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-[#0E6C99] text-white font-black text-xs uppercase tracking-wider">
              Chế độ Bệnh nhân
            </span>
            <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-[#14213D] mt-1">
            Xin chào, {displayName} 👋
          </h2>
          <p className="text-xs font-bold text-[#3B4B68]">
            Chụp hoặc tải ảnh phiếu xét nghiệm để hệ thống trích xuất chỉ số và đưa ra gợi ý giải thích dễ hiểu.
          </p>
        </div>

        {/* HERO CTA: SCAN OCR */}
        <div className="bg-gradient-to-br from-[#0E6C99] via-[#14213D] to-indigo-950 rounded-[32px] p-6 text-white shadow-xl border-2 border-white/20 relative overflow-hidden">
          <button
            onClick={() => onNavigate('patient-scan')}
            className="w-full flex flex-col items-center gap-3 text-center cursor-pointer group py-4"
          >
            <div className="w-20 h-20 rounded-full bg-white/20 group-hover:bg-white/30 transition-all flex items-center justify-center shadow-lg group-hover:scale-105">
              <ScanLine className="w-10 h-10 text-white" />
            </div>
            <span className="text-3xl font-black tracking-wider text-white">SCAN OCR</span>
            <span className="text-xs font-extrabold text-sky-200 bg-white/10 px-4 py-1.5 rounded-full border border-white/20">
              Quét & Nhận diện Phiếu Xét Nghiệm
            </span>
          </button>
        </div>

        {/* Quick Action Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate('patient-scan')}
            className="p-4 rounded-[24px] bg-white border-2 border-[#14213D]/10 hover:border-[#0E6C99] shadow-xs flex flex-col items-center gap-2 text-center transition-all cursor-pointer hover:scale-102"
          >
            <div className="p-3 rounded-2xl bg-sky-100 text-[#0E6C99]">
              <Camera className="w-6 h-6" />
            </div>
            <span className="font-black text-xs text-[#14213D]">Quét xét nghiệm</span>
          </button>

          <button
            onClick={() => onNavigate('patient-history')}
            className="p-4 rounded-[24px] bg-white border-2 border-[#14213D]/10 hover:border-[#0E6C99] shadow-xs flex flex-col items-center gap-2 text-center transition-all cursor-pointer hover:scale-102"
          >
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
              <History className="w-6 h-6" />
            </div>
            <span className="font-black text-xs text-[#14213D]">Lịch sử</span>
          </button>

          <button
            onClick={() => {
              if (recentReports.length > 0) {
                onNavigate('patient-analysis', { reportId: recentReports[0].id, tab: 'meal' });
              } else {
                onNavigate('patient-scan');
              }
            }}
            className="p-4 rounded-[24px] bg-white border-2 border-[#14213D]/10 hover:border-[#0E6C99] shadow-xs flex flex-col items-center gap-2 text-center transition-all cursor-pointer hover:scale-102"
          >
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-800">
              <Utensils className="w-6 h-6" />
            </div>
            <span className="font-black text-xs text-[#14213D]">Thực đơn</span>
          </button>

          <button
            onClick={() => {
              if (recentReports.length > 0) {
                onNavigate('patient-analysis', { reportId: recentReports[0].id, tab: 'exercise' });
              } else {
                onNavigate('patient-scan');
              }
            }}
            className="p-4 rounded-[24px] bg-white border-2 border-[#14213D]/10 hover:border-[#0E6C99] shadow-xs flex flex-col items-center gap-2 text-center transition-all cursor-pointer hover:scale-102"
          >
            <div className="p-3 rounded-2xl bg-rose-100 text-rose-800">
              <HeartPulse className="w-6 h-6" />
            </div>
            <span className="font-black text-xs text-[#14213D]">Bài tập</span>
          </button>
        </div>

        {/* Recent Reports Section */}
        <div className="bg-white rounded-[28px] p-5 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-base text-[#14213D] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0E6C99]" />
              <span>Xét nghiệm gần đây</span>
            </h3>
            <button
              onClick={() => onNavigate('patient-history')}
              className="text-xs font-black text-[#0E6C99] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentReports.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-500">Chưa có kết quả quét nào.</p>
              <AppButton
                id="btn-start-scan"
                variant="primary"
                size="sm"
                onClick={() => onNavigate('patient-scan')}
              >
                <span>Bắt đầu quét ngay</span>
              </AppButton>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recentReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => onNavigate('patient-analysis', { reportId: report.id })}
                  className="p-3.5 rounded-2xl border border-slate-200 hover:border-[#0E6C99] bg-slate-50/80 hover:bg-sky-50/50 flex items-center justify-between text-left transition-all cursor-pointer"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-black text-xs text-[#14213D]">Phiếu xét nghiệm</span>
                    <span className="text-[11px] font-bold text-slate-500">
                      {new Date(report.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  <span className="text-xs font-black text-[#0E6C99] flex items-center gap-1">
                    Xem chi tiết <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Floating Medical AI Chatbot */}
      <PatientChatWidget />
    </div>
  );
}
