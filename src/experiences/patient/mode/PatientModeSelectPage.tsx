import React from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { MousePointerClick, Mic, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

interface PatientModeSelectPageProps {
  onSelectDefaultMode: () => void;
  onSelectAgentMode: () => void;
  onOpenSettings?: () => void;
}

export function PatientModeSelectPage({
  onSelectDefaultMode,
  onSelectAgentMode,
  onOpenSettings,
}: PatientModeSelectPageProps) {
  const { profile, user } = useAuth();
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Bạn';

  return (
    <div
      data-testid="patient-mode-select-page"
      className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-16"
    >
      <PageHeader
        title="Chọn chế độ sử dụng"
        isPatient={true}
        currentRoute="patient-mode-select"
        onOpenSettings={onOpenSettings}
      />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 sm:py-8 flex flex-col gap-6 justify-center">
        {/* Greeting Header */}
        <section className="p-6 rounded-[28px] bg-white/95 border-2 border-[#14213D]/12 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="px-3 py-1 rounded-full bg-[#6AC9F0]/25 border border-[#6AC9F0]/60 text-[#14213D] font-black text-xs uppercase tracking-wider">
              Tài khoản Bệnh nhân
            </span>
            <ShieldCheck className="w-5 h-5 text-[#0E6C99]" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#14213D] leading-snug mt-1">
            Xin chào, {displayName}
          </h1>
          <p className="text-sm sm:text-base font-bold text-[#3B4B68] leading-relaxed">
            Vui lòng chọn cách sử dụng EYEAI phù hợp với bạn hôm nay. Bạn có thể đổi chế độ bất kỳ lúc nào.
          </p>
        </section>

        {/* Two Large Accessible Mode Cards */}
        <div className="flex flex-col gap-4" role="group" aria-label="Lựa chọn chế độ bệnh nhân">
          {/* Option 1: Mode A - Default Mode */}
          <button
            id="btn-mode-default"
            data-testid="mode-select-default"
            type="button"
            onClick={onSelectDefaultMode}
            className="w-full min-h-[124px] p-5 sm:p-6 rounded-[26px] bg-white hover:bg-[#FFFDF9] border-2 border-[#14213D]/15 hover:border-[#0E6C99] active:scale-[0.99] shadow-sm hover:shadow-md transition-all text-left flex items-center gap-4 cursor-pointer group focus:outline-none focus:ring-4 focus:ring-[#6AC9F0]/50"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#6AC9F0]/20 border border-[#6AC9F0]/50 text-[#14213D] flex items-center justify-center shrink-0">
              <MousePointerClick className="w-8 h-8 text-[#0E6C99]" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg sm:text-xl font-black text-[#14213D]">
                  Chế độ mặc định
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFF2D6] border border-[#14213D]/15 text-[#14213D] font-black text-xs">
                  Thủ công
                </span>
              </div>
              <p className="text-sm sm:text-base font-bold text-[#3B4B68] leading-relaxed">
                Sử dụng EYEAI bằng các thao tác thông thường.
              </p>
            </div>

            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-[#0E6C99] text-[#14213D] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </div>
          </button>

          {/* Option 2: Mode B - AI Agent Mode */}
          <button
            id="btn-mode-agent"
            data-testid="mode-select-agent"
            type="button"
            onClick={onSelectAgentMode}
            className="w-full min-h-[124px] p-5 sm:p-6 rounded-[26px] bg-[#14213D] hover:bg-[#1b2c50] border-2 border-[#6AC9F0] active:scale-[0.99] shadow-lg transition-all text-left flex items-center gap-4 cursor-pointer group focus:outline-none focus:ring-4 focus:ring-[#6AC9F0]/60"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#6AC9F0] text-[#14213D] flex items-center justify-center shrink-0 shadow-md">
              <Mic className="w-8 h-8 text-[#14213D]" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg sm:text-xl font-black text-white">
                  Chế độ AI Agent
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FF6F61] text-white font-black text-xs inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Giọng nói tự chủ</span>
                </span>
              </div>
              <p className="text-sm sm:text-base font-bold text-[#FFF2D6] leading-relaxed">
                Điều khiển EYEAI bằng giọng nói với trợ lý AI.
              </p>
            </div>

            <div className="w-10 h-10 rounded-full bg-[#6AC9F0]/20 group-hover:bg-[#6AC9F0] text-[#6AC9F0] group-hover:text-[#14213D] flex items-center justify-center shrink-0 transition-colors">
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </div>
          </button>
        </div>
      </main>
    </div>
  );
}
