import express from "express";

export interface YouTubeNormalizedResult {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  liveBroadcastContent?: string;
}

interface CacheItem {
  timestamp: number;
  results: YouTubeNormalizedResult[];
  searchQueryUsed: string;
}

// In-Memory Server-Side Cache for FREE QUOTA protection
const searchCache = new Map<string, CacheItem>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Pending requests map to prevent duplicate simultaneous requests
const pendingRequests = new Map<string, Promise<{ results: YouTubeNormalizedResult[]; searchQueryUsed: string }>>();

/**
 * Transforms user search query according to mode strategy
 */
export function buildModeQuery(q: string, mode: string): string {
  const cleanQ = q.trim();
  const lowerQ = cleanQ.toLowerCase();

  switch (mode) {
    case "books":
      if (lowerQ.includes("sách") || lowerQ.includes("audiobook") || lowerQ.includes("truyện")) {
        return cleanQ;
      }
      return `${cleanQ} sách nói`;

    case "radio":
      if (lowerQ.includes("radio") || lowerQ.includes("đài") || lowerQ.includes("vov") || lowerQ.includes("trực tiếp")) {
        return cleanQ;
      }
      return `${cleanQ} radio`;

    case "music":
    default:
      if (lowerQ.includes("nhạc") || lowerQ.includes("music") || lowerQ.includes("mv") || lowerQ.includes("song")) {
        return cleanQ;
      }
      return `${cleanQ} nhạc`;
  }
}

/**
 * Clean HTML entities in YouTube titles & descriptions (e.g. &quot;, &#39;, &amp;)
 */
function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Express handler for GET /api/entertainment/search
 */
export async function handleEntertainmentSearch(req: express.Request, res: express.Response) {
  try {
    const rawQuery = (req.query.q as string || req.body?.q as string || "").trim();
    const mode = (req.query.mode as string || req.body?.mode as string || "music").toLowerCase();

    // 1. Empty query check - DO NOT call YouTube API
    if (!rawQuery) {
      res.status(400).json({
        success: false,
        error: "EMPTY_QUERY",
        message: "Nội dung tìm kiếm không được để trống.",
        results: [],
      });
      return;
    }

    // 2. Validate YOUTUBE_API_KEY
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("[YouTube] YOUTUBE_API_KEY is missing in process.env");
      res.status(500).json({
        success: false,
        error: "YOUTUBE_API_KEY_MISSING",
        message: "Chưa cấu hình YOUTUBE_API_KEY trong hệ thống máy chủ backend.",
        results: [],
      });
      return;
    }

    const searchQueryUsed = buildModeQuery(rawQuery, mode);
    const cacheKey = `${mode}:${rawQuery.toLowerCase()}`;

    // 3. Check Cache
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[YouTube][CACHE HIT] key="${cacheKey}"`);
      res.json({
        success: true,
        mode,
        query: rawQuery,
        searchQueryUsed: cached.searchQueryUsed,
        cached: true,
        results: cached.results,
      });
      return;
    }

    // 4. Duplicate pending request guard
    let searchPromise = pendingRequests.get(cacheKey);
    if (!searchPromise) {
      searchPromise = (async () => {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("type", "video");
        url.searchParams.set("maxResults", "10");
        url.searchParams.set("q", searchQueryUsed);
        url.searchParams.set("key", apiKey);

        console.log(`[YouTube][API REQUEST] mode="${mode}" query="${searchQueryUsed}"`);

        const response = await fetch(url.toString(), {
          headers: {
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const status = response.status;
          const errorMsg = errData?.error?.message || response.statusText;
          const reason = errData?.error?.errors?.[0]?.reason || "";

          console.error(`[YouTube][API ERROR] status=${status} reason=${reason} msg=${errorMsg}`);

          if (status === 400 && (reason === "keyInvalid" || errorMsg.includes("API key not valid"))) {
            const err = new Error("YOUTUBE_API_KEY_INVALID");
            (err as any).statusCode = 403;
            (err as any).errorCode = "YOUTUBE_API_KEY_INVALID";
            throw err;
          }

          if (reason === "accessNotConfigured" || reason === "apiNotEnabled" || errorMsg.includes("has not been used")) {
            const err = new Error("YOUTUBE_DATA_API_V3_ENABLE_REQUIRED");
            (err as any).statusCode = 403;
            (err as any).errorCode = "YOUTUBE_DATA_API_V3_ENABLE_REQUIRED";
            throw err;
          }

          if (status === 429 || reason === "quotaExceeded" || errorMsg.includes("quota")) {
            const err = new Error("QUOTA_EXCEEDED");
            (err as any).statusCode = 429;
            (err as any).errorCode = "QUOTA_EXCEEDED";
            throw err;
          }

          const err = new Error("YOUTUBE_API_ERROR");
          (err as any).statusCode = status;
          (err as any).errorCode = "YOUTUBE_API_ERROR";
          (err as any).detail = errorMsg;
          throw err;
        }

        const data = await response.json();
        const items = data?.items || [];

        const normalized: YouTubeNormalizedResult[] = items.map((item: any) => ({
          videoId: item?.id?.videoId || "",
          title: decodeHtmlEntities(item?.snippet?.title || "Không có tiêu đề"),
          thumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || "",
          channelTitle: decodeHtmlEntities(item?.snippet?.channelTitle || ""),
          publishedAt: item?.snippet?.publishedAt || "",
          description: decodeHtmlEntities(item?.snippet?.description || ""),
          liveBroadcastContent: item?.snippet?.liveBroadcastContent || "none",
        })).filter((item: YouTubeNormalizedResult) => Boolean(item.videoId));

        // Save to cache
        searchCache.set(cacheKey, {
          timestamp: Date.now(),
          results: normalized,
          searchQueryUsed,
        });

        return { results: normalized, searchQueryUsed };
      })();

      pendingRequests.set(cacheKey, searchPromise);
    }

    try {
      const { results, searchQueryUsed: finalQueryUsed } = await searchPromise;
      res.json({
        success: true,
        mode,
        query: rawQuery,
        searchQueryUsed: finalQueryUsed,
        cached: false,
        results,
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (err: any) {
    const errorCode = err?.errorCode || "YOUTUBE_API_ERROR";
    const statusCode = err?.statusCode || 500;

    let userMessage = "Có lỗi xảy ra khi tìm kiếm YouTube.";

    if (errorCode === "YOUTUBE_API_KEY_INVALID") {
      userMessage = "YOUTUBE_API_KEY không hợp lệ hoặc không có quyền truy cập.";
    } else if (errorCode === "YOUTUBE_DATA_API_V3_ENABLE_REQUIRED") {
      userMessage = "Dịch vụ YouTube Data API v3 chưa được kích hoạt trên Google Cloud Console.";
    } else if (errorCode === "QUOTA_EXCEEDED") {
      userMessage = "Tạm thời chưa thể tìm kiếm thêm do hệ thống đạt giới hạn quota miễn phí. Vui lòng thử lại sau.";
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: userMessage,
      results: [],
    });
  }
}
