import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Rewind,
  FastForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { YouTubeNormalizedResult } from './types';
import { EyeFocusable } from '../eye-control/EyeFocusable';
import { speakVietnamese } from '../../utils/speech';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface YouTubePlayerViewProps {
  item: YouTubeNormalizedResult;
  onBack: () => void;
}

export function YouTubePlayerView({ item, onBack }: YouTubePlayerViewProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(100);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<any>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    speakVietnamese(`Mở video ${item.title}`);

    const initYTPlayer = () => {
      if (window.YT && window.YT.Player && iframeRef.current) {
        try {
          playerRef.current = new window.YT.Player(iframeRef.current, {
            events: {
              onReady: (event: any) => {
                try {
                  const vol = event.target.getVolume();
                  if (typeof vol === 'number') setVolume(vol);
                  const dur = event.target.getDuration();
                  if (typeof dur === 'number') setDuration(dur);
                  const muted = event.target.isMuted();
                  setIsMuted(!!muted);
                } catch (e) {
                  console.warn('Error reading YT player state:', e);
                }
              },
              onStateChange: (event: any) => {
                // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
                if (event.data === 1) setIsPlaying(true);
                else if (event.data === 2 || event.data === 0) setIsPlaying(false);
              },
            },
          });
        } catch (err) {
          console.warn('[YouTubePlayerView] Could not attach YT.Player:', err);
        }
      }
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = () => {
        initYTPlayer();
      };
    } else {
      initYTPlayer();
    }

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [item]);

  // Periodically update progress time
  useEffect(() => {
    progressTimerRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          const cur = playerRef.current.getCurrentTime();
          if (typeof cur === 'number') setCurrentTime(cur);
          const dur = playerRef.current.getDuration();
          if (typeof dur === 'number' && dur > 0) setDuration(dur);
        } catch (e) {
          // ignore
        }
      }
    }, 1000);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const sendPostMessage = (func: string, args: any[] = []) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      } catch (e) {
        console.warn('postMessage error:', e);
      }
    }
  };

  const handleTogglePlayPause = () => {
    if (isPlaying) {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        playerRef.current.pauseVideo();
      }
      sendPostMessage('pauseVideo');
      setIsPlaying(false);
      speakVietnamese('Tạm dừng video');
    } else {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
      sendPostMessage('playVideo');
      setIsPlaying(true);
      speakVietnamese('Tiếp tục phát');
    }
  };

  const handleSeek = (seconds: number) => {
    let targetTime = currentTime + seconds;
    if (duration > 0) {
      targetTime = Math.max(0, Math.min(targetTime, duration));
    } else {
      targetTime = Math.max(0, targetTime);
    }

    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(targetTime, true);
    }
    sendPostMessage('seekTo', [targetTime, true]);
    setCurrentTime(targetTime);

    if (seconds < 0) {
      speakVietnamese(`Tua lùi ${Math.abs(seconds)} giây`);
    } else {
      speakVietnamese(`Tua tới ${seconds} giây`);
    }
  };

  const handleVolumeChange = (delta: number) => {
    const newVol = Math.max(0, Math.min(100, volume + delta));
    setVolume(newVol);
    if (isMuted && newVol > 0) setIsMuted(false);

    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(newVol);
      if (isMuted && newVol > 0 && typeof playerRef.current.unMute === 'function') {
        playerRef.current.unMute();
      }
    }
    sendPostMessage('setVolume', [newVol]);
    if (isMuted && newVol > 0) sendPostMessage('unMute');

    speakVietnamese(`${delta > 0 ? 'Tăng' : 'Giảm'} âm lượng ${newVol} phần trăm`);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);

    if (playerRef.current) {
      if (nextMute && typeof playerRef.current.mute === 'function') {
        playerRef.current.mute();
      } else if (!nextMute && typeof playerRef.current.unMute === 'function') {
        playerRef.current.unMute();
      }
    }
    sendPostMessage(nextMute ? 'mute' : 'unMute');

    speakVietnamese(nextMute ? 'Tắt tiếng' : 'Bật tiếng');
  };

  const formatTime = (timeInSec: number) => {
    if (!timeInSec || isNaN(timeInSec)) return '00:00';
    const totalSec = Math.floor(timeInSec);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const embedUrl = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="w-full bg-white rounded-[24px] border-2 border-[#14213D]/15 shadow-md p-3 sm:p-5 flex flex-col gap-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-[#14213D]/10 pb-3">
        <EyeFocusable id="btn-player-back" onSelect={onBack}>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-[14px] bg-[#14213D]/5 hover:bg-[#14213D]/10 text-[#14213D] font-extrabold text-xs sm:text-sm border border-[#14213D]/15 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-[#14213D]" />
            <span>Quay lại danh sách</span>
          </button>
        </EyeFocusable>

        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-colors ${
          isPlaying
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'bg-amber-100 text-amber-800 border border-amber-300'
        }`}>
          {isPlaying ? (
            <>
              <Play className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600 animate-pulse" />
              <span>Đang phát</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 fill-amber-600 text-amber-600" />
              <span>Tạm dừng</span>
            </>
          )}
        </div>
      </div>

      {/* Official YouTube Responsive 16:9 Embedded Player */}
      <div className="relative w-full aspect-video rounded-[18px] overflow-hidden bg-slate-950 border border-[#14213D]/20 shadow-inner">
        <iframe
          ref={iframeRef}
          id="yt-player-iframe"
          src={embedUrl}
          title={item.title}
          className="absolute top-0 left-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Progress Bar & Time Display */}
      <div className="flex flex-col gap-1.5 px-1">
        <div className="flex items-center justify-between text-xs font-extrabold text-[#14213D]">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-[#14213D]/10 relative">
          <div
            className="h-full bg-[#FF6F61] transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* EYE-FOCUSABLE PLAYBACK & VOLUME CONTROLS */}
      <div className="p-3 bg-[#FFF2D6]/30 border-2 border-[#14213D]/10 rounded-[20px] flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-[#14213D] uppercase tracking-wider">
            Điều khiển xem video
          </span>
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#3B4B68]">
            <span>Âm lượng:</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-[#14213D]/15 font-mono font-black text-[#14213D]">
              {isMuted ? 'TẮT' : `${volume}%`}
            </span>
          </div>
        </div>

        {/* Row 1: Tua & Play/Pause */}
        <div className="grid grid-cols-5 gap-2 w-full">
          <EyeFocusable id="btn-player-seek-m30" onSelect={() => handleSeek(-30)}>
            <button
              type="button"
              onClick={() => handleSeek(-30)}
              className="w-full min-h-[48px] py-2 px-1 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4 text-[#14213D]" />
              <span>-30s</span>
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-seek-m10" onSelect={() => handleSeek(-10)}>
            <button
              type="button"
              onClick={() => handleSeek(-10)}
              className="w-full min-h-[48px] py-2 px-1 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Rewind className="w-4 h-4 text-[#14213D]" />
              <span>-10s</span>
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-toggle-play" onSelect={handleTogglePlayPause}>
            <button
              type="button"
              onClick={handleTogglePlayPause}
              className={`w-full min-h-[48px] py-2 px-1 rounded-[14px] border-2 font-black text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 shadow-md transition-all cursor-pointer active:scale-95 ${
                isPlaying
                  ? 'bg-[#FF6F61] text-white border-[#FF6F61] hover:bg-[#f06052]'
                  : 'bg-[#6AC9F0] text-[#14213D] border-[#6AC9F0] hover:bg-[#5bbce3]'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5 fill-white text-white" />
                  <span>TẠM DỪNG</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-[#14213D] text-[#14213D] ml-0.5" />
                  <span>TIẾP TỤC</span>
                </>
              )}
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-seek-p10" onSelect={() => handleSeek(10)}>
            <button
              type="button"
              onClick={() => handleSeek(10)}
              className="w-full min-h-[48px] py-2 px-1 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <FastForward className="w-4 h-4 text-[#14213D]" />
              <span>+10s</span>
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-seek-p30" onSelect={() => handleSeek(30)}>
            <button
              type="button"
              onClick={() => handleSeek(30)}
              className="w-full min-h-[48px] py-2 px-1 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <RotateCw className="w-4 h-4 text-[#14213D]" />
              <span>+30s</span>
            </button>
          </EyeFocusable>
        </div>

        {/* Row 2: Tăng / Giảm tiếng & Tắt tiếng */}
        <div className="grid grid-cols-3 gap-2 w-full">
          <EyeFocusable id="btn-player-vol-down" onSelect={() => handleVolumeChange(-15)}>
            <button
              type="button"
              onClick={() => handleVolumeChange(-15)}
              className="w-full min-h-[44px] py-2 px-3 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Volume1 className="w-4 h-4 text-[#14213D] flex-shrink-0" />
              <span>Giảm âm (-15%)</span>
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-vol-mute" onSelect={handleToggleMute}>
            <button
              type="button"
              onClick={handleToggleMute}
              className={`w-full min-h-[44px] py-2 px-3 rounded-[14px] border-2 font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95 ${
                isMuted
                  ? 'bg-rose-100 border-rose-400 text-rose-900'
                  : 'bg-white border-[#14213D]/15 text-[#14213D] hover:bg-slate-100'
              }`}
            >
              <VolumeX className={`w-4 h-4 flex-shrink-0 ${isMuted ? 'text-rose-600' : 'text-[#14213D]'}`} />
              <span>{isMuted ? 'Bật tiếng' : 'Tắt tiếng'}</span>
            </button>
          </EyeFocusable>

          <EyeFocusable id="btn-player-vol-up" onSelect={() => handleVolumeChange(15)}>
            <button
              type="button"
              onClick={() => handleVolumeChange(15)}
              className="w-full min-h-[44px] py-2 px-3 rounded-[14px] bg-white hover:bg-slate-100 border-2 border-[#14213D]/15 text-[#14213D] font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Volume2 className="w-4 h-4 text-[#14213D] flex-shrink-0" />
              <span>Tăng âm (+15%)</span>
            </button>
          </EyeFocusable>
        </div>
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

