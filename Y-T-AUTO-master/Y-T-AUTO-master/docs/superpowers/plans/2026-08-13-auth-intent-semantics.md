# Explicit Auth Intent Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce distinct LOGIN, REGISTER, and LINK semantics for Google, Facebook, and phone OTP while completing the four-method `/register` UI.

**Architecture:** Persist purpose through OAuth state/callback codes and phone challenges, split account resolution into existing-only login, new-only registration, and authenticated linking, then wire explicit intents through contracts and frontend flows. Preserve all existing OAuth/OTP security controls and SMS providers.

**Tech Stack:** TypeScript, Express, SQLite, Zod, Jest, React, React Router, Vitest, Testing Library, JSON Schema, OpenAPI.

---

### Task 1: Lock the persisted purpose contract

**Files:**
- Create: `backend/src/database/migrations/010_auth_intents.sql`
- Modify: `backend/src/services/oauth/oauthState.ts`
- Modify: `backend/src/services/oauth/oauthExchange.ts`
- Modify: `backend/src/repositories/phoneAuthRepository.ts`
- Test: `backend/tests/database.test.ts`
- Test: `backend/tests/oauthExchange.test.ts`

- [ ] Add RED tests that accept `REGISTER`, reject invalid purposes/target combinations, bind callback codes to purpose, reject cross-purpose exchange, and preserve one-time/browser/TTL behavior.
- [ ] Run `npm test -- --runInBand tests/database.test.ts tests/oauthExchange.test.ts` in `backend`; confirm failures are caused by missing `REGISTER` and callback purpose.
- [ ] Add migration 010, shared purpose types, explicit capacity partitions, and purpose-aware callback issue/consume behavior.
- [ ] Re-run the focused tests and keep all state/callback replay and browser-binding tests green.

### Task 2: Split OAuth account resolution

**Files:**
- Modify: `backend/src/repositories/authRepository.ts`
- Test: `backend/tests/googleOAuth.test.ts`
- Test: `backend/tests/facebookOAuth.test.ts`
- Test: `backend/tests/oauthAccountResolution.test.ts`

- [ ] Add RED tests for new/existing Google and Facebook registration, existing/unknown login, email collision without merge, ambiguous legacy ownership, link conflict, and concurrent registration.
- [ ] Run the focused repository tests and confirm the old auto-create/auto-link behavior fails the new assertions.
- [ ] Implement `loginWithOAuthIdentity` and `registerOAuthUser` as separate transactions; retain explicit link and safe legacy backfill only for a uniquely owned provider identity.
- [ ] Re-run the focused tests and verify no LOGIN path inserts users or identities and no REGISTER path attaches to an existing user.

### Task 3: Bind OAuth controller and exchange intent

**Files:**
- Modify: `backend/src/controllers/authController.ts`
- Modify: `backend/src/routes/authRoutes.ts`
- Modify: `backend/src/schemas/index.ts`
- Test: `backend/tests/oauthCallback.test.ts`

- [ ] Add RED tests for required LOGIN/REGISTER query intent, callback branching, callback redirect intent, mismatch rejection, safe guidance errors, and unchanged authenticated LINK isolation.
- [ ] Run `npm test -- --runInBand tests/oauthCallback.test.ts`; confirm the current implicit LOGIN handler fails.
- [ ] Implement explicit public intent parsing, purpose-specific repository calls, purpose-aware callback codes, and `{code,intent}` exchange validation.
- [ ] Re-run callback tests and OAuth provider regression tests.

### Task 4: Split phone login, registration, and linking

**Files:**
- Modify: `backend/src/repositories/phoneAuthRepository.ts`
- Modify: `backend/src/services/phone/phoneAuthService.ts`
- Modify: `backend/src/controllers/phoneAuthController.ts`
- Modify: `backend/src/routes/authRoutes.ts`
- Test: `backend/tests/phoneAccountResolution.test.ts`
- Test: `backend/tests/phoneAuthService.test.ts`
- Test: `backend/tests/phoneAuthController.test.ts`

- [ ] Add RED tests proving unknown LOGIN creates nothing, unknown REGISTER creates exactly one placeholder user, existing REGISTER returns `LOGIN_REQUIRED`, races create one user, and all post-proof semantic errors consume the challenge.
- [ ] Add RED purpose-isolation/controller-route tests for the new register request and verify endpoints.
- [ ] Run focused phone tests and confirm failures reflect the old login auto-onboarding behavior.
- [ ] Implement `requestRegisterOtp`, `verifyRegisterOtp`, lookup-only login, new-only registration, tagged committed semantic outcomes, and safe controller errors.
- [ ] Re-run all phone account, OTP lifecycle, rate-limit, SMS provider, eSMS, and Twilio tests.

### Task 5: Synchronize API contracts

**Files:**
- Modify: `contracts/json/oauth_session.schema.json`
- Modify: `contracts/examples/oauth_session.example.json`
- Modify: `contracts/json/oauth_authorization.schema.json`
- Modify: `contracts/examples/oauth_authorization.example.json`
- Modify: `contracts/openapi.json`
- Modify: `backend/tests/contract.test.ts`
- Modify: `contracts/manifest.json` only if a new contract is introduced

- [ ] Add RED contract tests for OAuth intent in exchange/session, explicit OAuth starts, phone registration endpoints, and safe post-proof errors.
- [ ] Run `npm run test:contract` in `backend`; confirm schema/OpenAPI drift fails.
- [ ] Update JSON Schema, synthetic examples, OpenAPI, and route operation mappings together.
- [ ] Re-run contract tests and validate all examples against their schemas.

### Task 6: Add frontend intent-aware API and auth context

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api.test.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/context/AuthContext.test.tsx`

- [ ] Add RED tests for `{code,intent}` OAuth exchange, server intent validation, register phone endpoints, registration session storage, identity validation, and stale operation isolation.
- [ ] Run focused Vitest files and confirm the missing APIs/signatures fail.
- [ ] Add shared `AuthIntent`, strict OAuth session validation, explicit phone register functions, and intent-aware completion methods while preserving `/auth/me` validation.
- [ ] Re-run focused API/context tests.

### Task 7: Complete `/register`, `/login`, and OTP UI

**Files:**
- Create: `frontend/src/pages/RegisterPage.test.tsx`
- Modify: `frontend/src/pages/RegisterPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/components/PhoneOtpFlow.test.tsx`
- Modify: `frontend/src/components/PhoneOtpFlow.tsx`

- [ ] Add RED tests for all four register methods, explicit social intents, three phone modes, Vietnamese login/register guidance CTAs, provider availability, email registration regressions, and accessible labels.
- [ ] Run the focused page/component tests and confirm `/register` is missing the required controls.
- [ ] Implement the four-method responsive register UI, explicit login social links, exhaustive phone dispatch, and post-proof guidance without changing SMS delivery.
- [ ] Re-run focused page/component tests.

### Task 8: Make OAuth callback intent-aware

**Files:**
- Modify: `frontend/src/pages/OAuthCallback.tsx`
- Modify: `frontend/src/pages/OAuthCallback.test.tsx`

- [ ] Add RED tests for missing/invalid intent, LOGIN/REGISTER/LINK routing, intent mismatch, registration/login guidance, StrictMode single exchange, and stale callback isolation.
- [ ] Run the callback test file and confirm the current login-only behavior fails.
- [ ] Implement strict intent parsing, intent-aware completion, safe error-code CTAs, and route-specific Vietnamese status text.
- [ ] Re-run callback and AuthContext tests.

### Task 9: Update feature and project documentation

**Files:**
- Create: `docs/features/auth_intents.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DATABASE_SCHEMA.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `docs/USER_FLOWS.md`
- Modify: `docs/USER_STORIES.md`
- Modify: `docs/features/phone_auth.md`
- Modify: `docs/features/google_oauth.md`
- Modify: `docs/features/facebook_oauth.md`
- Modify: `PROJECT_STATUS.md`

- [ ] Document `REGISTER != LOGIN != LINK`, route/contract semantics, migration behavior, post-proof enumeration policy, duplicate/race controls, test coverage, and the paused live eSMS proof gap.
- [ ] Confirm no documentation contains real credentials, OTPs, tokens, or unsupported live-E2E claims.

### Task 10: Run all verification gates and browser QA

**Files:**
- Verify only; fix failures through new RED-GREEN cycles.

- [ ] Run focused OAuth, phone, account-resolution, SMS provider, rate-limit, database, contract, email, and JWT tests.
- [ ] Run backend full suite and `npm run build`.
- [ ] Run frontend full suite, `npm run lint`, and `npm run build`.
- [ ] Run `git diff --check` and a secret scan excluding local `.env` files and generated dependencies.
- [ ] Start local backend/frontend without changing credentials or sending OTP, then inspect `/register` and `/login` at desktop and mobile widths in a real browser.
- [ ] Record exact commands, pass counts, browser observations, proof gaps, `git status --short`, and `git diff --stat` in the final report. Do not commit or push.
