// Netlify Function for Vietnamese TTS Audio Proxy
// Supports both modern Netlify V2 (Web Standards Request/Response) and V1 (AWS Lambda)
// Bo trung chuyen am thanh tieng Viet (`audio/mpeg`) tu Google Translate TTS cho trinh duyet thieu giong vi-VN ban dia (nhu Chrome tren may tinh).
// Khong yeu cau khoa API tra phi; gioi han toi da 250 ky tu moi luot goi va luu dem 7 ngay qua tieu de `Cache-Control`.

import { checkInMemoryRateLimit } from "../../server/securityMiddleware";

function resolveTtsCorsHeaders(origin?: string | null): Record<string, string> {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  let allowedOrigin = appUrl || "null";
  if (origin) {
    const clean = origin.trim().replace(/\/$/, "");
    if (
      (appUrl && clean === appUrl) ||
      clean.startsWith("http://localhost:") ||
      clean.startsWith("http://127.0.0.1:")
    ) {
      allowedOrigin = clean;
    }
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export default async function (req: Request) {
  const corsHeaders = resolveTtsCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-nf-client-connection-ip") ||
    "unknown";
  const rate = checkInMemoryRateLimit({
    key: `netlify-tts:${clientIp}`,
    windowMs: 60_000,
    maxRequests: 90,
  });
  if (!rate.allowed) {
    return new Response("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": String(rate.retryAfterSec ?? 1),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  let text = "";
  if (req.method === "POST") {
    const rawBody = await req.text().catch(() => "");
    if (Buffer.byteLength(rawBody, "utf8") > 16 * 1024) {
      return new Response("Payload TTS vượt quá giới hạn cho phép.", {
        status: 413,
        headers: { ...corsHeaders, "Cache-Control": "private, no-store, max-age=0" },
      });
    }
    try {
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (typeof body?.text === "string") {
        text = body.text.trim();
      }
    } catch {
      return new Response("Dữ liệu JSON không hợp lệ.", {
        status: 400,
        headers: { ...corsHeaders, "Cache-Control": "private, no-store, max-age=0" },
      });
    }
  } else {
    const url = new URL(req.url);
    text = (url.searchParams.get("text") || "").trim();
  }

  if (!text) {
    return new Response("Thiếu tham số văn bản TTS", {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    const encoded = encodeURIComponent(text.slice(0, 250));
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;

    const res = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg, audio/*, */*",
      },
    });

    if (!res.ok) {
      return new Response(`TTS upstream error: ${res.statusText}`, {
        status: res.status,
        headers: corsHeaders,
      });
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return new Response("Lỗi phát âm thanh", {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export const config = {
  path: "/api/tts",
};

export async function handler(event: any) {
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const corsHeaders = resolveTtsCorsHeaders(origin);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const clientIp =
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers?.["x-nf-client-connection-ip"] ||
    "unknown";
  const rate = checkInMemoryRateLimit({
    key: `netlify-tts:${clientIp}`,
    windowMs: 60_000,
    maxRequests: 90,
  });
  if (!rate.allowed) {
    return {
      statusCode: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": String(rate.retryAfterSec ?? 1),
        "Cache-Control": "private, no-store, max-age=0",
      },
      body: "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
    };
  }

  let text = "";
  if (event.httpMethod === "POST") {
    const rawBody = typeof event.body === "string" ? event.body : "";
    if (Buffer.byteLength(rawBody, "utf8") > 16 * 1024) {
      return {
        statusCode: 413,
        headers: { ...corsHeaders, "Cache-Control": "private, no-store, max-age=0" },
        body: "Payload TTS vượt quá giới hạn cho phép.",
      };
    }
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      if (typeof parsed?.text === "string") {
        text = parsed.text.trim();
      }
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Cache-Control": "private, no-store, max-age=0" },
        body: "Dữ liệu JSON không hợp lệ.",
      };
    }
  } else {
    text = (event.queryStringParameters?.text || "").trim();
  }

  if (!text) {
    return {
      statusCode: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
      },
      body: "Thiếu tham số văn bản TTS",
    };
  }

  try {
    const encoded = encodeURIComponent(text.slice(0, 250));
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;

    const res = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg, audio/*, */*",
      },
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: {
          ...corsHeaders,
          "Cache-Control": "private, no-store, max-age=0",
        },
        body: "Lỗi từ máy chủ phát âm thanh.",
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store, max-age=0",
      },
      body: base64Data,
      isBase64Encoded: true,
    };
  } catch {
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        "Cache-Control": "private, no-store, max-age=0",
      },
      body: "Lỗi phát âm thanh",
    };
  }
}
