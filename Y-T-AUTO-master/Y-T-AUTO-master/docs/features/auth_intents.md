# Feature: Explicit Auth Intents (F19)

## Product Rule

`REGISTER != LOGIN != LINK`. Google, Facebook và Phone không được tự đoán mục đích từ route hay trạng thái account.

- `REGISTER`: chỉ dành cho người lần đầu sử dụng. Identity mới tạo đúng một shared `users` row; identity đã tồn tại trả `LOGIN_REQUIRED`, không duplicate và không merge ngầm.
- `LOGIN`: chỉ xác thực account đã tồn tại. Identity chưa đăng ký trả `REGISTRATION_REQUIRED` sau khi provider/OTP proof thành công; không tạo user, placeholder email hay identity.
- `LINK`: yêu cầu JWT hiện tại và bind provider/phone proof vào đúng authenticated user. Identity thuộc user khác trả conflict.

## OAuth Binding

- `/api/auth/google?intent=LOGIN|REGISTER` và `/api/auth/facebook?intent=LOGIN|REGISTER` bắt buộc query intent uppercase.
- OAuth authorization state lưu purpose, provider, browser-binding hash và target user chỉ cho `LINK`.
- Callback phát hành opaque one-time code mang cùng purpose. Frontend callback URL có `code` và `intent`; exchange body bắt buộc `{ code, intent }`.
- Purpose mismatch, replay, expiry hoặc browser mismatch đều fail closed. Callback code không chứa JWT, token hoặc account ID.

## Phone Binding

- Public login dùng `/auth/phone/request` + `/auth/phone/verify`.
- Public registration dùng `/auth/phone/register/request` + `/auth/phone/register/verify`.
- Linking dùng authenticated `/auth/phone/link/request` + `/auth/phone/link/verify`.
- Request response giống nhau và không tiết lộ account existence. Chỉ sau OTP proof mới trả `REGISTRATION_REQUIRED`, `LOGIN_REQUIRED` hoặc conflict an toàn.
- Placeholder `@phone-auth.invalid` chỉ được tạo trong successful `REGISTER`; password login từ placeholder luôn bị từ chối.

## Persistence and Race Safety

- Migration `010_auth_intents.sql` mở rộng OAuth/phone ephemeral tables cho `REGISTER`, giữ nguyên users/OAuth identities/phone identities và cố ý invalidates pending state/challenge cũ vì không thể suy ra intent an toàn.
- Unique constraints và `BEGIN IMMEDIATE` bảo đảm concurrent register không tạo nhiều user/identity cho cùng provider subject hoặc canonical phone.

## Frontend

- `/register`: Google, Facebook, số điện thoại và email/password; social links dùng `REGISTER`, phone flow dùng `mode="register"`.
- `/login`: email/password, Google, Facebook và phone; social links dùng `LOGIN`, phone flow dùng `mode="login"`.
- Profile giữ explicit `LINK` cho Google/Facebook/phone. Post-proof guidance chuyển tới đúng `/register` hoặc `/login` mà không hiển thị provider/internal detail.

## Proof Gap

Automated tests/builds và desktop/mobile UI review là acceptance cho semantics. Live eSMS handset test đang tạm dừng và không được xem là PASS trong milestone này.
