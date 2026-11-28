# 09. ĐÁNH GIÁ KỸ THUẬT KHÁCH QUAN (TECHNICAL EVALUATION & AUDIT)

> Đánh giá này tuân thủ nghiêm ngặt quy tắc kiểm toán: **phân biệt rõ vấn đề đã xác minh từ mã nguồn (Verified)**, **rủi ro tiềm ẩn (Potential Risk)** và **những chỉ số chưa có dữ liệu đo thực nghiệm (Unverified / No Benchmark Data)**. Không tự bịa số liệu FPS, accuracy hay latency.

---

## 1. Đánh giá theo từng tiêu chí kỹ thuật

### 1.1. Độ chính xác nhận diện (Detection Accuracy)
- **Điểm mạnh đã xác minh**:
  - Sử dụng `refineLandmarks: true` trong MediaPipe FaceMesh (`EyeTrackingProvider.tsx:1474`), cung cấp tâm mống mắt riêng (`468`, `473`) thay vì ước lượng thô từ mí mắt.
  - Công thức **Canthal Baseline Projection** (`eyeTracker.ts:188-261`) chiếu mống mắt lên đường nối 2 khóe mắt cố định trên xương sọ, loại bỏ lỗi đảo ngược hướng khi nhìn xuống do mí trên sụp theo nhãn cầu (đã được minh họa trong unit test `scripts/test-eye-control.ts:77-100`).
  - Trọng số theo EAR (`wL = max(0.01, leftEAR - 0.08)`) giúp mắt mở rõ đóng góp nhiều hơn vào hướng nhìn.
- **Hạn chế / Điểm cần lưu ý đã xác minh**:
  - **Không bù trừ góc đầu (Head Pose Compensation bị vô hiệu hóa)**: Dù `analyzeEyes()` có tính `headYaw` và `headPitch` (`eyeTracker.ts:265-285`), các dòng `289-290` gán thẳng `compensatedGazeX = rawGazeX` và `compensatedGazeY = rawGazeY`. Nếu người dùng xoay đầu mạnh mà không xoay mắt, tọa độ gốc không bị biến dạng mạnh như khi dùng đầu thay mắt, nhưng nếu người dùng đổi tư thế đầu lệch nhiều, họ phải chờ drift compensation hoặc bấm `"Căn tâm"`.
  - **Không thể đưa ra con số % độ chính xác** vì repository không chứa bộ dataset đánh giá thực tế trên người dùng thật (chỉ có unit/integration test với landmark giả lập).

### 1.2. Độ ổn định (Stability)
- **Cơ chế bảo vệ đã xác minh**:
  - Hysteresis cho cả đóng/mở mắt (`+0.015`) và giữ/thoát hướng nhìn (`0.55 × thresh`).
  - Khóa hoàn toàn kênh liếc mắt (`isGazeAllowed`) trong khi mắt đóng, `300ms` sau khi mở mắt, và suốt thời gian đếm chớp mắt (`blinkCount > 0`).
  - Luật **Re-Arm 140ms tại `CENTER`** chống cuộn liên tiếp ngoài ý muốn; luật **Cooldown 2500ms / 1200ms / 3000ms** chống spam lệnh.
  - **Auto-zero 35 frame đầu** + **Drift compensation** (`alpha = 0.012`) thích ứng với trôi tư thế nhẹ.
- **Hạn chế đã xác minh**:
  - Trên startup mới (`EyeTrackingProvider.tsx:200`), `isCalibrated` luôn bị reset về `false` dù đã lưu calibration trước đó; hệ thống dùng auto-centering động thay cho `neutralIrisH/V` đã lưu, đồng thời kẹp lại `thresholdUp/Down` (`[0.016, 0.026]`) và `thresholdLeft/Right` (`[0.024, 0.036]`).

### 1.3. Khả năng xử lý thời gian thực & Hiệu năng (Real-time & Performance)
- **Điểm mạnh đã xác minh**:
  - Tách **Split Context** (`SettingsContext` vs `TelemetryContext`) và throttle `setTrackingState` ở `65ms` (`40ms` khi đếm chớp) tránh re-render toàn cây React theo tần số camera.
  - Dùng `isProcessingRef` làm khóa backpressure (`EyeTrackingProvider.tsx:1486-1515`) đảm bảo không xếp hàng dồn ứ frame vào MediaPipe nếu GPU/CPU yếu.
  - Dùng `Uint8Array(256)` LUT trong `lowLightFilter.ts` thay vì tính lũy thừa trên từng pixel.
- **Yếu tố có thể gây độ trễ / tốn CPU (Rủi ro tiềm ẩn)**:
  - **Nhiều vòng `requestAnimationFrame` chạy song song**: Khi mở `CameraHub` + `LiveCameraOverlay` + `CameraPreview` (với `lowLightFilterEnabled = true`), có đồng thời: (1) loop MediaPipe trong `EyeTrackingProvider`, (2) loop đồng bộ `nowTime` mỗi frame (`setNowTime(performance.now())` trong `CameraHub.tsx:70-78` — gây **re-render React `CameraHub` ở 60 FPS**!), (3) loop vẽ `LiveCameraOverlay`, (4) loop copy canvas trong `CameraPreview`, và (5) loop vẽ 3D trong `FaceMeshVisualizer` (nếu mở).
  - **Readback GPU→CPU khi bật Low-Light**: `ctx.getImageData(0, 0, 640, 480)` và `ctx.putImageData` trong `lowLightFilter.ts:220, 240` đọc/ghi ~1.2MB dữ liệu mỗi frame dù đã có `{ willReadFrequently: true }`, sẽ tiêu tốn CPU hơn trên thiết bị di động cấu hình thấp.
  - **Chưa có số liệu FPS / latency đo thực tế** trong repo.

### 1.4. Khả năng hoạt động trong điều kiện thiếu sáng
- **Đã triển khai**: `LowLightExposureProcessor` (`lowLightFilter.ts`) thực hiện Adaptive Gamma Correction (`minGamma = 0.48`, `targetLuminance = 125`), EMA (`0.1`), Deadband (`0.02`), kèm nút bật/tắt bằng cả chuột lẫn mắt (`#btn-camera-hub-low-light`) trong `CameraHub.tsx:362-392`.
- **Rủi ro tiềm ẩn**: Mặc định tính năng này đang tắt (`lowLightFilterEnabled: false` tại `EyeTrackingProvider.tsx:126`), người dùng suy giảm phải mở CameraHub để bật (hoặc cần người hỗ trợ bật giúp). Ngoài ra, thuật toán chỉ tăng sáng toàn cục (global gamma), chưa xử lý ngược sáng cục bộ (chỉ tối vùng mặt nhưng sáng nền).

### 1.5. Khả năng thích ứng với những người dùng khác nhau & Mức độ phù hợp với người suy giảm vận động
- **Phù hợp tốt**:
  - Người dùng **không cần dùng tay**: toàn bộ trang chủ, nói chuyện, AI chat, giải trí YouTube, bản đồ, danh bạ, cuộc gọi thoại, cài đặt đều bọc `EyeFocusable` (kích thước tối thiểu `48–64px`), tự đọc tên nút bằng TTS khi focus lướt qua.
  - Người chỉ chớp được mắt (hạn chế liếc xuống) có thể điều hướng xuống bằng **1 cái chớp mắt** (thay cho liếc xuống vốn dễ bị che đồng tử bởi mí trên), chọn bằng **2 cái chớp**, gọi khẩn cấp ngay lập tức bằng **3 cái chớp** (và fallback nhắm mắt 8 giây trên `SosPage`).
- **Rủi ro với người bệnh đặc thù**:
  - **Cửa sổ quyết định chớp mắt 700ms (`BLINK_DECISION_WINDOW_MS = 700`)**: Có thể quá gấp đối với người cao tuổi hoặc người suy nhược cơ mi mắt khi thực hiện chớp 2 hoặc 3 lần liên tiếp; ngược lại, người hay chớp mắt tự nhiên lặp lại nhanh có thể vô tình kích hoạt `DOWN` (1 chớp) sau mỗi lần chớp mắt thông thường nếu chớp kéo dài `25–750ms`! (Đây là rủi ro False Positive cần chú ý nhất vì ngưỡng dưới `25ms` khá nhỏ và chớp 1 cái kích hoạt `DOWN` sau 700ms không phân biệt chớp sinh lý với chớp chủ đích — ngoại trừ `cooldownTimer`).
  - **`settings.dwellTimeMs` (1500ms) không được nối vào thuật toán**: Dù khai báo trong `EyeControlSettings` (`types.ts:81`) và `EyeTrackingProvider.tsx:120`, bộ đếm gaze trong `processFaceMeshResults` dùng hằng số cứng `targetDwellMs = 220` (`line 951`) và thậm chí không có setter `setDwellTimeMs` trên context. Do đó người dùng không thể tùy chỉnh tốc độ dwell như hướng dẫn trong `OnboardingModal.tsx:415-417` nói.

### 1.6. Khả năng mở rộng và bảo trì
- **Điểm mạnh**:
  - Tách module sạch theo miền (`eye-control`, `virtual-keyboard`, `calls`, `entertainment`, `location`).
  - Component `EyeFocusable` + `EyeNavigationProvider` giúp bất kỳ nút/thẻ mới nào cũng tự động tham gia điều hướng mắt chỉ bằng cách bọc `<EyeFocusable>`.
- **Nợ kỹ thuật / Code trùng lặp hoặc dư thừa đã xác minh trong mã nguồn**:
  1. **Sai lệch giữa Code thực tế và Text UI/Comment cũ**:
     - `EyeTrackingProvider.tsx:539` comment ghi *"Chớp mắt 2 cái trong vòng 1.5s: CHỌN"*, `OnboardingModal.tsx:347-372` ghi *"Nháy mắt 2 lần (< 1.5 Giây) = CHỌN"* và *"Liếc mắt 4 hướng"*, nhưng code thực thi lại dùng `700ms` và **tắt hướng liếc `DOWN`** (`lines 917-919`), gán `1 chớp = DOWN`, `2 chớp = SELECT`, `3 chớp = EMERGENCY`.
  2. **Legacy duplication (`EyeTalkDashboard.tsx`, `src/utils/eyeTracker.ts`, `src/utils/keyboardLayout.ts`)**:
     - `EyeTalkDashboard.tsx` (route `'dev-dashboard'`) tự tải lại MediaPipe, tự mở camera riêng, tự chạy một Blink FSM khác với văn bản UI nói *"Nhắm 2.0s"* ở dòng 1107 nhưng logic ở dòng 693-813 lại là 1/2/3 chớp trong 700ms.
     - `src/utils/eyeTracker.ts` và `src/utils/keyboardLayout.ts` là bản cũ không còn được import ở đâu.
     - `EyeFocusRing.tsx` được định nghĩa nhưng không được component nào import (vì `EyeFocusable.tsx` tự render ring nội bộ).
  3. **Duplicate `eyeai:emergency` dispatch**: Khi 3-blink kích hoạt tại `EyeTrackingProvider.tsx:732-733`, `dispatchAction('EMERGENCY')` đã bắn `window.dispatchEvent(new CustomEvent('eyeai:emergency'))` ở dòng 336, rồi dòng 733 bắn thêm lần nữa (hiện không gây lỗi vì `SosPage` có cờ `hasSosTriggered`, nhưng là code thừa).
  4. **Các phần chưa hoàn thiện trong một số trang phụ**:
     - `HumanChatPage.tsx:218` gọi `startCall(..., 'video', ...)`, nhưng `CallProvider.tsx:225-320` chỉ thu `audio: true, video: false` và ghi `"Cuộc gọi EyeTalk (Thoại)"` — chưa hỗ trợ video call thực sự.
     - `LocationPage.tsx:48-52` (`handleShareLocation`) chỉ bật cờ `shareSuccess` nội bộ và phát TTS, chưa gửi API/tin nhắn tọa độ lên Supabase cho người thân.
     - `SosPage.tsx:39-45` (`startEmergencyCall`) chỉ mở modal đếm giờ giả lập và phát TTS, chưa thực hiện cuộc gọi Viễn thông/WebRTC thật hay gửi GPS lên server.
     - `AiPage.tsx:36-129` và `entertainmentService.ts:39-103` có nhánh fallback gọi trực tiếp API bằng `VITE_GEMINI_API_KEY` / `VITE_YOUTUBE_API_KEY` phía client nếu backend proxy không phản hồi (tiện cho static deploy nhưng nếu cấu hình biến `VITE_*` sẽ làm lộ API key ở bundle trình duyệt).
     - `GlobalEyeHUD.tsx:127, 236` render `<CameraPreview showOverlay={false} />` tạo thêm phần tử `<video>` gắn cùng `cameraStream`; ngoài ra `useEyeNavigation` / `EyeFocusable` dùng nhiều `button` lồng trong `div[tabindex=0]` (một số nút như `CameraHub.tsx:362-392` bọc `<button>` trong `<EyeFocusable>`).

### 1.7. Quyền riêng tư và bảo mật dữ liệu Camera
- **Xử lý cục bộ 100%**: Hình ảnh webcam (`MediaStream`) và kết quả `478 landmarks` **không bao giờ** được gửi lên máy chủ của EYEAI, Supabase hay Gemini; toàn bộ suy luận MediaPipe diễn ra trên trình duyệt người dùng.
- **Bảo vệ môi trường**: Kiểm tra `window.isSecureContext` (`HTTPS` hoặc `localhost`) trước khi gọi `getUserMedia()` (`EyeTrackingProvider.tsx:1562-1572`).
- **Điểm cần lưu ý**: `FaceMesh` được nạp từ CDN công cộng `cdn.jsdelivr.net` (`index.html:11`, `EyeTrackingProvider.tsx:436, 1470`) — phụ thuộc kết nối Internet lần đầu (hoặc cache trình duyệt) và không có thuộc tính `integrity` (SRI).
