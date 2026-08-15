# Test Plan — Y tế cho người bình thường

Tài liệu này mô tả các lớp kiểm thử bắt buộc, các command chuẩn và evidence gần nhất của hệ thống.

## 1. Testing Levels

### 1.1. Contract Tests — bắt buộc
- Mỗi structured AI/API output phải có JSON Schema vật lý và synthetic example hợp lệ.
- Manifest, JSON Schema, examples, OpenAPI, backend types/runtime validators và frontend consumers phải đồng bộ.
- Phạm vi hiện tại gồm OCR, confirm, analysis, meal/exercise plans, Gemini meal/exercise drafts, chatbot, history list, report detail, OAuth, shared auth session, phone OTP challenge, phone account status, `/auth/me` và provider-status responses.
- Command: `cd backend && npm run test:contract`.
- Evidence 2026-08-13: 40/40 PASS; 17 schema/example pairs hợp lệ, bao gồm shared auth session và phone-auth contracts.

### 1.2. Backend Unit/Integration Tests
- Tuổi, OCR normalization, rule-based/Gemini provider isolation, strict draft validation và lab narrative xác định không gọi Gemini text boundary.
- Exact verified YouTube/Wikimedia catalogs; không gọi network trong Jest.
- Migration discovery/ledger/rollback, migration 003 narrative columns, legacy normalization, unique plan constraints và temp cleanup.
- Controller persistence atomicity/idempotency, exact narrative round-trip sau reopen, legacy read-only fallback, empty-result neutral summary, duplicate occurrence alignment, same-report last-commit-wins và snapshot-consistent report detail.
- External verifier lifecycle: sequential requests, bounded retry/timeout, response cleanup, metadata mismatch và MIME checks.
- OAuth security: hash-only authorization state/callback code, browser-binding hash, 60-second callback TTL, explicit `LOGIN|REGISTER|LINK`, cross-purpose rejection, successful exchange, invalid/expired/replay rejection, concurrent consume chỉ một lần thành công, callback URL code+intent only, Google verified-email trust, Facebook no-email-auto-link, authenticated LINK principal/IP rate limits và fail-closed purpose/provider/user capacity isolation.
- Phone normalization/crypto: Vietnamese national + international E.164, invalid syntax/extensions, six-digit generation including leading zero, domain-separated HMAC and timing-safe verification.
- Phone persistence/lifecycle: migrations 009/010 constraints, browser/purpose/target binding, request/send finalization, invalid/expired/replay/locking/concurrent verify, login unknown creates nothing, register unknown creates one placeholder user, register existing returns login guidance, identity conflicts, authenticated linking and rollback.
- Phone abuse/provider: all phone/IP/user fixed-window budgets, cooldown, cleanup batch, 50.000-row fail-closed capacity, provider-failure accounting; exact Twilio URL/form/Basic auth; exact eSMS endpoint/JSON/phone/template/Brandname/SmsType/CodeResult; bounded timeout, one-send/no-retry and sanitized failures for both adapters.
- Phone controller/contracts: strict request bodies, public vs authenticated routes, `202`, `Cache-Control: no-store` including schema-validation failures, `Retry-After`, no sensitive fields and `/auth/me`/provider status synchronization.
- Phone startup configuration: reject attempts outside 1-5, resend cooldown longer than the OTP TTL, selected-provider timeout outside 1-120.000 ms, partial Twilio config and partial eSMS key/secret before accepting traffic.
- Command: `cd backend && npm test`.
- Targeted medical-safety command: `cd backend && npm test -- --runTestsByPath tests/geminiProvider.test.ts tests/aiProvider.test.ts tests/contract.test.ts`.
- Targeted migration/history command: `cd backend && npm test -- --runInBand tests/database.test.ts tests/analysisPersistence.test.ts tests/contract.test.ts`.
- Evidence 2026-08-13 sau OAuth state isolation fix: 18 suites / 266 tests PASS; production TypeScript build PASS.

### 1.3. Frontend Component Tests
- `VerifiedMedia` meal: lazy image, alt, author/license/source, incomplete tuple guard, error fallback và reset khi URL đổi.
- `VerifiedMedia` exercise: exact verified flag/source/full provenance guard, title/author/link và external-link safety.
- `AnalysisPage` direct-load: render `/analysis/:reportId` không có navigation state, mock tại API boundary và xác nhận stored summary cùng từng stored explanation hiển thị chính xác.
- `ChatWidget` voice: mic transcript vi-VN điền vào input, nút "Đọc câu trả lời" gọi `speechSynthesis`, và nút mic bị disable khi Web Speech API không khả dụng.
- `voice` utility: support detection, Vietnamese recognition wiring, permission error mapping và TTS cancellation.
- Environment: Vitest 4.1.10 + jsdom 29.0.0 + Testing Library.
- Command: `cd frontend && npm test -- --run`.
- Targeted command: `cd frontend && npm test -- --run src/pages/AnalysisPage.test.tsx`.
- OAuth frontend tests gồm explicit exchange intent, missing/invalid intent rejection, LOGIN/REGISTER/LINK routing, post-proof safe guidance, POST exchange exactly once, legacy token/JWT URL rejection, code-switch latest-wins, stale `/me` isolation, shared operation epoch, candidate session validation trước storage, credentialed cookie requests và strict provider authorization URL validation.
- Auth UI tests bắt buộc `/register` có Google/Facebook/phone/email và `/login` có email/Google/Facebook/phone; social links mang đúng uppercase intent và `PhoneOtpFlow` dispatch đúng ba mode.
- Evidence 2026-08-13: 9 files / 56 tests PASS; production TypeScript + Vite build PASS. Lint command exit `0` nhưng repository vẫn chưa có lint configuration thực.

- `OAuthCallback`: chỉ đọc opaque `code`, POST exchange bằng browser credentials, xác minh `/me`, lưu session từ response body và dùng replace navigation; không đọc token/JWT/userId từ URL.
- `voice` utility: support detection, Vietnamese recognition wiring, permission error mapping và TTS cancellation.

### 1.4. Explicit External Media Verification
- Command: `cd backend && npm run verify:media`.
- YouTube: oEmbed title/author phải khớp catalog.
- Wikimedia: API metadata, canonical direct URL, author/license, HTTP success và `image/*` MIME phải hợp lệ.
- Evidence 2026-08-09: 3 YouTube + 6 Wikimedia = 9/9 PASS.
- Command này không chạy trong GitHub Actions vì phụ thuộc mạng ngoài; CI chỉ dùng deterministic offline tests/build.

- Facebook OAuth helpers: config detection, authorization URL, code exchange, userinfo validation và signed state round-trip.
- OTP helpers: generate numeric codes, SHA-256 hash và expiry calculation.

- LoginPage: ẩn/hiện nút provider theo `/api/auth/providers` và hiển thị an toàn `oauth_error` khi backend trả người dùng về `/login`.

### 1.5. Real OAuth Browser Verification
- Google OAuth functional flow trước hardening: real authorization, callback, user login/link, JWT session và dashboard redirect PASS. Phải regression lại browser-bound one-time exchange trong checkpoint hiện tại.
- Facebook OAuth tester flow 2026-08-11: real login/consent PASS; `/me/permissions` có `email=granted`; `/me?fields=id,name,email` trả đủ trường; callback tạo Facebook user/identity; session còn hợp lệ sau reload.
- Facebook callback đi qua `/oauth/callback` và `/dashboard`; user mới chưa có medical profile được chuyển sang `/profile` onboarding, không tạo ngày sinh/giới tính giả.
- Missing-email regression: khi Meta grant permission nhưng không trả email, backend dừng trước user/JWT creation và frontend hiển thị thông báo an toàn.
- Không đọc hoặc lưu App Secret, provider access token, OAuth code, one-time callback code hay application JWT trong evidence/log.
- Current hardened regression phải xác nhận callback URL không chứa JWT/token/PII, exchange thành công đúng browser, replay bị từ chối, `/me` PASS và dashboard/profile redirect PASS cho cả Google lẫn Facebook tester Phạm Bình.
- Public non-role flow chưa thuộc evidence này; phải retest sau Meta App Review/Advanced Access và khi app chuyển Live Mode.

### 1.6. Build, Install and CI Gates
- Backend: `npm ci`, dependency graph check, tests, contract tests và `npm run build`.
- Frontend: `npm ci`, `npm test -- --run` và `npm run build`.
- Evidence frontend 2026-08-09: production build PASS, 1670 modules transformed.
- Workflow order: frontend install → frontend tests → frontend build, tất cả dùng `working-directory: frontend`.
- Không dùng `|| true`, `continue-on-error`, skip tests hoặc network verifier trong CI.

### 1.7. Browser and Mobile QA
- Desktop Chrome viewport 1280x900 và mobile viewport 390x844.
- Kiểm tra page identity, non-blank DOM, framework overlay, console, interactions, live images, fallback, external-link attributes, stored summary/explanation sau history navigation và direct reload, cùng horizontal overflow.
- Dùng in-app Browser không extension để xác nhận console ứng dụng sạch khi Chrome có log nhiễu từ extension người dùng.
- Stored narrative browser QA chưa chạy trong targeted frontend regression này; automated direct-load test là evidence hiện tại.

## 2. Core Workflow Result — 2026-08-09

QA chạy trên isolated temporary SQLite database với `DEV_FALLBACK`; không chạm database người dùng và OCR output vẫn đi qua màn Review/Xác nhận trước phân tích.

| Bước | Hành động | Kết quả | Trạng thái |
|------|-----------|---------|------------|
| 1 | Đăng ký tài khoản QA cục bộ | Tạo tài khoản và chuyển đến Profile | PASS |
| 2 | Lưu hồ sơ người dùng 76 tuổi | Lưu họ tên/ngày sinh/giới tính và về Dashboard | PASS |
| 3 | Chạy mẫu OCR development | Backend normalizer trả 5 chỉ số | PASS |
| 4 | Review OCR | Hiển thị đủ 5 dòng, confidence và reference ranges | PASS |
| 5 | Xác nhận kết quả | Tạo analysis/meal/exercise và persist transactionally | PASS |
| 6 | Xem phân tích | LOW/NORMAL/HIGH, summary và cảnh báo y tế hiển thị đúng | PASS |
| 7 | Xem Thực đơn/Bài tập | 5 verified meal figures và 2 verified video links | PASS |
| 8 | Lịch sử + direct reload | Media provenance vẫn còn sau navigation/reload | PASS |
| 9 | Chatbot context flow | Không retest trong P1 verified-media QA này | NOT RUN |

## 3. Verified-Media Browser Evidence
- 5/5 meal images tải thật sau lazy scroll; mỗi ảnh có alt, author, license và source link `target="_blank"`/`noopener noreferrer`.
- CDP chặn có chủ đích ảnh đầu tiên: fallback accessible xuất hiện, attribution/source vẫn còn; network block được gỡ sau test.
- 2/2 verified video links hiển thị exact title/author, gồm chair yoga cho người dùng 60+.
- History navigation và direct reload giữ 5 figures, 5 source links và 2 video links.
- Không có horizontal overflow ở desktop hoặc mobile.
- Chrome có log do AdBlock/Monica extension; in-app Browser sạch ghi nhận 0 app warnings/errors.
- Backend/frontend runtime logs không có error.

## 4. Release Checklist
- `npm ci` PASS ở backend và frontend.
- Backend full tests, contract tests, build, audit và external verifier PASS.
- Frontend tests, build và audit PASS.
- Workflow YAML parse PASS; `git diff --check` PASS.
- Browser desktop/mobile/history/fallback/console QA PASS.
- Commit không chứa `.env`, token, cookie, QA database, upload hoặc screenshot tạm.
- Push non-force và theo dõi GitHub Actions đến `completed / success`.

## 5. Phone OTP Frontend and Operational Verification

- Focused frontend suites phải cover provider gating, Vietnamese phone/OTP steps, loading, invalid/expired/attempts-exceeded/provider/identity-conflict states, server timestamp countdown, `Retry-After` cho request/verify/resend, change-number, direct profile/dashboard redirect, authenticated link + `/auth/me` refresh, masked-only status và OAuth controls không đổi.
- Chạy: `cd frontend && npm test -- --run src/components/PhoneOtpFlow.test.tsx src/context/AuthContext.test.tsx src/pages/LoginPage.test.tsx src/pages/ProfilePage.test.tsx src/pages/OAuthCallback.test.tsx src/services/api.test.ts`.
- Production acceptance cần browser desktop/mobile không overflow và console không có app error. Provider-gated phone UI phải ẩn khi config thiếu.
- Automated test fake phải được inject trực tiếp; không thêm fake provider vào environment factory và không gọi network trong deterministic test.
- Proof gap hiện tại: Twilio Trial không đáp ứng live E2E mong muốn; người dùng đã quản lý eSMS credential ngoài Git nhưng automated suite không đọc chúng và chưa gửi handset SMS. Chỉ đánh dấu live delivery PASS sau khi người dùng chọn `OTP_SMS_PROVIDER=esms`, restart backend, xác nhận `/api/auth/providers` vẫn có `phoneOtp=true`, gửi đúng một OTP tới số được phép và hoàn tất verify mà không lưu OTP/token/cookie/credential trong log hoặc screenshot.
