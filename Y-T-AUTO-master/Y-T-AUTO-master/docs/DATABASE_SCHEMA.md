# Database Schema — Y tế cho người bình thường

Tài liệu này mô tả chi tiết cấu trúc cơ sở dữ liệu của ứng dụng. Cơ sở dữ liệu được thiết lập với tính năng toàn vẹn tham chiếu, tự động lưu thời gian tạo (`created_at`) và thời gian cập nhật (`updated_at`).

## 1. Mối quan hệ giữa các bảng (Entity Relationship Diagram)

```
  profiles (1) <────── (1) users
                            │
                            ├─── (1) ─── (0..1) user_phone_identities
                            └─── (1) ─── (N) phone_otp_challenges (LINK target)

  phone_auth_rate_limits (persistent HMAC buckets; no user FK)
     │
     └─── (1) ─── (N) lab_reports
                     │
                     └─── (1) ─── (N) lab_results

  profiles (1) <────── (N) meal_plans ─── (1) ─── (N) meal_plan_items
  
  profiles (1) <────── (N) exercise_plans ─── (1) ─── (N) exercise_items

  profiles (1) <────── (N) chat_sessions ─── (1) ─── (N) chat_messages
```

## 2. Mô tả chi tiết các bảng

### Bảng `users` (phone-auth extension)
- Migration `009_phone_auth.sql` thêm `email_is_placeholder` (`0|1`, mặc định `0`).
- Phone-only account vẫn dùng shared `users`/JWT/profile architecture. Chỉ successful phone `REGISTER` tạo email nội bộ ngẫu nhiên dưới suffix `@phone-auth.invalid`; giá trị này không được hiển thị hay dùng cho password login.

### Bảng `user_phone_identities`
Mỗi row là một phone identity đã xác minh.
- `id` (UUID text, Primary Key)
- `user_id` (Foreign Key `users.id`, Unique, Cascade Delete)
- `phone_e164` (E.164, Unique; một phone chỉ thuộc một user)
- `verified_at`, `created_at`, `updated_at` (epoch milliseconds với constraints)

### Bảng `phone_otp_challenges`
Challenge persistent, browser-bound và single-use; migration 009 supersede model giới hạn của migration 005 nhưng không sửa lịch sử migration 005.
- `challenge_hash`, `binding_hash` (64-char lowercase SHA-256; plaintext không lưu)
- `phone_e164`; `purpose` (`LOGIN|REGISTER|LINK`); `target_user_id` chỉ bắt buộc cho `LINK`
- `code_mac` (HMAC-SHA256 hoặc null sau failure/lock/consume)
- `status` (`PENDING_SEND|SENT|SEND_FAILED|LOCKED|CONSUMED`), `attempts`, `max_attempts`
- `expires_at`, `resend_available_at`, lifecycle timestamps và strict state-consistency checks
- Index theo phone/purpose/target, expiry và status/creation để cooldown, cleanup và lifecycle lookup có giới hạn.

### Migration `010_auth_intents.sql`
- Rebuild ba bảng ephemeral `oauth_authorization_states`, `oauth_callback_codes`, `phone_otp_challenges` để bind `LOGIN|REGISTER|LINK` và enforce target-user constraints.
- Giữ nguyên `users`, `user_oauth_identities`, `user_phone_identities`, profile và medical data.
- Pending OAuth states/callback codes/phone challenges bị invalidated có chủ đích khi migrate vì row cũ không chứa đủ dữ liệu để suy ra intent an toàn.

### Bảng `phone_auth_rate_limits`
Fixed-window abuse-control buckets dùng chung giữa process cùng SQLite file.
- `bucket_key` (HMAC-SHA256 identity, Primary Key), `domain`
- `window_start`, `window_end`, `request_count`, `created_at`, `updated_at`
- Expired rows được cleanup opportunistically theo batch 250; implementation fail closed ở hard ceiling 50.000 rows và trả thời điểm retry an toàn.
- Không lưu raw phone/IP/user trong bucket key. Đây là rate state, không phải audit log lâu dài.

### Bảng `profiles`
Lưu trữ thông tin cá nhân của người dùng.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Unique, Foreign Key đến bảng auth.users hoặc bảng users nội bộ)
- `full_name` (VARCHAR, Not Null)
- `date_of_birth` (DATE, Not Null) - Dùng để tính tuổi động
- `gender` (VARCHAR, Check: 'MALE', 'FEMALE', 'OTHER', Not Null)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `lab_reports`
Lưu vết các tệp xét nghiệm được tải lên.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key đến `profiles.user_id`)
- `image_reference` (VARCHAR, Not Null) - Đường dẫn hoặc URL của ảnh xét nghiệm lưu trữ
- `status` (VARCHAR, Check: 'PENDING', 'PROCESSED', 'FAILED', Not Null)
- `source_type` (VARCHAR, Check: 'CAMERA', 'UPLOAD', Not Null)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `lab_results`
Lưu trữ các chỉ số xét nghiệm chi tiết đã được chuẩn hóa.
- `id` (UUID, Primary Key)
- `report_id` (UUID, Foreign Key đến `lab_reports.id`, Cascade Delete)
- `test_code` (VARCHAR, Not Null) - Ví dụ: WBC, RBC, ALT
- `test_name` (VARCHAR, Not Null) - Ví dụ: Số lượng bạch cầu
- `value` (NUMERIC, Not Null) - Giá trị xét nghiệm
- `unit` (VARCHAR, Not Null) - Đơn vị tính (10^9/L, mmol/L...)
- `reference_low` (NUMERIC, Nullable) - Ngưỡng tối thiểu bình thường
- `reference_high` (NUMERIC, Nullable) - Ngưỡng tối đa bình thường
- `reference_text` (VARCHAR, Nullable) - Khoảng tham chiếu dạng text trên giấy (Ví dụ: "4.0 - 10.0")
- `status` (VARCHAR, Check: 'LOW', 'NORMAL', 'HIGH', 'UNKNOWN', Not Null)
- `ocr_confidence` (NUMERIC, Default: 1.0)
- `reference_source` (VARCHAR, Check: 'LAB_REPORT', 'SYSTEM_DEFAULT', Not Null)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `meal_plans`
Thông tin thực đơn hỗ trợ.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key đến `profiles.user_id`)
- `lab_report_id` (UUID, Foreign Key đến `lab_reports.id`, Nullable)
- `title` (VARCHAR, Not Null)
- `description` (TEXT, Nullable)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `meal_plan_items`
Chi tiết các món ăn trong thực đơn.
- `id` (UUID, Primary Key)
- `meal_plan_id` (UUID, Foreign Key đến `meal_plans.id`, Cascade Delete)
- `meal_type` (VARCHAR, Check: 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK', Not Null)
- `name` (VARCHAR, Not Null) - Tên món ăn/đồ uống
- `description` (TEXT, Nullable)
- `ingredients` (TEXT, Nullable) - Nguyên liệu chính
- `preparation` (TEXT, Nullable) - Cách chế biến sơ lược
- `image_url` (VARCHAR, Nullable) - Link ảnh món ăn đã xác minh
- `rationale` (TEXT, Nullable) - Lý do món ăn này tốt cho chỉ số sức khỏe của người dùng
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `exercise_plans`
Thông tin kế hoạch tập thể dục.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key đến `profiles.user_id`)
- `lab_report_id` (UUID, Foreign Key đến `lab_reports.id`, Nullable)
- `title` (VARCHAR, Not Null)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `exercise_items`
Chi tiết bài tập thể dục.
- `id` (UUID, Primary Key)
- `exercise_plan_id` (UUID, Foreign Key đến `exercise_plans.id`, Cascade Delete)
- `name` (VARCHAR, Not Null) - Tên bài tập
- `description` (TEXT, Nullable)
- `duration` (INTEGER, Not Null) - Thời gian thực hiện (phút)
- `difficulty` (VARCHAR, Check: 'EASY', 'MEDIUM', 'HARD', Not Null)
- `rationale` (TEXT, Nullable) - Lý do tốt cho sức khỏe người dùng
- `youtube_url` (VARCHAR, Nullable) - Link video YouTube đã xác minh
- `youtube_verified` (BOOLEAN, Default: FALSE)
- `youtube_source` (VARCHAR, Nullable)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `chat_sessions`
Phiên hội thoại chatbot.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key đến `profiles.user_id`)
- `created_at` (TIMESTAMP, Default: NOW)
- `updated_at` (TIMESTAMP, Default: NOW)

### Bảng `chat_messages`
Các tin nhắn trong phiên hội thoại.
- `id` (UUID, Primary Key)
- `session_id` (UUID, Foreign Key đến `chat_sessions.id`, Cascade Delete)
- `role` (VARCHAR, Check: 'USER', 'ASSISTANT', Not Null)
- `content` (TEXT, Not Null)
- `created_at` (TIMESTAMP, Default: NOW)
