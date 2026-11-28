# 03 (PHẦN 3). PHÂN TÍCH CHI TIẾT TỪNG HÀM — VIRTUAL KEYBOARD, APP, PAGES & UI

Tài liệu này tiếp nối [`03_FUNCTION_ANALYSIS.md`](./03_FUNCTION_ANALYSIS.md), phân tích đầy đủ các hàm/component thuộc bàn phím ảo, `App.tsx`, các trang Người suy giảm, các UI wrapper và `EyeTalkDashboard.tsx`.

---

## 1. Bàn phím ảo (`src/modules/virtual-keyboard/`)

### 1.1. `vietnameseTelex.ts` — `applyVietnameseAccents(text)`
- **Vị trí**: [`vietnameseTelex.ts:1-29`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/virtual-keyboard/vietnameseTelex.ts#L1-L29)
- **Signature**: `export function applyVietnameseAccents(text: string): string`
- **Mục đích**: Ghép dấu tiếng Việt kiểu Telex khi ký tự vừa gõ và ký tự liền trước tạo thành cặp trong bảng `combinations` (60 cặp nguyên âm thường + 5 cặp có dấu cách sau + 5 cặp `As..Aj`).
- **Logic**: Nếu `!text` trả `''`. Nếu `text.length >= 2`, kiểm tra `lastTwo = text.slice(-2)` trong `combinations`; nếu khớp trả `text.slice(0, -2) + combinations[lastTwo]`, ngược lại trả `text`. $O(1)$.

### 1.2. `VirtualKeyboard.tsx` — `VirtualKeyboard({ isOpen, onClose, onKeyPress, actionLabel })`
- **Vị trí**: [`VirtualKeyboard.tsx:10-231`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/virtual-keyboard/VirtualKeyboard.tsx#L10-L231)
- **Hooks & Effects**:
  - `useEffect` (30–36 & 39–45): Khi mở bàn phím hoặc đổi `layoutMode` (`QWERTY` / `NUMBERS` / `PHRASES`), tự động đặt focus về phím đầu tiên `key-${currentLayout[0][0].id}` qua `setFocusId`.
  - `useEffect` + `updateHeight()` (48–76): Gọi `setKeyboardOpen(isOpen)` để `GlobalEyeHUD` chuyển sang `keyboard-bar`; đo `containerRef.current.offsetHeight` qua `ResizeObserver` và ghi vào `--virtual-keyboard-height` cho `eyeFocusAutoScroll.ts`. Cleanup đặt lại `'0px'` và `setKeyboardOpen(false)`.
- **`handleKeyClick(item)`** (78–92): Chặn `TOGGLE_NUMBERS`, `TOGGLE_PHRASES`, `TOGGLE_ABC` để đổi `layoutMode` nội bộ; các phím còn lại đẩy lên `onKeyPress(item)`.

### 1.3. `EyeTextComposer.tsx` — `EyeTextComposer(props)`
- **Vị trí**: [`EyeTextComposer.tsx:16-122`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/virtual-keyboard/EyeTextComposer.tsx#L16-L122)
- **`handleSpeak()`** (25–29): Nếu `value.trim()` khác rỗng, gọi `speakVietnamese(value)`.
- **`handleBackspace()`** (31–33): Gọi `onChange(value.slice(0, -1))`.
- **`handleClear()`** (35–37): Gọi `onChange('')`.
- Render 2 nút `EyeFocusable` chính: `#btn-toggle-keyboard` (`onToggleKeyboard`) và `#btn-composer-submit` (`onSubmit`).

---

## 2. File `src/App.tsx`

- **`App()`** (613–627): Bọc chuỗi Provider: `ErrorBoundary` → `TutorialProvider` → `EyeTrackingProvider` → `EyeNavigationProvider` → `CallProvider` → `AppWithPatientMode`.
- **`AppWithPatientMode()`** (600–611): Gọi `useAuth()`, bọc `PatientModeProvider` rồi render `AppContent`.
- **`AppContent({ auth })`** (66–598):
  - `useEffect` auto-disable (75–79): Nếu `profile?.account_type === 'patient' && settings.eyeControlEnabled` → gọi `setEyeControlEnabled(false)`.
  - `useEffect` preload (104–114): Subscribe `preloadManager` và gọi `preloadManager.startPreload()`.
  - `handleRetryPreload()` (116–118): Gọi lại `preloadManager.startPreload()`.
  - `navigateTo(route, params)` (120–136): Cập nhật param (nếu có), đặt `currentRoute` và `window.scrollTo(0, 0)`.
  - `handleOpenHumanChat(friend)` (138–142): Lưu `chatFriend`, chuyển sang `'chat'` và cuộn lên đầu.
  - `useEffect` reset auth gate (147–152) & `useEffect` resolve post-login route (155–164): Khi login là `'impaired'`, gọi `openTutorial()` và `navigateTo('home')`.
  - `handleEyeEscape()` trong `useEffect` (167–177): Lắng nghe `'eyeai:escape'`; nếu không ở trang chủ/auth thì điều hướng về `homeRoute`.
  - `handleGlobalEmergency()` trong `useEffect` (180–190): Lắng nghe `'eyeai:emergency'`; nếu không phải `'patient'`, đặt `isAutoEmergencyCall = true` và nhảy ngay sang `'sos'`.
  - `useEffect` Experience Router (193–213): Nếu `account_type === 'impaired'` mà đang ở route `patient-*` → ép về `'home'`.
  - `handleLoginSuccess()` (228–240): Đặt `hasPassedAuth(true)`, reset patient state, điều hướng ngay nếu đã có `profile.account_type` hoặc bật `awaitingLoginRoute`.
  - `getHomeRoute()` (242–247): Trả `'home'` cho impaired.
  - Điều kiện render `GlobalEyeHUD` (269–271): `!isSplashActive && !shouldShowAuth && !isResolvingPostLoginProfile && profile?.account_type === 'impaired' && !currentRoute.startsWith('patient-')`.

---

## 3. Các Trang Chức Năng Phân Hệ Người Suy Giảm (`src/pages/`)

### 3.1. `HomePage.tsx`
- **`HomePage({ onNavigate })`** ([`HomePage.tsx:17-134`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/HomePage.tsx#L17-L134)): Khai báo 6 thẻ lưới tường minh: `SpeakHeroCard(0,0)`, `card-entertainment(1,0)`, `card-location(1,1)`, `card-contacts(2,0)`, `card-ai(2,1)`, `SosHeroCard(3,0)` và `Avatar3D` ở góc dưới phải (`onClick={() => onNavigate('ai')}`).

### 3.2. `SpeakPage.tsx`
- **`SpeakPage({ onBack })`** ([`SpeakPage.tsx:31-379`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/SpeakPage.tsx#L31-L379)):
  - Lấy `isCallActive` từ `useCall()` an toàn bằng `try/catch`.
  - `useEffect` mount/unmount (54–62): Kiểm tra `isSpeechSupported()` và `stopSpeech()` khi rời trang.
  - `handleStopSpeech()` (70–73): Dừng TTS và đặt `isSpeakingState(false)`.
  - `handleSpeakText(text)` (75–98): Chặn nếu `isCallActive` hoặc `!settings.speakerEnabled` (hiện banner 4 giây); ngược lại `stopSpeech()` và gọi `speakVietnamese(text, { onStart, onEnd })`.
  - `handleSubmit(textOverride)` (100–135): Khóa double-submit `400ms` bằng `submittingRef`, kiểm tra `isCallActive`, thêm `LocalMessage`, xóa `draft`, gọi `handleSpeakText`.
  - `handleKeyPress(item)` (137–159): Xử lý `phrase`/`letter` qua `applyVietnameseAccents()`, `space`, `BACKSPACE`, `CLEAR_ALL`, `SEND -> handleSubmit()`.

### 3.3. `AiPage.tsx`
- **`fetchDirectGemini(textToSend, history, signal)`** (36–129): Client fallback khi `/api/ai/chat` không dùng được; lấy `VITE_GEMINI_API_KEY`/`GEMINI_API_KEY`, thử `@google/genai` SDK qua 5 model rồi thử REST API `v1beta` qua 3 model.
- **`AiPage({ onBack })`** (131–494):
  - Cleanup `useEffect` (155–162): `abortControllerRef.current?.abort()` + `stopSpeech()`.
  - `handleSend(textOverride)` (169–283): Chống gửi chồng khi `isAiLoading`, thêm `userMsg`, đặt `aiState('THINKING')`, tạo `AbortController` với timeout `15000ms`, gọi `POST /api/ai/chat` (fallback `fetchDirectGemini`), thêm `aiMsg`, nếu `!isCallActive` thì đặt `aiState('SPEAKING')` và `speakVietnamese(reply)`.
  - `handleRetry()` (285–289): Gửi lại `lastUserText`.
  - `handleStopSpeech()` (291–295): Dừng đọc và đặt `aiState('IDLE')`.
  - `handleKeyPress(item)` (297–319): Cập nhật `draft` với Telex và gọi `handleSend()` khi nhấn `SEND`.

### 3.4. `SosPage.tsx`
- **`SosPage({ onBack, autoCall })`** ([`SosPage.tsx:27-292`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/SosPage.tsx#L27-L292)):
  - `startEmergencyCall(contact)` (39–45): Đặt `hasSosTriggered = true`, `isCallConfirmed = true`, `isModalOpen = true`, phát TTS cảnh báo SOS & chia sẻ GPS.
  - 4 `useEffect` kích hoạt tự động: (1) `autoCall === true` (48–52), (2) `window` event `'eyeai:emergency'` (55–63), (3) `blinkCount === 3 || lastExecutedAction === 'EMERGENCY'` (66–70), (4) fallback `closedDuration >= 8.0` giây (73–77).
  - `useEffect` timer (80–92): Đếm `callTimer` mỗi `1000ms` khi đang gọi.
  - `handleSelectContact(contact)` (94–98), `handleConfirmCall()` (100–102), `handleCancelCall()` (104–110), `formatTimer(seconds)` (112–116).

### 3.5. `EntertainmentPage.tsx`
- **`EntertainmentPage({ onBack })`** ([`EntertainmentPage.tsx:20-340`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/EntertainmentPage.tsx#L20-L340)):
  - `handleCategoryChange(mode)` (34–40): Chuyển `'books' | 'radio' | 'music'`, xóa kết quả và video đang phát.
  - `handleKeyPress(item)` (43–57): Cập nhật `searchQuery` bằng Telex; chỉ tìm kiếm khi nhận `SEND`.
  - `handleExecuteSearch(overrideQuery)` (60–106): Chặn truy vấn rỗng (đọc TTS nhắc nhập), chống gọi trùng khi `isLoading`, phát `"Đang tìm ..."`, gọi `searchEntertainment(queryToSearch, activeCategory)`, xử lý lỗi/quota.
  - `handleSelectVideo(video)` (109–111): Gán `selectedVideo` để mở `YouTubePlayerView`.

### 3.6. `LocationPage.tsx`
- **`LocationPage({ onBack })`** ([`LocationPage.tsx:23-194`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/LocationPage.tsx#L23-L194)):
  - Dùng `useGeolocation(true)` theo dõi GPS.
  - `handleRefresh()` (43–46): Gọi `refreshLocation()` + TTS `"Đang định vị lại vị trí GPS"`.
  - `handleShareLocation()` (48–52): Bật `shareSuccess` 3 giây + TTS `"Đã chia sẻ vị trí an toàn hiện tại tới người thân"`.

### 3.7. `ContactsPage.tsx`
- **`ContactsPage({ onBack, onOpenChat })`** ([`ContactsPage.tsx:31-402`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/ContactsPage.tsx#L31-L402)):
  - `loadContactsData()` (47–69): Tải song song `friendService.getFriends()` và `friendService.getIncomingRequests()`.
  - `handleSelectFriend(friend)` (75–79): Lưu `selectedFriend`, mở `Modal` (`scopeId="contact-action-modal"`), đọc `"Liên lạc với ..."`.
  - `getInitials(name)` (81–86): Lấy 2 chữ cái viết tắt từ tên.

### 3.8. `HumanChatPage.tsx`
- **`HumanChatPage({ friend, onBack })`** ([`HumanChatPage.tsx:26-335`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/HumanChatPage.tsx#L26-L335)):
  - `initChat()` trong `useEffect` (42–61): Gọi `chatService.getOrCreateConversation(friend.id)` và lấy 50 tin nhắn gần nhất.
  - Realtime `useEffect` (64–78): Subscribe `chatService.subscribeToMessages()`, chống trùng tin nhắn theo `id`.
  - `handleSend()` (85–115): Chèn optimistic message (`status: 'sending'`), gọi `chatService.sendMessage()`, cập nhật `'sent'` hoặc `'failed'`.
  - `handleKeyPress(item)` (117–139), `getInitials(name)` (141–146), `formatTime(isoString)` (148–155).

### 3.9. `SettingsPage.tsx` & `AuthPage.tsx`
- **`SettingsPage({ onBack })`** ([`SettingsPage.tsx:38-987`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/SettingsPage.tsx#L38-L987)):
  - `handleStartEditName()` (89–92) & `handleSaveName()` (94–107): Cập nhật tên hiển thị qua `updateDisplayName()`.
  - `handleSelectAccountType(targetType)` (109–113) & `handleConfirmAccountTypeChange()` (115–141): Đổi `impaired <-> patient`; nếu chuyển sang `'patient'` thì gọi `setEyeControlEnabled(false)`.
  - `handleUpdatePassword(e)` (143–180): Validate >= 6 ký tự & khớp mật khẩu rồi gọi `supabase.auth.updateUser({ password })`.
  - `handleTestSpeaker()` (182–189), `handleDecreaseVolume()` (191–195), `handleIncreaseVolume()` (197–201), `handleDecreaseRate()` (203–207), `handleIncreaseRate()` (209–213).
- **`AuthPage({ initialMode, onLoginSuccess })`** ([`AuthPage.tsx:9-23`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/AuthPage.tsx#L9-L23)): Đồng bộ `mode` với `initialMode` và render `AuthStage`.

---

## 4. Các Component UI & Legacy Dashboard

- **`PageHeader`** (`PageHeader.tsx:19-142`): Chứa `handleHelpClick()` mở `OnboardingModal` hoặc `onOpenHelp()`, render nút Back, toggle `EYE MODE ON/OFF` (chỉ khi `!isPatient`), Help, Settings, và `<KeyboardHudSlot />`.
- **`AppButton`** (`AppButton.tsx:18-67`), **`FeatureCard`** (`FeatureCard.tsx:18-67`), **`SpeakHeroCard`** (`SpeakHeroCard.tsx:12-63`), **`SosHeroCard`** (`SosHeroCard.tsx:12-58`): Các component UI bọc `EyeFocusable`.
- **`Modal`** (`Modal.tsx:18-98`): Tính `modalScopeId`, `useEffect` gọi `pushFocusScope` + `registerEscapeHandler` khi mở và `popFocusScope` khi đóng, bọc children trong `EyeFocusScopeContext.Provider`.
- **`Avatar3D`** (`Avatar3D.tsx:15-86`): Render linh vật EYEAI dạng inline hoặc floating góc phải dưới.
- **`AudioUnlockBanner`** (`AudioUnlockBanner.tsx:6-69`): Gắn listener `pointerdown/touchstart/click` gọi `unlockAudio()` + `recoverAudioSession()`, nút `handleEnableClick` bật loa và phát chào mừng.
- **`OnboardingModal`** (`OnboardingModal.tsx:33-477`): `handleNext`, `handlePrev`, `handleCloseModal` điều khiển 3 slide hướng dẫn.
- **`SplashScreen`** (`SplashScreen.tsx:15-245`): `handleContinue()` fade out `350ms` gọi `onSplashFinished()`, `attemptPlay()` chạy video `/login.mp4`, `handleVideoError()` bật gradient fallback.
- **`BackgroundVideo`** (`BackgroundVideo.tsx:6-145`): Chuyển đổi mượt crossfade `800ms` giữa 2 thẻ `<video>` (`A` và `B`) mỗi `150ms` kiểm tra gần cuối video, lazy-load buffer B sau `2000ms`.
- **`ErrorBoundary`** (`ErrorBoundary.tsx:13-63`): `getDerivedStateFromError`, `componentDidCatch`, `handleReset()` (reload trang).
- **`StatusBadge`** (`StatusBadge.tsx:9-28`): Hiển thị badge trạng thái camera.
- **`MessageBubble`** (`MessageBubble.tsx:12-72`): Có `handleSpeak()` đọc lại tin nhắn.
- **`FriendRequestsModal`** (`FriendRequestsModal.tsx:15-170`): `loadRequests`, `handleAccept`, `handleReject`, `getInitials`.
- **`FriendSearchModal`** (`FriendSearchModal.tsx:21-335`): `performSearch` (debounce `350ms`), `handleKeyPress`, `handleBackspace`, `handleClear`, `handleSendRequest`, `handleAcceptRequest`, `handleRejectRequest`, `getInitials`.
- **`EyeTalkDashboard`** (`EyeTalkDashboard.tsx:15-1428`): Dashboard độc lập v2.1 gồm `handleKeyDown`, `navigateCursor` (có wrap-around modulo), `triggerSelection`, `sendToGemini`, `toggleCamera`, `stopTrackingLoop`, `startTrackingLoop`, `startCalibration`, `collectCalibrationPoints` (lưu tạm vào `sessionStorage`), `processFaceMeshResults` (1/2/3 chớp `700ms`).
