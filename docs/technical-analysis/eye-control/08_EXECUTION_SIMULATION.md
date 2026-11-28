# 08. MÔ PHỎNG QUÁ TRÌNH THỰC THI THỰC TẾ (EXECUTION SIMULATION)

> **Lưu ý minh bạch số liệu**: Toàn bộ giá trị tọa độ landmark, độ sáng pixel và mốc thời gian `performance.now()` trong tài liệu này là **số liệu mô phỏng tổng hợp (synthetic simulation)** được thiết kế sao cho khớp chính xác với các công thức toán học, ngưỡng kẹp và logic FSM trong mã nguồn hiện hành (`eyeTracker.ts`, `EyeTrackingProvider.tsx`, `lowLightFilter.ts`, `EyeNavigationProvider.tsx`). Chúng **không phải** số đo benchmark thực nghiệm trên phần cứng thật.

---

## Kịch bản 1: Liếc mắt sang PHẢI để chuyển focus từ `card-entertainment` sang `card-location`, sau đó Chớp mắt 2 lần để CHỌN

### Bối cảnh khởi tạo (Simulated State)
- Người dùng đang ở `HomePage`, `activeFocusId = 'card-entertainment'` (`row = 1, col = 0`).
- Hệ thống đã hoàn thành 35 frame warm-up: `initFramesCount = 35`, `neutralRunningX = 0.000`, `neutralRunningY = 0.000`, `neutralRunningEAR = 0.300`.
- Cấu hình ngưỡng mặc định (`isCalibrated = false`): `threshRight = 0.026`, `threshUp = 0.018`, `relRight = 0.026 * 0.55 = 0.0143`, `blinkThresh = clamp(0.300 * 0.78, 0.16, 0.28) = 0.234`.
- Trạng thái ban đầu: `reArmedRef = true`, `cooldownTimer = 0`, `blinkCountInGesture = 0`, `isEyesClosed = false`.

---

### Giai đoạn A: Liếc sang PHẢI để điều hướng (`t = 1000ms` → `t = 1230ms`)

#### Frame 1 tại `t = 1000ms`: Mắt bắt đầu liếc sang phải
1. **MediaPipe FaceMesh** trả về `landmarks` (478 điểm). Giả lập tại mắt trái (`33, 133, 159, 145, 158, 144, 468`) và mắt phải (`362, 263, 386, 374, 385, 373, 473`):
   - Mắt trái: $P_{33}=(0.35, 0.40), P_{133}=(0.43, 0.40) \Rightarrow M_L=(0.39, 0.40), L_L = 0.08, \hat{u}_L=(1, 0), \hat{v}_L=(0, 1)$.
   - Mí mắt mở: $d(159,145)=d(158,144)=0.024 \Rightarrow \text{EAR}_{\text{left}} = \frac{0.024+0.024}{2\times 0.08} = 0.300$.
   - Khi nhìn sang phải màn hình (trong ảnh gốc chưa lật, đồng tử lệch sang trái ảnh): $I_L = (0.386, 0.40)$.
   - Độ lệch: $\vec{d}_L = (-0.004, 0) \Rightarrow \text{leftIrisH} = -0.004 / 0.08 = -0.050$, $\text{leftIrisV} = 0$.
   - Tương tự mắt phải ($L_R = 0.08$, $\text{EAR}_{\text{right}} = 0.300$, đồng tử lệch $-0.004$): $\text{rightIrisH} = -0.050, \text{rightIrisV} = 0$.
2. **`analyzeEyes(landmarks)`** (`eyeTracker.ts`):
   - Trọng số: $w_L = w_R = 0.300 - 0.08 = 0.220$.
   - $\text{rawGazeX} = -\frac{0.22 \cdot (-0.050) + 0.22 \cdot (-0.050)}{0.44} = +0.050$.
   - $\text{rawGazeY} = 0.000$.
3. **`processFaceMeshResults()`** (`EyeTrackingProvider.tsx`):
   - Blink FSM: `avgEAR = 0.300 >= 0.234` → `isClosedNow = false`.
   - `isGazeAllowed = true` (`0.300 >= 0.234 + 0.015 = 0.249`, hết cooldown, `blinkCount = 0`).
   - EMA làm mượt (`alpha = 0.45`, từ `smoothGazeX = 0`):
     $$\text{smoothGazeX} = 0.45 \times 0.050 + 0.55 \times 0 = 0.0225$$
   - Tỷ lệ chuẩn hóa: $\text{normH} = 0.0225 / 0.026 = 0.865 < 1.0 \Rightarrow \text{detectedDir} = \text{'CENTER'}$. (Chưa vượt ngưỡng do bộ lọc EMA đang tăng dần).

#### Frame 2 tại `t = 1033ms`: Tiếp tục giữ mắt nhìn phải (`rawGazeX = +0.050`)
- $\text{smoothGazeX} = 0.45 \times 0.050 + 0.55 \times 0.0225 = 0.034875$.
- $\text{normH} = 0.034875 / 0.026 = 1.341 \ge 1.0$ và $> 1.05 \times 0 \Rightarrow \text{detectedDir} = \text{'RIGHT'}$.
- Cập nhật Dwell: `currentGazeCandidate = 'RIGHT'`, `gazeDwellStart = 1033`, `actionProg = 0%`.

#### Các Frame từ `t = 1066ms` đến `t = 1230ms`
- Người dùng giữ ánh mắt nhìn phải trong ~200–220ms (`smoothGazeX` hội tụ dần về `0.050`).
- Tại `t = 1260ms`: `dwellDuration = 1260 - 1033 = 227ms >= targetDwellMs (220ms)`.
- Kiểm tra điều kiện bắn lệnh: `!gazeFiredInThisLook (true) && reArmedRef (true) && cooldownTimer <= 0 (true)`.
- **Kích hoạt lệnh**:
  1. `dispatchAction('RIGHT')` gọi callback trong `EyeNavigationProvider`.
  2. `navigate('RIGHT')` thấy `card-entertainment` có `row=1, col=0`, tìm cùng `row=1` có `col > 0` → tìm được **`card-location`** (`row=1, col=1`).
  3. Cập nhật `activeFocusId = 'card-location'`, gọi `ensureEyeFocusVisible('card-location')`, trả về `true`.
  4. Vì `executed === true`:
     - `EyeTrackingProvider` phát `speakVietnamese('Sang phải')`.
     - `EyeFocusable` trên `card-location` sau `100ms` đọc tên thẻ (`speakVietnamese('Vị trí')`), vòng phát sáng `#00E5FF` trượt sang `card-location` nhờ `layoutId="eye-focus-glide-ring"`.
     - `cooldownTimer = 2500ms`, `reArmedRef = false`, `smoothGazeX = 0`, `gazeDirState = 'CENTER'`.

---

### Giai đoạn B: Đưa mắt về tâm & Chớp mắt 2 lần để CHỌN (`t = 3760ms` → `t = 4920ms`)

1. Đến `t = 3760ms`: `cooldownTimer` đã đếm lùi từ `2500ms` về `0`. Khi người dùng nhìn thẳng trước đó $> 140\text{ms}$, `reArmedRef` đã trở lại `true`.
2. **Chớp mắt lần 1**:
   - `t = 3800ms`: Mắt khép, `avgEAR = 0.140 < blinkThresh (0.234)`. `isEyesClosed = true`, `closeStartTime = 3800`. Gaze bị khóa cứng về `CENTER`.
   - `t = 3980ms`: Mắt mở lại, `avgEAR = 0.295 >= 0.234 + 0.015 (0.249)`. `blinkDuration = 3980 - 3800 = 180ms` (hợp lệ trong `[25, 750]`).
   - `blinkCountInGesture` chuyển `0 -> 1`, `firstBlinkTime = 3980`, `lastBlinkEndTime = 3980`.
   - HUD hiển thị: `CHỚP: 1 / 3` và đếm ngược từ `0.7s`.
3. **Chớp mắt lần 2** (trước khi hết cửa sổ 700ms):
   - `t = 4120ms`: Mắt khép lần 2, `avgEAR = 0.135 < 0.234`. `isEyesClosed = true`, `closeStartTime = 4120`.
   - `t = 4280ms`: Mắt mở lại, `avgEAR = 0.300 >= 0.249`. `blinkDuration = 160ms` (hợp lệ).
   - Khoảng cách từ lần 1: `interval = 4280 - 3980 = 300ms <= 950ms`.
   - `blinkCountInGesture` chuyển `1 -> 2`, `lastBlinkEndTime = 4280`.
   - HUD hiển thị: `CHỚP: 2 / 3` (chờ 0.7s để Chọn hoặc chớp cái 3 để SOS).
4. **Hết cửa sổ chờ cho cái chớp thứ 3 (`t = 4985ms`)**:
   - `elapsedSinceSecondBlink = 4985 - 4280 = 705ms >= BLINK_DECISION_WINDOW_MS (700ms)` và mắt đang mở.
   - `blinkCountInGesture = 0`, `selectSuccessUntil = 4985 + 1200`.
   - Gọi `dispatchAction('SELECT')` → `EyeNavigationProvider.triggerSelect()` → `card-location` `handleSelect()`:
     - Kiểm tra debounce `350ms` (pass) → flash chọn `180ms` → `speakVietnamese('Đã chọn Vị trí')` → `onNavigate('location')` → chuyển sang `LocationPage`!
   - `cooldownTimer = 2500ms`.

---

## Kịch bản 2: Bật Hỗ trợ thiếu sáng (`lowLightFilter.ts`) trong phòng tối

### Dữ liệu giả lập đầu vào
- Phòng tối với pixel webcam trung bình $R = 30, G = 30, B = 30, A = 255$.
- `lowLightFilterEnabled = true`, `LowLightExposureProcessor` ở trạng thái khởi đầu (`smoothedLuminance = null`, `currentGamma = 1.0`).

### Quá trình tính toán từng bước (`processFrame`)
1. `ctx.drawImage(video, 0, 0, 640, 480)` và `ctx.getImageData(0, 0, 640, 480)`.
2. `estimateMeanLuminance(data, 8)`:
   $$L_{\text{raw}} = 0.299(30) + 0.587(30) + 0.114(30) = 30.0$$
3. `updateLuminanceAndGamma(null, 1.0, 30.0)`:
   - Frame đầu: $L_{\text{smooth}} = 30.0$.
   - `computeAdaptiveGamma(30.0)`:
     $$\gamma_{\text{raw}} = \frac{\ln(125/255)}{\ln(30/255)} = \frac{\ln(0.4902)}{\ln(0.1176)} = \frac{-0.7129}{-2.1401} \approx 0.3331$$
   - Kẹp trong `[0.48, 1.0]` → **`gamma = 0.48`**.
   - $|0.48 - 1.0| = 0.52 \ge 0.02$ (`deadband`) → `lutUpdated = true`.
4. `buildGammaLUT(0.48)`:
   - Với pixel đầu vào $i = 30$:
     $$\text{LUT}[30] = \text{round}\left(255 \times (30/255)^{0.48}\right) = \text{round}(255 \times 0.3586) = 91$$
5. `applyGammaLUT` biến đổi toàn bộ pixel $(30, 30, 30, 255) \rightarrow (91, 91, 91, 255)$ (tăng độ sáng gấp ~3 lần nhưng giữ nguyên độ tương phản tương đối và không vượt $\gamma_{\min}=0.48$).
6. `ctx.putImageData` ghi ngược lên canvas, `EyeTrackingProvider` truyền `HTMLCanvasElement` này vào `faceMesh.send({ image: processed })`, đồng thời `CameraPreview` sao chép hình sáng rõ này lên HUD cho người dùng quan sát.

---

## Kịch bản 3: Trường hợp biên — Đụng biên điều hướng & Mất khuôn mặt

1. **Đụng biên điều hướng**:
   - Đang focus ở `card-location` (`row=1, col=1`), người dùng tiếp tục liếc `RIGHT` đủ `220ms`.
   - `EyeNavigationProvider.navigate('RIGHT')` không tìm thấy cột nào `> 1` ở `row=1` (và pha 2 Spatial cũng không có phần tử nào có `dx > 4`) → trả về `false`.
   - `EyeTrackingProvider` nhận `executed === false`: đặt `cooldownTimer = 1000ms` (ngắn hơn chuẩn 2500ms để người dùng đổi hướng nhanh), hiện trạng thái `"Không có phần tử bên phải"` và đọc `"Không có phần tử theo hướng này"`.
2. **Mất khuôn mặt quá 2 giây**:
   - Người dùng nghiêng hẳn ra ngoài khung hình trong 65 frame (~2.1 giây).
   - `noFaceFramesCount` vượt `60` → `initFramesCount = 0`.
   - `trackingState` chuyển `faceDetected = false`, `gazeDirection = 'UNKNOWN'`, `blinkCount = 0`.
   - Khi người dùng quay lại trước camera, 35 frame đầu tự động căn lại `neutralRunningX/Y/EAR` theo tư thế mới trước khi cho phép nhận lệnh liếc.
