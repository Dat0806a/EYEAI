# P1 Verified Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete P1 verified YouTube exercise videos and food images with deterministic tests, persisted provenance, frontend rendering, and a clean pinned backend test toolchain.

**Architecture:** Keep external URLs in curated backend catalogs rather than generating them through AI. Persist verification metadata with each generated plan so history reloads retain provenance. Unit and contract tests remain offline; a separate explicit verification script checks YouTube oEmbed and Wikimedia resources without making CI network-dependent.

**Tech Stack:** Node.js 24, TypeScript 5.9.3, Express, SQLite, Jest/ts-jest 29, React 19, Vite, Vitest, Testing Library, GitHub Actions.

---

### Task 1: Pin and Regenerate the Backend Test Toolchain

**Files:**
- Modify: `backend/package.json`
- Regenerate: `backend/package-lock.json`

- [x] **Step 1: Pin exact compatible versions**

Set these exact dev dependency values:

```json
{
  "@types/jest": "29.5.14",
  "jest": "29.7.0",
  "ts-jest": "29.4.12",
  "typescript": "5.9.3"
}
```

- [x] **Step 2: Regenerate the dependency graph cleanly**

From `backend/`, stop only the project backend process, remove `node_modules` and `package-lock.json`, then run:

```powershell
npm install
```

Expected: a new lockfile whose root package and installed nodes resolve the exact versions above.

- [x] **Step 3: Verify the installed graph**

Run:

```powershell
npm ls jest ts-jest @types/jest jest-util typescript --all
```

Expected: Jest 29.7.0, ts-jest 29.4.12, @types/jest 29.5.14, TypeScript 5.9.3, and jest-util 29.7.0 only as a transitive dependency.

### Task 2: Replace the Invalid Exercise Catalog with oEmbed-Verified Metadata

**Files:**
- Modify: `backend/tests/exerciseCatalog.test.ts`
- Modify: `backend/src/services/ai/exerciseCatalog.ts`
- Modify: `backend/src/services/ai/ruleBasedProvider.ts`
- Modify: `backend/src/services/ai/geminiProvider.ts`
- Modify: `backend/src/services/ai/types.ts`
- Modify: `contracts/json/exercise_plan.schema.json`
- Modify: `contracts/examples/exercise_plan.example.json`
- Create: `contracts/json/gemini_exercise_draft.schema.json`
- Create: `contracts/examples/gemini_exercise_draft.example.json`
- Modify: `contracts/manifest.json`

- [x] **Step 1: Write deterministic failing tests**

Replace the network test with offline assertions for these oEmbed-verified records:

```typescript
expect(verifiedExerciseVideos['walk-at-home']).toMatchObject({
  videoId: 'u08lo0bESJc',
  title: 'Heart Healthy - 1 Mile Walk | Walk at Home',
  authorName: 'Walk at Home',
  verifiedBy: 'YOUTUBE_OEMBED',
});

expect(verifiedExerciseVideos['beginner-yoga']).toMatchObject({
  videoId: 'v7AYKMP6rOE',
  title: 'Yoga For Complete Beginners - 20 Minute Home Yoga Workout!',
  authorName: 'Yoga With Adriene',
});

expect(verifiedExerciseVideos['chair-yoga']).toMatchObject({
  videoId: '1DYH5ud3zHo',
  title: 'Gentle Chair Yoga for Beginners and Seniors',
  authorName: 'Yoga with Kassandra',
});
```

Also assert that users age 60+ receive `chair-yoga`, younger users receive `beginner-yoga`, and every emitted URL belongs to the catalog.

- [x] **Step 2: Run the targeted test and verify RED**

Run:

```powershell
npm test -- --runInBand tests/exerciseCatalog.test.ts
```

Expected: FAIL because the draft catalog has invalid IDs/metadata and the provider maps seniors to the wrong video.

- [x] **Step 3: Implement the verified catalog**

Use this shape:

```typescript
export interface VerifiedExerciseVideo {
  key: 'walk-at-home' | 'beginner-yoga' | 'chair-yoga';
  videoId: string;
  youtubeUrl: string;
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  verified: true;
  verifiedBy: 'YOUTUBE_OEMBED';
  verifiedAt: '2026-08-09';
}
```

Build `youtubeUrl` from `videoId`; never accept arbitrary AI-generated URLs.

- [x] **Step 4: Persist and expose provenance fields**

Extend `ExercisePlanItem` and its JSON Schema/example with:

```typescript
youtubeVideoId: string | null;
youtubeTitle: string | null;
youtubeAuthor: string | null;
youtubeAuthorUrl: string | null;
youtubeThumbnailUrl: string | null;
youtubeVerifiedAt: string | null;
```

Normalize Gemini exercise items so every verification field is explicitly `null` and `youtubeVerified` is `false`; Gemini must never supply an unverified external URL.

Because the Gemini draft is structured AI output, add a physical JSON Schema and valid synthetic example for its strict 2-3 item shape, and register both in `contracts/manifest.json`.

- [x] **Step 5: Run the targeted test and verify GREEN**

Run the same targeted Jest command. Expected: PASS with no network call.

### Task 3: Add Verified Wikimedia Food Images and Database Provenance

**Files:**
- Create: `backend/tests/foodImageCatalog.test.ts`
- Create: `backend/tests/analysisPersistence.test.ts`
- Create: `backend/src/services/ai/foodImageCatalog.ts`
- Create: `backend/src/database/migrations/002_verified_media.sql`
- Modify: `backend/src/database/index.ts`
- Modify: `backend/tests/database.test.ts`
- Modify: `backend/src/services/ai/ruleBasedProvider.ts`
- Modify: `backend/src/services/ai/geminiProvider.ts`
- Modify: `backend/src/services/ai/types.ts`
- Modify: `backend/src/controllers/analysisController.ts`
- Modify: `contracts/json/meal_plan.schema.json`
- Modify: `contracts/examples/meal_plan.example.json`
- Modify: `contracts/json/exercise_plan.schema.json`
- Modify: `contracts/examples/exercise_plan.example.json`
- Modify: `contracts/openapi.json`
- Modify: `frontend/src/types/index.ts`

- [x] **Step 1: Write failing catalog and migration tests**

The catalog test must assert unique keys, HTTPS Wikimedia URLs, Commons source URLs, non-empty alt text/author/license, and `verifiedAt === '2026-08-09'`. The database test must assert migration `002_verified_media.sql` is recorded and all provenance columns exist. The persistence test must call the real analysis controller with a temporary user/report, then call the real report-detail controller and assert all meal/video metadata round-trips in camelCase.

Run:

```powershell
npm test -- --runInBand tests/foodImageCatalog.test.ts tests/database.test.ts
```

Expected: FAIL because the catalog, migration, and columns do not exist.

- [x] **Step 2: Implement the catalog**

Use this interface:

```typescript
export interface VerifiedFoodImage {
  key: string;
  imageUrl: string;
  sourceUrl: string;
  alt: string;
  license: string;
  author: string;
  verifiedAt: '2026-08-09';
}
```

Catalog entries:

```typescript
const verifiedFoodImages = {
  'beef-noodle-breakfast': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Beef_noodle_soup_(Ph%E1%BB%9F_b%C3%B2)_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    license: 'CC0',
    author: 'Andy Li',
  },
  'egg-toast-breakfast': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg',
    license: 'CC BY-SA 4.0',
    author: 'Deborah Tjituka',
  },
  'fish-rice-lunch': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg',
    license: 'CC BY-SA 4.0',
    author: 'Cheikh cherif',
  },
  'vegetable-soup-dinner': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG',
    license: 'CC BY-SA 4.0',
    author: 'Kolforn',
  },
  'fruit-nuts-snack': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg',
    license: 'CC0',
    author: 'Roberta Sorge',
  },
  'green-tea-drink': {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg',
    license: 'CC BY-SA 4.0',
    author: 'Major Lyte',
  },
} as const;
```

- [x] **Step 3: Map every rule-based meal item to a catalog entry**

Extend `MealPlanItem` with:

```typescript
imageAlt: string | null;
imageSourceUrl: string | null;
imageLicense: string | null;
imageAuthor: string | null;
imageVerifiedAt: string | null;
```

Normalize Gemini meal items so all image/provenance fields are explicitly `null`; only the curated rule-based catalog may emit verified image URLs.

Use these image-aligned meal labels: low-RBC breakfast `Phở bò rau xanh`; default breakfast `Bánh mì nguyên cám, trứng và rau tươi`; lunch `Cơm, cá và rau xanh`; dinner `Canh rau củ và đậu hũ non`; snack `Trái cây tươi và các loại hạt`; drink `Nước lọc / trà xanh ít đường`. Update ingredients/preparation text to match those labels.

- [x] **Step 4: Add migration 002 and wire migration discovery**

Add nullable columns `image_alt`, `image_source_url`, `image_license`, `image_author`, and `image_verified_at` to `meal_plan_items`. Add nullable columns `youtube_video_id`, `youtube_title`, `youtube_author`, `youtube_author_url`, `youtube_thumbnail_url`, and `youtube_verified_at` to `exercise_items`. Keep existing `youtube_source` and set it to `YouTube oEmbed`. Update the migration runner to discover sorted `*.sql` files instead of hard-coding `001_initial.sql`.

- [x] **Step 5: Persist and reload all metadata**

Update insert/select statements in `analysisController.ts` so fresh responses and history detail return the same media metadata. Alias all persisted snake_case meal and exercise fields to the camelCase API contract (`mealType`, `imageUrl`, `youtubeUrl`, and every new provenance field) when reading history.

- [x] **Step 6: Synchronize contracts and frontend types**

Make all nullable media fields explicit in schemas/examples, OpenAPI component schemas, and TypeScript types. Run:

```powershell
npm run test:contract
```

Expected: all contract examples pass.

- [x] **Step 7: Verify GREEN**

Run the targeted catalog/database tests and the full backend suite. Expected: all PASS offline.

### Task 4: Add an Explicit External Media Verification Command

**Files:**
- Create: `backend/scripts/verify-media-catalog.ts`
- Modify: `backend/package.json`

- [x] **Step 1: Add a non-CI verification script**

The script must:

```text
1. Request YouTube oEmbed for each catalog video.
2. Compare returned title and author_name with committed metadata.
3. Request each Wikimedia source page/API and direct image sequentially with a descriptive User-Agent.
4. Require a successful status and image/* content type.
5. Exit non-zero on any mismatch.
```

Add:

```json
"verify:media": "ts-node --transpile-only scripts/verify-media-catalog.ts"
```

- [x] **Step 2: Run external verification**

Run:

```powershell
npm run verify:media
```

Expected: every video and image reports PASS. This command is recorded in the checkpoint but is intentionally not added to GitHub Actions.

### Task 5: Render Verified Media with Accessible Fallbacks

**Files:**
- Create: `frontend/src/components/VerifiedMedia.tsx`
- Create: `frontend/src/components/VerifiedMedia.test.tsx`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/src/pages/AnalysisPage.tsx`
- Modify: `frontend/package.json`
- Regenerate: `frontend/package-lock.json`
- Modify: `.github/workflows/ci.yml`

- [x] **Step 1: Add frontend test dependencies and a failing component test**

Add exact versions `vitest@4.1.10`, `jsdom@29.0.0`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, and `@testing-library/jest-dom@7.0.0`. Test that meal images use `loading="lazy"`, meaningful alt text, a visible source/license link, and an on-error fallback. Test that video links render only when `youtubeVerified === true` and include title/author metadata.

Run:

```powershell
npm test -- --run
```

Expected: FAIL before the component exists.

- [x] **Step 2: Implement `VerifiedMedia.tsx` and integrate it**

Use an accessible figure/card with lazy loading, fixed aspect ratio, `object-cover`, a source link, and a non-broken fallback panel. Video links must use `target="_blank"` and `rel="noopener noreferrer"`.

- [x] **Step 3: Verify frontend tests and build**

Run:

```powershell
npm test -- --run
npm run build
```

Expected: tests and production build PASS.

- [x] **Step 4: Make CI run frontend tests deterministically**

Add a frontend test step after `npm ci` and before the frontend build using `working-directory: frontend` and `npm test -- --run`. Do not add `continue-on-error`, `|| true`, or network media verification.

### Task 6: Documentation, Browser QA, Checkpoint, Commit, and Push

**Files:**
- Modify: `docs/features/food_images.md`
- Modify: `docs/features/youtube.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Refresh feature evidence**

Mark Food Images and Verified YouTube as DONE only after backend tests, frontend tests/build, external verification, persistence reload, and browser QA all pass.

- [ ] **Step 2: Run fresh full verification**

From `backend/`:

```powershell
npm ls jest ts-jest @types/jest jest-util typescript --all
npm test
npm run build
npm run verify:media
```

From `frontend/`:

```powershell
npm test -- --run
npm run build
```

Validate workflow YAML syntax and inspect `git diff --check`.

- [ ] **Step 3: Run browser QA**

Verify desktop and 390x844 mobile layouts, image loading/fallback, source links, verified video title/author/link, history reload persistence, console errors, and horizontal overflow.

- [ ] **Step 4: Write the P1 media checkpoint**

Record exact created/modified/deleted files, commands, per-test results, build results, current errors, commit SHA, and all external tools used/not used in `PROJECT_STATUS.md`.

- [ ] **Step 5: Commit and push**

Stage only intended files, commit without amending, push `master` to `origin`, then verify the new GitHub Actions run reaches `completed / success`. If CI exposes another real failure, continue debugging until green.
