# 06. TỪ ĐIỂN KHÁI NIỆM KỸ THUẬT TRONG EYEAI

Mỗi khái niệm dưới đây được trình bày theo 7 ý: (1) Định nghĩa, (2) Nguyên lý hoạt động, (3) Ví dụ dễ hiểu, (4) Vai trò trong EYEAI, (5) File & Hàm sử dụng, (6) Lý do phù hợp, (7) Khái niệm dễ nhầm lẫn.

---

## Nhóm 1: AI, Học máy & Thị giác máy tính

### 1. Artificial Intelligence (AI — Trí tuệ nhân tạo)
1. **Định nghĩa**: Lĩnh vực khoa học máy tính xây dựng các hệ thống có khả năng thực hiện các tác vụ đòi hỏi trí thông minh con người (nhận thức thị giác, hiểu/sinh ngôn ngữ, ra quyết định).
2. **Nguyên lý**: Bao gồm nhiều nhánh từ hệ thống dựa trên luật (rule-based) đến học máy (ML) và học sâu (DL).
3. **Ví dụ**: Trợ lý ảo hiểu câu hỏi tiếng Việt và trả lời tự nhiên (Gemini), hoặc hệ thống nhận ra vị trí khuôn mặt trong ảnh.
4. **Vai trò trong EYEAI**: Dùng AI ở hai điểm: MediaPipe FaceMesh (nhận diện điểm mốc khuôn mặt/mống mắt) và Google Gemini (trò chuyện trợ lý ảo).
5. **File & Hàm**: `EyeTrackingProvider.tsx` (`startTrackingLoop`), `AiPage.tsx` (`handleSend`, `fetchDirectGemini`), `server.ts` (`handleAiChat`), `ai-chat.ts`.
6. **Lý do phù hợp**: Kết hợp thị giác tiền huấn luyện chạy biên (giảm độ trễ) và LLM đám mây (giao tiếp tự nhiên).
7. **Dễ nhầm lẫn**: Không phải mọi code "thông minh" trong EYEAI đều là AI — các công thức EAR, Canthal Gaze, FSM hoàn toàn là toán học và logic tất định, không phải AI.

### 2. Machine Learning (ML — Học máy)
1. **Định nghĩa**: Nhánh của AI cho phép hệ thống học quy luật từ dữ liệu mẫu thay vì lập trình cứng từng điều kiện.
2. **Nguyên lý**: Tối ưu hóa tham số mô hình trên tập dữ liệu huấn luyện để suy đoán (inference) trên dữ liệu mới.
3. **Ví dụ**: Mô hình học từ hàng trăm nghìn ảnh khuôn mặt để dự đoán vị trí 468 điểm trên mặt.
4. **Vai trò trong EYEAI**: EYEAI không tự train ML; hệ thống tiêu thụ mô hình ML/DL đã đóng gói sẵn trong MediaPipe FaceMesh và Gemini.
5. **File & Hàm**: `EyeTrackingProvider.tsx` (`faceMeshRef.current.send`), `AiPage.tsx`.
6. **Lý do phù hợp**: Tiết kiệm chi phí huấn luyện, triển khai tức thì trên trình duyệt web.
7. **Dễ nhầm lẫn**: "Hiệu chuẩn 5 hướng" (`start5PointCalibration`) lấy giá trị trung vị (median) của 32 mẫu, đó là thống kê hiệu chỉnh ngưỡng, **không** phải Machine Learning.

### 3. Deep Learning (DL — Học sâu) & 4. Neural Network (Mạng nơ-ron)
1. **Định nghĩa**: Mạng nơ-ron nhân tạo mô phỏng kết nối neuron nhiều lớp; Deep Learning sử dụng nhiều tầng ẩn (như CNN, Transformer) để tự trích xuất đặc trưng cấp cao từ dữ liệu thô (pixel/văn bản).
2. **Nguyên lý**: Lan truyền thuận qua các lớp tích chập/chú ý để biến ma trận ảnh thành tọa độ điểm mốc hoặc biến chuỗi token thành văn bản trả lời.
3. **Ví dụ**: BlazeFace + FaceMesh CNN nhận đầu vào ảnh 2D và xuất ra 478 tọa độ 3D.
4. **Vai trò trong EYEAI**: MediaPipe FaceMesh (CNN) và Gemini (Transformer LLM).
5. **File & Hàm**: `EyeTrackingProvider.tsx:1469-1510`, `AiPage.tsx:59-125`.
6. **Lý do phù hợp**: Pixel khuôn mặt thay đổi mạnh theo ánh sáng, góc nghiêng; mạng sâu chịu biến thiên tốt hơn thuật toán dò cạnh cổ điển.
7. **Dễ nhầm lẫn**: `EyeMetrics` trong `eyeTracker.ts` là đầu ra hình học *sau* mạng nơ-ron, không phải đầu ra trực tiếp của mạng.

### 5. Computer Vision (CV — Thị giác máy tính)
1. **Định nghĩa**: Lĩnh vực giúp máy tính thu nhận, xử lý và trích xuất thông tin có nghĩa từ ảnh hoặc video số.
2. **Nguyên lý**: Kết hợp tiền xử lý ảnh (gamma, luminance), phát hiện đặc trưng/landmark và phân tích hình học.
3. **Ví dụ**: Tăng sáng ảnh webcam tối bằng LUT rồi xác định hướng nhìn của mắt.
4. **Vai trò trong EYEAI**: Toàn bộ chuỗi `lowLightFilter.ts` → `MediaPipe FaceMesh` → `eyeTracker.ts` → `LiveCameraOverlay.tsx`.
5. **File & Hàm**: `lowLightFilter.ts` (`processFrame`), `eyeTracker.ts` (`analyzeEyes`), `EyeTrackingProvider.tsx` (`processFaceMeshResults`).
6. **Lý do phù hợp**: Giao tiếp không cần phần cứng chuyên dụng (Tobii), chỉ cần webcam phổ thông.
7. **Dễ nhầm lẫn**: CV bao gồm cả xử lý ảnh cổ điển (Gamma LUT) lẫn Deep Learning (FaceMesh), không đồng nghĩa 100% với AI.

### 6. Facial Landmark (Điểm mốc khuôn mặt) & Normalized Coordinates
1. **Định nghĩa**: Tập các tọa độ giải phẫu cố định trên mặt (khóe mắt, mí mắt, đầu mũi, cằm, tâm mống mắt). Tọa độ chuẩn hóa đưa giá trị `x, y` về đoạn `[0, 1]` theo kích thước khung hình.
2. **Nguyên lý**: Dùng chỉ số cố định (ví dụ `33, 133, 159, 145, 468`) để truy xuất cùng một bộ phận dù mặt ở vị trí nào trong khung.
3. **Ví dụ**: `landmarks[468]` luôn là tâm mống mắt trái; `x = 0.5, y = 0.5` là chính giữa ảnh.
4. **Vai trò trong EYEAI**: Mọi phép đo EAR, hướng nhìn, head pose và vẽ mesh 3D đều dựa vào 478 landmarks chuẩn hóa.
5. **File & Hàm**: `eyeTracker.ts` (`EYE_INDICES`, `LEFT_EYE_CONTOUR`, `analyzeEyes`), `LiveCameraOverlay.tsx`, `FaceMeshVisualizer.tsx`.
6. **Lý do phù hợp**: Tọa độ chuẩn hóa giúp công thức độc lập với độ phân giải camera (`640×480` hay `1280×720`).
7. **Dễ nhầm lẫn**: Trong ảnh thô MediaPipe, `x` chưa lật gương; còn trên màn hình selfie (`mirrored={true}`), UI lật `1 - pt.x`, dẫn tới phải đảo dấu `rawGazeX = -((...))` tại `eyeTracker.ts:258`.

---

## Nhóm 2: Eye Tracking, Hình học & Xử lý tín hiệu

### 7. Eye Tracking vs 8. Gaze Tracking
1. **Định nghĩa**: *Eye Tracking* theo dõi trạng thái mắt (mở/nhắm, chớp mắt, vị trí mắt); *Gaze Tracking* ước lượng hướng mà người dùng đang nhìn.
2. **Nguyên lý**: EYEAI đo độ mở mí (EAR) để track chớp mắt và đo độ lệch tâm mống mắt so với trục khóe mắt để phân loại hướng liếc (4 hướng rời rạc, hiện thực tế bật 3 hướng `LEFT/RIGHT/UP`).
3. **Ví dụ**: Chớp mắt 2 cái (`SELECT`) là Eye Tracking; liếc sang phải (`RIGHT`) là Gaze Tracking.
4. **Vai trò trong EYEAI**: Kết hợp cả hai kênh (liếc để di chuyển tiêu điểm, chớp 1/2/3 để xuống/chọn/khẩn cấp).
5. **File & Hàm**: `eyeTracker.ts` (`analyzeEyes`), `EyeTrackingProvider.tsx` (`processFaceMeshResults`).
6. **Lý do phù hợp**: Webcam thường không đủ phân giải để ước lượng tọa độ pixel chính xác trên màn hình (gaze point mapping), nên phân loại hướng rời rạc + lưới `EyeFocusable` ổn định hơn nhiều.
7. **Dễ nhầm lẫn**: EYEAI làm **discrete directional gaze classification** (`CENTER/LEFT/RIGHT/UP`), không phải **2D screen-space gaze cursor** như mắt đọc Tobii hồng ngoại.

### 9. Geometric Algorithm (Thuật toán hình học) & Canthal Baseline Projection
1. **Định nghĩa**: Tính toán dựa trên vector, khoảng cách Euclid (`dist2D`), tích vô hướng chiếu trực giao.
2. **Nguyên lý**: Dựng hệ tọa độ cục bộ gắn với đường nối 2 khóe mắt (xương sọ cố định) rồi chiếu vector lệch của mống mắt lên 2 trục vuông góc.
3. **Ví dụ**: Khi nhìn xuống, mí trên sụp xuống nhưng khóe mắt `33` và `133` đứng yên → phép chiếu lên trục khóe mắt không bị đảo dấu.
4. **Vai trò trong EYEAI**: Loại bỏ lỗi đảo ngược hướng lên/xuống và chịu được nghiêng đầu nhẹ.
5. **File & Hàm**: `eyeTracker.ts:188-261` (`analyzeEyes`).
6. **Lý do phù hợp**: Nhẹ (O(1)), không cần tham số học, phản hồi tức thì ở mức sub-millisecond.
7. **Dễ nhầm lẫn**: Khác với `src/utils/eyeTracker.ts` (file cũ lấy tỷ lệ theo mí trên/dưới).

### 10. Finite State Machine (FSM — Máy trạng thái hữu hạn)
1. **Định nghĩa**: Mô hình tính toán gồm hữu hạn trạng thái, chuyển trạng thái khi thỏa điều kiện chuyển (transition) và sinh đầu ra.
2. **Nguyên lý**: Chuyển trạng thái phụ thuộc cả trạng thái hiện tại, giá trị đầu vào mới và đồng hồ thời gian thực.
3. **Ví dụ**: `blinkCountInGesture` chuyển `0 → 1 → 2 → 3` khi có chớp hợp lệ trong cửa sổ 700ms; hết 700ms thì kích hoạt lệnh tương ứng và quay về `0`.
4. **Vai trò trong EYEAI**: Quản lý Blink Count FSM, Gaze Direction State (`CENTER/LEFT/RIGHT/UP/UNKNOWN`), Calibration Stage FSM, Call Status FSM.
5. **File & Hàm**: `EyeTrackingProvider.tsx:538-1045`, `CallProvider.tsx`.
6. **Lý do phù hợp**: Ngăn nhận diện trùng lặp, tách bạch chớp mắt tự nhiên với cử chỉ chủ đích.
7. **Dễ nhầm lẫn**: FSM khác với `if-else` đơn thuần theo từng frame ở chỗ có **trí nhớ trạng thái** (`isEyesClosed`, `reArmedRef`, `gazeDirState`) qua thời gian.

### 11. Real-time Processing, EMA, Hysteresis, Debounce, Cooldown, Adaptive Gamma LUT
1. **Real-time Processing**: Xử lý liên tục theo từng khung hình (`requestAnimationFrame`), tách ref 30–60 FPS khỏi state UI 15 FPS, dùng `isProcessingRef` chống nghẽn hàng đợi (backpressure).
2. **EMA (Exponential Moving Average)**: `y_t = α·x_t + (1-α)·y_{t-1}` dùng để làm mượt tín hiệu gaze (`α = 0.45`), tự căn tâm (`α = 0.25` / `0.012`), và làm mượt độ sáng thiếu sáng (`α = 0.1`).
3. **Hysteresis (Độ trễ chuyển trạng thái)**: Ngưỡng vào khác ngưỡng ra (ví dụ đóng mắt `< blinkThresh`, mở lại `>= blinkThresh + 0.015`; vào hướng liếc `>= thresh`, thoát về `CENTER` `< 0.55 * thresh`) giúp chống rung biên (chattering).
4. **Debounce & Lockout**: Chống dội bấm đúp `350ms` ở `EyeFocusable.tsx:91`; khóa gaze `300ms` sau khi mở mắt (`EyeTrackingProvider.tsx:879`).
5. **Cooldown**: Thời gian nghỉ sau khi lệnh thực thi (`2500ms` chuẩn, `1200ms` cho `DOWN`, `3000ms` cho `EMERGENCY`, `1000ms` khi đụng biên).
6. **Adaptive Gamma LUT**: Bảng tra 256 phần tử `Uint8Array` tính trước lũy thừa `(i/255)^gamma` để biến đổi toàn bộ ảnh `640×480` chỉ bằng thao tác đọc mảng $O(W \cdot H)$ thay vì gọi `Math.pow` 921.600 lần mỗi frame (`lowLightFilter.ts:97-125`).

---

## Nhóm 3: React, TypeScript & Kiến trúc Frontend

### 12. React, TypeScript, Context API, Provider, Custom Hook
1. **React & TypeScript**: Xây dựng UI khai báo theo component và kiểm soát kiểu dữ liệu chặt chẽ (`EyeTrackingState`, `EyeAction`, `EyeFocusNode`, `GridItem`).
2. **Context API & Provider**: `EyeTrackingProvider`, `EyeNavigationProvider`, `TutorialProvider`, `CallProvider`, `EyeFocusScopeContext` truyền dữ liệu xuyên cây component không cần prop-drilling.
3. **Custom Hook**: `useEyeTrackingSettings`, `useEyeTrackingTelemetry`, `useEyeTracking`, `useAudioSettings`, `useEyeNavigation`, `useAuth`, `useGeolocation`, `useCall`, `useTutorial`.

### 13. State vs Ref vs Effect
1. **State (`useState`)**: Kích hoạt re-render UI (ví dụ `trackingState`, `activeFocusId`, `calibrationStage`).
2. **Ref (`useRef`)**: Lưu giá trị thay đổi ở tần suất cao hoặc tham chiếu DOM/WebRTC (`videoRef`, `faceMeshRef`, `smoothGazeX`, `nodesRef`, `cooldownTimer`) mà **không** gây re-render.
3. **Effect (`useEffect`)**: Đồng bộ side effect như đăng ký node vào `EyeNavigationProvider`, chạy `requestAnimationFrame`, lắng nghe `keydown`, tự động cuộn khi `activeFocusId` đổi, dọn dẹp camera khi unmount.
4. **Dễ nhầm lẫn**: Nếu đưa `smoothGazeX` hay `nodesRef` vào `useState`, mỗi frame sẽ gây render storm hoặc stale closure trong `onResults` của MediaPipe.

---

## Nhóm 4: Lập trình bất đồng bộ, Sự kiện, Web API & Accessibility

### 14. Event-driven & Asynchronous Programming
- **Event-driven**: `CustomEvent` (`eyeai:emergency`, `eyeai:escape`, `eyetalk:speech-settings-changed`), `window.addEventListener('keydown'/'resize')`, Supabase `broadcast` và `postgres_changes`.
- **Asynchronous**: `async/await` cho `getUserMedia`, `faceMesh.send()`, `start5PointCalibration` (vòng lặp `sleep(55)`), `fetch('/api/ai/chat')`, `fetch('/api/tts')` với `AbortController`.

### 15. Accessibility (Khả năng tiếp cận) & Focus Trap
- **Eye Accessibility**: Kích thước vùng chạm tối thiểu `48–64px`, tương phản cao `#00E5FF` trên `#14213D`/`#FFF2D6`, tự động đọc tên phần tử khi focus (`EyeFocusable.tsx:108-119`), hỗ trợ `prefers-reduced-motion` (`index.css:147-162`, `eyeFocusAutoScroll.ts:170-173`).
- **Focus Trap (`Modal.tsx`, `EyeNavigationProvider.tsx`)**: Khóa tiêu điểm bên trong modal đang mở bằng `scopeStackRef` và khôi phục về nút cũ khi đóng.

### 16. Web APIs được sử dụng trực tiếp
- **MediaDevices (`getUserMedia`) & `MediaStream`**: Truy cập webcam và micro.
- **Canvas 2D API (`getImageData`, `putImageData`, `drawImage`)**: Tiền xử lý thiếu sáng và vẽ overlay FaceMesh 2D/3D.
- **`requestAnimationFrame` & `performance.now()`**: Vòng lặp đồng bộ khung hình màn hình và đo thời gian độ phân giải sub-millisecond cho FSM.
- **Web Speech API (`SpeechSynthesis`) & Web Audio API (`AudioContext`, `decodeAudioData`)**: Phát âm thanh phản hồi tức thì và giải mã MP3 từ `/api/tts`.
- **WebRTC (`RTCPeerConnection`)**: Truyền âm thanh P2P trong cuộc gọi người thân.
- **Geolocation API (`getCurrentPosition`, `watchPosition`)**: Lấy tọa độ GPS cho `LocationPage`.
- **Web Storage (`localStorage`, `sessionStorage`)**: Lưu cài đặt mắt, hiệu chuẩn, cấu hình loa và trạng thái mở khóa âm thanh.
- **ResizeObserver & `getBoundingClientRect()`**: Đo chiều cao `VirtualKeyboard` động và tính vị trí không gian 2D cho điều hướng mắt.
