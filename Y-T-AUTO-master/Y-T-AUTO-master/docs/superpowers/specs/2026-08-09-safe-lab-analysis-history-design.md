# Safe Lab Analysis and History Design

## Context

The Gemini lab-analysis path currently accepts free-form medical narrative. Runtime filters can catch known diagnosis or medication phrases, but cannot guarantee that every future wording remains informational or consistent with deterministic lab status. Direct report reload also loses `overallSummary` and per-result `explanation` because those fields are not persisted.

## Approaches Considered

1. **Expand the narrative denylist.** Smallest diff, but remains fail-open: a new phrase can bypass it and the safety boundary depends on incomplete natural-language matching.
2. **Use deterministic public lab analysis.** Reuse one shared analyzer for both rule-based and Gemini providers. Gemini remains active for meal, exercise, and chat generation, while lab values, status, summary, and explanations are deterministic and informational.
3. **Replace narrative with Gemini-selected enums.** Safe, but Gemini would only select labels the application can already calculate, adding latency and contract complexity without useful behavior.

## Decision

Use approach 2. Public lab analysis must never expose free-form model text. `GeminiAIProvider.analyzeLabResults` delegates to the same shared deterministic analyzer as `RuleBasedAIProvider`. The internal `gemini_lab_analysis_draft` contract and its runtime parser are removed because that structured model output no longer exists.

## Architecture

- Create a focused shared lab-analysis module that classifies `LOW`, `NORMAL`, `HIGH`, and `UNKNOWN`, builds informational explanations, and creates the overall summary from confirmed results.
- Both AI providers call the shared module for lab analysis. Gemini continues to handle meal plans, exercise plans, and chat through their existing validated boundaries.
- Add migration `003_analysis_narrative.sql` with nullable `lab_reports.analysis_summary` and `lab_results.explanation` columns. The migration preserves all existing data.
- Confirmation persists summary and explanations in the existing atomic analysis transaction.
- Report detail always returns non-empty `overallSummary` and result `explanation`. New reports use stored values; legacy rows with null narrative fields use the shared deterministic analyzer as a safe fallback without mutating history.

## Contracts and Consumers

- `ReportDetail` gains required `overallSummary` and required result `explanation` fields in JSON Schema, synthetic example, OpenAPI, backend response, and frontend types.
- The existing strict `LabAnalysis` physical schema and OpenAPI component remain the canonical fresh-analysis contract.
- The removed Gemini lab draft is deleted from the manifest, schema/example directories, and contract-specific tests.
- The Analysis page maps persisted summary/explanations directly on history or direct reload.

## Error Handling and Compatibility

- No external AI call is made for lab narrative, so prompt injection and raw-output leakage are eliminated at this boundary.
- Legacy reports remain readable. Null persisted narrative fields are reconstructed deterministically at read time.
- Existing media provenance, transaction, migration ledger, and CI behavior remain unchanged.

## Verification

- TDD proves Gemini lab analysis does not call the model text boundary and matches rule-based output, including duplicate codes and one-sided bounds.
- Migration and controller integration tests prove narrative persistence and legacy fallback.
- Contract tests prove `ReportDetail`, OpenAPI, examples, and frontend fields stay synchronized.
- Frontend tests prove direct-load/history renders non-empty summary and explanations.
- Full backend/frontend tests, builds, audits, workflow parse, and diff hygiene run before commit.
