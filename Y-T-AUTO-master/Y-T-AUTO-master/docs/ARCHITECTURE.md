# Architecture — Y tế cho người bình thường

Dự án được xây dựng theo kiến trúc **Modular Monolith** được chia thành hai phần rõ rệt: Frontend và Backend. Cả hai phần đều được phát triển bằng TypeScript để đảm bảo tính an toàn dữ liệu và đồng bộ hóa contract.

## 1. Sơ đồ kiến trúc tổng quan (High-Level Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│  React 19, TypeScript, TailwindCSS                      │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │ Components   │   │ Pages        │   │ Services    │  │
│  │ (Reusable)   │   │ (Dashboard,  │   │ (API Client,│  │
│  │              │   │ OCR, Review) │   │ Voice/Auth) │  │
│  └──────────────┘   └──────────────┘   └─────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ (HTTP REST Requests / JSON)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      BACKEND                            │
│  Node.js, Express, TypeScript                           │
│                                                         │
│  ┌──────────────────────┐     ┌──────────────────────┐  │
│  │ Middleware           │     │ Controllers          │  │
│  │ (Auth, Validation)   │     │ (Auth, OCR, Lab)     │  │
│  └──────────┬───────────┘     └──────────┬───────────┘  │
│             │                            │              │
│             ▼                            ▼              │
│  ┌──────────────────────┐     ┌──────────────────────┐  │
│  │ Services             │     │ Repositories         │  │
│  │ (AI Abstraction,     │     │ (Database access,    │  │
│  │  OCR Abstraction)    │     │  Migrations)         │  │
│  └──────────┬───────────┘     └──────────┬───────────┘  │
└─────────────┼────────────────────────────┼──────────────┘
              │ (HTTPS API Calls)          │ (SQL Query)
              ▼                            ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ EXTERNAL SERVICES        │   │ DATABASE                 │
│ Google Gemini API        │   │ SQLite                   │
│ Twilio / eSMS APIs       │   │ (Schema migrations)      │
└──────────────────────────┘   └──────────────────────────┘
```

## 2. Thiết kế Thư mục (Directory Layout)

### Frontend Structure
```
frontend/
  src/
    app/              # Cấu hình app, định tuyến (router)
    components/       # Reusable UI Components (Button, Card, Badge, Modal, Input)
    features/         # Các module chức năng (auth, profile, ocr, analysis, chat)
    hooks/            # Custom React hooks
    services/         # API Clients (axios, fetch) giao tiếp với backend
    schemas/          # Runtime validators (Zod schemas) dùng ở client
    types/            # TypeScript type definitions
    utils/            # Helper functions (date formatting, calculation)
```

### Backend Structure
```
backend/
  src/
    routes/           # API Routes (/api/auth, /api/ocr, /api/analysis, /api/chat)
    controllers/      # Xử lý HTTP Request/Response
    services/         # Business logic & integrations
      ai/             # Gemini integration & prompt templates
      ocr/            # OCR service & normalizers
      phone/          # E.164, OTP crypto, binding, lifecycle, persistent limits
      sms/            # SmsProvider interface + production Twilio/eSMS adapters
    repositories/     # Giao tiếp với database
    middleware/       # Auth middleware, validation, error handler
    schemas/          # JSON Schema / Zod validation rules
    config/           # Cấu hình biến môi trường, database connection
    utils/            # Helper functions
```

## 3. OCR & AI Abstraction

### OCR Service Abstraction
Tạo lớp `OCRService` để chuyển đổi tài liệu thô thành dữ liệu cấu trúc chuẩn. Chúng ta thiết kế interface để dễ dàng chuyển đổi nhà cung cấp (ví dụ: Google Cloud Vision, AWS Textract, hoặc Gemini Multimodal OCR):
```typescript
interface IOCRProvider {
  processImage(imageBuffer: Buffer): Promise<RawOCRResult>;
}

class OCRService {
  constructor(private provider: IOCRProvider) {}
  async scanAndNormalize(imageBuffer: Buffer): Promise<NormalizedOCRResult>;
}
```

### AI Service Abstraction
Tất cả các lời gọi đến mô hình AI (Gemini) để phân tích kết quả xét nghiệm, sinh thực đơn, sinh bài tập hay chatbot đều đi qua lớp `AIService` tại Backend, sử dụng prompt templates phiên bản rõ ràng trong `backend/src/services/ai/prompts/` và được định nghĩa JSON Schema để AI trả về đúng định dạng.

## 4. Phone Authentication Architecture

- `PhoneOtpFlow` là UI reusable với explicit mode `login|register|link`. Login unknown không tạo account, register mới được tạo phone-only account và link bind đúng authenticated user. Candidate JWT đi qua `/api/auth/me` trước storage; stale operation/logout không thể ghi đè session mới.
- Backend normalize số bằng `libphonenumber-js` với default country `VN`, chỉ persist E.164. Phone identity vẫn trỏ tới bảng `users`; chỉ phone REGISTER dùng reserved placeholder email và profile onboarding hiện có.
- `PhoneAuthService` điều phối transaction A (cleanup, cooldown/rate admission, `PENDING_SEND`), một provider call ngoài transaction, rồi transaction B (`SENT` hoặc `SEND_FAILED`). Verify và account mutation/JWT signing chạy atomic dưới `BEGIN IMMEDIATE`.
- `SmsProvider` là boundary hẹp. Environment factory chọn `TwilioSmsProvider` hoặc `EsmsSmsProvider` và chỉ coi provider đang chọn là ready khi toàn bộ config tương ứng hợp lệ; fake chỉ inject trong test và không thể chọn qua config production.
- eSMS là delivery-only: backend OTP vẫn là source of truth. Adapter dùng endpoint cố định, chuyển canonical E.164 Việt Nam sang dạng quốc nội, pin template/Brandname/SmsType chính thức, bỏ `Sandbox`/`AutoGenCode`, thực hiện đúng một request có timeout và chỉ nhận `CodeResult="100"` qua physical JSON contract. Mọi lỗi được map sang `OTP_DELIVERY_UNAVAILABLE` mà không log body, OTP, credential hoặc provider response.
- Challenge token, OTP và browser binding plaintext không được persist/log. Database lưu challenge/binding hash và keyed OTP MAC. HttpOnly `yte_phone_binding` chặn challenge theft/fixation qua browser khác.
- SQLite là authoritative cho challenge và phone rate buckets, hỗ trợ nhiều app process khi cùng dùng một file. Write locking/throughput và single-file deployment là giới hạn vận hành; quy mô phân tán cần shared database/rate-limit store khác.
- IP key dùng Express `req.ip` hoặc socket address. Reverse proxy production phải cấu hình trusted proxy hops chính xác; forwarded headers không được tự động coi là đáng tin.

## 5. Explicit Authentication Intents

- Shared purpose `LOGIN|REGISTER|LINK` được persist trong OAuth state, OAuth callback code và phone challenge. Public social start bắt buộc `LOGIN|REGISTER`; authenticated link tạo state `LINK` riêng.
- OAuth callback phân nhánh tới existing-only login, new-only registration hoặc explicit linking. Login unknown trả `REGISTRATION_REQUIRED`; register existing trả `LOGIN_REQUIRED`; không silent merge.
- Callback chỉ chuyển opaque code + intent. Exchange kiểm tra exact purpose, browser binding, TTL, single-use/replay trước phát JWT.
- Migration 010 rebuild các bảng proof tạm và cố ý invalidates pending state/challenge cũ, nhưng giữ users, identities, profile và medical data.
