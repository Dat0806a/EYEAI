import { listVerifiedVideos, VerifiedExerciseVideo } from '../src/services/ai/exerciseCatalog';
import { listVerifiedFoodImages, VerifiedFoodImage } from '../src/services/ai/foodImageCatalog';

export const MEDIA_VERIFIER_USER_AGENT =
  'Y-Te-AUTO-MediaVerifier/1.0 (+https://github.com/ntc0407/Y-T-AUTO)';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_JSON_BODY_BYTES = 1_000_000;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface MediaVerifierDependencies {
  readonly fetch: FetchLike;
  readonly log?: (message: string) => void;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface MediaVerificationResult {
  readonly videos: number;
  readonly images: number;
  readonly total: number;
}

interface CommonsImageInfo {
  readonly url?: unknown;
  readonly mime?: unknown;
  readonly extmetadata?: Record<string, { value?: unknown } | undefined>;
}

interface CommonsPage {
  readonly missing?: unknown;
  readonly imageinfo?: CommonsImageInfo[];
}

class TransientRequestError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'TransientRequestError';
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function contentType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

function isImageContentType(value: string): boolean {
  return value.startsWith('image/');
}

function withRequestHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', MEDIA_VERIFIER_USER_AGENT);
  return {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body || response.body.locked) return;
  try {
    await response.body.cancel();
  } catch {
    // Preserve the verification failure that made this response unusable.
  }
}

async function requestOperationWithRetry<T>(
  fetch: FetchLike,
  sleep: (milliseconds: number) => Promise<void>,
  url: string,
  init: RequestInit = {},
  operation: (response: Response) => Promise<T>,
  allowNonSuccessfulStatus = false,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, withRequestHeaders(init));
    } catch (error) {
      lastError = new Error(`${init.method ?? 'GET'} ${url} request failed`, { cause: error });
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }

    if (isTransientStatus(response.status) && attempt < MAX_ATTEMPTS) {
      await cancelResponseBody(response);
      lastError = new Error(`${init.method ?? 'GET'} ${url} returned HTTP ${response.status}`);
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }

    if (!isSuccessfulStatus(response.status) && !allowNonSuccessfulStatus) {
      await cancelResponseBody(response);
      throw new Error(`${init.method ?? 'GET'} ${url} returned HTTP ${response.status}`);
    }

    try {
      return await operation(response);
    } catch (error) {
      await cancelResponseBody(response);
      if (!(error instanceof TransientRequestError) || attempt === MAX_ATTEMPTS) throw error;
      lastError = error;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error(`${init.method ?? 'GET'} ${url} request failed`);
}

async function readResponseText(response: Response, label: string): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let byteLength = 0;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        throw new TransientRequestError(
          `${label} body read failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
      if (result.done) break;
      if (!result.value) continue;
      byteLength += result.value.byteLength;
      if (byteLength > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new Error(`${label} body exceeded ${MAX_JSON_BODY_BYTES} bytes`);
      }
      body += decoder.decode(result.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const body = await readResponseText(response, label);
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON`, { cause: error });
  }
}

async function requireRangedImageByte(response: Response, label: string): Promise<void> {
  if (!response.body) throw new Error(`${label} returned no bytes`);
  const reader = response.body.getReader();

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        throw new TransientRequestError(
          `${label} body read failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
      if (result.done) throw new Error(`${label} returned no bytes`);
      if (!result.value || result.value.byteLength === 0) continue;
      try {
        await reader.cancel();
      } catch (error) {
        throw new TransientRequestError(`${label} body cancel failed`, error);
      }
      return;
    }
  } finally {
    reader.releaseLock();
  }
}

function assertExact(label: string, expected: string, actual: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function youtubeOEmbedUrl(video: VerifiedExerciseVideo): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(video.youtubeUrl)}&format=json`;
}

function commonsTitle(image: VerifiedFoodImage): string {
  const marker = '/wiki/';
  const markerIndex = image.sourceUrl.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Wikimedia ${image.key} has an invalid source URL`);
  return decodeURIComponent(image.sourceUrl.slice(markerIndex + marker.length));
}

function commonsApiUrl(image: VerifiedFoodImage): string {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime|extmetadata');
  url.searchParams.set('titles', commonsTitle(image));
  url.searchParams.set('origin', '*');
  return url.toString();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

export function normalizeCommonsText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function metadataValue(info: CommonsImageInfo, key: string): string | undefined {
  const value = info.extmetadata?.[key]?.value;
  return typeof value === 'string' && value.trim() !== '' ? normalizeCommonsText(value) : undefined;
}

function assertCommonsAuthor(image: VerifiedFoodImage, rawAuthor: string): void {
  const expected = normalizeCommonsText(image.author);
  const normalized = normalizeCommonsText(rawAuthor);
  if (normalized === expected) return;

  const anchorTexts = Array.from(rawAuthor.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi), (match) =>
    normalizeCommonsText(match[1]),
  );
  if (anchorTexts.includes(expected)) return;

  const textOutsideAnchors = normalizeCommonsText(rawAuthor.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' '));
  if (textOutsideAnchors === expected) return;

  throw new Error(
    `Wikimedia ${image.key} author mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(normalized)}`,
  );
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.delete('utm_source');
  url.searchParams.delete('utm_campaign');
  url.searchParams.delete('utm_content');
  return url.href;
}

async function verifyVideo(
  video: VerifiedExerciseVideo,
  fetch: FetchLike,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const label = `YouTube ${video.key} oEmbed`;
  await requestOperationWithRetry(fetch, sleep, youtubeOEmbedUrl(video), {}, async (response) => {
    const payload = (await readJsonResponse(response, label)) as Record<string, unknown>;

    assertExact(`YouTube ${video.key} title`, video.title, payload.title);
    assertExact(`YouTube ${video.key} author_name`, video.authorName, payload.author_name);
    if (typeof payload.author_url === 'string' && payload.author_url !== '') {
      assertExact(`YouTube ${video.key} author_url`, video.authorUrl, payload.author_url);
    }
    if (typeof payload.thumbnail_url === 'string' && payload.thumbnail_url !== '') {
      assertExact(`YouTube ${video.key} thumbnail_url`, video.thumbnailUrl, payload.thumbnail_url);
    }
  });
}

function readCommonsImageInfo(payload: unknown, image: VerifiedFoodImage): CommonsImageInfo {
  if (!payload || typeof payload !== 'object') throw new Error(`Wikimedia ${image.key} API returned invalid JSON`);
  const query = (payload as { query?: unknown }).query;
  if (!query || typeof query !== 'object') throw new Error(`Wikimedia ${image.key} API returned no query result`);
  const pages = (query as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length !== 1) {
    throw new Error(`Wikimedia ${image.key} API returned no unique file page`);
  }

  const page = pages[0] as CommonsPage;
  if ('missing' in page || !Array.isArray(page.imageinfo) || page.imageinfo.length !== 1) {
    throw new Error(`Wikimedia ${image.key} file does not exist`);
  }
  return page.imageinfo[0];
}

async function verifyDirectImage(
  image: VerifiedFoodImage,
  apiMime: string | undefined,
  fetch: FetchLike,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  let headProbe: { status: number; contentType: string } | undefined;
  try {
    headProbe = await requestOperationWithRetry(
      fetch,
      sleep,
      image.imageUrl,
      { method: 'HEAD' },
      async (response) => {
        const probe = { status: response.status, contentType: contentType(response) };
        await cancelResponseBody(response);
        return probe;
      },
      true,
    );
  } catch {
    headProbe = undefined;
  }

  if (headProbe && isSuccessfulStatus(headProbe.status) && isImageContentType(headProbe.contentType)) {
    if (apiMime) assertExact(`Wikimedia ${image.key} direct MIME`, apiMime, headProbe.contentType);
    return;
  }

  await requestOperationWithRetry(
    fetch,
    sleep,
    image.imageUrl,
    { method: 'GET', headers: { Range: 'bytes=0-0' } },
    async (response) => {
      const getType = contentType(response);
      if (!isImageContentType(getType)) {
        throw new Error(
          `Wikimedia ${image.key} direct image did not return image content (received ${getType || 'none'})`,
        );
      }
      if (apiMime) assertExact(`Wikimedia ${image.key} direct MIME`, apiMime, getType);
      await requireRangedImageByte(response, `Wikimedia ${image.key} ranged image`);
    },
  );
}

async function verifyFoodImage(
  image: VerifiedFoodImage,
  fetch: FetchLike,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const label = `Wikimedia ${image.key} API`;
  const apiMime = await requestOperationWithRetry(fetch, sleep, commonsApiUrl(image), {}, async (response) => {
    const info = readCommonsImageInfo(await readJsonResponse(response, label), image);

    if (typeof info.url !== 'string') throw new Error(`Wikimedia ${image.key} API returned no direct URL`);
    assertExact(`Wikimedia ${image.key} direct URL`, canonicalUrl(image.imageUrl), canonicalUrl(info.url));

    const mime = typeof info.mime === 'string' ? info.mime.trim().toLowerCase() : undefined;
    if (mime && !isImageContentType(mime)) {
      throw new Error(`Wikimedia ${image.key} API MIME is not an image: ${mime}`);
    }

    const license = metadataValue(info, 'LicenseShortName');
    if (!license) throw new Error(`Wikimedia ${image.key} license metadata is missing`);
    assertExact(`Wikimedia ${image.key} license`, image.license, license);

    const rawAuthor = info.extmetadata?.Artist?.value;
    if (typeof rawAuthor !== 'string' || rawAuthor.trim() === '') {
      throw new Error(`Wikimedia ${image.key} author metadata is missing`);
    }
    assertCommonsAuthor(image, rawAuthor);
    return mime;
  });

  await verifyDirectImage(image, apiMime, fetch, sleep);
}

async function withVerificationContext<T>(context: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} verification failed: ${message}`, { cause: error });
  }
}

export async function verifyMediaCatalog(
  dependencies: MediaVerifierDependencies,
): Promise<MediaVerificationResult> {
  const log = dependencies.log ?? console.log;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const videos = listVerifiedVideos();
  const images = listVerifiedFoodImages();

  for (const video of videos) {
    await withVerificationContext(`YouTube ${video.key}`, () => verifyVideo(video, dependencies.fetch, sleep));
    log(`PASS YouTube ${video.key}: ${video.title}`);
  }

  for (const image of images) {
    await withVerificationContext(`Wikimedia ${image.key}`, () =>
      verifyFoodImage(image, dependencies.fetch, sleep),
    );
    log(`PASS Wikimedia ${image.key}: ${image.sourceUrl}`);
  }

  const result = { videos: videos.length, images: images.length, total: videos.length + images.length };
  log(`PASS media catalog: ${result.videos} YouTube videos + ${result.images} Wikimedia images = ${result.total} records`);
  return result;
}

async function runCli(): Promise<void> {
  await verifyMediaCatalog({ fetch: globalThis.fetch, log: console.log });
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(`FAIL media catalog: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
