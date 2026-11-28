# 03 (PHẦN 4). PHÂN TÍCH CHI TIẾT TỪNG HÀM — SPEECH, CALLS, SERVICES & BACKEND

Tài liệu này hoàn tất phần phân tích hàm cho các module âm thanh, gọi thoại WebRTC, YouTube, bản đồ GPS, dịch vụ dữ liệu và backend proxy.

---

## 1. Hệ thống Giọng nói TTS (`src/utils/speech.ts`)

- **`loadInitialSpeechSettings()`** (36–52): Đọc cấu hình loa (`speakerEnabled`, `speechVolume`, `speechRate`) từ `localStorage` an toàn với SSR/exception.
- **`getSpeechSettings()`** (56–58): Trả bản sao `currentSpeechSettings`.
- **`updateSpeechSettings(newSettings)`** (60–85): Cập nhật cấu hình, lưu `localStorage`, phát `CustomEvent('eyetalk:speech-settings-changed')`; nếu chuyển từ bật sang tắt loa thì gọi `stopSpeech()`.
- **`loadVoices()`** (87–98): Nạp danh sách `speechSynthesis.getVoices()` vào `cachedVoices`.
- **`isVietnameseVoice(v)`** (111–129): Kiểm tra nghiêm ngặt `lang === 'vi' || lang.startsWith('vi-')` hoặc tên chứa `'vietnam'`, `'tiếng việt'`, `'hoaimy'`, `'namminh'`, `'linh'`.
- **`getVietnameseVoice()`** (131–136): Trả giọng tiếng Việt đầu tiên tìm được.
- **`hasNativeVietnameseSpeech()`** (144–148): Trả `true` nếu là iOS (`isIOS`) hoặc tìm thấy `getVietnameseVoice() !== null` (Edge, Android).
- **`isSpeechSupported()`** (150–152): Luôn trả `true` nhờ đường dự phòng online `/api/tts`.
- **`cleanTextForSpeech(text)`** (154–165): Loại bỏ code block, markdown `**`, heading `#`, link `[text](url)`, thay xuống dòng bằng `. `.
- **`getGlobalAudioContext()`** (167–180) & **`getSharedAudioElement()`** (182–205): Khởi tạo singleton `AudioContext` và `<audio id="eyetalk-shared-audio">` (gắn `playsinline`, `referrerpolicy="no-referrer"`).
- **`recoverAudioSession()`** (211–234): Gọi `ctx.resume()` nếu `AudioContext` bị `suspended/interrupted` và `speechSynthesis.resume()` nếu bị tạm dừng (dùng sau khi bật/tắt camera).
- **`unlockAudio()`** (239–311): Phát buffer Web Audio im lặng 1 sample (`22050Hz`), phát `SILENT_WAV_BASE64` trên `HTMLAudioElement`, và trên iOS đẩy 1 `SpeechSynthesisUtterance(' ')` âm lượng `0.01` để mở khóa âm thanh từ cử chỉ chạm đầu tiên.
- **`handleUserInteraction()`** (315–321): Listener toàn cục trên `pointerdown/touchstart/click/keydown` tự động gọi `unlockAudio()` hoặc `recoverAudioSession()`.
- **`stopSpeech()`** (332–384): Tăng `currentPlaybackSession`, hủy `currentFetchController.abort()`, dừng `currentAudioSource`, tạm dừng `sharedAudioElement`, hủy `speechSynthesis` (chỉ khi `speaking || pending`) và xóa `activeUtterances`.
- **`isSpeaking()`** (386–391): Trả `true` nếu `speechSynthesis.speaking` hoặc `isPlayingAudio`.
- **`speakNative(text, options)`** (397–455): Tạo `SpeechSynthesisUtterance` (`lang: 'vi-VN'`), gắn giọng tiếng Việt, lưu vào `activeUtterances` chống bị WebKit GC thu hồi trên iOS, gọi `speechSynthesis.speak()`.
- **`splitTextIntoChunks(text, maxLen = 150)`** (460–491): Tách văn bản dài theo dấu câu (`.!?; \n`) hoặc theo từ thành các đoạn $\le 150$ ký tự.
- **`playAudioBuffer(ctx, buffer, volume, rate, sessionId)`** (496–534): Phát `AudioBuffer` qua `AudioBufferSourceNode` + `GainNode`, kiểm tra `sessionId` để dừng nếu có câu mới chen vào.
- **`playSingleChunkOnline(chunk, volume, rate, sessionId)`** (540–655): Chiến lược 3 tầng cho Chrome Desktop: (1) RAM `audioBufferCache`, (2) `fetch('/api/tts?text=...')` kèm `AbortController` + validate Content-Type + `decodeAudioData` (cache tối đa 60 mục), (3) fallback phát qua `sharedAudioElement`.
- **`playOnlineTTS(text, options)`** (660–689): Tạo `sessionId`, chia chunks và phát tuần tự từng chunk.
- **`speakVietnamese(text, options)`** (696–737): Điểm vào chính — kiểm tra `speakerEnabled`, làm sạch text, `recoverAudioSession()`, `stopSpeech()`, rồi chọn `speakNative` hoặc `playOnlineTTS`.

---

## 2. Module Gọi Thoại WebRTC (`src/modules/calls/`)

### 2.1. `CallProvider.tsx`
- **`CallProvider({ children })`** (30–545):
  - `getWebRTCService()` (70–115): Khởi tạo singleton `WebRTCService` với 3 callback (`onIceCandidate`, `onRemoteStream`, `onConnectionStateChange` xử lý `connected -> 'accepted'`, `failed`, `disconnected -> handleCleanup()`).
  - `handleRoomSignaling(payload)` (120–161): Xử lý `call:accept`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `call:decline/hangup`.
  - Global `useEffect` (164–206): Lắng nghe `user_signaling_${userId}`; khi nhận `call:ring`, nếu đang bận (`callState !== 'idle'`) trả `call:decline` (`busy`), ngược lại đặt `callState('ringing')`, đọc TTS và vào `call_room_${callId}`.
  - `startConnectTimeout()` (211–220): Timeout `20000ms` nếu kẹt ở `'connecting'`.
  - `acquireMediaStream(type)` (225–247): Chỉ gọi `getUserMedia({ audio: true, video: false })` để bảo toàn camera cho Eye Tracking.
  - `startCall(...)` (252–345): Tạo bản ghi bảng `calls` trên Supabase, vào room, gửi `call:ring`, lấy mic, tạo SDP Offer và gửi `webrtc:offer`, đặt timeout đổ chuông `30000ms`.
  - `acceptCall()` (350–395): Cập nhật DB `'accepted'`, lấy mic, gửi `call:accept`, tạo và gửi SDP Answer cho `pendingOfferRef`.
  - `declineCall()` (400–421) & `endCall()` (426–449): Cập nhật DB, gửi `call:decline` / `call:hangup` và dọn dẹp.
  - `toggleMute()` (451–459) & `toggleCamera()` (461–468): Đảo `track.enabled`.
  - `handleCleanup()` (473–507): Hủy timer, thoát room channel, **chỉ dừng track trong `callTracksToStopRef`**, đóng `WebRTCService` và reset state.
- **`useCall()`** (547–551): Đọc `CallContext`.
- **`CallOverlayModal(...)`** (556–737): Giao diện toàn màn hình phát `remoteStream` qua thẻ `<audio>` ẩn, hiển thị các nút `AppButton` (`EyeFocusable`) cho nhận/từ chối/tắt mic/kết thúc cuộc gọi.

### 2.2. `signalingService.ts`
- `subscribeToUserSignaling(userId, onSignaling)` (9–33): Subscribe channel `user_signaling_${userId}`.
- `sendUserSignal(targetUserId, payload)` (38–64): Subscribe tạm tới channel người nhận, broadcast `webrtc_signal` và tự gỡ channel sau 1s.
- `joinCallRoom(callId, onSignaling)` (69–93) & `sendToCallRoom(channel, payload)` (98–116): Tham gia và broadcast tín hiệu trong `call_room_${callId}`.

### 2.3. `webrtcService.ts`
- **`WebRTCService`** (9–266): `constructor`, `initPeerConnection()` (cấu hình STUN Google & TURN tùy chọn qua env, gắn `onicecandidate`, `ontrack`, `onconnectionstatechange`), `addLocalStream()`, `createOffer()`, `createAnswer()`, `handleAnswer()`, `addIceCandidate()` (đệm `candidateBuffer` nếu chưa có `remoteDescription`), `flushCandidateBuffer()`, `dumpWebRTCState()`, `getRtpStats()`, `close()`.

---

## 3. Giải trí YouTube & Bản đồ GPS

### 3.1. `src/modules/entertainment/YouTubePlayerView.tsx`
- `useEffect` (41–100) & `initYTPlayer()` (44–72): Nạp `https://www.youtube.com/iframe_api` và gắn `YT.Player` vào iframe.
- `useEffect` progress (103–120): Polling `getCurrentTime()` và `getDuration()` mỗi `1000ms`.
- `sendPostMessage(func, args)` (122–133): Gửi lệnh dự phòng qua `iframe.contentWindow.postMessage`.
- `handleTogglePlayPause()` (135–151), `handleSeek(seconds)` (153–172), `handleVolumeChange(delta)` (174–189), `handleToggleMute()` (191–205), `formatTime(timeInSec)` (207–219). Tất cả các nút bấm đều bọc `EyeFocusable` và có phản hồi giọng nói TTS.

### 3.2. `src/modules/location/`
- `GoogleMapView.tsx`: `initMap()` (47–107), `handleRecenter()` (147–154), `handleZoomIn()` (156–162), `handleZoomOut()` (164–170) — fallback sang `<iframe>` Google Maps Embed nếu thiếu `VITE_GOOGLE_MAPS_API_KEY` hoặc gặp `window.gm_authFailure`.
- `useGeolocation.ts`: `useGeolocation(enableWatch)` (31–149) chứa `requestLocation()`, `handleSuccess()`, `handleError()`, sử dụng `getCurrentPosition` + `watchPosition` (chỉ cập nhật state khi dịch chuyển $\ge 0.00005^\circ$ để tránh re-render liên tục).
- `mapLoader.ts`: `loadGoogleMaps(apiKey)` (6–17) nạp thư viện `'maps'` một lần theo API key.
- `CustomOverlayMarker.ts`: `createCustomOverlayMarker(map, position, props)` (16–122) định nghĩa class mở rộng `google.maps.OverlayView` (`renderContent`, `onAdd`, `draw`, `setPosition`, `updateProps`, `onRemove`) và tắt animation radar khi `isEyeMode === true`.

---

## 4. Dịch vụ, Auth, Tutorial & Backend Proxy

- **`src/hooks/useAuth.ts`**: `useAuth()` (16–173) chứa `fetchProfile(userId, currentUser)` (đọc bảng `profiles` hoặc `user_metadata`, chuẩn hóa `account_type` thành `'patient' | 'impaired'`), `updateAccountType(newType)`, `updateDisplayName(newName)`, `signOut()`.
- **`src/context/TutorialContext.tsx`**: `TutorialProvider` (`openTutorial`, `closeTutorial`) và `useTutorial()` (trả fallback no-op nếu dùng ngoài provider).
- **`src/types/account.ts`**: `getAccountTypeLabel(accountType)` (8–13).
- **`src/services/preloadManager.ts`**: Class `PreloadManager` với `registerDefaultTasks()` (10 tác vụ), `addTask()`, `subscribe()`, `notify()`, `startPreload()` và singleton `preloadManager`.
- **`src/services/videoCacheManager.ts`**: Class `VideoCacheManager` với `getVersionedUrl()`, `preloadVideo()` (fetch thành Blob URL + warm-up `<video>`), `getCachedVideoUrl()`, `clearCache()`, `preloadLoginRegisterVideo()`, `preloadBgVideo()`.
- **`src/services/entertainmentService.ts`**: `buildModeQuery()`, `decodeHtmlEntities()`, `searchYouTubeDirect()`, `searchEntertainment()` (ưu tiên `/api/entertainment/search`, fallback YouTube REST).
- **`src/services/chat/chatService.ts`**: `getOrCreateConversation()`, `getMessages()`, `sendMessage()`, `subscribeToMessages()` (đều thử Supabase RPC trước rồi fallback truy vấn bảng trực tiếp).
- **`src/services/friends/friendService.ts`**: `getFriends()`, `getIncomingRequests()`, `searchUsers()`, `sendFriendRequest()`, `acceptFriendRequest()`, `rejectFriendRequest()`, `cancelFriendRequest()` (RPC + fallback query).
- **`server.ts`**: `startServer()` (12–207) với `handleAiChat()` (`/api/ai/chat`, `/api/gemini/chat`), `/api/entertainment/search`, `/api/tts` (proxy `translate.google.com/translate_tts` kèm `Cache-Control: max-age=604800`), và Vite/static middleware.
- **`netlify/functions/ai-chat.ts`**: `getApiKey()`, `processChat(body)`, export `default` (Netlify V2) & `handler` (Netlify V1).
- **`netlify/functions/tts.ts`**: Export `default` (V2) & `handler` (V1) proxy `audio/mpeg` từ Google Translate TTS.
- **`server/youtubeBackend.ts`**: `buildModeQuery()`, `decodeHtmlEntities()`, `handleEntertainmentSearch()` (cache RAM `10 phút`, deduplicate `pendingRequests`, chuẩn hóa tối đa `10` kết quả và phân loại mã lỗi `YOUTUBE_API_KEY_MISSING`, `QUOTA_EXCEEDED`, `YOUTUBE_DATA_API_V3_ENABLE_REQUIRED`).
