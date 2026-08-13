import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { EyeTextComposer } from '../modules/virtual-keyboard/EyeTextComposer';
import { VirtualKeyboard } from '../modules/virtual-keyboard/VirtualKeyboard';
import { applyVietnameseAccents } from '../modules/virtual-keyboard/vietnameseTelex';
import { GridItem } from '../modules/virtual-keyboard/types';
import { useEyeTrackingSettings } from '../modules/eye-control/useEyeTracking';
import { useAuth } from '../hooks/useAuth';
import { useCall } from '../modules/calls/CallProvider';
import { chatService } from '../services/chat/chatService';
import { DirectMessage } from '../types/chat';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import { Phone, Video, User, Send, ArrowLeft } from 'lucide-react';
import { speakVietnamese } from '../utils/speech';
import { KeyboardHudSlot } from '../components/ui/KeyboardHudSlot';

interface HumanChatPageProps {
  friend: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  onBack: () => void;
}

export function HumanChatPage({ friend, onBack }: HumanChatPageProps) {
  const { user } = useAuth();
  const { settings } = useEyeTrackingSettings();
  const { startCall } = useCall();
  const eyeControlEnabled = settings.eyeControlEnabled;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = user?.id;

  // 1. Initialize or fetch direct conversation with friend
  useEffect(() => {
    let isMounted = true;
    async function initChat() {
      setLoading(true);
      const convId = await chatService.getOrCreateConversation(friend.id);
      if (isMounted && convId) {
        setConversationId(convId);
        const history = await chatService.getMessages(convId, 50);
        setMessages(history);
        setLoading(false);
      } else if (isMounted) {
        setLoading(false);
      }
    }

    initChat();
    return () => {
      isMounted = false;
    };
  }, [friend.id]);

  // 2. Realtime message subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = chatService.subscribeToMessages(conversationId, newMsg => {
      setMessages(prev => {
        // Deduplicate by message ID
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId]);

  // Auto-scroll to bottom on new messages or keyboard state change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isKeyboardOpen]);

  const handleSend = async () => {
    const textToSend = draft.trim();
    if (!textToSend || !conversationId) return;

    // Optimistic UI insert
    const tempId = `temp-${Date.now()}`;
    const tempMsg: DirectMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId || '',
      content: textToSend,
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    setMessages(prev => [...prev, tempMsg]);
    setDraft('');

    try {
      const sentMsg = await chatService.sendMessage(conversationId, textToSend);
      if (sentMsg) {
        setMessages(prev =>
          prev.map(m => (m.id === tempId ? { ...sentMsg, status: 'sent' } : m))
        );
      }
    } catch {
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
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

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={`min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col relative selection:bg-[#6AC9F0] ${isKeyboardOpen ? 'pb-[320px] sm:pb-[350px]' : 'pb-24'}`}>
      
      {/* Sticky Top Header Container (Fixed together when chat scrolls) */}
      <div className="sticky top-0 z-40 w-full flex flex-col">
        <header className="bg-white/90 backdrop-blur-md border-b-2 border-[#14213D]/10 px-4 py-3 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EyeFocusable id="btn-chat-back" onSelect={onBack}>
              <button
                type="button"
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#14213D] transition-all cursor-pointer"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </EyeFocusable>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center font-bold text-[#14213D] text-sm overflow-hidden flex-shrink-0">
                {friend.avatarUrl ? (
                  <img src={friend.avatarUrl} alt={friend.name} className="w-full h-full object-cover" />
                ) : (
                  getInitials(friend.name)
                )}
              </div>

              <div className="flex flex-col">
                <span className="font-black text-base text-[#14213D] truncate max-w-[150px] md:max-w-[220px]">
                  {friend.name}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600">Đã kết nối EyeTalk</span>
              </div>
            </div>
          </div>

          {/* Call Action Buttons: Voice (📞) & Video (📹) */}
          <div className="flex items-center gap-2">
            <EyeFocusable
              id="btn-voice-call-trigger"
              onSelect={() => {
                console.log('[CALL][UI] Voice Call triggered via EyeFocusable for:', friend.name);
                startCall(friend.id, friend.name, 'voice', friend.avatarUrl);
              }}
              row={0}
              col={0}
            >
              <button
                type="button"
                onClick={() => {
                  console.log('[CALL][UI] Voice Call button clicked for:', friend.name);
                  startCall(friend.id, friend.name, 'voice', friend.avatarUrl);
                }}
                className="p-3 rounded-2xl bg-[#6AC9F0] hover:bg-[#5bbce3] text-[#14213D] font-bold shadow-sm active:scale-95 flex items-center justify-center cursor-pointer"
                title="Gọi thoại"
              >
                <Phone className="w-5 h-5 text-[#14213D]" />
              </button>
            </EyeFocusable>

            <EyeFocusable
              id="btn-video-call-trigger"
              onSelect={() => startCall(friend.id, friend.name, 'video', friend.avatarUrl)}
              row={0}
              col={1}
            >
              <button
                type="button"
                className="p-3 rounded-2xl bg-[#FF6F61] hover:bg-[#f06052] text-white font-bold shadow-sm active:scale-95 flex items-center justify-center cursor-pointer"
                title="Gọi video"
              >
                <Video className="w-5 h-5 text-white" />
              </button>
            </EyeFocusable>
          </div>
        </header>

        {/* Camera HUD Bar (First content element directly below header) */}
        <KeyboardHudSlot currentRoute="chat" />
      </div>

      {/* Main Message Stream */}
      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-4 flex flex-col gap-3">
        {loading && (
          <div className="flex justify-center py-10 text-sm font-semibold text-[#3B4B68]">
            Đang tải lịch sử trò chuyện...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <span className="text-4xl">👋</span>
            <span className="font-bold text-[#14213D] text-lg">
              Hãy gửi lời chào đầu tiên tới {friend.name}!
            </span>
            <span className="text-xs text-[#3B4B68]">
              Tin nhắn được truyền tải trực tiếp theo thời gian thực.
            </span>
          </div>
        )}

        {!loading &&
          messages.map(msg => {
            const isMine = msg.sender_id === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} my-1`}
              >
                <div
                  className={`max-w-[82%] px-4 py-3 rounded-[22px] text-base md:text-lg font-bold shadow-sm leading-relaxed ${
                    isMine
                      ? 'bg-[#6AC9F0] text-[#14213D] rounded-br-[4px]'
                      : 'bg-white text-[#14213D] border border-[#14213D]/10 rounded-bl-[4px]'
                  }`}
                >
                  {msg.content}
                </div>

                <div className="flex items-center gap-1.5 px-1 mt-1">
                  <span className="text-[10px] font-semibold text-[#3B4B68]/70">
                    {formatTime(msg.created_at)}
                  </span>
                  {isMine && msg.status === 'sending' && (
                    <span className="text-[10px] italic text-[#3B4B68]">Đang gửi...</span>
                  )}
                </div>
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </main>

      {/* Bottom Composer Bar Container */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 p-2 md:p-3 bg-[#FFF2D6] border-t border-[#14213D]/10 shadow-lg transition-all duration-200 ${isKeyboardOpen ? 'pb-[225px] sm:pb-[255px]' : 'pb-2'}`}>
        <div className="max-w-md md:max-w-xl mx-auto w-full">
          {eyeControlEnabled ? (
            <EyeTextComposer
              value={draft}
              onChange={setDraft}
              placeholder="Nhập tin nhắn..."
              actionLabel="GỬI"
              onSubmit={handleSend}
              onToggleKeyboard={() => setIsKeyboardOpen(!isKeyboardOpen)}
              isKeyboardOpen={isKeyboardOpen}
            />
          ) : (
            <div className="flex items-center gap-2 bg-white rounded-2xl p-2 border-2 border-[#14213D]/15 shadow-sm">
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Nhập tin nhắn nhắn gửi người thân..."
                className="flex-1 px-3 py-2 bg-transparent text-[#14213D] font-medium outline-none text-base"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                className="p-3 rounded-xl bg-[#FF6F61] text-white font-bold hover:bg-[#f06052] transition-all flex items-center justify-center cursor-pointer"
              >
                <Send className="w-5 h-5 fill-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Virtual Keyboard Component (Rendered fixed bottom-0) */}
      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onKeyPress={handleKeyPress}
        onClose={() => setIsKeyboardOpen(false)}
      />
    </div>
  );
}
