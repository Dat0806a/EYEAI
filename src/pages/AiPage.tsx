import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { MessageBubble } from '../components/chat/MessageBubble';
import { EyeTextComposer } from '../modules/virtual-keyboard/EyeTextComposer';
import { VirtualKeyboard } from '../modules/virtual-keyboard/VirtualKeyboard';
import { applyVietnameseAccents } from '../modules/virtual-keyboard/vietnameseTelex';
import { GridItem } from '../modules/virtual-keyboard/types';
import { ChatMessage } from '../types';
import { Bot, Sparkles, AlertCircle, RotateCcw, VolumeX, MessageSquare, HeartHandshake, HelpCircle, LifeBuoy, ArrowLeft } from 'lucide-react';
import { speakVietnamese, stopSpeech } from '../utils/speech';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import { useCall } from '../modules/calls/CallProvider';
import { Avatar3D, AvatarState } from '../components/ui/Avatar3D';
import { KeyboardHudSlot } from '../components/ui/KeyboardHudSlot';

interface AiPageProps {
  onBack: () => void;
}

const SUGGESTED_PROMPTS = [
  { id: 'btn-suggest-0', title: 'Trò chuyện với tôi', prompt: 'Xin chào, hãy trò chuyện vui vẻ cùng tôi nhé!', icon: MessageSquare },
  { id: 'btn-suggest-1', title: 'Giúp tôi viết một tin nhắn', prompt: 'Giúp tôi soạn một tin nhắn ngắn gửi cho người thân.', icon: HeartHandshake },
  { id: 'btn-suggest-2', title: 'Giải thích cho tôi', prompt: 'Hãy giải thích cho tôi một cách ngắn gọn và dễ hiểu.', icon: HelpCircle },
  { id: 'btn-suggest-3', title: 'Tôi cần hỗ trợ', prompt: 'Tôi cần hỗ trợ sử dụng hệ thống LUCKY DREAM.', icon: LifeBuoy },
];

export function AiPage({ onBack }: AiPageProps) {
  const [draft, setDraft] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiState, setAiState] = useState<AvatarState>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUserText, setLastUserText] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeakingState, setIsSpeakingState] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Safely check active call state to prevent audio conflict
  let isCallActive = false;
  try {
    const callCtx = useCall();
    isCallActive = callCtx?.callState !== 'idle';
  } catch {
    // If used outside CallProvider context, default to false
    isCallActive = false;
  }

  // Cleanup pending requests and speech on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      stopSpeech();
    };
  }, []);

  // Auto-scroll to bottom when messages list updates or AI loading changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading, errorMsg]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = (textOverride || draft).trim();
    if (!textToSend || isAiLoading) return;

    setErrorMsg(null);
    setLastUserText(textToSend);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      text: textToSend,
      sender: 'user',
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setDraft('');
    setIsKeyboardOpen(false);

    setIsAiLoading(true);
    setAiState('THINKING');

    // Build history for backend (last 10 turns)
    const history = messages.slice(-10).map(m => ({
      sender: m.sender,
      text: m.text,
    }));

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 15 second timeout safety gate
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }, 15000);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: history,
        }),
        signal: abortControllerRef.current.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let serverErrorMsg = `Server returned status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error) {
            serverErrorMsg = errData.error;
          }
        } catch {
          // Fallback to HTTP status string if JSON parse fails
        }
        throw new Error(serverErrorMsg);
      }

      const data = await response.json();
      const reply = data.message || data.text;

      if (reply) {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          text: reply,
          sender: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMsg]);
        setErrorMsg(null);

        // Auto TTS speech if user is not in an active audio/video call
        if (!isCallActive) {
          setIsSpeakingState(true);
          setAiState('SPEAKING');
          speakVietnamese(reply, {
            onStart: () => {
              setIsSpeakingState(true);
              setAiState('SPEAKING');
            },
            onEnd: () => {
              setIsSpeakingState(false);
              setAiState('IDLE');
            },
          });
        } else {
          setAiState('IDLE');
        }
      } else {
        throw new Error('No reply content from server');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.warn('AI request aborted/timed out.');
        setErrorMsg('Quá thời gian chờ phản hồi từ máy chủ AI.');
      } else {
        console.error('AI fetch error:', err);
        setErrorMsg(err.message || 'Hiện tôi chưa thể trả lời. Bạn thử lại nhé.');
      }
      setAiState('IDLE');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastUserText) {
      handleSend(lastUserText);
    }
  };

  const handleStopSpeech = () => {
    stopSpeech();
    setIsSpeakingState(false);
    setAiState('IDLE');
  };

  const handleKeyPress = (item: GridItem) => {
    if (item.type === 'phrase') {
      setDraft(prev => {
        const next = prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + item.value;
        return applyVietnameseAccents(next);
      });
    } else if (item.type === 'letter') {
      setDraft(prev => {
        const next = prev + item.value;
        return applyVietnameseAccents(next);
      });
    } else if (item.type === 'action') {
      if (item.value === ' ' || item.id === 'l_space') {
        setDraft(prev => prev + ' ');
      } else if (item.value === 'BACKSPACE') {
        setDraft(prev => prev.slice(0, -1));
      } else if (item.value === 'CLEAR_ALL') {
        setDraft('');
      } else if (item.value === 'SEND') {
        handleSend();
      }
    }
  };

  return (
    <div className={`min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col relative selection:bg-[#6AC9F0] ${isKeyboardOpen ? 'pb-[320px] sm:pb-[350px]' : 'pb-24'}`}>
      {/* Sticky Top Header Container (Fixed together when AI chat scrolls) */}
      <div className="sticky top-0 z-40 w-full flex flex-col">
        <header className="bg-white/90 backdrop-blur-md border-b-2 border-[#14213D]/10 px-4 py-2.5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <EyeFocusable id="btn-ai-back" onSelect={onBack}>
                <button
                  type="button"
                  className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#14213D] transition-all cursor-pointer"
                  aria-label="Quay lại"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </EyeFocusable>
            )}

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-[#14213D] border-2 border-[#6AC9F0] flex items-center justify-center flex-shrink-0 shadow-xs">
                <Bot className="w-5 h-5 text-[#6AC9F0]" />
              </div>

              <div className="flex flex-col">
                <span className="font-black text-base text-[#14213D] leading-tight">
                  LUCKY DREAM AI
                </span>
                <span className="text-[11px] font-bold text-emerald-600">
                  ● Trợ lý đồng cảm 24/7
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSpeakingState && (
              <EyeFocusable id="btn-stop-tts" onSelect={handleStopSpeech}>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer animate-pulse"
                  title="Dừng đọc"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Dừng đọc</span>
                </button>
              </EyeFocusable>
            )}

            <Avatar3D state={aiState} inlineStage className="scale-75 origin-right" />
          </div>
        </header>

        {/* Camera HUD Bar (First content element directly below header) */}
        <KeyboardHudSlot currentRoute="ai" />
      </div>

      {/* Main Conversation Area */}
      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-4 flex flex-col justify-between">
        {/* Empty State Welcome Screen with Suggested Prompts */}
        {messages.length === 0 && !isAiLoading && (
          <div className="flex-1 flex flex-col items-center justify-center my-auto py-6 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#14213D] via-[#3B4B68] to-[#6AC9F0] p-1 shadow-lg mb-4 flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-[#14213D] flex items-center justify-center border-2 border-[#6AC9F0]">
                <Bot className="w-10 h-10 text-[#6AC9F0]" />
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-black text-[#14213D] mb-1">
              Xin chào 👋
            </h1>
            <p className="text-base md:text-lg font-bold text-[#3B4B68] max-w-xs mb-6">
              Tôi có thể giúp bạn điều gì hôm nay?
            </p>

            {/* 4 EyeFocusable Suggested Prompts */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {SUGGESTED_PROMPTS.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <EyeFocusable
                    key={item.id}
                    id={item.id}
                    onSelect={() => handleSend(item.prompt)}
                    row={Math.floor(idx / 2)}
                    col={idx % 2}
                  >
                    <button
                      type="button"
                      className="w-full p-4 rounded-[20px] bg-white border-2 border-[#14213D]/10 hover:border-[#6AC9F0] hover:shadow-md text-left transition-all flex items-center gap-3 cursor-pointer group active:scale-98 min-h-[64px]"
                    >
                      <div className="p-2.5 rounded-xl bg-[#6AC9F0]/20 text-[#14213D] group-hover:bg-[#6AC9F0] transition-colors">
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <span className="font-extrabold text-sm md:text-base text-[#14213D] group-hover:text-[#14213D]">
                        {item.title}
                      </span>
                    </button>
                  </EyeFocusable>
                );
              })}
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.length > 0 && (
          <div className="flex-1 space-y-3 overflow-y-auto mb-4 p-1">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isAI={msg.sender === 'assistant'}
              />
            ))}

            {/* AI Thinking Animation Indicator */}
            {isAiLoading && (
              <div className="flex items-center gap-2.5 text-[#14213D] text-sm md:text-base font-bold p-3.5 bg-white/90 rounded-[22px] w-fit border-2 border-[#6AC9F0]/50 shadow-xs animate-pulse my-2">
                <Bot className="w-5 h-5 text-[#6AC9F0] animate-bounce" />
                <span>AI đang suy nghĩ câu trả lời...</span>
                <Sparkles className="w-4 h-4 text-[#FF6F61] animate-spin" />
              </div>
            )}

            {/* AI Error Bubble with EyeFocusable Retry Action */}
            {errorMsg && (
              <div className="w-full flex flex-col items-start gap-2 my-3">
                <div className="flex items-center gap-2 px-4 py-3.5 bg-rose-50 border-2 border-rose-300 rounded-[22px] text-rose-900 font-bold text-sm md:text-base shadow-xs max-w-full">
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>

                <EyeFocusable id="btn-ai-retry" onSelect={handleRetry}>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#FF6F61] hover:bg-[#e05d50] text-white font-black text-sm shadow-md transition-all active:scale-95 cursor-pointer ml-1"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Thử lại</span>
                  </button>
                </EyeFocusable>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Bottom Composer & Virtual Keyboard Section */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 p-2 md:p-3 bg-[#FFF2D6] border-t border-[#14213D]/10 shadow-lg transition-all duration-200 ${isKeyboardOpen ? 'pb-[225px] sm:pb-[255px]' : 'pb-2'}`}>
        <div className="max-w-md md:max-w-xl mx-auto w-full flex flex-col gap-2">
          <EyeTextComposer
            value={draft}
            onChange={setDraft}
            placeholder="Gõ hoặc chọn phím bằng mắt..."
            actionLabel={isAiLoading ? "ĐANG GỬI..." : "GỬI AI"}
            onSubmit={() => handleSend()}
            onToggleKeyboard={() => setIsKeyboardOpen(!isKeyboardOpen)}
            isKeyboardOpen={isKeyboardOpen}
          />
        </div>
      </div>

      {/* Virtual Keyboard Component (Rendered fixed bottom-0) */}
      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onClose={() => setIsKeyboardOpen(false)}
        onKeyPress={handleKeyPress}
      />
    </div>
  );
}
