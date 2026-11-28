import React from 'react';
import { Bot, X, Square, Maximize2, Loader2, Hand, CheckCircle2, PauseCircle, AlertCircle } from 'lucide-react';
import { AgentTaskState, UserGestureRequest } from '../types/agentTypes';

interface AgentLauncherProps {
  popupOpen: boolean;
  isMinimized: boolean;
  taskState: AgentTaskState;
  activeActionSummary: string | null;
  pendingGesture: UserGestureRequest | null;
  onToggleOpen: () => void;
  onExpandFromMinimized: () => void;
  onStopTask: () => void;
  onTriggerGesture: () => void;
}

export function AgentLauncher({
  popupOpen,
  isMinimized,
  taskState,
  activeActionSummary,
  pendingGesture,
  onToggleOpen,
  onExpandFromMinimized,
  onStopTask,
  onTriggerGesture,
}: AgentLauncherProps) {
  const isBusy =
    taskState === 'PLANNING' ||
    taskState === 'EXECUTING' ||
    taskState === 'OBSERVING' ||
    taskState === 'VERIFYING' ||
    taskState === 'WAITING_FOR_RESULT' ||
    taskState === 'LISTENING' ||
    taskState === 'TRANSCRIBING';

  const showMinimizedBar = !popupOpen && (isMinimized || isBusy || Boolean(pendingGesture));

  const minimizedStatusText =
    activeActionSummary ||
    (taskState === 'COMPLETED'
      ? 'Đã hoàn thành — chạm để xem hội thoại'
      : taskState === 'PAUSED'
      ? 'Đã tạm dừng — chạm để mở lại'
      : taskState === 'CANCELLED'
      ? 'Đã dừng tác vụ'
      : taskState === 'FAILED'
      ? 'Tác vụ gặp lỗi — chạm để kiểm tra'
      : taskState === 'WAITING_FOR_USER'
      ? 'Đang chờ phản hồi của bạn'
      : isBusy
      ? 'AI Agent đang hoạt động'
      : 'AI Agent sẵn sàng');

  return (
    <div
      data-testid="patient-agent-launcher-container"
      className="fixed bottom-5 right-4 sm:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none"
    >
      {/* Non-blocking Minimized Status Pill (never blocks main UI underneath) */}
      {showMinimizedBar && (
        <div
          data-testid="agent-minimized-bar"
          className="pointer-events-auto max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl bg-[#14213D]/95 text-white border-2 border-[#6AC9F0] shadow-xl px-3.5 py-2.5 flex items-center gap-2.5"
        >
          {pendingGesture ? (
            <>
              <Hand className="w-4 h-4 text-[#FF6F61] shrink-0" />
              <span className="text-xs font-bold truncate flex-1">{pendingGesture.title}</span>
              <button
                type="button"
                data-testid="agent-minimized-gesture-cta"
                onClick={onTriggerGesture}
                className="px-2.5 py-1.5 rounded-xl bg-[#FF6F61] hover:bg-[#f06052] text-white font-black text-xs cursor-pointer shrink-0"
              >
                {pendingGesture.buttonLabel}
              </button>
            </>
          ) : (
            <>
              {isBusy ? (
                <Loader2 className="w-4 h-4 text-[#6AC9F0] animate-spin shrink-0" />
              ) : taskState === 'COMPLETED' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : taskState === 'FAILED' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <PauseCircle className="w-4 h-4 text-amber-300 shrink-0" />
              )}
              <span className="text-xs font-bold text-sky-100 truncate flex-1">
                {minimizedStatusText}
              </span>
            </>
          )}

          {isBusy && (
            <button
              type="button"
              data-testid="agent-minimized-stop"
              onClick={onStopTask}
              className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] inline-flex items-center gap-1 cursor-pointer shrink-0"
              title="Dừng tác vụ"
              aria-label="Dừng tác vụ"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Dừng</span>
            </button>
          )}

          <button
            type="button"
            data-testid="agent-minimized-expand"
            onClick={onExpandFromMinimized}
            className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer shrink-0"
            title="Mở cửa sổ AI Agent"
            aria-label="Mở cửa sổ AI Agent"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Floating AI AGENT Launcher Button (replaces old chatbot button in Mode B) */}
      <button
        type="button"
        id="btn-patient-ai-agent-launcher"
        data-testid="patient-agent-launcher"
        onClick={onToggleOpen}
        aria-label={popupOpen ? 'Thu gọn AI Agent' : 'Mở AI AGENT'}
        aria-expanded={popupOpen}
        className={`pointer-events-auto flex items-center justify-center gap-2 rounded-full shadow-xl border-2 border-white transition-all cursor-pointer hover:scale-105 active:scale-95 ${
          popupOpen
            ? 'h-14 w-14 bg-[#14213D] text-[#6AC9F0]'
            : 'h-14 px-4 sm:px-5 bg-[#14213D] text-white hover:bg-[#1c2f56]'
        }`}
      >
        {popupOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <span className="w-8 h-8 rounded-full bg-[#6AC9F0] text-[#14213D] flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </span>
            <span className="font-black text-xs sm:text-sm tracking-wide whitespace-nowrap">
              AI AGENT
            </span>
          </>
        )}
      </button>
    </div>
  );
}
