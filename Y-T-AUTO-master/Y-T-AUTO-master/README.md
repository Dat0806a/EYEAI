# Y Tế Cho Người Bình Thường

Ứng dụng web responsive giúp người dùng phổ thông **chụp/tải giấy xét nghiệm**, **đọc hiểu các chỉ số** bằng tiếng Việt dễ hiểu, và nhận **gợi ý dinh dưỡng, vận động hỗ trợ** — tất cả đều được lưu lại trong lịch sử cá nhân.

> ⚠️ Thông tin trong ứng dụng chỉ mang tính tham khảo hỗ trợ, **không thay thế chẩn đoán hoặc điều trị y tế** từ bác sĩ.

## Tính năng chính

- Đăng ký / đăng nhập bằng email, Google, Facebook hoặc OTP số điện thoại; dùng chung JWT và hồ sơ cá nhân.
- Liên kết một số điện thoại đã xác minh từ trang hồ sơ; chỉ hiển thị số đã che, không lộ số chuẩn hóa hoặc ID nội bộ.
- Dashboard với CTA **SCAN OCR** nổi bật.
- Tải lên / chụp ảnh giấy xét nghiệm (validation MIME, kích thước; camera trên mobile).
- OCR trích xuất chỉ số → màn hình **Review/Chỉnh sửa/Xác nhận** (bắt buộc trước khi phân tích).
- Phân tích chỉ số: trạng thái `LOW / NORMAL / HIGH / UNKNOWN`, giải thích dễ hiểu.
- **Thực đơn gợi ý** với ảnh Wikimedia đã xác minh, alt, tác giả, giấy phép, nguồn và fallback accessible.
- **Bài tập vận động gợi ý** với video YouTube oEmbed đã xác minh, title/author và provenance đầy đủ.
- Lịch sử xét nghiệm lưu trữ vĩnh viễn.
- Chatbot hỗ trợ giải thích chỉ số, thực đơn, bài tập (góc dưới phải).
- Giao diện tiếng Việt, responsive mobile/desktop.

## Kiến trúc

```
frontend/   React 19 + TypeScript + Vite + Tailwind CSS v4
backend/    Node.js + Express 5 + TypeScript + SQLite (sqlite3)
contracts/  JSON Schemas + Examples + OpenAPI (nghiệm thu tự động)
docs/       PRD, Architecture, API Spec, Test Plan, Security, Feature docs
```

- REST API tại `/api` (xem `contracts/openapi.json` và `docs/API_SPEC.md`).
- OCR và AI được **abstraction hóa** (`OCRService`, `AIService`): dễ thay provider (Gemini, Google Cloud Vision...).
- SMS OTP dùng abstraction `SmsProvider`; production chọn `TwilioSmsProvider` hoặc `EsmsSmsProvider` bằng `OTP_SMS_PROVIDER`, còn fake provider chỉ được inject trực tiếp trong test và không thể bật qua biến môi trường.
- Database migrations tự động khi khởi động backend (xem `docs/DATABASE_SCHEMA.md`).

## Bắt đầu nhanh

### Yêu cầu

- Node.js 20+ (đã kiểm thử với Node 24)
- npm

### 1. Cài dependencies

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

### 2. Cấu hình môi trường

```bash
cp .env.example backend/.env
# Mở backend/.env và điền GEMINI_API_KEY nếu muốn dùng OCR/AI thật.
# Nếu để trống, hệ thống dùng provider DEV_FALLBACK (dành cho phát triển).
# Muốn bật đăng nhập/liên kết số điện thoại, cấu hình OTP_HMAC_SECRET và đúng một provider theo bảng bên dưới.
```

### 3. Chạy backend

```bash
cd backend
npm run dev        # http://localhost:5000
```

### 4. Chạy frontend

```bash
cd frontend
npm run dev        # http://localhost:5173 (proxy /api -> localhost:5000)
```

### 5. Build production

```bash
cd backend && npm run build
cd frontend && npm run build
```

## Kiểm thử

```bash
cd backend
npm test                 # offline Jest suite
npm run test:contract    # JSON Schema/example/OpenAPI contracts
npm run build
npm run verify:media     # explicit live YouTube/Wikimedia check; intentionally not in CI

cd ../frontend
npm test -- --run        # offline Vitest/jsdom component tests
npm run build
```

Các test Phone OTP dùng fake `SmsProvider` hoặc mock HTTP với credential tổng hợp, không gửi SMS và không đọc credential local. Twilio/eSMS request construction được kiểm tra offline; chưa được coi là bằng chứng handset delivery production cho đến khi người dùng thực sự nhận và xác minh OTP.

## Biến môi trường

Xem `.env.example`:

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `PORT` | Cổng backend | Không (mặc định 5000) |
| `DATABASE_PATH` | Đường dẫn SQLite | Không |
| `UPLOAD_DIR` | Thư mục ảnh upload | Không |
| `MAX_FILE_SIZE_MB` | Giới hạn file (MB) | Không (10) |
| `JWT_SECRET` | Secret ký JWT | **Có (production)** |
| `GEMINI_API_KEY` | Key Gemini cho OCR/AI thật | Không (dev fallback) |
| `OTP_SMS_PROVIDER` | SMS adapter: `twilio` hoặc `esms` | **Có khi bật Phone OTP** |
| `OTP_HMAC_SECRET` | Secret HMAC riêng cho OTP/rate-limit, tối thiểu 32 byte | **Có khi bật Phone OTP** |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | **Có khi bật Phone OTP** |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | **Có khi bật Phone OTP** |
| `TWILIO_MESSAGING_SERVICE_SID` | Sender qua Messaging Service | Chọn đúng một sender |
| `TWILIO_FROM_NUMBER` | Sender bằng số Twilio | Chọn đúng một sender |
| `TWILIO_REQUEST_TIMEOUT_MS` | Timeout HTTPS Twilio, từ 1 đến 120000 mili giây | Không (10000) |
| `ESMS_API_KEY` | eSMS API key; chỉ dùng khi chọn `esms` | **Có khi dùng eSMS** |
| `ESMS_SECRET_KEY` | eSMS secret key; chỉ dùng khi chọn `esms` | **Có khi dùng eSMS** |
| `ESMS_REQUEST_TIMEOUT_MS` | Timeout HTTPS eSMS, từ 1 đến 120000 mili giây | Không (10000) |
| `OTP_TTL_MINUTES` | Thời hạn challenge/OTP | Không (5) |
| `OTP_RESEND_COOLDOWN_SECONDS` | Thời gian chờ gửi lại, không vượt quá TTL | Không (60) |
| `OTP_MAX_ATTEMPTS` | Số lần nhập sai tối đa mỗi challenge, từ 1 đến 5 | Không (5) |

Phone OTP nhận số Việt Nam dạng quốc nội hoặc quốc tế, chuẩn hóa bằng `libphonenumber-js` và chỉ lưu E.164. Adapter eSMS chuyển E.164 Việt Nam sang dạng quốc nội khi delivery, dùng endpoint cố định và template chính thức `CODE la ma xac minh dang ky Baotrixemay cua ban`; số ngoài Việt Nam fail an toàn khi chọn eSMS, còn Twilio giữ hỗ trợ E.164 quốc tế. Người dùng đăng nhập lần đầu bằng số điện thoại được tạo trong bảng `users` dùng email placeholder nội bộ, sau đó đi thẳng tới `/profile` nếu chưa có hồ sơ.

## Tài liệu

- [PRD](docs/PRD.md)
- [User Stories](docs/USER_STORIES.md)
- [User Flows](docs/USER_FLOWS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [API Spec](docs/API_SPEC.md) + [OpenAPI](contracts/openapi.json)
- [Test Plan](docs/TEST_PLAN.md)
- [Security](docs/SECURITY.md)
- [Feature Index](docs/FEATURE_INDEX.md)
- [Project Status](PROJECT_STATUS.md)

## Repository chính thức

https://github.com/ntc0407/Y-T-AUTO
