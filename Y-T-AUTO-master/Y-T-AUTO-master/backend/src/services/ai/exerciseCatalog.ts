export type ExerciseVideoKey = 'walk-at-home' | 'beginner-yoga' | 'chair-yoga';
export const EXERCISE_VIDEO_VERIFIED_AT = '2026-08-09' as const;
export const EXERCISE_VIDEO_SOURCE = 'YouTube oEmbed' as const;
export type ExerciseVideoVerifiedAt = typeof EXERCISE_VIDEO_VERIFIED_AT;

export interface VerifiedExerciseVideo {
  readonly key: ExerciseVideoKey;
  readonly videoId: string;
  readonly title: string;
  readonly authorName: string;
  readonly authorUrl: string;
  readonly thumbnailUrl: string;
  readonly youtubeUrl: string;
  readonly verified: true;
  readonly verifiedBy: 'YOUTUBE_OEMBED';
  readonly verifiedAt: ExerciseVideoVerifiedAt;
}

function verifiedVideo(
  key: ExerciseVideoKey,
  videoId: string,
  title: string,
  authorName: string,
  authorUrl: string,
): VerifiedExerciseVideo {
  return Object.freeze({
    key,
    videoId,
    title,
    authorName,
    authorUrl,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    verified: true,
    verifiedBy: 'YOUTUBE_OEMBED',
    verifiedAt: EXERCISE_VIDEO_VERIFIED_AT,
  });
}

export const verifiedExerciseVideos: Readonly<Record<ExerciseVideoKey, VerifiedExerciseVideo>> = Object.freeze({
  'walk-at-home': verifiedVideo(
    'walk-at-home',
    'u08lo0bESJc',
    'Heart Healthy - 1 Mile Walk | Walk at Home',
    'Walk at Home',
    'https://www.youtube.com/@LeslieSansonesWalkatHome',
  ),
  'beginner-yoga': verifiedVideo(
    'beginner-yoga',
    'v7AYKMP6rOE',
    'Yoga For Complete Beginners - 20 Minute Home Yoga Workout!',
    'Yoga With Adriene',
    'https://www.youtube.com/@yogawithadriene',
  ),
  'chair-yoga': verifiedVideo(
    'chair-yoga',
    '1DYH5ud3zHo',
    'Gentle Chair Yoga for Beginners and Seniors',
    'Yoga with Kassandra',
    'https://www.youtube.com/@yogawithkassandra',
  ),
});

export function listVerifiedVideos(): ReadonlyArray<VerifiedExerciseVideo> {
  return Object.freeze(Object.values(verifiedExerciseVideos));
}
