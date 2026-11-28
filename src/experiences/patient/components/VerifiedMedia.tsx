import React, { useState, useEffect } from 'react';
import { CheckCircle, Image as ImageIcon, Video, PlayCircle } from 'lucide-react';
import { ExercisePlanItem, MealPlanItem } from '../../../types/patient';
import { VERIFIED_FOOD_IMAGES } from '../../../services/patientCatalog';

interface VerifiedMediaProps {
  kind: 'meal' | 'exercise';
  item: MealPlanItem | ExercisePlanItem;
}

function getMealFallbackUrl(mealType: MealPlanItem['mealType']): string {
  switch (mealType) {
    case 'LUNCH':
      return VERIFIED_FOOD_IMAGES['fish-rice-lunch'].imageUrl;
    case 'DINNER':
      return VERIFIED_FOOD_IMAGES['vegetable-soup-dinner'].imageUrl;
    case 'SNACK':
      return VERIFIED_FOOD_IMAGES['fruit-nuts-snack'].imageUrl;
    case 'DRINK':
      return VERIFIED_FOOD_IMAGES['green-tea-drink'].imageUrl;
    default:
      return VERIFIED_FOOD_IMAGES['egg-toast-breakfast'].imageUrl;
  }
}

export function VerifiedMedia({ kind, item }: VerifiedMediaProps) {
  const [imageError, setImageError] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const mealItem = kind === 'meal' ? (item as MealPlanItem) : null;
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(mealItem?.imageUrl ?? null);

  useEffect(() => {
    setImageError(false);
    setUsedFallback(false);
    setActiveImageUrl(mealItem?.imageUrl ?? null);
  }, [mealItem?.imageUrl]);

  if (kind === 'meal' && mealItem) {
    if (!activeImageUrl || imageError) {
      return (
        <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-950 text-xs flex items-center gap-2 font-bold">
          <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Hình ảnh minh họa món ăn chưa sẵn sàng.</span>
        </div>
      );
    }

    const providerLabel =
      mealItem.imageProvider === 'GOOGLE_CUSTOM_SEARCH'
        ? 'Google Images'
        : mealItem.imageProvider === 'WEB_IMAGE_SEARCH'
        ? 'Tìm kiếm ảnh tự động'
        : 'Ảnh minh họa món ăn';

    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-xs">
        <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
          <img
            src={activeImageUrl}
            alt={mealItem.imageAlt || mealItem.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={() => {
              if (!usedFallback) {
                setUsedFallback(true);
                setActiveImageUrl(getMealFallbackUrl(mealItem.mealType));
              } else {
                setImageError(true);
              }
            }}
          />
          <div className="absolute top-2.5 right-2.5 bg-emerald-600/90 text-white text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm backdrop-blur-xs">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{providerLabel}</span>
          </div>
        </div>
        <div className="p-3 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/70 border-t border-slate-100 font-medium">
          <span>{mealItem.imageAlt || mealItem.name}</span>
          <div className="flex items-center gap-2 text-slate-500">
            {mealItem.imageAuthor && <span>Nguồn: {mealItem.imageAuthor}</span>}
            {mealItem.imageLicense && <span className="font-bold text-slate-700">({mealItem.imageLicense})</span>}
          </div>
        </div>
      </div>
    );
  }

  // Exercise embedded YouTube player (plays directly inside web app without redirecting out)
  const exercise = item as ExercisePlanItem;
  if (!exercise.youtubeVideoId) {
    return null;
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    exercise.youtubeVideoId
  )}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-xs">
      <div className="relative aspect-video w-full bg-slate-900">
        <iframe
          src={embedUrl}
          title={exercise.youtubeTitle || exercise.name}
          className="w-full h-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <div className="p-3 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/70 border-t border-slate-100 font-medium">
        <div className="flex items-center gap-1.5 text-[#14213D] font-bold truncate">
          <Video className="w-3.5 h-3.5 text-[#FF6F61] shrink-0" />
          <span className="truncate">{exercise.youtubeTitle || exercise.name}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          {exercise.youtubeAuthor && <span>Kênh: {exercise.youtubeAuthor}</span>}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
            <PlayCircle className="w-3 h-3" />
            <span>Phát trực tiếp trong ứng dụng</span>
          </span>
        </div>
      </div>
    </div>
  );
}
