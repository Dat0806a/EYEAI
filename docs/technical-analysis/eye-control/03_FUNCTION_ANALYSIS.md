# 03. PHÂN TÍCH CHI TIẾT TỪNG HÀM — PHẦN 1: CORE EYE-CONTROL

> **Cấu trúc phân tích hàm**: Bộ phân tích hàm được chia thành 4 tài liệu liên kết chặt chẽ để bao phủ 100% không bỏ sót bất kỳ hàm nhỏ, callback, event handler hay custom hook nào:
> 1. **[`03_FUNCTION_ANALYSIS.md`](./03_FUNCTION_ANALYSIS.md)** (tài liệu này): Core Vision, Math, Filter, Camera & FSM (`eyeTracker.ts`, `lowLightFilter.ts`, `EyeTrackingProvider.tsx`, `useEyeTracking.ts`).
> 2. **[`03_FUNCTION_ANALYSIS_NAVIGATION_HUD.md`](./03_FUNCTION_ANALYSIS_NAVIGATION_HUD.md)**: Điều hướng không gian, Focus Trap, Auto-Scroll, Camera Overlay, Hub & HUD.
> 3. **[`03_FUNCTION_ANALYSIS_KEYBOARD_PAGES.md`](./03_FUNCTION_ANALYSIS_KEYBOARD_PAGES.md)**: Bàn phím ảo, Bộ gõ Telex, `App.tsx`, toàn bộ trang Người suy giảm & UI wrappers, `EyeTalkDashboard.tsx`.
> 4. **[`03_FUNCTION_ANALYSIS_SERVICES_BACKEND.md`](./03_FUNCTION_ANALYSIS_SERVICES_BACKEND.md)**: TTS Speech, WebRTC Calls, YouTube, Location/GPS, Services, Hooks & Backend Proxies.

---

## 1. File `src/modules/eye-control/eyeTracker.ts`

### 1.1. `dist(p1, p2)`
- **Vị trí**: [`eyeTracker.ts:10-12`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L10-L12)
- **Signature**: `export function dist(p1: Point, p2: Point): number`
- **Mục đích**: Tính khoảng cách Euclid 3D giữa hai điểm mốc `(x, y, z)`.
- **Gọi khi / Ai gọi**: Export để dùng ngoài (được `EyeTalkDashboard.tsx:4` import nhưng không gọi trực tiếp trong runtime chính).
- **Tham số & Trả về**: `p1, p2: Point` → `number` $= \sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}$.
- **Logic & Biên**: Dùng `(p1.z || 0) - (p2.z || 0)` tránh `NaN` nếu `z` thiếu. Không side effect. Độ phức tạp: $O(1)$ thời gian/không gian.

### 1.2. `dist2D(p1, p2)`
- **Vị trí**: [`eyeTracker.ts:14-16`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L14-L16)
- **Signature**: `export function dist2D(p1: Point, p2: Point): number`
- **Mục đích**: Tính khoảng cách Euclid trên mặt phẳng ảnh 2D `(x, y)` (bỏ qua `z` để tránh nhiễu pseudo-depth của MediaPipe).
- **Ai gọi**: Hàm nội bộ `analyzeEyes()` (dòng 156–282).
- **Tham số & Trả về**: `p1, p2: Point` → `Math.hypot(p1.x - p2.x, p1.y - p2.y)`. $O(1)$.

### 1.3. `analyzeEyes(landmarks)` & hàm nội bộ `getPoint(idx)`
- **Vị trí**: [`eyeTracker.ts:129-326`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts#L129-L326) (`getPoint` ở dòng 134–136).
- **Signature**: `export function analyzeEyes(landmarks: Point[] | undefined): EyeMetrics | null`
- **Mục đích**: Trích xuất toàn bộ thông số hình học của mắt (EAR, hướng mống mắt theo hệ khóe mắt, tư thế đầu, độ tin cậy) từ 478 điểm mốc MediaPipe.
- **Khi nào được gọi / Ai gọi**: Mỗi khung hình có khuôn mặt trong `EyeTrackingProvider.tsx:514` (`processFaceMeshResults`), `EyeTalkDashboard.tsx:597`, `lowLightFilter.test.tsx:449`, `scripts/test-eye-control.ts`.
- **Đầu vào / Đầu ra**: `landmarks?: Point[]` → `EyeMetrics | null` (trả về `null` nếu thiếu hoặc `landmarks.length < 468`).
- **Đoạn code cốt lõi & Giải thích từng dòng**:
```ts
// EAR mắt trái (dòng 156-159)
const left_v1 = dist2D(leftTopPt, leftBottomPt);     // Cặp mí dọc 1: (159, 145)
const left_v2 = dist2D(leftTopPt2, leftBottomPt2);   // Cặp mí dọc 2: (158, 144)
const left_h = Math.max(0.001, dist2D(leftOuterPt, leftInnerPt)); // Ngang khóe (33, 133), chặn chia 0
const leftEAR = (left_v1 + left_v2) / (2 * left_h);

// Chiếu Canthal Baseline cho mắt trái (dòng 194-212)
const blx_L = leftInnerPt.x - leftOuterPt.x;
const bly_L = leftInnerPt.y - leftOuterPt.y;
const len_L = Math.max(0.001, Math.hypot(blx_L, bly_L));
const ux_L = blx_L / len_L; const uy_L = bly_L / len_L; // Trục đơn vị dọc mắt
const vx_L = -uy_L; const vy_L = ux_L;                  // Vuông góc hướng xuống trong tọa độ ảnh
const dx_L = leftIris.x - midX_L; const dy_L = leftIris.y - midY_L;
const leftIrisH_proj = (dx_L * ux_L + dy_L * uy_L) / len_L;
const leftIrisV_proj = (dx_L * vx_L + dy_L * vy_L) / len_L;

// Hợp nhất hai mắt theo trọng số độ mở mắt & đảo dấu X cho camera lật gương (dòng 252-260)
const wL = Math.max(0.01, leftEAR - 0.08);
const wR = Math.max(0.01, rightEAR - 0.08);
const wSum = wL + wR;
const rawGazeX = -((wL * leftIrisH_proj + wR * rightIrisH_proj) / wSum);
const rawGazeY = (wL * leftIrisV_proj + wR * rightIrisV_proj) / wSum;
```
- **Xử lý lỗi / Biên**:
  - `landmarks.length < 468` → `null`.
  - `getPoint(idx)` fallback `{ x: 0, y: 0, z: 0 }`.
  - Nếu `leftIris` hoặc `rightIris` bằng `(0,0)` (khi `refineLandmarks=false`), fallback về trung điểm khóe/mí (dòng 173–186).
  - Mọi phép chia đều chặn mẫu số $\ge 0.001$ hoặc $\ge 0.01$.
- **Side effects**: Không (thuần túy / pure function). Độ phức tạp: $O(1)$ thời gian và bộ nhớ.
- **Ví dụ mô phỏng**: Input 478 điểm với mắt mở `0.024` trên bề rộng `0.08`, đồng tử ở giữa khóe → `avgEAR = 0.300`, `rawGazeX = 0`, `rawGazeY = 0`, `confidence = 0.95`.

---

## 2. File `src/modules/eye-control/lowLightFilter.ts`

### 2.1. `clamp(value, min, max)`
- **Vị trí**: [`lowLightFilter.ts:33-35`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L33-L35)
- **Signature**: `function clamp(value: number, min: number, max: number): number`
- **Mục đích**: Kẹp số thực trong đoạn `[min, max]`. Ai gọi: `computeAdaptiveGamma`, `updateLuminanceAndGamma`. $O(1)$.

### 2.2. `estimateMeanLuminance(data, sampleStep)`
- **Vị trí**: [`lowLightFilter.ts:41-62`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L41-L62)
- **Signature**: `export function estimateMeanLuminance(data: Uint8ClampedArray, sampleStep?: number): number`
- **Mục đích**: Ước lượng độ sáng cảm nhận trung bình Rec. 601 (`0.299R + 0.587G + 0.114B`) với bước nhảy `sampleStep = 8`.
- **Ai gọi**: `LowLightExposureProcessor.processFrame()`, unit test.
- **Biên**: `totalPixels <= 0` trả về `0`; `stride = Math.max(1, Math.floor(sampleStep))`.
- **Độ phức tạp**: Thời gian $O(N / \text{stride})$ với $N = W \times H$; Không gian $O(1)$.

### 2.3. `computeAdaptiveGamma(smoothedLuminance, config)`
- **Vị trí**: [`lowLightFilter.ts:68-91`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L68-L91)
- **Signature**: `export function computeAdaptiveGamma(smoothedLuminance: number, config?: LowLightFilterConfig): number`
- **Mục đích**: Tính hệ số $\gamma$ để kéo $L_{\text{smooth}}$ lên $L_{\text{target}} = 125$, kẹp trong $[0.48, 1.0]$.
- **Nhánh**: `!Number.isFinite(smoothedLuminance)` hoặc `clampedLum >= targetLuminance` → trả `maxGamma` (`1.0`). Dùng `Math.max(1, clampedLum)` tránh $\ln(0)$. $O(1)$.

### 2.4. `buildGammaLUT(gamma, outLut)`
- **Vị trí**: [`lowLightFilter.ts:97-113`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L97-L113)
- **Signature**: `export function buildGammaLUT(gamma: number, outLut?: Uint8Array): Uint8Array`
- **Mục đích**: Điền bảng tra 256 phần tử `out = round(255 * (i/255)^gamma)`. Nếu `|gamma - 1.0| < 1e-4` điền ánh xạ đồng nhất `lut[i] = i`. Tái sử dụng `outLut` nếu dài đúng 256 để tránh cấp phát rác GC. $O(256) = O(1)$.

### 2.5. `applyGammaLUT(data, lut)`
- **Vị trí**: [`lowLightFilter.ts:118-125`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L118-L125)
- **Signature**: `export function applyGammaLUT(data: Uint8ClampedArray, lut: Uint8Array): void`
- **Mục đích**: Biến đổi tại chỗ (in-place) các kênh `R, G, B` qua `lut`, giữ nguyên kênh Alpha (`i + 3`).
- **Side effects**: Ghi đè trực tiếp mảng pixel `data`. Độ phức tạp: $O(W \times H)$ thời gian, $O(1)$ không gian phụ.

### 2.6. `updateLuminanceAndGamma(previousSmoothedLuminance, previousGamma, rawLuminance, config)`
- **Vị trí**: [`lowLightFilter.ts:130-152`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L130-L152)
- **Mục đích**: Cập nhật EMA độ sáng (`alpha = 0.1`) và quyết định có dựng lại LUT hay không theo ngưỡng deadband (`0.02`). Trả về `{ smoothedLuminance, gamma, lutUpdated }`. $O(1)$.

### 2.7. Class `LowLightExposureProcessor`
- **Vị trí**: [`lowLightFilter.ts:157-268`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/lowLightFilter.ts#L157-L268)
- **Trạng thái nội bộ**: `config`, `canvas`, `ctx`, `lut = Uint8Array(256)`, `smoothedLuminance`, `currentGamma = 1.0`, `hasBuiltInitialLut = false`.
- **Các phương thức**:
  1. `constructor(config)` (166–172): Hợp nhất config và khởi tạo `lut` đồng nhất.
  2. `getState()` (174–179): Trả `{ smoothedLuminance, currentGamma }`.
  3. `ensureCanvas(width, height)` (181–201): Tạo 1 `<canvas>` duy nhất kèm context `'2d'` (`willReadFrequently: true`), chỉ resize khi kích thước video thay đổi. Trả `null` nếu thiếu `document`.
  4. `processFrame(video)` (207–244): Kiểm tra `videoWidth/Height > 0` → `ensureCanvas` → `drawImage` → `getImageData` → `estimateMeanLuminance` → `updateLuminanceAndGamma` → dựng lại `lut` nếu lần đầu hoặc vượt deadband → nếu `currentGamma < 0.999` gọi `applyGammaLUT` và `putImageData` → trả về `this.canvas`.
  5. `reset()` (249–254): Reset EMA/gamma/LUT mà giữ nguyên canvas để tái dùng khi bật/tắt camera nhanh.
  6. `dispose()` (259–267): Gọi `reset()`, đặt `canvas.width = 0; canvas.height = 0` và giải phóng ref khi unmount.

---

## 3. File `src/modules/eye-control/EyeTrackingProvider.tsx`

### 3.1. `EyeTrackingProvider({ children })`
- **Vị trí**: [`EyeTrackingProvider.tsx:64-2089`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx#L64-L2089)
- **Mục đích**: Component Provider cấp cao quản lý toàn bộ luồng camera, MediaPipe, FSM cử chỉ, hiệu chuẩn, simulator và phát âm thanh phản hồi.
- **State & Refs trọng yếu**:
  - `settings` (`localStorage: luckydream_eye_settings` + `luckyDream.speaker*` + `luckydream_eye_enabled`).
  - `calibration` (`localStorage: eyeai_calibration` / `luckydream_eye_calibration`; ép `isCalibrated: false` khi khởi động).
  - `trackingState` & `latestTelemetryRef` & `latestMetricsRef`.
  - Refs bộ lọc/FSM: `smoothGazeX/Y`, `neutralRunningX/Y/EAR`, `initFramesCount`, `noFaceFramesCount`, `gazeDirState`, `currentGazeCandidate`, `gazeDwellStart`, `gazeFiredInThisLook`, `reArmedRef`, `centerStabilityStart`, `isEyesClosed`, `closeStartTime`, `blinkCountInGesture`, `firstBlinkTime`, `lastBlinkEndTime`, `selectSuccessUntil`, `emergencySuccessUntil`, `cooldownTimer`, `lastExecutedActionRef`.

Dưới đây là **toàn bộ các hàm nội bộ, effects và hooks** trong `EyeTrackingProvider.tsx`:

#### 3.1.1. `setOverlaySettings(updater)` (dòng 96–102)
- Cập nhật `overlaySettings` (nhận partial object hoặc functional updater) và lưu xuống `localStorage['luckydream_overlay_settings']`. Gọi bởi `CameraHub.tsx:332, 341, 350`.

#### 3.1.2. `handleSpeechSync(e)` trong `useEffect` (dòng 149–162) & `useEffect` đồng bộ `settings` (dòng 164–175)
- `handleSpeechSync`: Lắng nghe sự kiện `eyetalk:speech-settings-changed` từ `speech.ts` để đồng bộ `speakerEnabled` hai chiều.
- `useEffect` (164–175): Ghi `settings` vào `localStorage` và gọi `updateSpeechSettings()` mỗi khi `settings` thay đổi.

#### 3.1.3. `useEffect` đồng bộ `lowLightFilterEnabledRef` (dòng 178–184)
- Cập nhật `lowLightFilterEnabledRef.current`. Khi tắt lọc thiếu sáng, gọi `lowLightProcessorRef.current?.reset()` và xóa `processedCanvasRef.current = null`.

#### 3.1.4. `registerGestureCallback(cb)` (dòng 289–294)
- **Signature**: `(cb: (action: EyeAction) => boolean | void) => () => void`
- **Mục đích**: Đăng ký hàm lắng nghe `EyeAction` vào `gestureCallbacksRef.current` và trả về hàm unsubscribe. Được gọi bởi `EyeNavigationProvider.tsx:549` và test harness.

#### 3.1.5. `dispatchAction(action)` (dòng 296–340)
- **Mục đích**: Phát `EyeAction` tới toàn bộ subscriber trong `gestureCallbacksRef`, xác định `executed = true` nếu ít nhất 1 callback trả về `true`.
- **Logic nhánh**:
  - `action === 'NONE'` → trả `false`.
  - Nếu `settings.soundFeedback === true`: nếu `executed` đọc nhãn tương ứng trong `soundMap` (`SELECT -> 'Chọn'`, `RIGHT/NEXT -> 'Sang phải'`, `LEFT/BACK -> 'Sang trái'`, `UP -> 'Lên'`, `DOWN -> 'Xuống'`, `ESCAPE/DOUBLE_BLINK -> 'Hủy thao tác'`, `EMERGENCY -> 'Kích hoạt cuộc gọi khẩn cấp'`). Nếu `!executed`: `EMERGENCY` vẫn đọc cảnh báo khẩn, các hướng di chuyển đọc `'Không có phần tử theo hướng này'`.
  - Nếu `action === 'EMERGENCY'`: phát `window.dispatchEvent(new CustomEvent('eyeai:emergency'))`.
- **Ai gọi**: `triggerManualAction`, `processFaceMeshResults`, `handleKeyDown` (Simulator).

#### 3.1.6. `triggerManualAction(action)` (dòng 342–393)
- **Mục đích**: Cho phép bấm kiểm tra trực tiếp 6 nút lệnh trên `CameraHub.tsx:425`.
- **Logic**: Gọi `dispatchAction(action)`. Nếu thành công: đặt `cooldownTimer = 2500ms`, reset gaze về `CENTER`, `reArmedRef = false`, cập nhật `trackingState` với nhãn `${action} (Thủ công)`. Nếu thất bại: reset gaze về `CENTER` và báo `'Không có phần tử ...'`.

#### 3.1.7. `loadLibraries()` trong `useEffect` (dòng 427–457)
- **Mục đích**: Kiểm tra `window.FaceMesh`; nếu chưa có (trong trường hợp CDN trong `index.html` chưa xong hoặc bị thiếu), tự chèn `<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" async>` vào `document.head`. Cập nhật `libsLoading = false` hoặc `libError`.

#### 3.1.8. `processFaceMeshResults(results)` (dòng 460–1125) — **HÀM XỬ LÝ CỐT LÕI**
- **Khi nào được gọi**: Callback `faceMesh.onResults` mỗi khi MediaPipe suy luận xong 1 khung hình.
- **Tóm tắt 4 pha xử lý tuần tự**:
  1. **Pha 0 — Thời gian & Mất khuôn mặt (461–510)**: Tính `elapsed = clamp(now - lastFrameTime, 1, 100)`. Lưu `results.multiFaceLandmarks?.[0]` vào `window.__eyeai_latest_landmarks`. Nếu `!landmarks`: tăng `noFaceFramesCount` (nếu `> 60` reset `initFramesCount = 0`), giảm `cooldownTimer`, đặt `faceDetected: false, gazeDirection: 'UNKNOWN'`, throttle dispatch UI.
  2. **Pha 1 — Hình học & Cache Metrics (512–535)**: Gọi `analyzeEyes(landmarks)`, lưu `latestMetricsRef`, giảm `cooldownTimer`.
  3. **Pha 2 — Blink Count FSM (538–815)**:
     - Tính `openBaselineEAR`, `blinkThresh`, `currentThresh` (hysteresis `+0.015`), `isClosedNow`.
     - Kiểm tra hết hạn cửa sổ `700ms` cho `blinkCount === 1` (→ phát `DOWN`, cooldown `1200ms`) và `blinkCount === 2` (→ phát `SELECT`, cooldown `2500ms`).
     - Khi `isClosedNow`: khóa gaze về `CENTER`, tính `curClosedDuration`.
     - Khi vừa mở mắt (`isEyesClosed` chuyển `true -> false`): tính `blinkDuration`; nếu trong `[25, 750]ms` và `cooldownTimer <= 0`, tăng `blinkCountInGesture` (`0 -> 1`, `1 -> 2` nếu `interval <= 950ms`, `2 -> EMERGENCY` ngay lập tức + `cooldown 3000ms` nếu `interval <= 950ms`). Nếu `blinkDuration > 800ms`, reset về `0`.
  4. **Pha 3 — Gaze Classifier + Dwell + Re-Arm + Telemetry (818–1124)**:
     - Warm-up 35 frame (`alpha = 0.25`) hoặc drift compensation (`alpha = 0.012`) khi đang ở `CENTER` & mắt mở.
     - Kiểm tra `isGazeAllowed` (7 điều kiện an toàn). Nếu `false`, khóa gaze về `CENTER`.
     - Nếu `true`: EMA `alpha = 0.45`, phân loại `RIGHT/LEFT/UP` (tắt `DOWN`) với hysteresis nhả `0.55 × thresh` và tỷ lệ lấn trục `1.05`. Kiểm tra `confidence < 0.35 -> 'UNKNOWN'`.
     - Kiểm tra Re-Arm (`CENTER >= 140ms`) và Dwell (`220ms`) → gọi `dispatchAction(mappedAction)`, đặt cooldown (`2500ms` nếu chạy được, `1000ms` nếu đụng biên).
     - Cuối cùng kiểm tra `hasMajorTransition` hoặc `isThrottleDue` (`40ms` khi đếm chớp, `65ms` bình thường) để gọi `setTrackingState(nextTelemetry)`.

#### 3.1.9. `handleKeyDown(e)` trong Simulator `useEffect` (dòng 1128–1462)
- **Khi nào chạy**: Khi `settings.simulatorMode === true`. Bỏ qua nếu `document.activeElement` là `INPUT` hoặc `TEXTAREA`.
- **Phím xử lý**:
  - `ArrowRight/Left/Up/Down`: Nếu `cooldownTimer <= 0`, gọi `dispatchAction`, đặt `cooldownTimer = 2500ms`, reset gaze.
  - `' '` (Space): Đếm `spacePendingCount` với `setTimeout(..., 700)`: 1 lần → `DOWN` (cooldown `1200ms`), 2 lần → `SELECT` (cooldown `2500ms`), 3 lần → `EMERGENCY` ngay (cooldown `3000ms`).
  - `Enter`: Kích hoạt `SELECT` ngay.
  - `F1`: Kích hoạt `EMERGENCY` ngay (bỏ qua cooldown).
  - `Escape`: Kích hoạt `ESCAPE`.

#### 3.1.10. `startTrackingLoop()` & hàm nội bộ `render()` (dòng 1465–1522)
- **Mục đích**: Khởi tạo singleton `faceMeshRef.current` (nếu chưa có) và chạy vòng `requestAnimationFrame(render)` đẩy frame vào `faceMesh.send()`.
- **Cơ chế an toàn**: Kiểm tra `video.readyState >= 2 && !isProcessingRef.current && faceMeshRef.current`, bọc `try/catch/finally` quanh `lowLightProcessorRef` (fallback về `video`) và `faceMesh.send()`, chỉ xếp lịch rAF tiếp theo khi `mediaStreamRef.current?.active`.

#### 3.1.11. `stopTrackingLoop()` (dòng 1524–1559)
- Hủy `animationFrameRef`, đặt `isProcessingRef = false`, `lowLightProcessorRef.current?.reset()`, dừng toàn bộ `MediaStreamTrack` (`track.stop()`), xóa `videoRef.current.srcObject = null`, cập nhật `cameraActive: false`, và gọi `recoverAudioSession()`.

#### 3.1.12. `startCamera()` (dòng 1561–1667)
- Kiểm tra `window.isSecureContext` và `navigator.mediaDevices.getUserMedia`.
- Nếu `mediaStreamRef` đã có track `live`, gắn lại vào `videoRef` và chạy `startTrackingLoop()`.
- Ngược lại gọi `getUserMedia({ video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })`, fallback `{ video: true, audio: false }`.
- Gắn stream vào `<video>` ẩn (set `muted`, `playsinline`, `webkit-playsinline`), gọi `play()`, `startTrackingLoop()`, cập nhật `cameraActive: true` và `recoverAudioSession()`. Bắt lỗi ghi `cameraError`.

#### 3.1.13. `toggleCamera()` (dòng 1669–1676) & Lifecycle `useEffect` (dòng 1678–1694)
- `toggleCamera`: Đảo trạng thái bật/tắt bằng `stopTrackingLoop()` hoặc `startCamera()`, sau đó `recoverAudioSession()`.
- `useEffect` (1678–1684): Tự bật camera khi `settings.eyeControlEnabled && !libsLoading && !libError`, tự tắt khi `!settings.eyeControlEnabled`.
- `useEffect` teardown (1687–1694): Dừng camera và gọi `lowLightProcessorRef.current?.dispose()` khi Provider unmount.

#### 3.1.14. Nhóm hàm Hiệu chỉnh (`cancelCalibration`, `resetCalibration`, `reZeroCenter`, `start5PointCalibration`, `startCalibration`) (dòng 1701–1959)
- `cancelCalibration()`: Đặt `calibrationCancelRef = true`, đưa `calibrationStep/Stage` về `'idle'`.
- `resetCalibration()`: Đưa `calibration` về thông số mặc định (`neutralEAR: 0.25, blinkThreshold: 0.16, thresholdH: 0.028, thresholdV: 0.018, isCalibrated: false`), xóa `localStorage`, nói `'Đã đặt lại hiệu chỉnh'`.
- `reZeroCenter()`: Nếu `latestMetricsRef.current.confidence >= 0.3`, lấy ngay `compensatedGazeX/Y` làm `neutralRunningX/Y`, reset `initFramesCount = 0`, `reArmedRef = true`, lưu `localStorage`, nói `'Đã căn tâm'`.
- `start5PointCalibration()`:
  - Chứa helper nội bộ `sleep(ms)` và `collectStepFrames(stepName, promptText, voicePrompt)` thu 32 mẫu hợp lệ (`avgEAR > 0.12 && confidence > 0.4`, tối đa 60 vòng × 55ms, tối thiểu 15 mẫu) và tính **Median**.
  - Tuần tự: đếm ngược 3s → `center` → `up` → `down` → `left` → `right`. Tính `thresholdUp/Down/Left/Right = 0.5 * delta` (kẹp trong cận an toàn) và `blinkThresh = clamp(neutralEAR * 0.62, 0.12, 0.20)`. Lưu `localStorage` và phát `'Hiệu chỉnh 5 hướng thành công'`.
- `startCalibration()`: Alias gọi `start5PointCalibration()`.

#### 3.1.15. Các Setter cấu hình (dòng 1961–1993)
- `setEyeControlEnabled(enabled)`: Lưu `localStorage['luckydream_eye_enabled']`, cập nhật state và gọi `recoverAudioSession()` sau 50ms.
- `setSimulatorMode`, `setSoundFeedback`, `setSpeakerEnabled`, `setLowLightFilterEnabled`.
- `setSpeechVolume(volume)`: Kẹp trong `[0, 1]`.
- `setSpeechRate(rate)`: Kẹp trong `[0.7, 1.5]`.

#### 3.1.16. Các Hook Context cuối file (dòng 2091–2110)
- `useEyeTrackingSettingsContext()`, `useEyeTrackingTelemetryContext()`, `useEyeTrackingContext()` (gộp cả hai Context). Đều ném `Error` nếu gọi ngoài `EyeTrackingProvider`.

---

## 4. File `src/modules/eye-control/useEyeTracking.ts`

- **`useEyeTrackingSettings()`** (`line 7-9`): Trả về `useEyeTrackingSettingsContext()`.
- **`useEyeTrackingTelemetry()`** (`line 11-13`): Trả về `useEyeTrackingTelemetryContext()`.
- **`useEyeTracking()`** (`line 15-17`): Trả về `useEyeTrackingContext()`.
- **`useAudioSettings()`** (`line 19-29`): Rút trích `{ speakerEnabled, speechVolume, speechRate, setSpeakerEnabled, setSpeechVolume, setSpeechRate }` từ `useEyeTrackingSettingsContext()`.
