# Safe Lab Analysis and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove free-form Gemini lab narrative and persist deterministic analysis summary/explanations across history reloads.

**Architecture:** A shared deterministic analyzer becomes the only public lab-narrative producer for both AI providers. A non-destructive migration stores narrative snapshots, while report detail falls back to the same analyzer for legacy rows.

**Tech Stack:** TypeScript 5.9.3, Express, SQLite, Jest/ts-jest 29, JSON Schema/OpenAPI, React 19, Vitest.

---

### Task 1: Replace Gemini Lab Narrative with a Shared Deterministic Analyzer

**Files:**
- Create: `backend/src/services/ai/labAnalysis.ts`
- Modify: `backend/src/services/ai/ruleBasedProvider.ts`
- Modify: `backend/src/services/ai/geminiProvider.ts`
- Modify: `backend/tests/aiProvider.test.ts`
- Modify: `backend/tests/geminiProvider.test.ts`
- Delete: `contracts/json/gemini_lab_analysis_draft.schema.json`
- Delete: `contracts/examples/gemini_lab_analysis_draft.example.json`
- Modify: `contracts/manifest.json`
- Modify: `backend/tests/contract.test.ts`

- [x] **Step 1: Write failing provider and contract tests**

Add tests proving `GeminiAIProvider.analyzeLabResults` returns the same trusted result as the shared deterministic analyzer, supports duplicate `testCode` occurrences and one-sided bounds, and never calls the private Gemini text boundary. Add a contract assertion that `gemini_lab_analysis_draft` is no longer registered.

- [x] **Step 2: Run the targeted tests and verify RED**

Run:

```powershell
cd backend
npm test -- --runTestsByPath tests/geminiProvider.test.ts tests/aiProvider.test.ts tests/contract.test.ts
```

Expected: FAIL because Gemini still parses free-form draft output and the draft contract remains registered.

- [x] **Step 3: Implement the shared analyzer and remove the obsolete draft**

Export a function with this interface:

```ts
export function analyzeConfirmedLabResults(
  reportId: string,
  results: ConfirmedLabResult[],
): LabAnalysis;
```

Move deterministic classification, explanation, and summary construction into the module. Both providers call it. Remove Gemini lab draft parsing/safety code and remove the physical draft schema/example/manifest entry.

- [x] **Step 4: Run targeted tests and verify GREEN**

Run the same command. Expected: all targeted tests PASS and the Gemini text spy has zero calls for lab analysis.

### Task 2: Persist Analysis Narrative and Extend Report Detail

**Files:**
- Create: `backend/src/database/migrations/003_analysis_narrative.sql`
- Modify: `backend/src/controllers/analysisController.ts`
- Modify: `backend/tests/database.test.ts`
- Modify: `backend/tests/analysisPersistence.test.ts`
- Modify: `contracts/json/report_detail.schema.json`
- Modify: `contracts/examples/report_detail.example.json`
- Modify: `contracts/openapi.json`
- Modify: `backend/tests/contract.test.ts`
- Modify: `frontend/src/types/index.ts`

- [x] **Step 1: Write failing migration, round-trip, and legacy fallback tests**

Tests must assert migration 003 is recorded, both nullable columns exist, confirmation persists exact summary/explanations, report detail returns them after reopening the database, and legacy null narrative columns produce deterministic non-empty fallback text without database deletion.

- [x] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
cd backend
npm test -- --runInBand tests/database.test.ts tests/analysisPersistence.test.ts tests/contract.test.ts
```

Expected: FAIL because migration 003 and report-detail narrative fields do not exist.

- [x] **Step 3: Add migration and transactional persistence**

Migration SQL:

```sql
ALTER TABLE lab_reports ADD COLUMN analysis_summary TEXT;
ALTER TABLE lab_results ADD COLUMN explanation TEXT;
```

Inside the existing analysis transaction, persist `bundle.analysis.overallSummary` and each aligned result explanation. On history read, use stored text when non-empty and call `analyzeConfirmedLabResults` for any legacy null narrative.

- [x] **Step 4: Synchronize ReportDetail contracts**

Require root `overallSummary: string` and per-result `explanation: string` in the physical schema/example, OpenAPI component, backend response, and frontend `ReportDetail`/`PersistedLabResult` types. Extend contract tests so the physical example validates against OpenAPI.

- [x] **Step 5: Run targeted tests and verify GREEN**

Run the same targeted command. Expected: all migration, persistence, legacy fallback, and contract tests PASS.

### Task 3: Render Persisted Narrative and Run Full Verification

**Files:**
- Modify: `frontend/src/pages/AnalysisPage.tsx`
- Create or modify: `frontend/src/pages/AnalysisPage.test.tsx`
- Modify: `docs/features/lab_analysis.md`
- Modify: `docs/features/history.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `PROJECT_STATUS.md`

- [x] **Step 1: Write a failing direct-load frontend test**

Mock `getReportDetail` with a non-empty persisted summary/explanation, render `/analysis/:reportId` without navigation state, and assert the Analysis tab shows both strings.

- [x] **Step 2: Run the frontend test and verify RED**

Run:

```powershell
cd frontend
npm test -- --run src/pages/AnalysisPage.test.tsx
```

Expected: FAIL because direct-load mapping currently writes empty strings.

- [x] **Step 3: Map persisted narrative and verify GREEN**

Set `analysis.overallSummary` from `detail.overallSummary` and each result `explanation` from `detail.results`. Re-run the targeted frontend test and expect PASS.

- [x] **Step 4: Run complete verification**

Run backend full tests, contract tests, build, audit, dependency graph, and media verifier; run frontend tests, build, and audit; parse workflow YAML and run `git diff --check` plus secret/artifact scans.

- [x] **Step 5: Update documentation and checkpoint**

Record exact files, commands, test counts, builds, errors, Git SHA, tools used/not used, the deterministic lab-narrative safety decision, and browser/history evidence. Do not commit or push until all review findings are closed.
