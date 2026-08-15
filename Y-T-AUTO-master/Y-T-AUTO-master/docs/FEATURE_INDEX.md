# Feature Index

This document maps all features in the "Y tế cho người bình thường" web application to their implementation status, feature documents, and schemas.

## Feature Registry

| Feature ID | Feature Name | Priority | Status | Documentation | Schema / Contract | Evidence |
|------------|--------------|----------|--------|---------------|-------------------|----------|
| F01        | Authentication | P0       | DONE | [auth.md](features/auth.md) | None | register/login/logout + JWT; frontend pages; E2E smoke passed |
| F02        | User Profile | P0       | DONE | [profile.md](features/profile.md) | None | profile CRUD; age computed dynamically; E2E passed |
| F03        | Dashboard    | P0       | DONE | [dashboard.md](features/dashboard.md) | None | SCAN OCR CTA, secondary nav, avatar menu, chatbot |
| F04        | OCR Upload/Camera | P0    | DONE | [ocr_upload.md](features/ocr_upload.md) | None | upload/camera/drag-drop + validation; E2E passed |
| F05        | OCR Processing & Parsing | P0 | DONE | [ocr_parsing.md](features/ocr_parsing.md) | [ocr_result.schema.json](../contracts/json/ocr_result.schema.json) | Dev provider verified E2E; Gemini provider implemented (PARTIAL until API key) |
| F06        | OCR Review/Confirm | P0 | DONE | [ocr_review.md](features/ocr_review.md) | [ocr_confirm.schema.json](../contracts/json/ocr_confirm.schema.json) | Review/edit/confirm UI; confirm API; E2E passed |
| F07        | Lab Analysis & Explanation | P0 | DONE | [lab_analysis.md](features/lab_analysis.md) | [lab_analysis.schema.json](../contracts/json/lab_analysis.schema.json) | LOW/NORMAL/HIGH/UNKNOWN; Vietnamese explanations; E2E passed |
| F08        | Meal Plan    | P0       | DONE | [meal_plan.md](features/meal_plan.md) | [meal_plan.schema.json](../contracts/json/meal_plan.schema.json) | 5 meal types; verified-image provenance; persistence/history reload |
| F09        | Exercise Recommendations | P0 | DONE | [exercise.md](features/exercise.md) | [exercise_plan.schema.json](../contracts/json/exercise_plan.schema.json) | 2+ exercises; verified-video provenance; persistence/history reload |
| F10        | History & Persistence | P0 | DONE | [history.md](features/history.md) | [history_list](../contracts/json/history_list.schema.json), [report_detail](../contracts/json/report_detail.schema.json) | physical contracts; SQLite migration/transaction tests; browser reload passed |
| F11        | Text Chatbot | P0       | DONE | [chatbot.md](features/chatbot.md) | [chatbot_message.schema.json](../contracts/json/chatbot_message.schema.json) | floating widget; context-aware; E2E passed |
| F12        | Responsive Layout & States | P0 | DONE | [responsive.md](features/responsive.md) | None | Tailwind responsive; loading/error/empty states; build passed |
| F13        | Google OAuth | P1       | DONE | [google_oauth.md](features/google_oauth.md) | [oauth_session](../contracts/json/oauth_session.schema.json), [oauth_authorization](../contracts/json/oauth_authorization.schema.json) | Real flow verified; browser-bound one-time callback exchange implemented; current auth regression PASS |
| F14        | Food Images  | P1       | DONE | [food_images.md](features/food_images.md) | [meal_plan.schema.json](../contracts/json/meal_plan.schema.json) | 6 verified Wikimedia records; attribution/fallback; persistence; browser QA |
| F15        | Verified YouTube Videos | P1 | DONE | [youtube.md](features/youtube.md) | [exercise_plan.schema.json](../contracts/json/exercise_plan.schema.json) | 3 verified oEmbed records; strict runtime guard; persistence; browser QA |
| F16        | Voice Chatbot | P1      | DONE | [voice_chat.md](features/voice_chat.md) | None | Web Speech input vi-VN + speechSynthesis output; unit/component tests 9/9; build PASS |
| F17        | Facebook OAuth | P2     | DONE | [facebook_oauth.md](features/facebook_oauth.md) | [oauth_session](../contracts/json/oauth_session.schema.json), [oauth_authorization](../contracts/json/oauth_authorization.schema.json) | Real tester flow PASS; browser-bound one-time exchange and verified-email/account-linking hardening implemented |
| F18        | Phone OTP Authentication | P2 | COMPLETE | [phone_auth.md](features/phone_auth.md) | [auth_session](../contracts/json/auth_session.schema.json), [phone_otp_challenge](../contracts/json/phone_otp_challenge.schema.json), [phone_account_status](../contracts/json/phone_account_status.schema.json), [auth_me](../contracts/json/auth_me.schema.json), [auth_providers](../contracts/json/auth_providers.schema.json), [esms_send_response](../contracts/json/esms_send_response.schema.json) | Migration 009/010, Twilio/eSMS adapters, persistent challenges/rate limits, login/link/status UI and tests; live handset proof pending eSMS balance |
| F19        | Explicit Auth Intents | P0 | IN_PROGRESS | [auth_intents.md](features/auth_intents.md) | [oauth_session](../contracts/json/oauth_session.schema.json), [auth_session](../contracts/json/auth_session.schema.json) | REGISTER, LOGIN và LINK tách biệt cho Google/Facebook/Phone; final full gates và UI QA đang chạy |

## Verification Matrix

- Backend: 28 suites / 376 tests PASS; contract suite 40/40 PASS; production build PASS (2026-08-13 phone-auth gate).
- Frontend: 10 Vitest files / 105 tests PASS; production build PASS (2026-08-13 phone-auth gate). The lint script exits 0 but no real lint configuration exists.
- Explicit external verifier: 3 YouTube + 6 Wikimedia records PASS; intentionally excluded from deterministic CI.
- Browser QA 2026-08-09/10: desktop and mobile 390x844, no horizontal overflow; live media, forced fallback, history reload, persisted narrative after direct reload PASS. In-app Browser console: 0 warnings/errors.
- Real Gemini OCR/AI requests passed in the configured local environment; public lab narrative remains deterministic and never calls the model.
- Real Google and Facebook OAuth browser flows passed without exposing credentials or tokens; new OAuth users without a medical profile are routed through profile onboarding.
- Phone OTP lifecycle, Twilio/eSMS adapter boundaries, AuthContext integration and responsive component flows are covered offline; isolated desktop/mobile browser UI QA passed, but live eSMS handset receipt is not yet claimed.

