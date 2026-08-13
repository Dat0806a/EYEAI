import React from 'react';
import { ChatMessage } from '../../types';
import { Volume2, Bot, User } from 'lucide-react';
import { speakVietnamese } from '../../utils/speech';

interface MessageBubbleProps {
  key?: React.Key;
  message: ChatMessage;
  isAI?: boolean;
}

export function MessageBubble({ message, isAI = false }: MessageBubbleProps) {
  const isUser = message.sender === 'user';
  const isSystem = message.sender === 'system';

  const handleSpeak = () => {
    speakVietnamese(message.text);
  };

  if (isSystem) {
    return (
      <div className="w-full flex justify-center my-2">
        <div className="px-4 py-2 rounded-full bg-[#14213D]/5 text-[#3B4B68] text-xs font-bold border border-[#14213D]/10 max-w-md text-center">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full flex gap-2.5 my-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-9 h-9 rounded-full bg-[#6AC9F0]/20 border border-[#6AC9F0]/50 flex items-center justify-center text-[#14213D] flex-shrink-0">
          <Bot className="w-5 h-5 text-[#14213D]" />
        </div>
      )}

      <div className="max-w-[82%] flex flex-col gap-1">
        <div
          className={`p-4 rounded-[22px] shadow-xs text-base md:text-lg font-bold leading-relaxed relative group ${
            isUser
              ? 'bg-[#14213D] text-[#FFF2D6] rounded-tr-xs border border-[#14213D]'
              : 'bg-white text-[#14213D] rounded-tl-xs border-2 border-[#6AC9F0]/40'
          }`}
        >
          <p>{message.text}</p>

          <button
            type="button"
            onClick={handleSpeak}
            className={`mt-2 inline-flex items-center gap-1 text-xs font-bold opacity-80 hover:opacity-100 transition-opacity ${
              isUser ? 'text-[#6AC9F0]' : 'text-[#3B4B68]'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Phát âm</span>
          </button>
        </div>

        <span className={`text-[11px] font-medium text-[#3B4B68] px-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {isUser && (
        <div className="w-9 h-9 rounded-full bg-[#14213D] border border-[#14213D] flex items-center justify-center text-[#FFF2D6] flex-shrink-0">
          <User className="w-5 h-5 text-[#FFF2D6]" />
        </div>
      )}
    </div>
  );
}
