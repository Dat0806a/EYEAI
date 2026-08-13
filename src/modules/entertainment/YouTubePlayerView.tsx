import React, { useEffect } from 'react';
import { ArrowLeft, Play, ExternalLink, Radio, Tv } from 'lucide-react';
import { YouTubeNormalizedResult } from './types';
import { EyeFocusable } from '../eye-control/EyeFocusable';
import { speakVietnamese } from '../../utils/speech';

interface YouTubePlayerViewProps {
  item: YouTubeNormalizedResult;
  onBack: () => void;
}

export function YouTubePlayerView({ item, onBack }: YouTubePlayerViewProps) {
  useEffect(() => {
    // Announce video playback via Speech
    speakVietnamese(`Mở video ${item.title}`);

    return () => {
      // Cleanup when player unmounts
    };
  }, [item]);

  const embedUrl = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;

  return (
    <div className="w-full bg-white rounded-[24px] border-2 border-[#14213D]/15 shadow-md p-3 sm:p-4 flex flex-col gap-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-[#14213D]/10 pb-3">
        <EyeFocusable id="btn-player-back" onSelect={onBack}>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[14px] bg-[#14213D]/5 hover:bg-[#14213D]/10 text-[#14213D] font-extrabold text-xs sm:text-sm border border-[#14213D]/15 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-[#14213D]" />
            <span>Quay lại danh sách</span>
          </button>
        </EyeFocusable>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6AC9F0]/20 text-[#14213D] text-xs font-black">
          <Play className="w-3.5 h-3.5 fill-[#14213D] animate-pulse" />
          <span>Đang phát</span>
        </div>
      </div>

      {/* Official YouTube Responsive 16:9 Embedded Player */}
      <div className="relative w-full aspect-video rounded-[18px] overflow-hidden bg-slate-950 border border-[#14213D]/20 shadow-inner">
        <iframe
          src={embedUrl}
          title={item.title}
          className="absolute top-0 left-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Video Details */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-black text-lg sm:text-xl text-[#14213D] leading-snug">
            {item.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#3B4B68] font-bold">
          <span className="text-[#14213D] font-black">{item.channelTitle}</span>
          {item.publishedAt && (
            <>
              <span>•</span>
              <span>{new Date(item.publishedAt).toLocaleDateString('vi-VN')}</span>
            </>
          )}
          {item.liveBroadcastContent === 'live' && (
            <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px] uppercase">
              Trực tiếp
            </span>
          )}
        </div>

        {item.description && (
          <p className="text-xs sm:text-sm text-[#3B4B68]/80 line-clamp-3 bg-[#FFF2D6]/40 p-2.5 rounded-[12px] border border-[#14213D]/10 mt-1">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}
