# BÁO CÁO AUDIT: BỔ SUNG BỘ LỌC TĂNG PHƠI SÁNG (EXPOSURE ENHANCEMENT FILTER) CHO HỆ THỐNG ĐIỀU KHIỂN MẮT EYEAI

> **Phạm vi**: Chỉ tập trung vào **phần người suy giảm** của EYEAI (Eye Control Module & UI liên quan). Tuyệt đối không truy cập, phân tích hay tác động vào phần dành cho bệnh nhân (`patient-*`, `src/experiences/patient/**`).  
> **Trạng thái**: Audit hoàn tất — **Chưa triển khai code**.  
> **Nguyên tắc đối chiếu**: Mọi phân tích dưới đây được đối chiếu trực tiếp từ source code thực tế trong workspace. Các vấn đề cần đo đạc thực nghiệm được tách riêng rõ ràng, không suy đoán hay tự tạo số liệu kiểm thử.

---

## 1. Kiến trúc và Pipeline điều khiển mắt hiện tại

Hệ thống điều khiển mắt cho người suy giảm được bọc ở cấp ứng dụng tại `src/App.tsx` (dòng 613–627): `EyeTrackingProvider` bọc ngoài `EyeNavigationProvider` và `CallProvider`. Khi tài khoản là `impaired` và không ở route `patient-*`, `GlobalEyeHUD` được render toàn cục (`src/App.tsx`, dòng 269–271).

Pipeline xử lý tín hiệu mắt từ camera đến thực thi lệnh gồm 5 tầng tuần tự:

```text
[1. Camera WebRTC]
  navigator.mediaDevices.getUserMedia (640x480 ideal, user)
  -> <video ref={videoRef}> ẩn (EyeTrackingProvider.tsx:2026)
        │
        ▼  (requestAnimationFrame + concurrency lock isProcessingRef)
[2. MediaPipe FaceMesh (CDN)]
  faceMesh.send({ image: video })  [KHÔNG qua tiền xử lý ảnh]
  (maxNumFaces: 1, refineLandmarks: true, minDetection/TrackingConfidence: 0.6)
        │
        ▼  onResults(processFaceMeshResults)
[3. Hình học Landmark (eyeTracker.ts)]
  analyzeEyes(landmarks) -> EAR (left, right, avg) + Canthal-Baseline Iris Ratio + Head Pose + Confidence
        │
        ▼
[4. Bộ phân giải Cử chỉ & Hiệu chuẩn (EyeTrackingProvider.tsx)]
  ├─ Priority #1: Triple-Blink FSM (1 chớp: DOWN, 2 chớp: SELECT, 3 chớp: EMERGENCY)
  ├─ Priority #2: Gaze FSM (Auto-Zero 35 frames -> EMA alpha 0.45 -> Hysteresis -> Dwell 220ms -> Cooldown 2.5s)
  └─ Calibration 5 điểm (Center, Up, Down, Left, Right)
        │
        ▼  dispatchAction(action) + speakVietnamese()
[5. Điều hướng & Thực thi lệnh (EyeNavigationProvider.tsx + EyeFocusable.tsx)]
  registerGestureCallback -> navigate / triggerSelect / triggerEscape / eyeai:emergency
```

### Chi tiết từng tầng (đã xác minh từ source code)

1. **Thu nhận Camera (`EyeTrackingProvider.tsx`)**:
   - `startCamera` (dòng 1523–1629) gọi `navigator.mediaDevices.getUserMedia` với cấu hình ưu tiên `{ facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }` (dòng 1576–1583), fallback `{ video: true, audio: false }` (dòng 1585–1588).
   - Stream được gán vào `mediaStreamRef.current`, state `cameraStream`, và thẻ `<video ref={videoRef}>` ẩn ngoài viewport (`fixed -top-[9999px] -left-[9999px] opacity-0 w-[640px] h-[480px]`, dòng 2026–2033).
   - `EyeTrackingProvider` có khai báo `canvasRef` ẩn (dòng 63, 2034–2036) nhưng **hiện chưa được sử dụng** trong vòng lặp xử lý.
   - `CameraPreview.tsx` (dòng 13–86) tự tạo `<video>` riêng gắn cùng `cameraStream` để hiển thị UI (lật gương bằng CSS `-scale-x-100`, dòng 55), kết hợp `LiveCameraOverlay.tsx` (dòng 24–249) vẽ mesh/mắt/mống mắt lên `<canvas>` overlay dựa trên `(window as any).__eyeai_latest_landmarks`.

2. **Vòng lặp nhận diện & FPS (`EyeTrackingProvider.tsx`)**:
   - MediaPipe FaceMesh được nạp động từ CDN `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js` (dòng 420–429).
   - `startTrackingLoop` (dòng 1450–1486) khởi tạo 1 instance `FaceMesh` duy nhất với `maxNumFaces: 1`, `refineLandmarks: true`, `minDetectionConfidence: 0.6`, `minTrackingConfidence: 0.6` (dòng 1457–1462).
   - Vòng lặp dùng `requestAnimationFrame(render)` kèm khóa đồng thời `isProcessingRef.current` (backpressure, dòng 1471–1479): chỉ gửi frame mới khi `video.readyState >= 2` và frame trước đã xử lý xong. Nhịp xử lý thực tế bám theo `requestAnimationFrame` và tốc độ inference của FaceMesh (không khóa FPS cứng; phần dispatch telemetry lên React state được throttle ở `TELEMETRY_THROTTLE_MS = 65ms`, dòng 56, tương đương ~15 FPS cho UI).
   - **Tiền xử lý hình ảnh hiện tại**: **Chưa có**. Frame từ `videoRef.current` được truyền thẳng vào `faceMeshRef.current.send({ image: video })` (dòng 1474). Không có bất kỳ bước tăng sáng, bù phơi sáng, hiệu chỉnh gamma hay cân bằng histogram nào.

3. **Tính toán EAR & Iris Ratio (`eyeTracker.ts`)**:
   - `analyzeEyes(landmarks)` (dòng 129–326) yêu cầu `landmarks.length >= 468`.
   - **EAR**: Tính từ các mốc mi mắt trên/dưới chia cho khoảng cách 2 khóe mắt (`leftEAR`, `rightEAR`, `avgEAR`, dòng 155–166).
   - **Iris Ratio**: Chiếu tâm mống mắt (`468`, `473`) lên hệ trục gắn với đường nối 2 khóe mắt (*canthal baseline projection*, dòng 189–261), giúp chống đảo chiều khi mi mắt sụp hoặc nhìn xuống, sau đó trộn 2 mắt theo trọng số độ mở mắt `wL = max(0.01, leftEAR - 0.08)`, `wR = max(0.01, rightEAR - 0.08)`.
   - **Confidence**: Tính dựa trên kích thước khuôn mặt (`faceWidth > 0.08 && faceHeight > 0.10`) và tỷ lệ `avgEAR / 0.22` (dòng 293–295).

4. **Gesture FSM & Calibration (`EyeTrackingProvider.tsx`)**:
   - **Blink FSM (dòng 529–800)**: Ngưỡng chớp động `dynamicBlinkThresh = clamp(openBaselineEAR * 0.78, 0.16, 0.28)` hoặc từ calibration `[0.16, 0.29]`, hysteresis mở lại `+0.015`, thời gian chớp hợp lệ `25ms–750ms`, cửa sổ quyết định `BLINK_DECISION_WINDOW_MS = 700ms`.
   - **Gaze FSM (dòng 803–1030)**: Warm-up tự cân tâm 35 frame đầu (`initFramesCount < 35`), bù trôi nhẹ (`driftAlpha = 0.012`), safety gate `isGazeAllowed` (dòng 858–866), lọc EMA (`alpha = 0.45`), hysteresis nhả (`0.55 * thresh`), bỏ qua nếu `confidence < 0.35`, dwell `220ms`, re-arm tại tâm `140ms`, cooldown `ACTION_COOLDOWN_MS = 2500ms`.
   - **Calibration 5 điểm (dòng 1737–1913)**: Thu 32 mẫu/bước (`center`, `up`, `down`, `left`, `right`) với điều kiện `avgEAR > 0.12 && confidence > 0.4`, lấy trung vị (median).

5. **Thực thi lệnh (`EyeNavigationProvider.tsx`, `EyeFocusable.tsx`)**:
   - `EyeNavigationProvider` đăng ký callback qua `registerGestureCallback` (dòng 548–563) để điều hướng 2D theo scope (`navigate`), chọn phần tử (`triggerSelect`), thoát/quay lại (`triggerEscape`), hoặc phát sự kiện `eyeai:emergency`.

---

## 2. Danh sách file, đường dẫn, hàm và dòng code liên quan

| File / Đường dẫn | Thành phần / Hàm chính | Dòng code | Vai trò trong pipeline |
| :--- | :--- | :--- | :--- |
| `src/App.tsx` | `App`, `AppContent`, `GlobalEyeHUD` | 66–79, 269–271, 613–627 | Bọc provider điều khiển mắt, tách luồng `impaired` vs `patient`, gắn `GlobalEyeHUD`. |
| `src/modules/eye-control/types.ts` | `EyeTrackingState`, `EyeControlSettings`, `EyeCalibrationData` | 1–98 | Định nghĩa state telemetry, cấu hình (`EyeControlSettings`) và dữ liệu hiệu chuẩn. |
| `src/modules/eye-control/EyeTrackingProvider.tsx` | `EyeTrackingProvider`, `startCamera`, `startTrackingLoop`, `processFaceMeshResults`, `start5PointCalibration`, `reZeroCenter` | 61–2063 (chính: 412–1110, 1450–1646, 1737–1913, 2026–2036) | Quản lý WebRTC camera, vòng lặp `FaceMesh.send`, Blink/Gaze FSM, Calibration, Keyboard Simulator, Telemetry. |
| `src/modules/eye-control/eyeTracker.ts` | `analyzeEyes`, `EYE_INDICES` | 18–47, 129–326 | Tính EAR, Canthal-Baseline Iris Ratio, Head Pose và Confidence từ 468+ landmarks. |
| `src/modules/eye-control/useEyeTracking.ts` | `useEyeTrackingSettings`, `useEyeTrackingTelemetry`, `useEyeTracking` | 7–17 | Hook truy cập Settings & Telemetry tách context để giảm re-render. |
| `src/modules/eye-control/EyeNavigationProvider.tsx` | `EyeNavigationProvider`, `navigate`, `triggerSelect`, `triggerEscape` | 54–598 | Nhận `EyeAction` từ `EyeTrackingProvider`, điều hướng 2D, quản lý modal focus scope. |
| `src/modules/eye-control/EyeFocusable.tsx` | `EyeFocusable` | 22–198 | Bọc các nút/card UI để nhận focus mắt và đọc nhãn TTS khi focus/chọn. |
| `src/modules/eye-control/CameraPreview.tsx` | `CameraPreview` | 13–86 | Hiển thị `<video>` preview cho người dùng kèm `LiveCameraOverlay`. |
| `src/modules/eye-control/LiveCameraOverlay.tsx` | `LiveCameraOverlay` | 24–249 | Vẽ wireframe FaceMesh, viền mắt, mống mắt lên `<canvas>` đè lên `CameraPreview`. |
| `src/modules/eye-control/CameraHub.tsx` | `CameraHub` | 36–692 | Bảng điều khiển camera chi tiết: preview, layer toggles, 6 badge lệnh, đếm chớp mắt, EAR meter, debug telemetry. |
| `src/components/ui/GlobalEyeHUD.tsx` | `GlobalEyeHUD` | 14–325 | HUD nổi (góc dưới-trái) hoặc thanh ngang (`keyboard-bar`) chứa preview nhỏ và nút mở `CameraHub` / tắt camera. |
| `src/components/ui/PageHeader.tsx` | `PageHeader` | 19–142 | Thanh header có nút `EYE MODE ON/OFF` (dòng 87–111) và nút vào Cài đặt. |
| `src/pages/SettingsPage.tsx` | `SettingsPage` (Section 1 & 2) | 477–607 | Giao diện bật/tắt Eye Mode, bật/tắt Camera, xem Preview và nút Hiệu chỉnh mắt. |
| `src/components/EyeTalkDashboard.tsx` | `EyeTalkDashboard` (route `dev-dashboard`) | 402–496 | Dashboard dev cũ có vòng lặp `getUserMedia` + `FaceMesh` riêng (không dùng `EyeTrackingProvider`). |

---

## 3. Những hạn chế hiện tại trong môi trường thiếu sáng

### A. Đã xác minh trực tiếp từ source code
1. **Không có bất kỳ cơ chế tiền xử lý hoặc tăng sáng ảnh nào**: Frame thô từ `<video>` đi thẳng vào `faceMeshRef.current.send({ image: video })` (`EyeTrackingProvider.tsx:1474`). CSS filter (nếu có) chỉ tác động hiển thị, không ảnh hưởng dữ liệu pixel đưa vào MediaPipe.
2. **Ngưỡng tin cậy cố định (`0.6`) dễ rớt nhận diện**: `minDetectionConfidence: 0.6` và `minTrackingConfidence: 0.6` (`EyeTrackingProvider.tsx:1460–1461`). Khi ảnh tối, độ tương phản vùng hốc mắt, mí mắt và ranh giới mống mắt–củng mạc giảm mạnh, khiến FaceMesh dễ trả về `multiFaceLandmarks = []`.
3. **Mất trạng thái Auto-Zero khi mất mặt quá 2 giây**: Trong `processFaceMeshResults` (`EyeTrackingProvider.tsx:456–461`), nếu `!landmarks` kéo dài `> 60` frame (~2 giây ở 30 FPS), `initFramesCount.current` bị reset về `0`. Khi nhận diện lại được, hệ thống buộc phải chạy lại warm-up 35 frame trước khi cho phép điều hướng ánh mắt (`isGazeAllowed`, dòng 859).
4. **Hiệu chuẩn (Calibration) thất bại trong phòng tối**: `start5PointCalibration` (`EyeTrackingProvider.tsx:1765–1777`) loại bỏ mẫu nếu `avgEAR <= 0.12 || confidence <= 0.4` và ném lỗi nếu thu không đủ 15/60 mẫu hợp lệ ở mỗi bước.
5. **Bế tắc điều khiển (Catch-22)**: Khi thiếu sáng làm `faceDetected = false`, toàn bộ điều hướng bằng mắt (`LEFT`, `RIGHT`, `UP`, `DOWN`, `SELECT`) đều ngừng hoạt động. Người suy giảm vận động **không thể** tự điều khiển mắt để mở `CameraHub` hay vào `SettingsPage` bật bộ lọc thiếu sáng.

### B. Vấn đề cần kiểm thử thực tế (chưa thể kết luận chỉ từ source code)
- Mức độ suy giảm FPS thực tế của webcam phần cứng khi auto-exposure của driver tự kéo dài thời gian phơi sáng trong phòng tối (có thể tụt từ 30 FPS xuống 10–15 FPS và gây motion blur khi chớp mắt nhanh `25ms–750ms`).
- Ngưỡng độ rọi (lux) cụ thể mà MediaPipe FaceMesh (`refineLandmarks: true`) bắt đầu mất landmark hoặc làm nhiễu `EAR` / `Iris Ratio` trên các webcam laptop/điện thoại phổ thông.
- Mức độ ảnh hưởng của nhiễu hạt (ISO gain noise) lên độ ổn định của điểm mốc `468`/`473` (mống mắt) và `159`/`145` (mi mắt).

---

## 4. Vị trí tích hợp Exposure Filter

### Điểm tích hợp chính xác và tối ưu nhất
- **File**: `src/modules/eye-control/EyeTrackingProvider.tsx`
- **Hàm**: `startTrackingLoop` -> bên trong vòng lặp `render()` (dòng 1469–1484), **ngay trước lời gọi `await faceMeshRef.current.send({ image: video })` (dòng 1474)**.

### Luồng dữ liệu đề xuất
1. **Khi bộ lọc TẮT (`lowLightFilterEnabled === false`)**:
   - Bỏ qua hoàn toàn bước vẽ canvas và xử lý pixel.
   - Truyền trực tiếp `await faceMeshRef.current.send({ image: video })` như hiện tại.
   - **Đảm bảo 100% tương đương hành vi gốc**, không tốn thêm CPU/RAM/độ trễ.
2. **Khi bộ lọc BẬT (`lowLightFilterEnabled === true`)**:
   - Dùng một offscreen `<canvas>` tái sử dụng (có thể tận dụng `canvasRef` đã khai báo sẵn tại `EyeTrackingProvider.tsx:63, 2035` hoặc tạo `preprocessCanvasRef` riêng với `willReadFrequently: true`), đồng bộ kích thước theo `video.videoWidth x video.videoHeight` (thường `640x480`).
   - Vẽ frame từ `video` lên canvas -> chạy thuật toán tăng phơi sáng lên dữ liệu pixel thực tế -> truyền `{ image: preprocessCanvas }` vào `faceMeshRef.current.send(...)`.
3. **Đồng bộ hiển thị Preview (tùy chọn bổ trợ)**:
   - `CameraPreview.tsx` hiện dùng thẻ `<video>` riêng gắn `cameraStream`. Khi bật bộ lọc, có thể đồng bộ hiển thị preview đã lọc (hoặc giữ `<video>` và chỉ báo badge "Chế độ thiếu sáng đang bật") nhưng **tuyệt đối không dùng CSS filter thay thế cho dữ liệu đưa vào FaceMesh**. Lưu ý nếu vẽ preview từ canvas xử lý thì vẫn giữ nguyên tỷ lệ `videoWidth x videoHeight` để `LiveCameraOverlay.tsx` chiếu tọa độ landmark chính xác.
4. **Lưu ý về `EyeTalkDashboard.tsx`**:
   - File này thuộc route `dev-dashboard` (dashboard thử nghiệm cũ, không phải luồng chính `EyeTrackingProvider`). Có thể giữ nguyên hoặc đồng bộ sau nếu cần, không phải điểm tích hợp bắt buộc cho người dùng cuối.

---

## 5. Giải pháp kỹ thuật tối ưu và lý do lựa chọn

### So sánh 3 phương án

| Tiêu chí | 1. Hardware Exposure Compensation (`applyConstraints`) | 2. Software Exposure Enhancement (Linear Gain / `ctx.filter`) | 3. Adaptive Gamma Correction (LUT 256 phần tử + Auto-Luminance) |
| :--- | :--- | :--- | :--- |
| **Cơ chế** | Yêu cầu driver camera tăng `exposureCompensation`, `exposureMode`, `brightness` qua `MediaStreamTrack.applyConstraints()`. | Nhân tuyến tính độ sáng/tương phản (`ctx.filter = 'brightness(...)'` hoặc `pixel * gain`). | Áp dụng đường cong phi tuyến $I_{out} = 255 \cdot (I_{in}/255)^\gamma$ ($\gamma < 1$) qua bảng tra cứu LUT 256 giá trị, tự điều chỉnh $\gamma$ theo độ sáng trung bình của frame. |
| **Tương thích trình duyệt/thiết bị** | **Kém / Không đồng nhất**: Nhiều webcam UVC Windows và iOS Safari không hỗ trợ hoặc bỏ qua `exposureCompensation`. | **100%** trên mọi trình duyệt hỗ trợ Canvas 2D. | **100%** trên mọi trình duyệt hỗ trợ Canvas 2D (hoặc WebGL2). |
| **Chất lượng ảnh cho FaceMesh** | Tốt nếu phần cứng hỗ trợ, nhưng dễ làm giảm FPS camera (tăng shutter time) gây nhòe chuyển động khi chớp mắt. | Dễ gây **cháy sáng (clipping)** vùng trán/má/củng mạc và làm bệt tương phản mống mắt nếu tăng gain cao. | **Tối ưu**: Kéo sáng mạnh vùng tối (hốc mắt, lông mi, mống mắt) mà **vẫn giữ nguyên vùng sáng**, không làm cháy củng mạc. |
| **Hiệu năng & Độ trễ** | ~0 ms CPU, nhưng có thể tụt FPS phần cứng. | Rất nhanh (~0.5–1.5 ms nếu GPU rasterize). | Rất nhanh với **LUT 256 bytes** (~1.5–3 ms trên CPU ở `640x480`, hoặc <0.5 ms với WebGL2). |

### Giải pháp lựa chọn: **Adaptive Gamma Correction bằng LUT (256-entry `Uint8Array`) + EMA Luminance Smoothing**

**Lý do lựa chọn**:
1. **Bảo toàn chi tiết vùng mắt**: Đường cong Gamma ($\gamma \in [0.45, 1.0]$) khuếch đại độ chênh lệch ở dải tối (nơi chứa mí mắt và ranh giới mống mắt–củng mạc trong phòng tối) mà không bão hòa vùng sáng.
2. **Tự thích nghi khi ánh sáng thay đổi**: Tính độ sáng trung bình $L_{mean}$ trên lưới mẫu thưa (ví dụ lấy mẫu bước nhảy `step = 8` hoặc `16` pixel để chi phí gần như bằng 0), làm mượt $L_{mean}$ bằng EMA (`alpha ~ 0.1`) để tránh nhấp nháy độ sáng giữa các frame. Khi phòng đủ sáng, $\gamma \to 1.0$ (gần như không can thiệp).
3. **Chi phí CPU cực thấp & Không cấp phát bộ nhớ mỗi frame**: Tạo sẵn 1 `ImageData` tái sử dụng và 1 `Uint8Array(256)` LUT (chỉ tính lại LUT khi $|\Delta \gamma| > 0.02$). Không gọi `Math.pow` cho từng pixel.
4. **Tính độc lập tuyệt đối**: Không phụ thuộc vào việc webcam có hỗ trợ `applyConstraints` hay không, đảm bảo hoạt động ổn định trên cả laptop, PC gắn webcam rời và thiết bị di động. *(Có thể cân nhắc bổ sung probe `track.getCapabilities()` ở pha sau nếu muốn, nhưng không nên phụ thuộc).*

---

## 6. Rủi ro và phương án giảm thiểu

| Rủi ro | Nguyên nhân | Phương án giảm thiểu |
| :--- | :--- | :--- |
| **Khuếch đại nhiễu hạt (Noise)** gây rung landmark, nhảy `EAR` hoặc nhận diện nhầm chớp mắt | Trong môi trường quá tối, cảm biến webcam tăng ISO; kéo gamma quá mạnh ($\gamma < 0.4$) làm nhiễu nổi lên. | Giới hạn cận dưới $\gamma_{min} \ge 0.45$–$0.50$; áp dụng black-level pedestal nhẹ hoặc không kéo quá sâu ở vùng giá trị pixel `< 8`. |
| **Cháy sáng (Overexposure)** khi người dùng bật đèn phòng trong lúc filter đang BẬT | Bộ lọc tăng sáng cố định sẽ làm bão hòa khuôn mặt khi ánh sáng môi trường tăng đột ngột. | Dùng **Adaptive Gamma**: khi độ sáng trung bình $L_{mean}$ đạt ngưỡng đủ sáng (cần đo thực tế, dự kiến quanh ~110–130/255), tự động đưa $\gamma \to 1.0$. |
| **Trôi baseline `EAR` và `neutralIris` khi bật/tắt filter giữa chừng** | Thay đổi độ tương phản mi mắt làm `avgEAR` hoặc tâm mống mắt dịch chuyển nhẹ so với lúc chưa bật filter. | Khi trạng thái `lowLightFilterEnabled` thay đổi, tự động reset `initFramesCount.current = 0` để hệ thống chạy lại Auto-Zero 35 frame (~1 giây) và gợi ý người dùng bấm "Căn tâm" nếu đã calibration trước đó. |
| **Tăng độ trễ / giảm FPS trên thiết bị yếu** | Đọc/ghi `getImageData` + `putImageData` trên Canvas `640x480` ở CPU mỗi frame. | Tái sử dụng buffer `ImageData`, dùng `getContext('2d', { willReadFrequently: true })`, tính LUT 256 phần tử bằng `Uint8Array`, và chỉ chạy khi `lowLightFilterEnabled === true`. (Nếu cần tối ưu hơn nữa ở pha sau có thể chuyển sang WebGL2 shader). |
| **Nhấp nháy độ sáng (Brightness Flicker)** | $\gamma$ thay đổi liên tục theo từng frame khi người dùng cử động đầu. | Làm mượt $L_{mean}$ bằng bộ lọc EMA chậm (`alpha = 0.08–0.12`) và chỉ cập nhật LUT khi chênh lệch $\gamma$ vượt ngưỡng deadband (ví dụ `0.02`). |

---

## 7. Phương án tích hợp nút bật/tắt & Kích hoạt khi không thấy mắt

### A. Vị trí đặt nút bật/tắt trên giao diện hiện tại
1. **Trong `CameraHub.tsx` (Ưu tiên cao — thao tác nhanh)**:
   - Đặt một nút toggle **Thiếu sáng** (icon `Sun` / `Moon` từ `lucide-react`) trên thanh Header của `CameraHub` (cạnh nút `Căn tâm` và `Hiệu chuẩn`, `CameraHub.tsx:188–210`) hoặc trong thanh `Live Layer Toggles Bar` dưới khung video (`CameraHub.tsx:316–349`).
   - Giúp người dùng hoặc người hỗ trợ bật/tắt ngay khi đang quan sát trực tiếp chất lượng nhận diện trên video.
2. **Trong `SettingsPage.tsx` (Cài đặt hệ thống)**:
   - Đặt trong **Section 2: "Camera & Hiệu chỉnh mắt"** (`SettingsPage.tsx:510–576`), bọc trong `<EyeFocusable id="btn-setting-toggle-lowlight" speakLabel="...">` đồng bộ với các nút hiện có.
   - Bổ sung trạng thái lưu bền vững vào `localStorage` (trong `luckydream_eye_settings` hoặc key riêng) để tự nhớ cho các lần mở app sau.

### B. Phương án kích hoạt khi camera KHÔNG nhận diện được mắt (Giải quyết Catch-22)
Khi phòng tối khiến `faceDetected === false`, người dùng không thể dùng mắt để bấm nút. Cần kết hợp đồng thời các cơ chế dự phòng sau:
1. **Tự động phát hiện thiếu sáng & Gợi ý / Tự bật có kiểm soát**:
   - Định kỳ (ví dụ mỗi 30 frame) kiểm tra độ sáng trung bình của frame video khi `cameraActive === true`.
   - Nếu `noFaceFramesCount > 90` (~3 giây liên tục không thấy mặt) **VÀ** độ sáng trung bình thấp dưới ngưỡng tối:
     - **Mức an toàn**: Phát thông báo giọng nói (`speakVietnamese("Ánh sáng yếu, đang bật hỗ trợ thiếu sáng")` hoặc gợi ý) và tự động kích hoạt chế độ thiếu sáng tạm thời (nếu người dùng bật tùy chọn *Tự động hỗ trợ thiếu sáng*), hoặc hiển thị banner nổi bật trên `GlobalEyeHUD` / `CameraHub`.
2. **Phím tắt trên Keyboard Simulator (`EyeTrackingProvider.tsx:1113–1447`)**:
   - Bổ sung phím tắt (ví dụ phím `L` hoặc `F2`) trong `handleKeyDown` để người chăm sóc hoặc người dùng có khả năng bấm phím đơn lẻ bật/tắt tức thì mà không cần nhìn vào nút.
3. **Nút chạm kích thước lớn trên `GlobalEyeHUD` khi mất mặt**:
   - Khi `cameraActive && !faceDetected` kéo dài, trên pill của `GlobalEyeHUD` (`GlobalEyeHUD.tsx:227–304`) có thể hiện badge/nút chạm nhanh *"Bật sáng"* để người thân hỗ trợ chạm 1 lần.
4. **Ghi nhớ trạng thái qua `localStorage`**:
   - Lưu cấu hình `lowLightFilterEnabled` để nếu người dùng thường xuyên sử dụng vào ban đêm, bộ lọc sẵn sàng ngay khi khởi động.

---

## 8. Kế hoạch triển khai và kiểm thử chi tiết

### Giai đoạn 1: Chuẩn bị & Module xử lý ảnh thuần (Pure Utility)
- Tạo module độc lập (ví dụ `src/modules/eye-control/lowLightFilter.ts`) chứa:
  - Hàm ước lượng độ sáng trung bình $L_{mean}$ bằng lấy mẫu thưa trên `Uint8ClampedArray`.
  - Hàm tính $\gamma$ thích nghi có EMA smoothing + deadband.
  - Bộ đệm `Uint8Array(256)` LUT và hàm áp dụng LUT in-place lên `ImageData`.
- **Kiểm thử Unit (Vitest)**: Test với dữ liệu pixel giả lập (ảnh tối đồng nhất, ảnh sáng, ảnh tương phản cao) để xác minh LUT không làm tràn giá trị `[0, 255]`, khi $\gamma = 1.0$ đầu ra giữ nguyên, và hiệu năng xử lý `640x480` nằm trong ngưỡng mục tiêu.

### Giai đoạn 2: Tích hợp vào `EyeTrackingProvider.tsx` & State
- Thêm `lowLightFilterEnabled: boolean` (mặc định `false`) vào `EyeControlSettings` (`types.ts`), lưu vào `localStorage`.
- Khởi tạo offscreen canvas tái sử dụng trong `EyeTrackingProvider.tsx`.
- Trong `startTrackingLoop` -> `render()` (trước dòng 1474):
  - Nếu `lowLightFilterEnabled === false`: truyền `{ image: video }` như cũ.
  - Nếu `lowLightFilterEnabled === true`: vẽ `video` lên offscreen canvas -> áp dụng Adaptive Gamma LUT -> truyền `{ image: preprocessCanvas }`.
- Reset `initFramesCount.current = 0` khi toggle filter để Auto-Zero ổn định lại baseline.
- Thêm phím tắt toggle (ví dụ `L` / `F2`) trong Simulator listener và logic phát hiện thiếu sáng khi mất mặt.

### Giai đoạn 3: Tích hợp UI
- Thêm nút bật/tắt trong `CameraHub.tsx` và `SettingsPage.tsx` (bọc `<EyeFocusable>` với `speakLabel`).
- Đảm bảo **không** ảnh hưởng đến bất kỳ route/component nào của phần bệnh nhân (`patient-*`).

### Giai đoạn 4: Kiểm thử thực tế (Real-World Verification Matrix)
Cần đo đạc trực tiếp trên thiết bị thật (Laptop webcam & Mobile) với các kịch bản:
1. **Regression khi TẮT filter**: So sánh FPS, độ trễ, `EAR`, `Iris Ratio`, tỷ lệ nhận diện 1/2/3 chớp mắt và liếc 4 hướng — phải **giống hệt 100%** trước khi sửa.
2. **Môi trường thiếu sáng (ví dụ phòng tắt đèn chỉ còn ánh sáng màn hình / đèn ngủ)**:
   - Đo tỷ lệ `faceDetected === true` khi TẮT vs BẬT filter.
   - Đo độ ổn định `rawEAR` (độ lệch chuẩn khi mở mắt tự nhiên) để kiểm tra có bị nhiễu kích hoạt nhầm chớp mắt hay không.
   - Kiểm tra `start5PointCalibration` có hoàn thành đủ 5 bước mà không báo lỗi thiếu mẫu.
   - Kiểm tra độ chính xác của `DOWN` (1 chớp), `SELECT` (2 chớp), `EMERGENCY` (3 chớp) và `LEFT`/`RIGHT`/`UP`.
3. **Môi trường ánh sáng bình thường / chuyển đèn đột ngột**:
   - Bật filter trong phòng đủ sáng để xác minh Adaptive Gamma tự hạ về $\gamma \approx 1.0$, không gây cháy sáng mặt hay mất landmark.
4. **Hiệu năng & Độ trễ**:
   - Đo thời gian xử lý mỗi frame (ms) và FPS thực tế của `requestAnimationFrame` + `FaceMesh.send()` khi BẬT vs TẮT filter trên máy cấu hình trung bình/yếu.

---

## 9. Kết luận: **CONDITIONAL GO (ĐỦ ĐIỀU KIỆN TRIỂN KHAI CÓ ĐIỀU KIỆN)**

Hệ thống điều khiển mắt hiện tại ở phần người suy giảm có kiến trúc tập trung rất sạch tại `EyeTrackingProvider.tsx`, đặc biệt vòng lặp `startTrackingLoop` đã có sẵn cơ chế backpressure (`isProcessingRef`) và tách biệt hoàn toàn với phần bệnh nhân. Việc chèn một lớp tiền xử lý **Adaptive Gamma Correction (LUT)** ngay trước `faceMeshRef.current.send()` là **khả thi cao, ít rủi ro và không cần thay đổi thuật toán `eyeTracker.ts` hay các ngưỡng Gesture FSM hiện tại**.

### Các điều kiện bắt buộc trước khi đưa vào sử dụng chính thức
1. **Tắt mặc định (`false`) & Bypass 100% khi tắt**: Khi filter tắt, đường truyền `{ image: video }` không được phép thay đổi để đảm bảo không có bất kỳ hồi quy (regression) nào.
2. **Bắt buộc dùng Adaptive Gamma (tự điều chỉnh về 1.0 khi đủ sáng)** thay vì tăng sáng tuyến tính cố định, nhằm tránh cháy sáng và mất tương phản mống mắt.
3. **Phải có cơ chế kích hoạt không cần mắt** (auto-detect khi mất mặt trong tối + phím tắt/chạm nhanh cho người hỗ trợ) để giải quyết bế tắc Catch-22.
4. **Phải qua kiểm thử thực nghiệm** trên webcam thực tế trong điều kiện thiếu sáng (đo tỷ lệ giữ landmark, false-blink rate, và FPS/latency) trước khi bật mặc định hoặc phát hành rộng rãi.
