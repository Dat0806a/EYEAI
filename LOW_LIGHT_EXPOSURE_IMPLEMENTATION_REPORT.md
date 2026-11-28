# BÁO CÁO TRIỂN KHAI: BỘ LỌC TĂNG PHƠI SÁNG THIẾU SÁNG (LOW-LIGHT EXPOSURE FILTER) CHO EYEAI

> **Phạm vi**: Phần người suy giảm của EYEAI (`src/modules/eye-control/`).  
> **Nguyên tắc**: `ADD-ONLY FEATURE – CORE ALGORITHM IMMUTABLE – ZERO UNRELATED CHANGES`.  
> **Ngày hoàn thành**: 26/11/2026.

---

## 1. Danh sách file được tạo mới và chỉnh sửa

### File tạo mới
1. `src/modules/eye-control/lowLightFilter.ts` — Module bộ lọc Adaptive Gamma Correction + LUT 256 phần tử (`Uint8Array`) + EMA Luminance Smoothing + Gamma Deadband + Canvas tái sử dụng.
2. `src/modules/eye-control/__tests__/lowLightFilter.test.tsx` — Bộ kiểm thử Unit, Integration, Lifecycle, Error Fallback và Regression cho module mới và tích hợp `EyeTrackingProvider` / `CameraHub` / `CameraPreview`.
3. `LOW_LIGHT_EXPOSURE_IMPLEMENTATION_REPORT.md` — Báo cáo hoàn thành triển khai.

### File chỉnh sửa (chỉ trong `src/modules/eye-control/`)
1. `src/modules/eye-control/types.ts` (+1 dòng)
2. `src/modules/eye-control/EyeTrackingProvider.tsx` (+50 / -1 dòng)
3. `src/modules/eye-control/CameraPreview.tsx` (+49 / -1 dòng)
4. `src/modules/eye-control/CameraHub.tsx` (+42 dòng)

**Không chỉnh sửa**: `eyeTracker.ts`, `EyeNavigationProvider.tsx`, `EyeFocusable.tsx`, `GlobalEyeHUD.tsx`, `SettingsPage.tsx`, `App.tsx`, `vitest.config.ts`, `package.json`, backend, database, hay bất kỳ file nào thuộc phần bệnh nhân.

---

## 2. Nội dung và lý do thay đổi của từng file

| File | Nội dung thay đổi | Lý do thay đổi |
| :--- | :--- | :--- |
| `src/modules/eye-control/lowLightFilter.ts` | Triển khai `estimateMeanLuminance`, `computeAdaptiveGamma`, `buildGammaLUT`, `applyGammaLUT`, `updateLuminanceAndGamma` và class `LowLightExposureProcessor`. | Tách biệt hoàn toàn logic tiền xử lý ảnh pixel-level khỏi `EyeTrackingProvider.tsx` và thuật toán nhận diện mắt; đảm bảo tái sử dụng Canvas, LUT `Uint8Array(256)`, EMA và deadband. |
| `src/modules/eye-control/types.ts` | Thêm `lowLightFilterEnabled: boolean` vào interface `EyeControlSettings` (dòng 87). | Khai báo kiểu dữ liệu cấu hình ON/OFF đồng bộ với `EyeControlSettings`. |
| `src/modules/eye-control/EyeTrackingProvider.tsx` | - Khởi tạo `lowLightFilterEnabled: false` (mặc định OFF).<br>- Thêm `processedCanvasRef`, `lowLightProcessorRef`, `lowLightFilterEnabledRef`, `setLowLightFilterEnabled`.<br>- Chèn xử lý frame trong `startTrackingLoop()` ngay trước `faceMeshRef.current.send({ image: frameSource })` với nhánh bypass hoàn toàn khi OFF và `try/catch` fallback về `video` khi lỗi.<br>- Gọi `reset()` trong `stopTrackingLoop()` và `dispose()` khi unmount. | Tích hợp filter vào đúng điểm đã xác định trong audit mà không tạo camera stream mới, không tạo FaceMesh instance mới, không phá vỡ `isProcessingRef` backpressure và giữ nguyên toàn bộ FSM/thuật toán cốt lõi. |
| `src/modules/eye-control/CameraPreview.tsx` | Khi `settings.lowLightFilterEnabled && trackingState.cameraActive`, render `<canvas ref={previewCanvasRef}>` đồng bộ frame từ `processedCanvasRef` bằng `requestAnimationFrame`, giữ nguyên `object-cover`, `transform -scale-x-100`, thẻ `<video>` nền và `<LiveCameraOverlay />`. Khi OFF, không render canvas và không chạy `rAF`. | Đảm bảo Camera Preview hiển thị chính xác dữ liệu thực tế đưa vào FaceMesh mà không dùng CSS filter thay thế, vẫn giữ nguyên tỷ lệ, hướng ảnh và landmark overlay. |
| `src/modules/eye-control/CameraHub.tsx` | Bổ sung duy nhất 1 nút **"Hỗ trợ thiếu sáng"** (icon `Sun`, badge `ON`/`OFF`, `aria-pressed`) bọc trong `<EyeFocusable id="btn-camera-hub-low-light">`. | Cho phép bật/tắt bằng chuột, chạm và cơ chế điều khiển mắt hiện tại, giữ nguyên thiết kế và mọi thành phần khác của Camera Hub. |

---

## 3. Kiến trúc bộ lọc đã triển khai

### Luồng xử lý theo trạng thái
- **Khi OFF (Mặc định)**:
  `Camera (<video>) -> faceMeshRef.current.send({ image: video }) -> analyzeEyes -> Blink/Gaze FSM -> EyeNavigationProvider`
  *(Bypass 100%: không vẽ canvas, không gọi `getImageData`, không tính gamma/LUT).*
- **Khi ON**:
  `Camera (<video>) -> LowLightExposureProcessor.processFrame(video) -> faceMeshRef.current.send({ image: processedCanvas }) -> analyzeEyes -> Blink/Gaze FSM -> EyeNavigationProvider`
  *(Nếu `processFrame` trả `null` hoặc ném lỗi -> fallback tức thì về `video` gốc).*

### Thông số kỹ thuật của `LowLightExposureProcessor`
- **Ước lượng độ sáng trung bình**: Công thức Rec. 601 ($Y = 0.299R + 0.587G + 0.114B$) lấy mẫu bước nhảy `sampleStep = 8`.
- **EMA Luminance Smoothing**: `emaAlpha = 0.1` giúp làm mượt biến động ánh sáng giữa các frame.
- **Adaptive Gamma Correction**: Giải $\gamma = \frac{\ln(L_{target}/255)}{\ln(\max(L, 1)/255)}$ với `targetLuminance = 125`, giới hạn biên $\gamma \in [0.48, 1.0]$ (`minGamma = 0.48` hạn chế khuếch đại nhiễu hạt vùng tối; `maxGamma = 1.0` giữ nguyên ảnh khi đủ sáng).
- **Gamma Deadband**: `gammaDeadband = 0.02` chỉ tái tạo LUT khi $|\Delta\gamma| \ge 0.02$ để tránh nhấp nháy.
- **LUT 256 phần tử**: Bảng `Uint8Array(256)` cập nhật trực tiếp lên `R, G, B` của `ImageData` (giữ nguyên kênh Alpha).
- **Quản lý tài nguyên**: Tái sử dụng 1 offscreen `<canvas>` và 1 `Uint8Array(256)`; gọi `reset()` khi tắt filter/dừng camera và `dispose()` khi unmount để tránh memory leak.

---

## 4. Kết quả kiểm thử (Đã chạy sau chỉnh sửa cuối cùng)

### A. Kiểm thử tự động (Vitest + jsdom)
Chạy bộ test mới tại `src/modules/eye-control/__tests__/lowLightFilter.test.tsx`:
- **Tổng kết**: **9/9 tests PASS** (1 test file, thời gian chạy `486ms`).
- Chi tiết các ca đã xác minh:
  1. `estimateMeanLuminance`: buffer rỗng (`0`), ảnh tối (`20`), ảnh sáng (`200`).
  2. `computeAdaptiveGamma`: giới hạn biên dưới `minGamma = 0.48` khi rất tối, tăng sáng vừa phải khi thiếu sáng, trả `1.0` khi đủ sáng (`>= 125`) và an toàn với `NaN`.
  3. `buildGammaLUT`: tạo `Uint8Array(256)`, đồng nhất `lut[i] === i` ở $\gamma = 1.0$, nâng sáng đơn điệu không tràn ngưỡng ở $\gamma < 1.0$.
  4. `applyGammaLUT`: biến đổi đúng kênh `R, G, B` in-place và giữ nguyên kênh `Alpha`.
  5. `updateLuminanceAndGamma`: xác minh EMA smoothing và cơ chế Gamma Deadband bỏ qua dao động nhỏ.
  6. `LowLightExposureProcessor`: trả `null` khi kích thước video `0x0`, tái sử dụng cùng 1 instance `HTMLCanvasElement` qua nhiều frame, tăng sáng pixel tối, `reset()` và `dispose()` giải phóng canvas về `0x0`.
  7. `CameraHub` & Toggle ON/OFF: mặc định `OFF` (`aria-pressed="false"`), hiển thị duy nhất nút **"Hỗ trợ thiếu sáng"**, hỗ trợ bật/tắt bằng click và qua `EyeNavigationProvider.triggerSelect()` (cơ chế điều khiển mắt).
  8. Pipeline Bypass, Sync Preview, Error Fallback & Camera Lifecycle:
     - Khi OFF: `faceMesh.send` nhận đúng `HTMLVideoElement` gốc, `getImageData` không được gọi (`0` lần), không render canvas phụ ở `CameraPreview`.
     - Khi ON: `faceMesh.send` nhận `HTMLCanvasElement` `640x480`, `CameraPreview` render `<canvas>` đồng bộ.
     - Khi mô phỏng lỗi `getImageData` throw exception: hệ thống log warning và fallback an toàn về `HTMLVideoElement` gốc, vòng lặp nhận diện không bị gián đoạn.
     - Chuyển đổi ON/OFF và `toggleCamera` (tắt rồi bật lại camera): chạy ổn định không phát sinh lỗi.

### B. Kiểm thử TypeScript, Bộ test hiện có & Production Build
- `npm run lint` (`tsc --noEmit`): **PASS** (exit code `0`, 0 lỗi kiểu).
- `npm test` (`vitest run` trên `vitest.config.ts`): **PASS** — **5/5 test files, 20/20 tests PASS** (`5.26s`).
- `npm run build` (`vite build && esbuild server.ts ...`): **PASS** (exit code `0`, tạo thành công `dist/index.html`, `dist/assets/*`, `dist/server.cjs`).

---

## 5. Kết quả Regression Testing

1. **Regression thuật toán `eyeTracker.ts`**: Test tự động xác minh `analyzeEyes(landmarks)` với bộ mốc 478 điểm trả về kết quả `avgEAR` (`~0.3`), `rawGazeX` (`~0`), `rawGazeY` (`~0`), `faceDetected: true` và `confidence > 0.9` không đổi.
2. **Regression điều phối cử chỉ `EyeTrackingProvider` + `EyeNavigationProvider`**: `triggerManualAction('DOWN')` và `triggerSelect()` trên `EyeFocusable` hoạt động bình thường.
3. **Regression phần bệnh nhân**: Toàn bộ 20/20 test trong `src/experiences/patient/voice-agent/tests/*.test.*` đều PASS.

---

## 6. Kết quả kiểm tra Git Diff & Bằng chứng bảo toàn thuật toán cốt lõi

Đối chiếu `git status --short` và `git diff --stat src/modules/eye-control/` so với trạng thái baseline trước khi triển khai:
- Các file có sẵn từ trước của dự án (`netlify.toml`, `package.json`, `package-lock.json`, `server.ts`, `src/App.tsx`, `src/experiences/patient/**`, `src/services/patientService.ts`, `vitest.config.ts`) **không bị sửa đổi thêm bất kỳ dòng nào**.
- Phần thay đổi mới **chỉ nằm gọn trong `src/modules/eye-control/`**:
  - `src/modules/eye-control/types.ts`: +1 dòng.
  - `src/modules/eye-control/EyeTrackingProvider.tsx`: +50 / -1 dòng.
  - `src/modules/eye-control/CameraPreview.tsx`: +49 / -1 dòng.
  - `src/modules/eye-control/CameraHub.tsx`: +42 dòng.
  - Tạo mới `lowLightFilter.ts` và `__tests__/lowLightFilter.test.tsx`.
- **Xác minh bảo toàn thuật toán cốt lõi**:
  - `eyeTracker.ts`: **0 dòng thay đổi** (EAR, Iris Ratio, Canthal-Baseline Projection, Head Pose, Confidence nguyên vẹn).
  - `EyeNavigationProvider.tsx`: **0 dòng thay đổi** (Eye Navigation, Focus Scope, Escape/Select nguyên vẹn).
  - Trong `EyeTrackingProvider.tsx`: các hàm `processFaceMeshResults` (dòng 445–1110 gốc), Triple-Blink FSM, Gaze FSM, Auto-Zero (`initFramesCount`), Drift Compensation, Hysteresis, Dwell `220ms`, Cooldown `2500ms`, Calibration 5 điểm (`start5PointCalibration`), `reZeroCenter`, TTS (`speakVietnamese`), và cấu hình `FaceMesh.setOptions` (`maxNumFaces: 1`, `refineLandmarks: true`, `minDetectionConfidence: 0.6`, `minTrackingConfidence: 0.6`) **không có bất kỳ dòng nào bị sửa đổi**.

---

## 7. Những nội dung cần kiểm thử thực tế (Webcam thật & Môi trường thiếu sáng)

Vì môi trường tự động (`jsdom` + mock `FaceMesh`) không có cảm biến webcam vật lý và nguồn sáng thực, các hạng mục sau **chưa được đo bằng thiết bị thật** và cần QA/người vận hành kiểm thử trực tiếp trước khi nghiệm thu hiện trường:

1. **Tỷ lệ giữ landmark trong phòng tối**: Đo tỷ lệ `faceDetected === true` và độ ổn định 468+ điểm landmark của MediaPipe FaceMesh khi bật vs tắt **"Hỗ trợ thiếu sáng"** dưới nhiều mức ánh sáng (tối hoàn toàn chỉ có màn hình, đèn ngủ, ánh sáng yếu).
2. **Đo FPS & Độ trễ thực tế**: Quan sát FPS của `requestAnimationFrame` + `FaceMesh.send` và độ mượt khi bật filter ở độ phân giải `640x480` trên laptop cấu hình trung bình và điện thoại.
3. **Nguy cơ nhận diện sai cử chỉ / Emergency**: Kiểm tra độ dao động `rawEAR` khi nhìn bình thường trong phòng tối (dưới nhiễu ISO của webcam) xem có kích hoạt nhầm 1 chớp (`DOWN`), 2 chớp (`SELECT`) hay 3 chớp (`EMERGENCY`) hay không.
4. **Kiểm thử chuyển đổi ánh sáng đột ngột & hiệu chuẩn**: Bật đèn phòng đột ngột khi filter đang ON để xác minh cơ chế Adaptive Gamma hạ về `1.0` không gây cháy sáng, và chạy thử quy trình hiệu chuẩn 5 điểm khi filter ON.
5. **Khớp tọa độ CameraPreview + LiveCameraOverlay**: Kiểm tra trực quan viền mắt, lưới mesh và chấm mống mắt trên `CameraHub` khớp khít với hình ảnh hiển thị khi filter ON/OFF.

---

## 8. Kết luận: **CONDITIONAL PASS**

- **Đánh giá kỹ thuật & Kiểm thử tự động**: **PASS toàn bộ** (9/9 test module mới, 20/20 test hiện có, `tsc --noEmit` 0 lỗi, `npm run build` thành công, `git diff` xác minh 100% thuật toán điều khiển mắt cốt lõi và phần bệnh nhân được giữ nguyên tuyệt đối).
- **Lý do xếp loại CONDITIONAL PASS**: Cần hoàn tất các hạng mục kiểm thử thực tế bằng webcam thật trong môi trường thiếu sáng ở Mục 7 để xác nhận hiệu quả cải thiện nhận diện MediaPipe, FPS thực tế và không phát sinh nhận diện nhầm cử chỉ trước khi xác nhận nghiệm thu cuối cùng.
