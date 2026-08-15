# Project Status

## Checkpoint 2026-08-13 — Explicit REGISTER / LOGIN / LINK semantics (uncommitted)

- Product invariant implemented: `REGISTER != LOGIN != LINK` for Google, Facebook and Phone. Public LOGIN is existing-only; public REGISTER is new-only; LINK is authenticated and conflict-safe.
- OAuth state, opaque callback code, frontend callback URL and exchange body bind the same intent. Cross-purpose, browser mismatch, TTL expiry and replay fail closed; JWT/token/PII remain absent from callback URLs.
- Phone registration uses dedicated request/verify endpoints. Unknown LOGIN creates nothing; only verified REGISTER may create a shared user with `email_is_placeholder=1`; existing REGISTER returns safe login guidance after OTP proof.
- `/register` exposes Google, Facebook, phone and email/password; `/login` retains email/password, Google, Facebook and phone. `PhoneOtpFlow` dispatches explicit `login|register|link` and renders safe Vietnamese CTAs.
- Migration 010 rebuilds ephemeral OAuth/phone proof tables for `REGISTER`. Pending proof rows are intentionally invalidated; persistent users/provider identities/phone identities/profile/medical data remain intact.
- Contracts updated: OAuth session requires `intent`, OAuth exchange requires `{code,intent}`, callback location includes intent, public social starts require `LOGIN|REGISTER`, and phone registration endpoints are in OpenAPI.
- Live eSMS testing remains paused. No live SMS was sent, local credentials were not read/logged, and no live handset PASS is claimed.
- Verification in progress: focused frontend intent suites 92/92 PASS; focused contract suites 46/46 PASS; final full backend/frontend/build/browser gates will be recorded before readiness is declared.

## Current phase
P0, implemented P1 work, Google OAuth, Facebook OAuth, and Phone Auth are complete. eSMS adapter complete; live handset E2E pending eSMS balance.

## Overall status
COMPLETE ? MILESTONE AUTH + PHONE AUTH

## Completed work
- Repository ntc0407/Y-T-AUTO: docs, contracts, CI, backend, frontend — committed and pushed.
- JSON contracts: 17 schemas + 17 examples + manifest + OpenAPI 3.1 (BOM-free, validated).
- Backend (Express 5 + TypeScript + SQLite): auth, profile, OCR abstraction (Dev fallback + Gemini), AI abstraction (rule-based + Gemini), analysis confirm/history/detail, chat, migrations, validation, error handling.
- Committed backend baseline: 23/23 tests passing (5 suites).
- Frontend (React 19 + Vite + TS + Tailwind v4): login/register, profile, dashboard, OCR upload/camera/drag-drop + sample report, review/edit/confirm, analysis (explanation/meal/exercise tabs), history, floating chatbot, responsive states, medical disclaimer.
- Frontend production build passes (tsc + vite).
- E2E API smoke passed (register → profile → OCR → confirm → analysis → meal → exercise → history → chat).
- **Browser QA with real Chrome (puppeteer-core): 11/11 steps PASS** — register, profile, dashboard, scan, OCR upload, review/confirm, analysis, meal tab, exercise tab, history, chatbot, mobile viewport (no horizontal overflow). Screenshots verified visually.
- Backend OCR controller fix: allow text/plain sample uploads only in dev mode (no GEMINI_API_KEY) for the DEV_FALLBACK provider; production validation unchanged.
- README.md and docs/FEATURE_INDEX.md updated.
- GitHub Actions run `31275090053` for commit `e54404a` completed successfully.
- Capability Discovery verified Browser, Chrome, GitHub, Figma/Figma Make, and Google AI Studio with live tools. Native Computer Use is PARTIAL because window discovery works but direct window-state/UI actions fail in the current runtime.
- Backend Jest/TypeScript toolchain normalized and clean-installed: Jest 29.7.0, ts-jest 29.4.12, @types/jest 29.5.14, TypeScript 5.9.3; jest-util 29.7.0 remains transitive only.
- Verified YouTube catalog implemented with three live-oEmbed-validated records, age-aware mapping, immutable trusted metadata, strict Gemini isolation, a 120-minute safety cap, and synchronized physical contracts/examples.
- Verified Wikimedia catalog implemented with six attributed records; meal and YouTube provenance now round-trip atomically through SQLite/history using migration-safe, concurrency-safe dedicated transactions.

## Current task
Phone authentication implementation and documentation are the current milestone. OAuth login/link hardening is complete; Facebook OAuth is DONE for implemented acceptance criteria. eSMS adapter automation is implemented without reading local credentials; live handset receipt remains an external proof gap, not mocked functionality.

## P0 status
- Authentication foundation: DONE
- Profile: DONE
- Dashboard: DONE
- Camera/upload: DONE
- OCR: DONE for configured local environment (Dev fallback and real Gemini request verified)
- Structured OCR: DONE
- OCR Review: DONE
- Correction: DONE
- Confirmation: DONE
- Lab Analysis: DONE (rule-based and real Gemini request verified)
- Easy Explanation: DONE
- LOW/NORMAL/HIGH/UNKNOWN: DONE
- Lab persistence: DONE
- Meal Plan: DONE
- Meal persistence: DONE
- Exercise: DONE
- History: DONE
- Text chatbot: DONE
- Responsive: DONE (browser QA mobile check passed)
- States: DONE
- End-to-end workflow: DONE (API smoke + browser QA)

## P1 status
- Google OAuth: DONE for current acceptance criteria (real Google authorization, backend callback, user login/link, JWT session, and frontend dashboard redirect verified)
- Food Images: DONE (6 verified Wikimedia records; verifier 6/6; frontend rendering/browser QA PASS)
- Verified YouTube: DONE (3 verified oEmbed records; verifier 3/3; frontend rendering/browser QA PASS)
- Voice Chat: DONE (Web Speech input + speechSynthesis output; unit/component tests PASS; real mic/TTS cần quyền trình duyệt)
- Accessibility polish: PARTIAL (focus-visible ring cho Button/Input + aria-live chat; tiếp tục mở rộng)
- Advanced Browser QA: DONE (11/11 core steps)

## P2 status
- Facebook OAuth: DONE (real tester flow plus browser-bound one-time callback exchange, verified-email trust rules, account linking and persistent pending-state isolation)
- Phone OTP: DONE (migration 009/010, Twilio/eSMS adapters, persistent lifecycle/rate limits, login/link/status UI); live eSMS handset E2E pending
- Advanced personalization: NOT_STARTED
- Additional enhancements: NOT_STARTED

## Feature Registry Status
IN_PROGRESS — docs/FEATURE_INDEX.md refreshed.

## JSON Contract Status
IN_PROGRESS — physical schemas/examples include shared auth session, phone challenge/status, `/auth/me` and provider status; final full contract/regression evidence is recorded by the latest milestone checkpoint.

## OpenAPI Status
DONE for current backend — OpenAPI 3.1 models confirm, history list, report detail, exact media tuples, and nullable unverified states.

## Assumptions
- SQLite for local dev; migration system ready for PostgreSQL.
- DEV_FALLBACK providers labeled PARTIAL (never production OCR/AI).
- Vietnamese UI default.

## Decisions
- Frontend: React 19 + Vite + TS + Tailwind v4.
- Backend: Express 5 + TS + SQLite + JWT.
- Test toolchain pinned: jest 29.7.0 / ts-jest 29.4.12 / @types/jest 29.5.14.
- puppeteer-core added as frontend devDependency for browser QA with installed Chrome.

## Architecture decisions
- Modular monolith; REST API; OCR/AI abstractions; contracts synchronized.
- SQLite writes for analysis replacement use dedicated file-backed connections plus a normalized-path transaction queue; `:memory:` is rejected because multi-connection isolation is required.

## GitHub status
AVAILABLE; local `master` and `origin/master` were synchronized at the start of the Google OAuth finalization checkpoint. Current commit/push/CI evidence is reported by the latest checkpoint and release report instead of duplicating a stale SHA here.

## Figma status
AVAILABLE for authenticated read access through the official Figma MCP (`whoami`) and Chrome. Figma Make loaded successfully in the authenticated Chrome session. No Figma write action was needed during Capability Discovery.

## Google AI Studio status
AVAILABLE in authenticated Chrome; `https://aistudio.google.com/` loaded the Build workspace and exposed the signed-in application UI. No project or API key was created.

## Environment status
Windows + Node v24.14.0 + Chrome installed. Browser and Chrome control are AVAILABLE. Native Computer Use is PARTIAL due a runtime context error for direct window-state/UI operations.

## External integrations
- Gemini: configured locally; real OCR and AI requests verified without exposing the API key.
- Google OAuth: configured locally; real browser end-to-end flow verified without exposing credentials, OAuth codes, tokens, or account data.
- Facebook OAuth: configured locally; real tester browser flow verified through consent, Graph profile, callback, persistence, session, and frontend onboarding without exposing credentials or tokens.
- Phone OTP: production Twilio and eSMS adapters with selected-provider gating implemented. Automated tests use injected fake providers or mocked HTTP; never read local eSMS credentials. eSMS credentials validated (GetTemplate CodeResult 100, template exists). GetBalance Balance=0. Live handset delivery pending eSMS balance.
- OCR: abstraction implemented; Dev fallback and real Gemini provider verified.

## Tests executed
- Backend Jest: 171/171 passed (14 suites).
- Backend TypeScript build: passed.
- Frontend Vitest: 31/31 passed (6 files).
- Frontend TypeScript + Vite build: passed.
- Browser QA (puppeteer-core + Chrome): 11/11 passed; screenshots saved as evidence.
- Real Google OAuth browser flow and login error rendering: passed.
- Real Facebook OAuth tester flow, Graph permission/profile checks, callback, persistence, session reload, and frontend redirect: passed.
- E2E API smoke: passed.

## Contract test results
Contract suite passes 19/19; registered schema/example/manifest/OpenAPI synchronization remains valid.

## Test results
Backend 171 passed, 0 failed; frontend 31 passed, 0 failed. Core browser QA plus real Google and Facebook OAuth browser verification pass.

## Build results
backend/dist and frontend/dist produced successfully.

## Browser verification
DONE — real Chrome headless, desktop 1280x900 + mobile 390x844: register, profile, dashboard, scan, OCR upload, review/confirm, analysis tabs, history, chatbot, mobile overflow check. One non-critical 404 (favicon) observed; no page errors.

## Mobile verification
DONE — 390x844 viewport render check passed (no horizontal overflow; CTA visible).

## Security checks
- No secrets committed; .env.example only.
- bcryptjs hashing; JWT; ownership checks; AI safety prompts.
- Dev-only text/plain upload enabled only when GEMINI_API_KEY is empty.

## Medical safety checks
- Medical disclaimer on analysis page; AI prohibits diagnosis/medication/range hallucination.

## Known issues
- Live eSMS receipt/delivery is not verified; eSMS account balance is 0; automated implementation does not send SMS and does not read/in/log local credentials. External funding or alternative provider required before production launch.
- Facebook Login for public users without an app role still requires Meta App Review/Advanced Access and Live Mode; this production publishing step was not part of the local tester acceptance.
- Native Computer Use can enumerate apps/windows but direct state capture and activation remain unavailable in this environment.

## Blockers
None (no genuine human blocker).

## Next actions
- Wait for the user's next request.
- After eSMS balance added or alternative provider configured: set `OTP_SMS_PROVIDER=esms` (or `twilio`), restart backend, verify `/api/auth/providers` returns `phoneOtp=true`, run live registration/login/link E2E, verify handset delivery.

## Capability Status

### Computer Use
Status: PARTIAL
Evidence: `@oai/sky` loaded successfully; `list_windows()` returned the active ChatGPT window and `list_apps()` returned installed Windows applications.
Tests performed: Loaded the Computer Use runtime; enumerated applications and windows; attempted `get_window_state` and `activate_window` using the discovered window.
Known issues: The bundled runtime does not expose the documented `sky.documentation()` function. Direct state capture and activation failed after reasonable input-shape retries with `node_repl exec context not found`, so direct native UI reading/control is not verified.

### Browser / Chrome
Status: AVAILABLE
Evidence: The in-app Browser opened GitHub and returned a DOM snapshot. Chrome was launched with the configured profile, connected through the enabled ChatGPT extension/native host, opened the private repository, and read its visible UI.
Tests performed: Browser runtime bootstrap; in-app Browser navigation/DOM read; Chrome installation, extension, and native-host diagnostics; Chrome launch; Chrome session naming; navigation and DOM reads for GitHub, Figma Make, and Google AI Studio.
Known issues: The in-app Browser is not authenticated to private GitHub and therefore showed GitHub's 404 privacy response. Authenticated Chrome works.

### GitHub
Status: AVAILABLE
Evidence: Authenticated Chrome displayed private repository `ntc0407/Y-T-AUTO`, commit `e54404a`, and repository navigation. `git ls-remote origin refs/heads/master` returned the same SHA. Actions run `31275090053` is `completed / success`.
Tests performed: Git remote inspection; remote SHA lookup; authenticated Chrome repository access; GitHub Actions REST verification through the existing credential helper.
Known issues: GitHub CLI (`gh`) is not installed; Git and authenticated browser/API access provide the required functionality.

### Figma / Figma Make
Status: AVAILABLE
Evidence: Official Figma MCP `whoami` returned the authenticated account and starter team. Authenticated Chrome loaded `https://www.figma.com/make/` and displayed the Figma Make product UI while signed in.
Tests performed: Figma MCP authentication probe; Figma Make navigation and DOM read in Chrome.
Known issues: The current Figma seat is View. No target Figma file or write operation was required for this engineering phase, so create/edit capability was intentionally not exercised.

### Google AI Studio
Status: AVAILABLE
Evidence: Authenticated Chrome loaded `https://aistudio.google.com/apps` with the Build workspace, Playground, My apps, Dashboard, and Gemini build options.
Tests performed: Direct navigation, redirect verification, title/URL inspection, and visible DOM read.
Known issues: No `GEMINI_API_KEY` is configured in the repository environment. AI Studio access is available, but creating a project/key or transmitting project data was outside Capability Discovery and was not performed.

## Checkpoint - Capability Discovery (2026-08-09)

### Files created
- None.

### Files modified
- `PROJECT_STATUS.md` - refreshed stale GitHub/capability state and recorded this checkpoint.

### Files deleted
- None.

### Commands and checks executed
- `git rev-parse HEAD`
- `git remote -v`
- `git ls-remote origin refs/heads/master`
- `gh --version`, `gh auth status`, and `gh run view ...` (all unavailable because `gh` is not installed)
- `node scripts/chrome-is-running.js --browser chrome --check`
- `node scripts/installed-browsers.js --json`
- `node scripts/check-extension-installed.js --browser chrome --json`
- `node scripts/check-native-host-manifest.js --browser chrome --json`
- `node scripts/open-chrome-window.js --browser chrome`
- Live Computer Use, Browser, Chrome, Figma MCP, GitHub, Figma Make, and Google AI Studio probes described in `## Capability Status`.

### Test and build results
- Capability smoke checks: Browser/Chrome/GitHub/Figma/Figma Make/Google AI Studio PASS; native Computer Use PARTIAL.
- No source-code test or build was run in this discovery-only stage.
- Existing application servers were left running safely on backend port 5000 and frontend port 5173; no in-progress technical task was interrupted.

### Current errors
- Draft P1 YouTube URLs fail oEmbed verification and the draft network Jest test is unsuitable for deterministic CI.
- Computer Use direct native UI actions fail with a runtime context error.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- `origin/master` matches the current commit.
- GitHub Actions run `31275090053`: `completed / success`.
- P1 exercise catalog files remain uncommitted and require correction before commit.

### External tools actually used
- Git and GitHub (remote lookup, authenticated repository/API verification).
- Computer Use (runtime load and Windows app/window discovery; partial failure documented).
- In-app Browser and Chrome (navigation and visible DOM inspection).
- Figma MCP and Figma Make (authenticated capability checks).
- Google AI Studio (authenticated access check).

### Available tools not used and reasons
- Figma design write tools: not used because this phase did not require creating or modifying a design file, and no target file was supplied.
- Figma Make generation: not used because no code/design synchronization was required during Capability Discovery.
- Google AI Studio project/key creation: not used because it would create external account state and no API credential is required to complete the current verified-media implementation.
- Browser Developer Tools/CDP: not used because DOM/title/URL inspection was sufficient for capability evidence.
- GitHub CLI: not used because it is not installed; authenticated Git, browser, and REST access were used instead.

## Checkpoint - Backend Toolchain and Verified YouTube (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 1 và Task 2 của kế hoạch P1 Verified Media.
- Không còn finding Critical, Important hoặc Minor sau spec review và code-quality review cuối.
- Checkpoint này không phải điểm dừng; workflow tự động chuyển sang Task 3 (verified food images và persistence).

### Files created
- `backend/src/services/ai/exerciseCatalog.ts`
- `backend/tests/exerciseCatalog.test.ts`
- `contracts/json/gemini_exercise_draft.schema.json`
- `contracts/examples/gemini_exercise_draft.example.json`
- `docs/superpowers/plans/2026-08-09-p1-verified-media.md`

### Files modified
- `PROJECT_STATUS.md`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/services/ai/geminiProvider.ts`
- `backend/src/services/ai/ruleBasedProvider.ts`
- `backend/src/services/ai/types.ts`
- `contracts/examples/exercise_plan.example.json`
- `contracts/json/exercise_plan.schema.json`
- `contracts/manifest.json`

### Files deleted
- Không có file dự án nào bị xóa.
- `backend/node_modules` và lockfile cũ đã được loại bỏ trong thao tác tái tạo dependency graph; `node_modules` được cài lại và `backend/package-lock.json` được tạo lại sạch.

### Commands and checks executed
- Đã inspect `backend/package.json`, `backend/package-lock.json`, `backend/jest.config.js`, `backend/tsconfig.json`, `.github/workflows/ci.yml`, `AGENTS.md` và kế hoạch P1.
- Clean dependency regeneration từ `backend/`: loại bỏ `node_modules`/lockfile cũ, chạy `npm install`, sau đó xác minh lại bằng `npm ci`.
- `npm ci` — PASS; cài 475 package, audit 476 package. npm báo warning deprecation từ một số dependency bắc cầu, không có install error.
- `npm ls jest ts-jest @types/jest jest-util typescript --all` — PASS; Jest 29.7.0, ts-jest 29.4.12, @types/jest 29.5.14, TypeScript 5.9.3, jest-util 29.7.0 chỉ là dependency bắc cầu.
- Node `JSON.parse` lockfile check — PASS; lockfileVersion 3, exact root versions đúng yêu cầu, `jestUtilDirect: false`.
- PowerShell `ConvertFrom-Json` lockfile probe — FAIL do PowerShell xử lý key JSON không phân biệt hoa/thường; đã retry bằng Node `JSON.parse` và PASS.
- `npm test -- --runInBand tests/exerciseCatalog.test.ts` — PASS 23/23.
- `npm run test:contract` — PASS 8/8; 7 schema/example pairs hợp lệ và manifest đồng bộ.
- `npm test` — PASS 47/47, 6/6 suites.
- `npm run build` — PASS, TypeScript `tsc` exit 0.
- `npm audit` — PASS, 0 vulnerabilities.
- `git diff --check` — PASS; chỉ có warning dự kiến về chuyển LF/CRLF trên Windows, không có whitespace error.
- Live Node fetch tới YouTube oEmbed cho `u08lo0bESJc`, `v7AYKMP6rOE`, `1DYH5ud3zHo` — PASS; title và author khớp metadata đã commit trong catalog.
- Spec review — PASS sau một vòng sửa literal verification date.
- Code-quality review — PASS sau các vòng sửa exact catalog tuples, giới hạn duration 120 phút, deep-freeze catalog và cross-contract tests cho đủ ba video.

### Test and build results
- Targeted verified-YouTube tests: 23 passed, 0 failed.
- Contract tests: 8 passed, 0 failed.
- Full backend tests: 47 passed, 0 failed.
- Backend build/typecheck: PASS.
- Dependency audit: 0 vulnerabilities.
- GitHub Actions chưa chạy cho thay đổi chưa commit; workflow hiện đã được inspect và dùng `working-directory: backend` với `npm ci`, backend tests và build đúng thư mục.
- `backend/jest.config.js` giữ nguyên vì đang dùng preset `ts-jest` hiện đại, không phát cảnh báo legacy/deprecation và không cần thay đổi hành vi test.

### Current errors and remaining work
- Không còn lỗi trong phạm vi toolchain hoặc verified-YouTube catalog/contracts.
- Metadata meal/exercise mới chưa round-trip qua SQLite/history/controller; đây là Task 3 đang tiếp tục.
- Frontend chưa render verified image/video metadata; đây là Task 5.
- npm vẫn hiển thị deprecation warnings cho một số package bắc cầu cũ, nhưng `npm audit` là 0 vulnerabilities và không có direct dependency mismatch.
- Real Gemini OCR/AI vẫn cần `GEMINI_API_KEY`; không giả lập credential hoặc kết quả production.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên.
- Thay đổi Task 1–2 vẫn chưa stage/commit/push để tránh tạo checkpoint Git giữa một P1 media feature còn dở.

### External tools actually used
- Git: kiểm tra branch, commit, tracking ref, working tree và diff.
- npm/npm registry: clean install, deterministic install, dependency graph và audit.
- YouTube oEmbed: xác minh live title/author cho ba video catalog; Jest vẫn hoàn toàn offline/deterministic.
- Subagent spec/code review: kiểm tra tuân thủ yêu cầu và chất lượng độc lập, sau đó re-review đến khi sạch finding.

### Available tools not used and reasons
- GitHub write/push/Actions: chưa dùng trong checkpoint này vì P1 media chưa hoàn tất toàn bộ persistence/frontend; sẽ dùng sau full verification và commit cuối giai đoạn.
- Browser / Chrome: chưa dùng trong checkpoint backend này vì chưa có UI verified-media để QA; sẽ dùng ở Task 5/6 cho desktop, mobile, fallback, history và console.
- Computer Use: không cần cho dependency/backend contract work; capability vẫn PARTIAL do lỗi runtime đã ghi ở Capability Discovery.
- Figma / Figma Make: chưa dùng vì giai đoạn này không tạo hoặc đồng bộ thiết kế và không có target Figma file.
- Google AI Studio: chưa dùng vì không cần tạo project/key hoặc gửi dữ liệu ra ngoài để hoàn thành catalog deterministic.
- Developer Tools/CDP: chưa dùng vì chưa đến browser-rendering QA.
- GitHub CLI: không dùng vì chưa được cài; Git/REST/Browser sẽ được dùng khi đến bước push và theo dõi Actions.

## Checkpoint - Verified Food Images and Media Persistence (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 3 của kế hoạch P1 Verified Media.
- Spec review và code-quality review cuối không còn finding Critical, Important hoặc Minor.
- Checkpoint hoàn tất và workflow tự động chuyển sang Task 4 external media verification.

### Files created
- `backend/src/database/migrations/002_verified_media.sql`
- `backend/src/services/ai/foodImageCatalog.ts`
- `backend/tests/analysisPersistence.test.ts`
- `backend/tests/foodImageCatalog.test.ts`
- `contracts/json/gemini_meal_draft.schema.json`
- `contracts/examples/gemini_meal_draft.example.json`
- `contracts/json/history_list.schema.json`
- `contracts/examples/history_list.example.json`
- `contracts/json/report_detail.schema.json`
- `contracts/examples/report_detail.example.json`

### Files modified
- `PROJECT_STATUS.md`
- `backend/src/controllers/analysisController.ts`
- `backend/src/database/index.ts`
- `backend/src/services/ai/geminiProvider.ts`
- `backend/src/services/ai/ruleBasedProvider.ts`
- `backend/src/services/ai/types.ts`
- `backend/tests/contract.test.ts`
- `backend/tests/database.test.ts`
- `contracts/examples/meal_plan.example.json`
- `contracts/json/meal_plan.schema.json`
- `contracts/manifest.json`
- `contracts/openapi.json`
- `frontend/src/pages/AnalysisPage.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/types/index.ts`
- `docs/features/food_images.md`
- `docs/features/youtube.md`
- `docs/superpowers/plans/2026-08-09-p1-verified-media.md`

### Files deleted
- Không có file dự án nào bị xóa.
- Mọi thư mục database tạm do Jest tạo được đóng và xóa bằng exact `mkdtemp` path; kiểm tra cuối không để lại thư mục `yte-*` mới.

### Commands and checks executed
- TDD RED ban đầu: `npm test -- --runInBand tests/foodImageCatalog.test.ts tests/database.test.ts tests/analysisPersistence.test.ts` — FAIL 5 tests/3 suites đúng do thiếu catalog, migration 002/discovery và persistence aliases.
- RED OpenAPI: focused OpenAPI validation — FAIL 3/3 do OpenAPI 3.0 nullable schema không compile và không enforce exact tuples/meal types.
- RED migration/data integrity: các focused tests xác nhận legacy media invalid, DDL/ledger không atomic, duplicate/stale plan, partial rollback và temp/env leaks.
- RED concurrency: 5 confirm song song ban đầu trả `[500, 500, 200, 500, 500]`; mixed singleton transaction test chứng minh read thấy uncommitted row và unrelated write bị rollback.
- RED physical contracts: manifest thiếu `history_list` và `report_detail`; OpenAPI history paths/refs chưa tồn tại.
- `npm test -- --runInBand tests/database.test.ts tests/analysisPersistence.test.ts tests/foodImageCatalog.test.ts tests/exerciseCatalog.test.ts tests/contract.test.ts` — PASS 75/75.
- `npm test` — PASS 90/90, 8/8 suites.
- `npm run test:contract` — PASS 14/14; 10 physical schema/example pairs validate; history physical contracts stay synchronized with OpenAPI.
- `npm run build` từ `backend/` — PASS, TypeScript exit 0.
- `npm run build` từ `frontend/` — PASS, TypeScript + Vite production build exit 0.
- `npm audit` từ `backend/` — PASS, 0 vulnerabilities.
- OpenAPI 3.1 JSON parse và Ajv behavioral validation — PASS qua contract/catalog suites.
- `git diff --check` — PASS; chỉ có warning LF/CRLF dự kiến trên Windows.
- Spec review — PASS sau khi OpenAPI exact tuples/history refs được đồng bộ.
- Code-quality review — PASS sau các vòng legacy migration, transaction atomicity/idempotency, physical history contracts, dedicated-connection isolation và `:memory:` fail-fast.

### Test and build results
- Verified food/catalog/provider tests: PASS.
- Migration discovery, upgrade, rollback, retry, legacy-valid selection, and cleanup tests: PASS.
- Controller round-trip, repeated-confirm, full rollback, 5-request concurrency, and mixed-connection isolation tests: PASS.
- Contract/OpenAPI tests: 14 passed, 0 failed.
- Full backend: 90 passed, 0 failed.
- Backend build/typecheck: PASS.
- Frontend production build/typecheck: PASS.
- Audit: 0 vulnerabilities.

### Data migration policy
- Migration 002 clears pre-002 external image/YouTube URLs that lack complete trusted provenance instead of inventing metadata.
- For duplicate legacy plans, migration keeps the newest plan that satisfies the new core contract and deletes invalid/duplicate plans; invalid-only history returns `null` rather than structurally invalid data.
- Partial unique indexes enforce at most one meal plan and one exercise plan per report.
- File-backed SQLite is required for dedicated transaction connections; `DATABASE_PATH=:memory:` now fails fast with a clear configuration error.

### Current errors and remaining work
- Không còn lỗi trong phạm vi catalog, migration, persistence, history contracts, OpenAPI hoặc frontend media types.
- Chưa có command external verifier và chưa xác minh live toàn bộ Wikimedia source/direct-image responses; đây là Task 4.
- Frontend chưa render ảnh, attribution, fallback hoặc verified video metadata; đây là Task 5.
- Real Gemini OCR/AI vẫn cần `GEMINI_API_KEY`; credential/kết quả production không bị giả lập.
- Native Computer Use vẫn PARTIAL do runtime context error đã ghi ở Capability Discovery.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên.
- Task 1–3 vẫn chưa stage/commit/push; sẽ commit một lần sau khi P1 media hoàn tất full verification và browser QA.

### External tools actually used
- Git: kiểm tra branch, SHA, working tree và diff.
- npm: chạy deterministic backend toolchain, tests, builds và audit.
- SQLite/sqlite3: migration upgrade/rollback, transaction, concurrency, history persistence và cleanup trên database tạm.
- Ajv/JSON Schema/OpenAPI 3.1: validate exact catalog tuples, nullable states, manifest refs và history contracts.
- Subagent spec/code-quality review: nhiều vòng độc lập, re-review đến khi không còn finding.

### Available tools not used and reasons
- Wikimedia/YouTube live network verification: cố ý chưa dùng trong Task 3 để giữ Jest offline; sẽ chạy qua explicit Task 4 command.
- GitHub write/push/Actions: chưa dùng vì P1 media chưa hoàn tất UI/browser QA; sẽ dùng sau final checkpoint.
- Browser / Chrome: chưa dùng trong Task 3 vì UI media chưa được triển khai; sẽ dùng ở Task 5/6 cho desktop/mobile/history/fallback/source links.
- Computer Use: không cần cho migration/backend persistence; capability vẫn PARTIAL như đã kiểm tra thực tế.
- Figma / Figma Make: không dùng vì không có thiết kế cần tạo/sửa và không có target Figma file.
- Google AI Studio: không dùng vì không cần tạo credential hoặc gửi dữ liệu để hoàn thành persistence deterministic.
- Developer Tools/CDP: chưa dùng vì chưa đến UI/browser QA.
- GitHub CLI: không dùng vì chưa được cài; Git/Browser/REST sẽ thay thế ở bước push/Actions.

## Checkpoint - External Verified Media Command (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 4 của kế hoạch P1 Verified Media.
- Spec review và code-quality re-review cuối đều APPROVED; không còn finding Critical, Important hoặc Minor.
- Checkpoint hoàn tất và workflow tự động chuyển sang Task 5: render verified media trên frontend và thêm frontend tests vào CI.

### Files created
- `backend/scripts/verify-media-catalog.ts`
- `backend/tests/verifyMediaCatalog.test.ts`

### Files modified
- `PROJECT_STATUS.md`
- `backend/package.json`
- `docs/superpowers/plans/2026-08-09-p1-verified-media.md`

### Files deleted
- Không có file nào bị xóa trong Task 4.
- `backend/package-lock.json` không cần tái tạo ở Task 4 vì chỉ thêm npm script, không thay đổi dependency graph.

### Commands and checks executed
- TDD RED ban đầu: `npm test -- --runInBand tests/verifyMediaCatalog.test.ts` — FAIL đúng nguyên nhân vì `backend/scripts/verify-media-catalog.ts` chưa tồn tại.
- Regression RED metadata: targeted Jest với pattern `missing (license|author) metadata` — FAIL 2/2 đúng vì verifier cũ vẫn chấp nhận Wikimedia record thiếu `LicenseShortName` hoặc `Artist`.
- Regression RED lifecycle/retry: targeted Jest với các pattern `cancels`, `ranged image`, `broken ranged`, `body-read` — FAIL 7/7 đúng vì response body chưa được đóng, ranged GET chưa đọc byte và body-read error chưa retry.
- Regression RED error context: targeted Jest với pattern `preserving its cause chain` — FAIL đúng vì lỗi cuối thiếu media key dù còn root cause.
- `npm test -- --runInBand tests/verifyMediaCatalog.test.ts` — PASS 23/23.
- `npm test -- --runInBand` — PASS 113/113, 9/9 suites.
- `npm run build` từ `backend/` — PASS, TypeScript exit 0.
- Standalone strict TypeScript check cho verifier và test — PASS.
- `npm run verify:media` — PASS 3 YouTube oEmbed + 6 Wikimedia API/direct-image records = 9/9.
- `npm ls jest ts-jest @types/jest jest-util typescript --all` — PASS; Jest 29.7.0, ts-jest 29.4.12, @types/jest 29.5.14, TypeScript 5.9.3 và jest-util 29.7.0 chỉ là dependency bắc cầu.
- `git diff --check` — PASS; chỉ có warning LF/CRLF dự kiến trên Windows, không có whitespace error.
- Spec review — APPROVED, không có finding.
- Code-quality review vòng đầu — CHANGES REQUESTED cho metadata bắt buộc, response-body lifecycle, body-read retry/timeout và error context.
- Code-quality re-review sau TDD fixes — APPROVED, không còn finding Critical/Important/Minor.

### Test and build results
- Offline verifier Jest tests: 23 passed, 0 failed; không gọi network.
- Full backend: 113 passed, 0 failed; 9 suites passed.
- Backend build/typecheck: PASS.
- Live YouTube verification: 3/3 PASS với exact title và author.
- Live Wikimedia verification: 6/6 PASS với API metadata, canonical direct URL, license, author, HTTP success và MIME `image/*`.
- Retry có giới hạn tối đa 3 attempt, timeout 15 giây mới cho mỗi attempt, request tuần tự và User-Agent mô tả rõ.
- Response body của transient/final error và HEAD fallback được đóng; ranged GET đọc ít nhất một byte rồi đóng phần body còn lại.

### Current errors and remaining work
- Không còn lỗi trong phạm vi external media verifier.
- Frontend chưa render ảnh verified, attribution/fallback hoặc verified video title/author/link; đây là Task 5 đang tiếp tục.
- CI chưa chạy frontend tests; Task 5 sẽ thêm deterministic Vitest step, không thêm live network verifier vào GitHub Actions.
- Real Gemini OCR/AI vẫn cần `GEMINI_API_KEY`; credential và kết quả production không bị giả lập.
- Native Computer Use vẫn PARTIAL do runtime context error đã ghi ở Capability Discovery.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên.
- Thay đổi Task 1–4 vẫn chưa stage/commit/push; sẽ commit sau khi hoàn tất frontend, browser QA và full P1 verification.

### External tools actually used
- Git: kiểm tra SHA, tracking ref, working tree và diff.
- npm/Jest/ts-jest/TypeScript: targeted TDD, full backend suite, build/typecheck và dependency graph verification.
- YouTube oEmbed: live verify title/author của ba video catalog.
- Wikimedia Commons API và direct image hosts: live verify sáu source records, metadata, URL, status và MIME.
- Subagents: implementer TDD, spec reviewer và code-quality reviewer; re-review đến khi sạch finding.

### Available tools not used and reasons
- GitHub write/push/Actions: chưa dùng vì P1 media chưa hoàn tất frontend/browser QA; sẽ dùng sau final checkpoint và commit.
- Browser / Chrome: chưa dùng trong Task 4 vì đây là command/backend phase; sẽ dùng ở Task 5/6 để kiểm tra desktop, mobile, history reload, fallback, console và overflow.
- Computer Use: không cần cho verifier CLI; capability vẫn PARTIAL như evidence ở Capability Discovery.
- Figma / Figma Make: không dùng vì không có thiết kế hoặc target Figma file cần tạo/sửa.
- Google AI Studio: không dùng vì verifier chỉ kiểm tra curated public media và không cần AI credential/project.
- Developer Tools/CDP: chưa dùng vì chưa đến browser-rendering QA.
- GitHub CLI: không dùng vì chưa được cài; Git, Browser và GitHub REST sẽ được dùng cho push/Actions.
- GitHub Actions live media step: cố ý không thêm vì external network verification không deterministic; CI chỉ giữ offline tests/build.

## Checkpoint - Frontend Verified Media and Deterministic CI Tests (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 5 của kế hoạch P1 Verified Media.
- Spec review và code-quality re-review cuối đều APPROVED; không còn finding Critical, Important hoặc Minor.
- Checkpoint hoàn tất và workflow tự động chuyển sang Task 6: tài liệu, browser QA desktop/mobile/history/fallback, full verification, commit và push.

### Files created
- `frontend/src/components/VerifiedMedia.tsx`
- `frontend/src/components/VerifiedMedia.test.tsx`
- `frontend/src/test/setup.ts`
- `frontend/vitest.config.ts`

### Files modified
- `.github/workflows/ci.yml`
- `PROJECT_STATUS.md`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/pages/AnalysisPage.tsx`
- `docs/superpowers/plans/2026-08-09-p1-verified-media.md`

### Files deleted
- Không có file dự án nào bị xóa.
- Vite dev server PID 25348 của đúng workspace frontend đã được dừng có kiểm tra để giải phóng native `lightningcss` binary cho deterministic `npm ci`; server sẽ được khởi động lại ở browser QA.

### Commands and checks executed
- Exact dependency install/update: `npm install --save-dev --save-exact vitest@4.1.10 jsdom@29.0.0 @testing-library/react@16.3.2 @testing-library/dom@10.4.1 @testing-library/jest-dom@7.0.0`.
- TDD RED ban đầu: `npm test -- --run` — FAIL đúng nguyên nhân `Failed to resolve import "./VerifiedMedia"` vì component chưa tồn tại.
- `npm ci` lần đầu — FAIL `EPERM` khi unlink `lightningcss.win32-x64-msvc.node`; process audit xác định Vite PID 25348 đang dùng native module từ đúng workspace.
- Exact process verification và `Stop-Process` cho PID 25348 — PASS; không dùng wildcard và không dừng tiến trình ngoài dự án.
- `npm ci` retry — PASS; cài 222 packages, audit 223 packages, 0 vulnerabilities.
- Một vòng independent verification bị `Failed to start forks worker`, sau đó `vitest` biến mất vì spec reviewer đồng thời chạy `npm ci` trên shared `node_modules`; process audit xác nhận race, reviewer dừng install, và single-writer retry sau đó PASS. Đây không phải lỗi dependency/toolchain của dự án.
- Frontend GREEN ban đầu: `npm test -- --run` — PASS 5/5, 1/1 file.
- Quality regression RED: `npm test -- --run src/components/VerifiedMedia.test.tsx` — FAIL 6/14 đúng vì fallback ảnh giữ URL cũ và năm dạng partial YouTube provenance vẫn render.
- Quality regression GREEN: cùng targeted command — PASS 14/14.
- Fresh full frontend: `npm test -- --run` — PASS 14/14, 1/1 file.
- `npm run build` — PASS; TypeScript và Vite production build, 1.670 modules transformed.
- `npm ls vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom --depth=0` — PASS với exact versions 4.1.10, 29.0.0, 16.3.2, 10.4.1 và 7.0.0.
- Workflow parse bằng system Python `yaml.safe_load` — FAIL vì môi trường không cài `PyYAML`.
- Workflow parse bằng bundled Python — FAIL cùng nguyên nhân thiếu YAML parser.
- `npx --yes prettier@3.6.2 '.github/workflows/ci.yml' --parser yaml` — PASS, YAML hợp lệ.
- Manual workflow ordering review — PASS: frontend `npm ci` → `npm test -- --run` → `npm run build`, cùng `working-directory: frontend`.
- `git diff --check` — PASS; chỉ có warning LF/CRLF dự kiến trên Windows.
- Spec review — APPROVED, không có finding.
- Code-quality review vòng đầu — CHANGES REQUESTED cho stale image-error state và incomplete runtime YouTube provenance guard.
- Code-quality re-review sau TDD fixes — APPROVED, không còn finding Critical/Important/Minor.

### Test and build results
- Frontend unit/component tests: 14 passed, 0 failed.
- Meal media: lazy image, meaningful alt, attribution/source/license, external-link safety, incomplete tuple guard, error fallback và URL-change recovery đều PASS.
- Exercise media: verified title/author/link, external-link safety, false flag guard và full runtime provenance tuple guard đều PASS.
- Frontend production build/typecheck: PASS.
- Frontend clean install/audit: PASS, 0 vulnerabilities.
- CI workflow syntax/order: PASS; live network media verifier không được thêm vào CI.

### Current errors and remaining work
- Không còn lỗi trong phạm vi frontend verified-media component, tests, build hoặc CI step.
- Browser QA thật cho desktop 1280x900, mobile 390x844, history reload, live image/fallback/source links, console và horizontal overflow chưa chạy; đây là Task 6 đang tiếp tục.
- GitHub Actions chưa chạy cho thay đổi chưa commit; sẽ theo dõi run mới đến `completed / success` sau push.
- Real Gemini OCR/AI vẫn cần `GEMINI_API_KEY`; credential và kết quả production không bị giả lập.
- Native Computer Use vẫn PARTIAL do runtime context error đã ghi ở Capability Discovery.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên.
- Thay đổi Task 1–5 vẫn chưa stage/commit/push; sẽ commit sau Task 6 và full clean verification.

### External tools actually used
- npm/npm registry: exact test dependencies, lockfile update, deterministic `npm ci` và audit.
- Vitest/jsdom/Testing Library/jest-dom: offline React component tests và regression tests.
- TypeScript/Vite: frontend typecheck và production build.
- Git: inspect working tree, SHA và diff check.
- PowerShell process inspection/control: xác minh và dừng đúng Vite PID giữ native binary.
- Prettier qua `npx`: parse workflow YAML sau khi hai Python runtime không có YAML parser.
- Subagents: TDD implementer, spec reviewer và code-quality reviewer; re-review đến khi sạch finding.

### Available tools not used and reasons
- Browser / Chrome: cố ý chưa dùng trong Task 5 implementation gate; sẽ dùng ngay ở Task 6 cho rendered QA desktop/mobile/history/fallback.
- Computer Use: không cần cho component unit tests/build; capability vẫn PARTIAL như đã kiểm tra thực tế.
- GitHub write/push/Actions: chưa dùng vì browser QA và final full verification chưa hoàn tất.
- Figma / Figma Make: không dùng vì giữ visual language hiện có và không có target Figma file.
- Google AI Studio: không dùng vì frontend media rendering không cần AI project/key hoặc gửi dữ liệu ngoài.
- Developer Tools/CDP: chưa dùng trong Task 5; Browser QA Task 6 sẽ kiểm tra console/DOM/layout.
- YouTube/Wikimedia live verifier: không chạy lại trong Task 5 vì đã PASS ở Task 4 và frontend Jest phải offline; sẽ chạy lại trong final full verification.
- GitHub CLI: không dùng vì chưa được cài; Git, Browser và GitHub REST sẽ dùng ở bước push/Actions.

## Checkpoint - Deterministic Lab Analysis Safety Boundary (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 1 của kế hoạch Safe Lab Analysis and History.
- Public lab analysis hiện luôn deterministic; `GeminiAIProvider.analyzeLabResults` và `RuleBasedAIProvider.analyzeLabResults` cùng gọi một analyzer dùng chung và đường Gemini lab không gọi model/text boundary.
- Spec review và code-quality re-review cuối đều APPROVED; không còn finding Critical, Important hoặc Minor.
- Checkpoint hoàn tất và workflow tự động chuyển sang Task 2: migration 003, persistence narrative, legacy fallback và đồng bộ ReportDetail contracts/types.

### Files created
- `backend/src/services/ai/labAnalysis.ts`
- `backend/tests/geminiProvider.test.ts`
- `backend/tests/fixtures/labAnalysisGolden.ts`

### Files modified
- `PROJECT_STATUS.md`
- `backend/src/services/ai/ruleBasedProvider.ts`
- `backend/src/services/ai/geminiProvider.ts`
- `backend/tests/aiProvider.test.ts`
- `backend/tests/contract.test.ts`
- `contracts/manifest.json`
- `docs/superpowers/plans/2026-08-09-safe-lab-analysis-history.md`

### Files deleted
- `contracts/json/gemini_lab_analysis_draft.schema.json`
- `contracts/examples/gemini_lab_analysis_draft.example.json`
- Hai file draft trên là artifact chưa commit của giai đoạn trước; chúng đã bị xóa khỏi filesystem và không còn trong manifest, vì structured Gemini lab output không còn tồn tại.

### Commands and checks executed
- RED ban đầu: `npm test -- --runTestsByPath tests/geminiProvider.test.ts tests/aiProvider.test.ts tests/contract.test.ts` từ `backend/` — FAIL đúng nguyên nhân, 1 test failed và 24 passed vì Gemini lab vẫn gọi private `text` boundary.
- GREEN ban đầu: cùng targeted command — PASS 24/24.
- Contract regression mutation RED: tạm đăng ký lại chỉ manifest ID `gemini_lab_analysis_draft`, chạy focused contract test — FAIL đúng assertion `Expected: false, Received: true`; entry tạm sau đó được xóa.
- Golden-oracle mutation RED: tạm đổi exact-bound comparison từ `<` thành `<=`, chạy focused golden test — FAIL đúng vì boundary result đổi `NORMAL` thành `LOW`, explanation thay đổi và abnormal summary count đổi từ 3 thành 4; mutation sau đó được revert.
- Final targeted: `npm test -- --runTestsByPath tests/geminiProvider.test.ts tests/aiProvider.test.ts tests/contract.test.ts` — PASS 26/26, 3/3 suites.
- Full backend: `npm test` — PASS 126/126, 10/10 suites.
- Backend build/typecheck: `npm run build` — PASS, TypeScript exit 0.
- `git diff --check` — PASS; chỉ có warning LF/CRLF dự kiến trên Windows, không có whitespace error.
- Obsolete-reference/filesystem checks — PASS: manifest ID absent, schema absent, example absent; chỉ còn nhắc đến tên contract trong tài liệu kế hoạch/thiết kế và regression test phủ định.
- Spec compliance review — APPROVED sau khi bổ sung explicit obsolete-contract regression assertion.
- Code-quality review — APPROVED sau khi thay oracle vòng tròn bằng exact golden literal cho analyzer và cả hai provider.

### Test and build results
- Shared deterministic analyzer: PASS cho `NORMAL`, `LOW`, `HIGH`, `UNKNOWN`, duplicate `testCode`, one-sided bounds, exact lower/upper boundaries, exact fields/order, explanation và overall summary.
- Gemini lab safety boundary: PASS; exact output bằng golden contract và private `text` spy có zero calls.
- Contract cleanup: PASS; obsolete Gemini lab draft không còn đăng ký và không còn physical schema/example.
- Backend full regression: 126 passed, 0 failed.
- Backend production build/typecheck: PASS.

### Current errors and remaining work
- Không còn lỗi trong phạm vi deterministic lab analyzer hoặc obsolete Gemini lab draft cleanup.
- Task 2 chưa hoàn tất: cần migration `003_analysis_narrative.sql`, persist `analysis_summary`/`explanation`, legacy deterministic fallback và đồng bộ ReportDetail schema/example/OpenAPI/frontend types.
- Task 3 chưa hoàn tất: frontend direct-load/history phải render narrative đã persist, sau đó full clean verification, final review, commit, push và theo dõi GitHub Actions đến xanh.
- Real Gemini OCR/meal/exercise/chat vẫn cần `GEMINI_API_KEY`; lab analysis không còn phụ thuộc Gemini credential hoặc model output.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên tại checkpoint này.
- Task 1 và các thay đổi hợp lệ trước đó vẫn chưa stage/commit/push; không force-push và sẽ chỉ commit sau full verification/final review.
- Không tạo worktree mới giữa phiên vì đây là continuation của working tree đang có nhiều thay đổi hợp lệ chưa commit và người dùng đã yêu cầu tiếp tục, commit rồi push fix; chuyển workspace giữa chừng có nguy cơ tách hoặc làm mất context thay đổi.

### External tools actually used
- Git: kiểm tra branch, SHA, tracking ref, working tree, diff và whitespace hygiene.
- PowerShell: đọc file, kiểm tra manifest/filesystem và điều phối command trong đúng workspace.
- npm/Jest/ts-jest/TypeScript: TDD RED/GREEN, targeted/full backend regression và production build/typecheck.
- Subagents: implementer TDD, spec reviewer và code-quality reviewer; mọi finding hợp lệ đều được sửa và re-review đến APPROVED.

### Available tools not used and reasons
- GitHub write/push/Actions: chưa dùng trong checkpoint này vì Task 2/3 và final verification chưa hoàn tất; sẽ push và theo dõi run mới ở giai đoạn cuối.
- Browser / Chrome: không cần cho backend-only deterministic analyzer; browser/history evidence của giai đoạn trước vẫn giữ nguyên và direct-load narrative sẽ được kiểm tra lại ở Task 3.
- Computer Use: không cần cho thay đổi backend này; capability đã được kiểm tra thực tế và vẫn PARTIAL như mục Capability Status.
- Figma / Figma Make: không dùng vì không có thay đổi thiết kế hoặc target Figma file.
- Google AI Studio: không dùng vì quyết định an toàn là loại model khỏi public lab narrative, không cần tạo prompt/project/key mới.
- Developer Tools/CDP: không dùng vì giai đoạn này không thay đổi rendered UI; sẽ dùng Browser tooling ở frontend QA nếu cần.
- Gemini API/network: không gọi vì lab analysis bắt buộc deterministic và test phải offline; meal/exercise/chat không nằm trong execution path của checkpoint này.

## Checkpoint - Persisted Analysis Narrative and Snapshot-Safe History (2026-08-09)

### Trạng thái giai đoạn
- HOÀN TẤT Task 2 của kế hoạch Safe Lab Analysis and History.
- Migration 003, transactional narrative persistence, deterministic legacy fallback, snapshot-consistent report detail và ReportDetail contracts/types đã hoàn tất.
- Spec review và code-quality re-review cuối đều APPROVED; mọi finding Critical, Important và Minor đã được đóng.
- Checkpoint hoàn tất và workflow tự động chuyển sang Task 3: frontend direct-load/history narrative rendering, feature docs và full verification.

### Files created
- `backend/src/database/migrations/003_analysis_narrative.sql`

### Files modified
- `PROJECT_STATUS.md`
- `backend/src/controllers/analysisController.ts`
- `backend/src/database/index.ts`
- `backend/src/services/ai/labAnalysis.ts`
- `backend/tests/aiProvider.test.ts`
- `backend/tests/analysisPersistence.test.ts`
- `backend/tests/contract.test.ts`
- `backend/tests/database.test.ts`
- `backend/tests/fixtures/labAnalysisGolden.ts`
- `contracts/json/report_detail.schema.json`
- `contracts/examples/report_detail.example.json`
- `contracts/openapi.json`
- `frontend/src/types/index.ts`
- `docs/superpowers/plans/2026-08-09-safe-lab-analysis-history.md`

### Files deleted
- Không có file nào bị xóa trong Task 2.

### Commands and checks executed
- Initial RED: `npm test -- --runInBand tests/database.test.ts tests/analysisPersistence.test.ts tests/contract.test.ts` — FAIL 9 tests, PASS 39/48; đúng do thiếu migration/columns, persistence/alignment/rollback và ReportDetail narrative contracts.
- Initial GREEN sau migration/persistence/contracts — PASS 48/48.
- Quality RED vòng 1 (`aiProvider`, `analysisPersistence`, `contract`) — FAIL 7, PASS 39/46; bắt one-sided status mismatch, stale legacy status, reportId/status misalignment, empty-result wording và whitespace-only contracts.
- Same-report concurrency characterization ban đầu PASS; mutation tạm giữ summary của commit B làm test fail đúng A-vs-B, sau đó mutation được revert.
- Quality GREEN vòng 1 — PASS 46/46; Task 2 targeted PASS 54/54; full backend PASS 141/141.
- Quality RED vòng 2 (`aiProvider`, `analysisPersistence`, `database`) — FAIL 7, PASS 42/49; bắt mixed multi-statement history snapshot, read transaction lifecycle và UNKNOWN bị tính nhầm là ngoài khoảng.
- Quality GREEN vòng 2 — PASS 49/49; Task 2 targeted PASS 58/58; provider suites PASS 11/11; full backend PASS 147/147.
- Cleanup RED — 2 focused tests FAIL đúng vì dedicated `close()` rejection override handler; GREEN 2/2 sau guard cleanup.
- Final Task 2 targeted: `npm test -- --runInBand tests/database.test.ts tests/analysisPersistence.test.ts tests/contract.test.ts` — PASS 60/60, 3/3 suites.
- Final full backend: `npm test` — PASS 149/149, 10/10 suites.
- Backend build/typecheck: `npm run build` — PASS, TypeScript exit 0.
- Frontend production build/typecheck: `npm run build` — PASS, 1,670 modules transformed.
- `git diff --check` — PASS; chỉ warning LF/CRLF dự kiến trên Windows, không có whitespace error.
- Spec compliance review — APPROVED, không có finding.
- Code-quality review cuối — APPROVED sau các vòng one-sided/status, empty safety, whitespace contract, same-report last-commit-wins, read snapshot, UNKNOWN wording và cleanup hardening; không còn Critical/Important/Minor.

### Test and build results
- Migration 003: ledger exactly-once, nullable columns, non-destructive upgrade và retry/idempotency PASS.
- Transactional persistence: exact summary/explanations, occurrence alignment, reportId/status validation, rollback và same-report last-commit-wins full-bundle PASS.
- One-sided bounds: persisted/detail statuses `LOW`, `HIGH`, `NORMAL` đồng nhất với deterministic explanations; legacy stale status được sửa khi đọc nhưng không write-back.
- Legacy fallback: null/blank narrative sinh text deterministic non-empty, không xóa hoặc mutate lịch sử.
- Empty/UNKNOWN medical safety: zero results dùng summary trung tính; UNKNOWN không bị gọi là bình thường hoặc ngoài khoảng; mixed LOW/HIGH + UNKNOWN chia nhóm rõ ràng.
- Read consistency: deferred dedicated read transaction trả một WAL snapshot hoàn chỉnh khi writer commit đồng thời; request mới thấy commit mới.
- ReportDetail physical schema/example/OpenAPI/frontend types: synchronized, strict và reject empty/whitespace narrative.
- Backend full regression: 149 passed, 0 failed; backend/frontend production builds PASS.

### Current errors and remaining work
- Không còn lỗi trong phạm vi migration 003, narrative persistence, report-detail snapshot/history contracts hoặc deterministic legacy fallback.
- Task 3 chưa hoàn tất: Analysis page direct-load/history vẫn cần map `detail.overallSummary` và per-result `detail.results[].explanation`, thêm frontend regression test và cập nhật feature/test docs.
- Final clean install, dependency graph, audits, media verifier, frontend full tests, workflow parse, artifact/secret scan, final full-diff review, commit/push và GitHub Actions run mới vẫn còn ở giai đoạn cuối.
- Real Gemini OCR/meal/exercise/chat vẫn cần `GEMINI_API_KEY`; public lab narrative không gọi model.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên tại checkpoint này.
- Toàn bộ thay đổi vẫn chưa stage/commit/push; không force-push và chưa có secret/.env/database/log artifact được đưa vào Git.

### External tools actually used
- Git: kiểm tra SHA, tracking ref, working tree, diff và whitespace hygiene.
- PowerShell: đọc source/tests/contracts, kiểm tra SQL/filesystem và chạy command trong đúng working directory.
- SQLite/sqlite3: migration ledger, non-destructive upgrade, transaction rollback, WAL read snapshot và controlled same-report concurrency tests.
- npm/Jest/ts-jest/TypeScript/Vite: TDD RED/GREEN, targeted/full regressions và backend/frontend production builds.
- Ajv/JSON Schema/OpenAPI: validate required/nonblank ReportDetail narrative và physical/OpenAPI synchronization.
- Subagents: TDD implementer, spec reviewer và code-quality reviewer; review/fix/re-review lặp đến khi không còn finding.

### Available tools not used and reasons
- GitHub write/push/Actions: chưa dùng vì Task 3 và final clean verification chưa hoàn tất; sẽ dùng sau final checkpoint.
- Browser / Chrome: chưa cần cho database/contracts stage; sẽ dùng lại ở Task 3 để kiểm tra direct-load/history narrative trên desktop/mobile nếu rendered behavior thay đổi.
- Computer Use: không cần cho migration/transaction tests; capability đã kiểm tra và vẫn PARTIAL như mục Capability Status.
- Figma / Figma Make: không dùng vì Task 2 không thay đổi visual design và không có target Figma file.
- Google AI Studio/Gemini live API: không dùng vì narrative deterministic, tests offline và không cần credential/user data transmission.
- Developer Tools/CDP: không dùng trong backend persistence stage; sẽ dùng Browser QA cho rendered UI/console/layout ở Task 3 khi cần.
- YouTube/Wikimedia live verifier: không chạy lại trong Task 2 vì media catalogs không đổi; sẽ chạy trong final verification.

## Checkpoint - Frontend Direct-Load Persisted Narrative and Browser QA (2026-08-09/10)

### Trạng thái giai đoạn
- HOÀN TẤT Task 3 của kế hoạch Safe Lab Analysis and History.
- AnalysisPage direct-load/history giờ map `detail.overallSummary` và từng `detail.results[].explanation` từ report-detail API; không còn placeholder rỗng.
- Browser QA thực tế desktop/mobile PASS; không lỗi console và không overflow ngang.
- Checkpoint hoàn tất và workflow chuyển sang giai đoạn cuối: full clean verification, final full-diff review, commit, push và theo dõi GitHub Actions.

### Files created
- `frontend/src/pages/AnalysisPage.test.tsx`

### Files modified
- `PROJECT_STATUS.md`
- `frontend/src/pages/AnalysisPage.tsx`
- `docs/features/lab_analysis.md`
- `docs/features/history.md`
- `docs/TEST_PLAN.md`
- `docs/superpowers/plans/2026-08-09-safe-lab-analysis-history.md`

### Files deleted
- Không có file nào bị xóa trong Task 3.

### Commands and checks executed
- TDD RED: `npm test -- --run src/pages/AnalysisPage.test.tsx` từ `frontend/` — FAIL đúng vì direct-load mapping vẫn ghi `overallSummary: ''` và `explanation: ''`.
- GREEN: cùng command — PASS 1/1.
- Full frontend: `npm test -- --run` — PASS 15/15, 2/2 files.
- Frontend production build/typecheck: `npm run build` — PASS, 1,670 modules transformed.
- Full backend gần nhất: `npm test` — PASS 149/149, 10/10 suites; full clean rerun ở giai đoạn cuối.
- Backend build/typecheck: PASS.
- Browser QA desktop (in-app Browser, viewport mặc định ~1280x900): register QA user trên database tạm, tạo sample OCR, confirm analysis, kiểm tra summary/explanations sau confirm, direct reload và history click — PASS; screenshot lưu ngoài repo.
- Browser QA mobile (viewport 390x844): direct reload giữ narrative; `scrollWidth=375 <= innerWidth=390` nên không overflow ngang — PASS; screenshot lưu ngoài repo.
- Console: `tab.dev.logs({levels:['error','warn']})` — 0 entries trong suốt luồng.
- API persisted narrative: GET `/api/analysis/history/:reportId` trả `overallSummary` (204 chars) và 5 explanations non-empty đúng order — PASS.
- Meal/Exercise tabs sau direct load: 5 verified meal figures + 2 verified YouTube links render đầy đủ — PASS.
- `git diff --check` — PASS; chỉ warning LF/CRLF dự kiến, không whitespace error.
- Spec compliance review — APPROVED, không có finding.
- Code-quality review — APPROVED, không còn Critical/Important/Minor.

### Test and build results
- Frontend direct-load regression: PASS.
- Frontend full suite: 15 passed, 0 failed.
- Frontend production build/typecheck: PASS.
- Browser desktop/mobile/history/direct-load/console/overflow QA: PASS.
- Backend full suite gần nhất: 149 passed, 0 failed.

### Current errors and remaining work
- Không còn lỗi trong phạm vi Task 1–3 (deterministic analyzer, narrative persistence/snapshot, frontend direct-load/history).
- Giai đoạn cuối chưa hoàn tất: `npm ci` clean cả hai app, full backend/frontend tests+build+audit, dependency graph, contract tests, live media verifier, workflow YAML parse, secret/artifact scan, final full-diff review, commit, push non-force và theo dõi GitHub Actions mới đến `completed / success`.
- Real Gemini OCR/meal/exercise/chat vẫn cần `GEMINI_API_KEY`; public lab narrative không gọi model.

### Git state
- Current commit: `e54404ad6f6e85469a470d50ed84653374200c2c`.
- Local `master` và local tracking ref `origin/master` cùng ở commit trên tại checkpoint này.
- Toàn bộ thay đổi vẫn chưa stage/commit/push; không force-push và không commit secret/.env/database/log/upload/screenshot.

### External tools actually used
- Git: SHA, tracking ref, working tree, diff hygiene.
- PowerShell/Node REPL: khởi động và dừng QA server bằng database QA tạm ngoài repo; không dùng process/user data.
- In-app Browser (Browser plugin): navigation, DOM snapshot, interaction, viewport 390x844, screenshots và console logs.
- npm/Jest/Vitest/TypeScript/Vite: frontend targeted/full tests và production build.
- Backend API + SQLite QA database tạm: xác nhận narrative persisted và trả đúng order.
- Subagents: TDD implementer, spec reviewer và code-quality reviewer cho toàn bộ plan.

### Available tools not used and reasons
- Chrome extension/Computer Use: không cần vì in-app Browser đã đủ cho localhost QA; Computer Use vẫn PARTIAL như Capability Status.
- Figma / Figma Make: không dùng vì Task 3 không thay đổi visual design và không có target Figma file.
- Google AI Studio/Gemini live API: không dùng vì narrative deterministic và không cần credential.
- GitHub write/push/Actions: chưa dùng vì chưa qua full clean verification và final review; sẽ dùng ngay sau checkpoint này.
- YouTube/Wikimedia live verifier: chưa chạy lại trong Task 3 vì media catalogs không đổi; sẽ chạy trong final verification.

## Checkpoint - Final Clean Verification and Release Readiness (2026-08-10)

### Trạng thái giai đoạn
- HOÀN TẤT full clean verification cho Task 1–3 và toàn bộ thay đổi trước đó (P1 verified media, toolchain, CI).
- Chuẩn bị commit toàn bộ và push non-force; theo dõi GitHub Actions mới đến `completed / success`.

### Files created
- Không có file mới trong giai đoạn final verification ngoài các file đã ghi ở checkpoint trước.

### Files modified
- `PROJECT_STATUS.md`
- `docs/superpowers/plans/2026-08-09-safe-lab-analysis-history.md` (đánh dấu hoàn tất)

### Files deleted
- Không có file nào bị xóa trong giai đoạn này.

### Commands and checks executed
- `npm ci` backend — PASS, 475 packages, 0 vulnerabilities.
- `npm ci` frontend — PASS, 222 packages, 0 vulnerabilities.
- `npm test` backend (chạy tuần tự, không song song) — PASS 149/149, 10/10 suites.
- `npm run test:contract` backend — PASS 19/19.
- `npm run build` backend — PASS, TypeScript exit 0.
- `npm audit --audit-level=low` backend/frontend — PASS, 0 vulnerabilities cả hai.
- `npm ls jest ts-jest @types/jest jest-util typescript --all` backend — PASS; jest 29.7.0, ts-jest 29.4.12, @types/jest 29.5.14, typescript 5.9.3; jest-util 29.7.0 chỉ là transitive (không phải direct dependency).
- `npm test -- --run` frontend (chạy tuần tự) — PASS 15/15, 2/2 files.
- `npm run build` frontend — PASS, 1,670 modules transformed.
- `npm run verify:media` backend — PASS 3 YouTube + 6 Wikimedia = 9/9.
- Workflow YAML parse bằng Prettier — PASS; đúng `working-directory: backend/frontend` + `npm ci`; không `|| true`, không `continue-on-error`, không skip test.
- `git diff --check` — PASS; chỉ warning LF/CRLF dự kiến.
- Secret scan (API key/private key/token patterns) — không phát hiện secret thật; các trận khớp đều là config placeholder, tên hàm/tham số hoặc test env rỗng.
- Artifact scan — không có database/log/upload/screenshot QA trong staged changes.
- Backend jest.config.js dùng `JestConfigWithTsJest` (ts-jest 29 hiện đại), không còn legacy `globals/ts-jest`.

### Test and build results
- Backend: 149/149 PASS; contract 19/19 PASS; build PASS; audit 0 vulnerabilities.
- Frontend: 15/15 PASS; build PASS; audit 0 vulnerabilities.
- Media verifier: 9/9 PASS (network live).
- Dependency graph: đồng bộ đúng bộ toolchain Jest/TypeScript.
- CI workflow syntax và order: PASS.

### Current errors and remaining work
- Không còn lỗi trong scope của changeset.
- Còn lại: commit, push non-force, theo dõi GitHub Actions run mới đến `completed / success`; nếu fail sẽ tiếp tục sửa theo yêu cầu.
- Real Gemini OCR/meal/exercise/chat vẫn cần `GEMINI_API_KEY`; public lab narrative không gọi model.

### Git state
- Commit dự kiến sẽ được tạo từ trạng thái này trên nhánh `master`, remote `origin` (ntc0407/Y-T-AUTO).
- Không force-push; chỉ push thêm commit thường.

### External tools actually used
- npm registry/npm ci/audit; Jest/ts-jest/TypeScript/Vite/Vitest; GitHub Git remote (fetch đã chạy); Prettier (parse YAML); PowerShell.
- Media verifier gọi live YouTube oEmbed và Wikimedia API/direct hosts.
- In-app Browser QA đã hoàn tất ở checkpoint trước (desktop/mobile/history/direct-load).

### Available tools not used and reasons
- Figma / Figma Make: không dùng vì không có thay đổi design.
- Google AI Studio: không dùng vì narrative deterministic.
- Chrome extension/Computer Use: không cần vì in-app Browser đủ cho localhost QA.
- GitHub write: sẽ dùng ngay sau checkpoint này để push.

## Checkpoint - GitHub Actions Green (2026-08-10)

- Commit push: `98747c4ef6e0add9bb106604f1e869ac2eb0896e` trên nhánh `master` của ntc0407/Y-T-AUTO.
- GitHub Actions run #8 (CI/CD Pipeline): `completed / success`, duration 40s.
- Run URL: https://github.com/ntc0407/Y-T-AUTO/actions/runs/31334544665
- Bằng chứng lấy trực tiếp từ GitHub Actions qua Chrome (đã đăng nhập) sau khi push.
- Yêu cầu CI gốc đã được đóng: backend dependencies cài bằng `npm ci` từ đúng working-directory, tests/build không bị bypass, Jest/TypeScript toolchain đồng bộ, và `jest-util` chỉ là transitive dependency.

## Checkpoint - Provider Status UX and Login Browser QA (2026-08-10)

- Endpoint `GET /api/auth/providers` trả `{ google, facebook, phoneOtp }` từ config thật; không rò rỉ secret.
- LoginPage chỉ render nút Google/Facebook khi provider được cấu hình; khi chưa cấu hình nút ẩn hoàn toàn.
- Browser QA thật (Chrome, localhost:5173/login, backend QA tạm không credentials): `/api/auth/providers` = false/false/false; DOM không chứa "Đăng nhập bằng Google"/"Đăng nhập bằng Facebook"; console 0 error/warn; screenshot lưu ngoài repo.
- Verification: backend 167/167 PASS, frontend 29/29 PASS, builds PASS, GitHub Actions run #13 (708cdbe) green.
- Commit liên quan: 708cdbe (provider status + conditional buttons).

## Checkpoint - Gemini Real Request Verified (2026-08-11)

- GEMINI_API_KEY loaded from backend/.env: PASS (chỉ kiểm tra presence, không hiển thị/ghi giá trị).
- backend/.env ignored by git: PASS (git check-ignore).
- Model fix: gemini-1.5-flash/2.5-flash không còn khả dụng với key mới; đổi sang `gemini-3.5-flash` trong ocr/geminiProvider.ts và ai/geminiProvider.ts.
- Gemini OCR real request (GeminiOcrProvider + ảnh JPEG sinh tạm ngoài repo): PASS, provider GEMINI, trả về kết quả OCR.
- Gemini AI real request (GeminiAIProvider.answerChat): PASS, reply non-empty.
- Backend full tests sau fix: 167/167 PASS; build PASS.
- Không print/log/commit giá trị key; smoke script tạm đã xóa.
- Google/Facebook/OTP chưa xử lý ở bước này.

## Checkpoint - Google OAuth Real End-to-End Verified (2026-08-11)

### Trạng thái
- Google OAuth đáp ứng đầy đủ acceptance criteria của checkpoint hiện tại và được chuyển từ PARTIAL sang DONE.
- Facebook OAuth và Phone OTP không được xử lý trong checkpoint này.

### Bằng chứng cấu hình an toàn
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, và `WEB_ORIGIN` đều được module config backend load: PASS.
- Chỉ kiểm tra presence và so khớp hai URL không nhạy cảm; không print, log, hoặc hiển thị credential/secret.
- `GOOGLE_REDIRECT_URI` khớp `http://localhost:5000/api/auth/google/callback`: PASS.
- `WEB_ORIGIN` khớp `http://localhost:5173`: PASS.
- `backend/.env` được `git check-ignore` xác nhận ignored và `git ls-files` xác nhận không tracked: PASS.

### Bằng chứng luồng thật
- Backend health và frontend HTTP trên cổng 5000/5173: PASS.
- `GET /api/auth/providers` báo `google=true`, `facebook=false`, `phoneOtp=false`: PASS.
- Nút `Đăng nhập bằng Google` render trên trang login, không có framework overlay hoặc console error/warn: PASS.
- `GET /api/auth/google` trả 302 tới đúng `accounts.google.com/o/oauth2/v2/auth`, có client ID, callback URI đúng, state không rỗng, scope `openid email profile`, và `prompt=select_account`: PASS.
- Người dùng hoàn thành bước chọn tài khoản/cấp quyền trực tiếp trong browser.
- Frontend callback được browser history xác nhận đã truy cập; backend callback được chứng minh gián tiếp bởi JWT ứng dụng hợp lệ và Google identity được cập nhật trong SQLite: PASS.
- Frontend có JWT-shaped token nhưng giá trị không được đọc hoặc hiển thị; `GET /api/auth/me` trả HTTP 200 và `success=true`: PASS.
- SQLite có Google identity vừa tạo/cập nhật, email và provider subject đều không rỗng; không hiển thị account data: PASS.
- Browser kết thúc tại `http://localhost:5173/dashboard`, có nội dung ứng dụng, không hiện login form, không có console error/warn: PASS.
- Browser regression trên origin tạm cô lập xác nhận `/login?oauth_error=Google%20denied` hiển thị alert, không có framework overlay hoặc console error/warn: PASS; server tạm đã dừng và không lưu artifact trong repository.

### Files modified
- `PROJECT_STATUS.md`
- `backend/jest.config.js`
- `backend/tests/setupEnv.ts`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/LoginPage.test.tsx`
- `docs/features/google_oauth.md`
- `docs/FEATURE_INDEX.md`
- `docs/TEST_PLAN.md`

### Test isolation fix and final verification
- RED: OAuth/provider targeted backend run failed 1/9 because `providerStatus.test.ts` loaded real Google credentials from `backend/.env`.
- Root cause: `dotenv/config` runs during Jest module import and the suite had no controlled external-provider environment.
- Fix: Jest `setupFiles` now clears Gemini, Google, Facebook, and OTP integration credentials before application modules load; tests cannot accidentally consume local secrets or call a configured provider.
- GREEN targeted backend OAuth/provider tests: 9/9 PASS.
- Full backend regression: 167/167 PASS across 14 suites.
- Full frontend regression: 30/30 PASS across 6 files.
- Backend TypeScript build: PASS.
- Frontend TypeScript + Vite production build: PASS.
- LoginPage OAuth error regression followed RED/GREEN: missing alert failed first, then passed after reading `oauth_error` from the login URL.

### Quyết định và follow-up
- Google OAuth blocker resolved: YES.
- Security hardening tách riêng cho tương lai: bind state với browser/session và tránh truyền JWT qua callback query string.
- Không commit `backend/.env`; không tạo hoặc lưu screenshot/log chứa account data trong repository.

## Checkpoint - Facebook OAuth Real End-to-End Verified (2026-08-11)

### Trạng thái
- Facebook OAuth functional real E2E PASS bằng app-role tester, nhưng final status vẫn PARTIAL do hai security blockers từ final review.
- Phone OTP không được xử lý trong checkpoint này.

### Bằng chứng cấu hình an toàn
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, và `WEB_ORIGIN` được backend load: PASS bằng boolean-only checks.
- Callback URI khớp `http://localhost:5000/api/auth/facebook/callback`; frontend origin khớp `http://localhost:5173`.
- `backend/.env` được git ignore và không tracked; không hiển thị hoặc commit credential.

### Bằng chứng luồng thật
- Facebook tester đã chấp nhận app role; login, 2FA/consent và authorization redirect thật hoàn tất trong browser.
- Graph API Explorer của đúng tester xác nhận `/me/permissions` có `email=granted`.
- `/me?fields=id,name,email` trả đủ `id`, `name`, `email` và không có Graph error; không hiển thị giá trị các trường.
- Backend callback xác thực state, đổi authorization code, tạo một Facebook OAuth user và một provider identity mới: PASS.
- SQLite có đúng một Facebook identity liên kết đúng một user, không orphan và không tạo medical profile giả.
- Frontend history đi qua `/oauth/callback` rồi `/dashboard`; guard chuyển user mới chưa có profile sang `/profile` onboarding đúng thiết kế.
- Reload `/profile` vẫn giữ authenticated session, không quay về `/login`, console không có error/warn liên quan: PASS.
- Hai personal profile trước đó có `email=granted` nhưng Meta không trả email; backend dừng an toàn trước linking/JWT thay vì fabricate dữ liệu. Tester có email Graph-valid đã hoàn tất flow.

### Implementation và test coverage
- Facebook token exchange dùng POST form body; Graph requests dùng Bearer header, tránh đặt App Secret/access token trong URL.
- Migration `006_oauth_identities.sql` bảo toàn nhiều provider identity trên cùng user và backfill Google identity hiện có.
- OAuth user mới không còn nhận ngày sinh/giới tính giả; provider-neutral callback UI dùng chung cho Google/Facebook.
- Full backend regression: 171/171 PASS across 14 suites.
- Full frontend regression: 31/31 PASS across 6 files.
- Backend TypeScript production build: PASS.
- Frontend TypeScript + Vite production build: PASS.
- Frontend lint command exit 0 nhưng repository hiện chưa có lint configuration thực tế.

### Quyết định và follow-up
- Facebook OAuth functional provider blocker resolved: YES.
- Facebook OAuth security blocker resolved: NO — JWT callback query và verified-email linking cần được harden.
- Facebook OAuth final status: PARTIAL; public non-role launch vẫn là Meta publishing task riêng.
- Security hardening tương lai: bind OAuth state với browser/session và thay callback query-token delivery bằng cơ chế ít lộ hơn.
- Không xử lý Phone OTP trong lượt này.

## Checkpoint - OAuth Pending-State Isolation Fix (2026-08-13)

### Scope and root cause
- Fixed only the validated MEDIUM/P2 finding: authenticated account-linking could evict unrelated users' pending OAuth states.
- Root cause: `oauth_authorization_states` used one global 1,000-row pool and deleted the globally oldest live rows before every insert; authenticated Google/Facebook link-start routes had no principal/IP limiter.

### Secure design
- Authorization-state issuance still performs TTL cleanup and admission atomically under `BEGIN IMMEDIATE`, but no longer evicts any unexpired row.
- Hard global ceiling remains 1,000; purpose quotas reserve 800 LOGIN and 200 LINK slots, with provider ceilings of 400 LOGIN and 100 LINK each.
- LINK is additionally bounded to 10 pending states per authenticated user and 5 per user/provider. Any reached quota returns safe `429 OAUTH_RATE_LIMITED` after committing TTL cleanup.
- Both `POST /api/auth/google/link` and `POST /api/auth/facebook/link` now use one shared authenticated-principal budget (10/minute) plus an IP ceiling (30/minute), ordered after `requireAuth` and before the link handler.
- Existing state binding, opaque/hash-only values, TTL, atomic single-use consume, replay rejection, redirect validation, verified-email/provider checks, and callback-code/JWT exchange remain unchanged.

### TDD and verification evidence
- RED confirmed 6 state-isolation/capacity tests failed against global eviction and 5 limiter/route tests failed before implementation.
- Focused OAuth/state/rate-limit/callback/contract: 82/82 PASS.
- Expanded OAuth/database/CORS/contract: 148/148 PASS.
- Backend full regression: 18 suites / 266 tests PASS.
- Contract tests: 27/27 PASS.
- Frontend regression: 9 files / 56 tests PASS.
- Backend TypeScript production build: PASS.
- Frontend TypeScript + Vite production build: PASS.
- Frontend lint command exits 0 but only reports `No lint configuration`; no real lint rules are configured.
- `git diff --check`: PASS (only existing LF-to-CRLF warnings).

### Proof gaps and operational notes
- Rate-limit buckets are process-local and reset on restart/multiply across multiple application instances; the transactional SQLite quotas and hard ceiling remain the authoritative cross-process storage protection. A distributed limiter is required if deployment becomes multi-instance.
- IP identity follows Express `req.ip`/socket behavior; production proxy deployments must configure explicit trusted proxy hops to preserve a meaningful client-IP ceiling.
- No full/deep security scan, real-provider browser flow, commit, or push was performed in this fix task. A focused security diff rescan is the next gate.

## Milestone - Phone Authentication Implemented (2026-08-13)

### Outcome
- Phone Auth implementation: COMPLETE. REGISTER / LOGIN / LINK semantics enforced for Google, Facebook, Phone. Four-method /register and four-method /login UI verified desktop/mobile.
- OAuth: Google DONE, Facebook DONE. Explicit intent semantics (LOGIN/REGISTER/LINK) enforced; browser-bound opaque callback exchange hardened; no auto-create on login, no silent merge.
- Phone OTP: Twilio and eSMS adapters complete. Migration 009 + 010 applied. Phone login/register/link endpoints, PhoneOtpFlow with three modes, browser QA PASS.
- eSMS: Credentials validated (GetTemplate CodeResult 100, template Baotrixemay exists). GetBalance returns Balance=0, CodeResponse 100. Direct send returns CodeResult 103 "Balance not enough to send message". Live handset E2E pending eSMS funding or alternative provider.
- Contracts: oauth_session requires intent, exchange requires {code,intent}, callback URL includes intent, public social starts require LOGIN|REGISTER, phone register endpoints in OpenAPI. All 17 schema/example pairs PASS, contract suite 46/46 PASS.
- Automated gates: Backend 444/444 PASS, Frontend 127/127 PASS, Contracts 46/46 PASS, Builds PASS, git diff --check PASS, Secret scan clean.
- Live SMS handset E2E: PENDING ? eSMS balance = 0 (CodeResult 103). External action required before production launch.## Milestone - eSMS Delivery Adapter Implemented (2026-08-13)

### Outcome

- Added `EsmsSmsProvider` behind the existing `SmsProvider`; Phone Auth generation, HMAC persistence, lifecycle, rate limits, browser binding, account resolution and JWT/session code were not rewritten.
- Provider selection accepts only `twilio` or `esms`; only the selected provider's credentials determine readiness. Incomplete eSMS key/secret fails before database runtime initialization and keeps `/api/auth/providers.phoneOtp=false`.
- Local eSMS credentials were not read, printed, logged, snapshotted or committed. Automated tests use synthetic values and mocked network calls; no live SMS was sent.

### Contract and security decisions

- Added physical `esms_send_response` JSON Schema/example plus matching TypeScript type/runtime validator. Unknown provider fields are tolerated, but `CodeResult` must be a non-empty string; only `"100"` succeeds.
- Adapter has a fixed HTTPS endpoint and finite timeout, sends exactly one request with no blind retry, maps HTTP/network/timeout/malformed/provider failures to sanitized `OTP_DELIVERY_UNAVAILABLE`, and never logs request bodies, OTPs, secrets, response bodies or message identifiers.
- Official non-secret delivery constants are pinned: `Brandname=Baotrixemay`, `SmsType="2"`, `IsUnicode="0"`, and `${CODE} la ma xac minh dang ky Baotrixemay cua ban`. `Sandbox` and `AutoGenCode` are absent.

### Verification status

- Focused eSMS/config/provider/contract/Twilio/runtime gate: 88/88 PASS after review fixes for selected-provider timeout isolation, whitespace-only credential rejection and Twilio sender semantics aligned with factory validation.
- Focused Phone Auth/OAuth/email/JWT/database regression gate: 247/247 PASS.
- Physical contract gate: 42/42 PASS, including the new `esms_send_response` schema/example.
- Full backend: 29 suites, 404/404 PASS. Full frontend: 10 files, 105/105 PASS. Backend and frontend production builds PASS.
- Frontend lint command exits 0 but still only prints `No lint configuration`; no real lint rules are configured.
- `git diff --check` PASS (chỉ có cảnh báo line-ending LF/CRLF của working tree Windows). Custom text-only secret scan loại trừ mọi `.env`: 0 credential assignment đáng ngờ, 0 secret pattern đáng ngờ, 0 secret/db/log artifact; 16 hit được allowlist đều là placeholder `synthetic-esms-*` trong tests. `gitleaks`/`trufflehog` không được cài cục bộ.
- Independent engineering re-review sau fixes: không còn finding eSMS-specific. Live handset delivery remains deliberately unclaimed.
