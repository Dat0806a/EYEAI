# API Specification — Y tế cho người bình thường

Tất cả các API endpoints của hệ thống đều sử dụng tiền tố `/api` và trả về kết quả định dạng JSON chuẩn.

`REGISTER`, `LOGIN` và `LINK` là ba auth purpose không thể hoán đổi. Google/Facebook public start bắt buộc intent explicit; OAuth callback code và exchange cùng bind intent. Phone có endpoint riêng cho register/login/link. Account existence chỉ được xử lý sau provider/OTP proof.

## 1. Chuẩn hóa Định dạng Response (API Response Contract)

### Trực quan khi Thành công (Success Response)
```json
{
  "success": true,
  "data": {},
  "error": null
}
```

### Trực quan khi Thất bại (Failure Response)
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Thông điệp lỗi chi tiết bằng tiếng Việt."
  }
}
```

---

## 2. Danh sách các API Endpoints

### 2.1. Authentication (Xác thực)
- **POST `/api/auth/register`**
  - Đăng ký tài khoản mới.
  - Body: `{ "email": "user@example.com", "password": "securepassword" }`
- **POST `/api/auth/login`**
  - Đăng nhập hệ thống.
  - Body: `{ "email": "user@example.com", "password": "securepassword" }`
- **POST `/api/auth/logout`**
  - Đăng xuất người dùng.
- **GET `/api/auth/google?intent=LOGIN|REGISTER`**
  - Bắt đầu Google OAuth với intent explicit; tạo state CSPRNG được hash trong SQLite, bind state/purpose với cookie correlation HttpOnly/SameSite=Lax của browser và redirect tới Google.
  - Trả `503 OAUTH_NOT_CONFIGURED` nếu credentials chưa được cấu hình.
- **POST `/api/auth/google/link`**
  - Yêu cầu Bearer session hiện tại; tạo authorization URL để liên kết Google identity với đúng user đang đăng nhập.
  - Giới hạn theo authenticated user và IP; trả `429 OAUTH_RATE_LIMITED` khi vượt rate limit hoặc pending-state capacity.
- **GET `/api/auth/google/callback`**
  - Xác thực state cùng browser binding, đổi provider code, chỉ tin email khi Google trả `email_verified=true`, rồi resolve/link theo Google provider user ID.
  - Redirect về `${WEB_ORIGIN}/oauth/callback?code=<opaque-one-time-code>&intent=<purpose>`; URL không chứa JWT, access token, refresh token, email hoặc user ID.
- **GET `/api/auth/facebook?intent=LOGIN|REGISTER`**
  - Bắt đầu Facebook OAuth bằng state CSPRNG được hash, purpose explicit và browser binding; trả `503 OAUTH_NOT_CONFIGURED` nếu chưa cấu hình.
- **POST `/api/auth/facebook/link`**
  - Yêu cầu Bearer session hiện tại; liên kết Facebook provider user ID với đúng user đã khởi tạo flow.
  - Dùng chung rate budget theo authenticated user với Google link và có IP ceiling bổ sung; trả `429 OAUTH_RATE_LIMITED` khi bị giới hạn.
- **GET `/api/auth/facebook/callback`**
  - Đổi provider code, đọc Graph profile và resolve theo Facebook user ID.
  - Facebook email không được coi là provider-verified và không bao giờ tự động link chỉ vì trùng email; email collision yêu cầu user đăng nhập tài khoản hiện có rồi dùng link flow.
  - Redirect về frontend chỉ với opaque one-time code như Google callback.
- **POST `/api/auth/oauth/exchange`**
  - Body: `{ "code": "43-character-base64url-value", "intent": "LOGIN|REGISTER|LINK" }`.
  - Yêu cầu cùng cookie browser binding và exact purpose đã được phát hành khi OAuth bắt đầu; frontend gửi request với credentials.
  - Code có TTL 60 giây, chỉ lưu SHA-256, được consume atomic bằng `DELETE ... RETURNING` và bị xóa ngay lần dùng đầu tiên.
  - Thành công trả JWT/session trong JSON response body. Code invalid, hết hạn, replay hoặc sai browser đều bị từ chối generic và không phát hành session.
- **POST `/api/auth/phone/request`**
  - Public login request. Body: `{ "phone": "0912 345 678" }`; backend normalize thành E.164 nhưng không trả canonical phone.
  - Thành công `202` chỉ trả `{ challengeToken, expiresAt, resendAvailableAt }`, đặt `Cache-Control: no-store` và cookie browser binding HttpOnly.
  - Không lookup/rò rỉ account existence. Cooldown/rate limit trả `429` và `Retry-After` khi có; thiếu cấu hình trả `503 OTP_NOT_CONFIGURED`; delivery failure trả safe `502 OTP_DELIVERY_UNAVAILABLE`.
- **POST `/api/auth/phone/verify`**
  - Public login verify. Body: `{ "challengeToken": "43-character-base64url-value", "code": "123456" }`.
  - Yêu cầu đúng browser binding; chỉ phone identity đã tồn tại được login. Unknown phone trả `REGISTRATION_REQUIRED` sau proof và không tạo user/placeholder.
  - OTP invalid/expired/locked/replayed dùng safe error codes; verify rate limit có `Retry-After` khi có thời điểm retry.
- **POST `/api/auth/phone/register/request`**
  - Public registration request với response/privacy/rate-limit giống login request; không trả phone existence.
- **POST `/api/auth/phone/register/verify`**
  - OTP đúng cho phone mới tạo đúng một shared user + verified phone identity + JWT. Existing phone trả `LOGIN_REQUIRED`; chỉ flow này được tạo placeholder `@phone-auth.invalid`.
- **POST `/api/auth/phone/link/request`**
  - Yêu cầu Bearer session; tạo challenge `LINK` bound với đúng authenticated user và browser.
  - Body/response/privacy/rate semantics giống login request, thêm budget user 3/phút và 10/giờ.
- **POST `/api/auth/phone/link/verify`**
  - Yêu cầu Bearer session và đúng target user/browser; link verified E.164 hoặc trả `409 PHONE_IDENTITY_CONFLICT`.
  - Thành công trả `{ phoneVerified: true, maskedPhone }`, không trả canonical phone hay internal ID.
- **GET `/api/auth/phone`**
  - Yêu cầu Bearer session; trả `{ phoneVerified, maskedPhone }`, trong đó unverified là `{ false, null }`.
- **GET `/api/auth/me`**
  - Trả identity/profile hiện tại và cùng object `phone` theo physical `auth_me` contract; frontend dùng endpoint này để xác minh candidate JWT trước khi lưu session.
- **GET `/api/auth/providers`**
  - Trả trạng thái cấu hình: `{ google, facebook, phoneOtp }` (boolean); không rò rỉ secret.

Phone register/login/link/status được mô tả đầy đủ trong `contracts/openapi.json`. Physical JSON Schemas và synthetic examples tương ứng là `oauth_session`, `auth_session`, `phone_otp_challenge`, `phone_account_status`, `auth_me` và `auth_providers`.

### 2.2. Profile (Hồ sơ cá nhân)
- **GET `/api/profile`**
  - Lấy thông tin hồ sơ hiện tại.
- **PUT `/api/profile`**
  - Cập nhật thông tin hồ sơ.
  - Body: `{ "fullName": "Nguyễn Văn A", "dateOfBirth": "1990-01-01", "gender": "MALE" }`

### 2.3. OCR & Processing (Nhận diện ảnh)
- **POST `/api/ocr/scan`**
  - Tải lên ảnh kết quả xét nghiệm để quét OCR.
  - Request: `multipart/form-data` chứa file ảnh `reportImage`.
  - Response: Đối tượng OCR chứa danh sách các chỉ số thô được trích xuất (Normalized structured data, xem JSON Schema của F05).

### 2.4. Confirmation & Analysis (Xác nhận & Phân tích)
- **POST `/api/analysis/confirm`**
  - Người dùng xác nhận dữ liệu OCR (sau khi chỉnh sửa nếu có) để tiến hành phân tích chính thức.
  - Body: Danh sách các chỉ số xét nghiệm (xem JSON Schema F06).
  - Response: Kết quả phân tích chi tiết của các chỉ số (LOW/NORMAL/HIGH), giải thích dễ hiểu, và kế hoạch thực đơn + bài tập đã sinh ra.
- **GET `/api/analysis/history`**
  - Lấy danh sách lịch sử phân tích xét nghiệm cũ của người dùng.
- **GET `/api/analysis/history/:reportId`**
  - Lấy chi tiết một lần phân tích cũ (gồm chỉ số, thực đơn, bài tập).

### 2.5. Chatbot
- **POST `/api/chat/message`**
  - Gửi tin nhắn đến chatbot AI kèm theo bối cảnh báo cáo xét nghiệm hiện tại.
  - Body: `{ "sessionId": "optional-uuid", "reportId": "optional-uuid", "message": "Số lượng bạch cầu của tôi cao thì có sao không?" }`
  - Response: `{ "sessionId": "uuid", "reply": "...", "audioUrl": "optional-base64-audio" }`
