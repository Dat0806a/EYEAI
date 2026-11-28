# 02. PHÂN TÍCH CHI TIẾT TỪNG FILE (FILE ANALYSIS)

## 1. Cây thư mục phân hệ Người suy giảm và Module liên quan (có chú thích)

```text
eyetalk-assistant/
├── index.html                                  # Nạp CDN MediaPipe camera_utils & face_mesh
├── netlify.toml                                # Cấu hình build & redirect /api/ai/chat, /api/gemini/chat, /api/tts
├── server.ts                                   # Express server dev/prod: /api/ai/chat, /api/gemini/chat, /api/tts, /api/entertainment/search
├── netlify/functions/
│   ├── ai-chat.ts                              # Netlify Serverless proxy gọi Google Gemini cho AiPage
│   └── tts.ts                                  # Netlify Serverless proxy Google Translate TTS (audio/mpeg) cho Chrome Desktop
├── server/
│   └── youtubeBackend.ts                       # Backend tìm kiếm YouTube Data API v3 kèm cache 10 phút & deduplicate
├── scripts/
│   ├── test-eye-control.ts                     # Test suite độc lập kiểm chứng Canthal Projection, Classifier, Arbiter
│   └── test-focus-trap.ts                      # Test suite độc lập kiểm chứng Focus Scope Stack (Modal Focus Trap)
└── src/
    ├── main.tsx                                # Entry point React DOM (#root)
    ├── App.tsx                                 # Root Provider Stack, Dual-Experience Router & Global eyeai:escape / emergency listeners
    ├── index.css                               # Design tokens CSS, eye-focus-active, pulse-sos, reduced-motion
    ├── types.ts                                # Type legacy cho EyeTalkDashboard (GridItem, EyeAction, ChatMessage)
    ├── hooks/
    │   └── useAuth.ts                          # Quản lý phiên Supabase Auth & profile.account_type ('impaired' | 'patient')
    ├── lib/
    │   └── supabase.ts                         # Khởi tạo Supabase client singleton
    ├── context/
    │   └── TutorialContext.tsx                 # Context mở/đóng OnboardingModal hướng dẫn thao tác mắt
    ├── types/
    │   ├── account.ts                          # Định nghĩa AccountType ('impaired' | 'patient') & nhãn tiếng Việt
    │   ├── chat.ts                             # Định nghĩa DirectMessage, CallSession, SignalingPayload
    │   └── friends.ts                          # Định nghĩa FriendContact, IncomingRequest, FriendSearchResult
    ├── utils/
    │   ├── speech.ts                           # Engine TTS tiếng Việt đa nền tảng (Native SpeechSynthesis + Web Audio /api/tts)
    │   ├── eyeTracker.ts                       # [LEGACY - UNUSED] Phiên bản EAR/Iris ratio theo mí mắt cũ
    │   └── keyboardLayout.ts                   # [LEGACY - UNUSED] Layout bàn phím 8 hàng & Telex cũ
    ├── services/
    │   ├── preloadManager.ts                   # Quản lý 10 tác vụ preload song song khi hiện SplashScreen
    │   ├── videoCacheManager.ts                # Preload & cache Blob URL cho /login_register.mp4 và /bg.mp4
    │   ├── entertainmentService.ts             # Client gọi /api/entertainment/search kèm fallback YouTube Direct
    │   ├── chat/chatService.ts                 # RPC & query Supabase cho hội thoại 1-1 & realtime postgres_changes
    │   └── friends/friendService.ts            # RPC & query Supabase quản lý kết bạn & tìm kiếm người dùng
    ├── modules/
    │   ├── eye-control/                        # [CORE] Toàn bộ động cơ thị giác, cử chỉ & điều hướng mắt
    │   │   ├── types.ts                        # Kiểu dữ liệu cốt lõi: EyeAction, GazeDirection, EyeCalibrationData, EyeTrackingState, EyeFocusNode
    │   │   ├── eyeTracker.ts                   # Chỉ số 478 landmarks & analyzeEyes() (EAR + Canthal Baseline Projection)
    │   │   ├── lowLightFilter.ts               # Bộ tiền xử lý thiếu sáng Adaptive Gamma 256-entry LUT + EMA + Deadband
    │   │   ├── EyeTrackingProvider.tsx         # Provider Camera, MediaPipe loop, Blink/Gaze FSM, 5-point Calibration, Simulator
    │   │   ├── useEyeTracking.ts               # Các custom hook tách context: Settings, Telemetry, Combined, Audio
    │   │   ├── EyeNavigationProvider.tsx       # Bộ điều hướng 2D (Grid + Spatial) & Focus Trap Scope Stack
    │   │   ├── useEyeNavigation.ts             # Custom hook truy cập EyeNavigationContext
    │   │   ├── EyeFocusScopeContext.ts         # Context truyền scopeId từ Modal xuống các EyeFocusable con
    │   │   ├── EyeFocusable.tsx                # Component bọc phần tử tương tác bằng mắt (đăng ký node, ring, đọc TTS)
    │   │   ├── EyeFocusRing.tsx                # [UNUSED] Component vòng sáng focus tách rời (đã nội tuyến trong EyeFocusable)
    │   │   ├── eyeFocusAutoScroll.ts           # Tính vùng che phủ Header/HUD/Keyboard và cuộn an toàn
    │   │   ├── CameraPreview.tsx               # Render video camera kèm canvas xử lý thiếu sáng & LiveCameraOverlay
    │   │   ├── LiveCameraOverlay.tsx           # Vẽ 2D wireframe FaceMesh, viền mắt & đồng tử ở 60 FPS
    │   │   ├── CameraHub.tsx                   # Bảng điều khiển Camera Hub (Preview, 6 badge lệnh, EAR meter, Low-light, Calibration, Debug)
    │   │   ├── FaceMeshVisualizer.tsx          # Modal trực quan hóa FaceMesh 3D xoay bằng chuột/chạm
    │   │   └── __tests__/lowLightFilter.test.tsx # Bộ test Vitest cho lowLightFilter, EyeTrackingProvider & analyzeEyes
    │   ├── virtual-keyboard/                   # Bàn phím ảo điều khiển bằng mắt
    │   │   ├── types.ts                        # Kiểu GridItem & VirtualKeyboardProps
    │   │   ├── keyboardLayout.ts               # Bố cục QWERTY_LAYOUT, NUMBERS_LAYOUT, PHRASES_LAYOUT
    │   │   ├── vietnameseTelex.ts              # Hàm applyVietnameseAccents ghép dấu Telex 2 ký tự cuối
    │   │   ├── VirtualKeyboard.tsx             # Bàn phím ảo gắn đáy màn hình, EyeFocusable từng phím, đo chiều cao CSS var
    │   │   └── EyeTextComposer.tsx             # Ô hiển thị bản thảo, nút đọc/xóa/bật phím/gửi bọc EyeFocusable
    │   ├── calls/                              # Gọi thoại WebRTC giữ nguyên camera Eye Tracking
    │   │   ├── CallProvider.tsx                # Quản lý vòng đời cuộc gọi thoại, overlay nhận/từ chối/tắt mic/kết thúc
    │   │   ├── signalingService.ts             # Supabase Realtime broadcast signaling (user_signaling_* & call_room_*)
    │   │   └── webrtcService.ts                # Bao bọc RTCPeerConnection, STUN/TURN, buffer ICE candidate, RTP stats
    │   ├── entertainment/                      # Trình phát giải trí điều khiển bằng mắt
    │   │   ├── types.ts                        # EntertainmentMode, YouTubeNormalizedResult, EntertainmentSearchResponse
    │   │   ├── entertainmentConfig.ts          # Cấu hình 3 chế độ (books, radio, music) & gợi ý mặc định
    │   │   └── YouTubePlayerView.tsx           # Nhúng YouTube IFrame API + 8 nút tua/play/âm lượng EyeFocusable
    │   └── location/                           # Bản đồ & GPS điều khiển bằng mắt
    │       ├── mapLoader.ts                    # Nạp động Google Maps JS API
    │       ├── CustomOverlayMarker.ts          # Marker tùy biến trên Google Maps
    │       ├── GoogleMapView.tsx               # Bản đồ kèm fallback iframe & nút EyeFocusable (Căn tâm, +, -)
    │       └── useGeolocation.ts               # Hook theo dõi tọa độ GPS trình duyệt
    ├── components/
    │   ├── EyeTalkDashboard.tsx                # Giao diện v2.1 cũ (route 'dev-dashboard'), tự quản lý camera & bàn phím
    │   ├── chat/MessageBubble.tsx              # Bong bóng chat kèm nút đọc TTS
    │   ├── contacts/
    │   │   ├── FriendRequestsModal.tsx         # Modal chấp nhận/từ chối kết bạn bọc AppButton (EyeFocusable)
    │   │   └── FriendSearchModal.tsx           # Modal tìm & kết bạn có EyeTextComposer + VirtualKeyboard
    │   ├── home/
    │   │   ├── SpeakHeroCard.tsx               # Thẻ chính "Nói chuyện" (row=0, col=0) trên HomePage
    │   │   └── SosHeroCard.tsx                 # Thẻ khẩn cấp "SOS" (row=3, col=0) trên HomePage
    │   └── ui/
    │       ├── GlobalEyeHUD.tsx                # HUD mắt toàn cục 2 biến thể: Floating Pill (góc dưới trái) & Keyboard Bar
    │       ├── KeyboardHudSlot.tsx             # Slot đặt dưới header để gắn GlobalEyeHUD dạng keyboard-bar
    │       ├── PageHeader.tsx                  # Header chuẩn có nút Back, Eye Mode ON/OFF, Help (?), Settings
    │       ├── AppButton.tsx                   # Nút bấm chuẩn tiếp cận tối thiểu 48-64px bọc EyeFocusable
    │       ├── FeatureCard.tsx                 # Thẻ tính năng trên HomePage bọc EyeFocusable
    │       ├── Modal.tsx                       # Hộp thoại chuẩn tự động push/pop Focus Scope Trap & Escape handler
    │       ├── Avatar3D.tsx                    # Mascot EYEAI 3D có trạng thái IDLE/THINKING/SPEAKING
    │       ├── AudioUnlockBanner.tsx           # Banner chạm mở khóa âm thanh cho iOS/Chrome
    │       ├── OnboardingModal.tsx             # Modal hướng dẫn 3 slide thích ứng theo loại tài khoản
    │       ├── SplashScreen.tsx                # Màn hình khởi động theo dõi preloadManager
    │       ├── BackgroundVideo.tsx             # Video nền crossfade 2 buffer (/bg.mp4)
    │       ├── StatusBadge.tsx                 # Huy hiệu trạng thái camera active/idle
    │       └── ErrorBoundary.tsx               # Bắt lỗi render React toàn cục
    └── pages/                                  # Các màn hình nghiệp vụ phân hệ Người suy giảm
        ├── AuthPage.tsx                        # Màn hình đăng nhập/đăng ký
        ├── HomePage.tsx                        # Bảng điều khiển trung tâm (6 thẻ chính + Avatar3D)
        ├── SpeakPage.tsx                       # Nói chuyện trực tiếp qua loa thiết bị + mẫu câu nhanh
        ├── AiPage.tsx                          # Trò chuyện Trợ lý AI (Gemini + Avatar3D + TTS)
        ├── SosPage.tsx                         # Trung tâm khẩn cấp (lắng nghe 3-blink, eyeai:emergency, nhắm 8s)
        ├── EntertainmentPage.tsx               # Tìm kiếm & xem YouTube (Đọc sách, Radio, Nghe nhạc)
        ├── LocationPage.tsx                    # Định vị GPS & chia sẻ vị trí an toàn
        ├── ContactsPage.tsx                    # Danh bạ người thân, kết bạn & mở modal gọi/nhắn tin
        ├── HumanChatPage.tsx                   # Nhắn tin realtime & nút gọi thoại/video
        └── SettingsPage.tsx                    # Cài đặt tài khoản, Eye Mode, Camera, Simulator, Loa & Giọng đọc
```

---

## 2. Phân tích chi tiết từng File theo 11 tiêu chí

> Để đảm bảo độ bao phủ 100% và dễ tra cứu, mọi file liên quan trực tiếp được phân tích đầy đủ 11 tiêu chí: (1) Tên & Đường dẫn, (2) Vai trò & Trách nhiệm, (3) Lý do tồn tại, (4) Imports, (5) Types/Constants/Biến quan trọng, (6) Toàn bộ hàm/hook/component, (7) Đầu vào & Đầu ra, (8) Được sử dụng bởi, (9) Phụ thuộc vào, (10) Vị trí trong workflow, (11) Tác động nếu mất/hỏng.

### Nhóm A: Core Eye-Control (`src/modules/eye-control/`)

#### File A1: `src/modules/eye-control/types.ts`
1. **Đường dẫn**: `src/modules/eye-control/types.ts` (99 dòng)
2. **Vai trò**: Định nghĩa toàn bộ hợp đồng kiểu dữ liệu (TypeScript contracts) cho nhận diện mắt, hiệu chuẩn, telemetry, cấu hình và node điều hướng.
3. **Lý do tồn tại**: Tách rời định nghĩa type khỏi implementation để tránh circular dependency giữa Provider, Engine, Navigation và UI HUD.
4. **Imports**: Không import module ngoài.
5. **Types/Interfaces**: `EyeAction` (11 action: `NEXT|BACK|UP|DOWN|RIGHT|LEFT|SELECT|ESCAPE|DOUBLE_BLINK|EMERGENCY|NONE`), `GazeDirection` (`CENTER|LEFT|RIGHT|UP|DOWN|UNKNOWN`), `CalibrationStep`, `EyeCalibrationData`, `OverlayDisplaySettings`, `EyeTrackingState` (28 trường telemetry), `EyeControlSettings` (8 cấu hình), `EyeFocusNode`.
6. **Hàm/Class**: Không có (chỉ chứa types).
7. **Input/Output**: Type-checking compile-time cho toàn module.
8. **Được dùng bởi**: `eyeTracker.ts`, `EyeTrackingProvider.tsx`, `EyeNavigationProvider.tsx`, `eyeFocusAutoScroll.ts`, `CameraHub.tsx`, `scripts/test-focus-trap.ts`.
9. **Phụ thuộc**: Không.
10. **Vị trí workflow**: Tầng nền tảng dữ liệu dùng chung xuyên suốt mọi giai đoạn từ Capture → Gesture → Navigation.
11. **Nếu mất/hỏng**: Toàn bộ phân hệ eye-control không thể biên dịch TypeScript.

#### File A2: `src/modules/eye-control/eyeTracker.ts`
1. **Đường dẫn**: `src/modules/eye-control/eyeTracker.ts` (327 dòng)
2. **Vai trò**: Chuyển mảng 478 tọa độ landmark MediaPipe thành các chỉ số hình học mắt (`EAR`, `Canthal Gaze`, `Head Pose`, `Confidence`) và cung cấp các hằng số tập chỉ số contour để vẽ overlay.
3. **Lý do tồn tại**: Tách riêng toán học thị giác thuần túy (pure functions) khỏi React state để dễ kiểm thử đơn vị (`lowLightFilter.test.tsx`, `test-eye-control.ts`) và thay thế hoàn toàn thuật toán cũ ở `src/utils/eyeTracker.ts`.
4. **Imports**: Không import thư viện ngoài.
5. **Types/Constants**: `Point`, `EYE_INDICES`, `LEFT_EYE_CONTOUR`, `RIGHT_EYE_CONTOUR`, `LEFT_IRIS_POINTS`, `RIGHT_IRIS_POINTS`, `FACE_OVAL_CONTOUR`, `LIPS_CONTOUR`, `NOSE_CONTOUR`, `LEFT_EYEBROW`, `RIGHT_EYEBROW`, `FACIAL_TESSELLATION_LINES`, `EyeMetrics`.
6. **Hàm**: `dist()`, `dist2D()`, `analyzeEyes()`, hàm nội bộ `getPoint()`.
7. **Input/Output**: Input `landmarks: Point[] | undefined` (468–478 điểm); Output `EyeMetrics | null`.
8. **Được dùng bởi**: `EyeTrackingProvider.tsx`, `LiveCameraOverlay.tsx`, `FaceMeshVisualizer.tsx`, `EyeTalkDashboard.tsx`, `lowLightFilter.test.tsx`, `scripts/test-eye-control.ts`.
9. **Phụ thuộc**: Không (pure math).
10. **Vị trí workflow**: Bước trung gian ngay sau MediaPipe AI inference và ngay trước Gesture FSM.
11. **Nếu mất/hỏng**: Hệ thống mất hoàn toàn khả năng tính độ mở mắt (EAR) và hướng nhìn; không nhận diện được chớp mắt hay liếc mắt và các canvas overlay mất hằng số vẽ.

#### File A3: `src/modules/eye-control/lowLightFilter.ts`
1. **Đường dẫn**: `src/modules/eye-control/lowLightFilter.ts` (268 dòng)
2. **Vai trò**: Tiền xử lý tăng sáng khung hình camera trong môi trường thiếu sáng trước khi đưa vào MediaPipe FaceMesh.
3. **Lý do tồn tại**: MediaPipe giảm độ chính xác khi khung hình quá tối; module được thiết kế dạng plug-in độc lập ("add-only pre-processing stage") không can thiệp vào công thức mắt.
4. **Imports**: Không.
5. **Types/Constants**: `LowLightFilterConfig`, `DEFAULT_LOW_LIGHT_CONFIG` (`minGamma: 0.48`, `maxGamma: 1.0`, `targetLuminance: 125`, `emaAlpha: 0.1`, `gammaDeadband: 0.02`, `sampleStep: 8`).
6. **Hàm/Class**: `clamp()`, `estimateMeanLuminance()`, `computeAdaptiveGamma()`, `buildGammaLUT()`, `applyGammaLUT()`, `updateLuminanceAndGamma()`, class `LowLightExposureProcessor` (`constructor`, `getState`, `ensureCanvas`, `processFrame`, `reset`, `dispose`).
7. **Input/Output**: Input `HTMLVideoElement`; Output `HTMLCanvasElement | null` đã tăng sáng bằng LUT.
8. **Được dùng bởi**: `EyeTrackingProvider.tsx`, `lowLightFilter.test.tsx`.
9. **Phụ thuộc**: Web Canvas 2D API (`document.createElement('canvas')`).
10. **Vị trí workflow**: Nằm giữa `<video>` capture và `faceMesh.send()` khi `settings.lowLightFilterEnabled === true`.
11. **Nếu mất/hỏng**: `EyeTrackingProvider` sẽ không compile; nếu chỉ lỗi runtime trong `processFrame()`, `EyeTrackingProvider` tự fallback về `raw video` (`line 1502`).

#### File A4: `src/modules/eye-control/EyeTrackingProvider.tsx`
1. **Đường dẫn**: `src/modules/eye-control/EyeTrackingProvider.tsx` (2111 dòng)
2. **Vai trò**: Bộ não điều phối trung tâm của toàn phân hệ mắt: nạp MediaPipe CDN, quản lý Camera `MediaStream`, chạy vòng lặp rAF với khóa backpressure, thực thi Blink FSM + Gaze Classifier + Re-Arm + Cooldown, hiệu chuẩn 5 hướng, giả lập bàn phím, phát TTS phản hồi và phân phát Telemetry qua Split Context.
3. **Lý do tồn tại**: Cần một nguồn chân lý duy nhất (Single Source of Truth) giữ stream camera sống xuyên suốt các chuyển trang và tách Context để không làm re-render toàn UI 30 lần/giây.
4. **Imports**: `react`, `./types`, `./eyeTracker`, `./lowLightFilter`, `../../utils/speech`.
5. **Types/Constants/Refs**: `EyeTrackingSettingsContextType`, `EyeTrackingTelemetryContextType`, `TELEMETRY_THROTTLE_MS = 65`, `ACTION_COOLDOWN_MS = 2500`, các refs high-frequency (`smoothGazeX/Y`, `neutralRunningX/Y/EAR`, `initFramesCount`, `noFaceFramesCount`, `gazeDirState`, `isEyesClosed`, `blinkCountInGesture`, `cooldownTimer`, `gestureCallbacksRef`, `isProcessingRef`).
6. **Hàm/Components/Hooks**: `EyeTrackingProvider`, `useEyeTrackingSettingsContext`, `useEyeTrackingTelemetryContext`, `useEyeTrackingContext`, nội bộ `setOverlaySettings`, `registerGestureCallback`, `dispatchAction`, `triggerManualAction`, `loadLibraries`, `processFaceMeshResults`, `handleKeyDown`, `startTrackingLoop`, `stopTrackingLoop`, `startCamera`, `toggleCamera`, `cancelCalibration`, `resetCalibration`, `reZeroCenter`, `start5PointCalibration` (với `sleep`, `collectStepFrames`), `startCalibration`, các setter (`setEyeControlEnabled`, `setSimulatorMode`, `setSoundFeedback`, `setSpeakerEnabled`, `setSpeechVolume`, `setSpeechRate`, `setLowLightFilterEnabled`).
7. **Input/Output**: Input: camera frames, phím simulator, cấu hình người dùng; Output: `EyeAction` gửi tới subscribers, `EyeTrackingState` tới HUD, `CustomEvent('eyeai:emergency')`, TTS audio.
8. **Được dùng bởi**: `App.tsx` (bọc root), `useEyeTracking.ts`, `lowLightFilter.test.tsx`.
9. **Phụ thuộc**: `eyeTracker.ts`, `lowLightFilter.ts`, `speech.ts`, `types.ts`, MediaPipe CDN.
10. **Vị trí workflow**: Trục xương sống kết nối Hardware Camera → AI → Gesture → Navigation.
11. **Nếu mất/hỏng**: Toàn bộ điều khiển mắt, camera, hiệu chuẩn, simulator và audio settings đều ngừng hoạt động.

#### File A5: `src/modules/eye-control/useEyeTracking.ts`
1. **Đường dẫn**: `src/modules/eye-control/useEyeTracking.ts` (29 dòng)
2. **Vai trò**: Cung cấp 4 hook facade (`useEyeTrackingSettings`, `useEyeTrackingTelemetry`, `useEyeTracking`, `useAudioSettings`) cho các component tiêu thụ đúng lát cắt Context cần thiết.
3. **Lý do tồn tại**: Tối ưu render performance (tránh subscribe `trackingState` nếu chỉ cần `settings` hoặc action) và làm sạch API import.
4. **Imports**: `EyeTrackingProvider.tsx`.
5. **Hàm/Hooks**: `useEyeTrackingSettings()`, `useEyeTrackingTelemetry()`, `useEyeTracking()`, `useAudioSettings()`.
6. **Input/Output**: Đọc context từ `EyeTrackingProvider`.
7. **Được dùng bởi**: `App.tsx`, `EyeNavigationProvider.tsx`, `EyeFocusable.tsx`, `GlobalEyeHUD.tsx`, `CameraHub.tsx`, `CameraPreview.tsx`, `LiveCameraOverlay.tsx`, `FaceMeshVisualizer.tsx`, `VirtualKeyboard.tsx`, `PageHeader.tsx`, `FeatureCard.tsx`, `Avatar3D.tsx`, `AudioUnlockBanner.tsx`, `CallProvider.tsx`, `SpeakPage.tsx`, `SosPage.tsx`, `LocationPage.tsx`, `HumanChatPage.tsx`, `SettingsPage.tsx`, `FriendSearchModal.tsx`, `lowLightFilter.test.tsx`.
8. **Phụ thuộc**: `EyeTrackingProvider.tsx`.
9. **Vị trí workflow**: Lớp giao tiếp giữa `EyeTrackingProvider` và toàn bộ UI/Navigation.
10. **Nếu mất/hỏng**: Hầu hết các trang và component eye-control lỗi import.

#### File A6: `src/modules/eye-control/EyeNavigationProvider.tsx`
1. **Đường dẫn**: `src/modules/eye-control/EyeNavigationProvider.tsx` (604 dòng)
2. **Vai trò**: Quản lý bản đồ các phần tử tương tác (`nodesRef`), ngăn xếp Focus Scope cho Modal (`scopeStackRef`), thuật toán tìm kiếm phần tử theo lưới & không gian 2D, thực thi `SELECT` và `ESCAPE`.
3. **Lý do tồn tại**: Biến các lệnh hướng trừu tượng (`UP/DOWN/LEFT/RIGHT/SELECT/ESCAPE`) thành di chuyển con trỏ trực quan trên DOM động của React.
4. **Imports**: `react`, `./types`, `./useEyeTracking`, `./eyeFocusAutoScroll`.
5. **Types/Refs**: `EyeNavigationContextType`, `nodesRef`, `activeFocusIdRef`, `scopeStackRef`, `previousFocusByScopeRef`, `escapeHandlersRef`.
6. **Hàm/Components/Hooks**: `sortNodesByVisualOrder()`, `EyeNavigationProvider`, `useEyeNavigationContext`, nội bộ `registerEscapeHandler`, `getScopedCandidates`, `pushFocusScope`, `popFocusScope`, `registerFocusNode`, `unregisterFocusNode`, `setFocusId`, `navigate`, `triggerSelect`, `triggerEscape`, `ensureFocusVisible`, `handleResize`.
7. **Input/Output**: Input: `EyeAction` từ `EyeTrackingProvider`, đăng ký node từ `EyeFocusable`; Output: `activeFocusId`, `activeScopeId`, `node.onSelect()`, `window.dispatchEvent('eyeai:escape')`.
8. **Được dùng bởi**: `App.tsx`, `useEyeNavigation.ts`, `EyeFocusable.tsx`, `Modal.tsx`, `VirtualKeyboard.tsx`, `lowLightFilter.test.tsx`.
9. **Phụ thuộc**: `useEyeTracking.ts`, `eyeFocusAutoScroll.ts`, `types.ts`.
10. **Vị trí workflow**: Tầng giữa nhận lệnh từ Gesture Arbiter và điều phối `EyeFocusable`.
11. **Nếu mất/hỏng**: Vòng focus không di chuyển được, không chọn được nút bằng mắt, Modal không có Focus Trap.

#### File A7: `src/modules/eye-control/useEyeNavigation.ts` & File A8: `src/modules/eye-control/EyeFocusScopeContext.ts`
- **`useEyeNavigation.ts`** (5 dòng): Export wrapper `useEyeNavigation()` gọi `useEyeNavigationContext()`.
- **`EyeFocusScopeContext.ts`** (11 dòng): Tạo `EyeFocusScopeContext = createContext<string | null>(null)` và hook `useEyeFocusScope()`, được `Modal.tsx:90` cung cấp `modalScopeId` để mọi `EyeFocusable` con tự động thuộc phạm vi của modal đó mà không cần truyền prop `scopeId` thủ công.

#### File A9: `src/modules/eye-control/EyeFocusable.tsx`
1. **Đường dẫn**: `src/modules/eye-control/EyeFocusable.tsx` (198 dòng)
2. **Vai trò**: Wrapper component chuẩn cho mọi phần tử điều khiển được bằng mắt: tự đăng ký/hủy với `EyeNavigationProvider`, đọc nhãn bằng TTS khi nhận focus (`100ms` delay), chống dội click (`350ms`), vẽ vòng phát quang `#00E5FF` + reticle `🎯` bằng `motion.div` (`layoutId="eye-focus-glide-ring"`).
3. **Lý do tồn tại**: Chuẩn hóa hành vi tương tác và nhận diện thị giác đồng nhất trên toàn ứng dụng.
4. **Imports**: `react`, `EyeNavigationProvider`, `useEyeTracking`, `EyeFocusScopeContext`, `motion/react`, `speech.ts`.
5. **Props/Refs**: `EyeFocusableProps`, `elementRef`, `onSelectRef`, `speakLabelRef`, `lastSelectTimeRef`.
6. **Hàm**: `EyeFocusable` (memo), `getVoiceText()`, `handleSelect()`.
7. **Input/Output**: Input: `id`, `row`, `col`, `groupId`, `scopeId`, `speakLabel`, `onSelect`; Output: DOM node có `id="eye-focusable-${id}"` và thực thi `onSelect` + `speakVietnamese`.
8. **Được dùng bởi**: `AppButton.tsx`, `FeatureCard.tsx`, `SpeakHeroCard.tsx`, `SosHeroCard.tsx`, `PageHeader.tsx`, `OnboardingModal.tsx`, `CameraHub.tsx`, `VirtualKeyboard.tsx`, `EyeTextComposer.tsx`, `YouTubePlayerView.tsx`, `GoogleMapView.tsx`, `SpeakPage.tsx`, `AiPage.tsx`, `EntertainmentPage.tsx`, `HumanChatPage.tsx`, `SettingsPage.tsx`.
9. **Phụ thuộc**: `EyeNavigationProvider.tsx`, `useEyeTracking.ts`, `EyeFocusScopeContext.ts`, `speech.ts`, `motion/react`.
10. **Vị trí workflow**: Điểm cuối của luồng điều hướng mắt và điểm đầu phát sinh hành động nghiệp vụ.
11. **Nếu mất/hỏng**: Không có phần tử UI nào đăng ký được vào đồ thị điều hướng mắt.

#### File A10: `src/modules/eye-control/EyeFocusRing.tsx`
- **Đường dẫn**: `src/modules/eye-control/EyeFocusRing.tsx` (27 dòng).
- **Vai trò**: Component render vòng focus `motion.div` (`layoutId="eye-glide-ring"`).
- **Trạng thái kiểm toán**: Hiện **không được file nào import** (xác minh qua tìm kiếm toàn repo); `EyeFocusable.tsx` đã tự render trực tiếp vòng focus ở dòng 154–181.

#### File A11: `src/modules/eye-control/eyeFocusAutoScroll.ts`
1. **Đường dẫn**: `src/modules/eye-control/eyeFocusAutoScroll.ts` (276 dòng)
2. **Vai trò**: Tính toán vùng che phủ bởi sticky header, `#keyboard-eye-hud-bar`, `#smartphone-virtual-keyboard` (`--virtual-keyboard-height`), các thanh `fixed bottom-0`, tìm container cuộn lồng nhau và tự động cuộn để phần tử đang focus nằm gọn trong vùng an toàn.
3. **Lý do tồn tại**: Người suy giảm không dùng tay cuộn màn hình; thiếu auto-scroll thì phần tử focus ở dưới màn hình sẽ bị bàn phím ảo hoặc mép viewport che khuất.
4. **Imports**: `./types`.
5. **Constants/Options**: `EnsureVisibleOptions`, `FOCUS_RING_BUFFER = 18`.
6. **Hàm**: `getTopOccupiedHeight()`, `getBottomOccupiedHeight()`, `findScrollContainer()`, `ensureEyeFocusVisible()`.
7. **Được dùng bởi**: `EyeNavigationProvider.tsx`.
8. **Nếu mất/hỏng**: Điều hướng xuống dưới các danh sách dài (Kết quả YouTube, Danh bạ, Cài đặt) sẽ bị trượt khỏi màn hình mà không tự cuộn theo.

#### File A12: `src/modules/eye-control/CameraPreview.tsx`
1. **Đường dẫn**: `src/modules/eye-control/CameraPreview.tsx` (134 dòng)
2. **Vai trò**: Hiển thị luồng video webcam (`mirrored` mặc định `true`), đồng bộ vẽ `processedCanvasRef` lên `previewCanvasRef` khi bật bộ lọc thiếu sáng, nhúng `LiveCameraOverlay` và hiển thị màn hình tắt/lỗi camera + badge `LIVE AI`.
3. **Imports**: `react`, `./useEyeTracking`, `lucide-react`, `./LiveCameraOverlay`.
4. **Hàm**: `CameraPreview` (memo), `syncProcessedPreview()` trong `useEffect`.
5. **Được dùng bởi**: `GlobalEyeHUD.tsx`, `CameraHub.tsx`, `SettingsPage.tsx`, `lowLightFilter.test.tsx`.
6. **Lưu ý kỹ thuật**: Có thể được mount nhiều lần đồng thời (ví dụ 1 trong `GlobalEyeHUD` pill với `showOverlay={false}`, 1 trong `CameraHub` hoặc `SettingsPage` với `showOverlay={true}`).

#### File A13: `src/modules/eye-control/LiveCameraOverlay.tsx`
1. **Đường dẫn**: `src/modules/eye-control/LiveCameraOverlay.tsx` (249 dòng)
2. **Vai trò**: Vẽ lớp đồ họa thời gian thực (60 FPS `requestAnimationFrame`) lên trên `CameraPreview`: lưới mặt (`FACIAL_TESSELLATION_LINES`, `FACE_OVAL_CONTOUR`, mũi, môi, lông mày), viền mắt (`LEFT/RIGHT_EYE_CONTOUR` + điểm khóe mắt), vòng & tâm mống mắt (`468`, `473`).
3. **Cơ chế đặc biệt**: Đọc trực tiếp `window.__eyeai_latest_landmarks` và ánh xạ chuẩn `object-fit: cover` (`scale = Math.max(displayW/vidW, displayH/vidH)`) theo `devicePixelRatio` tối đa 2.
4. **Được dùng bởi**: `CameraPreview.tsx`.

#### File A14: `src/modules/eye-control/CameraHub.tsx`
1. **Đường dẫn**: `src/modules/eye-control/CameraHub.tsx` (734 dòng)
2. **Vai trò**: Bảng điều khiển chuyên sâu của phân hệ mắt (khi mở rộng từ `GlobalEyeHUD`): Preview kèm overlay, bật/tắt Mesh/Mắt/Mống mắt, nút `"Căn tâm"` (`reZeroCenter`), `"Hiệu chuẩn"` (`start5PointCalibration` + overlay tiến độ 5 bước), nút `EyeFocusable` `"Hỗ trợ thiếu sáng"`, 6 thẻ lệnh tương tác (`LEFT`, `RIGHT`, `UP`, `DOWN`, `SELECT`, `EMERGENCY`) có thể bấm test thủ công (`triggerManualAction`), thanh đếm Cooldown, đồng hồ đếm chớp mắt `0/3`, thước đo `EAR` trực tiếp theo ngưỡng `blinkThreshold`, và panel `DEBUG TELEMETRY`.
3. **Được dùng bởi**: `GlobalEyeHUD.tsx`, `lowLightFilter.test.tsx`.
4. **Lưu ý hiệu năng đã xác minh**: Dòng 70–78 chạy `requestAnimationFrame(() => setNowTime(performance.now()))` liên tục để tính `getBadgeState`, khiến `CameraHub` re-render ở ~60 FPS mỗi khi mở.

#### File A15: `src/modules/eye-control/FaceMeshVisualizer.tsx`
1. **Đường dẫn**: `src/modules/eye-control/FaceMeshVisualizer.tsx` (518 dòng)
2. **Vai trò**: Modal hiển thị mô hình 3D wireframe 468 điểm + mống mắt từ `window.__eyeai_latest_landmarks`, hỗ trợ kéo chuột/cảm ứng xoay góc nhìn (`orbitRotX/Y`), chuyển đổi 3D/2D, hiển thị cooldown, EAR trái/phải, độ tin cậy và nút hiệu chuẩn nhanh.
3. **Được dùng bởi**: `GlobalEyeHUD.tsx`.

---

### Nhóm B: HUD, Điều hướng & Thiết kế Giao diện Bọc (`src/components/`)

- **`src/components/ui/GlobalEyeHUD.tsx`** (327 dòng): Render thanh điều khiển Camera HUD toàn cục cho `account_type === 'impaired'` (ẩn trên `patient-*` và `auth/login/register`). Hỗ trợ 2 chế độ: `'floating'` (góc dưới-trái, thu gọn hoặc mở `CameraHub`, hoặc nút `"Bật Camera HUD"` khi tắt) và `'keyboard-bar'` (thanh ngang đặt dưới header trên route `chat`, `ai` hoặc khi `isKeyboardOpen === true`). Đồng thời render `FaceMeshVisualizer`.
- **`src/components/ui/KeyboardHudSlot.tsx`** (17 dòng): Slot mỏng gắn `<GlobalEyeHUD variant="keyboard-bar" />` ngay dưới header của `PageHeader.tsx`, `SpeakPage.tsx`, `AiPage.tsx`, `HumanChatPage.tsx`, `FriendSearchModal.tsx`.
- **`src/components/ui/PageHeader.tsx`** (142 dòng): Header chuẩn có nút Back (`#btn-header-back`), badge `EYE MODE ON/OFF`, nút Help (`#btn-header-help` mở `OnboardingModal`), nút Settings (`#btn-header-settings`), và `<KeyboardHudSlot />` (khi `!isPatient`).
- **`src/components/ui/AppButton.tsx`** (67 dòng): Bọc `<EyeFocusable>` quanh `<button>` chuẩn kích thước `min-h-[48px..64px]`.
- **`src/components/ui/FeatureCard.tsx`** (67 dòng): Thẻ tính năng trên `HomePage` bọc `<EyeFocusable>`, tắt animation `living-card-float` khi `settings.eyeControlEnabled === true` để ổn định thị giác.
- **`src/components/ui/Modal.tsx`** (98 dòng): Hộp thoại tự động gọi `pushFocusScope(modalScopeId)` và `registerEscapeHandler` khi mở, cung cấp `EyeFocusScopeContext.Provider` cho con, và `popFocusScope` khi đóng.
- **`src/components/home/SpeakHeroCard.tsx`** (63 dòng) & **`SosHeroCard.tsx`** (58 dòng): Hai thẻ anh hùng bọc `EyeFocusable` (`id="card-speak"` và `id="card-sos"`).
- **`src/components/ui/Avatar3D.tsx`** (86 dòng): Linh vật EYEAI hiển thị trạng thái `IDLE`, `THINKING`, `SPEAKING`; giảm biên độ chuyển động mắt khi `eyeControlEnabled === true`.
- **`src/components/ui/OnboardingModal.tsx`** (477 dòng): Modal hướng dẫn 3 slide (thích ứng `impaired` vs `patient`), mọi nút đóng/tab/prev/next đều bọc `EyeFocusable`.
- **`src/components/ui/SplashScreen.tsx`** (246 dòng) & **`BackgroundVideo.tsx`** (146 dòng) & **`AudioUnlockBanner.tsx`** (69 dòng) & **`ErrorBoundary.tsx`** (63 dòng) & **`StatusBadge.tsx`** (28 dòng): Hạ tầng khởi động, video nền crossfade, mở khóa âm thanh Safari/Chrome và xử lý lỗi UI.
- **`src/components/EyeTalkDashboard.tsx`** (1428 dòng): Giao diện cũ v2.1 (route `'dev-dashboard'`), tự quản lý riêng MediaPipe, camera stream, bàn phím 8 hàng và gọi Gemini mà không dùng `EyeTrackingProvider` hay `EyeNavigationProvider`.

---

### Nhóm C: Bàn phím ảo (`src/modules/virtual-keyboard/`)

- **`types.ts`** (18 dòng): Định nghĩa `GridItemType`, `GridItem`, `VirtualKeyboardProps`.
- **`keyboardLayout.ts`** (121 dòng): Định nghĩa 3 layout dạng ma trận 2D: `QWERTY_LAYOUT` (4 hàng: 10, 9, 9, 5 phím), `NUMBERS_LAYOUT` (4 hàng số & ký tự đặc biệt), `PHRASES_LAYOUT` (3 hàng chứa 8 mẫu câu y tế/sinh hoạt nhanh).
- **`vietnameseTelex.ts`** (29 dòng): Hàm `applyVietnameseAccents(text)` tra bảng `combinations` cho 2 ký tự cuối để bỏ dấu tiếng Việt (sắc `s`, huyền `f`, hỏi `r`, ngã `x`, nặng `j`).
- **`VirtualKeyboard.tsx`** (231 dòng): Bàn phím cố định đáy màn hình (`#smartphone-virtual-keyboard`, `z-[80]`), bọc `EyeFocusable` cho từng phím với `row={rowIndex}`, `col={colIndex}`, `groupId="virtual-keyboard"`, báo trạng thái `setKeyboardOpen(isOpen)`, đo chiều cao qua `ResizeObserver` ghi vào CSS variable `--virtual-keyboard-height` cho `eyeFocusAutoScroll.ts`.
- **`EyeTextComposer.tsx`** (122 dòng): Hộp soạn thảo hiển thị `value`, 3 nút thao tác nhanh (nói, xóa 1 ký tự, xóa hết) và 2 nút `EyeFocusable` lớn (`#btn-toggle-keyboard`, `#btn-composer-submit`).

---

### Nhóm D: Trang chức năng Người suy giảm (`src/pages/` & `src/App.tsx`)

- **`src/App.tsx`** (627 dòng): Root app, khởi tạo chuỗi 4 Provider, `AppContent` điều hướng theo `account_type`, lắng nghe `eyeai:escape` và `eyeai:emergency`, gắn `GlobalEyeHUD` cho tài khoản `'impaired'`.
- **`src/pages/HomePage.tsx`** (134 dòng): Trang chính bố trí lưới `(row, col)` rõ ràng cho 6 tính năng (`SpeakHeroCard`, `Entertainment`, `Location`, `Contacts`, `Ai`, `SosHeroCard`) + `Avatar3D`.
- **`src/pages/SpeakPage.tsx`** (379 dòng): Bảng giao tiếp phát giọng nói trực tiếp qua loa thiết bị (`speakVietnamese`), 4 mẫu câu nhanh, kiểm tra xung đột cuộc gọi (`useCall().callState !== 'idle'`), lịch sử câu đã nói có nút `"Đọc lại"`, `EyeTextComposer` + `VirtualKeyboard`.
- **`src/pages/AiPage.tsx`** (494 dòng): Trò chuyện Trợ lý AI: 4 câu gợi ý, chuỗi gọi `/api/ai/chat` (15s timeout) → fallback `fetchDirectGemini` (SDK `@google/genai` → REST API), tích hợp `Avatar3D` và tự động đọc câu trả lời bằng `speakVietnamese` khi không trong cuộc gọi.
- **`src/pages/SosPage.tsx`** (292 dòng): Trung tâm SOS: đồng hồ tròn đếm `blinkCount / 3`, tự kích hoạt cuộc gọi khẩn cấp giả lập qua 4 đường: prop `autoCall`, sự kiện `eyeai:emergency`, `blinkCount === 3 || lastExecutedAction === 'EMERGENCY'`, hoặc nhắm mắt liên tục `closedDuration >= 8.0s`; kèm 3 liên hệ mẫu (`115`, Bác sĩ, Người thân).
- **`src/pages/EntertainmentPage.tsx`** (340 dòng): 3 danh mục (`books`, `radio`, `music`), tìm kiếm bằng `EyeTextComposer` + `VirtualKeyboard`, hiển thị gợi ý mặc định hoặc kết quả từ `searchEntertainment`, nhúng `YouTubePlayerView`.
- **`src/pages/LocationPage.tsx`** (194 dòng): Dùng `useGeolocation(true)` lấy GPS, hiển thị `GoogleMapView`, thẻ trạng thái vị trí & nút chia sẻ vị trí (`handleShareLocation`).
- **`src/pages/ContactsPage.tsx`** (402 dòng): Quản lý danh bạ bạn bè qua `friendService`, nút Kết bạn (`FriendSearchModal`), Lời mời (`FriendRequestsModal`), modal tùy chọn Nhắn tin / Gọi thoại (`scopeId="contact-action-modal"`).
- **`src/pages/HumanChatPage.tsx`** (335 dòng): Chat 1-1 realtime qua `chatService` (`postgres_changes`), nút gọi thoại/video (`CallProvider`), `EyeTextComposer` + `VirtualKeyboard` (khi bật eye mode) hoặc input thường (khi tắt).
- **`src/pages/SettingsPage.tsx`** (987 dòng): Đổi tên hiển thị, chuyển loại tài khoản (`impaired` ↔ `patient`, tự động tắt Eye Mode nếu chuyển sang `patient`), đổi mật khẩu, bật/tắt Eye Mode, bật/tắt Camera & Hiệu chỉnh 5 hướng kèm `CameraPreview`, bật/tắt Simulator Mode, bật/tắt Loa, chỉnh âm lượng/tốc độ đọc/nghe thử, bật/tắt âm thanh phản hồi mắt.
- **`src/pages/AuthPage.tsx`** (23 dòng) & **`src/hooks/useAuth.ts`** (174 dòng): Đăng nhập/đăng ký và xác định `profile.account_type` từ bảng `profiles` / `user_metadata`.

---

### Nhóm E: Dịch vụ, Backend Proxy, Legacy & Tests

- **`src/utils/speech.ts`** (737 dòng): Dual-path Vietnamese TTS (`hasNativeVietnameseSpeech()` → `speakNative` hoặc `playOnlineTTS` qua `/api/tts` + `AudioBuffer` RAM cache 60 mục + `AbortController`), quản lý `unlockAudio()` và `recoverAudioSession()`.
- **`src/modules/calls/CallProvider.tsx`** (737 dòng), **`signalingService.ts`** (117 dòng), **`webrtcService.ts`** (266 dòng): Hệ thống gọi thoại WebRTC P2P chỉ xin track `audio: true, video: false` để không tranh chấp/ngắt camera của `EyeTrackingProvider`.
- **`src/modules/entertainment/YouTubePlayerView.tsx`** (443 dòng), **`entertainmentConfig.ts`** (57 dòng), **`types.ts`** (22 dòng): Điều khiển YouTube IFrame bằng mắt (`-30s`, `-10s`, `Play/Pause`, `+10s`, `+30s`, `Giảm âm`, `Tắt tiếng`, `Tăng âm`).
- **`src/modules/location/GoogleMapView.tsx`** (232 dòng), **`useGeolocation.ts`** (149 dòng), **`mapLoader.ts`** (18 dòng), **`CustomOverlayMarker.ts`** (122 dòng): Google Maps JS API (fallback iframe embed) với 3 nút `EyeFocusable` (`recenter`, `zoomin`, `zoomout`).
- **`src/services/entertainmentService.ts`** (144 dòng), **`chatService.ts`** (142 dòng), **`friendService.ts`** (318 dòng), **`preloadManager.ts`** (305 dòng), **`videoCacheManager.ts`** (156 dòng): Lớp dịch vụ giao tiếp API và cache tài nguyên.
- **`server.ts`** (210 dòng), **`netlify/functions/ai-chat.ts`** (175 dòng), **`netlify/functions/tts.ts`** (116 dòng), **`server/youtubeBackend.ts`** (233 dòng): Proxy backend cho Gemini, Google Translate TTS và YouTube Data API v3 (kèm cache 10 phút).
- **`src/modules/eye-control/__tests__/lowLightFilter.test.tsx`** (457 dòng), **`scripts/test-eye-control.ts`** (393 dòng), **`scripts/test-focus-trap.ts`** (298 dòng): Bộ kiểm thử đơn vị và mô phỏng cho lọc thiếu sáng, hình học mắt, FSM và Focus Trap.
- **`src/utils/eyeTracker.ts`** (131 dòng) & **`src/utils/keyboardLayout.ts`** (114 dòng): Hai file di sản (legacy) không còn được import trong runtime hiện tại.
