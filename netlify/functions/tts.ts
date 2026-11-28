// Netlify Function for Vietnamese TTS Audio Proxy
// Supports both modern Netlify V2 (Web Standards Request/Response) and V1 (AWS Lambda)
// Bo trung chuyen am thanh tieng Viet (`audio/mpeg`) tu Google Translate TTS cho trinh duyet thieu giong vi-VN ban dia (nhu Chrome tren may tinh).
// Khong yeu cau khoa API tra phi; gioi han toi da 250 ky tu moi luot goi va luu dem 7 ngay qua tieu de `Cache-Control`.

export default async function (req: Request) {
  const url = new URL(req.url);
  const text = (url.searchParams.get("text") || "").trim();
  if (!text) {
    return new Response("Thiếu tham số ?text=...", {
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
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
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (err: any) {
    return new Response("Lỗi phát âm thanh: " + String(err?.message || err), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}

export const config = {
  path: "/api/tts",
};

export async function handler(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    };
  }

  const text = (event.queryStringParameters?.text || "").trim();
  if (!text) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain; charset=utf-8" },
      body: "Thiếu tham số ?text=...",
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
        headers: { "Access-Control-Allow-Origin": "*" },
        body: `Upstream error: ${res.statusText}`,
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=604800, immutable",
      },
      body: base64Data,
      isBase64Encoded: true,
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Lỗi phát âm thanh: " + String(err?.message || err),
    };
  }
}
