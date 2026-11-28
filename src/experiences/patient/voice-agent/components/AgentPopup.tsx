import React from 'react';
import { Bot, Minimize2, Square, RotateCcw } from 'lucide-react';
import {
  AgentConversationMessage,
  AgentTaskState,
  ConfirmationRequest,
  UserGestureRequest,
} from '../types/agentTypes';
import { AgentStatus } from './AgentStatus';
import { AgentMessages } from './AgentMessages';
import { AgentVoiceControls } from './AgentVoiceControls';

interface AgentPopupProps {
  isOpen: boolean;
  taskState: AgentTaskState;
  messages: AgentConversationMessage[];
  input: string;
  interimTranscript: string;
  activeActionSummary: string | null;
  pendingConfirmation: ConfirmationRequest | null;
  pendingGesture: UserGestureRequest | null;
  errorText: string | null;
  isListening: boolean;
  sttSupported: boolean;
  sttNotice: string | null;
  voiceOutputEnabled: boolean;
  onInputChange: (val: string) => void;
  onSubmitText: () => void;
  onMinimize: () => void;
  onStopTask: () => void;
  onResetSession: () => void;
  onToggleListening: () => void;
  onToggleVoiceOutput: () => void;
  onSpeakMessage: (text: string) => void;
  onRespondConfirmation: (approved: boolean) => void;
  onTriggerGesture: () => void;
  onDismissGesture: () => void;
}

export function AgentPopup({
  isOpen,
  taskState,
  messages,
  input,
  interimTranscript,
  activeActionSummary,
  pendingConfirmation,
  pendingGesture,
  errorText,
  isListening,
  sttSupported,
  sttNotice,
  voiceOutputEnabled,
  onInputChange,
  onSubmitText,
  onMinimize,
  onStopTask,
  onResetSession,
  onToggleListening,
  onToggleVoiceOutput,
  onSpeakMessage,
  onRespondConfirmation,
  onTriggerGesture,
  onDismissGesture,
}: AgentPopupProps) {
  if (!isOpen) return null;

  const canStopTask =
    taskState === 'LISTENING' ||
    taskState === 'TRANSCRIBING' ||
    taskState === 'PLANNING' ||
    taskState === 'EXECUTING' ||
    taskState === 'OBSERVING' ||
    taskState === 'VERIFYING' ||
    taskState === 'WAITING_FOR_RESULT' ||
    taskState === 'WAITING_FOR_GESTURE' ||
    taskState === 'WAITING_FOR_USER';

  return (
    <section
      role="dialog"
      aria-label="EYEAI AI Agent"
      data-testid="patient-agent-popup"
      className="fixed bottom-24 right-3 sm:right-6 z-50 flex h-[min(74dvh,540px)] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-[28px] border-2 border-[#14213D]/20 bg-white shadow-2xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 bg-[#14213D] px-4 py-3 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#6AC9F0] text-[#14213D] flex items-center justify-center font-black shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm text-white truncate">EYEAI AI Agent</p>
            <AgentStatus taskState={taskState} />
          </div>
        </div>

        {/* Distinct Action Controls: Stop Task | Reset Session | Minimize */}
        <div className="flex items-center gap-1 shrink-0">
          {canStopTask && (
            <button
              type="button"
              data-testid="agent-stop-task-btn"
              onClick={onStopTask}
              className="px-2.5 py-1.5 rounded-xl bg-[#FF6F61] hover:bg-[#f06052] text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition-colors"
              title="Dừng tác vụ hiện tại"
              aria-label="Dừng tác vụ"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Dừng</span>
            </button>
          )}

          <button
            type="button"
            data-testid="agent-reset-session-btn"
            onClick={onResetSession}
            className="p-2 rounded-xl hover:bg-white/15 text-sky-200 hover:text-white transition-colors cursor-pointer"
            title="Kết thúc phiên / Hội thoại mới"
            aria-label="Kết thúc phiên"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="agent-minimize-btn"
            onClick={onMinimize}
            className="p-2 rounded-xl hover:bg-white/15 text-white transition-colors cursor-pointer"
            title="Thu nhỏ cửa sổ"
            aria-label="Thu nhỏ"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <AgentMessages
        messages={messages}
        taskState={taskState}
        interimTranscript={interimTranscript}
        activeActionSummary={activeActionSummary}
        pendingConfirmation={pendingConfirmation}
        pendingGesture={pendingGesture}
        errorText={errorText}
        onSpeakMessage={onSpeakMessage}
        onRespondConfirmation={onRespondConfirmation}
        onTriggerGesture={onTriggerGesture}
        onDismissGesture={onDismissGesture}
      />

      {/* Footer */}
      <AgentVoiceControls
        input={input}
        onInputChange={onInputChange}
        onSubmitText={onSubmitText}
        isListening={isListening}
        isBusy={
          taskState === 'PLANNING' ||
          taskState === 'EXECUTING' ||
          taskState === 'OBSERVING' ||
          taskState === 'VERIFYING'
        }
        sttSupported={sttSupported}
        sttNotice={sttNotice}
        voiceOutputEnabled={voiceOutputEnabled}
        onToggleListening={onToggleListening}
        onToggleVoiceOutput={onToggleVoiceOutput}
      />
    </section>
  );
}
