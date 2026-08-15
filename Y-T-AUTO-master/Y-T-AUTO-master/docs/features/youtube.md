# Feature: Verified YouTube Videos (F15)

## Description
Hiển thị liên kết video hướng dẫn vận động có metadata đã xác minh qua YouTube oEmbed.

## Status
DONE (P1) — verified 2026-08-09.

## Implementation
- Backend catalog cố định 3 video: Walk at Home, Yoga With Adriene và Yoga with Kassandra; URL được dựng từ catalog video ID.
- Người dùng từ 60 tuổi nhận chair-yoga; người trẻ hơn nhận beginner-yoga. Gemini draft không được cung cấp URL ngoài.
- `exercise_plan.schema.json`, TypeScript types, OpenAPI và runtime guard yêu cầu verified tuple đầy đủ hoặc toàn bộ trường media là `null`/`false`.
- Migration `002_verified_media.sql` lưu video ID, title, author, author URL, thumbnail, source và verification date; history reload giữ nguyên provenance.
- Frontend chỉ render card/link khi `youtubeVerified === true`, source là `YouTube oEmbed` và toàn bộ provenance tuple hợp lệ.

## Verification Evidence
- Offline catalog/provider/persistence/contract tests nằm trong full backend suite 113/113 PASS.
- Frontend `VerifiedMedia` tests nằm trong suite 14/14 PASS, gồm verified title/author/link, false flag và partial provenance guards.
- `npm run verify:media`: 3/3 YouTube oEmbed records PASS với exact title và author.
- Browser QA report người dùng 76 tuổi hiển thị 2 verified links, gồm đúng `Gentle Chair Yoga for Beginners and Seniors` / `Yoga with Kassandra`.
- History navigation và direct reload giữ 2 verified video links.
- External links dùng `target="_blank"` và `rel="noopener noreferrer"`.

## Operational Note
Live YouTube oEmbed verification không chạy trong CI để tránh network flakiness. Jest/Vitest và CI vẫn hoàn toàn offline/deterministic.
