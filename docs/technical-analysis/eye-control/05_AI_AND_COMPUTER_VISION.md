# 05. PHÂN TÍCH AI VÀ COMPUTER VISION TRONG EYEAI

## 1. Phân biệt rạch ròi: AI / Học sâu (Deep Learning) vs Thuật toán truyền thống

Một trong những điểm quan trọng nhất khi kiểm toán hoặc bảo vệ kỹ thuật dự án EYEAI là **không nhầm lẫn** giữa mô hình Deep Learning do thư viện bên ngoài cung cấp và các thuật toán hình học/tín hiệu/trạng thái do đội ngũ phát triển tự xây dựng.

| Thành phần | Bản chất kỹ thuật | Thuộc về ai? | Có phải AI/ML không? | File triển khai trong EYEAI |
| :--- | :--- | :--- | :--- | :--- |
| **Google MediaPipe FaceMesh** | Pipeline 2 mạng nơ-ron sâu (BlazeFace detector + FaceMesh Landmark CNN với Attention Mesh / Iris sub-model) | Google MediaPipe (chạy client-side qua CDN WASM/WebGL) | **Có (Deep Learning / CNN)** — Pre-trained model, không huấn luyện lại | Nạp trong [`index.html`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/index.html#L10-L11) và [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L427-L457), [`L1468-L1510`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L1468-L1510) |
| **Low-Light Exposure Filter** | Xử lý ảnh cổ điển: Rec. 601 Luminance + EMA + Log-Gamma + 256-entry LUT | **EYEAI tự xây dựng** | **Không** (Digital Image Processing / Signal Processing) | [`lowLightFilter.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts) |
| **EAR (Eye Aspect Ratio)** | Hình học Euclid 2D (tỷ lệ khoảng cách dọc/ngang mí mắt) | Công thức chuẩn (Soukupová & Čech 2016), **EYEAI triển khai** | **Không** (Geometric Algorithm) | [`eyeTracker.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L156-L166) |
| **Canthal Baseline Projection & Iris Tracking** | Hình học vector trực giao: chiếu tâm mống mắt lên hệ quy chiếu gắn với hai khóe mắt + hợp nhất theo trọng số EAR | **EYEAI tự thiết kế & triển khai** | **Không** (Geometric Algorithm) | [`eyeTracker.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L188-L261) |
| **Head Yaw / Head Pitch Estimation** | Hình học tỷ lệ khoảng cách mũi-má và trán-mũi-cằm | **EYEAI tự triển khai** | **Không** (Geometric Heuristic) | [`eyeTracker.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L265-L285) |
| **Gaze Smoothing & Auto-Zero & Drift Compensation** | Bộ lọc thông thấp IIR bậc 1 (Exponential Moving Average — EMA) | **EYEAI tự triển khai** | **Không** (Digital Signal Processing) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L827-L898) |
| **Blink Count FSM & Gaze Dwell / Re-Arm FSM** | Máy trạng thái hữu hạn xác định (Deterministic FSM) theo thời gian, ngưỡng, hysteresis, cooldown | **EYEAI tự thiết kế & triển khai** | **Không** (Rule-based Temporal FSM) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L538-L1045) |
| **5-Point Calibration** | Thống kê phi tham số (Median 32 mẫu/hướng) + tỷ lệ ngưỡng 50% biên độ | **EYEAI tự triển khai** | **Không** (Statistical Calibration) | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L1778-L1954) |
| **Eye Navigation & Focus Trap** | Tìm kiếm lưới `(row, col)` + Spatial 2D Bounding Box Scoring + Scope Stack | **EYEAI tự triển khai** | **Không** (Spatial Heuristic & UI Tree) | [`EyeNavigationProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeNavigationProvider.tsx#L276-L438) |
| **Trợ lý AI giao tiếp (Google Gemini)** | Mô hình ngôn ngữ lớn (LLM) qua `@google/genai` SDK / REST API | Google Gemini (Cloud API) + Prompt hệ thống do EYEAI viết | **Có (Generative AI / LLM)** | [`AiPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/AiPage.tsx#L36-L129), [`server.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/server.ts#L46-L144), [`ai-chat.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/netlify/functions/ai-chat.ts) |
| **Text-to-Speech (TTS)** | Speech Synthesis tích hợp OS/trình duyệt hoặc Google Translate TTS proxy | OS/Browser/Google + Audio orchestration của EYEAI | Có sử dụng engine TTS ngoài (không tự train) | [`speech.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/utils/speech.ts), [`tts.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/netlify/functions/tts.ts) |

---

## 2. Cơ chế hoạt động của Google MediaPipe FaceMesh trong EYEAI

### 2.1. Cách EYEAI cấu hình và gọi mô hình

Trong [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L1468-L1480):
```ts
const faceMesh = new (window as any).FaceMesh({
  locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
faceMesh.onResults(processFaceMeshResults);
```

- **`maxNumFaces: 1`**: Giới hạn suy luận tối đa 1 khuôn mặt để giảm tải CPU/GPU, phù hợp ngữ cảnh 1 người dùng suy giảm trước camera.
- **`refineLandmarks: true`**: Tham số then chốt kích hoạt **Attention Mesh / Iris Refinement sub-network**, mở rộng đầu ra từ **468** landmarks khuôn mặt thành **478** landmarks (bổ sung 5 điểm mống mắt trái `468–472` và 5 điểm mống mắt phải `473–477`).
- **`minDetectionConfidence: 0.6` & `minTrackingConfidence: 0.6`**: Yêu cầu độ tự tin tối thiểu 60% ở pha phát hiện vùng mặt (BlazeFace) và pha theo dõi landmark liên khung hình.

### 2.2. Dữ liệu đầu vào và đầu ra của MediaPipe FaceMesh

1. **Đầu vào (`{ image: frameSource }`)**:
   - Khi `lowLightFilterEnabled === false` (mặc định): Nhận trực tiếp `HTMLVideoElement` (`640×480`).
   - Khi `lowLightFilterEnabled === true`: Nhận `HTMLCanvasElement` đã qua `LowLightExposureProcessor.processFrame(video)`.
2. **Quá trình suy luận nội bộ của MediaPipe (hộp đen thư viện ngoài)**:
   - Pha 1 (khi chưa track hoặc mất track): Bộ phát hiện khuôn mặt phát hiện bounding box khuôn mặt.
   - Pha 2: Cắt/chuẩn hóa ROI khuôn mặt và đưa qua mạng neural dự đoán 468 tọa độ 3D. Khi `refineLandmarks: true`, vùng mắt và môi được tinh chỉnh thêm để dự đoán chính xác viền mí mắt và 10 điểm mống mắt (`468..477`).
3. **Đầu ra (`results.multiFaceLandmarks`)**:
   - Mảng các khuôn mặt; EYEAI lấy `results.multiFaceLandmarks?.[0]` (`EyeTrackingProvider.tsx:465`).
   - Mỗi điểm là `{ x, y, z }`:
     - **Normalized Coordinates**: `x ∈ [0, 1]` (từ trái sang phải ảnh camera gốc **chưa lật gương**), `y ∈ [0, 1]` (từ trên xuống dưới ảnh gốc).
     - **`z`**: Độ sâu tương đối (pseudo-depth) chuẩn hóa theo tỉ lệ chiều rộng khuôn mặt, lấy tâm khuôn mặt gần gốc 0 (như chính [`FaceMeshVisualizer.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/FaceMeshVisualizer.tsx#L500) ghi chú: *"Tọa độ chiều sâu Z được suy diễn tương đối từ mô hình hình học khuôn mặt MediaPipe, không phải phép đo độ sâu vật lý (LiDAR/ToF)"*).

---

## 3. Phân tích vai trò AI thực sự và đóng góp kỹ thuật riêng của EYEAI

### 3.1. Trả lời trực diện các câu hỏi cốt lõi về AI

- **AI thực sự được sử dụng ở đâu?**
  1. **Thị giác máy tính**: Google MediaPipe FaceMesh suy luận 478 facial/iris landmarks từ pixel video (`EyeTrackingProvider.tsx:1510`, `EyeTalkDashboard.tsx:485`).
  2. **Ngôn ngữ tự nhiên**: Google Gemini API trả lời hội thoại hỗ trợ người dùng tại `AiPage.tsx` và `EyeTalkDashboard.tsx`.
- **MediaPipe xử lý những công việc nào?**
  - Chỉ làm đúng nhiệm vụ **Landmark Detection & Tracking** (biến ảnh pixel RGB thành 478 tọa độ `(x, y, z)`). MediaPipe **không** tính EAR, **không** biết người dùng đang nhìn trái/phải/lên/xuống, **không** đếm chớp mắt, và **không** điều khiển UI.
- **EAR có phải mô hình AI không?**
  - **Không**. EAR là công thức hình học đơn giản: tỷ lệ giữa khoảng cách dọc mí mắt và chiều rộng khóe mắt (`eyeTracker.ts:156-166`).
- **FSM có phải AI không?**
  - **Không**. Blink FSM và Gaze FSM là thuật toán logic xác định theo luật (rule-based) kết hợp đếm thời gian (`performance.now()`), ngưỡng số học và chống nhiễu hysteresis (`EyeTrackingProvider.tsx:538-1045`).
- **Sự khác biệt giữa nhận diện landmark và nhận diện cử chỉ:**
  - *Nhận diện landmark (MediaPipe AI)*: Bài toán trích xuất vị trí giải phẫu trên từng khung hình tĩnh/theo dõi (`Frame → 478 points`).
  - *Nhận diện cử chỉ (EYEAI)*: Bài toán **hình học không gian + phân tích chuỗi thời gian** (`478 points → EAR / Canthal Gaze → EMA → Hysteresis → Dwell 220ms / Blink 1-2-3 trong 700ms → EyeAction`).
- **Giá trị kỹ thuật mà EYEAI bổ sung trên kết quả của MediaPipe:**
  1. **Khắc phục lỗi đảo hướng nhìn xuống do sụp mí (Eyelid-Droop Inversion Fix)** bằng hệ quy chiếu khóe mắt cố định trên xương sọ (`Canthal Baseline Projection` trong `eyeTracker.ts:188-261`) thay vì đo khoảng cách tới mí mắt như phiên bản cũ `src/utils/eyeTracker.ts`.
  2. **Hợp nhất hai mắt theo trọng số độ mở mắt (`EAR-weighted dual-eye fusion`)** để mắt mở to hơn (ít bị che khuất hơn) đóng góp trọng số cao hơn.
  3. **Kiến trúc chống nhiễu đa tầng cho người suy giảm**: Auto-zero 35 frame đầu, drift compensation khi nhìn tâm, post-blink lockout 300ms, blink priority lock (khóa gaze khi đang chớp mắt), re-arm bắt buộc về `CENTER` 140ms, cooldown bất đối xứng (1.2s / 2.5s / 3.0s / 1.0s).
  4. **Bộ tiền xử lý thiếu sáng thời gian thực (`lowLightFilter.ts`)** chạy mượt bằng LUT 256-entry + EMA + deadband trước khi đưa ảnh vào MediaPipe.
  5. **Động cơ điều hướng & Focus Trap (`EyeNavigationProvider.tsx`, `eyeFocusAutoScroll.ts`)** biến lệnh mắt rời rạc thành trải nghiệm toàn ứng dụng (nhắn tin, gọi thoại, SOS, YouTube, bản đồ, đọc tiếng Việt).
- **Hệ thống có cần tự huấn luyện mô hình AI không?**
  - **Không cần thiết trong kiến trúc hiện tại**. MediaPipe FaceMesh đã giải quyết tốt bài toán định vị 478 điểm mốc phổ quát trên khuôn mặt người, còn cá nhân hóa cho từng người dùng suy giảm (độ mở mắt khác nhau, biên độ liếc khác nhau) được giải quyết bằng **hiệu chuẩn 5 hướng (5-Point Calibration)** và **Auto-Zero / Drift Compensation** ngay trên trình duyệt mà không cần thu thập dữ liệu hay train lại mạng nơ-ron.
