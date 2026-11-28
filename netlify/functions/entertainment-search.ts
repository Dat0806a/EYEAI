import { verifyAuthHeader } from "../../server/patientAuth";
import { buildModeQuery, YouTubeNormalizedResult } from "../../server/youtubeBackend";
import { checkInMemoryRateLimit } from "../../server/securityMiddleware";

const MAX_SEARCH_BODY_BYTES = 32 * 1024;
const ALLOWED_MODES = new Set(["books", "radio", "music"]);

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  let allowedOrigin = appUrl || "null";
  if (origin) {
    const cleanOrigin = origin.trim().replace(/\/$/, "");
    if (
      (appUrl && cleanOrigin === appUrl) ||
      cleanOrigin.startsWith("http://localhost:") ||
      cleanOrigin.startsWith("http://127.0.0.1:")
    ) {
      allowedOrigin = cleanOrigin;
    }
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

async function executeSearch(rawQuery: string, mode: string, authHeader?: string) {
  const authRes = await verifyAuthHeader(authHeader, { requirePatient: false });
  if (!authRes.ok) {
    return {
      status: authRes.status,
      data: {
        success: false,
        error: authRes.code || "UNAUTHORIZED",
        message: authRes.error || "Yêu cầu đăng nhập để tìm kiếm giải trí.",
        results: [] as YouTubeNormalizedResult[],
      },
    };
  }

  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return {
      status: 400,
      data: {
        success: false,
        error: "EMPTY_QUERY",
        message: "Nội dung tìm kiếm không được để trống.",
        results: [] as YouTubeNormalizedResult[],
      },
    };
  }

  if (trimmed.length > 120) {
    return {
      status: 400,
      data: {
        success: false,
        error: "QUERY_TOO_LONG",
        message: "Từ khóa tìm kiếm tối đa 120 ký tự.",
        results: [] as YouTubeNormalizedResult[],
      },
    };
  }

  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!apiKey) {
    return {
      status: 500,
      data: {
        success: false,
        error: "YOUTUBE_API_KEY_MISSING",
        message: "Chưa cấu hình YOUTUBE_API_KEY trên máy chủ.",
        results: [] as YouTubeNormalizedResult[],
      },
    };
  }

  const searchQueryUsed = buildModeQuery(trimmed, mode);
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("q", searchQueryUsed);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const status = response.status;
    const reason = errData?.error?.errors?.[0]?.reason || "";
    const errorCode =
      status === 429 || reason === "quotaExceeded"
        ? "QUOTA_EXCEEDED"
        : "YOUTUBE_API_ERROR";

    return {
      status: errorCode === "QUOTA_EXCEEDED" ? 429 : status,
      data: {
        success: false,
        error: errorCode,
        message:
          errorCode === "QUOTA_EXCEEDED"
            ? "Hệ thống đã đạt giới hạn quota tìm kiếm miễn phí. Vui lòng thử lại sau."
            : "Có lỗi xảy ra khi tìm kiếm YouTube.",
        results: [] as YouTubeNormalizedResult[],
      },
    };
  }

  const data = await response.json();
  const items = data?.items || [];
  const normalized: YouTubeNormalizedResult[] = items
    .map((item: any) => ({
      videoId: item?.id?.videoId || "",
      title: decodeHtmlEntities(item?.snippet?.title || "Không có tiêu đề"),
      thumbnail:
        item?.snippet?.thumbnails?.high?.url ||
        item?.snippet?.thumbnails?.medium?.url ||
        item?.snippet?.thumbnails?.default?.url ||
        "",
      channelTitle: decodeHtmlEntities(item?.snippet?.channelTitle || ""),
      publishedAt: item?.snippet?.publishedAt || "",
      description: decodeHtmlEntities(item?.snippet?.description || ""),
      liveBroadcastContent: item?.snippet?.liveBroadcastContent || "none",
    }))
    .filter((item: YouTubeNormalizedResult) => Boolean(item.videoId));

  return {
    status: 200,
    data: {
      success: true,
      mode,
      query: trimmed,
      searchQueryUsed,
      cached: false,
      results: normalized,
    },
  };
}

export default async function (req: Request) {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "METHOD_NOT_ALLOWED",
        message: "Phương thức không được hỗ trợ.",
        results: [],
      }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-nf-client-connection-ip") ||
    "unknown";
  const rate = checkInMemoryRateLimit({
    key: `netlify-ent:${clientIp}`,
    windowMs: 60_000,
    maxRequests: 40,
  });
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.",
        results: [],
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(rate.retryAfterSec ?? 1),
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const url = new URL(req.url);
    let q = url.searchParams.get("q") || "";
    let mode = (url.searchParams.get("mode") || "music").toLowerCase();

    if (req.method === "POST") {
      const rawBody = await req.text();
      if (Buffer.byteLength(rawBody, "utf8") > MAX_SEARCH_BODY_BYTES) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "PAYLOAD_TOO_LARGE",
            message: "Dữ liệu tìm kiếm vượt quá giới hạn 32KB.",
            results: [],
          }),
          {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (typeof body.q === "string") q = body.q;
      if (typeof body.mode === "string") mode = body.mode.toLowerCase();
    }

    if (!ALLOWED_MODES.has(mode)) {
      mode = "music";
    }

    const authHeader = req.headers.get("authorization") || undefined;
    const result = await executeSearch(q, mode, authHeader);
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: "YOUTUBE_API_ERROR",
        message: "Có lỗi xảy ra khi tìm kiếm YouTube.",
        results: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export const config = {
  path: "/api/entertainment/search",
};
