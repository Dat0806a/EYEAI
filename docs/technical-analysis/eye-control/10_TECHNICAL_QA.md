# 10. BỘ CÂU HỎI VÀ TRẢ LỜI PHẢN BIỆN KỸ THUẬT (65 Q&A)

> Bộ câu hỏi được chia thành 9 nhóm từ Cơ bản đến Chuyên sâu và Phản biện thực tế. Mọi câu trả lời đều căn cứ trực tiếp trên mã nguồn hiện tại của EYEAI để người bảo vệ trình bày mạch lạc, chính xác và không phóng đại.

---

## I. Cấp độ Cơ bản (7 câu)

**Q1. Mục tiêu của phân hệ Người suy giảm trong EYEAI là gì?**  
**Trả lời**: Cho phép người hạn chế vận động (`profile.account_type === 'impaired'`) điều khiển toàn bộ ứng dụng giao tiếp rảnh tay bằng mắt: chuyển tiêu điểm giữa các nút, chọn tính năng, gõ bàn phím tiếng Việt phát ra loa (`SpeakPage`), hỏi đáp trợ lý AI (`AiPage`), nhắn tin/gọi thoại người thân (`ContactsPage`, `HumanChatPage`), giải trí YouTube (`EntertainmentPage`), xem vị trí (`LocationPage`) và gọi khẩn cấp (`SosPage`).

**Q2. Hệ thống nhận những cử chỉ mắt nào trong phiên bản hiện tại?**  
**Trả lời**: Theo `EyeTrackingProvider.tsx` (dòng 559–1045), hệ thống dùng 2 kênh:
- **Liếc mắt (Gaze)**: Liếc Trái (`LEFT`), Liếc Phải (`RIGHT`), Liếc Lên (`UP`). Hướng liếc xuống đã được tắt chủ động (`lines 917-919`).
- **Chớp mắt (Blink)**: Chớp 1 cái → Xuống (`DOWN`), Chớp 2 cái → Chọn (`SELECT`), Chớp 3 cái → Gọi khẩn cấp (`EMERGENCY`). Ngoài ra ở `SosPage.tsx:73-77` còn có fallback nhắm mắt liên tục $\ge 8.0\text{s}$.

**Q3. Nếu thiết bị không có camera hoặc đang phát triển trên máy tính thì thử nghiệm bằng cách nào?**  
**Trả lời**: Bật `simulatorMode` (mặc định `true` ở `EyeTrackingProvider.tsx:122`). Bộ lắng nghe bàn phím ở dòng 1128–1462 cho phép dùng các phím mũi tên `← ↑ → ↓` để điều hướng, `Space` 1/2/3 lần mô phỏng 1/2/3 cái chớp mắt (`DOWN`/`SELECT`/`EMERGENCY`), `Enter` để `SELECT`, `F1` để `EMERGENCY`, và `Escape` để `ESCAPE`.

**Q4. Người dùng có thể hiệu chỉnh mắt cho phù hợp với từng cá nhân không?**  
**Trả lời**: Có. Trong `CameraHub.tsx` và `SettingsPage.tsx` có hai công cụ: nút **"Căn tâm"** (`reZeroCenter`) lấy ngay vị trí nhìn thẳng hiện tại làm gốc trung tính, và **"Hiệu chuẩn"** (`start5PointCalibration`) hướng dẫn nhìn 5 hướng (Thẳng, Lên, Xuống, Trái, Phải) để tính ngưỡng riêng cho từng hướng và ngưỡng chớp mắt.

**Q5. Hệ thống có tách biệt với chế độ Bệnh nhân thông thường không?**  
**Trả lời**: Có. `App.tsx` (dòng 75–79, 192–213, 269–271) tự động tắt `eyeControlEnabled` khi `account_type === 'patient'` và chỉ render `GlobalEyeHUD` khi `profile?.account_type === 'impaired'` và route không bắt đầu bằng `patient-`.

**Q6. Bàn phím ảo hỗ trợ gõ tiếng Việt như thế nào?**  
**Trả lời**: `VirtualKeyboard.tsx` dùng 3 bố cục (`QWERTY_LAYOUT`, `NUMBERS_LAYOUT`, `PHRASES_LAYOUT` có 8 mẫu câu y tế/sinh hoạt nhanh) kết hợp hàm `applyVietnameseAccents()` trong `vietnameseTelex.ts` tự động ghép dấu Telex khi 2 ký tự cuối khớp cặp nguyên âm + phím dấu (`s, f, r, x, j`).

**Q7. Phản hồi âm thanh hoạt động khi nào?**  
**Trả lời**: Qua `speakVietnamese()` trong `src/utils/speech.ts`: khi chuyển focus sang nút mới (`EyeFocusable.tsx:114` đọc tên nút sau 100ms), khi chọn nút (`"Đã chọn ..."`), khi điều hướng thành công hoặc đụng biên (`EyeTrackingProvider.tsx:307-333`), và khi AI hoặc người dùng phát câu nói.

---

## II. Cấp độ Trung bình (7 câu)

**Q8. Tại sao EYEAI tách `EyeTrackingProvider` thành hai Context (`Settings` và `Telemetry`)?**  
**Trả lời**: `trackingState` cập nhật ~15 lần/giây (`TELEMETRY_THROTTLE_MS = 65ms`). Nếu gộp chung vào 1 Context, mọi component chỉ cần đọc cấu hình hoặc hàm (`EyeFocusable`, các page, `VirtualKeyboard`) sẽ bị re-render liên tục 15 lần/giây. Việc tách Context tại `EyeTrackingProvider.tsx:55-56` giúp chỉ các HUD (`GlobalEyeHUD`, `CameraHub`, `CameraPreview`) nhận telemetry mới re-render.

**Q9. Vì sao các biến bộ lọc như `smoothGazeX`, `isEyesClosed`, `cooldownTimer` lại lưu trong `useRef` thay vì `useState`?**  
**Trả lời**: Vòng lặp `processFaceMeshResults` chạy ở tần số camera (~30 FPS) bên trong callback `faceMesh.onResults`. Nếu lưu bằng `useState`, giá trị bị đóng băng trong closure (stale closure) hoặc gây render thừa 30 lần/giây. `useRef` cho phép đọc/ghi đồng bộ O(1) ở mọi frame mà không kích hoạt render React.

**Q10. Làm sao `EyeFocusable` biết nó đang nằm trong một Modal để không bị lẫn với nút nền phía sau?**  
**Trả lời**: `Modal.tsx` (dòng 38, 90) gọi `pushFocusScope(modalScopeId)` khi mở và bọc `children` trong `<EyeFocusScopeContext.Provider value={modalScopeId}>`. Mỗi `EyeFocusable` tự đọc `useEyeFocusScope()` (`EyeFocusable.tsx:38-39`) và đăng ký kèm `scopeId`. `EyeNavigationProvider.navigate()` lọc ứng viên chỉ khớp với `scopeStackRef` trên cùng.

**Q11. Chuyện gì xảy ra khi bàn phím ảo hoặc header che mất phần tử đang focus?**  
**Trả lời**: Mỗi lần `activeFocusId` hoặc `isKeyboardOpen` đổi, `EyeNavigationProvider.tsx:525-533` gọi `ensureEyeFocusVisible()`. Hàm này trong `eyeFocusAutoScroll.ts` đo chiều cao `<header>`, `#keyboard-eye-hud-bar`, `#smartphone-virtual-keyboard` (`--virtual-keyboard-height`), cộng thêm `FOCUS_RING_BUFFER = 18px`, rồi cuộn container lồng (nếu có) và `window.scrollBy` để đưa phần tử vào vùng nhìn an toàn. Riêng các phím trong bàn phím ảo được bỏ qua không cuộn trang (`lines 161-167`).

**Q12. Khi đang thực hiện cuộc gọi thoại WebRTC (`CallProvider`), tại sao camera theo dõi mắt không bị tắt?**  
**Trả lời**: Trong `CallProvider.tsx:225-247`, `acquireMediaStream()` chỉ yêu cầu `getUserMedia({ audio: true, video: false })` để lấy micro cho cuộc gọi thoại, và `handleCleanup()` (dòng 485–493) chỉ dừng các track lưu trong `callTracksToStopRef` (micro của cuộc gọi), hoàn toàn tách biệt với `mediaStreamRef` của `EyeTrackingProvider`.

**Q13. Tại sao `EyeTrackingProvider` luôn gọi `recoverAudioSession()` khi bật hoặc tắt camera?**  
**Trả lời**: Trên một số trình duyệt (đặc biệt iOS Safari/WebKit), việc mở hoặc đóng luồng `MediaStream` phần cứng qua `getUserMedia` có thể làm `AudioContext` rơi vào trạng thái `'suspended'` hoặc `'interrupted'` và làm `speechSynthesis` bị `paused`. Gọi `recoverAudioSession()` tại dòng `1558, 1602, 1659, 1675` giúp đánh thức lại âm thanh phản hồi ngay lập tức.

**Q14. Khi camera không nhìn thấy khuôn mặt trong thời gian dài, hệ thống xử lý thế nào?**  
**Trả lời**: Tại `EyeTrackingProvider.tsx:471-510`, `noFaceFramesCount` tăng mỗi frame mất mặt. Nếu `noFaceFramesCount > 60` (~2 giây), hệ thống đặt `initFramesCount = 0` để tự động căn tâm lại khi khuôn mặt quay lại; đồng thời vẫn giảm `cooldownTimer`, đặt `faceDetected = false`, `gazeDirection = 'UNKNOWN'` và khóa `blinkCount = 0`.

---

## III. Cấp độ Chuyên sâu (7 câu)

**Q15. Giải thích ý nghĩa từng tham số trong cấu hình MediaPipe FaceMesh của EYEAI?**  
**Trả lời**: Tại `EyeTrackingProvider.tsx:1472-1477`:
- `maxNumFaces: 1`: Chỉ tìm 1 khuôn mặt để tối ưu hiệu năng.
- `refineLandmarks: true`: Bắt buộc để bật sub-model tinh chỉnh mắt và xuất thêm 10 điểm mống mắt (`468–477`). Nếu `false`, hệ thống chỉ có 468 điểm và `eyeTracker.ts` sẽ rơi vào nhánh fallback ước lượng tâm mắt theo trung điểm mí/khóe (`lines 173-186`), mất khả năng theo dõi đồng tử chính xác.
- `minDetectionConfidence: 0.6` & `minTrackingConfidence: 0.6`: Ngưỡng tự tin tối thiểu 60% khi phát hiện mới và khi bám theo giữa các khung hình.

**Q16. Tại sao `EyeTrackingProvider` dùng `isProcessingRef` trong vòng `requestAnimationFrame`?**  
**Trả lời**: `faceMesh.send({ image })` là hàm bất đồng bộ (`Promise`) chạy suy luận WebGL/WASM. Nếu một khung hình mất > 33ms để xử lý mà rAF vẫn gọi `send()` tiếp ở 60Hz, hàng đợi frame sẽ phình to gây lag dồn (queue buildup) và tăng độ trễ thao tác mắt. Cờ `isProcessingRef` (`lines 1486-1515`) tạo cơ chế **backpressure**: chỉ gửi frame mới khi frame trước đã xong trong khối `finally`.

**Q17. Giải thích cơ chế hoạt động của `window.__eyeai_latest_landmarks` và lý do không truyền qua React state?**  
**Trả lời**: Ở dòng `468`, `processFaceMeshResults` gán mảng 478 tọa độ vào `window.__eyeai_latest_landmarks`. Hai component đồ họa `LiveCameraOverlay.tsx:70` và `FaceMeshVisualizer.tsx:119` đọc trực tiếp từ biến này trong vòng lặp `requestAnimationFrame` 60 FPS của riêng chúng. Điều này tránh phải sao chép và truyền mảng 478 object qua React props/state 15–30 lần/giây.

**Q18. Cơ chế đồng bộ ảnh camera khi bật `lowLightFilterEnabled` từ `EyeTrackingProvider` sang `CameraPreview` hoạt động ra sao?**  
**Trả lời**: `EyeTrackingProvider` giữ `processedCanvasRef` (trỏ vào canvas nội bộ của `LowLightExposureProcessor`). Khi `lowLightFilterEnabled === true`, `CameraPreview.tsx:50-85` chạy một vòng `requestAnimationFrame` copy ảnh từ `processedCanvasRef.current` sang `previewCanvasRef` phủ đè lên thẻ `<video>` gốc (`opacity: 1`). Khi tắt, `previewCanvasRef` bị xóa và ẩn (`opacity: 0`), lộ ra `<video>` gốc.

**Q19. Tại sao `EyeTrackingProvider` đặt lại `isCalibrated: false` khi đọc dữ liệu hiệu chuẩn đã lưu từ `localStorage` lúc khởi động (`line 200`)?**  
**Trả lời**: Tư thế ngồi, độ cao ghế và góc đặt màn hình của người dùng thường thay đổi giữa các phiên sử dụng. Nếu tin hoàn toàn `neutralIrisH/V` cũ lưu từ hôm qua, con trỏ mắt rất dễ bị lệch cố định về một hướng. Đặt `isCalibrated: false` buộc hệ thống chạy lại pha **Auto-Zero Warm-up 35 frame** để lấy tâm nhìn mới theo phiên hiện tại, trong khi vẫn giữ (và kẹp an toàn) các ngưỡng biên `thresholdUp/Down/Left/Right` ở dòng 194–199.

**Q20. Giải thích cơ chế Fallback của Trợ lý AI trong `AiPage.tsx` và vì sao cần có nó?**  
**Trả lời**: `AiPage.tsx:213-236` thử `POST /api/ai/chat` trước (phục vụ Express `server.ts` hoặc Netlify Function `ai-chat.ts`). Nếu endpoint trả về lỗi mạng hoặc non-JSON (ví dụ khi deploy static thuần hoặc proxy chưa sẵn), nó gọi `fetchDirectGemini()` dùng `@google/genai` SDK thử lần lượt 5 model, rồi tiếp tục fallback sang REST `generativelanguage.googleapis.com/v1beta` với 3 model nữa. Điều này tăng khả năng sống sót của tính năng AI trên nhiều hạ tầng deploy.

**Q21. `tts.ts` và `speech.ts` phối hợp thế nào để giải quyết vấn đề Chrome Desktop không có giọng tiếng Việt?**  
**Trả lời**: Trong `src/utils/speech.ts`:
- Edge Windows (có HoaiMy/NamMinh), iOS Safari (AVFoundation) và Android đều có `hasNativeVietnameseSpeech() === true`, nên gọi trực tiếp `window.speechSynthesis` với độ trễ mạng 0ms.
- Chrome Desktop trên Windows thường không có giọng `vi-VN` bản địa, nên `speakVietnamese()` rẽ nhánh sang `playOnlineTTS()`: tách câu $\le 150$ ký tự, gọi `/api/tts?text=...` (proxy tới `translate.google.com/translate_tts` trong `server.ts:159` hoặc `netlify/functions/tts.ts`), giải mã thành `AudioBuffer` qua `Web Audio API` và cache tối đa 60 câu trong RAM (`audioBufferCache`) để các lệnh điều hướng lặp lại như `"Sang phải"`, `"Chọn"` phát tức thì 0ms.

---

## IV. Phản biện Kiến trúc (8 câu)

**Q22. Tại sao kiến trúc chọn chạy MediaPipe ở Client-side thay vì gửi frame về Backend Python xử lý?**  
**Trả lời**: Gửi 30 frame/giây (`640×480`) lên server sẽ tiêu tốn băng thông lớn, chịu trễ mạng RTT (thường 50–200ms chưa kể suy luận), tăng chi phí GPU server và làm lộ hình ảnh khuôn mặt người dùng lên mạng. Chạy MediaPipe WASM/WebGL trên trình duyệt giúp độ trễ truyền ảnh = 0, hoạt động được cả khi mạng yếu (sau khi nạp CDN) và bảo vệ quyền riêng tư tuyệt đối.

**Q23. Tại sao lại tồn tại cả `EyeNavigationProvider` lẫn `EyeTalkDashboard.tsx`?**  
**Trả lời**: Qua mã nguồn, `EyeTalkDashboard.tsx` (route `dev-dashboard`) là giao diện v2.1 đời đầu ghép cứng bàn phím 8 hàng, camera và MediaPipe vào một component đơn lẻ. Khi mở rộng thành ứng dụng đa trang (`HomePage`, `SpeakPage`, `AiPage`, `ContactsPage`, `EntertainmentPage`, `LocationPage`, `SosPage`), đội ngũ đã thiết kế lại kiến trúc phân lớp (`EyeTrackingProvider` + `EyeNavigationProvider` + `EyeFocusable` + `GlobalEyeHUD`). `EyeTalkDashboard.tsx` hiện vẫn được giữ lại ở route `dev-dashboard` (nhưng chưa có nút điều hướng từ `HomePage`).

**Q24. Cách `EyeNavigationProvider` quản lý điều hướng khi một trang có cả phần tử dạng lưới và phần tử tự do là gì?**  
**Trả lời**: Kết hợp 2 pha trong `navigate()` (`EyeNavigationProvider.tsx:308-426`). Nếu phần tử hiện tại có `row` và `col` tường minh (ví dụ các phím của `VirtualKeyboard` hoặc 6 thẻ trên `HomePage`), ưu tiên tìm trong cùng `groupId` theo lưới (`row, col`). Nếu không có lưới hoặc di chuyển ra ngoài biên lưới (ví dụ từ phím hàng trên cùng liếc lên nút `"Nói"` của `EyeTextComposer`), hệ thống chuyển sang Pha 2: **Spatial 2D Bounding Box Search** tính tọa độ tâm DOM thực tế qua `getBoundingClientRect()` để tìm phần tử lân cận theo hướng liếc.

**Q25. Focus Trap trong `Modal.tsx` có nhược điểm gì nếu mở nhiều modal lồng nhau hoặc đóng modal bất thường?**  
**Trả lời**: `EyeNavigationProvider` dùng mảng `scopeStackRef` làm ngăn xếp LIFO và `previousFocusByScopeRef` (`Map`) lưu nút focus trước khi vào mỗi scope. `Modal.tsx` dùng `useEffect` cleanup (`popFocusScope(modalScopeId)`) nên hỗ trợ tốt cả modal lồng nhau (ví dụ `ContactsPage` → `FriendSearchModal` → `VirtualKeyboard`). Tuy nhiên, chú ý `Modal.tsx:48` đưa `onClose` vào dependency array của `useEffect`: nếu component cha truyền inline arrow `onClose={() => ...}` không dùng `useCallback`, mỗi lần component cha re-render sẽ chạy lại cleanup `popFocusScope` rồi `pushFocusScope` gây nhảy focus về phần tử đầu của modal! (Điểm audit quan trọng).

**Q26. Sự khác biệt giữa kiến trúc `GlobalEyeHUD` chế độ `floating` và `keyboard-bar`?**  
**Trả lời**: Khi `currentRoute` là `'chat'` hoặc `'ai'` hoặc `isKeyboardOpen === true`, `GlobalEyeHUD` tự chuyển sang `keyboard-bar` — một thanh ngang mỏng đặt ngay dưới header (`KeyboardHudSlot`) để nhường toàn bộ phần dưới màn hình cho khung chat và `VirtualKeyboard`. Ở các trang khác (`home`, `location`, `contacts`...), nó hiển thị dạng `floating` pill ở góc dưới-trái (`bottom-left`) và có thể bung thành `CameraHub` đầy đủ.

**Q27. Tại sao `App.tsx` vừa có `navigateTo` thủ công bằng state `currentRoute`, không dùng `react-router-dom`?**  
**Trả lời**: `App.tsx` quản lý điều hướng bằng `useState<AppRoute>('home')` để kiểm soát chặt chẽ cổng xác thực (`shouldShowAuth`), cổng phân giải `account_type` (`isResolvingPostLoginProfile`) và bắt buộc điều hướng tức thì theo `eyeai:escape` / `eyeai:emergency` mà không lo xung đột URL history trên môi trường nhúng/mobile PWA.

**Q28. Cách xử lý ưu tiên lệnh giữa Eye Navigation và Page-level actions như SOS hay Back?**  
**Trả lời**: Phân tầng rõ:
- `EMERGENCY` (3 chớp) đi qua cả `gestureCallbacksRef` và `CustomEvent('eyeai:emergency')` để `AppContent` chuyển thẳng tới `SosPage` bất kể người dùng đang đứng ở trang nào (`App.tsx:180-190`).
- `ESCAPE` đi theo chuỗi 4 bậc trong `EyeNavigationProvider.triggerEscape()`: Escape handler của Modal → Pop Scope → Click nút Back DOM → `eyeai:escape` về `home`.

**Q29. `CameraPreview` được render ở nhiều nơi cùng lúc có mở nhiều camera phần cứng không?**  
**Trả lời**: Không. Chỉ có duy nhất `EyeTrackingProvider.startCamera()` gọi `getUserMedia` và giữ `mediaStreamRef.current` duy nhất. Các `CameraPreview` chỉ mượn `cameraStream` từ Context để gán vào `video.srcObject` phục vụ hiển thị.

---

## V. Phản biện Thuật toán và Toán học (10 câu)

**Q30. Tại sao công thức `EAR` chia cho chiều rộng khóe mắt (`dist2D(outer, inner)`) mà không dùng trực tiếp khoảng cách dọc pixel?**  
**Trả lời**: Khoảng cách dọc tính theo tọa độ chuẩn hóa phụ thuộc vào khoảng cách từ mặt người dùng tới webcam (ngồi gần thì mí mắt to hơn ngồi xa). Chia cho chiều rộng ngang giữa hai khóe mắt giúp `EAR` trở thành **tỷ lệ bất biến theo tỷ lệ phóng đại (scale-invariant)** khi người dùng tiến lại gần hoặc lùi ra xa camera.

**Q31. Tại sao EYEAI dùng 2 cặp điểm dọc cho mỗi mắt trong công thức EAR thay vì 1 cặp?**  
**Trả lời**: Theo `eyeTracker.ts:156-165`, mỗi mắt lấy trung bình 2 cặp dọc (`159-145` & `158-144` cho mắt trái; `386-374` & `385-373` cho mắt phải). Lấy trung bình 2 đường dọc ở hai bên tâm đồng tử giúp giảm nhiễu rung landmark ở từng điểm đơn lẻ của mạng FaceMesh.

**Q32. Tại sao thuật toán cũ đo vị trí đồng tử theo mí trên/mí dưới lại bị lỗi đảo ngược hướng khi nhìn xuống, và Canthal Baseline Projection giải quyết ra sao?**  
**Trả lời**: Trong thuật toán cũ (`src/utils/eyeTracker.ts:107`), $V = \frac{y_{\text{iris}} - y_{\text{top}}}{y_{\text{bottom}} - y_{\text{top}}}$. Khi nhìn xuống, mí mắt trên ($y_{\text{top}}$) tự nhiên sụp xuống theo nhãn cầu nhiều hơn mức dịch chuyển của đồng tử, làm hiệu số tử số bị méo/nhỏ đi hoặc đổi dấu khiến hệ thống tưởng người dùng đang nhìn lên (eyelid-droop inversion). Ngược lại, `src/modules/eye-control/eyeTracker.ts:188-233` dựng trục $\hat{u}, \hat{v}$ từ **hai khóe mắt trong và ngoài (`33-133`, `362-263`)** vốn neo vào xương hốc mắt và **không** di chuyển theo mí mắt, rồi chiếu trực giao tâm mống mắt lên trục $\hat{v}$ vuông góc hướng xuống. Do đó nhìn xuống luôn tạo $\Delta V > 0$ và còn bất biến khi đầu nghiêng nhẹ.

**Q33. Ý nghĩa của phép hợp nhất 2 mắt theo trọng số `wL = max(0.01, leftEAR - 0.08)` là gì?**  
**Trả lời**: Khi người dùng ngồi hơi nghiêng đầu hoặc một bên mắt bị bóng tối/nheo nhẹ, mắt bên đó có `EAR` nhỏ hơn và điểm mống mắt MediaPipe dễ bị nhiễu hơn. Trọng số `EAR - 0.08` ưu tiên mắt đang mở to rõ hơn, trong khi `max(0.01, ...)` đảm bảo mẫu số `wL + wR` luôn dương tránh chia cho 0 khi nhắm cả hai mắt.

**Q34. Tại sao `rawGazeX` lại có dấu trừ `-((...))` ở `eyeTracker.ts:258` còn `rawGazeY` thì không?**  
**Trả lời**: Video hiển thị cho người dùng được lật gương selfie (`mirrored={true}`, CSS `-scale-x-100`). Khi người dùng liếc sang **PHẢI** màn hình, trong ảnh camera gốc (chưa lật) đồng tử dịch sang bên trái ảnh, khiến phép chiếu dọc vector khóe mắt (hướng từ trái ảnh sang phải ảnh) mang dấu **âm**. Đảo dấu `-` để `rawGazeX > 0` ứng với `RIGHT` và `rawGazeX < 0` ứng với `LEFT`. Còn trục $Y$ không bị lật gương nên hướng xuống vẫn là $+Y$, hướng lên là $-Y$.

**Q35. Giải thích toán học tại sao Low-Light Filter dùng công thức $\gamma = \frac{\ln(125/255)}{\ln(L/255)}$ và kẹp $\gamma \ge 0.48$?**  
**Trả lời**: Ta muốn phép biến đổi hàm mũ $I' = 255 \cdot (I/255)^\gamma$ đưa độ sáng trung bình hiện tại $L$ lên độ sáng mục tiêu $L_{\text{target}} = 125$. Giải $(L/255)^\gamma = 125/255$ bằng logarit hai vế thu được $\gamma = \ln(125/255) / \ln(L/255)$. Khi $L < 125$, cả tử và mẫu đều âm nên $\gamma < 1$ (đường cong lõm kéo vùng tối lên sáng hơn). Kẹp `minGamma = 0.48` vì nếu $L$ quá nhỏ (phòng tối om), $\gamma \to 0$ sẽ khuếch đại nhiễu cảm biến webcam rất mạnh và làm bệt vùng sáng.

**Q36. Vì sao phải có `gammaDeadband = 0.02` và EMA `emaAlpha = 0.1` trong `lowLightFilter.ts`?**  
**Trả lời**: Độ sáng trung bình giữa các frame webcam dao động nhẹ do auto-exposure phần cứng và nhiễu sensor. Nếu cập nhật `gamma` liên tục theo từng frame, độ sáng khung hình sẽ nhấp nháy (flicker), làm landmark MediaPipe rung theo. EMA (`0.1`) làm mượt sự thay đổi ánh sáng theo thời gian, còn Deadband (`0.02`) chỉ dựng lại LUT khi độ lệch `gamma` đủ lớn.

**Q37. Tại sao kênh Blink FSM lại tách 1 chớp (`DOWN`), 2 chớp (`SELECT`) và 3 chớp (`EMERGENCY`) với cửa sổ `700ms`, và điểm khác biệt của nhánh 3 chớp là gì?**  
**Trả lời**: Dùng 1 kênh đếm chớp theo thời gian giải quyết việc người suy giảm khó liếc xuống (`DOWN`) mà vẫn giữ nút chọn (`SELECT`) và SOS (`EMERGENCY`). Với 1 hoặc 2 chớp, hệ thống phải đợi hết `BLINK_DECISION_WINDOW_MS = 700ms` kể từ lần mở mắt cuối để chắc chắn người dùng không chớp thêm nữa mới bắn lệnh. Riêng khi phát hiện cái chớp thứ 3 hợp lệ (`interval <= 950ms`), `EyeTrackingProvider.tsx:723-733` bắn `EMERGENCY` **ngay lập tức** không chờ hết 700ms để tối thiểu hóa độ trễ cấp cứu.

**Q38. Giải thích 4 cơ chế chống kích hoạt nhầm (False Positive Prevention) trong thuật toán mắt của EYEAI?**  
**Trả lời**:
1. **Blink Duration Gate**: Chỉ tính chớp mắt khi thời gian nhắm nằm trong `[25ms, 750ms]`; nhắm dài `> 800ms` reset bộ đếm.
2. **Hysteresis**: Ngưỡng mở lại mắt cao hơn ngưỡng đóng (`+0.015`); ngưỡng thoát hướng liếc thấp hơn ngưỡng vào (`0.55 × thresh`).
3. **Post-Blink Lockout & Blink Priority Lock**: Khi `isClosedNow`, hoặc `blinkCount > 0`, hoặc trong `300ms` sau khi mở mắt, bộ phân loại hướng liếc bị khóa cứng về `CENTER`.
4. **Dwell + Re-Arm + Cooldown**: Phải giữ liếc `220ms` mới bắn 1 lệnh, sau đó khóa `cooldown` (`2500ms` thành công / `1000ms` đụng biên) và bắt buộc nhìn về `CENTER >= 140ms` (`reArmed = true`) mới được liếc lệnh tiếp theo.

**Q39. Trong thuật toán điều hướng không gian 2D (`EyeNavigationProvider.tsx:366-426`), công thức tính điểm `score` ưu tiên điều gì?**  
**Trả lời**: Với hướng `RIGHT` ($\Delta x > 4$), điều kiện góc nón cho phép $|\Delta y| \le 2.2 \cdot \Delta x$. Nếu phần tử có chồng lấn theo chiều dọc (`overlapY > 0`, tức nằm cùng dải hàng ngang), `score = 0.6 * dx` (được nhân hệ số ưu đãi 0.6); nếu không chồng lấn dọc, `score = dx + 1.8 * |dy|` (phạt nặng độ lệch phương vuông góc). Do đó hệ thống ưu tiên nhảy sang phần tử cùng hàng gần nhất trước khi nhảy chéo hàng.

---

## VI. Phản biện AI (7 câu)

**Q40. EAR và Canthal Gaze trong EYEAI có phải là thuật toán Machine Learning không?**  
**Trả lời**: Không. EAR là công thức tỷ lệ khoảng cách Euclid 2D và Canthal Gaze là phép chiếu vector trực giao. Phần AI thị giác duy nhất trong pipeline camera là mô hình Deep Learning **MediaPipe FaceMesh** của Google dùng để dự đoán 478 điểm mốc từ ảnh pixel.

**Q41. Tại sao EYEAI không tự huấn luyện (train) một mạng CNN đầu-cuối (End-to-End Gaze Estimation CNN) dự đoán thẳng hướng nhìn từ ảnh mắt?**  
**Trả lời**: Tự train CNN dự đoán hướng nhìn đòi hỏi tập dữ liệu hàng chục nghìn người dùng đa dạng điều kiện ánh sáng, góc camera, kính cận và khuôn mặt Việt Nam, đồng thời nặng hơn khi suy luận web nếu chạy song song với FaceMesh. Tận dụng 478 landmarks đã chuẩn hóa của MediaPipe FaceMesh rồi áp dụng hình học + hiệu chuẩn 5 điểm cá nhân hóa cho phép thích nghi ngay với từng người dùng mới chỉ trong ~15 giây mà không cần dữ liệu huấn luyện.

**Q42. Nếu MediaPipe FaceMesh dự đoán sai vị trí tâm mống mắt (468/473) khi nhắm mắt hoặc trong bóng tối thì sao?**  
**Trả lời**: Khi mắt sắp nhắm hoặc nhắm, `avgEAR` giảm dưới `blinkThresh + 0.015`, cổng `isGazeAllowed` lập tức khóa việc tính hướng liếc (`EyeTrackingProvider.tsx:878`) nên sai số tâm mống mắt lúc chớp không bao giờ gây nhảy con trỏ. Trong bóng tối, người dùng có thể bật `LowLightExposureProcessor` (`CameraHub`) để tăng độ tương phản trước khi đưa vào MediaPipe; nếu thiếu hoàn toàn điểm 468/473 (`0,0`), `analyzeEyes()` có fallback hình học về trung điểm 4 điểm viền mắt (`lines 173-186`).

**Q43. Tại sao `headYaw` và `headPitch` được tính trong `eyeTracker.ts` nhưng lại không dùng để bù trừ tọa độ gaze (`lines 289-290`)?**  
**Trả lời**: Theo ghi chú trực tiếp tại `eyeTracker.ts:287-290` (`"Pure Iris Position Tracking (chỉ áp dụng mống mắt cho thao tác mắt)"`), việc loại bỏ bù trừ đầu giúp thao tác mắt thuần túy dựa trên độ lệch mống mắt so với hai khóe mắt, tránh việc cử động đầu tự nhiên nhẹ làm trôi hoặc đảo hướng con trỏ mắt. Tuy nhiên, đây cũng là giới hạn kỹ thuật cần ghi nhận nếu người dùng xoay đầu quá lệch khỏi camera.

**Q44. Trợ lý AI (`AiPage.tsx`) dùng mô hình nào và làm sao đảm bảo an toàn y tế?**  
**Trả lời**: Backend (`server.ts`, `ai-chat.ts`) và client fallback (`AiPage.tsx`) sử dụng `@google/genai` với danh sách model ưu tiên (`gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3.8-flash`...). An toàn nội dung được kiểm soát qua `SYSTEM_INSTRUCTION`: yêu cầu trả lời ngắn 2–5 câu tiếng Việt dễ đọc, tuyệt đối không tự nhận là bác sĩ, không chẩn đoán bệnh và gợi ý dùng nút SOS nếu người dùng cần cấp cứu.

**Q45. Hệ thống đánh giá độ tin cậy (`confidence`) của khung hình như thế nào?**  
**Trả lời**: `eyeTracker.ts:293-295` kiểm tra kích thước khuôn mặt (`faceWidth > 0.08 && faceHeight > 0.10`). Nếu đạt, `confidence = min(0.99, max(0.3, 0.5 + min(1.0, avgEAR / 0.22) * 0.45))`; nếu khuôn mặt quá nhỏ/quá xa camera, `confidence = 0.2`. Khi `confidence < 0.35`, `EyeTrackingProvider.tsx:933-935` gán `gazeDirection = 'UNKNOWN'` để tránh nhận diện sai.

**Q46. Có dữ liệu thực nghiệm về độ chính xác (%) của mô hình trên người suy giảm thật trong repository không?**  
**Trả lời**: Không. Hiện trong repository chỉ có các bài test tự động với landmark tổng hợp (`scripts/test-eye-control.ts`, `lowLightFilter.test.tsx`) và kiểm thử tích hợp DOM bằng Vitest/jsdom. Không có số liệu benchmark trên tập dữ liệu bệnh nhân thực tế, nên tài liệu kiểm toán không tự tạo các con số % accuracy.

---

## VII. Phản biện Hiệu năng (8 câu)

**Q47. Điều gì xảy ra nếu máy người dùng yếu và mỗi lần `faceMesh.send()` mất 80ms (~12 FPS)? Các bộ đếm thời gian (220ms dwell, 700ms blink, 2500ms cooldown) có bị sai lệch không?**  
**Trả lời**: Không bị chạy chậm theo FPS! Toàn bộ bộ đếm trong `EyeTrackingProvider.tsx` sử dụng đồng hồ thực `performance.now()` (tính `elapsed = now - lastFrameTime.current` kẹp tối đa `100ms` ở dòng 462), không đếm theo số frame. Tuy nhiên, nếu FPS xuống quá thấp (~10 FPS, tức 100ms/frame), độ phân giải đo một cái chớp mắt nhanh (~100–150ms) sẽ giảm, dễ bỏ sót chớp ngắn.

**Q48. Điểm nghẽn hiệu năng (bottleneck) lớn nhất hiện tìm thấy trong mã nguồn UI của phân hệ mắt là gì?**  
**Trả lời**: Hai điểm đã xác minh trong code:
1. Trong `CameraHub.tsx:70-78`, hiệu ứng `useEffect` chạy `requestAnimationFrame(() => setNowTime(performance.now()))` liên tục để cập nhật glow badge, gây re-render toàn bộ component `CameraHub` (734 dòng) ở 60 FPS khi đang mở bảng Hub.
2. Khi bật `lowLightFilterEnabled`, `LowLightExposureProcessor.processFrame()` gọi `ctx.getImageData` và `ctx.putImageData` trên canvas `640×480` mỗi frame (`~1.23 MB` mỗi chiều đọc/ghi), cộng thêm `CameraPreview` dùng một vòng rAF khác copy canvas này sang màn hình xem trước.

**Q49. Tại sao `lowLightFilter` lại dùng `sampleStep = 8` và `Uint8Array(256)` LUT thay vì xử lý trực tiếp `Math.pow` trên mọi pixel?**  
**Trả lời**: Với khung hình `640×480 = 307.200` pixel:
- Nhảy bước `sampleStep = 8` giảm số pixel cần tính luminance xuống còn $307.200 / 8 = 38.400$ điểm (giảm 87.5% phép toán).
- Dùng LUT chỉ gọi `Math.pow()` đúng **256 lần** khi gamma thay đổi quá deadband `0.02`, sau đó việc áp dụng lên `307.200 × 3` kênh RGB chỉ là tra mảng O(1) cực nhanh.

**Q50. Việc `LiveCameraOverlay` vẽ nhiều đường cong + `shadowBlur` mỗi frame có ảnh hưởng hiệu năng không?**  
**Trả lời**: Trong `LiveCameraOverlay.tsx:166-170`, `ctx.shadowBlur = 4` chỉ bật cho 2 contour mắt và tắt ngay (`shadowBlur = 0`), và toàn bộ `FACIAL_TESSELLATION_LINES` được gom chung vào một lệnh `ctx.beginPath() ... ctx.stroke()` (batch drawing) để giảm số lần draw call trên Canvas 2D. Ngoài ra người dùng có thể tắt bớt lớp `Mesh / Mắt / Mống mắt` ngay trên thanh công cụ dưới đáy `CameraHub`.

**Q51. Bộ nhớ cache âm thanh TTS và video nền có nguy cơ rò rỉ RAM (Memory Leak) không?**  
**Trả lời**: Đều có giới hạn hoặc dọn dẹp: `audioBufferCache` trong `speech.ts:593` giới hạn tối đa `60` mục (`if (audioBufferCache.size < 60)`). `videoCacheManager.ts:128-139` cung cấp `clearCache()` thu hồi `URL.revokeObjectURL`. `EyeTrackingProvider.tsx:1688-1693` gọi `stopTrackingLoop()` và `lowLightProcessorRef.current?.dispose()` (đặt `canvas.width = 0; canvas.height = 0`) khi unmount.

**Q52. Chuyện gì xảy ra nếu người dùng bấm `HomePage` hoặc mở `AiPage` trước khi `FaceMesh` từ CDN tải xong?**  
**Trả lời**: Trong `EyeTrackingProvider.tsx:75, 427-457, 1679`, `libsLoading` khởi tạo là `true`. `useEffect` kích hoạt camera kiểm tra điều kiện `settings.eyeControlEnabled && !libsLoading && !libError`. Nhờ vậy hệ thống không bị crash khi `window.FaceMesh` chưa tồn tại và tự động mở camera ngay khi script CDN nạp xong.

**Q53. Việc `PreloadManager` dynamic import các trang trong lúc hiện `SplashScreen` có lợi ích gì cho người dùng suy giảm?**  
**Trả lời**: `preloadManager.ts:90-196` nạp trước mã JS của `HomePage`, `SpeakPage`, `AiPage`, `SosPage`, `EntertainmentPage`, `LocationPage`, `ContactsPage`, `HumanChatPage`, `VirtualKeyboard` và `vietnameseTelex` ngay tại màn hình Splash. Khi người dùng điều hướng bằng mắt sau đó, trang mở lên tức thì, tránh hiện tượng treo giao diện làm hỏng nhịp đếm chớp mắt.

**Q54. Tại sao độ phân giải camera xin từ `getUserMedia` lại là `640×480` chứ không phải Full HD `1920×1080`?**  
**Trả lời**: Tại `EyeTrackingProvider.tsx:1615-1619`, độ phân giải `640×480` đủ chi tiết để MediaPipe định vị 478 điểm mặt/mống mắt ở khoảng cách ngồi `40–70cm`, nhưng nhẹ hơn gấp **6.75 lần** so với `1920×1080` (0.3 MP vs 2.07 MP), giúp giảm mạnh thời gian truyền dữ liệu lên texture WebGL của MediaPipe và giảm 6.75 lần chi phí `getImageData` của `lowLightFilter`.

---

## VIII. Phản biện Tính sáng tạo (5 câu)

**Q55. Đóng góp kỹ thuật riêng có giá trị nhất của đội phát triển EYEAI nằm ở đâu?**  
**Trả lời**: Không nằm ở việc gọi lại API của MediaPipe, mà ở **lớp chuyển đổi và ổn định điều khiển** được thiết kế riêng cho người khuyết tật trên webcam phổ thông:
1. Thuật toán **Canthal Baseline Projection + EAR-weighted dual-eye fusion** loại bỏ lỗi đảo hướng nhìn xuống do sụp mí (`eyeTracker.ts`).
2. Kiến trúc **Dual-Channel Temporal FSM** kết hợp liếc (3 hướng) + đếm chớp 1/2/3 (`DOWN` / `SELECT` / `EMERGENCY`) kèm khóa chéo nhau (`blinkCount > 0` khóa gaze) và Re-Arm 140ms (`EyeTrackingProvider.tsx`).
3. Hệ sinh thái **Focus Tree (`EyeNavigationProvider` + `EyeFocusable` + `Scope Stack` + `eyeFocusAutoScroll`)** cho phép điều khiển mọi UI phức tạp (modal, bàn phím ảo, player YouTube, bản đồ) chỉ bằng ánh mắt.

**Q56. Tại sao việc gán "1 chớp = Xuống (`DOWN`)" và tắt "Liếc xuống" lại là một giải pháp kỹ thuật thực tế?**  
**Trả lời**: Về giải phẫu, khi người dùng liếc xuống nhìn nửa dưới màn hình, mí mắt trên sụp xuống che gần hết mống mắt khiến điểm `468`/`473` của MediaPipe bị nhiễu nặng hoặc trùng với trạng thái nhắm mắt (kích hoạt nhầm Blink). Chuyển thao tác `DOWN` sang **1 cái chớp mắt có chủ đích** (chờ 700ms) và dùng `2 chớp` để `SELECT`, `3 chớp` để `EMERGENCY` giúp tỷ lệ thành công khi đi xuống ổn định hơn nhiều trên webcam thông thường.

**Q57. Điểm sáng tạo trong tích hợp `LowLightExposureProcessor` là gì?**  
**Trả lời**: Thay vì làm sáng toàn cục bằng CSS filter (chỉ đổi hiển thị trên màn hình, **không** cải thiện pixel đầu vào cho AI), `lowLightFilter.ts` biến đổi trực tiếp pixel đầu vào trước khi đưa vào MediaPipe thông qua `HTMLCanvasElement`, dùng Adaptive Gamma LUT + EMA + Deadband để chống nhấp nháy và giữ độ mượt thời gian thực.

**Q58. Ý nghĩa của tính năng Simulator Mode kết hợp với các nút test thủ công trên `CameraHub` là gì?**  
**Trả lời**: Giúp đội ngũ kỹ thuật, người chăm sóc và ban giám khảo kiểm chứng toàn bộ chuỗi `Navigation → AutoScroll → Focus Trap → TTS → Domain Action` ngay cả trong điều kiện không có camera hoặc phòng trình chiếu ngược sáng mạnh, đồng thời hỗ trợ người chăm sóc bấm hỗ trợ trực tiếp trên `CameraHub`.

**Q59. Kiến trúc Hybrid TTS trong `speech.ts` giải quyết bài toán thực tế gì ở Việt Nam?**  
**Trả lời**: Trình duyệt Chrome Desktop trên Windows mặc định thiếu giọng tiếng Việt (`vi-VN`), khiến các ứng dụng dùng `window.speechSynthesis` thuần túy bị câm hoặc đọc tiếng Việt bằng giọng tiếng Anh. `speech.ts` tự động phát hiện qua `isVietnameseVoice()`, dùng native TTS trên Edge/iOS/Android và tự chuyển sang `/api/tts` + `AudioBuffer` RAM cache trên Chrome Desktop.

---

## IX. Phản biện Tính ứng dụng thực tế & Kiểm toán giới hạn (6 câu)

**Q60. Với người bị liệt nặng hoặc mỏi mắt, cooldown 2.5 giây và cửa sổ chớp 700ms có bất tiện không?**  
**Trả lời**: Cooldown 2.5s giúp ngăn lệnh kích hoạt liên tiếp gây rối màn hình, nhưng có thể làm tốc độ gõ từng chữ cái trên bàn phím ảo chậm (~2.5s–3.5s mỗi thao tác). Bù lại, `PHRASES_LAYOUT` cung cấp 8 mẫu câu y tế/nhu cầu thiết yếu chỉ cần 1 lần chọn, và `SpeakPage` có 4 câu nói nhanh ngay đầu trang. Ngoài ra, người dùng có thể dùng 1 chớp (`cooldown 1.2s`) để xuống nhanh các hàng.

**Q61. Điểm bất cập nào giữa giao diện hướng dẫn hiện tại và thuật toán thực thi mà đội ngũ cần lưu ý khi báo cáo?**  
**Trả lời**: Qua kiểm toán mã nguồn:
1. `OnboardingModal.tsx:347-372` vẫn ghi *"Nháy mắt 2 lần (< 1.5 Giây)"* và *"Liếc mắt 4 hướng"*, trong khi code `EyeTrackingProvider.tsx` thực tế chạy cửa sổ `700ms` (1 chớp = `DOWN`, 2 chớp = `SELECT`, 3 chớp = `EMERGENCY`) và tắt hướng liếc xuống.
2. `OnboardingModal.tsx:415-417` nói có thể chỉnh *"thời gian giữ ánh mắt (1.5s)"* trong Cài đặt, nhưng `settings.dwellTimeMs` hiện chưa được nối vào `targetDwellMs = 220` trong `EyeTrackingProvider.tsx:951` và không có thanh trượt chỉnh ở `SettingsPage.tsx`.
Việc báo cáo thẳng thắn điểm lệch này thể hiện tính trung thực và năng lực kiểm toán kỹ thuật cao.

**Q62. Tính năng SOS Khẩn cấp (`SosPage.tsx`) và Chia sẻ vị trí (`LocationPage.tsx`) hiện đã kết nối viễn thông/server thực tế chưa?**  
**Trả lời**: Cần nói rõ theo đúng mã nguồn:
- `SosPage.tsx` (`startEmergencyCall`, dòng 39–45) hiện thực hiện **mô phỏng trực quan trên UI** (mở modal đếm thời gian, hiển thị thông báo đã gửi GPS, phát giọng nói cảnh báo TTS) chứ chưa tích hợp cổng gọi điện thoại PSTN/SMS hay API gửi tọa độ về backend.
- `LocationPage.tsx` (`handleShareLocation`, dòng 48–52) cũng đang mô phỏng xác nhận trên UI + TTS, chưa ghi tọa độ vào bảng Supabase.
- Ngược lại, chức năng **Gọi thoại WebRTC 1-1** trong `ContactsPage` / `HumanChatPage` (`CallProvider.tsx`) và **Nhắn tin realtime** (`chatService.ts`) đã kết nối đầy đủ với Supabase và `RTCPeerConnection`.

**Q63. Nếu người dùng bị tật khúc xạ (đeo kính cận/viễn có ánh phản chiếu màn hình) hoặc sụp mí mắt bẩm sinh thì hệ thống phản ứng thế nào?**  
**Trả lời**: Kính có thể làm giảm nhẹ độ nét mống mắt nếu bị lóa phản chiếu, còn người có khe mắt hẹp bẩm sinh có EAR mở thấp hơn trung bình (ví dụ `0.20` thay vì `0.30`). Hệ thống giải quyết một phần nhờ: (1) ngưỡng chớp động `openBaselineEAR * 0.78` và tự học `neutralRunningEAR` trong 35 frame đầu; (2) nút hiệu chuẩn 5 hướng tính `blinkThreshold = neutralEAR * 0.62` (nhưng chú ý `EyeTrackingProvider.tsx:550` đang kẹp tối thiểu `0.16`, nên nếu người dùng có EAR mở < 0.16 thì khó phân biệt đóng/mở).

**Q64. Khi sử dụng trên điện thoại di động (iOS Safari / Android Chrome), những rào cản trình duyệt nào đã được code xử lý?**  
**Trả lời**:
1. Thuộc tính `muted`, `defaultMuted`, `playsInline`, `webkit-playsinline` trên mọi thẻ `<video>` camera và nền (`EyeTrackingProvider.tsx:1639-1645`, `CameraPreview.tsx:29-31`).
2. `AudioUnlockBanner.tsx` và `unlockAudio()` giải quyết chính sách chặn Autoplay Audio của iOS Safari bằng 1-sample silent Web Audio buffer và micro-utterance.
3. Giữ tham chiếu `activeUtterances` cấp module (`speech.ts:31`) để tránh lỗi WebKit Garbage Collector thu hồi `SpeechSynthesisUtterance` giữa chừng trên iPhone.

**Q65. Làm sao chứng minh dữ liệu hình ảnh camera của người dùng an toàn và riêng tư?**  
**Trả lời**: Trong `EyeTrackingProvider.tsx`, `MediaStream` chỉ đi vào phần tử `<video>` cục bộ, vào `LowLightExposureProcessor` cục bộ (nếu bật), và vào thư viện MediaPipe FaceMesh chạy cục bộ trong trình duyệt. Không có bất kỳ lời gọi `fetch`, WebSocket, WebRTC video hay Supabase Storage upload nào truyền frame hình ảnh khuôn mặt ra khỏi thiết bị (kể cả `CallProvider` cũng chỉ lấy `audio: true, video: false`).
