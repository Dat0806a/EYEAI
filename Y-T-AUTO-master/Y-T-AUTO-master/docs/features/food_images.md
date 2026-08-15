# Feature: Food Images (F14)

## Description
Hiển thị ảnh món ăn đã xác minh trong tab Thực đơn, kèm nguồn, tác giả và giấy phép sử dụng.

## Status
DONE (P1) — verified 2026-08-09.

## Implementation
- Backend dùng catalog cố định gồm 6 Wikimedia Commons records; AI không được tự sinh URL ảnh.
- `meal_plan.schema.json`, TypeScript types, OpenAPI và runtime output chỉ chấp nhận verified tuple đầy đủ hoặc toàn bộ trường media là `null`.
- Migration `002_verified_media.sql` lưu `image_url`, alt, source, license, author và verification date; controller round-trip giữ nguyên metadata khi tải lịch sử.
- Frontend render ảnh `loading="lazy"`, alt có ý nghĩa, fixed aspect ratio, attribution và source link an toàn.
- Khi ảnh lỗi, UI thay ảnh hỏng bằng fallback accessible nhưng vẫn giữ attribution/source.

## Verification Evidence
- Offline backend catalog/persistence/contract tests nằm trong full suite 113/113 PASS.
- Frontend `VerifiedMedia` tests nằm trong suite 14/14 PASS, gồm lazy image, tuple guard, attribution, fallback và source-change recovery.
- `npm run verify:media`: 6/6 Wikimedia API/direct-image records PASS; URL, author, license, HTTP status và MIME `image/*` khớp catalog.
- Browser QA: 5/5 meal images của report QA tải thật sau lazy scroll; forced network block hiển thị fallback và vẫn giữ author/license/source.
- History navigation và direct reload giữ 5 figures cùng 5 source links.
- Chrome 1280x900 và 390x844 không có horizontal overflow; in-app Browser không ghi nhận console warning/error của ứng dụng.

## Operational Note
Live Wikimedia verification là command chủ động, không chạy trong CI vì phụ thuộc mạng bên ngoài. CI dùng offline deterministic tests và production build.
