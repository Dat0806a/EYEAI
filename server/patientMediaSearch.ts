export interface ResolvedMealMedia {
  imageUrl: string;
  imageSourceUrl: string | null;
  imageAlt: string;
  imageLicense: string | null;
  imageAuthor: string | null;
  imageProvider: 'GOOGLE_CUSTOM_SEARCH' | 'WEB_IMAGE_SEARCH' | 'FALLBACK_CATALOG';
}

export interface ResolvedExerciseVideo {
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeAuthor: string;
  youtubeAuthorUrl: string;
  youtubeThumbnailUrl: string;
  youtubeUrl: string;
  youtubeVerified: boolean;
  videoProvider: 'YOUTUBE_DATA_API' | 'FALLBACK_CATALOG';
}

export const FALLBACK_FOOD_IMAGES: Record<string, Omit<ResolvedMealMedia, 'imageProvider'>> = {
  BREAKFAST: {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg',
    imageAlt: 'Bữa sáng lành mạnh giàu đạm và rau tươi',
    imageLicense: 'CC BY-SA 4.0',
    imageAuthor: 'Deborah Tjituka',
  },
  LUNCH: {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg',
    imageAlt: 'Cơm kèm cá và rau xanh thanh nhẹ',
    imageLicense: 'CC BY-SA 4.0',
    imageAuthor: 'Cheikh cherif',
  },
  DINNER: {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG',
    imageAlt: 'Bát canh rau củ tươi nhẹ bụng ban đêm',
    imageLicense: 'CC BY-SA 4.0',
    imageAuthor: 'Kolforn',
  },
  SNACK: {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg',
    imageAlt: 'Trái cây tươi và hạt dinh dưỡng',
    imageLicense: 'CC0',
    imageAuthor: 'Roberta Sorge',
  },
  DRINK: {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg',
    imageAlt: 'Tách trà xanh thanh lọc và nước ấm',
    imageLicense: 'CC BY-SA 4.0',
    imageAuthor: 'Major Lyte',
  },
};

export const FALLBACK_EXERCISE_VIDEOS: Array<Omit<ResolvedExerciseVideo, 'videoProvider'>> = [
  {
    youtubeVideoId: 'u08lo0bESJc',
    youtubeTitle: 'Heart Healthy - 1 Mile Walk | Walk at Home',
    youtubeAuthor: 'Walk at Home',
    youtubeAuthorUrl: 'https://www.youtube.com/@LeslieSansonesWalkatHome',
    youtubeThumbnailUrl: 'https://i.ytimg.com/vi/u08lo0bESJc/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=u08lo0bESJc',
    youtubeVerified: true,
  },
  {
    youtubeVideoId: 'v7AYKMP6rOE',
    youtubeTitle: 'Yoga For Complete Beginners - 20 Minute Home Yoga Workout!',
    youtubeAuthor: 'Yoga With Adriene',
    youtubeAuthorUrl: 'https://www.youtube.com/@yogawithadriene',
    youtubeThumbnailUrl: 'https://i.ytimg.com/vi/v7AYKMP6rOE/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=v7AYKMP6rOE',
    youtubeVerified: true,
  },
  {
    youtubeVideoId: '1DYH5ud3zHo',
    youtubeTitle: 'Gentle Chair Yoga for Beginners and Seniors',
    youtubeAuthor: 'Yoga with Kassandra',
    youtubeAuthorUrl: 'https://www.youtube.com/@yogawithkassandra',
    youtubeThumbnailUrl: 'https://i.ytimg.com/vi/1DYH5ud3zHo/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=1DYH5ud3zHo',
    youtubeVerified: true,
  },
];

const CACHE_TTL_MS = 15 * 60 * 1000;
const imageCache = new Map<string, { ts: number; data: ResolvedMealMedia }>();
const videoCache = new Map<string, { ts: number; data: ResolvedExerciseVideo[] }>();

function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return false;
  if (/\.(svg|ico)(\?|$)/i.test(trimmed)) return false;
  return true;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 2500): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EyeTalkPatientAssistant/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Searches Google Custom Search Image API (when configured) or Wikipedia / Openverse / Wikimedia Commons
 * to dynamically find a real, renderable food image matching the recommended dish.
 */
export async function searchDynamicFoodImage(options: {
  name: string;
  mealType?: string;
  searchQuery?: string;
}): Promise<ResolvedMealMedia> {
  const dishName = (options.name || '').trim();
  const mealType = (options.mealType || 'BREAKFAST').toUpperCase();
  const primaryQuery = (options.searchQuery || dishName || 'healthy food').trim();
  const cacheKey = `${mealType}:${dishName.toLowerCase()}:${primaryQuery.toLowerCase()}`;

  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Official Google Custom Search JSON API (Images) when API key + CX are configured
  const cseKey = (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_CSE_API_KEY || '').trim();
  const cseCx = (process.env.GOOGLE_CUSTOM_SEARCH_CX || process.env.GOOGLE_CSE_CX || '').trim();
  if (cseKey && cseCx) {
    const cseUrl = new URL('https://www.googleapis.com/customsearch/v1');
    cseUrl.searchParams.set('key', cseKey);
    cseUrl.searchParams.set('cx', cseCx);
    cseUrl.searchParams.set('q', dishName || primaryQuery);
    cseUrl.searchParams.set('searchType', 'image');
    cseUrl.searchParams.set('imgType', 'photo');
    cseUrl.searchParams.set('safe', 'active');
    cseUrl.searchParams.set('num', '5');

    const cseData = await fetchJsonWithTimeout(cseUrl.toString(), 4500);
    const items = Array.isArray(cseData?.items) ? cseData.items : [];
    for (const item of items) {
      if (isValidImageUrl(item?.link)) {
        const resolved: ResolvedMealMedia = {
          imageUrl: item.link,
          imageSourceUrl: typeof item?.image?.contextLink === 'string' ? item.image.contextLink : null,
          imageAlt: dishName || item.title || 'Hình ảnh món ăn gợi ý',
          imageLicense: null,
          imageAuthor: typeof item?.displayLink === 'string' ? item.displayLink : 'Google Images',
          imageProvider: 'GOOGLE_CUSTOM_SEARCH',
        };
        imageCache.set(cacheKey, { ts: Date.now(), data: resolved });
        return resolved;
      }
    }
  }

  // 2. Openverse public image search (best match for English food query from Gemini)
  const openverseQuery = primaryQuery;
  if (openverseQuery) {
    const ovUrl = new URL('https://api.openverse.org/v1/images/');
    ovUrl.searchParams.set('q', openverseQuery);
    ovUrl.searchParams.set('page_size', '5');
    ovUrl.searchParams.set('mature', 'false');

    const ovData = await fetchJsonWithTimeout(ovUrl.toString(), 4000);
    const ovResults = Array.isArray(ovData?.results) ? ovData.results : [];
    for (const item of ovResults) {
      const candidateUrl = item?.url || item?.thumbnail;
      if (isValidImageUrl(candidateUrl)) {
        const resolved: ResolvedMealMedia = {
          imageUrl: candidateUrl,
          imageSourceUrl: typeof item?.foreign_landing_url === 'string' ? item.foreign_landing_url : null,
          imageAlt: dishName || item?.title || 'Hình ảnh món ăn gợi ý',
          imageLicense: typeof item?.license === 'string' ? item.license.toUpperCase() : null,
          imageAuthor: typeof item?.creator === 'string' && item.creator.trim() ? item.creator.trim() : null,
          imageProvider: 'WEB_IMAGE_SEARCH',
        };
        imageCache.set(cacheKey, { ts: Date.now(), data: resolved });
        return resolved;
      }
    }
  }

  // 3. Vietnamese & English Wikipedia pageimages search (handles Vietnamese dish names very accurately)
  const wikiTargets = [
    { host: 'vi.wikipedia.org', q: dishName || primaryQuery },
    { host: 'en.wikipedia.org', q: primaryQuery },
  ];
  for (const target of wikiTargets) {
    if (!target.q) continue;
    const wikiUrl = new URL(`https://${target.host}/w/api.php`);
    wikiUrl.searchParams.set('action', 'query');
    wikiUrl.searchParams.set('generator', 'search');
    wikiUrl.searchParams.set('gsrsearch', target.q);
    wikiUrl.searchParams.set('gsrlimit', '3');
    wikiUrl.searchParams.set('prop', 'pageimages');
    wikiUrl.searchParams.set('pithumbsize', '800');
    wikiUrl.searchParams.set('format', 'json');

    const wikiData = await fetchJsonWithTimeout(wikiUrl.toString(), 4000);
    const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : [];
    for (const page of pages as any[]) {
      const img = page?.thumbnail?.source;
      if (isValidImageUrl(img)) {
        const resolved: ResolvedMealMedia = {
          imageUrl: img,
          imageSourceUrl: `https://${target.host}/wiki/${encodeURIComponent(String(page.title || '').replace(/\s+/g, '_'))}`,
          imageAlt: dishName || page.title || 'Hình ảnh món ăn gợi ý',
          imageLicense: 'Wikimedia / Wikipedia',
          imageAuthor: null,
          imageProvider: 'WEB_IMAGE_SEARCH',
        };
        imageCache.set(cacheKey, { ts: Date.now(), data: resolved });
        return resolved;
      }
    }
  }

  // 4. Last-resort fallback only when all external searches return nothing
  const fallback = FALLBACK_FOOD_IMAGES[mealType] || FALLBACK_FOOD_IMAGES.BREAKFAST;
  return {
    ...fallback,
    imageAlt: dishName || fallback.imageAlt,
    imageProvider: 'FALLBACK_CATALOG',
  };
}

/**
 * Searches YouTube Data API v3 for embeddable exercise videos (`videoEmbeddable=true`)
 * so patient exercise videos play directly inside the web app instead of linking out.
 */
export async function searchDynamicExerciseVideo(options: {
  name: string;
  searchQuery?: string;
  fallbackIndex?: number;
  excludeVideoIds?: Set<string>;
}): Promise<ResolvedExerciseVideo> {
  const exerciseName = (options.name || '').trim();
  const query = (options.searchQuery || `${exerciseName} hướng dẫn tập tại nhà`).trim();
  const cacheKey = query.toLowerCase();
  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();

  if (apiKey && query) {
    let candidates: ResolvedExerciseVideo[] | null = null;
    const cached = videoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      candidates = cached.data;
    } else {
      const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      ytUrl.searchParams.set('part', 'snippet');
      ytUrl.searchParams.set('type', 'video');
      ytUrl.searchParams.set('videoEmbeddable', 'true');
      ytUrl.searchParams.set('safeSearch', 'strict');
      ytUrl.searchParams.set('maxResults', '5');
      ytUrl.searchParams.set('q', query);
      ytUrl.searchParams.set('key', apiKey);

      const data = await fetchJsonWithTimeout(ytUrl.toString(), 4500);
      const items = Array.isArray(data?.items) ? data.items : [];
      const mapped: ResolvedExerciseVideo[] = items
        .map((item: any) => {
          const videoId = item?.id?.videoId || '';
          if (!videoId) return null;
          const channelId = item?.snippet?.channelId || '';
          return {
            youtubeVideoId: videoId,
            youtubeTitle: decodeHtmlEntities(item?.snippet?.title || exerciseName || 'Video hướng dẫn tập luyện'),
            youtubeAuthor: decodeHtmlEntities(item?.snippet?.channelTitle || 'YouTube'),
            youtubeAuthorUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : 'https://www.youtube.com',
            youtubeThumbnailUrl:
              item?.snippet?.thumbnails?.high?.url ||
              item?.snippet?.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
            youtubeVerified: true,
            videoProvider: 'YOUTUBE_DATA_API' as const,
          };
        })
        .filter((x: ResolvedExerciseVideo | null): x is ResolvedExerciseVideo => x !== null);

      if (mapped.length > 0) {
        videoCache.set(cacheKey, { ts: Date.now(), data: mapped });
        candidates = mapped;
      }
    }

    if (candidates && candidates.length > 0) {
      const picked =
        candidates.find((c) => !options.excludeVideoIds?.has(c.youtubeVideoId)) || candidates[0];
      options.excludeVideoIds?.add(picked.youtubeVideoId);
      return picked;
    }
  }

  const fallbackIdx = (options.fallbackIndex ?? 0) % FALLBACK_EXERCISE_VIDEOS.length;
  const fallback = FALLBACK_EXERCISE_VIDEOS[fallbackIdx];
  options.excludeVideoIds?.add(fallback.youtubeVideoId);
  return {
    ...fallback,
    videoProvider: 'FALLBACK_CATALOG',
  };
}

export async function enrichMealAndExerciseMedia(mealItems: any[], exerciseItems: any[]) {
  const enrichedMeals = await Promise.all(
    (mealItems || []).map(async (m: any) => {
      const resolved = await searchDynamicFoodImage({
        name: m?.name || '',
        mealType: m?.mealType || 'BREAKFAST',
        searchQuery: m?.imageSearchQuery || '',
      });
      return {
        ...resolved,
        ...m,
        imageUrl: resolved.imageUrl,
        imageSourceUrl: resolved.imageSourceUrl,
        imageAlt: resolved.imageAlt || m?.name,
        imageLicense: resolved.imageLicense,
        imageAuthor: resolved.imageAuthor,
        imageProvider: resolved.imageProvider,
      };
    })
  );

  const usedVideoIds = new Set<string>();
  const enrichedExercises: any[] = [];
  for (let idx = 0; idx < (exerciseItems || []).length; idx++) {
    const ex = exerciseItems[idx];
    const resolved = await searchDynamicExerciseVideo({
      name: ex?.name || '',
      searchQuery: ex?.videoSearchQuery || '',
      fallbackIndex: idx,
      excludeVideoIds: usedVideoIds,
    });
    enrichedExercises.push({
      ...resolved,
      ...ex,
      youtubeVideoId: resolved.youtubeVideoId,
      youtubeTitle: resolved.youtubeTitle,
      youtubeAuthor: resolved.youtubeAuthor,
      youtubeAuthorUrl: resolved.youtubeAuthorUrl,
      youtubeThumbnailUrl: resolved.youtubeThumbnailUrl,
      youtubeUrl: resolved.youtubeUrl,
      youtubeVerified: true,
    });
  }

  return { meals: enrichedMeals, exercises: enrichedExercises };
}
