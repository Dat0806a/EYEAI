import React, { useState, useRef, useEffect, FormEvent } from 'react';
import { MessageCircle, Mic, Send, Volume2, X, Bot } from 'lucide-react';
import { sendPatientChatMessage } from '../../../services/patientService';
import { speakVietnamese } from '../../../utils/speech';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PatientChatWidgetProps {
  reportSummary?: string;
}

export function PatientChatWidget({ reportSummary }: PatientChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Xin chào! Tôi là Trợ lý Sức khỏe LUCKY DREAM. Tôi có thể giúp giải thích các chỉ số xét nghiệm, thực đơn gợi ý hoặc bài tập phù hợp cho bạn. Hãy đặt câu hỏi nhé!',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Trình duyệt chưa hỗ trợ nhận diện giọng nói.');
      return;
    }

    try {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const reply = await sendPatientChatMessage(text, reportSummary);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      speakVietnamese(reply);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Hiện chưa kết nối được máy chủ AI. Vui lòng kiểm tra lại kết nối mạng.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Chat Window Popup */}
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[500px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-[28px] border-2 border-[#14213D]/15 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#14213D] to-[#0E6C99] px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#6AC9F0] text-[#14213D] flex items-center justify-center font-black">
                <Bot className="w-5 h-5 text-[#14213D]" />
              </div>
              <div>
                <p className="font-black text-sm text-white">Trợ lý Sức khỏe Bệnh nhân</p>
                <p className="text-[11px] text-sky-200 font-bold">Hỗ trợ giải thích chỉ số Y tế</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
              aria-label="Đóng chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#FFF2D6]/40 p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3.5 text-xs font-bold leading-relaxed shadow-xs ${
                    m.role === 'user'
                      ? 'rounded-br-xs bg-[#0E6C99] text-white'
                      : 'rounded-tl-xs bg-white border border-slate-200 text-[#14213D]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-1">{m.content}</span>
                    {m.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => speakVietnamese(m.content)}
                        className="p-1 text-slate-400 hover:text-[#0E6C99] transition-colors cursor-pointer shrink-0"
                        title="Nghe đọc"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-xs bg-white p-3 text-xs font-bold text-slate-500 shadow-xs border border-slate-200 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0E6C99] animate-ping" />
                  <span>Đang suy nghĩ câu trả lời...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi về chỉ số xét nghiệm..."
              className="flex-1 rounded-2xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-[#14213D] outline-none focus:border-[#0E6C99]"
            />
            <button
              type="button"
              onClick={handleVoiceInput}
              disabled={loading}
              className={`p-2.5 rounded-xl text-white font-bold transition-all cursor-pointer ${
                listening ? 'bg-rose-500 animate-pulse' : 'bg-slate-700 hover:bg-slate-800'
              }`}
              title="Nhập giọng nói"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2.5 rounded-xl bg-[#0E6C99] hover:bg-[#084D6E] text-white font-bold disabled:opacity-40 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF6F61] text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer border-2 border-white"
        aria-label="Trợ lý sức khỏe"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </>
  );
}
