import { listVerifiedVideos, VerifiedExerciseVideo } from '../src/services/ai/exerciseCatalog';
import { listVerifiedFoodImages, VerifiedFoodImage } from '../src/services/ai/foodImageCatalog';
import {
  FetchLike,
  MEDIA_VERIFIER_USER_AGENT,
  verifyMediaCatalog,
} from '../scripts/verify-media-catalog';

type RequestRecord = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function imageResponse(status = 200, contentType = 'image/jpeg'): Response {
  return new Response(status === 206 ? new Uint8Array([1]) : null, {
    status,
    headers: { 'content-type': contentType },
  });
}

function streamResponse(options: {
  status?: number;
  contentType?: string;
  chunks?: Uint8Array[];
  error?: Error;
  keepOpen?: boolean;
  onCancel?: () => void;
  onRead?: () => void;
}): Response {
  const chunks = [...(options.chunks ?? [])];
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        options.onRead?.();
        if (options.error) {
          controller.error(options.error);
          return;
        }
        const chunk = chunks.shift();
        if (chunk) {
          controller.enqueue(chunk);
          return;
        }
        if (!options.keepOpen) controller.close();
      },
      cancel() {
        options.onCancel?.();
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(body, {
    status: options.status ?? 200,
    headers: { 'content-type': options.contentType ?? 'application/octet-stream' },
  });
}

function youtubePayload(video: VerifiedExerciseVideo): Record<string, string> {
  return {
    title: video.title,
    author_name: video.authorName,
    author_url: video.authorUrl,
    thumbnail_url: video.thumbnailUrl,
  };
}

function commonsPayload(image: VerifiedFoodImage, artist = `<a href="/wiki/User:Example">${image.author}</a>`): unknown {
  const title = decodeURIComponent(image.sourceUrl.split('/wiki/')[1]);
  return {
    query: {
      pages: [
        {
          pageid: 123,
          title,
          imageinfo: [
            {
              url: image.imageUrl,
              mime: 'image/jpeg',
              extmetadata: {
                LicenseShortName: { value: image.license },
                Artist: { value: artist },
              },
            },
          ],
        },
      ],
    },
  };
}

function makeSuccessfulFetch(
  records: RequestRecord[] = [],
  overrides: {
    youtube?: (video: VerifiedExerciseVideo) => Response;
    commons?: (image: VerifiedFoodImage) => Response;
    direct?: (image: VerifiedFoodImage, method: string) => Response;
  } = {},
): FetchLike {
  const videos = listVerifiedVideos();
  const images = listVerifiedFoodImages();

  return async (input, init) => {
    const url = String(input);
    records.push({ url, init });

    if (url.startsWith('https://www.youtube.com/oembed')) {
      const watchedUrl = new URL(url).searchParams.get('url');
      const video = videos.find((candidate) => candidate.youtubeUrl === watchedUrl);
      if (!video) throw new Error(`Unexpected YouTube request: ${url}`);
      return overrides.youtube?.(video) ?? jsonResponse(youtubePayload(video));
    }

    if (url.startsWith('https://commons.wikimedia.org/w/api.php')) {
      const title = new URL(url).searchParams.get('titles');
      const image = images.find((candidate) => decodeURIComponent(candidate.sourceUrl.split('/wiki/')[1]) === title);
      if (!image) throw new Error(`Unexpected Commons request: ${url}`);
      return overrides.commons?.(image) ?? jsonResponse(commonsPayload(image));
    }

    const image = images.find((candidate) => candidate.imageUrl === url);
    if (!image) throw new Error(`Unexpected direct image request: ${url}`);
    return overrides.direct?.(image, init?.method ?? 'GET') ?? imageResponse();
  };
}

describe('external verified-media catalog verifier', () => {
  it('verifies all three YouTube and six Wikimedia records and logs a clear summary', async () => {
    const logs: string[] = [];

    const result = await verifyMediaCatalog({
      fetch: makeSuccessfulFetch(),
      log: (message) => logs.push(message),
      sleep: async () => undefined,
    });

    expect(result).toEqual({ videos: 3, images: 6, total: 9 });
    expect(logs.filter((line) => line.startsWith('PASS YouTube'))).toHaveLength(3);
    expect(logs.filter((line) => line.startsWith('PASS Wikimedia'))).toHaveLength(6);
    expect(logs.at(-1)).toBe('PASS media catalog: 3 YouTube videos + 6 Wikimedia images = 9 records');
  });

  it.each([
    ['title', (video: VerifiedExerciseVideo) => ({ ...youtubePayload(video), title: `${video.title} changed` })],
    ['author_name', (video: VerifiedExerciseVideo) => ({ ...youtubePayload(video), author_name: `${video.authorName} changed` })],
  ])('fails an exact YouTube oEmbed %s mismatch', async (field, mutate) => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          youtube: (video) => jsonResponse(video.key === 'walk-at-home' ? mutate(video) : youtubePayload(video)),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(`YouTube walk-at-home ${field} mismatch`);
  });

  it.each([
    ['YouTube oEmbed', makeSuccessfulFetch([], { youtube: () => jsonResponse({}, 404) })],
    ['Wikimedia API', makeSuccessfulFetch([], { commons: () => jsonResponse({}, 404) })],
  ])('fails a non-2xx %s response', async (_label, fetch) => {
    await expect(
      verifyMediaCatalog({ fetch, log: () => undefined, sleep: async () => undefined }),
    ).rejects.toThrow(/returned HTTP 404/);
  });

  it('fails when a successful direct image response is not image content', async () => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], { direct: () => imageResponse(200, 'text/html') }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/did not return image content/);
  });

  it('falls back from HEAD to a ranged GET when HEAD misses image content type', async () => {
    const records: RequestRecord[] = [];
    const firstImage = listVerifiedFoodImages()[0];

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch(records, {
        direct: (image, method) => {
          if (image.key === firstImage.key && method === 'HEAD') return imageResponse(200, 'application/octet-stream');
          return imageResponse(method === 'GET' ? 206 : 200);
        },
      }),
      log: () => undefined,
      sleep: async () => undefined,
    });

    const directRequests = records.filter((record) => record.url === firstImage.imageUrl);
    expect(directRequests.map((record) => record.init?.method)).toEqual(['HEAD', 'GET']);
    expect(new Headers(directRequests[1].init?.headers).get('range')).toBe('bytes=0-0');
  });

  it('sends a descriptive User-Agent on every external request', async () => {
    const records: RequestRecord[] = [];

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch(records),
      log: () => undefined,
      sleep: async () => undefined,
    });

    expect(records).toHaveLength(15);
    for (const record of records) {
      expect(new Headers(record.init?.headers).get('user-agent')).toBe(MEDIA_VERIFIER_USER_AGENT);
    }
  });

  it('keeps all external requests sequential and deterministic', async () => {
    const records: RequestRecord[] = [];
    const baseFetch = makeSuccessfulFetch(records);
    let active = 0;
    let maxActive = 0;
    const fetch: FetchLike = async (input, init) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const response = await baseFetch(input, init);
      active -= 1;
      return response;
    };

    await verifyMediaCatalog({ fetch, log: () => undefined, sleep: async () => undefined });

    expect(maxActive).toBe(1);
    expect(records.map((record) => `${record.init?.method ?? 'GET'} ${record.url}`)).toEqual([
      ...listVerifiedVideos().map((video) =>
        `GET https://www.youtube.com/oembed?url=${encodeURIComponent(video.youtubeUrl)}&format=json`,
      ),
      ...listVerifiedFoodImages().flatMap((image) => {
        const title = decodeURIComponent(image.sourceUrl.split('/wiki/')[1]);
        const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
        apiUrl.searchParams.set('action', 'query');
        apiUrl.searchParams.set('format', 'json');
        apiUrl.searchParams.set('formatversion', '2');
        apiUrl.searchParams.set('prop', 'imageinfo');
        apiUrl.searchParams.set('iiprop', 'url|mime|extmetadata');
        apiUrl.searchParams.set('titles', title);
        apiUrl.searchParams.set('origin', '*');
        return [`GET ${apiUrl.toString()}`, `HEAD ${image.imageUrl}`];
      }),
    ]);
  });

  it('strips Wikimedia author HTML and entities before exact comparison', async () => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) =>
            jsonResponse(
              commonsPayload(
                image,
                image.key === 'beef-noodle-breakfast'
                  ? '<span>Andy&nbsp;Li &amp; collaborators</span>'
                  : `<span>${image.author}</span>`,
              ),
            ),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('Wikimedia beef-noodle-breakfast author mismatch');

    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) =>
            jsonResponse(
              commonsPayload(
                image,
                image.key === 'beef-noodle-breakfast' ? '<span>Andy&nbsp;Li</span>' : `<span>${image.author}</span>`,
              ),
            ),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).resolves.toEqual({ videos: 3, images: 6, total: 9 });
  });

  it('ignores only Wikimedia tracking parameters when comparing the API direct URL', async () => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) => {
            const payload = commonsPayload(image) as any;
            payload.query.pages[0].imageinfo[0].url =
              `${image.imageUrl}?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original`;
            return jsonResponse(payload);
          },
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).resolves.toEqual({ videos: 3, images: 6, total: 9 });
  });

  it('matches an exact author anchor inside a longer Wikimedia attribution template', async () => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) =>
            jsonResponse(
              commonsPayload(
                image,
                image.key === 'vegetable-soup-dinner'
                  ? '<a href="/wiki/User:Kolforn">Kolforn</a> (photographer) <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>'
                  : `<a href="/wiki/User:Example">${image.author}</a>`,
              ),
            ),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).resolves.toEqual({ videos: 3, images: 6, total: 9 });
  });

  it('matches exact plain author text when Wikimedia appends a linked external username', async () => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) =>
            jsonResponse(
              commonsPayload(
                image,
                image.key === 'fruit-nuts-snack'
                  ? 'Roberta Sorge <a href="https://unsplash.com/@robertina">robertina</a>'
                  : `<a href="/wiki/User:Example">${image.author}</a>`,
              ),
            ),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).resolves.toEqual({ videos: 3, images: 6, total: 9 });
  });

  it.each([
    ['license', 'LicenseShortName'],
    ['author', 'Artist'],
  ])('rejects a Wikimedia record with missing %s metadata', async (label, metadataKey) => {
    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          commons: (image) => {
            const payload = commonsPayload(image) as any;
            if (image.key === 'beef-noodle-breakfast') {
              delete payload.query.pages[0].imageinfo[0].extmetadata[metadataKey];
            }
            return jsonResponse(payload);
          },
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(`Wikimedia beef-noodle-breakfast ${label} metadata is missing`);
  });

  it('cancels a transient response body before retrying with bounded backoff', async () => {
    let attempts = 0;
    let canceled = false;
    const sleeps: number[] = [];

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch([], {
        youtube: (video) => {
          if (video.key !== 'walk-at-home') return jsonResponse(youtubePayload(video));
          attempts += 1;
          if (attempts === 1) {
            return streamResponse({ status: 503, contentType: 'text/plain', keepOpen: true, onCancel: () => { canceled = true; } });
          }
          return jsonResponse(youtubePayload(video));
        },
      }),
      log: () => undefined,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    });

    expect({ attempts, canceled, sleeps }).toEqual({ attempts: 2, canceled: true, sleeps: [250] });
  });

  it('cancels a final non-2xx response body before rejecting', async () => {
    let canceled = false;

    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          youtube: (video) =>
            video.key === 'walk-at-home'
              ? streamResponse({ status: 404, contentType: 'text/plain', keepOpen: true, onCancel: () => { canceled = true; } })
              : jsonResponse(youtubePayload(video)),
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/returned HTTP 404/);
    expect(canceled).toBe(true);
  });

  it('cancels the unusable HEAD response before a ranged GET fallback', async () => {
    const firstImage = listVerifiedFoodImages()[0];
    let headCanceled = false;

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch([], {
        direct: (image, method) => {
          if (image.key === firstImage.key && method === 'HEAD') {
            return streamResponse({ contentType: 'text/html', keepOpen: true, onCancel: () => { headCanceled = true; } });
          }
          return method === 'GET'
            ? streamResponse({ status: 206, contentType: 'image/jpeg', chunks: [new Uint8Array([1])] })
            : imageResponse();
        },
      }),
      log: () => undefined,
      sleep: async () => undefined,
    });

    expect(headCanceled).toBe(true);
  });

  it('reads at least one ranged image byte and cancels the remaining body', async () => {
    const firstImage = listVerifiedFoodImages()[0];
    let reads = 0;
    let rangedCanceled = false;

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch([], {
        direct: (image, method) => {
          if (image.key !== firstImage.key) return imageResponse();
          if (method === 'HEAD') return imageResponse(200, 'text/html');
          return streamResponse({
            status: 206,
            contentType: 'image/jpeg',
            chunks: [new Uint8Array([0xff, 0xd8])],
            keepOpen: true,
            onRead: () => { reads += 1; },
            onCancel: () => { rangedCanceled = true; },
          });
        },
      }),
      log: () => undefined,
      sleep: async () => undefined,
    });

    expect(reads).toBe(1);
    expect(rangedCanceled).toBe(true);
  });

  it('rejects an empty ranged image body', async () => {
    const firstImage = listVerifiedFoodImages()[0];

    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          direct: (image, method) => {
            if (image.key === firstImage.key && method === 'HEAD') return imageResponse(200, 'text/html');
            if (image.key === firstImage.key) {
              return new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg' } });
            }
            return imageResponse();
          },
        }),
        log: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('Wikimedia beef-noodle-breakfast ranged image returned no bytes');
  });

  it('retries a broken ranged body finitely and preserves the read failure', async () => {
    const firstImage = listVerifiedFoodImages()[0];
    const bodyError = new Error('socket closed while reading image byte');
    let getAttempts = 0;
    const sleeps: number[] = [];

    await expect(
      verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          direct: (image, method) => {
            if (image.key === firstImage.key && method === 'HEAD') return imageResponse(200, 'text/html');
            if (image.key === firstImage.key) {
              getAttempts += 1;
              return streamResponse({ status: 206, contentType: 'image/jpeg', error: bodyError });
            }
            return imageResponse();
          },
        }),
        log: () => undefined,
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      }),
    ).rejects.toThrow('socket closed while reading image byte');
    expect({ getAttempts, sleeps }).toEqual({ getAttempts: 3, sleeps: [250, 500] });
  });

  it('retries a YouTube body-read failure and then parses the successful body', async () => {
    const bodyError = new Error('socket closed while reading oEmbed JSON');
    let attempts = 0;
    const sleeps: number[] = [];

    await verifyMediaCatalog({
      fetch: makeSuccessfulFetch([], {
        youtube: (video) => {
          if (video.key !== 'walk-at-home') return jsonResponse(youtubePayload(video));
          attempts += 1;
          return attempts === 1
            ? streamResponse({ contentType: 'application/json', error: bodyError })
            : jsonResponse(youtubePayload(video));
        },
      }),
      log: () => undefined,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    });

    expect({ attempts, sleeps }).toEqual({ attempts: 2, sleeps: [250] });
  });

  it('wraps the final request failure with the media key while preserving its cause chain', async () => {
    const rootError = new Error('DNS lookup failed');
    let thrown: unknown;

    try {
      await verifyMediaCatalog({
        fetch: makeSuccessfulFetch([], {
          youtube: (video) => {
            if (video.key === 'walk-at-home') throw rootError;
            return jsonResponse(youtubePayload(video));
          },
        }),
        log: () => undefined,
        sleep: async () => undefined,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const contextualError = thrown as Error & { cause?: unknown };
    expect(contextualError.message).toMatch(/YouTube walk-at-home verification failed: GET .* request failed/);
    expect(contextualError.cause).toBeInstanceOf(Error);
    expect((contextualError.cause as Error & { cause?: unknown }).cause).toBe(rootError);
  });
});
