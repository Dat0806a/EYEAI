import React from 'react';
import { AgentTaskState } from '../types/agentTypes';

const STATE_LABELS: Record<AgentTaskState, { label: string; dotClass: string }> = {
  IDLE: { label: 'Sẵn sàng', dotClass: 'bg-emerald-400' },
  LISTENING: { label: 'Đang nghe...', dotClass: 'bg-rose-400 animate-ping' },
  TRANSCRIBING: { label: 'Đang nhận diện...', dotClass: 'bg-amber-300 animate-pulse' },
  PLANNING: { label: 'Đang lập kế hoạch...', dotClass: 'bg-[#6AC9F0] animate-pulse' },
  EXECUTING: { label: 'Đang thao tác...', dotClass: 'bg-[#6AC9F0] animate-ping' },
  OBSERVING: { label: 'Đang quan sát UI...', dotClass: 'bg-sky-300 animate-pulse' },
  VERIFYING: { label: 'Đang xác minh...', dotClass: 'bg-emerald-300 animate-pulse' },
  WAITING_FOR_USER: { label: 'Chờ bạn trả lời', dotClass: 'bg-amber-400' },
  WAITING_FOR_GESTURE: { label: 'Cần bạn chạm xác nhận', dotClass: 'bg-[#FF6F61] animate-pulse' },
  WAITING_FOR_RESULT: { label: 'Đang chờ kết quả...', dotClass: 'bg-[#6AC9F0] animate-pulse' },
  PAUSED: { label: 'Đã tạm dừng', dotClass: 'bg-amber-300' },
  COMPLETED: { label: 'Hoàn thành', dotClass: 'bg-emerald-400' },
  FAILED: { label: 'Gặp lỗi', dotClass: 'bg-rose-500' },
  CANCELLED: { label: 'Đã dừng', dotClass: 'bg-slate-400' },
};

export function AgentStatus({
  taskState,
  customLabel,
}: {
  taskState: AgentTaskState;
  customLabel?: string;
}) {
  const info = STATE_LABELS[taskState] || STATE_LABELS.IDLE;
  return (
    <div
      data-testid="agent-status-indicator"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-100"
    >
      <span className={`w-2 h-2 rounded-full ${info.dotClass}`} aria-hidden="true" />
      <span>{customLabel || info.label}</span>
    </div>
  );
}
