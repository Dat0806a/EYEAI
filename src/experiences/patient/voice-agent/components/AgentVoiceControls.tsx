import React, { FormEvent } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';

interface AgentVoiceControlsProps {
  input: string;
  onInputChange: (val: string) => void;
  onSubmitText: () => void;
  isListening: boolean;
  isBusy: boolean;
  sttSupported: boolean;
  sttNotice: string | null;
  voiceOutputEnabled: boolean;
  onToggleListening: () => void;
  onToggleVoiceOutput: () => void;
}

export function AgentVoiceControls({
  input,
  onInputChange,
  onSubmitText,
  isListening,
  isBusy,
  sttSupported,
  sttNotice,
  voiceOutputEnabled,
  onToggleListening,
  onToggleVoiceOutput,
}: AgentVoiceControlsProps) {
  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitText();
  };

  return (
    <div className="border-t border-[#14213D]/12 bg-white p-3 flex flex-col gap-2">
      {(!sttSupported || sttNotice) && (
        <p
          data-testid="agent-stt-fallback-notice"
          className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5"
        >
          {sttNotice || 'Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Bạn có thể nhập yêu cầu bằng văn bản.'}
        </p>
      )}

      <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
        <button
          type="button"
          data-testid="agent-voice-output-toggle"
          onClick={onToggleVoiceOutput}
          className={`min-h-[48px] min-w-[48px] p-2.5 rounded-2xl border font-bold flex items-center justify-center cursor-pointer transition-colors ${
            voiceOutputEnabled
              ? 'bg-sky-50 border-[#6AC9F0] text-[#0E6C99]'
              : 'bg-slate-100 border-slate-300 text-slate-500'
          }`}
          title={voiceOutputEnabled ? 'Tắt đọc giọng nói' : 'Bật đọc giọng nói'}
          aria-label={voiceOutputEnabled ? 'Tắt đọc giọng nói' : 'Bật đọc giọng nói'}
          aria-pressed={voiceOutputEnabled}
        >
          {voiceOutputEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        <input
          data-testid="agent-text-input"
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Nói hoặc nhập yêu cầu của bạn..."
          className="flex-1 min-h-[48px] rounded-2xl border-2 border-slate-200 focus:border-[#0E6C99] px-3.5 py-2 text-sm font-bold text-[#14213D] outline-none bg-slate-50/50 focus:bg-white transition-colors"
          aria-label="Nhập yêu cầu cho AI Agent"
        />

        <button
          type="button"
          data-testid="agent-mic-button"
          onClick={onToggleListening}
          disabled={!sttSupported && !isListening}
          className={`min-h-[48px] min-w-[48px] p-2.5 rounded-2xl font-black flex items-center justify-center transition-all cursor-pointer shadow-sm ${
            isListening
              ? 'bg-[#FF6F61] text-white ring-4 ring-[#FF6F61]/30 animate-pulse'
              : sttSupported
              ? 'bg-[#14213D] hover:bg-[#1e3159] text-[#6AC9F0]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
          title={isListening ? 'Dừng ghi âm' : 'Nhấn để nói tiếng Việt'}
          aria-label={isListening ? 'Dừng ghi âm' : 'Nhấn để nói tiếng Việt'}
          aria-pressed={isListening}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          type="submit"
          data-testid="agent-send-button"
          disabled={isBusy || !input.trim()}
          className="min-h-[48px] min-w-[48px] p-2.5 rounded-2xl bg-[#0E6C99] hover:bg-[#084D6E] text-white font-black disabled:opacity-40 cursor-pointer flex items-center justify-center transition-colors"
          title="Gửi yêu cầu"
          aria-label="Gửi yêu cầu"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
