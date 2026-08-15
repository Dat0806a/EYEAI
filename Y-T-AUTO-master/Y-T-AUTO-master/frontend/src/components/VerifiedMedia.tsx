import { useState } from 'react';
import type { ExercisePlanItem, MealPlanItem } from '../types';

type VerifiedMediaProps =
  | { kind: 'meal'; item: MealPlanItem }
  | { kind: 'exercise'; item: ExercisePlanItem };

function hasVerifiedMealImage(
  item: MealPlanItem,
): item is MealPlanItem & {
  imageUrl: string;
  imageAlt: string;
  imageSourceUrl: string;
  imageLicense: string;
  imageAuthor: string;
  imageVerifiedAt: string;
} {
  return [
    item.imageUrl,
    item.imageAlt,
    item.imageSourceUrl,
    item.imageLicense,
    item.imageAuthor,
    item.imageVerifiedAt,
  ].every((value) => typeof value === 'string' && value.trim().length > 0);
}

function MealMedia({ item }: { item: MealPlanItem }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  if (!hasVerifiedMealImage(item)) return null;

  const imageFailed = failedImageUrl === item.imageUrl;

  return (
    <figure className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="aspect-[16/9] bg-gray-100">
        {imageFailed ? (
          <div
            role="status"
            className="flex h-full items-center justify-center px-4 text-center text-sm font-medium text-gray-500"
          >
            Không thể tải ảnh món ăn. Bạn vẫn có thể xem thông tin nguồn bên dưới.
          </div>
        ) : (
          <img
            src={item.imageUrl}
            alt={item.imageAlt}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setFailedImageUrl(item.imageUrl)}
          />
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-gray-500">
        <span>{item.imageAuthor}</span>
        <span aria-hidden="true">•</span>
        <span>{item.imageLicense}</span>
        <a
          href={item.imageSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-blue hover:underline"
        >
          Xem nguồn ảnh
        </a>
      </figcaption>
    </figure>
  );
}

function ExerciseMedia({ item }: { item: ExercisePlanItem }) {
  if (
    item.youtubeVerified !== true ||
    item.youtubeSource !== 'YouTube oEmbed' ||
    !item.youtubeUrl?.trim() ||
    !item.youtubeVideoId?.trim() ||
    !item.youtubeTitle?.trim() ||
    !item.youtubeAuthor?.trim() ||
    !item.youtubeAuthorUrl?.trim() ||
    !item.youtubeThumbnailUrl?.trim() ||
    !item.youtubeVerifiedAt?.trim()
  ) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl border border-sky-blue/20 bg-sky-blue/5 p-3">
      <p className="font-semibold text-navy">{item.youtubeTitle}</p>
      <p className="mt-1 text-xs text-gray-500">{item.youtubeAuthor}</p>
      <a
        href={item.youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm font-semibold text-sky-blue hover:underline"
      >
        Xem video hướng dẫn →
      </a>
    </div>
  );
}

export function VerifiedMedia(props: VerifiedMediaProps) {
  return props.kind === 'meal' ? <MealMedia item={props.item} /> : <ExerciseMedia item={props.item} />;
}
