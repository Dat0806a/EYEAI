import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Mic, Send, Volume2, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { apiError, sendChatMessage } from '../services/api';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
  VoiceRecognitionController,
} from '../utils/voice';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<VoiceRecognitionController | null>(null);
  const location = useLocation();

  const reportIdFromPath = location.pathname.startsWith('/analysis/') || location.pathname.startsWith('/review/')
    ? location.pathname.split('/').pop()
    : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    setVoiceSupported(isSpeechRecognitionSupported());
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleVoice = () => {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    setError('');
    if (!recognitionRef.current) {
      recognitionRef.current = createSpeechRecognition({
        onResult: (transcript) => {
          if (transcript) setInput(transcript);
        },
        onEnd: () => setListening(false),
        onError: (message) => {
          setError(message);
          setListening(false);
        },
      });
    }
    recognitionRef.current?.start();
    setListening(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setLoading(true);
    try {
      const result = await sendChatMessage(message, reportIdFromPath, sessionIdRef.current);
      sessionIdRef.current = result.sessionId;
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[480px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
            <div>
              <p className="font-bold">Trợ lý sức khỏe</p>
              <p className="text-xs text-white/70">Hỏi về kết quả xét nghiệm của bạn</p>
            </div>
            <button onClick={() => setOpen(false)} className="touch-target rounded-full p-1 hover:bg-white/10" aria-label="Đóng chat">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-soft-gray p-3" aria-live="polite">
            <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-navy shadow-sm">
              Xin chào! Tôi có thể giải thích các chỉ số xét nghiệm, thực đơn hoặc bài tập cho bạn. Hãy đặt câu hỏi nhé.
            </div>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3 text-sm shadow-sm ${
                    m.role === 'user' ? 'rounded-br-sm bg-sky-blue text-white' : 'rounded-tl-sm bg-white text-navy'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => speakText(m.content)}
                        className="touch-target rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-navy"
                        aria-label="Đọc câu trả lời"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-gray-500 shadow-sm">Đang suy nghĩ...</div>
              </div>
            )}
            {error && <div className="text-xs text-red-500">{error}</div>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-gray-100 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi..."
              className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm outline-none focus:border-sky-blue"
            />
            <button
              type="button"
              onClick={toggleVoice}
              disabled={!voiceSupported || loading}
              className={`touch-target rounded-full p-2.5 ${
                listening ? 'bg-coral text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
              } disabled:opacity-40`}
              aria-label="Nhập bằng giọng nói"
              title={voiceSupported ? 'Nhập bằng giọng nói' : 'Trình duyệt không hỗ trợ nhập giọng nói'}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button type="submit" disabled={loading || !input.trim()} className="touch-target rounded-full bg-sky-blue p-2.5 text-white disabled:opacity-40" aria-label="Gửi">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-lg"
        aria-label="Mở chatbot"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
