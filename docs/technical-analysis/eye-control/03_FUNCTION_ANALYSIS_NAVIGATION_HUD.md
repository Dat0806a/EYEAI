# 03 (PHẦN 2). PHÂN TÍCH CHI TIẾT TỪNG HÀM — NAVIGATION, OVERLAY, HUB & HUD

Tài liệu này tiếp nối [`03_FUNCTION_ANALYSIS.md`](./03_FUNCTION_ANALYSIS.md), phân tích toàn bộ hàm, hook và component thuộc tầng điều hướng UI và hiển thị camera/HUD.

---

## 1. File `src/modules/eye-control/EyeNavigationProvider.tsx`

### 1.1. `sortNodesByVisualOrder(nodes)`
- **Vị trí**: [`EyeNavigationProvider.tsx:26-52`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeNavigationProvider.tsx#L26-L52)
- **Signature**: `function sortNodesByVisualOrder(nodes: EyeFocusNode[]): EyeFocusNode[]`
- **Mục đích**: Sắp xếp danh sách node focusable theo thứ tự đọc trực quan 2D (từ trên xuống dưới, trái sang phải).
- **Logic**:
  1. Nếu cả 2 node có `row` và `col` tường minh: so sánh `row`, bằng nhau thì so sánh `col`.
  2. Ngược lại lấy `getBoundingClientRect()`: nếu `|rectA.top - rectB.top| > 10` (sai số cùng dòng 10px), so sánh `top`; ngược lại so sánh `left`.
  3. Fallback nếu kích thước 0: dùng `compareDocumentPosition` theo thứ tự DOM.
- **Độ phức tạp**: $O(N \log N)$ theo số node trong scope.

### 1.2. `EyeNavigationProvider({ children })` (dòng 54–598) & `useEyeNavigationContext()` (dòng 600–604)

Các hàm và effects bên trong `EyeNavigationProvider`:
1. **`registerEscapeHandler(handler)`** (71–76): Đẩy handler vào `escapeHandlersRef.current`, trả về hàm cleanup lọc bỏ handler. Được `Modal.tsx:39` gọi.
2. **Sync Effect `activeFocusIdRef`** (79–81): Giữ ref luôn đồng bộ với state `activeFocusId`.
3. **`getScopedCandidates(scopeId)`** (86–92): Trả các node có `n.scopeId === scopeId` (nếu `scopeId` truthy) hoặc `!n.scopeId` (global scope).
4. **`pushFocusScope(scopeId, initialFocusId)`** (98–131):
   - Lưu `activeFocusIdRef.current` hiện tại vào `previousFocusByScopeRef.current` nếu đang chuyển sang scope mới.
   - Đẩy `scopeId` lên đỉnh `scopeStackRef`, cập nhật `activeScopeId`.
   - Nếu `initialFocusId` hợp lệ và thuộc `scopeId` → focus ngay; ngược lại lấy phần tử đầu tiên của `sortNodesByVisualOrder(scopedNodes)`.
5. **`popFocusScope(scopeId)`** (136–177):
   - Lấy `prevFocusId` đã lưu và xóa khỏi `previousFocusByScopeRef`.
   - Gỡ `scopeId` khỏi `scopeStackRef`, xác định `nextScope` mới trên đỉnh stack.
   - Khôi phục `activeFocusId` theo 4 mức ưu tiên: (1) `prevFocusId` nếu vẫn tồn tại và khớp `nextScope` → (2) nếu không còn node nào trong `nextScope` trả `null` → (3) nếu `currentId` hiện tại hợp lệ với `nextScope` giữ nguyên → (4) chọn phần tử đầu theo `sortNodesByVisualOrder`.
6. **`registerFocusNode(node)`** (179–223):
   - Ghi/cập nhật `node` vào `nodesRef`.
   - Nếu `node` thuộc scope hiện hành (`nodeMatchesScope`): tự động đặt `activeFocusId` thành `node.id` nếu chưa có focus, focus trước không còn tồn tại, focus trước không khớp scope hiện tại, hoặc đặc biệt khi `node.id === 'card-speak' && !currentScope` (ưu tiên mặc định thẻ Nói chuyện trên HomePage).
7. **`unregisterFocusNode(id)`** (225–260):
   - Xóa `id` khỏi `nodesRef`. Nếu nút vừa xóa đang được focus (`prev === id`), tìm nút thay thế cùng scope: ưu tiên nút cùng `groupId` (ví dụ giữ tiêu điểm trong bàn phím ảo khi đổi layout), nếu không có chọn nút đầu theo `sortNodesByVisualOrder`.
8. **`setFocusId(id)`** (262–274): Chỉ cập nhật focus nếu `id` có trong `nodesRef` và khớp scope hiện hành.
9. **`navigate(direction)`** (276–438) — **Thuật toán điều hướng 2 pha**:
   - Bỏ qua `NONE`, `SELECT`, `ESCAPE`, `DOUBLE_BLINK` (`return false`).
   - Lọc `scopedCandidates` thỏa mãn khớp scope, `element.isConnected`, `rect.width > 0 && rect.height > 0`.
   - Nếu chưa có `currentId` hợp lệ → focus vào phần tử đầu tiên, cuộn tới đó và trả `true`.
   - **Pha 1 (Grid `row, col`, dòng 309–363)**: Tìm trong các node cùng `groupId` có `row, col`: `RIGHT/NEXT` tìm `col` nhỏ nhất lớn hơn cùng hàng; `LEFT/BACK` tìm `col` lớn nhất nhỏ hơn cùng hàng; `DOWN` tìm hàng kế dưới gần nhất rồi chọn `col` gần nhất; `UP` tìm hàng kế trên gần nhất rồi chọn `col` gần nhất.
   - **Pha 2 (Spatial 2D, dòng 366–426)**: Tính tâm `currCenter` và các phần tử ứng viên. Lọc hướng theo hình nón (`dx > 4` và `overlapY > 0 || |dy| <= 2.2*dx` cho `RIGHT`, đối xứng cho 3 hướng còn lại), tính `score = overlap ? 0.6*d : d + 1.8*d_perp`, chọn `score` nhỏ nhất.
   - Nếu tìm thấy `targetNode.id !== currentId` → cập nhật `activeFocusId`, gọi `ensureEyeFocusVisible`, trả `true`. Đụng biên trả `false`.
10. **`triggerSelect()`** (440–477): Nếu chưa có focus, chọn phần tử đầu của scope; nếu node hợp lệ với scope, gọi `node.onSelect()` (hoặc fallback `node.element.click()`), trả `true`.
11. **`triggerEscape()`** (479–515): Chuỗi 4 bước: (1) gọi top `escapeHandlersRef` nếu trả về không phải `false` → (2) pop `scopeStackRef` nếu đang trong modal → (3) tìm & `.click()` các nút Back (`#btn-header-back`, `#btn-speak-back`, `#btn-ai-back`, `#btn-chat-back`, `#btn-player-back`, `[data-eye-back="true"]`) → (4) phát `CustomEvent('eyeai:escape')`.
12. **`ensureFocusVisible(id)`** (517–522), **Auto-Follow `useEffect`** (525–533), **Resize `useEffect` (`handleResize`)** (536–545): Tự động gọi `ensureEyeFocusVisible` qua `requestAnimationFrame` khi focus/bàn phím/kích thước cửa sổ thay đổi.
13. **Gesture Subscription `useEffect`** (548–563): Đăng ký callback vào `EyeTrackingProvider`: `EMERGENCY` → phát `eyeai:emergency` và trả `true`; `SELECT` → `triggerSelect()`; `ESCAPE | DOUBLE_BLINK` → `triggerEscape()`; còn lại → `navigate(action)`.

---

## 2. `useEyeNavigation.ts`, `EyeFocusScopeContext.ts`, `EyeFocusRing.tsx`

- **`useEyeNavigation()`** ([`useEyeNavigation.ts:3-5`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/useEyeNavigation.ts#L3-L5)): Trả về `useEyeNavigationContext()`.
- **`useEyeFocusScope()`** ([`EyeFocusScopeContext.ts:9-11`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeFocusScopeContext.ts#L9-L11)): Đọc `EyeFocusScopeContext` (`string | null`).
- **`EyeFocusRing({ visible, className })`** ([`EyeFocusRing.tsx:9-27`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeFocusRing.tsx#L9-L27)): Render `motion.div` vòng sáng nếu `visible === true` (hiện không được import ở bất kỳ file nào).

---

## 3. File `src/modules/eye-control/EyeFocusable.tsx`

### 3.1. `EyeFocusable(props)` (dòng 22–198, bọc `React.memo`)
- **State/Refs**: `elementRef`, `isSelecting`, `onSelectRef`, `speakLabelRef`, `lastSelectTimeRef`.
- **`isFocused`**: `settings.eyeControlEnabled && activeFocusId === id`.
- **Các hàm & effects bên trong**:
  1. **`getVoiceText()`** (55–82): Ưu tiên trích xuất văn bản đọc TTS theo thứ tự: `speakLabel` prop → `aria-label` → `title` → dòng đầu tiên không rỗng của `innerText/textContent` (xóa các emoji Unicode bằng regex và cắt tối đa 40 ký tự).
  2. **`handleSelect(e)`** (86–106): Gọi `e.stopPropagation()`. Chống dội bấm đúp trong `350ms` (`lastSelectTimeRef`). Đặt `setFocusId(id)`, bật flash `isSelecting` trong `180ms`, gọi `speakVietnamese("Đã chọn " + text)` và thực thi `onSelectRef.current()`.
  3. **Voice Announce `useEffect`** (109–119): Khi `isFocused` chuyển sang `true`, chờ `100ms` (tránh đọc đè khi lướt nhanh) rồi gọi `speakVietnamese(text)`.
  4. **Registration `useEffect`** (121–137): Khi mount hoặc props định vị (`id, groupId, effectiveScopeId, row, col`) đổi, gọi `registerFocusNode(...)`; cleanup gọi `unregisterFocusNode(id)`.
  5. **Render**: Render `<Component>` (`div` mặc định) với `tabIndex={0}`, `onClick={handleSelect}`, `onFocus={() => setFocusId(id)}`, vòng phát sáng `motion.div` (`layoutId="eye-focus-glide-ring"`) và lớp flash khi chọn.

---

## 4. File `src/modules/eye-control/eyeFocusAutoScroll.ts`

### 4.1. `getTopOccupiedHeight()` (dòng 14–47)
- Đo chiều cao bị che phía trên viewport bởi: `<header>` (nếu `top <= 12`), các phần tử `.sticky.top-0` / `fixed top-0`, và `#keyboard-eye-hud-bar`. Trả về `topOccupied` (pixel).

### 4.2. `getBottomOccupiedHeight()` (dòng 53–88)
- Đo chiều cao bị che phía dưới viewport bởi: `#smartphone-virtual-keyboard`, biến CSS `--virtual-keyboard-height`, và các thanh `[class*="fixed bottom-0"]` nằm ở nửa dưới màn hình.

### 4.3. `findScrollContainer(element)` (dòng 94–118)
- Duyệt ngược `element.parentElement` tới `body`, kiểm tra `getComputedStyle` có `overflowY/X` là `auto|scroll|overlay` và `scrollHeight > clientHeight + 4` (hoặc `scrollWidth`). Trả container cuộn gần nhất hoặc `null`.

### 4.4. `ensureEyeFocusVisible(focusId, nodesMap, options)` (dòng 130–276)
- **Logic từng bước**:
  1. Tìm DOM element từ `nodesMap` hoặc `document.getElementById('eye-focusable-' + focusId)`. Thoát nếu mất kết nối DOM hoặc kích thước `0×0`.
  2. **Luật Bàn phím ảo** (161–167): Nếu `node?.groupId === 'virtual-keyboard'` hoặc `element.closest('#smartphone-virtual-keyboard')`, thoát ngay (không cuộn trang).
  3. Kiểm tra `prefers-reduced-motion` chọn `behavior: 'auto' | 'smooth'`.
  4. Tính `SAFE_MARGIN_TOP = max(topOccupied + 20, 24)` và `SAFE_MARGIN_BOTTOM = max(viewportHeight - bottomOccupied - 20, SAFE_MARGIN_TOP + 60)`, cùng `FOCUS_RING_BUFFER = 18`.
  5. Nếu có `scrollContainer`: tính `containerDeltaY/X` với padding `14px` và gọi `scrollContainer.scrollBy(...)`.
  6. Tính `windowDeltaY/X` (nếu phần tử cao hơn vùng an toàn thì căn mép trên về `SAFE_MARGIN_TOP + 4`). Chỉ gọi `window.scrollBy` khi `|delta| > 2px` để tránh rung giật.

---

## 5. Camera Preview, Overlay, Hub, Visualizer & Global HUD

### 5.1. `src/modules/eye-control/CameraPreview.tsx`
- **`CameraPreview` (memo, dòng 13–133)**:
  - `useEffect` (24–45): Đồng bộ `cameraStream` vào `videoRef.current.srcObject`, tắt tiếng (`muted`, `volume=0`) và gọi `video.play()`.
  - `useEffect` + `syncProcessedPreview()` (50–85): Khi `settings.lowLightFilterEnabled && trackingState.cameraActive`, chạy vòng `requestAnimationFrame` copy ảnh từ `processedCanvasRef.current` sang `previewCanvasRef.current` và bật `opacity = '1'`. Khi tắt thì xóa canvas và ẩn.

### 5.2. `src/modules/eye-control/LiveCameraOverlay.tsx`
- **`LiveCameraOverlay` (memo, dòng 24–249)** + các hàm nội bộ trong `render()` (36–234):
  - Đồng bộ kích thước canvas theo `getBoundingClientRect()` × `dpr` (tối đa 2).
  - Đọc `window.__eyeai_latest_landmarks`.
  - `project(pt)` (90–99): Ánh xạ tọa độ chuẩn hóa `[0, 1]` khớp chính xác CSS `object-fit: cover` (`scale = max(displayW/vidW, displayH/vidH)`) và lật gương `1 - pt.x` nếu `mirrored`.
  - Nếu `overlaySettings.showMesh`: vẽ `FACIAL_TESSELLATION_LINES` và `drawContour` cho `FACE_OVAL`, mũi, môi, 2 lông mày.
  - Nếu `overlaySettings.showEyes`: gọi `drawClosedContour` cho 2 vòng mắt (kèm `shadowBlur = 4`) và vẽ 4 ô vuông khóe mắt (`canthiIndices`).
  - Nếu `overlaySettings.showIris`: gọi `drawIrisRing` cho viền mống mắt và `drawPupilDot` vẽ điểm tâm `468`, `473`.

### 5.3. `src/modules/eye-control/CameraHub.tsx`
- **`CameraHub` (memo, dòng 38–734)**:
  - `handleToggleLowLight()` (61–63): Đảo `settings.lowLightFilterEnabled`.
  - `tick()` trong `useEffect` (70–78): Vòng `requestAnimationFrame` cập nhật `nowTime` mỗi frame để tính màu/trạng thái badge.
  - `getBadgeState(action)` (107–130): Trả `'ACTIVE'` nếu vừa thực thi `< 420ms`, `'COOLDOWN'` nếu đang trong cooldown, ngược lại `'IDLE'`.
  - Render 4 khu vực: Overlay 5-Point Calibration, `CameraPreview` + Counter Chớp `0/3` + Gaze Badge + Toggles lớp, nút `EyeFocusable` Hỗ trợ thiếu sáng, lưới 6 nút lệnh gọi `triggerManualAction`, Cooldown bar, EAR Telemetry gauge và panel `DEBUG TELEMETRY` (có nút `resetCalibration`).

### 5.4. `src/modules/eye-control/FaceMeshVisualizer.tsx`
- **`FaceMeshVisualizer` (memo, dòng 22–518)**:
  - `handlePointerDown` (45–54), `handlePointerMove` (56–63), `handlePointerUp` (65–72): Xử lý kéo chuột/cảm ứng xoay góc nhìn `orbitRotY` và `orbitRotX` (kẹp `[-0.8, 0.8]` rad).
  - `handleResetOrbit()` (74–77): Đặt lại `(0, 0)`.
  - `renderLoop()` (88–259): Vẽ lưới nền, đọc `window.__eyeai_latest_landmarks`, dùng hàm nội bộ `project3D(pt)` xoay quanh đỉnh mũi `landmarks[1]` bằng ma trận quay trục $Y$ rồi trục $X$ và phép chiếu phối cảnh `factor = 1.6 / (1.6 + z2 * 2.2)` (hoặc chiếu 2D nếu `!is3DMode`), sau đó gọi `drawContour` cho mặt, mắt, mống mắt và tâm đồng tử.

### 5.5. `src/components/ui/GlobalEyeHUD.tsx` & `KeyboardHudSlot.tsx`
- **`GlobalEyeHUD` (memo, dòng 14–325)**:
  - Kiểm tra ẩn hoàn toàn nếu `profile?.account_type === 'patient'` hoặc route là `patient-*` / `auth` / `login` / `register`.
  - Tự tính `shouldRenderLongBar = (currentRoute === 'chat' || currentRoute === 'ai' || isKeyboardOpen)` và chọn `mode = 'keyboard-bar' | 'floating'`.
  - Khi `!settings.eyeControlEnabled` ở chế độ `floating`: render nút nổi `"Bật Camera HUD"` ở góc dưới trái.
  - Khi bật: render thanh `keyboard-bar` (`#keyboard-eye-hud-bar`) hoặc pill nổi (`#global-eye-hud-floating`) kèm nút mở rộng `CameraHub`, nút mở `FaceMeshVisualizer`, nút tắt camera (`setEyeControlEnabled(false)`).
- **`KeyboardHudSlot({ currentRoute })`** ([`KeyboardHudSlot.tsx:13-15`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/components/ui/KeyboardHudSlot.tsx#L13-L15)): Trả về `<GlobalEyeHUD variant="keyboard-bar" currentRoute={currentRoute} />`.
