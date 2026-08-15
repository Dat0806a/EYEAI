import React, { useState } from 'react';
import { ExternalLink, CheckCircle, Image as ImageIcon, Video } from 'lucide-react';
import { ExercisePlanItem, MealPlanItem } from '../../../types/patient';

interface VerifiedMediaProps {
  kind: 'meal' | 'exercise';
  item: MealPlanItem | ExercisePlanItem;
}

export function VerifiedMedia({ kind, item }: VerifiedMediaProps) {
  const [imageError, setImageError] = useState(false);

  if (kind === 'meal') {
    const meal = item as MealPlanItem;
    if (!meal.imageUrl || imageError) {
      return (
        <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-950 text-xs flex items-center gap-2 font-bold">
          <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Hình ảnh minh họa món ăn chưa sẵn sàng.</span>
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-xs">
        <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
          <img
            src={meal.imageUrl}
            alt={meal.imageAlt || meal.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
          <div className="absolute top-2.5 right-2.5 bg-emerald-600/90 text-white text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm backdrop-blur-xs">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Wikimedia Verified</span>
          </div>
        </div>
        <div className="p-3 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/70 border-t border-slate-100 font-medium">
          <span>{meal.imageAlt || meal.name}</span>
          <div className="flex items-center gap-2 text-slate-500">
            {meal.imageAuthor && <span>Tác giả: {meal.imageAuthor}</span>}
            {meal.imageLicense && <span className="font-bold text-slate-700">({meal.imageLicense})</span>}
            {meal.imageSourceUrl && (
              <a
                href={meal.imageSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#0E6C99] hover:underline inline-flex items-center gap-0.5 font-bold"
              >
                Nguồn <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Exercise YouTube media
  const exercise = item as ExercisePlanItem;
  if (!exercise.youtubeVideoId) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-xs">
      <div className="relative aspect-video w-full bg-slate-900">
        <iframe
          src={`https://www.youtube.com/embed/${exercise.youtubeVideoId}`}
          title={exercise.youtubeTitle || exercise.name}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="p-3 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/70 border-t border-slate-100 font-medium">
        <div className="flex items-center gap-1.5 text-[#14213D] font-bold truncate">
          <Video className="w-3.5 h-3.5 text-[#FF6F61] shrink-0" />
          <span className="truncate">{exercise.youtubeTitle || exercise.name}</span>
        </div>
        {exercise.youtubeAuthor && (
          <div className="flex items-center gap-1 text-slate-500">
            <span>Kênh: {exercise.youtubeAuthor}</span>
            {exercise.youtubeAuthorUrl && (
              <a
                href={exercise.youtubeAuthorUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#0E6C99] hover:underline inline-flex items-center gap-0.5 font-bold ml-1"
              >
                Xem kênh <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
