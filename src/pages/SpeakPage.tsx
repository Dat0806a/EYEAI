import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Volume2, VolumeX, RotateCcw, AlertTriangle, MessageSquare, Sparkles } from 'lucide-react';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import { KeyboardHudSlot } from '../components/ui/KeyboardHudSlot';
import { EyeTextComposer } from '../modules/virtual-keyboard/EyeTextComposer';
import { VirtualKeyboard } from '../modules/virtual-keyboard/VirtualKeyboard';
import { applyVietnameseAccents } from '../modules/virtual-keyboard/vietnameseTelex';
import { GridItem } from '../modules/virtual-keyboard/types';
import { speakVietnamese, stopSpeech, isSpeaking as checkIsSpeaking } from '../utils/speech';
import { useCall } from '../modules/calls/CallProvider';

interface SpeakPageProps {
  onBack: () => void;
}

export interface LocalMessage {
  id: string;
  text: string;
  timestamp: Date;
}

const QUICK_PHRASES = [
  'Tôi muốn uống nước.',
  'Cảm ơn bạn.',
  'Tôi cần giúp đỡ.',
  'Tôi thấy mệt.',
];

export function SpeakPage({ onBack }: SpeakPageProps) {
  const [draft, setDraft] = useState<string>('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(true);
  const [isSpeakingState, setIsSpeakingState] = useState<boolean>(false);
  const [callWarning, setCallWarning] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef<boolean>(false);

  // Check active phone/video call state
  let isCallActive = false;
  try {
    const callCtx = useCall();
    isCallActive = callCtx?.callState !== 'idle';
  } catch {
    isCallActive = false;
  }

  // Web Speech API browser compatibility check & Cleanup on unmount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSpeechSupported('speechSynthesis' in window);
    }

    return () => {
      stopSpeech();
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle TTS Speaking state poll / callbacks
  const handleStopSpeech = () => {
    stopSpeech();
    setIsSpeakingState(false);
  };

  const handleSpeakText = (text: string) => {
    if (!text.trim()) return;

    if (isCallActive) {
      setCallWarning('Không thể đọc khi đang trong cuộc gọi.');
      setTimeout(() => setCallWarning(null), 4000);
      return;
    }

    // Stop previous speech if running and speak new text immediately
    stopSpeech();
    setIsSpeakingState(true);

    speakVietnamese(text, {
      onStart: () => setIsSpeakingState(true),
      onEnd: () => setIsSpeakingState(false),
    });
  };

  const handleSubmit = (textOverride?: string) => {
    const textToSend = (textOverride || draft).trim();
    if (!textToSend) return;

    // Double-submit guard
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (isCallActive) {
      setCallWarning('Không thể đọc khi đang trong cuộc gọi.');
      setTimeout(() => setCallWarning(null), 4000);
      submittingRef.current = false;
      return;
    }

    const newMsg: LocalMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMsg]);
    setDraft('');

    // Trigger TTS reading immediately
    handleSpeakText(textToSend);

    setTimeout(() => {
      submittingRef.current = false;
    }, 400);
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
        handleSubmit();
      }
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col relative selection:bg-[#6AC9F0] ${
        isKeyboardOpen ? 'pb-[320px] sm:pb-[350px]' : 'pb-24'
      }`}
    >
      {/* Sticky Top Header Container */}
      <div className="sticky top-0 z-40 w-full flex flex-col">
        <header className="bg-white/90 backdrop-blur-md border-b-2 border-[#14213D]/10 px-4 py-2.5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EyeFocusable id="btn-speak-back" onSelect={onBack}>
              <button
                type="button"
                onClick={onBack}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#14213D] transition-all cursor-pointer"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </EyeFocusable>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-[#14213D] border-2 border-[#6AC9F0] flex items-center justify-center flex-shrink-0 shadow-xs">
                <Volume2 className="w-5 h-5 text-[#6AC9F0]" />
              </div>

              <div className="flex flex-col">
                <h1 className="font-black text-base text-[#14213D] leading-tight">
                  Nói chuyện
                </h1>
                <span className="text-[11px] font-bold text-[#3B4B68]">
                  Loa thiết bị phát âm trực tiếp
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSpeakingState && (
              <EyeFocusable id="btn-stop-speak" onSelect={handleStopSpeech}>
                <button
                  type="button"
                  onClick={handleStopSpeech}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer animate-pulse"
                  title="Dừng đọc"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>Dừng đọc</span>
                </button>
              </EyeFocusable>
            )}
          </div>
        </header>

        {/* Camera HUD Bar (Horizontal mode when keyboard open) */}
        <KeyboardHudSlot currentRoute="speak" />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-4 flex flex-col justify-between">
        {/* Browser Web Speech API Support Banner Warning */}
        {!speechSupported && (
          <div className="mb-4 p-3 bg-amber-100 border-2 border-amber-400 rounded-2xl text-amber-900 text-xs sm:text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0" />
            <span>Thiết bị này chưa hỗ trợ đọc văn bản.</span>
          </div>
        )}

        {/* Call Conflict Banner Warning */}
        {callWarning && (
          <div className="mb-4 p-3 bg-rose-100 border-2 border-rose-400 rounded-2xl text-rose-900 text-xs sm:text-sm font-bold flex items-center gap-2 animate-bounce">
            <AlertTriangle className="w-5 h-5 text-rose-700 flex-shrink-0" />
            <span>{callWarning}</span>
          </div>
        )}

        {/* Empty State Welcome & Quick Phrase Chips */}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center my-auto py-6 text-center">
            <div className="w-18 h-18 rounded-full bg-gradient-to-tr from-[#14213D] via-[#3B4B68] to-[#6AC9F0] p-1 shadow-lg mb-3 flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-[#14213D] flex items-center justify-center border-2 border-[#6AC9F0]">
                <Volume2 className="w-9 h-9 text-[#6AC9F0]" />
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-[#14213D] mb-1">
              Bảng nói trực tiếp
            </h2>
            <p className="text-xs sm:text-sm font-bold text-[#3B4B68] max-w-xs mb-5 leading-relaxed">
              Nhập nội dung bằng bàn phím và chọn <strong className="text-[#14213D]">Nói</strong> để thiết bị phát âm thay bạn.
            </p>

            {/* Quick Suggestion Chips */}
            <div className="w-full grid grid-cols-2 gap-2.5 mt-1 max-w-sm">
              {QUICK_PHRASES.map((phrase, idx) => (
                <EyeFocusable
                  key={`quick-${idx}`}
                  id={`btn-quick-phrase-${idx}`}
                  onSelect={() => handleSubmit(phrase)}
                  row={Math.floor(idx / 2)}
                  col={idx % 2}
                >
                  <button
                    type="button"
                    onClick={() => handleSubmit(phrase)}
                    className="w-full p-3 rounded-2xl bg-white border-2 border-[#14213D]/12 hover:border-[#6AC9F0] text-left transition-all active:scale-95 cursor-pointer shadow-2xs flex items-center justify-between group"
                  >
                    <span className="font-extrabold text-xs sm:text-sm text-[#14213D] line-clamp-1">
                      {phrase}
                    </span>
                    <Volume2 className="w-3.5 h-3.5 text-[#6AC9F0] group-hover:scale-110 transition-transform flex-shrink-0 ml-1" />
                  </button>
                </EyeFocusable>
              ))}
            </div>
          </div>
        )}

        {/* Local Message History List (Communication Cards) */}
        {messages.length > 0 && (
          <div className="flex-1 space-y-3.5 overflow-y-auto mb-4 p-1">
            {messages.map((msg, index) => {
              const isLatest = index === messages.length - 1;
              const formattedTime = msg.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`relative w-full p-4 rounded-[22px] bg-white border-2 transition-all shadow-sm ${
                    isLatest
                      ? 'border-[#6AC9F0] ring-2 ring-[#6AC9F0]/30 shadow-md'
                      : 'border-[#14213D]/12'
                  }`}
                >
                  {/* Card Header & Replay Action */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-lg sm:text-xl font-black text-[#14213D] leading-snug break-words">
                        {msg.text}
                      </p>
                    </div>

                    <EyeFocusable
                      id={`btn-replay-${msg.id}`}
                      onSelect={() => handleSpeakText(msg.text)}
                    >
                      <button
                        type="button"
                        onClick={() => handleSpeakText(msg.text)}
                        className="px-3 py-1.5 rounded-xl bg-[#6AC9F0]/20 hover:bg-[#6AC9F0]/40 text-[#14213D] font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer flex-shrink-0"
                        title="Đọc lại câu này"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#14213D]" />
                        <span>Đọc lại</span>
                      </button>
                    </EyeFocusable>
                  </div>

                  {/* Card Bottom Meta Info */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-[#3B4B68]">
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#6AC9F0]" />
                      <span>Đã phát loa</span>
                      {isLatest && (
                        <span className="px-1.5 py-0.2 rounded-full bg-[#6AC9F0] text-[#14213D] font-black text-[9px]">
                          VỪA NÓI
                        </span>
                      )}
                    </div>
                    <span>{formattedTime}</span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Fixed Bottom Composer Container */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 p-2 md:p-3 bg-[#FFF2D6] border-t border-[#14213D]/10 shadow-lg transition-all duration-200 ${
          isKeyboardOpen ? 'pb-[225px] sm:pb-[255px]' : 'pb-2'
        }`}
      >
        <div className="max-w-md md:max-w-xl mx-auto w-full flex flex-col gap-2">
          <EyeTextComposer
            value={draft}
            onChange={setDraft}
            placeholder="Nhập nội dung muốn nói…"
            actionLabel="Nói"
            onSubmit={() => handleSubmit()}
            onToggleKeyboard={() => setIsKeyboardOpen(!isKeyboardOpen)}
            isKeyboardOpen={isKeyboardOpen}
          />
        </div>
      </div>

      {/* Reused Virtual Keyboard Component */}
      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onClose={() => setIsKeyboardOpen(false)}
        onKeyPress={handleKeyPress}
        actionLabel="Nói"
      />
    </div>
  );
}
