# Phone Authentication Design

## Goal

Add production-ready Vietnamese phone-number authentication and verified phone linking to the existing single-user/JWT architecture without changing the completed Google, Facebook, or email/password flows.

## Current Architecture Constraints

- `users` is the only account table and currently requires unique non-null `email` and non-null `password_hash` values.
- JWT creation is centralized in `authRepository` and every candidate frontend session is verified through `/auth/me` before storage.
- SQLite writes use `BEGIN IMMEDIATE`, a five-second busy timeout, WAL mode, and same-file transaction serialization.
- Migration `005_otp.sql` is already applied history. It has only a phone, SHA-256 hash, expiry, and used flag, so it remains untouched and is superseded by a new migration.
- OAuth browser binding, callback exchange, account resolution, and provider code are not refactored by this milestone.

## Chosen Approach

### Phone Identity

Create `user_phone_identities` with one verified E.164 number per user and one user per E.164 number. A row represents a verified identity, so there is no redundant verified flag. The row stores `verified_at`, `created_at`, and `updated_at` timestamps.

Phone-only onboarding remains compatible with the required email column by creating a random reserved internal email under `@phone-auth.invalid`, setting `email_is_placeholder = 1`, storing `PHONE_ONLY_NO_PASSWORD`, and using legacy `auth_provider = 'PHONE'`. Public email registration and password login must reject or ignore reserved placeholder identities. No phone flow merges by email or profile data.

### Normalization

Use `libphonenumber-js` with default country `VN`. Accept Vietnamese national input and explicit international input, strip only presentation whitespace/hyphens through the library, and persist only the canonical E.164 result. Reject invalid numbering-plan values, extensions, letters, malformed plus signs, and excessive input length.

### Challenge and Browser Binding

Create `phone_otp_challenges` with a stored hash of a 32-byte opaque challenge token, a hash of an HttpOnly `yte_phone_binding` cookie, E.164 phone, purpose (`LOGIN` or `LINK`), optional target user, keyed OTP MAC, state, failed-attempt count, expiry, resend time, and lifecycle timestamps.

The plaintext challenge token is returned to the browser once. The plaintext OTP exists only long enough to call the SMS provider. Neither value is persisted or logged. Login and link endpoints are separate; a link challenge is bound to the authenticated user at request time and must be verified by that same user.

### OTP Cryptography

- Generate six digits with `crypto.randomInt(0, 1_000_000)` and left-pad with zeroes.
- Store HMAC-SHA256 using a dedicated `OTP_HMAC_SECRET`, domain-separated over the challenge hash, phone, and code.
- Compare fixed-length MACs with `timingSafeEqual`.
- Default TTL is five minutes, cooldown is sixty seconds, and the attempt ceiling is five.
- Successful verification is single-use; consumption or locking clears the stored MAC.

### Persistent Anti-Abuse Controls

Create `phone_auth_rate_limits`, keyed by domain-separated HMACs of phone, IP, or authenticated user identity. Buckets are fixed-window SQLite rows, updated inside `BEGIN IMMEDIATE`, opportunistically cleaned after expiry, and protected by a hard row ceiling. Capacity exhaustion fails closed.

Default budgets:

- Send per phone: one per sixty seconds, five per hour, ten per day.
- Send per IP: five per minute, thirty per hour.
- Send per authenticated user: three per minute, ten per hour.
- Verify per phone: ten per minute.
- Verify per IP: twenty per minute.
- Verify per challenge: five wrong attempts total.

Every admitted send consumes its budget even if the provider later fails. Responses include safe `Retry-After` semantics without revealing account ownership. IP identity uses Express `req.ip` or socket address, not untrusted forwarded header strings; proxy deployment limitations are documented.

### SMS Provider

Define a narrow injectable `SmsProvider.sendOtp({ toE164, code, expiresInSeconds })` interface. The production factory supports `OTP_SMS_PROVIDER=twilio` with Twilio credentials/sender or `OTP_SMS_PROVIDER=esms` with eSMS key/secret. Both adapters use bounded HTTPS calls, return no provider details to callers, and never log request bodies, secrets, codes, or message identifiers. eSMS is delivery-only and uses the backend-generated OTP with the fixed official Baotrixemay template; details are captured in the [eSMS design addendum](2026-08-13-esms-sms-provider-design.md).

Tests inject a fake provider directly or mock provider HTTP. The fake is not selectable by production environment configuration. Provider status is true only when every required phone-auth setting and every setting for the selected production adapter are valid.

### Request Lifecycle

1. Normalize and validate the phone.
2. Create or reuse the browser binding cookie.
3. Generate challenge token and OTP in memory.
4. In transaction A, clean expired state, enforce persistent budgets and cooldown, and insert a `PENDING_SEND` challenge.
5. Commit before the external provider call.
6. Send exactly once; ambiguous network failures are not blindly retried.
7. In transaction B, mark the new challenge `SENT` and invalidate older active challenges for the same phone/purpose/target, or mark it `SEND_FAILED` and clear its MAC.
8. Return a generic `202` challenge response only after successful provider delivery/finalization. Account existence is never queried during request.

### Verification Lifecycle

Verification runs within one `BEGIN IMMEDIATE` transaction:

1. Hash and resolve the challenge token, then verify browser binding, route purpose, and link target user.
2. Enforce persistent verify budgets.
3. Require `SENT`, unexpired, unconsumed state below the attempt ceiling.
4. Wrong OTP atomically increments the failure count; reaching the ceiling locks the challenge and clears the MAC.
5. Correct OTP conditionally consumes the challenge and clears the MAC.
6. Login purpose resolves the existing identity or creates one phone-only user plus identity. Link purpose inserts or confirms the authenticated user's identity and rejects ownership/alternate-phone ambiguity.
7. Create the existing JWT session inside the same transaction for login verification. A signing or account mutation failure rolls back consumption.

The SQLite write lock and conditional state transition guarantee that simultaneous verification attempts produce one success at most, including across separate connections to the same file.

## API

- `POST /api/auth/phone/request`: public login challenge request.
- `POST /api/auth/phone/verify`: public login verification returning the existing `{ userId, token }` session shape.
- `POST /api/auth/phone/link/request`: authenticated link challenge request.
- `POST /api/auth/phone/link/verify`: authenticated link verification returning phone account status.
- `GET /api/auth/phone`: authenticated phone account status.
- `GET /api/auth/me`: extends data with the same phone account status fields.

Request responses are `202` with only `challengeToken`, `expiresAt`, and `resendAvailableAt`. They never return OTP, canonical phone, provider metadata, user ID, or account-existence information. Unknown/unbound/replayed challenges use a generic invalid-or-expired error. A valid bound challenge may receive specific invalid, expired, attempts-exceeded, cooldown, rate-limit, delivery-unavailable, configuration, or identity-conflict errors.

## Contracts

Add strict physical JSON Schemas and valid synthetic examples for:

- `auth_session` (the shared JWT session shape used by email, OAuth, and phone; OAuth remains compatible),
- `phone_otp_challenge`,
- `phone_account_status`.

Register them in `contracts/manifest.json`, mirror them in OpenAPI, keep Zod schemas, TypeScript types, frontend guards, and consumers synchronized, and extend contract tests to reject extra properties and sensitive fields.

## Frontend

Create one reusable Vietnamese `PhoneOtpFlow` component with login and link modes:

- Phone entry, OTP entry, loading, invalid/expired/locked/rate-limited/provider error states.
- Resend countdown from the server timestamp, resend action, and change-number action.
- Login mode hands the verified session to a new AuthContext method that uses the existing operation generation and `/auth/me` candidate-session validation path.
- Link mode uses authenticated endpoints and refreshes `/auth/me` after success.
- Login keeps email/password, Google, and Facebook controls intact.
- Profile shows verified/unverified status and a masked phone value, never an internal account ID.

Successful phone login routes to `/profile` when no profile exists and `/dashboard` otherwise.

## Security and Privacy Review Focus

- Brute force: five challenge attempts plus persistent phone/IP verify budgets.
- Replay and races: atomic single-use transaction and state transition.
- Enumeration: generic request semantics and no account lookup before successful proof of phone control.
- Linking confusion: purpose and target user are persisted server-side and checked at verify time.
- Canonical collisions: one normalization library plus unique E.164 database constraint.
- SMS bombing: cooldown, multi-window persistent budgets, provider failures counted.
- Challenge fixation/theft: high-entropy token plus browser-bound HttpOnly cookie.
- Secrets/logs: no OTP, HMAC/JWT/provider secrets, provider response, challenge token, or JWT logging.
- Multi-instance behavior: SQLite is authoritative for challenge and rate-limit state; process memory is not used for phone abuse controls.

## Verification

Follow strict RED-GREEN-REFACTOR for normalization, cryptography, migration, challenge lifecycle, provider behavior, repository/account resolution, controllers/routes, contracts, AuthContext, and UI. Run focused phone tests, existing auth/OAuth regression, database and contract suites, all backend/frontend tests, production builds, lint command, `git diff --check`, real-browser desktop/mobile QA, and a final manual engineering/security review before reporting readiness.
