import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  EXERCISE_VIDEO_VERIFIED_AT,
  ExerciseVideoKey,
  listVerifiedVideos,
  verifiedExerciseVideos,
} from '../src/services/ai/exerciseCatalog';
import { GeminiAIProvider } from '../src/services/ai/geminiProvider';
import { RuleBasedAIProvider } from '../src/services/ai/ruleBasedProvider';
import { ConfirmedLabResult, ExercisePlanItem } from '../src/services/ai/types';

const sample: ConfirmedLabResult = {
  testCode: 'WBC',
  testName: 'White blood cell count',
  value: 7.2,
  unit: '10^9/L',
  referenceLow: 4,
  referenceHigh: 10,
  referenceText: '4 - 10',
};

const expectedCatalog = {
  'walk-at-home': {
    key: 'walk-at-home',
    videoId: 'u08lo0bESJc',
    title: 'Heart Healthy - 1 Mile Walk | Walk at Home',
    authorName: 'Walk at Home',
    authorUrl: 'https://www.youtube.com/@LeslieSansonesWalkatHome',
    thumbnailUrl: 'https://i.ytimg.com/vi/u08lo0bESJc/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=u08lo0bESJc',
    verified: true,
    verifiedBy: 'YOUTUBE_OEMBED',
    verifiedAt: '2026-08-09',
  },
  'beginner-yoga': {
    key: 'beginner-yoga',
    videoId: 'v7AYKMP6rOE',
    title: 'Yoga For Complete Beginners - 20 Minute Home Yoga Workout!',
    authorName: 'Yoga With Adriene',
    authorUrl: 'https://www.youtube.com/@yogawithadriene',
    thumbnailUrl: 'https://i.ytimg.com/vi/v7AYKMP6rOE/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=v7AYKMP6rOE',
    verified: true,
    verifiedBy: 'YOUTUBE_OEMBED',
    verifiedAt: '2026-08-09',
  },
  'chair-yoga': {
    key: 'chair-yoga',
    videoId: '1DYH5ud3zHo',
    title: 'Gentle Chair Yoga for Beginners and Seniors',
    authorName: 'Yoga with Kassandra',
    authorUrl: 'https://www.youtube.com/@yogawithkassandra',
    thumbnailUrl: 'https://i.ytimg.com/vi/1DYH5ud3zHo/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=1DYH5ud3zHo',
    verified: true,
    verifiedBy: 'YOUTUBE_OEMBED',
    verifiedAt: '2026-08-09',
  },
} as const;

function expectItemMatchesVideo(item: ExercisePlanItem, key: ExerciseVideoKey): void {
  const video = expectedCatalog[key];
  expect(item).toMatchObject({
    youtubeUrl: video.youtubeUrl,
    youtubeVideoId: video.videoId,
    youtubeTitle: video.title,
    youtubeAuthor: video.authorName,
    youtubeAuthorUrl: video.authorUrl,
    youtubeThumbnailUrl: video.thumbnailUrl,
    youtubeVerified: true,
    youtubeSource: 'YouTube oEmbed',
    youtubeVerifiedAt: video.verifiedAt,
  });
}

function youtubeTuple(item: ExercisePlanItem): Record<string, unknown> {
  return {
    youtubeUrl: item.youtubeUrl,
    youtubeVideoId: item.youtubeVideoId,
    youtubeTitle: item.youtubeTitle,
    youtubeAuthor: item.youtubeAuthor,
    youtubeAuthorUrl: item.youtubeAuthorUrl,
    youtubeThumbnailUrl: item.youtubeThumbnailUrl,
    youtubeVerified: item.youtubeVerified,
    youtubeSource: item.youtubeSource,
    youtubeVerifiedAt: item.youtubeVerifiedAt,
  };
}

function expectedYoutubeTuple(key: ExerciseVideoKey): Record<string, unknown> {
  const video = expectedCatalog[key];
  return {
    youtubeUrl: video.youtubeUrl,
    youtubeVideoId: video.videoId,
    youtubeTitle: video.title,
    youtubeAuthor: video.authorName,
    youtubeAuthorUrl: video.authorUrl,
    youtubeThumbnailUrl: video.thumbnailUrl,
    youtubeVerified: true,
    youtubeSource: 'YouTube oEmbed',
    youtubeVerifiedAt: video.verifiedAt,
  };
}

function validGeminiItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Sample exercise',
    description: 'Sample description',
    duration: 10,
    difficulty: 'EASY',
    rationale: 'Sample rationale',
    ...overrides,
  };
}

describe('exercise video catalog', () => {
  it('contains the exact offline-verified YouTube oEmbed metadata', () => {
    const keys: ExerciseVideoKey[] = ['walk-at-home', 'beginner-yoga', 'chair-yoga'];
    expect(Object.keys(verifiedExerciseVideos)).toEqual(keys);
    expect(verifiedExerciseVideos).toEqual(expectedCatalog);
    expect(listVerifiedVideos()).toEqual(keys.map((key) => expectedCatalog[key]));
    expect(EXERCISE_VIDEO_VERIFIED_AT).toBe('2026-08-09');
  });

  it('deep-freezes trusted catalog records and the listed view', () => {
    const listed = listVerifiedVideos();
    const first = listed[0] as any;
    const originalTitle = first.title;
    const mutationSucceeded = Reflect.set(first, 'title', 'tampered');
    if (mutationSucceeded) Reflect.set(first, 'title', originalTitle);

    expect(Object.isFrozen(verifiedExerciseVideos)).toBe(true);
    expect(listed.every((video) => Object.isFrozen(video))).toBe(true);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(mutationSucceeded).toBe(false);
    expect(() => (listed as unknown as any[]).push(listed[0])).toThrow(TypeError);
  });

  it('maps walking plus beginner yoga for users younger than 60', async () => {
    const plan = await new RuleBasedAIProvider().generateExercisePlan('report-1', [sample], 59);

    expectItemMatchesVideo(plan.items[0], 'walk-at-home');
    expectItemMatchesVideo(plan.items[1], 'beginner-yoga');
    expect(plan.items[1]).toMatchObject({
      name: 'Yoga cơ bản tại nhà',
      description: 'Thực hiện bài yoga 20 phút dành cho người mới bắt đầu, tập chậm và trong phạm vi thoải mái.',
      duration: 20,
    });
  });

  it('maps walking plus chair yoga for users aged 60 or older', async () => {
    const plan = await new RuleBasedAIProvider().generateExercisePlan('report-1', [sample], 60);

    expectItemMatchesVideo(plan.items[0], 'walk-at-home');
    expectItemMatchesVideo(plan.items[1], 'chair-yoga');
    expect(plan.items[1]).toMatchObject({
      name: 'Yoga ghế nhẹ nhàng',
      description: 'Thực hiện các động tác yoga nhẹ nhàng khi ngồi trên ghế, phù hợp người lớn tuổi và người cần hỗ trợ thăng bằng.',
      duration: 15,
    });
  });

  it('emits only exact trusted catalog tuples for every verified exercise item', async () => {
    const allowedTuples = (Object.keys(expectedCatalog) as ExerciseVideoKey[]).map(expectedYoutubeTuple);

    for (const age of [59, 60]) {
      const plan = await new RuleBasedAIProvider().generateExercisePlan('report-1', [sample], age);
      for (const item of plan.items) {
        expect(item.youtubeVerified).toBe(true);
        expect(allowedTuples).toContainEqual(youtubeTuple(item));
      }
    }
  });

  it('copies only trusted fields from a valid Gemini exercise draft', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({
        title: 'Gemini plan',
        items: [
          validGeminiItem(),
          validGeminiItem({ name: 'Second exercise', difficulty: 'MEDIUM' }),
        ],
      }),
    );

    const plan = await provider.generateExercisePlan('report-1', [sample], 30);

    expect(plan.reportId).toBe('report-1');
    expect(plan.items[0]).toEqual({
      name: 'Sample exercise',
      description: 'Sample description',
      duration: 10,
      difficulty: 'EASY',
      rationale: 'Sample rationale',
      youtubeUrl: null,
      youtubeVideoId: null,
      youtubeTitle: null,
      youtubeAuthor: null,
      youtubeAuthorUrl: null,
      youtubeThumbnailUrl: null,
      youtubeVerified: false,
      youtubeSource: null,
      youtubeVerifiedAt: null,
    });
  });

  it.each([
    [
      'an extra root field',
      {
        title: 'Gemini plan',
        items: [validGeminiItem(), validGeminiItem()],
        attackerControlled: 'must not survive',
      },
    ],
    [
      'extra and YouTube item fields',
      {
        title: 'Gemini plan',
        items: [
          validGeminiItem({
            youtubeUrl: 'https://www.youtube.com/watch?v=untrusted',
            youtubeVerified: true,
            attackerControlled: 'must not survive',
          }),
          validGeminiItem(),
        ],
      },
    ],
  ])('rejects Gemini drafts containing %s', async (_caseName, payload) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(JSON.stringify(payload));

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow();
  });

  it.each([
    ['non-positive duration', validGeminiItem({ duration: 0 })],
    ['invalid difficulty', validGeminiItem({ difficulty: 'EXTREME' })],
    ['missing rationale', { name: 'A', description: 'B', duration: 10, difficulty: 'EASY' }],
  ])('rejects Gemini exercise items with %s', async (_caseName, invalidItem) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({ title: 'Invalid plan', items: [invalidItem, validGeminiItem()] }),
    );

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow(
      'AI trả về bài tập không đúng định dạng.',
    );
  });

  it('rejects Gemini output when items is not an array', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(JSON.stringify({ title: 'Invalid plan', items: {} }));

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow(
      'AI trả về bài tập không đúng định dạng.',
    );
  });

  it.each([1, 4])('rejects Gemini output containing %i exercise items', async (itemCount) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({ title: 'Invalid plan', items: Array.from({ length: itemCount }, () => validGeminiItem()) }),
    );

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow();
  });

  it('accepts a Gemini exercise duration of exactly 120 minutes', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({
        title: 'Boundary plan',
        items: [validGeminiItem({ duration: 120 }), validGeminiItem()],
      }),
    );

    const plan = await provider.generateExercisePlan('report-1', [sample], 30);
    expect(plan.items[0].duration).toBe(120);
  });

  it('rejects a Gemini exercise duration above 120 minutes', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({
        title: 'Unsafe plan',
        items: [validGeminiItem({ duration: 121 }), validGeminiItem()],
      }),
    );

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow();
  });

  it.each([
    ['title', { title: '', items: [validGeminiItem(), validGeminiItem()] }],
    ['name', { title: 'Plan', items: [validGeminiItem({ name: '' }), validGeminiItem()] }],
    ['description', { title: 'Plan', items: [validGeminiItem({ description: '' }), validGeminiItem()] }],
    ['rationale', { title: 'Plan', items: [validGeminiItem({ rationale: '' }), validGeminiItem()] }],
  ])('rejects an empty Gemini draft %s', async (_field, payload) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(JSON.stringify(payload));

    await expect(provider.generateExercisePlan('report-1', [sample], 30)).rejects.toThrow();
  });

  it('mirrors Gemini draft constraints in a physical JSON contract', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const schema = JSON.parse(
      readFileSync(join(contractsDir, 'json', 'gemini_exercise_draft.schema.json'), 'utf8'),
    );
    const example = JSON.parse(
      readFileSync(join(contractsDir, 'examples', 'gemini_exercise_draft.example.json'), 'utf8'),
    );
    const manifest = JSON.parse(readFileSync(join(contractsDir, 'manifest.json'), 'utf8'));
    const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);

    expect(manifest.contracts).toContainEqual({
      id: 'gemini_exercise_draft',
      schema: 'json/gemini_exercise_draft.schema.json',
      example: 'examples/gemini_exercise_draft.example.json',
    });
    expect(validate(example)).toBe(true);
    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({ ...example, title: '' })).toBe(false);
    expect(validate({ ...example, items: [example.items[0]] })).toBe(false);
    expect(validate({ ...example, items: [...example.items, example.items[0], example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], name: '' }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], duration: 120 }, example.items[1]] })).toBe(true);
    expect(validate({ ...example, items: [{ ...example.items[0], duration: 121 }, example.items[1]] })).toBe(false);
  });

  it('rejects extra properties and contradictory verification states in the JSON contract', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const schema = JSON.parse(readFileSync(join(contractsDir, 'json', 'exercise_plan.schema.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'exercise_plan.example.json'), 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], unexpected: true }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], youtubeTitle: null }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], youtubeVerified: false }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, title: '' })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], name: '' }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], description: '' }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], rationale: '' }, example.items[1]] })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], duration: 120 }, example.items[1]] })).toBe(true);
    expect(validate({ ...example, items: [{ ...example.items[0], duration: 121 }, example.items[1]] })).toBe(false);
    expect(
      validate({
        ...example,
        items: [{ ...example.items[0], youtubeUrl: 'javascript:alert(1)' }, example.items[1]],
      }),
    ).toBe(false);
    expect(
      validate({
        ...example,
        items: [{ ...example.items[0], youtubeVideoId: 'not-in-catalog' }, example.items[1]],
      }),
    ).toBe(false);
    expect(
      validate({
        ...example,
        items: [{ ...example.items[0], youtubeTitle: expectedCatalog['beginner-yoga'].title }, example.items[1]],
      }),
    ).toBe(false);
  });

  it('validates every trusted catalog tuple against the final exercise-plan contract', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const schema = JSON.parse(readFileSync(join(contractsDir, 'json', 'exercise_plan.schema.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'exercise_plan.example.json'), 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    for (const key of Object.keys(verifiedExerciseVideos) as ExerciseVideoKey[]) {
      const plan = {
        ...example,
        items: [{ ...example.items[0], ...expectedYoutubeTuple(key) }, example.items[1]],
      };

      expect({ key, valid: validate(plan), errors: validate.errors }).toEqual({
        key,
        valid: true,
        errors: null,
      });
    }
  });
});
