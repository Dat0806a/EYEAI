import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { BookOpen, Radio, Music, Search, Play, Loader2, AlertCircle, Sparkles, Youtube } from 'lucide-react';
import { EyeTextComposer } from '../modules/virtual-keyboard/EyeTextComposer';
import { VirtualKeyboard } from '../modules/virtual-keyboard/VirtualKeyboard';
import { applyVietnameseAccents } from '../modules/virtual-keyboard/vietnameseTelex';
import { GridItem } from '../modules/virtual-keyboard/types';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import { speakVietnamese } from '../utils/speech';
import { EntertainmentMode, YouTubeNormalizedResult } from '../modules/entertainment/types';
import { ENTERTAINMENT_MODE_CONFIG } from '../modules/entertainment/entertainmentConfig';
import { searchEntertainment } from '../services/entertainmentService';
import { YouTubePlayerView } from '../modules/entertainment/YouTubePlayerView';

interface EntertainmentPageProps {
  onBack: () => void;
}

export function EntertainmentPage({ onBack }: EntertainmentPageProps) {
  const [activeCategory, setActiveCategory] = useState<EntertainmentMode>('books');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<YouTubeNormalizedResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeNormalizedResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<{ code: string; text: string } | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchQueryUsed, setSearchQueryUsed] = useState<string>('');

  const currentModeConfig = ENTERTAINMENT_MODE_CONFIG[activeCategory];

  // Reset player & results when changing category
  const handleCategoryChange = (mode: EntertainmentMode) => {
    setActiveCategory(mode);
    setSelectedVideo(null);
    setResults([]);
    setHasSearched(false);
    setErrorMessage(null);
  };

  // Keyboard key press handler — ONLY updates local draft text, NEVER calls API while typing!
  const handleKeyPress = (item: GridItem) => {
    if (item.type === 'phrase') {
      setSearchQuery(prev => applyVietnameseAccents(prev + ' ' + item.value));
    } else if (item.type === 'letter') {
      setSearchQuery(prev => applyVietnameseAccents(prev + item.value));
    } else if (item.type === 'action') {
      if (item.value === ' ' || item.id === 'l_space') setSearchQuery(prev => prev + ' ');
      else if (item.value === 'BACKSPACE') setSearchQuery(prev => prev.slice(0, -1));
      else if (item.value === 'CLEAR_ALL') setSearchQuery('');
      else if (item.value === 'SEND') {
        setIsKeyboardOpen(false);
        handleExecuteSearch(searchQuery);
      }
    }
  };

  // Explicit Search Execution — ONLY called when user confirms!
  const handleExecuteSearch = async (overrideQuery?: string) => {
    const queryToSearch = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();

    if (!queryToSearch) {
      speakVietnamese('Vui lòng nhập nội dung tìm kiếm');
      return;
    }

    // Duplicate Request Guard: prevent starting another request if already loading
    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSelectedVideo(null);
    speakVietnamese(`Đang tìm ${queryToSearch}`);

    try {
      const response = await searchEntertainment(queryToSearch, activeCategory);

      if (response.success && response.results) {
        setResults(response.results);
        setHasSearched(true);
        setSearchQueryUsed(response.searchQueryUsed || queryToSearch);
        if (response.results.length === 0) {
          setErrorMessage({ code: 'EMPTY_RESULTS', text: 'Không tìm thấy kết quả phù hợp.' });
        }
      } else {
        setResults([]);
        setHasSearched(true);
        const errCode = response.error || 'YOUTUBE_API_ERROR';
        const errText = response.message || 'Không thể tìm kiếm lúc này.';

        if (errCode === 'QUOTA_EXCEEDED') {
          console.warn('[YouTube][QUOTA] Free quota limit reached.');
        }

        setErrorMessage({ code: errCode, text: errText });
      }
    } catch (err) {
      console.error('[EntertainmentPage] Search error:', err);
      setResults([]);
      setHasSearched(true);
      setErrorMessage({ code: 'UNKNOWN_ERROR', text: 'Lỗi kết nối khi tìm kiếm.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Play video item
  const handleSelectVideo = (video: YouTubeNormalizedResult) => {
    setSelectedVideo(video);
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-24">
      <PageHeader title="Giải Trí YouTube" showBack onBack={onBack} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        
        {/* Category Navigation Pills */}
        <div className="grid grid-cols-3 gap-2 w-full">
          <AppButton
            id="cat-books"
            variant={activeCategory === 'books' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleCategoryChange('books')}
            icon={<BookOpen className="w-4 h-4" />}
            row={0}
            col={0}
          >
            <span>Đọc sách</span>
          </AppButton>

          <AppButton
            id="cat-radio"
            variant={activeCategory === 'radio' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleCategoryChange('radio')}
            icon={<Radio className="w-4 h-4" />}
            row={0}
            col={1}
          >
            <span>Radio</span>
          </AppButton>

          <AppButton
            id="cat-music"
            variant={activeCategory === 'music' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleCategoryChange('music')}
            icon={<Music className="w-4 h-4" />}
            row={0}
            col={2}
          >
            <span>Nghe nhạc</span>
          </AppButton>
        </div>

        {/* Search Launcher Bar */}
        <EyeTextComposer
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={currentModeConfig.placeholder}
          actionLabel={isLoading ? 'ĐANG TÌM...' : 'TÌM KIẾM'}
          onSubmit={() => {
            setIsKeyboardOpen(false);
            handleExecuteSearch(searchQuery);
          }}
          onToggleKeyboard={() => setIsKeyboardOpen(!isKeyboardOpen)}
          isKeyboardOpen={isKeyboardOpen}
        />

        {/* Selected Embedded YouTube Player (ONLY ONE Player Instantiated) */}
        {selectedVideo ? (
          <YouTubePlayerView
            item={selectedVideo}
            onBack={() => setSelectedVideo(null)}
          />
        ) : (
          <>
            {/* Loading Indicator */}
            {isLoading && (
              <div className="p-8 rounded-[24px] bg-white border-2 border-[#14213D]/10 shadow-sm flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="w-8 h-8 text-[#FF6F61] animate-spin" />
                <p className="font-extrabold text-sm text-[#14213D]">
                  Đang tìm kiếm dữ liệu từ YouTube Data API...
                </p>
              </div>
            )}

            {/* Error / Quota Notice Banner */}
            {!isLoading && errorMessage && (
              <div className={`p-4 rounded-[20px] border-2 flex flex-col gap-2 ${
                errorMessage.code === 'YOUTUBE_API_KEY_MISSING' || errorMessage.code === 'YOUTUBE_DATA_API_V3_ENABLE_REQUIRED'
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : errorMessage.code === 'QUOTA_EXCEEDED'
                  ? 'bg-rose-50 border-rose-400 text-rose-900'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}>
                <div className="flex items-center gap-2 font-black text-sm sm:text-base">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{errorMessage.code}: {errorMessage.text}</span>
                </div>

                {errorMessage.code === 'YOUTUBE_API_KEY_MISSING' && (
                  <div className="text-xs space-y-1 font-mono bg-white/80 p-3 rounded-[12px] border border-amber-300 text-amber-950 mt-1">
                    <p className="font-bold font-sans text-amber-900">Các bước khắc phục:</p>
                    <p>1. Mở file <code className="bg-amber-200 px-1 py-0.5 rounded">.env</code> trong thư mục root project.</p>
                    <p>2. Thêm dòng: <code className="bg-amber-200 px-1 py-0.5 rounded">YOUTUBE_API_KEY=YOUR_KEY</code></p>
                    <p>3. Lưu file và khởi động lại backend server.</p>
                  </div>
                )}
              </div>
            )}

            {/* Search Results List */}
            {!isLoading && hasSearched && results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base md:text-lg text-[#14213D]">
                    Kết quả tìm kiếm ({results.length}):
                  </h3>
                  <span className="text-xs text-[#3B4B68] font-bold">
                    Từ khóa: "{searchQueryUsed}"
                  </span>
                </div>

                <div className="space-y-3">
                  {results.map((video, idx) => (
                    <EyeFocusable
                      key={video.videoId}
                      id={`result-${video.videoId}`}
                      onSelect={() => handleSelectVideo(video)}
                      row={idx + 1}
                      col={0}
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectVideo(video)}
                        className="w-full bg-white hover:bg-[#FFF2D6]/40 rounded-[20px] p-3 border-2 border-[#14213D]/10 hover:border-[#FF6F61]/50 shadow-xs flex items-center gap-3 text-left transition-all cursor-pointer group"
                      >
                        {/* Video Thumbnail */}
                        <div className="relative w-28 h-20 sm:w-36 sm:h-24 rounded-[14px] overflow-hidden bg-slate-900 flex-shrink-0 border border-[#14213D]/10">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-8 h-8 rounded-full bg-[#FF6F61] flex items-center justify-center shadow-md">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                          </div>
                          {video.liveBroadcastContent === 'live' && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-rose-600 text-white font-black text-[9px] uppercase">
                              LIVE
                            </span>
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                          <h4 className="font-extrabold text-sm sm:text-base text-[#14213D] line-clamp-2 leading-snug group-hover:text-[#FF6F61] transition-colors">
                            {video.title}
                          </h4>
                          <p className="text-xs text-[#3B4B68] font-bold truncate">
                            {video.channelTitle}
                          </p>
                        </div>
                      </button>
                    </EyeFocusable>
                  ))}
                </div>
              </div>
            )}

            {/* Mode Default Suggestions (Displayed when no active search) */}
            {!isLoading && !hasSearched && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#14213D] font-black text-base md:text-lg">
                  <Sparkles className="w-5 h-5 text-[#FF6F61]" />
                  <h3>Gợi ý {currentModeConfig.label.toLowerCase()}:</h3>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {currentModeConfig.defaultSuggestions.map((item, idx) => (
                    <EyeFocusable
                      key={item.id}
                      id={`sug-${item.id}`}
                      onSelect={() => {
                        setSearchQuery(item.query);
                        handleExecuteSearch(item.query);
                      }}
                      row={idx + 1}
                      col={0}
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery(item.query);
                          handleExecuteSearch(item.query);
                        }}
                        className="w-full bg-white rounded-[20px] p-3.5 border-2 border-[#14213D]/10 hover:border-[#6AC9F0] shadow-xs flex items-center justify-between gap-3 text-left transition-all cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm md:text-base text-[#14213D] group-hover:text-[#FF6F61] transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-xs text-[#3B4B68] mt-0.5 font-bold truncate">
                            {item.author} • {item.duration}
                          </p>
                        </div>

                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#14213D]/5 group-hover:bg-[#FF6F61] group-hover:text-white text-[#14213D] flex items-center justify-center transition-colors">
                          <Search className="w-4 h-4" />
                        </div>
                      </button>
                    </EyeFocusable>
                  ))}
                </div>
              </div>
            )}

          </>
        )}

      </main>

      {/* Virtual Keyboard — Action label is "Tìm" */}
      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onClose={() => setIsKeyboardOpen(false)}
        onKeyPress={handleKeyPress}
        actionLabel="Tìm"
      />
    </div>
  );
}
