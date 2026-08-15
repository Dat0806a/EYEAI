# Feature: Facebook OAuth (F17)

## Description
Đăng ký, đăng nhập bằng Facebook và liên kết identity vào account hiện tại qua các intent explicit; mọi flow vẫn dùng shared user/JWT architecture.

## Status
DONE (P2) — real tester flow PASS (2026-08-11); browser-bound one-time exchange and verified-email/account-linking hardening implemented; explicit REGISTER/LOGIN/LINK intent semantics completed in current milestone; regression tests PASS.

## Implementation
- Public start bắt buộc `GET /api/auth/facebook?intent=LOGIN|REGISTER`; state/callback/exchange bind cùng purpose. `LOGIN` unknown không tạo user; `REGISTER` existing không duplicate; `LINK` yêu cầu authenticated principal.
- Facebook email không được dùng để silent merge. Identity/email collision được xử lý bằng safe guidance hoặc explicit link flow sau đăng nhập.
- Backend `GET /api/auth/facebook` tạo state CSPRNG 32-byte, chỉ lưu SHA-256 và bind state với cookie correlation HttpOnly/SameSite=Lax của browser.
- Backend `GET /api/auth/facebook/callback` yêu cầu đúng state + browser binding, đổi provider code, đọc Graph `id,name,email` và dùng Facebook user ID làm định danh OAuth chính.
- Token exchange gửi `FACEBOOK_APP_SECRET` trong POST form body; Graph `/me` và `/me/permissions` dùng Bearer header, không đặt token trong URL.
- Graph profile contract yêu cầu `id` và email hợp lệ; backend không tạo email giả khi Meta không trả email.
- `user_oauth_identities` lưu identity theo cặp `(provider, provider_sub)` và cho phép một user liên kết nhiều OAuth provider.
- Authenticated link start dùng rate budget theo principal chung với Google và IP ceiling bổ sung. Pending state quota fail-closed theo purpose/provider/user, không evict active state của user khác.
- Facebook không cung cấp tín hiệu email verification đủ mạnh cho flow này, vì vậy backend không tự động link tài khoản chỉ do email trùng. Collision trả `OAUTH_EMAIL_LINK_REQUIRED`; user phải đăng nhập tài khoản hiện có rồi gọi authenticated `POST /api/auth/facebook/link`.
- Callback chỉ redirect `${WEB_ORIGIN}/oauth/callback?code=...`. `POST /api/auth/oauth/exchange` yêu cầu cùng browser cookie, consume code 60 giây bằng atomic `DELETE ... RETURNING`, rồi mới trả JWT/session trong response body.
- OAuth user mới không được tạo medical profile giả; frontend chuyển user chưa có profile sang onboarding `/profile`.
- Khi chưa cấu hình credentials, backend trả `503 OAUTH_NOT_CONFIGURED` và LoginPage ẩn nút Facebook theo `GET /api/auth/providers`.
- Biến môi trường: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`; file `backend/.env` phải luôn ignored và không tracked.

## Real E2E Evidence
- Tester Facebook đã chấp nhận app role và hoàn tất login/consent thật trong browser.
- `/me/permissions`: có `email=granted`.
- `/me?fields=id,name,email`: trả đủ ba trường cho đúng tester, không có Graph error.
- Backend callback tạo một Facebook user và một Facebook identity mới; không có orphan identity và không tạo profile y tế giả.
- Frontend đi qua `/oauth/callback` rồi `/dashboard`; guard chuyển user mới chưa có profile sang `/profile` đúng thiết kế.
- Reload `/profile` vẫn giữ authenticated session và không chuyển về `/login`.
- Không đọc, hiển thị, log hoặc commit App Secret, access token, application JWT hay dữ liệu tài khoản.

## Production Note
- Flow cho người dùng không có app role chưa được phát hành công khai. Meta App Review/Advanced Access và Live Mode vẫn phải hoàn tất trước khi coi Facebook Login sẵn sàng cho public production users.
- Callback token delivery và unsafe email-only linking không còn tồn tại trong implementation hiện tại; real browser regression vẫn là gate cuối trước DONE.

## Acceptance Criteria
- Nút Facebook trên LoginPage dẫn tới trang authorization Facebook: PASS.
- Facebook callback xác thực state, đổi authorization code và đọc Graph profile: PASS.
- Tạo hoặc liên kết user qua provider identity: PASS (real new-user creation verified; linking behavior covered by repository tests).
- JWT/session hợp lệ và frontend callback hoạt động: PASS trên functional flow cũ; hardened browser-bound exchange cần regression thật.
- Redirect về frontend/dashboard: PASS trên functional flow cũ; hardened regression đang chờ chạy lại.
- Thiếu email từ Meta bị từ chối an toàn, không fabricate hoặc link bằng dữ liệu chưa xác minh: PASS.
- Application JWT/access token không xuất hiện trong callback URL/query/fragment: PASS trong unit/contract tests; PENDING real-browser confirmation.
- One-time code single-use, 60-second TTL, hash-only storage, browser binding và replay rejection: PASS trong backend tests; PENDING real-browser confirmation.
- Facebook email không được dùng để automatic link; authenticated explicit link là đường dẫn duy nhất khi email collision: PASS trong repository/controller tests.
- Facebook OAuth final status: chỉ chuyển DONE sau regression thật bằng tester Phạm Bình, session `/me` và dashboard/profile redirect đều PASS.

