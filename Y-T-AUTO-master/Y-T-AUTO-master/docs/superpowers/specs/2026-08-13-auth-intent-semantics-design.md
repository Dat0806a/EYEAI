# Explicit Auth Intent Semantics Design

## Scope

This milestone separates authentication into three non-interchangeable purposes for Google, Facebook, and phone OTP:

- `LOGIN`: authenticate an identity that already belongs to a user.
- `REGISTER`: create one new user for a previously unused identity.
- `LINK`: attach a verified identity to the currently authenticated user.

Email/password registration and login keep their existing behavior. The existing OAuth security controls, phone OTP lifecycle, Twilio adapter, and eSMS adapter remain in place. No live SMS is sent during this milestone.

## Public Flow Boundaries

Public Google and Facebook authorization starts use the existing provider routes with a required explicit query parameter:

- `GET /api/auth/google?intent=LOGIN|REGISTER`
- `GET /api/auth/facebook?intent=LOGIN|REGISTER`

Authenticated provider linking keeps the existing POST link endpoints and always issues `LINK` state. Missing or invalid public intent fails closed.

Phone uses separate route handlers and persisted challenge purposes:

- Existing login request/verify endpoints issue and consume only `LOGIN` challenges.
- New `/api/auth/phone/register/request` and `/api/auth/phone/register/verify` endpoints issue and consume only `REGISTER` challenges.
- Existing authenticated link endpoints issue and consume only `LINK` challenges.

OTP request responses stay account-independent. Account resolution happens only after a valid OTP proves phone possession.

## OAuth Purpose Binding

OAuth authorization state stores `LOGIN`, `REGISTER`, or `LINK`, remains opaque, browser-bound, one-time, and TTL-limited. Provider callbacks branch only on the consumed state purpose.

The opaque callback code also stores the state purpose. The browser callback URL contains the non-secret purpose and opaque code. The frontend submits both to the exchange endpoint, and the backend consumes the code once before comparing the expected purpose. A mismatch returns `INVALID_OAUTH_CODE` and cannot be replayed with another purpose.

Errors produced after a valid state is consumed are stored with the same purpose. An invalid state for which no trusted purpose can be recovered returns a safe, non-session callback error without inventing an intent.

## Account Resolution

OAuth repository operations are split by purpose:

- Login looks up only the provider identity (including a safe legacy identity fallback). Unknown identity returns `REGISTRATION_REQUIRED`; it never checks email to select a user, creates a user, or links an identity.
- Registration rejects an existing provider identity with `LOGIN_REQUIRED`. It validates the provider email rules, rejects any existing email account with `LOGIN_REQUIRED`, then creates one user and one provider identity in one transaction.
- Link keeps the authenticated target user fixed. An identity owned by another user, a different identity for the same provider, or ambiguous legacy ownership returns a conflict. Email is never used to choose a link target.

Legacy provider lookup must reject multiple owners rather than selecting an arbitrary row.

Phone repository operations follow the same split:

- Login returns the existing phone owner or `REGISTRATION_REQUIRED`; it never creates a placeholder account.
- Registration returns `LOGIN_REQUIRED` for an existing phone. Otherwise it creates one user with `email_is_placeholder = 1`, a reserved `@phone-auth.invalid` email, and one verified phone identity.
- Link remains fixed to the authenticated user and rejects cross-user ownership or a second phone.

SQLite `BEGIN IMMEDIATE`, file-level writer serialization, and existing unique constraints protect concurrent creation. The second concurrent registration observes the first committed identity and returns `LOGIN_REQUIRED` without creating a duplicate.

## OTP Consumption and Semantic Errors

A correct OTP is consumed inside the same transaction as account resolution. Expected post-proof outcomes (`REGISTRATION_REQUIRED`, `LOGIN_REQUIRED`, and link conflict) are returned as tagged outcomes from repository code so the transaction commits the consumed challenge. The service throws the public error only after commit. This prevents replay after a valid OTP reveals an intent/account mismatch.

Unexpected database or session-signing failures still throw inside the transaction and roll back, preserving the existing all-or-nothing behavior.

## Frontend

`/register` presents Google, Facebook, phone, and email/password registration. Social controls use `REGISTER`, and the phone flow uses `mode="register"`. `/login` keeps all four login methods and sends explicit `LOGIN` intent.

`PhoneOtpFlow` supports `login`, `register`, and `link` through an exhaustive dispatcher. After verified ownership:

- `REGISTRATION_REQUIRED` shows Vietnamese guidance and a `/register` call to action.
- `LOGIN_REQUIRED` shows Vietnamese guidance and a `/login` call to action.
- Link conflicts remain on the profile flow.

The OAuth callback validates the URL intent, submits it during exchange, checks the server-returned intent, and routes registration to profile onboarding, login to the authenticated destination, and link back to profile.

## Contracts and Migration

Migration `010_auth_intents.sql` rebuilds only ephemeral OAuth state/callback and phone challenge tables with `REGISTER` support, adds callback-code purpose binding, and recreates all constraints and indexes. Existing users, OAuth identities, phone identities, and rate-limit records are preserved. Pending OAuth/OTP challenges are intentionally invalidated at deployment because they cannot be upgraded safely without changing their trusted purpose contract.

The OAuth session JSON Schema, synthetic example, TypeScript type, runtime validator, OpenAPI request/response, and frontend consumer all add the explicit intent. OpenAPI also documents the phone registration endpoints and safe post-proof errors.

## Security Invariants

- No account existence signal is returned by phone OTP request.
- No OAuth or phone login creates a user.
- No registration links or merges into an existing account.
- No link operation selects a target by email.
- State, callback code, and OTP challenge remain opaque, browser-bound, TTL-limited, single-use, and purpose-bound.
- Valid OTP semantic failures consume the challenge before returning guidance.
- Unique constraints and transactions prevent duplicate users and identities under races.
- Placeholder emails are created only by phone registration, remain hidden, and cannot authenticate with email/password.
- Provider tokens, JWTs, OTPs, secrets, and provider responses are not logged.

## Verification

Implementation follows RED-GREEN-REFACTOR. Focused account-resolution, purpose-isolation, controller, database, contract, and frontend tests run before the complete backend/frontend suites and production builds. Manual browser review covers `/register` and `/login` at desktop and mobile widths without requesting an OTP.
