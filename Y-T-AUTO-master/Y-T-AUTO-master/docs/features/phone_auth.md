# Feature: Phone OTP Authentication (F18)

## Description

Đăng ký, đăng nhập bằng OTP SMS và liên kết một số điện thoại đã xác minh với tài khoản hiện tại. Luồng dùng chung `users`, JWT, `/auth/me` và hồ sơ y tế hiện có; không tạo hệ thống tài khoản song song.

## Status

COMPLETE (P2) — implementation, contracts, backend/frontend tests, production build và browser QA đã hoàn tất. Twilio và eSMS đều có production adapter; live handset E2E pending external eSMS balance.

## User Experience

- Tùy chọn phone chỉ xuất hiện khi `/api/auth/providers` báo `phoneOtp=true`; email, Google và Facebook không thay đổi.
- UI tiếng Việt dùng chung `PhoneOtpFlow` với ba mode explicit `login|register|link`: nhập số, nhận challenge, nhập sáu chữ số, loading, gửi lại, đổi số và countdown từ timestamp/`Retry-After` của server.
- Login chỉ tra cứu identity hiện có; phone chưa đăng ký trả `REGISTRATION_REQUIRED` sau OTP proof và không tạo user. Register chỉ tạo identity mới; phone đã tồn tại trả `LOGIN_REQUIRED` và không duplicate.
- Login thành công đi qua AuthContext và `/auth/me`; user chưa có hồ sơ được chuyển thẳng tới `/profile`, user đã có hồ sơ tới `/dashboard`.
- Profile hiển thị `Đã xác minh`/`Chưa xác minh` và chỉ số đã che. Canonical E.164, challenge token, user ID và provider metadata không được hiển thị.
- Link dùng endpoint authenticated, refresh `/auth/me` sau thành công và xử lý an toàn identity conflict.

## Identity and Persistence

- `libphonenumber-js` nhận số Việt Nam quốc nội hoặc số quốc tế hợp lệ và lưu duy nhất canonical E.164.
- Migration `009_phone_auth.sql` thêm `user_phone_identities`, `phone_otp_challenges`, `phone_auth_rate_limits` và `users.email_is_placeholder`. Migration `005_otp.sql` vẫn là lịch sử bất biến và không còn là model thực thi chính.
- Mỗi user có tối đa một phone identity và mỗi E.164 thuộc tối đa một user.
- Chỉ phone `REGISTER` được tạo user với email ngẫu nhiên dưới `@phone-auth.invalid`, `email_is_placeholder=1` và không có mật khẩu đăng nhập công khai. `LOGIN` không bao giờ tạo placeholder. Không merge theo email/profile data.

## Challenge and Privacy

- Challenge token 32 byte và OTP sáu chữ số chỉ tồn tại plaintext đủ lâu để trả về browser/gửi provider; database chỉ lưu SHA-256 challenge/binding và HMAC-SHA256 OTP có domain separation.
- Cookie `yte_phone_binding` là HttpOnly, SameSite=Lax, path `/api/auth/phone`; mỗi request/resend thành công gia hạn cookie theo TTL challenge mới, và verify yêu cầu đúng browser binding, purpose (`LOGIN`/`REGISTER`/`LINK`) và target user.
- Request thành công trả `202` chỉ với `challengeToken`, `expiresAt`, `resendAvailableAt`. Không trả OTP, canonical phone, account existence, provider detail hoặc user ID.
- Unknown, replayed hoặc unbound challenge dùng lỗi generic invalid-or-expired. Mọi phone POST response, kể cả schema-validation failure, đặt `Cache-Control: no-store`; rate/cooldown có `Retry-After` khi server có thời điểm thử lại.

## Abuse Controls

- Send/phone: 1/phút, 5/giờ, 10/ngày.
- Send/IP: 5/phút, 30/giờ.
- Authenticated link send/user: 3/phút, 10/giờ.
- Verify/phone: 10/phút; verify/IP: 20/phút; tối đa 5 lần nhập sai/challenge.
- Bucket được lưu trong SQLite bằng HMAC identity, cập nhật transactionally, cleanup expired theo batch 250 và fail closed khi vượt hard capacity 50.000 rows.
- Send đã được admitted vẫn tiêu budget nếu provider thất bại; provider call không được retry mù khi kết quả mạng mơ hồ.

## SMS Provider and Configuration

Production hỗ trợ đúng hai lựa chọn:

- `OTP_SMS_PROVIDER=twilio`: cần `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` và đúng một trong `TWILIO_MESSAGING_SERVICE_SID` hoặc `TWILIO_FROM_NUMBER`.
- `OTP_SMS_PROVIDER=esms`: cần `ESMS_API_KEY` và `ESMS_SECRET_KEY`; `ESMS_REQUEST_TIMEOUT_MS` mặc định 10000 ms.
- Cả hai cần `OTP_HMAC_SECRET` tối thiểu 32 byte. `TWILIO_REQUEST_TIMEOUT_MS`/`ESMS_REQUEST_TIMEOUT_MS` phải trong 1-120.000 ms; `OTP_TTL_MINUTES=5`, `OTP_RESEND_COOLDOWN_SECONDS=60`, `OTP_MAX_ATTEMPTS=5`, với cooldown không dài hơn TTL và attempts trong khoảng 1-5.

Provider thiếu/sai cấu hình làm `phoneOtp=false` và trả `OTP_NOT_CONFIGURED`. Adapter che response/provider detail. Fake provider chỉ nằm trong test, được inject trực tiếp vào service và không thể chọn qua environment.

`EsmsSmsProvider` chỉ delivery OTP backend đã sinh, không dùng `AutoGenCode`. Adapter gửi một JSON POST tới `https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/` với số Việt Nam dạng quốc nội, `Brandname="Baotrixemay"`, `SmsType="2"`, `IsUnicode="0"` và nội dung chính xác `${CODE} la ma xac minh dang ky Baotrixemay cua ban`. `Sandbox` bị bỏ khỏi live request. Chỉ response có `CodeResult="100"` đúng [physical response contract](../../contracts/json/esms_send_response.schema.json) được coi là provider accepted; đây chưa phải bằng chứng handset delivery. Số ngoài Việt Nam fail an toàn khi chọn eSMS, trong khi Twilio vẫn nhận E.164 quốc tế.

## API and Contracts

- Public login: `POST /api/auth/phone/request`, `POST /api/auth/phone/verify`.
- Public registration: `POST /api/auth/phone/register/request`, `POST /api/auth/phone/register/verify`.
- Authenticated link/status: `POST /api/auth/phone/link/request`, `POST /api/auth/phone/link/verify`, `GET /api/auth/phone`.
- `/api/auth/me` bao gồm cùng `phone_account_status`; `/api/auth/providers` bao gồm boolean `phoneOtp`.
- Physical contracts và synthetic examples: `auth_session`, `phone_otp_challenge`, `phone_account_status`, `auth_me`, `auth_providers`; OpenAPI là nguồn API machine-readable đồng bộ.

## Operational Limits and Proof Gap

- SQLite là authoritative cho challenge và phone rate limit, nên nhiều process dùng chung đúng một database file chia sẻ state; các file database độc lập không chia sẻ budget. SQLite write serialization vẫn giới hạn throughput, không thay thế distributed store ở quy mô lớn.
- IP dùng `req.ip`/socket. Deployment sau reverse proxy phải cấu hình trusted proxy hops chính xác; không tin trực tiếp forwarded headers từ client.
- Automated tests chứng minh Twilio/eSMS request construction và toàn bộ lifecycle bằng fake provider/mock HTTP. Credential eSMS local được người dùng quản lý ngoài Git và không được test đọc/in/log; live SMS receipt cùng login/link handset vẫn là proof gap vận hành và không được giả lập hoặc tuyên bố PASS.

