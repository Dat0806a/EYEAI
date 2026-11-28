# 11. BẢNG ĐỐI CHIẾU ĐỘ BAO PHỦ MÃ NGUỒN (SOURCE COVERAGE & AUDIT MATRIX)

## 1. Bảng đối chiếu toàn bộ File trong phạm vi phân tích

| STT | Đường dẫn file | Số dòng | Trạng thái đọc | Tài liệu phân tích chi tiết | Ghi chú kiểm toán |
| :--- | :--- | :---: | :--- | :--- | :--- |
| 1 | `index.html` | 17 | Đã đọc 100% | `01`, `02`, `05` | Nạp CDN MediaPipe |
| 2 | `netlify.toml` | 60 | Đã đọc 100% | `02`, `03` | Redirect `/api/ai/chat`, `/api/tts` |
| 3 | `server.ts` | 210 | Đã đọc 100% | `02`, `03`, `05` | Express proxy Gemini, TTS, YouTube |
| 4 | `netlify/functions/ai-chat.ts` | 175 | Đã đọc 100% | `02`, `03` | Serverless Gemini V1/V2 |
| 5 | `netlify/functions/tts.ts` | 116 | Đã đọc 100% | `02`, `03` | Serverless Google Translate TTS |
| 6 | `server/youtubeBackend.ts` | 233 | Đã đọc 100% | `02`, `03` | YouTube Data API v3 + Cache 10m |
| 7 | `src/main.tsx` | 10 | Đã đọc 100% | `02`, `07` | Entry React StrictMode |
| 8 | `src/App.tsx` | 627 | Đã đọc 100% | `01`, `02`, `03`, `07` | Dual-Experience Router & Providers |
| 9 | `src/index.css` | 162 | Đã đọc 100% | `02`, `06` | Theme, `.eye-focus-active`, `reduced-motion` |
| 10 | `src/types.ts` | 48 | Đã đọc 100% | `02` | Legacy types cho `EyeTalkDashboard` |
| 11 | `src/types/account.ts` | 13 | Đã đọc 100% | `02`, `03` | `AccountType` (`impaired`/`patient`) |
| 12 | `src/types/chat.ts` | 65 | Đã đọc 100% | `02` | Chat & WebRTC types |
| 13 | `src/types/friends.ts` | 50 | Đã đọc 100% | `02` | Friends types |
| 14 | `src/lib/supabase.ts` | 16 | Đã đọc 100% | `02` | Supabase client singleton |
| 15 | `src/hooks/useAuth.ts` | 174 | Đã đọc 100% | `02`, `03`, `07` | Auth & `account_type` |
| 16 | `src/context/TutorialContext.tsx` | 34 | Đã đọc 100% | `02`, `03` | State `OnboardingModal` |
| 17 | `src/modules/eye-control/types.ts` | 99 | Đã đọc 100% | `02`, `04` | Core eye-control contracts |
| 18 | `src/modules/eye-control/eyeTracker.ts` | 327 | Đã đọc 100% | `02`, `03`, `04`, `05` | EAR & Canthal Baseline Projection |
| 19 | `src/modules/eye-control/lowLightFilter.ts` | 268 | Đã đọc 100% | `02`, `03`, `04`, `05` | Adaptive Gamma LUT Filter |
| 20 | `src/modules/eye-control/EyeTrackingProvider.tsx` | 2111 | Đã đọc 100% | `01`, `02`, `03`, `04`, `07` | Camera, MediaPipe, Blink/Gaze FSM, Calib |
| 21 | `src/modules/eye-control/useEyeTracking.ts` | 29 | Đã đọc 100% | `02`, `03` | 4 Split Context Hooks |
| 22 | `src/modules/eye-control/EyeNavigationProvider.tsx` | 604 | Đã đọc 100% | `02`, `03`, `04`, `07` | Grid/Spatial 2D Nav & Scope Stack |
| 23 | `src/modules/eye-control/useEyeNavigation.ts` | 5 | Đã đọc 100% | `02`, `03` | Wrapper hook |
| 24 | `src/modules/eye-control/EyeFocusScopeContext.ts` | 11 | Đã đọc 100% | `02`, `03` | Context truyền `scopeId` |
| 25 | `src/modules/eye-control/EyeFocusable.tsx` | 198 | Đã đọc 100% | `02`, `03`, `07` | Focusable node + Ring + TTS |
| 26 | `src/modules/eye-control/EyeFocusRing.tsx` | 27 | Đã đọc 100% | `02`, `03`, `09` | **Unused** component |
| 27 | `src/modules/eye-control/eyeFocusAutoScroll.ts` | 276 | Đã đọc 100% | `02`, `03`, `04` | Safe viewport auto-scroll |
| 28 | `src/modules/eye-control/CameraPreview.tsx` | 134 | Đã đọc 100% | `02`, `03` | Video + low-light canvas sync |
| 29 | `src/modules/eye-control/LiveCameraOverlay.tsx` | 249 | Đã đọc 100% | `02`, `03` | 2D FaceMesh/Iris Canvas Overlay |
| 30 | `src/modules/eye-control/CameraHub.tsx` | 734 | Đã đọc 100% | `02`, `03`, `09` | Hub điều khiển, EAR, Debug, Low-light |
| 31 | `src/modules/eye-control/FaceMeshVisualizer.tsx` | 518 | Đã đọc 100% | `02`, `03`, `05` | 3D Orbit Mesh Visualizer |
| 32 | `src/modules/virtual-keyboard/types.ts` | 18 | Đã đọc 100% | `02` | Keyboard types |
| 33 | `src/modules/virtual-keyboard/keyboardLayout.ts` | 121 | Đã đọc 100% | `02`, `04` | QWERTY / NUMBERS / PHRASES |
| 34 | `src/modules/virtual-keyboard/vietnameseTelex.ts` | 29 | Đã đọc 100% | `02`, `03`, `04` | Bộ gõ dấu Telex |
| 35 | `src/modules/virtual-keyboard/VirtualKeyboard.tsx` | 231 | Đã đọc 100% | `02`, `03` | Bàn phím ảo gắn đáy + ResizeObserver |
| 36 | `src/modules/virtual-keyboard/EyeTextComposer.tsx` | 122 | Đã đọc 100% | `02`, `03` | Ô soạn thảo & nút thao tác mắt |
| 37 | `src/utils/speech.ts` | 737 | Đã đọc 100% | `02`, `03`, `07` | Dual-path TTS + Audio unlock/recover |
| 38 | `src/utils/eyeTracker.ts` | 131 | Đã đọc 100% | `02`, `04`, `09` | **Legacy unused** (eyelid-ratio cũ) |
| 39 | `src/utils/keyboardLayout.ts` | 114 | Đã đọc 100% | `02`, `09` | **Legacy unused** (bàn phím 8 hàng cũ) |
| 40 | `src/components/ui/GlobalEyeHUD.tsx` | 327 | Đã đọc 100% | `02`, `03` | Floating & Keyboard-bar HUD |
| 41 | `src/components/ui/KeyboardHudSlot.tsx` | 17 | Đã đọc 100% | `02`, `03` | Slot header cho keyboard-bar HUD |
| 42 | `src/components/ui/PageHeader.tsx` | 142 | Đã đọc 100% | `02`, `03` | Header điều hướng chung |
| 43 | `src/components/ui/AppButton.tsx` | 67 | Đã đọc 100% | `02`, `03` | Button bọc EyeFocusable |
| 44 | `src/components/ui/FeatureCard.tsx` | 67 | Đã đọc 100% | `02`, `03` | Card bọc EyeFocusable |
| 45 | `src/components/ui/Modal.tsx` | 98 | Đã đọc 100% | `02`, `03` | Modal + Focus Trap Scope |
| 46 | `src/components/home/SpeakHeroCard.tsx` | 63 | Đã đọc 100% | `02`, `03` | Hero card Speak |
| 47 | `src/components/home/SosHeroCard.tsx` | 58 | Đã đọc 100% | `02`, `03` | Hero card SOS |
| 48 | `src/components/ui/Avatar3D.tsx` | 86 | Đã đọc 100% | `02`, `03` | Mascot AI 3D |
| 49 | `src/components/ui/AudioUnlockBanner.tsx` | 69 | Đã đọc 100% | `02`, `03` | Unlock audio iOS/Chrome |
| 50 | `src/components/ui/OnboardingModal.tsx` | 477 | Đã đọc 100% | `02`, `03`, `09` | Modal hướng dẫn 3 trang |
| 51 | `src/components/ui/SplashScreen.tsx` | 246 | Đã đọc 100% | `02`, `03` | Splash khởi động |
| 52 | `src/components/ui/BackgroundVideo.tsx` | 146 | Đã đọc 100% | `02`, `03` | Video nền crossfade |
| 53 | `src/components/ui/ErrorBoundary.tsx` | 63 | Đã đọc 100% | `02`, `03` | React ErrorBoundary |
| 54 | `src/components/ui/StatusBadge.tsx` | 28 | Đã đọc 100% | `02`, `03` | Badge trạng thái |
| 55 | `src/components/chat/MessageBubble.tsx` | 72 | Đã đọc 100% | `02`, `03` | Bong bóng chat AI |
| 56 | `src/components/contacts/FriendRequestsModal.tsx` | 170 | Đã đọc 100% | `02`, `03` | Modal lời mời kết bạn |
| 57 | `src/components/contacts/FriendSearchModal.tsx` | 335 | Đã đọc 100% | `02`, `03` | Modal tìm bạn + VirtualKeyboard |
| 58 | `src/components/EyeTalkDashboard.tsx` | 1428 | Đã đọc 100% | `02`, `03`, `09` | Legacy dashboard (`dev-dashboard`) |
| 59 | `src/pages/AuthPage.tsx` | 23 | Đã đọc 100% | `02`, `03` | Trang xác thực |
| 60 | `src/pages/HomePage.tsx` | 134 | Đã đọc 100% | `02`, `03`, `07` | Trang chủ phân hệ Impaired |
| 61 | `src/pages/SpeakPage.tsx` | 379 | Đã đọc 100% | `02`, `03`, `07` | Giao tiếp loa trực tiếp |
| 62 | `src/pages/AiPage.tsx` | 494 | Đã đọc 100% | `02`, `03`, `07` | Trợ lý AI Gemini |
| 63 | `src/pages/SosPage.tsx` | 292 | Đã đọc 100% | `02`, `03`, `07`, `09` | Trung tâm SOS |
| 64 | `src/pages/EntertainmentPage.tsx` | 340 | Đã đọc 100% | `02`, `03`, `07` | Giải trí YouTube |
| 65 | `src/pages/LocationPage.tsx` | 194 | Đã đọc 100% | `02`, `03`, `09` | Định vị GPS & Bản đồ |
| 66 | `src/pages/ContactsPage.tsx` | 402 | Đã đọc 100% | `02`, `03`, `07` | Danh bạ người thân |
| 67 | `src/pages/HumanChatPage.tsx` | 335 | Đã đọc 100% | `02`, `03`, `07` | Nhắn tin realtime 1-1 |
| 68 | `src/pages/SettingsPage.tsx` | 987 | Đã đọc 100% | `02`, `03`, `07` | Cài đặt tài khoản, mắt & giọng nói |
| 69 | `src/services/preloadManager.ts` | 305 | Đã đọc 100% | `02`, `03`, `07` | Preload 10 tác vụ khởi động |
| 70 | `src/services/videoCacheManager.ts` | 156 | Đã đọc 100% | `02`, `03` | Cache video Blob URL |
| 71 | `src/services/entertainmentService.ts` | 144 | Đã đọc 100% | `02`, `03` | API client YouTube + direct fallback |
| 72 | `src/services/chat/chatService.ts` | 142 | Đã đọc 100% | `02`, `03` | Supabase direct chat |
| 73 | `src/services/friends/friendService.ts` | 318 | Đã đọc 100% | `02`, `03` | Supabase friends RPC/fallback |
| 74 | `src/modules/calls/CallProvider.tsx` | 737 | Đã đọc 100% | `02`, `03`, `07` | Voice Call WebRTC Provider |
| 75 | `src/modules/calls/signalingService.ts` | 117 | Đã đọc 100% | `02`, `03` | Supabase broadcast signaling |
| 76 | `src/modules/calls/webrtcService.ts` | 266 | Đã đọc 100% | `02`, `03` | `RTCPeerConnection` wrapper |
| 77 | `src/modules/entertainment/YouTubePlayerView.tsx` | 443 | Đã đọc 100% | `02`, `03` | Player YouTube điều khiển mắt |
| 78 | `src/modules/entertainment/entertainmentConfig.ts` | 57 | Đã đọc 100% | `02` | Config 3 chế độ giải trí |
| 79 | `src/modules/entertainment/types.ts` | 22 | Đã đọc 100% | `02` | Entertainment types |
| 80 | `src/modules/location/GoogleMapView.tsx` | 232 | Đã đọc 100% | `02`, `03` | Google Map + nút zoom/recenter mắt |
| 81 | `src/modules/location/useGeolocation.ts` | 149 | Đã đọc 100% | `02`, `03` | Browser Geolocation hook |
| 82 | `src/modules/location/mapLoader.ts` | 18 | Đã đọc 100% | `02`, `03` | Loader `@googlemaps/js-api-loader` |
| 83 | `src/modules/location/CustomOverlayMarker.ts` | 122 | Đã đọc 100% | `02`, `03` | Google Maps OverlayView marker |
| 84 | `src/modules/eye-control/__tests__/lowLightFilter.test.tsx` | 457 | Đã đọc 100% | `02`, `04` | Vitest unit & integration tests |
| 85 | `scripts/test-eye-control.ts` | 393 | Đã đọc 100% | `02`, `04` | Standalone verification script |
| 86 | `scripts/test-focus-trap.ts` | 298 | Đã đọc 100% | `02` | Standalone focus trap script |

---

## 2. Những nội dung ngoài phạm vi hoặc chưa thể xác minh thực nghiệm

| Hạng mục | Trạng thái | Lý do cụ thể |
| :--- | :--- | :--- |
| **Phân hệ Bệnh nhân (`src/experiences/patient/**`, `server/patient*.ts`, `netlify/functions/patient*.ts`)** | Ngoài phạm vi | Theo quy tắc bắt buộc: chỉ phân tích phân hệ Người suy giảm và module dùng chung trực tiếp. |
| **Các component trang trí nhỏ không chứa logic mắt** (`AiVisual.tsx`, `ContactsVisual.tsx`, `EntertainmentVisual.tsx`, `LocationVisual.tsx`, `src/components/auth/*`, `EmptyState.tsx`, `LoadingState.tsx`, `src/tokens/index.ts`, `luckydreamMapStyle.ts`) | Không phân tích sâu từng hàm | Chỉ là SVG/CSS minh họa hoặc UI form xác thực thông thường; không tham gia pipeline eye-control. |
| **Mã nguồn nội bộ của Google MediaPipe FaceMesh (`face_mesh.js`, file `.tflite` / `.wasm`)** | Hộp đen thư viện ngoài | Được nạp runtime từ `cdn.jsdelivr.net`, không nằm trong repository mã nguồn. |
| **Số liệu FPS thực tế, Latency thực tế (ms), Accuracy (%) trên camera thật** | **Chưa có dữ liệu thực nghiệm** | Không có bộ log/benchmark phần cứng thật trong workspace và không được phép tự tạo số liệu giả định. |
| **Kết quả chạy trực tiếp `vitest run` trong phiên này** | Chưa chạy test suite | Tài liệu được kiểm toán trực tiếp bằng đọc toàn văn mã nguồn; nội dung test đã được đọc 100% tại `lowLightFilter.test.tsx`, `test-eye-control.ts`, `test-focus-trap.ts`. |
| **Schema SQL & RPC trên Supabase (`get_my_friends`, `get_or_create_direct_conversation`, bảng `profiles`, `calls`, `messages`)** | Chỉ thấy ở phía client gọi RPC/query | File migration SQL của Supabase không nằm trong danh sách file workspace được kiểm tra; chỉ xác minh được tên bảng, tên RPC và tham số gọi từ `useAuth.ts`, `friendService.ts`, `chatService.ts`, `CallProvider.tsx`. |
