import React, { useEffect, useRef } from 'react';
import { Volume2, CheckCircle2, XCircle, Hand, AlertCircle, Loader2 } from 'lucide-react';
import {
  AgentConversationMessage,
  AgentTaskState,
  ConfirmationRequest,
  UserGestureRequest,
} from '../types/agentTypes';

interface AgentMessagesProps {
  messages: AgentConversationMessage[];
  taskState: AgentTaskState;
  interimTranscript: string;
  activeActionSummary: string | null;
  pendingConfirmation: ConfirmationRequest | null;
  pendingGesture: UserGestureRequest | null;
  errorText: string | null;
  onSpeakMessage: (text: string) => void;
  onRespondConfirmation: (approved: boolean) => void;
  onTriggerGesture: () => void;
  onDismissGesture: () => void;
}

export function AgentMessages({
  messages,
  taskState,
  interimTranscript,
  activeActionSummary,
  pendingConfirmation,
  pendingGesture,
  errorText,
  onSpeakMessage,
  onRespondConfirmation,
  onTriggerGesture,
  onDismissGesture,
}: AgentMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, taskState, interimTranscript, pendingConfirmation, pendingGesture, errorText]);

  const isProcessing =
    taskState === 'PLANNING' ||
    taskState === 'EXECUTING' ||
    taskState === 'OBSERVING' ||
    taskState === 'VERIFYING' ||
    taskState === 'WAITING_FOR_RESULT' ||
    taskState === 'TRANSCRIBING';

  return (
    <div
      data-testid="agent-messages-list"
      className="flex-1 space-y-3 overflow-y-auto bg-[#FFF2D6]/45 p-4"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[88%] whitespace-pre-wrap rounded-2xl p-3.5 text-sm font-bold leading-relaxed shadow-xs ${
              m.role === 'user'
                ? 'rounded-br-xs bg-[#0E6C99] text-white'
                : m.kind === 'error'
                ? 'rounded-tl-xs bg-rose-50 border border-rose-200 text-rose-950'
                : m.kind === 'progress'
                ? 'rounded-tl-xs bg-sky-50 border border-sky-200 text-[#14213D]'
                : 'rounded-tl-xs bg-white border border-[#14213D]/12 text-[#14213D]'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="flex-1">{m.content}</span>
              {m.role === 'assistant' && m.kind !== 'progress' && (
                <button
                  type="button"
                  onClick={() => onSpeakMessage(m.content)}
                  className="p-1.5 text-slate-500 hover:text-[#0E6C99] transition-colors cursor-pointer shrink-0 rounded-lg"
                  title="Nghe đọc phản hồi"
                  aria-label="Nghe đọc phản hồi"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Live Interim Speech Transcript */}
      {taskState === 'LISTENING' && (
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-br-xs bg-[#0E6C99]/15 border border-[#0E6C99]/40 p-3 text-sm font-bold text-[#14213D] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span>{interimTranscript || 'Đang lắng nghe giọng nói của bạn...'}</span>
          </div>
        </div>
      )}

      {/* Real Task Progress Indicator */}
      {isProcessing && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-tl-xs bg-white p-3 text-xs sm:text-sm font-bold text-[#14213D] shadow-xs border border-[#6AC9F0]/60 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[#0E6C99] animate-spin shrink-0" />
            <span>{activeActionSummary || 'Đang xử lý yêu cầu của bạn...'}</span>
          </div>
        </div>
      )}

      {/* Pending Confirmation Gate */}
      {pendingConfirmation && (
        <div
          data-testid="agent-confirmation-card"
          className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-4 flex flex-col gap-3 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase text-amber-900">
              Cần xác nhận từ bạn
            </span>
            <p className="text-sm font-black text-[#14213D]">{pendingConfirmation.title}</p>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              {pendingConfirmation.summary}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="agent-confirm-approve"
              onClick={() => onRespondConfirmation(true)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#0E6C99] hover:bg-[#084D6E] text-white font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xác nhận</span>
            </button>
            <button
              type="button"
              data-testid="agent-confirm-reject"
              onClick={() => onRespondConfirmation(false)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-[#14213D] font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Hủy bỏ</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending Browser User Gesture CTA */}
      {pendingGesture && (
        <div
          data-testid="agent-gesture-card"
          className="rounded-2xl bg-sky-50 border-2 border-[#0E6C99] p-4 flex flex-col gap-3 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase text-[#0E6C99] inline-flex items-center gap-1">
              <Hand className="w-3.5 h-3.5" />
              <span>Cần một chạm trực tiếp của bạn</span>
            </span>
            <p className="text-sm font-black text-[#14213D]">{pendingGesture.title}</p>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              {pendingGesture.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="agent-gesture-trigger"
              onClick={onTriggerGesture}
              className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#FF6F61] hover:bg-[#f06052] text-white font-black text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>{pendingGesture.buttonLabel}</span>
            </button>
            <button
              type="button"
              data-testid="agent-gesture-dismiss"
              onClick={onDismissGesture}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-[#14213D] font-black text-xs cursor-pointer"
            >
              Để sau
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorText && (
        <div
          role="alert"
          data-testid="agent-error-banner"
          className="rounded-2xl bg-rose-50 border border-rose-300 p-3 text-xs font-bold text-rose-900 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
