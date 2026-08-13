import { EntertainmentMode, EntertainmentSearchResponse } from '../modules/entertainment/types';

function buildModeQuery(q: string, mode: string): string {
  const cleanQ = q.trim();
  const lowerQ = cleanQ.toLowerCase();

  switch (mode) {
    case 'books':
      if (lowerQ.includes('sách') || lowerQ.includes('audiobook') || lowerQ.includes('truyện')) {
        return cleanQ;
      }
      return `${cleanQ} sách nói`;

    case 'radio':
      if (lowerQ.includes('radio') || lowerQ.includes('đài') || lowerQ.includes('vov') || lowerQ.includes('trực tiếp')) {
        return cleanQ;
      }
      return `${cleanQ} radio`;

    case 'music':
    default:
      if (lowerQ.includes('nhạc') || lowerQ.includes('music') || lowerQ.includes('mv') || lowerQ.includes('song')) {
        return cleanQ;
      }
      return `${cleanQ} nhạc`;
  }
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

async function searchYouTubeDirect(query: string, mode: EntertainmentMode): Promise<EntertainmentSearchResponse> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY || import.meta.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'YOUTUBE_API_KEY_MISSING',
      message: 'Chưa cấu hình VITE_YOUTUBE_API_KEY.',
      results: [],
    };
  }

  const searchQueryUsed = buildModeQuery(query, mode);

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('q', searchQueryUsed);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return {
        success: false,
        error: 'YOUTUBE_API_ERROR',
        message: 'Lỗi khi gọi YouTube API trực tiếp.',
        results: [],
      };
    }

    const data = await response.json();
    const items = data?.items || [];
    const normalized = items
      .map((item: any) => ({
        videoId: item?.id?.videoId || '',
        title: decodeHtmlEntities(item?.snippet?.title || 'Không có tiêu đề'),
        thumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || '',
        channelTitle: decodeHtmlEntities(item?.snippet?.channelTitle || ''),
        publishedAt: item?.snippet?.publishedAt || '',
        description: decodeHtmlEntities(item?.snippet?.description || ''),
        liveBroadcastContent: item?.snippet?.liveBroadcastContent || 'none',
      }))
      .filter((item: any) => Boolean(item.videoId));

    return {
      success: true,
      mode,
      query,
      searchQueryUsed,
      cached: false,
      results: normalized,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'DIRECT_FETCH_ERROR',
      message: err?.message || 'Không thể kết nối đến YouTube API.',
      results: [],
    };
  }
}

/**
 * Calls Express Backend endpoint GET /api/entertainment/search
 * With seamless direct fallback on static hosting (Netlify/Vercel)
 */
export async function searchEntertainment(
  query: string,
  mode: EntertainmentMode
): Promise<EntertainmentSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'EMPTY_QUERY',
      message: 'Nội dung tìm kiếm không được để trống.',
      results: [],
    };
  }

  try {
    const url = `/api/entertainment/search?q=${encodeURIComponent(trimmed)}&mode=${mode}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const data: EntertainmentSearchResponse = await response.json();
      return data;
    }

    // Fallback to direct client-side YouTube search if server returns 404/HTML (e.g. Netlify Static Host)
    return await searchYouTubeDirect(trimmed, mode);
  } catch (error: any) {
    // Fallback to direct client-side YouTube search on network error
    return await searchYouTubeDirect(trimmed, mode);
  }
}
