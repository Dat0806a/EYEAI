# Feature: Google OAuth (F13)

## Description
Đăng ký, đăng nhập bằng tài khoản Google và liên kết identity với account đang đăng nhập bằng ba intent tách biệt.

## Status
DONE (P1) - real Google OAuth end-to-end flow verified on 2026-08-11; opaque callback exchange hardening implemented; explicit REGISTER/LOGIN/LINK intent semantics completed in current milestone; regression tests PASS.

## Implementation
- Public start bắt buộc `GET /api/auth/google?intent=LOGIN|REGISTER`; state, callback code và exchange `{code,intent}` cùng bind purpose. `LOGIN` unknown trả `REGISTRATION_REQUIRED`; `REGISTER` existing trả `LOGIN_REQUIRED`.
- Chỉ `REGISTER` identity mới tạo user/identity. `LOGIN` không auto-create và không tự link theo email; `LINK` vẫn yêu cầu JWT hiện tại và conflict nếu subject thuộc user khác.
- Backend `GET /api/auth/google` creates a 32-byte CSPRNG state, stores only its SHA-256 hash and binds it to an HttpOnly/SameSite=Lax browser correlation cookie before redirecting to Google.
- Backend `GET /api/auth/google/callback` requires the same browser binding, consumes state once, exchanges the authorization code and resolves identity by Google `sub`.
- Google email is trusted only when the provider returns `email_verified=true`. Unverified Google email cannot create or automatically link an application account.
- Existing-account linking uses authenticated `POST /api/auth/google/link`; provider email alone never selects the link target.
- Link start is rate-limited by authenticated principal with an IP ceiling. Pending states use fail-closed purpose/provider/user quotas and never evict another user's active OAuth state.
- Callback success and safe callback errors redirect to `${WEB_ORIGIN}/oauth/callback?code=...` with a 32-byte opaque code only. JWT, provider token, PII and user ID never appear in the callback URL.
- `POST /api/auth/oauth/exchange` requires the same browser cookie, atomically deletes the 60-second code and returns the application session in the response body. Invalid, expired, replayed or cross-browser codes are rejected identically.
- Unconfigured endpoints return `503 OAUTH_NOT_CONFIGURED` instead of starting a broken flow.
- Frontend `LoginPage` shows the Google button only when `GET /api/auth/providers` reports `google=true`.
- Frontend `/oauth/callback` reads only `code`, exchanges it once by POST with credentials, validates `/api/auth/me`, stores the returned application session and redirects with history replacement.
- Frontend ignores legacy `token`, `jwt` and `userId` URL values and prevents stale OAuth/password-auth responses from overwriting a newer session.
- Runtime variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `WEB_ORIGIN`.

## Real Verification Evidence
- All four runtime variables loaded from `backend/.env`; only presence and expected non-secret URL matches were inspected.
- `backend/.env` is ignored by Git and is not tracked.
- The login page rendered the Google button with no frontend console warnings or errors.
- Clicking the button reached `accounts.google.com` with the expected authorization endpoint, callback URI, scopes, prompt, and a non-empty state value.
- Google returned to the frontend OAuth callback after the backend callback handled the authorization response.
- The previously verified flow created a valid application session without exposing its value; the hardened code-only callback flow must be re-run before this checkpoint is closed.
- Authenticated `GET /api/auth/me` returned HTTP 200 and `success=true`.
- SQLite contained a recent Google identity with non-empty email and provider subject fields.
- The browser reached `http://localhost:5173/dashboard` with meaningful application content and no framework error overlay.
- Component and browser regression checks confirm `/login?oauth_error=...` renders the provider error without a console failure.

## Acceptance Criteria
- PASS: the Google button leads to the real Google account authorization screen.
- PASS: the backend callback exchanges the real authorization response.
- PASS: the application creates or links the Google user and issues an authenticated session.
- PASS: the browser returns to the frontend dashboard.
- PASS (automated): invalid provider responses are represented by safe one-time error codes and rendered provider-neutrally after POST exchange.
- PENDING CURRENT CHECKPOINT: repeat the real Google flow through browser-bound code exchange and verify replay rejection.

## Security Controls
- State and callback codes are CSPRNG values; only hashes are persisted.
- Authorization state and callback code are bound to the initiating browser correlation cookie.
- Callback code TTL is 60 seconds and consumption is atomic/single-use.
- Callback and exchange responses use `Cache-Control: no-store`; callback redirect uses `Referrer-Policy: no-referrer`.
- No secret, provider access token or application JWT is logged or placed in a callback URL.

