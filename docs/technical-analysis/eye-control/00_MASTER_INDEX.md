# EYEAI — PHÂN TÍCH KỸ THUẬT CHUYÊN SÂU PHÂN HỆ NGƯỜI SUY GIẢM (MASTER INDEX)

> **Phạm vi tài liệu**: Toàn bộ phân hệ dành cho **Người suy giảm (`account_type === 'impaired'`)** và các module dùng chung có liên quan trực tiếp trong dự án **LUCKY DREAM – EYEAI** (`eyetalk-assistant`).  
> **Nguyên tắc kiểm chứng**: Mọi thông số, công thức, luồng dữ liệu, tên hàm và hành vi đều được trích xuất trực tiếp từ mã nguồn hiện tại trong workspace; không suy diễn tính năng không tồn tại; phân biệt rõ phần lý thuyết, phần thư viện bên ngoài (Google MediaPipe FaceMesh, Google Gemini, YouTube Data API, Supabase, Google Maps) và phần thuật toán/kiến trúc do đội ngũ EYEAI tự triển khai.

---

## 1. Cấu trúc bộ tài liệu kỹ thuật (`docs/technical-analysis/eye-control/`)

| STT | Tài liệu | Mục tiêu & Nội dung trọng tâm | Đối tượng đọc khuyến nghị |
| :--- | :--- | :--- | :--- |
| 00 | [`00_MASTER_INDEX.md`](./00_MASTER_INDEX.md) | Mục lục tổng, bản đồ điều hướng tài liệu, tóm tắt nhanh thông số cốt lõi & hướng dẫn đọc | Tất cả thành viên & Ban giám khảo |
| 01 | [`01_SYSTEM_ARCHITECTURE.md`](./01_SYSTEM_ARCHITECTURE.md) | Kiến trúc tổng thể phân hệ Người suy giảm, tech stack, phân lớp Context/Provider/Hooks/UI, vòng đời hệ thống, design pattern, sơ đồ Mermaid kiến trúc & dependency | Senior Architect, Tech Lead |
| 02 | [`02_FILE_ANALYSIS.md`](./02_FILE_ANALYSIS.md) | Cây thư mục có chú thích + phân tích chi tiết 11 tiêu chí cho **từng file** (core eye-control, virtual-keyboard, HUD, pages, services, calls, entertainment, location, backend, scripts/tests) | Technical Auditor, Maintainer |
| 03 | [`03_FUNCTION_ANALYSIS.md`](./03_FUNCTION_ANALYSIS.md) | Phân tích chi tiết **từng hàm, custom hook, component, callback và event handler** (gồm 4 phần: [Phần 1 Core](./03_FUNCTION_ANALYSIS.md), [Phần 2 Navigation & HUD](./03_FUNCTION_ANALYSIS_NAVIGATION_HUD.md), [Phần 3 Keyboard & Pages](./03_FUNCTION_ANALYSIS_KEYBOARD_PAGES.md), [Phần 4 Services & Backend](./03_FUNCTION_ANALYSIS_SERVICES_BACKEND.md)) | AI/CV Engineer, Frontend Dev |
| 04 | [`04_ALGORITHMS_AND_MATHEMATICS.md`](./04_ALGORITHMS_AND_MATHEMATICS.md) | Toán học & thuật toán: Low-Light Adaptive Gamma LUT, EAR, Canthal Baseline Projection, Dual-Eye Fusion, EMA, Hysteresis, Blink FSM (1/2/3 chớp), Re-Arm, Spatial 2D & Grid Navigation, Auto-Scroll, Vietnamese Telex | CV Engineer, Algorithm Auditor |
| 05 | [`05_AI_AND_COMPUTER_VISION.md`](./05_AI_AND_COMPUTER_VISION.md) | Phân tích rạch ròi giữa AI (MediaPipe FaceMesh 478 landmarks, Gemini LLM) và thuật toán hình học/tín hiệu truyền thống; kiến trúc pipeline CV thời gian thực | AI Engineer, Ban giám khảo AI |
| 06 | [`06_TECHNICAL_CONCEPTS.md`](./06_TECHNICAL_CONCEPTS.md) | Từ điển thuật ngữ kỹ thuật (AI/ML/DL/CV, Eye/Gaze Tracking, FSM, Real-time, React/TS, WebRTC/Web Audio/Speech, Accessibility) gắn trực tiếp với file & hàm trong EYEAI | Mọi đối tượng, Người bảo vệ |
| 07 | [`07_SYSTEM_WORKFLOW.md`](./07_SYSTEM_WORKFLOW.md) | Luồng thực thi End-to-End & 13 workflow tính năng thực tế (khởi động, camera, calibrate, gesture, navigation, speak, AI, SOS, calls, mất mặt, lỗi, kết thúc) kèm Flowchart & Sequence Diagram | Architect, QA, Người bảo vệ |
| 08 | [`08_EXECUTION_SIMULATION.md`](./08_EXECUTION_SIMULATION.md) | Mô phỏng từng bước bằng số liệu giả lập khớp công thức thật: chọn nút bằng chớp mắt 2 cái, liếc phải chuyển card, lọc thiếu sáng, lỗi mất mặt / boundary | CV Engineer, Ban giám khảo |
| 09 | [`09_TECHNICAL_EVALUATION.md`](./09_TECHNICAL_EVALUATION.md) | Đánh giá kỹ thuật khách quan (độ chính xác, ổn định, real-time, thiếu sáng, khả năng mở rộng/bảo trì, bảo mật/privacy, điểm lỗi tiềm ẩn & sai lệch đã xác minh trong code) | Technical Auditor, Reviewer |
| 10 | [`10_TECHNICAL_QA.md`](./10_TECHNICAL_QA.md) | 65 câu hỏi phản biện kỹ thuật từ Cơ bản đến Chuyên sâu (Kiến trúc, Toán/Thuật toán, AI, Hiệu năng, Sáng tạo, Thực tế) kèm câu trả lời chuẩn xác theo mã nguồn | Người thuyết trình bảo vệ |
| 11 | [`11_SOURCE_COVERAGE.md`](./11_SOURCE_COVERAGE.md) | Bảng đối chiếu kiểm toán toàn bộ file & hàm đã đọc, phân biệt đã xác minh vs chưa thể đo thực nghiệm (FPS/accuracy) | Technical Auditor |
| 12 | [`EYEAI_COMPLETE_TECHNICAL_ANALYSIS.md`](./EYEAI_COMPLETE_TECHNICAL_ANALYSIS.md) | Bản tổng hợp hợp nhất đầy đủ toàn bộ các phần kỹ thuật cốt lõi trong một tài liệu duy nhất để tiện in ấn/tra cứu | Ban giám khảo, Lưu trữ |

---

## 2. Hướng dẫn đọc nhanh theo mục đích

1. **Nếu cần nắm bức tranh toàn hệ thống trong 15 phút**: Đọc [`01_SYSTEM_ARCHITECTURE.md`](./01_SYSTEM_ARCHITECTURE.md) → [`07_SYSTEM_WORKFLOW.md`](./07_SYSTEM_WORKFLOW.md) → [`05_AI_AND_COMPUTER_VISION.md`](./05_AI_AND_COMPUTER_VISION.md).
2. **Nếu cần bảo vệ phần toán học & thuật toán mắt**: Đọc [`04_ALGORITHMS_AND_MATHEMATICS.md`](./04_ALGORITHMS_AND_MATHEMATICS.md) → [`08_EXECUTION_SIMULATION.md`](./08_EXECUTION_SIMULATION.md) → [`10_TECHNICAL_QA.md`](./10_TECHNICAL_QA.md).
3. **Nếu cần kiểm tra từng file và từng dòng code cụ thể**: Đọc [`02_FILE_ANALYSIS.md`](./02_FILE_ANALYSIS.md) → [`03_FUNCTION_ANALYSIS.md`](./03_FUNCTION_ANALYSIS.md) → [`11_SOURCE_COVERAGE.md`](./11_SOURCE_COVERAGE.md).
4. **Nếu cần nhìn thẳng vào các hạn chế kỹ thuật và rủi ro thực tế trong code**: Đọc [`09_TECHNICAL_EVALUATION.md`](./09_TECHNICAL_EVALUATION.md).

---

## 3. Bảng thông số kỹ thuật cốt lõi đã xác minh từ mã nguồn

| Thành phần | Giá trị / Công thức thực tế trong code | Vị trí nguồn xác minh |
| :--- | :--- | :--- |
| **Mô hình AI thị giác** | MediaPipe FaceMesh (`maxNumFaces: 1`, `refineLandmarks: true`, `minDetectionConfidence: 0.6`, `minTrackingConfidence: 0.6`), 478 landmarks (468 mặt + 10 mống mắt) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L1469-L1478) |
| **Camera Capture** | `getUserMedia` ưu tiên `facingMode: { ideal: 'user' }`, `640×480`, `audio: false` (fallback `{ video: true, audio: false }`) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L1614-L1626) |
| **Bộ lọc thiếu sáng (Low-Light)** | Adaptive Gamma LUT 256-entry, `minGamma = 0.48`, `maxGamma = 1.0`, `targetLuminance = 125`, `emaAlpha = 0.1`, `gammaDeadband = 0.02`, `sampleStep = 8` (mặc định `OFF`) | [`lowLightFilter.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L24-L31), [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L126) |
| **Thuật toán mắt** | EAR 2 cặp điểm dọc / 1 cặp ngang; Chiếu trực giao mống mắt lên trục khóe mắt (Canthal Baseline Projection) + hợp nhất theo trọng số EAR | [`eyeTracker.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L156-L261) |
| **Làm mượt Gaze (EMA)** | `alpha = 0.45` trên `rawDeltaX/Y`; Auto-zero warm-up 35 frame (`alpha = 0.25`); Drift compensation (`alpha = 0.012`) khi đang ở `CENTER` | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L827-L898) |
| **Ngưỡng chớp mắt (Blink)** | `openBaselineEAR * 0.78` kẹp trong `[0.16, 0.28]` (hoặc calibrated trong `[0.16, 0.29]`), trễ mở mắt Hysteresis `+0.015` | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L545-L554) |
| **FSM Chớp mắt** | Cửa sổ quyết định `BLINK_DECISION_WINDOW_MS = 700ms` (dung sai nối tiếp `+250ms = 950ms`), blink hợp lệ `25–750ms`: 1 chớp → `DOWN` (cooldown `1200ms`), 2 chớp → `SELECT` (cooldown `2500ms`), 3 chớp → `EMERGENCY` (cooldown `3000ms`) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L559-L786) |
| **FSM Liếc mắt (Gaze)** | `UP` (`threshUp` `[0.014, 0.024]`), `LEFT`/`RIGHT` (`threshLeft/Right` `[0.020, 0.034]`); **Nhìn xuống (`DOWN`) bị tắt**; Release hysteresis `0.55 × thresh`; Dwell xác nhận `220ms`; Re-Arm tại `CENTER` `>= 140ms`; Post-blink lockout `300ms` | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L821-L1045) |
| **Cooldown điều hướng** | Thành công: `ACTION_COOLDOWN_MS = 2500ms`; Đụng biên (boundary): `1000ms` | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L62-L1018) |
| **Cập nhật Telemetry UI** | Throttle `65ms` (~15 FPS) hoặc `40ms` khi đang đếm chớp mắt; cập nhật ngay khi có chuyển trạng thái lớn | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L59-L1124) |
| **TTS Tiếng Việt** | Dual-path: Native `SpeechSynthesis` (Edge, iOS, Android) hoặc Proxy `/api/tts` (Google Translate TTS) + `AudioBuffer` cache (tối đa 60 mục) trên Chrome Desktop | [`speech.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/utils/speech.ts#L550-L737) |
