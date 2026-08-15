# eSMS SMS Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready eSMS delivery adapter without changing the existing Phone Auth lifecycle or public API.

**Architecture:** Keep `SmsProvider.sendOtp` unchanged and select either provider-specific Twilio or eSMS configuration in the factory. The eSMS adapter performs one bounded JSON POST to a fixed endpoint, validates the physical response contract, and maps every provider failure to the existing sanitized delivery error.

**Tech Stack:** Node.js, TypeScript, built-in `fetch`, Jest, AJV, JSON Schema.

---

### Task 1: Provider Selection and Configuration

**Files:**
- Modify: `backend/src/services/sms/types.ts`
- Modify: `backend/src/services/sms/providerFactory.ts`
- Modify: `backend/src/config/index.ts`
- Modify: `backend/tests/setupEnv.ts`
- Test: `backend/tests/esmsSmsProvider.test.ts`
- Test: `backend/tests/config.test.ts`
- Test: `backend/tests/providerStatus.test.ts`

- [x] Write failing tests for `esms` selection, missing key/secret, selected-provider readiness and bounded eSMS timeout.
- [x] Run `npm test -- --runInBand tests/esmsSmsProvider.test.ts tests/config.test.ts tests/providerStatus.test.ts` and confirm failures are caused by missing eSMS support.
- [x] Add nested Twilio/eSMS configuration and select only the configured provider.
- [x] Re-run the focused tests and retain all Twilio assertions.

### Task 2: eSMS HTTP Adapter and Response Contract

**Files:**
- Create: `backend/src/services/sms/esmsSmsProvider.ts`
- Create: `backend/src/services/sms/esmsResponse.ts`
- Create: `contracts/json/esms_send_response.schema.json`
- Create: `contracts/examples/esms_send_response.example.json`
- Modify: `contracts/manifest.json`
- Modify: `backend/tests/esmsSmsProvider.test.ts`
- Modify: `backend/tests/contract.test.ts`

- [x] Write failing tests for the exact endpoint, JSON payload, Vietnamese phone conversion, unchanged OTP/template, response validation, safe errors and timeout.
- [x] Add the physical response schema/example and tests that reject invalid `CodeResult` shapes.
- [x] Implement one bounded POST with no retry, accept only `CodeResult="100"`, and sanitize every failure.
- [x] Run focused provider and contract tests until green.

### Task 3: Documentation and Regression Verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/features/phone_auth.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/superpowers/specs/2026-08-13-phone-auth-design.md`
- Modify: `docs/superpowers/plans/2026-08-13-phone-auth.md`

- [x] Document both provider choices, placeholders, fixed eSMS template/schema, Vietnam-only adapter policy and live-test proof gap.
- [x] Run focused SMS and Phone Auth tests, full backend tests, contract tests, frontend tests, backend/frontend builds, `git diff --check`, and a repository secret/artifact scan that excludes real local `.env` content.
- [x] Request an independent code review, resolve findings, and rerun affected gates.
- [x] Report the exact local switch `OTP_SMS_PROVIDER=esms` without committing, pushing or sending a live SMS.
