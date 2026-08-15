# Phone Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver phone login, verification, and authenticated account linking through secure SMS OTP while retaining the existing user, JWT, OAuth, profile, and frontend auth architecture.

**Architecture:** A new migration supersedes the legacy OTP scaffold with verified phone identities, browser-bound persistent challenges, and persistent rate-limit buckets. A provider-neutral phone service coordinates normalization, HMAC OTPs, Twilio/eSMS delivery, transaction-safe account resolution, and the current JWT session path; the frontend reuses one OTP component for login and linking and validates phone sessions through AuthContext before storage.

**Tech Stack:** Node.js, Express 5, TypeScript, SQLite, Zod, `libphonenumber-js`, Twilio/eSMS REST APIs, Jest, React 19, Axios, Vitest, Testing Library, JSON Schema, OpenAPI.

---

### Task 1: Phone Normalization and OTP Cryptography

**Files:**
- Create: `backend/src/services/phone/normalizePhone.ts`
- Create: `backend/src/services/phone/otpCrypto.ts`
- Modify: `backend/src/config/index.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Test: `backend/tests/phoneNormalization.test.ts`
- Test: `backend/tests/phoneOtpCrypto.test.ts`

- [ ] Write focused tests for Vietnamese E.164 normalization, international input, presentation separators, invalid/short/long/extension/letter input, leading-zero OTP generation, HMAC domain separation, and timing-safe verification.
- [ ] Run the focused tests and confirm they fail because the new modules do not exist.
- [ ] Add `libphonenumber-js`, strict numeric environment parsing, a required production OTP HMAC secret, and the minimal normalization/crypto implementation.
- [ ] Run focused tests until green, then refactor names without adding behavior.

### Task 2: Migration and Persistent Rate Limits

**Files:**
- Create: `backend/src/database/migrations/009_phone_auth.sql`
- Create: `backend/src/services/phone/rateLimits.ts`
- Modify: `backend/tests/database.test.ts`
- Test: `backend/tests/phoneRateLimits.test.ts`

- [ ] Write migration tests for identity uniqueness, challenge purpose/target checks, lifecycle fields, rate-bucket constraints, migration ledger idempotency, and legacy OAuth/user preservation.
- [ ] Write rate-limit tests for phone/IP/user dimensions, minute/hour/day windows, cooldown, cleanup, hard capacity, fail-closed behavior, provider-failure accounting, and shared behavior across service instances.
- [ ] Run focused tests and confirm expected missing migration/module failures.
- [ ] Add the migration and transaction-backed bucket implementation using domain-separated HMAC keys and bounded cleanup.
- [ ] Run focused database/rate tests until green and verify migration 005 remains unchanged.

### Task 3: SMS Provider Abstraction and Production Adapters

**Files:**
- Create: `backend/src/services/sms/types.ts`
- Create: `backend/src/services/sms/twilioSmsProvider.ts`
- Create: `backend/src/services/sms/esmsSmsProvider.ts`
- Create: `backend/src/services/sms/esmsResponse.ts`
- Create: `backend/src/services/sms/providerFactory.ts`
- Modify: `backend/src/services/oauth/providerStatus.ts`
- Modify: `backend/tests/providerStatus.test.ts`
- Modify: `backend/tests/setupEnv.ts`
- Test: `backend/tests/smsProvider.test.ts`

- [ ] Write tests for exact selected-provider configuration, safe provider-unavailable failures, Twilio request URL/body/auth construction, eSMS endpoint/JSON/template/response construction, timeout/network/non-success handling, absence of OTP/secrets/provider body from errors and console logs, and a false provider status for partial configuration.
- [ ] Run the tests and confirm missing-provider-module failures.
- [ ] Implement the injectable interface, production-only Twilio/eSMS factory, bounded HTTPS requests, sanitized errors, response contract validation, and provider-status integration.
- [ ] Run focused tests until green; keep the automated fake inside tests and unreachable from environment selection.

### Task 4: Challenge Service and Account Resolution

**Files:**
- Create: `backend/src/services/phone/phoneBinding.ts`
- Create: `backend/src/repositories/phoneAuthRepository.ts`
- Create: `backend/src/services/phone/phoneAuthService.ts`
- Modify: `backend/src/repositories/authRepository.ts`
- Test: `backend/tests/phoneAuthService.test.ts`
- Test: `backend/tests/phoneAccountResolution.test.ts`

- [ ] Write request tests for generic account-independent responses, challenge creation, no raw OTP persistence/logging, cooldown, rate limits, provider success/failure finalization, and older-challenge invalidation.
- [ ] Write verify tests for valid/wrong/expired/single-use/replay/attempt-limit/rate-limit/binding/purpose/user isolation and separate-connection concurrent verification.
- [ ] Write account tests for existing-phone login, phone-only onboarding, verified link, idempotent same-user link, owned-phone conflict, alternate-phone conflict, reserved-email registration/login rejection, rollback on account/JWT failure, and unchanged JWT claims/expiry behavior.
- [ ] Run tests and confirm they fail because the service/repository do not exist.
- [ ] Implement browser binding, challenge lifecycle, account resolution, and transaction-scoped session signing with dependency injection for clock/provider.
- [ ] Run focused tests until green and refactor only after all lifecycle tests pass.

### Task 5: Validated API Endpoints and Safe Errors

**Files:**
- Create: `backend/src/controllers/phoneAuthController.ts`
- Modify: `backend/src/routes/authRoutes.ts`
- Modify: `backend/src/controllers/authController.ts`
- Modify: `backend/src/schemas/index.ts`
- Test: `backend/tests/phoneAuthController.test.ts`
- Modify: `backend/tests/oauthCallback.test.ts`

- [ ] Write tests for strict request schemas, route middleware ordering, public login versus authenticated link endpoints, status endpoint, 202 request semantics, `Cache-Control: no-store`, `Retry-After`, standardized safe error codes, and no sensitive response fields.
- [ ] Run tests and confirm the old placeholder handlers and unvalidated routes fail expectations.
- [ ] Add the phone controller, request context extraction, schemas, routes, and `/auth/me` phone status while leaving OAuth handlers unchanged.
- [ ] Run phone controller tests and OAuth callback/route regression until green.

### Task 6: Physical Contracts and OpenAPI

**Files:**
- Create: `contracts/json/auth_session.schema.json`
- Create: `contracts/examples/auth_session.example.json`
- Create: `contracts/json/phone_otp_challenge.schema.json`
- Create: `contracts/examples/phone_otp_challenge.example.json`
- Create: `contracts/json/phone_account_status.schema.json`
- Create: `contracts/examples/phone_account_status.example.json`
- Modify: `contracts/manifest.json`
- Modify: `contracts/openapi.json`
- Modify: `backend/tests/contract.test.ts`

- [ ] Write contract tests that register and validate every example, synchronize components, validate all phone paths/security/error responses, reject additional/sensitive fields, and prove the shared auth-session shape remains compatible with the OAuth session shape.
- [ ] Run `npm run test:contract` and confirm missing contracts/paths fail.
- [ ] Add strict schemas/examples, manifest entries, OpenAPI components and endpoints, including `/auth/me`, `/auth/providers`, and the correct `/auth/profile` path.
- [ ] Run contract tests until green without weakening existing OAuth constraints.

### Task 7: Frontend API and AuthContext Session Integration

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api.test.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/context/AuthContext.test.tsx`

- [ ] Write tests for challenge/status runtime validation, login/link API calls, explicit candidate Bearer validation, and rejection of extra/sensitive response fields.
- [ ] Write AuthContext tests for phone session `/auth/me` validation, profile-aware result, stale-operation isolation against email/register/OAuth/phone, logout cancellation, and no token storage after failed candidate validation.
- [ ] Run focused tests and confirm missing phone API/context methods fail.
- [ ] Add synchronized types, guards, API functions, and `completePhoneOtp` through the existing operation-generation/session-validation path.
- [ ] Run API/AuthContext tests until green and preserve all OAuth/email behavior.

### Task 8: Vietnamese Phone Login Flow

**Files:**
- Create: `frontend/src/components/PhoneOtpFlow.tsx`
- Create: `frontend/src/components/PhoneOtpFlow.test.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`

- [ ] Write component/page tests for provider-gated visibility, phone entry, OTP screen, loading, invalid/expired/locked/rate-limit/provider errors, countdown, resend, change number, successful login redirect to profile/dashboard, and unchanged email/Google/Facebook controls.
- [ ] Run focused tests and confirm the phone option/flow is absent.
- [ ] Implement the reusable accessible flow and integrate login mode in Vietnamese.
- [ ] Run focused tests until green, using server timestamps and fake timers for countdown behavior.

### Task 9: Authenticated Phone Link and Status UI

**Files:**
- Modify: `frontend/src/components/PhoneOtpFlow.tsx`
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Modify: `frontend/src/pages/ProfilePage.test.tsx`

- [ ] Write tests for unverified/verified/masked status, link request/verify, refresh after success, idempotent success, identity conflicts, retry/change-number behavior, and unchanged OAuth linking.
- [ ] Run focused tests and confirm profile phone UI is absent.
- [ ] Add link mode and phone account card without exposing canonical phone or internal IDs.
- [ ] Run profile/OTP tests until green.

### Task 10: Documentation and Project Status

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/features/phone_auth.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DATABASE_SCHEMA.md`
- Modify: `docs/USER_STORIES.md`
- Modify: `docs/USER_FLOWS.md`
- Modify: `PROJECT_STATUS.md`

- [ ] Document architecture, provider setup, all configuration variables, phone-only onboarding, privacy semantics, rate limits, multi-instance/proxy limitations, contracts, tests, and live-SMS proof requirements.
- [ ] Correct stale OAuth status text only in documentation; do not refactor OAuth code.
- [ ] Record assumptions, decisions, test evidence, proof gaps, and the exact external credential/action checklist in `PROJECT_STATUS.md`.

### Task 11: Full Verification and Engineering Security Review

**Files:**
- Review all files changed by Tasks 1-10.

- [ ] Run focused backend phone/auth tests and inspect full output.
- [ ] Run existing Google/Facebook/email/JWT regression tests and inspect full output.
- [ ] Run database tests, contract tests, full backend tests, and backend production build.
- [ ] Run focused frontend phone/AuthContext/login/profile tests, full frontend tests, lint command, and frontend production build.
- [ ] Run `git diff --check`, secret/artifact scans, and inspect `git diff` for migration/contract/type/runtime synchronization.
- [ ] Start isolated local servers with a temporary SQLite database and test-only injected SMS provider; verify login/profile UI on desktop and mobile in a real browser without claiming live SMS delivery.
- [ ] Manually review brute force, replay, concurrent verification, enumeration, account linking, normalization collisions, rate-limit bypass, challenge fixation, JWT leakage, provider secrets/logs, DB uniqueness, transaction boundaries, SMS bombing, and multi-user isolation.
- [ ] Fix every failure through a reproducing test and rerun the affected and full gates.
- [ ] Produce the required pre-commit `PHONE AUTH VERIFICATION REPORT`, `git status --short`, and `git diff --stat`; do not commit or push.
