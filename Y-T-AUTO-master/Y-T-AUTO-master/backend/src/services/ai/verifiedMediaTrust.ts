import {
  ExercisePlan,
  MealPlan,
  UnverifiedExerciseYoutubeFields,
  UnverifiedMealImageFields,
  VerifiedExerciseYoutubeFields,
  VerifiedMealImageFields,
} from './types';
import { listVerifiedFoodImages, VerifiedFoodImage } from './foodImageCatalog';
import {
  EXERCISE_VIDEO_SOURCE,
  listVerifiedVideos,
  VerifiedExerciseVideo,
} from './exerciseCatalog';

type MediaRecord = Record<string, unknown>;

const verifiedFoodImageList = listVerifiedFoodImages();
const verifiedExerciseVideoList = listVerifiedVideos();

function unverifiedMealImageFields(): UnverifiedMealImageFields {
  return {
    imageUrl: null,
    imageAlt: null,
    imageSourceUrl: null,
    imageLicense: null,
    imageAuthor: null,
    imageVerifiedAt: null,
  };
}

function unverifiedExerciseYoutubeFields(): UnverifiedExerciseYoutubeFields {
  return {
    youtubeUrl: null,
    youtubeVideoId: null,
    youtubeTitle: null,
    youtubeAuthor: null,
    youtubeAuthorUrl: null,
    youtubeThumbnailUrl: null,
    youtubeVerified: false,
    youtubeSource: null,
    youtubeVerifiedAt: null,
  };
}

function mealImageFields(image: VerifiedFoodImage): VerifiedMealImageFields {
  return {
    imageUrl: image.imageUrl,
    imageAlt: image.alt,
    imageSourceUrl: image.sourceUrl,
    imageLicense: image.license,
    imageAuthor: image.author,
    imageVerifiedAt: image.verifiedAt,
  };
}

function exerciseYoutubeFields(video: VerifiedExerciseVideo): VerifiedExerciseYoutubeFields {
  return {
    youtubeUrl: video.youtubeUrl,
    youtubeVideoId: video.videoId,
    youtubeTitle: video.title,
    youtubeAuthor: video.authorName,
    youtubeAuthorUrl: video.authorUrl,
    youtubeThumbnailUrl: video.thumbnailUrl,
    youtubeVerified: true,
    youtubeSource: EXERCISE_VIDEO_SOURCE,
    youtubeVerifiedAt: video.verifiedAt,
  };
}

function findTrustedMealImage(input: MediaRecord): VerifiedMealImageFields | undefined {
  for (const image of verifiedFoodImageList) {
    const expected = mealImageFields(image);
    if (
      input.imageUrl === expected.imageUrl
      && input.imageAlt === expected.imageAlt
      && input.imageSourceUrl === expected.imageSourceUrl
      && input.imageLicense === expected.imageLicense
      && input.imageAuthor === expected.imageAuthor
      && input.imageVerifiedAt === expected.imageVerifiedAt
    ) {
      return expected;
    }
  }
  return undefined;
}

function findTrustedExerciseVideo(input: MediaRecord): VerifiedExerciseYoutubeFields | undefined {
  for (const video of verifiedExerciseVideoList) {
    const expected = exerciseYoutubeFields(video);
    if (
      input.youtubeUrl === expected.youtubeUrl
      && input.youtubeVideoId === expected.youtubeVideoId
      && input.youtubeTitle === expected.youtubeTitle
      && input.youtubeAuthor === expected.youtubeAuthor
      && input.youtubeAuthorUrl === expected.youtubeAuthorUrl
      && input.youtubeThumbnailUrl === expected.youtubeThumbnailUrl
      && input.youtubeSource === expected.youtubeSource
      && input.youtubeVerifiedAt === expected.youtubeVerifiedAt
    ) {
      return expected;
    }
  }
  return undefined;
}

function isAllNullMealImage(input: MediaRecord): boolean {
  return input.imageUrl === null
    && input.imageAlt === null
    && input.imageSourceUrl === null
    && input.imageLicense === null
    && input.imageAuthor === null
    && input.imageVerifiedAt === null;
}

function isAllNullExerciseVideo(input: MediaRecord): boolean {
  return input.youtubeUrl === null
    && input.youtubeVideoId === null
    && input.youtubeTitle === null
    && input.youtubeAuthor === null
    && input.youtubeAuthorUrl === null
    && input.youtubeThumbnailUrl === null
    && input.youtubeSource === null
    && input.youtubeVerifiedAt === null;
}

export function assertTrustedPlanMedia(mealPlan: MealPlan, exercisePlan: ExercisePlan): void {
  for (const item of mealPlan.items) {
    const media = item as unknown as MediaRecord;
    if (!isAllNullMealImage(media) && !findTrustedMealImage(media)) {
      throw new Error('Meal plan contains untrusted image provenance.');
    }
  }

  for (const item of exercisePlan.items) {
    const media = item as unknown as MediaRecord;
    const trustedVerified = media.youtubeVerified === true && findTrustedExerciseVideo(media);
    const trustedUnverified = media.youtubeVerified === false && isAllNullExerciseVideo(media);
    if (!trustedVerified && !trustedUnverified) {
      throw new Error('Exercise plan contains untrusted YouTube provenance.');
    }
  }
}

export function sanitizeMealImageMedia(
  input: MediaRecord,
): VerifiedMealImageFields | UnverifiedMealImageFields {
  return findTrustedMealImage(input) ?? unverifiedMealImageFields();
}

export function sanitizeExerciseYoutubeMedia(
  input: MediaRecord,
): VerifiedExerciseYoutubeFields | UnverifiedExerciseYoutubeFields {
  const trusted = findTrustedExerciseVideo(input);
  if ((input.youtubeVerified === 1 || input.youtubeVerified === true) && trusted) {
    return trusted;
  }
  return unverifiedExerciseYoutubeFields();
}
