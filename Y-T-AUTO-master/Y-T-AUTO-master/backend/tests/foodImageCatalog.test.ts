import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  FOOD_IMAGE_VERIFIED_AT,
  FoodImageKey,
  listVerifiedFoodImages,
  verifiedFoodImages,
} from '../src/services/ai/foodImageCatalog';
import { ExerciseVideoKey, verifiedExerciseVideos } from '../src/services/ai/exerciseCatalog';
import { GeminiAIProvider } from '../src/services/ai/geminiProvider';
import { RuleBasedAIProvider } from '../src/services/ai/ruleBasedProvider';
import { ConfirmedLabResult, MealPlanItem } from '../src/services/ai/types';

const expectedCatalog = {
  'beef-noodle-breakfast': {
    key: 'beef-noodle-breakfast',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Beef_noodle_soup_(Ph%E1%BB%9F_b%C3%B2)_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    alt: 'Bát phở bò Hà Nội với thịt bò và rau xanh',
    license: 'CC0',
    author: 'Andy Li',
    verifiedAt: '2026-08-09',
  },
  'egg-toast-breakfast': {
    key: 'egg-toast-breakfast',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg',
    alt: 'Bữa sáng với trứng, bánh mì nướng và rau tươi',
    license: 'CC BY-SA 4.0',
    author: 'Deborah Tjituka',
    verifiedAt: '2026-08-09',
  },
  'fish-rice-lunch': {
    key: 'fish-rice-lunch',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg',
    alt: 'Đĩa cơm trắng ăn cùng cá và rau xanh',
    license: 'CC BY-SA 4.0',
    author: 'Cheikh cherif',
    verifiedAt: '2026-08-09',
  },
  'vegetable-soup-dinner': {
    key: 'vegetable-soup-dinner',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG',
    alt: 'Bát canh rau củ mùa xuân dùng cho bữa tối',
    license: 'CC BY-SA 4.0',
    author: 'Kolforn',
    verifiedAt: '2026-08-09',
  },
  'fruit-nuts-snack': {
    key: 'fruit-nuts-snack',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg',
    alt: 'Trái cây tươi và các loại hạt dùng cho bữa phụ',
    license: 'CC0',
    author: 'Roberta Sorge',
    verifiedAt: '2026-08-09',
  },
  'green-tea-drink': {
    key: 'green-tea-drink',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg',
    alt: 'Tách trà xanh ít đường dùng cùng đồ ăn nhẹ',
    license: 'CC BY-SA 4.0',
    author: 'Major Lyte',
    verifiedAt: '2026-08-09',
  },
} as const;

const normal: ConfirmedLabResult = {
  testCode: 'WBC',
  testName: 'Số lượng bạch cầu',
  value: 7.2,
  unit: '10^9/L',
  referenceLow: 4,
  referenceHigh: 10,
  referenceText: '4 - 10',
};

const lowRbc: ConfirmedLabResult = {
  ...normal,
  testCode: 'RBC',
  testName: 'Số lượng hồng cầu',
  value: 3.8,
  unit: '10^12/L',
  referenceLow: 4,
  referenceHigh: 5.5,
  referenceText: '4 - 5.5',
};

const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK'] as const;

function mediaTuple(item: MealPlanItem): Record<string, unknown> {
  return {
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    imageSourceUrl: item.imageSourceUrl,
    imageLicense: item.imageLicense,
    imageAuthor: item.imageAuthor,
    imageVerifiedAt: item.imageVerifiedAt,
  };
}

function catalogTuple(key: FoodImageKey): Record<string, unknown> {
  const image = expectedCatalog[key];
  return {
    imageUrl: image.imageUrl,
    imageAlt: image.alt,
    imageSourceUrl: image.sourceUrl,
    imageLicense: image.license,
    imageAuthor: image.author,
    imageVerifiedAt: image.verifiedAt,
  };
}

function validGeminiItems(): Array<Record<string, unknown>> {
  return mealTypes.map((mealType) => ({
    mealType,
    name: `${mealType} item`,
    description: `${mealType} description`,
    ingredients: `${mealType} ingredients`,
    preparation: `${mealType} preparation`,
    rationale: `${mealType} rationale`,
  }));
}

describe('verified Wikimedia food image catalog', () => {
  it('contains exactly six unique trusted records with complete attribution', () => {
    const keys = Object.keys(expectedCatalog) as FoodImageKey[];
    expect(Object.keys(verifiedFoodImages)).toEqual(keys);
    expect(new Set(keys).size).toBe(6);
    expect(verifiedFoodImages).toEqual(expectedCatalog);
    expect(listVerifiedFoodImages()).toEqual(keys.map((key) => expectedCatalog[key]));
    expect(FOOD_IMAGE_VERIFIED_AT).toBe('2026-08-09');

    for (const image of listVerifiedFoodImages()) {
      expect(image.imageUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
      expect(image.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(image.alt.trim()).not.toBe('');
      expect(image.author.trim()).not.toBe('');
      expect(image.license.trim()).not.toBe('');
      expect(image.verifiedAt).toBe('2026-08-09');
    }
  });

  it('deep-freezes the catalog and every listed record', () => {
    const listed = listVerifiedFoodImages();
    const first = listed[0] as any;
    const originalAlt = first.alt;
    const mutationSucceeded = Reflect.set(first, 'alt', 'tampered');
    if (mutationSucceeded) Reflect.set(first, 'alt', originalAlt);

    expect(Object.isFrozen(verifiedFoodImages)).toBe(true);
    expect(listed.every((image) => Object.isFrozen(image))).toBe(true);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(mutationSucceeded).toBe(false);
    expect(() => (listed as unknown as any[]).push(listed[0])).toThrow(TypeError);
  });

  it('maps low-RBC and default meal labels to the matching trusted images', async () => {
    const provider = new RuleBasedAIProvider();
    const lowPlan = await provider.generateMealPlan('report-low', [lowRbc], 30);
    const defaultPlan = await provider.generateMealPlan('report-normal', [normal], 30);

    expect(lowPlan.items.map((item) => item.name)).toEqual([
      'Phở bò rau xanh',
      'Cơm, cá và rau xanh',
      'Canh rau củ và đậu hũ non',
      'Trái cây tươi và các loại hạt',
      'Nước lọc / trà xanh ít đường',
    ]);
    expect(defaultPlan.items[0].name).toBe('Bánh mì nguyên cám, trứng và rau tươi');
    expect(lowPlan.items[0]).toMatchObject({ ingredients: expect.stringContaining('Bánh phở'), preparation: expect.stringContaining('Trụng bánh phở') });
    expect(defaultPlan.items[0]).toMatchObject({ ingredients: expect.stringContaining('Bánh mì'), preparation: expect.stringContaining('Nướng bánh mì') });
    expect(lowPlan.items[1]).toMatchObject({ ingredients: expect.stringContaining('cá'), preparation: expect.stringContaining('cá') });
    expect(lowPlan.items[2]).toMatchObject({ ingredients: expect.stringMatching(/rau củ/i), preparation: expect.stringContaining('rau củ') });
    expect(lowPlan.items[3]).toMatchObject({ ingredients: expect.stringContaining('hạnh nhân'), preparation: expect.stringContaining('trái cây') });
    expect(lowPlan.items[4]).toMatchObject({ ingredients: expect.stringContaining('trà xanh'), preparation: expect.stringContaining('trà xanh') });
    expect(mediaTuple(lowPlan.items[0])).toEqual(catalogTuple('beef-noodle-breakfast'));
    expect(mediaTuple(defaultPlan.items[0])).toEqual(catalogTuple('egg-toast-breakfast'));

    const sharedKeys: FoodImageKey[] = [
      'fish-rice-lunch',
      'vegetable-soup-dinner',
      'fruit-nuts-snack',
      'green-tea-drink',
    ];
    sharedKeys.forEach((key, index) => {
      expect(mediaTuple(lowPlan.items[index + 1])).toEqual(catalogTuple(key));
      expect(mediaTuple(defaultPlan.items[index + 1])).toEqual(catalogTuple(key));
    });

    for (const item of [...lowPlan.items, ...defaultPlan.items]) {
      expect(item.description).toContain(item.name.split(/[\/,]/)[0].trim());
      expect(item.ingredients.trim()).not.toBe('');
      expect(item.preparation.trim()).not.toBe('');
      expect(Object.values(expectedCatalog).map((image) => image.imageUrl)).toContain(item.imageUrl);
    }
  });

  it('copies only core fields from a strict Gemini meal draft and emits all-null provenance', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(
      JSON.stringify({ title: 'Gemini meal plan', description: 'A balanced day', items: validGeminiItems() }),
    );

    const plan = await provider.generateMealPlan('report-1', [normal], 30);

    expect(plan.reportId).toBe('report-1');
    expect(plan.items.map((item) => item.mealType)).toEqual(mealTypes);
    for (const item of plan.items) {
      expect(mediaTuple(item)).toEqual({
        imageUrl: null,
        imageAlt: null,
        imageSourceUrl: null,
        imageLicense: null,
        imageAuthor: null,
        imageVerifiedAt: null,
      });
    }
  });

  it.each([
    ['an extra root field', { title: 'Plan', description: 'Description', items: validGeminiItems(), extra: true }],
    [
      'an arbitrary image URL',
      {
        title: 'Plan',
        description: 'Description',
        items: [{ ...validGeminiItems()[0], imageUrl: 'https://example.com/untrusted.jpg' }, ...validGeminiItems().slice(1)],
      },
    ],
    [
      'an extra item field',
      {
        title: 'Plan',
        description: 'Description',
        items: [{ ...validGeminiItems()[0], attackerControlled: true }, ...validGeminiItems().slice(1)],
      },
    ],
    [
      'a missing meal type',
      { title: 'Plan', description: 'Description', items: validGeminiItems().filter((item) => item.mealType !== 'DRINK') },
    ],
    [
      'a duplicate meal type',
      {
        title: 'Plan',
        description: 'Description',
        items: validGeminiItems().map((item, index) => (index === 4 ? { ...item, mealType: 'SNACK' } : item)),
      },
    ],
  ])('rejects Gemini meal drafts containing %s', async (_caseName, payload) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(JSON.stringify(payload));

    await expect(provider.generateMealPlan('report-1', [normal], 30)).rejects.toThrow(
      'AI trả về thực đơn không đúng định dạng.',
    );
  });

  it('rejects malformed Gemini meal JSON', async () => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue('{not valid JSON');

    await expect(provider.generateMealPlan('report-1', [normal], 30)).rejects.toThrow(
      'AI trả về thực đơn không đúng định dạng.',
    );
  });

  it.each([
    ['title', { title: '', description: 'Description', items: validGeminiItems() }],
    ['description', { title: 'Plan', description: '', items: validGeminiItems() }],
    ['name', { title: 'Plan', description: 'Description', items: [{ ...validGeminiItems()[0], name: '' }, ...validGeminiItems().slice(1)] }],
    ['item description', { title: 'Plan', description: 'Description', items: [{ ...validGeminiItems()[0], description: '' }, ...validGeminiItems().slice(1)] }],
    ['ingredients', { title: 'Plan', description: 'Description', items: [{ ...validGeminiItems()[0], ingredients: '' }, ...validGeminiItems().slice(1)] }],
    ['preparation', { title: 'Plan', description: 'Description', items: [{ ...validGeminiItems()[0], preparation: '' }, ...validGeminiItems().slice(1)] }],
    ['rationale', { title: 'Plan', description: 'Description', items: [{ ...validGeminiItems()[0], rationale: '' }, ...validGeminiItems().slice(1)] }],
  ])('rejects an empty Gemini meal draft %s', async (_field, payload) => {
    const provider = new GeminiAIProvider();
    jest.spyOn(provider as any, 'text').mockResolvedValue(JSON.stringify(payload));

    await expect(provider.generateMealPlan('report-1', [normal], 30)).rejects.toThrow(
      'AI trả về thực đơn không đúng định dạng.',
    );
  });

  it('mirrors Gemini meal constraints in a physical JSON contract', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const schema = JSON.parse(readFileSync(join(contractsDir, 'json', 'gemini_meal_draft.schema.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'gemini_meal_draft.example.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(contractsDir, 'manifest.json'), 'utf8'));
    const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);

    expect(manifest.contracts).toContainEqual({
      id: 'gemini_meal_draft',
      schema: 'json/gemini_meal_draft.schema.json',
      example: 'examples/gemini_meal_draft.example.json',
    });
    expect(validate(example)).toBe(true);
    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({ ...example, title: '' })).toBe(false);
    expect(validate({ ...example, items: example.items.slice(0, 4) })).toBe(false);
    expect(validate({
      ...example,
      items: example.items.map((item: any, index: number) => index === 4 ? { ...item, mealType: 'SNACK' } : item),
    })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], imageUrl: 'https://example.com/a.jpg' }, ...example.items.slice(1)],
    })).toBe(false);
  });

  it('allows only an exact catalog tuple or all-null media in the final meal contract', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const schema = JSON.parse(readFileSync(join(contractsDir, 'json', 'meal_plan.schema.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'meal_plan.example.json'), 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(example)).toBe(true);
    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({ ...example, items: example.items.slice(0, 4) })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], name: '' }, ...example.items.slice(1)] })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], imageUrl: 'https://example.com/untrusted.jpg' }, ...example.items.slice(1)],
    })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], imageAuthor: null }, ...example.items.slice(1)],
    })).toBe(false);

    for (const key of Object.keys(expectedCatalog) as FoodImageKey[]) {
      const plan = {
        ...example,
        items: [{ ...example.items[0], ...catalogTuple(key) }, ...example.items.slice(1)],
      };
      expect({ key, valid: validate(plan), errors: validate.errors }).toEqual({ key, valid: true, errors: null });
    }

    const allNullPlan = {
      ...example,
      items: example.items.map((item: any) => ({
        ...item,
        imageUrl: null,
        imageAlt: null,
        imageSourceUrl: null,
        imageLicense: null,
        imageAuthor: null,
        imageVerifiedAt: null,
      })),
    };
    expect(validate(allNullPlan)).toBe(true);
  });

  it('uses OpenAPI 3.1 JSON Schema semantics for component contracts', () => {
    const openapi = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'contracts', 'openapi.json'), 'utf8'),
    );

    expect(openapi.openapi).toBe('3.1.0');
    const responseData = openapi.paths['/analysis/confirm'].post.responses['200']
      .content['application/json'].schema.properties.data.properties;
    expect(responseData.mealPlan.$ref).toBe('#/components/schemas/MealPlan');
    expect(responseData.exercisePlan.$ref).toBe('#/components/schemas/ExercisePlan');
  });

  it('compiles and enforces the final meal contract through the OpenAPI component refs', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'meal_plan.example.json'), 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/MealPlan',
      components: openapi.components,
    });

    expect(validate(example)).toBe(true);
    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({ ...example, items: [{ ...example.items[0], unexpected: true }, ...example.items.slice(1)] })).toBe(false);
    expect(validate({ ...example, items: example.items.slice(0, 4) })).toBe(false);
    expect(validate({
      ...example,
      items: example.items.map((item: any, index: number) => index === 4 ? { ...item, mealType: 'SNACK' } : item),
    })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], imageUrl: 'https://example.com/untrusted.jpg' }, ...example.items.slice(1)],
    })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], imageAuthor: expectedCatalog['egg-toast-breakfast'].author }, ...example.items.slice(1)],
    })).toBe(false);

    const allNullPlan = {
      ...example,
      items: example.items.map((item: any) => ({
        ...item,
        imageUrl: null,
        imageAlt: null,
        imageSourceUrl: null,
        imageLicense: null,
        imageAuthor: null,
        imageVerifiedAt: null,
      })),
    };
    expect(validate(allNullPlan)).toBe(true);

    for (const key of Object.keys(expectedCatalog) as FoodImageKey[]) {
      const plan = {
        ...example,
        items: [{ ...example.items[0], ...catalogTuple(key) }, ...example.items.slice(1)],
      };
      expect({ key, valid: validate(plan), errors: validate.errors }).toEqual({ key, valid: true, errors: null });
    }
  });

  it('compiles and enforces exact YouTube tuples through the OpenAPI component refs', () => {
    const contractsDir = join(__dirname, '..', '..', 'contracts');
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(contractsDir, 'examples', 'exercise_plan.example.json'), 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/ExercisePlan',
      components: openapi.components,
    });
    const youtubeTuple = (key: ExerciseVideoKey) => {
      const video = verifiedExerciseVideos[key];
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
    };

    expect(validate(example)).toBe(true);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], youtubeUrl: 'https://www.youtube.com/watch?v=forged' }, example.items[1]],
    })).toBe(false);
    expect(validate({
      ...example,
      items: [{ ...example.items[0], youtubeTitle: verifiedExerciseVideos['beginner-yoga'].title }, example.items[1]],
    })).toBe(false);

    for (const key of Object.keys(verifiedExerciseVideos) as ExerciseVideoKey[]) {
      const plan = {
        ...example,
        items: [{ ...example.items[0], ...youtubeTuple(key) }, example.items[1]],
      };
      expect({ key, valid: validate(plan), errors: validate.errors }).toEqual({ key, valid: true, errors: null });
    }
  });

  it('publishes typed history list and detail paths using shared component refs', () => {
    const openapi = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'contracts', 'openapi.json'), 'utf8'),
    );
    const historyPath = openapi.paths['/analysis/history'].get;
    const detailPath = openapi.paths['/analysis/history/{reportId}'].get;
    const historyResponse = historyPath.responses['200'].content['application/json'].schema;
    const detailResponse = detailPath.responses['200'].content['application/json'].schema;

    expect(historyResponse.properties.data.$ref)
      .toBe('#/components/schemas/HistoryList');
    expect(openapi.components.schemas.HistoryList.properties.reports.items.$ref)
      .toBe('#/components/schemas/HistoryReport');
    expect(detailPath.parameters).toContainEqual(expect.objectContaining({
      name: 'reportId',
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }));
    expect(detailResponse.properties.data.properties.report.$ref)
      .toBe('#/components/schemas/ReportDetail');
    expect(openapi.components.schemas.ReportDetail.properties.mealPlan.oneOf)
      .toContainEqual({ $ref: '#/components/schemas/MealPlan' });
    expect(openapi.components.schemas.ReportDetail.properties.exercisePlan.oneOf)
      .toContainEqual({ $ref: '#/components/schemas/ExercisePlan' });
  });
});
