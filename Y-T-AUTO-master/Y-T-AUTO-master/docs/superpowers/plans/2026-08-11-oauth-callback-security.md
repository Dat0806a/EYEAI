# OAuth Callback Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove application tokens from OAuth URLs, make callback exchange codes short-lived and atomically single-use, and prevent unsafe email-only OAuth account linking.

**Architecture:** Google and Facebook authorization state and frontend callback codes are opaque CSPRNG values whose SHA-256 hashes are stored in SQLite. Provider callbacks resolve or explicitly link a provider identity, issue a 60-second callback code, and redirect with only `?code=...`; the frontend exchanges that code by POST for the application session. Provider identity is primary, Google email trust requires `email_verified=true`, and Facebook email collisions require a link flow started by an already authenticated application user.

**Tech Stack:** TypeScript, Express 5, SQLite, Zod, Jest/ts-jest, React 19, Axios, Vitest, JSON Schema, OpenAPI 3.1.

---

### Task 1: Persist opaque OAuth state and callback results

**Files:**
- Create: `backend/src/database/migrations/007_oauth_callback_security.sql`
- Modify: `backend/tests/database.test.ts`
- Create: `backend/tests/oauthExchange.test.ts`
- Create: `backend/src/services/oauth/oauthState.ts`
- Create: `backend/src/services/oauth/oauthExchange.ts`

- [x] **Step 1: Write failing migration and service tests**

Cover the two new tables, raw-value absence, 32-byte base64url entropy, 60-second callback TTL, successful consume, invalid code, expired code, replay, and two concurrent consumes producing exactly one success.

```ts
const code = await issueOAuthCallbackCode({ kind: 'SESSION', userId: 'user-1' }, now);
expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
expect(await db.get('SELECT code_hash FROM oauth_callback_codes WHERE code_hash = ?', code))
  .toBeUndefined();
await expect(consumeOAuthCallbackCode(code, now + 1)).resolves.toEqual({
  kind: 'SESSION',
  userId: 'user-1',
});
await expect(consumeOAuthCallbackCode(code, now + 2)).rejects.toMatchObject({
  code: 'INVALID_OAUTH_CODE',
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --runInBand tests/oauthExchange.test.ts tests/database.test.ts` from `backend`.

Expected: FAIL because migration 007 and the OAuth state/exchange services do not exist.

- [x] **Step 3: Add the migration**

```sql
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0
  CHECK(email_verified IN (0, 1));
ALTER TABLE users ADD COLUMN email_verification_source TEXT
  CHECK(email_verification_source IN ('GOOGLE', 'INTERNAL'));

CREATE TABLE oauth_authorization_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE', 'FACEBOOK')),
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'LINK')),
  user_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK((purpose = 'LOGIN' AND user_id IS NULL) OR (purpose = 'LINK' AND user_id IS NOT NULL))
);

CREATE TABLE oauth_callback_codes (
  code_hash TEXT PRIMARY KEY,
  result_kind TEXT NOT NULL CHECK(result_kind IN ('SESSION', 'ERROR')),
  user_id TEXT,
  error_code TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(
    (result_kind = 'SESSION' AND user_id IS NOT NULL AND error_code IS NULL) OR
    (result_kind = 'ERROR' AND user_id IS NULL AND error_code IS NOT NULL)
  )
);
```

- [x] **Step 4: Implement hash-only issuance and atomic consume**

Use `randomBytes(32).toString('base64url')`, `createHash('sha256')`, and a single `DELETE ... RETURNING` statement for consume. Sign no JWT inside the consume transaction and never include the raw state/code in an error or log.

```ts
const row = await db.get<StoredCallbackResult>(
  `DELETE FROM oauth_callback_codes
   WHERE code_hash = ? AND expires_at > ?
   RETURNING result_kind, user_id, error_code`,
  hashOpaqueValue(code),
  now,
);
```

- [x] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- --runInBand tests/oauthExchange.test.ts tests/database.test.ts` from `backend`.

Expected: PASS including concurrent single-consume coverage.

Evidence: initial RED was `10 failed, 16 passed` because the migration/tables/services were absent. The safe-error allowlist review added a second RED of `2 failed, 7 passed`. Final focused GREEN is `28/28` and the backend TypeScript build passes.

### Task 2: Enforce trusted email and authenticated provider linking

**Files:**
- Modify: `backend/src/repositories/authRepository.ts`
- Modify: `backend/tests/googleOAuth.test.ts`
- Modify: `backend/tests/facebookOAuth.test.ts`

- [x] **Step 1: Write failing repository tests**

Add cases for provider-ID-first login, verified Google linking to an already verified email, missing/false Google verification rejection, Facebook collision rejection with no identity/JWT, new unique Facebook user creation without fake email/profile, authenticated explicit link, and cross-user identity conflicts.

```ts
await expect(repository.resolveOAuthUser({
  provider: 'FACEBOOK',
  providerSub: 'facebook-sub',
  email: 'existing@example.com',
  emailVerified: false,
})).rejects.toMatchObject({ code: 'OAUTH_EMAIL_LINK_REQUIRED' });
expect(await db.get(
  'SELECT user_id FROM user_oauth_identities WHERE provider = ? AND provider_sub = ?',
  'FACEBOOK',
  'facebook-sub',
)).toBeUndefined();
```

- [x] **Step 2: Run repository tests and verify RED**

Run: `npm test -- --runInBand tests/googleOAuth.test.ts tests/facebookOAuth.test.ts` from `backend`.

Expected: FAIL because current `upsertOAuthUser` auto-links any matching email and immediately returns a JWT.

- [x] **Step 3: Implement identity resolution and explicit linking**

Replace the positional `upsertOAuthUser` API with object input returning only `userId`. Check `(provider, provider_sub)` first. Auto-link by email only when the incoming email is verified and the existing user email is already marked verified. Add `linkOAuthIdentityToAuthenticatedUser` that accepts a target user ID obtained from `requireAuth`, never from provider email.

```ts
export interface OAuthIdentityInput {
  provider: 'GOOGLE' | 'FACEBOOK';
  providerSub: string;
  email: string;
  emailVerified: boolean;
}

export async function resolveOAuthUser(input: OAuthIdentityInput): Promise<{ userId: string }>;
export async function linkOAuthIdentityToAuthenticatedUser(
  userId: string,
  input: Omit<OAuthIdentityInput, 'emailVerified'>,
): Promise<{ userId: string }>;
export async function createSessionForUser(userId: string): Promise<{ userId: string; token: string }>;
```

- [x] **Step 4: Run repository tests and verify GREEN**

Run: `npm test -- --runInBand tests/googleOAuth.test.ts tests/facebookOAuth.test.ts` from `backend`.

Expected: PASS with no email-only Facebook link and no token minted by provider callback resolution.

Evidence: initial repository RED was `14 failed, 14 passed`; follow-up RED cycles covered raw identity conflicts, legacy-only conflicts, malformed identity input, required trust typing, and provider-ID-first regression. Final focused GREEN is `43/43`, followed by PASS spec and quality reviews.

### Task 3: Move both callbacks to opaque code exchange

**Files:**
- Modify: `backend/src/services/oauth/googleOAuth.ts`
- Modify: `backend/src/services/oauth/facebookOAuth.ts`
- Modify: `backend/src/controllers/authController.ts`
- Modify: `backend/src/routes/authRoutes.ts`
- Modify: `backend/src/schemas/index.ts`
- Create: `backend/tests/oauthCallback.test.ts`

- [x] **Step 1: Write failing callback tests**

Test successful Google and Facebook callbacks, error callbacks, POST exchange, link-start state, and final callback URLs. Parse the redirect and assert the only query key is `code`; reject `token`, `jwt`, `access_token`, `refresh_token`, `userId`, email, and fragments.

```ts
const redirect = new URL(capturedRedirect);
expect(redirect.pathname).toBe('/oauth/callback');
expect([...redirect.searchParams.keys()]).toEqual(['code']);
expect(redirect.hash).toBe('');
```

- [x] **Step 2: Run callback tests and verify RED**

Run: `npm test -- --runInBand tests/oauthCallback.test.ts tests/googleOAuth.test.ts tests/facebookOAuth.test.ts` from `backend`.

Expected: FAIL because callbacks currently redirect with `token` and `userId`, state is a JWT, and no exchange/link-start routes exist.

- [x] **Step 3: Implement async opaque state, callback result codes, exchange, and link starts**

Add strict Zod validation for a 43-character base64url callback code. Add `POST /api/auth/oauth/exchange`, `POST /api/auth/google/link`, and `POST /api/auth/facebook/link`. Link-start routes require `requireAuth`, store the authenticated `userId` in the hashed state row, and return a provider authorization URL. Callback errors are mapped to safe server-side error codes and still redirect with only an opaque callback code.

- [x] **Step 4: Run callback tests and verify GREEN**

Run: `npm test -- --runInBand tests/oauthCallback.test.ts tests/oauthExchange.test.ts tests/googleOAuth.test.ts tests/facebookOAuth.test.ts` from `backend`.

Expected: PASS; no application/provider token or PII appears in a backend-to-frontend callback URL.

Evidence: initial controller RED was `21 failed, 42 passed`. Security review drove additional RED cycles for public-start retention, rate limiting, cache/referrer headers, callback error-code eviction, and transferable cross-browser state/code. Browser binding work recorded migration RED (`3` failures), service RED (`13` failures), controller/cookie RED (`12` failures), and CORS RED before GREEN. State and callback codes now require the same HttpOnly correlation cookie hash; the final backend checkpoint is recorded under Task 6.

### Task 4: Synchronize physical contracts and OpenAPI

**Files:**
- Create: `contracts/json/oauth_session.schema.json`
- Create: `contracts/examples/oauth_session.example.json`
- Create: `contracts/json/oauth_authorization.schema.json`
- Create: `contracts/examples/oauth_authorization.example.json`
- Modify: `contracts/manifest.json`
- Modify: `contracts/openapi.json`
- Modify: `backend/tests/contract.test.ts`

- [x] **Step 1: Write failing contract synchronization tests**

Require both physical contracts and examples in the manifest, validate them with AJV, and validate the examples against matching OpenAPI components. Assert `/auth/oauth/exchange`, `/auth/google/link`, and `/auth/facebook/link` use those components.

- [x] **Step 2: Run contract tests and verify RED**

Run: `npm run test:contract` from `backend`.

Expected: FAIL because the new API contracts and paths are absent.

- [x] **Step 3: Add strict schemas, synthetic examples, and OpenAPI paths**

Use `additionalProperties:false`. The session example uses a clearly synthetic non-JWT value such as `synthetic-session-token`; no real credential or JWT-shaped string may be added.

- [x] **Step 4: Run contract tests and verify GREEN**

Run: `npm run test:contract` from `backend`.

Expected: PASS with physical schema, example, OpenAPI, runtime validator, backend response, and frontend type names synchronized.

Evidence: initial contract RED was `5 failed, 19 passed`; review-driven RED cycles covered provider redirect targets, callback destination/state, error/security documentation, session-token constraints, manifest identity, and real Zod validation details. Final GREEN is `27/27`; backend build plus spec and quality reviews pass.

### Task 5: Exchange the code in the frontend and expose authenticated linking

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/pages/OAuthCallback.tsx`
- Modify: `frontend/src/pages/OAuthCallback.test.tsx`
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Create: `frontend/src/pages/ProfilePage.test.tsx`

- [x] **Step 1: Write failing frontend tests**

Test successful POST exchange, exactly-once exchange on render, session storage, dashboard navigation, missing code, failed exchange, refusal to consume legacy `token` query input, and the authenticated Facebook link button redirecting to the authorization URL returned by the backend.

- [x] **Step 2: Run frontend tests and verify RED**

Run: `npm test -- --run` from `frontend`.

Expected: FAIL because the current page reads and stores a JWT directly from the query string.

- [x] **Step 3: Implement frontend code exchange and link start**

Add `exchangeOAuthCode(code)` and `startOAuthLink(provider)`. Add `completeOAuth(code)` to `AuthContext`, store the response token centrally, refresh `/me`, and navigate with `replace:true`. Guard the callback effect so React rerenders cannot exchange the same code twice. The profile link control must call the authenticated POST start endpoint before navigating to the provider.

- [x] **Step 4: Run frontend tests and verify GREEN**

Run: `npm test -- --run` from `frontend`.

Expected: PASS; no frontend code reads an application token from URL query or fragment.

Evidence: initial focused RED was `7/7` failures because the callback still consumed a URL token and provider linking was absent. Review hardening added RED cycles for StrictMode duplicate `/me` refreshes and stale-session cleanup (`3/3` failed), callback code replacement (`2` failures), hostile provider authorization responses (`9` failures), shared OAuth/password-auth operation races (`3` failures), and credentialed cookie transport (`1` failure). Focused suites and production build are GREEN; final full counts are recorded under Task 6.

### Task 6: Full verification, real OAuth regressions, documentation, and delivery

**Files:**
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/FEATURE_INDEX.md`
- Modify: `docs/TEST_PLAN.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/features/google_oauth.md`
- Modify: `docs/features/facebook_oauth.md`

- [ ] **Step 1: Run all automated verification**

Run backend Jest, backend build, frontend Vitest, frontend lint, frontend production build, `git diff --check`, `.env` ignore checks, and a diff/history secret scan for JWTs, provider tokens, credentials, and `.env` content.

- [ ] **Step 2: Run real Google OAuth regression**

Start backend/frontend, use the real Google flow, verify provider callback, frontend URL contains only the opaque code before exchange, session exchange succeeds, replay is rejected, `/me` succeeds, and dashboard/profile redirect is correct.

- [ ] **Step 3: Run real Facebook tester OAuth**

Use tester Pham Binh. Pause only for the user's Facebook login/Continue action. Verify Graph identity/email permission/profile, callback, single-use exchange, user creation/identity, JWT/session body delivery, and dashboard/profile redirect without exposing sensitive values.

- [ ] **Step 4: Perform final security review and update docs**

Review the complete diff for token-in-URL, raw code storage, race/replay behavior, email trust bypasses, secret leakage, and missing negative tests. Mark Facebook DONE only if both blockers and both real provider E2E flows pass.

- [ ] **Step 5: Commit, push, and monitor CI**

Stage only valid project files, confirm `backend/.env` is absent, commit without amending, push without force, and monitor GitHub Actions. Fix and repeat verification if CI fails.
