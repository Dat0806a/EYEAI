# PHÂN TÍCH TỔNG THỂ DỰ ÁN EYEAI (EYETALK ASSISTANT)
## CHỨC NĂNG, MẶT KỸ THUẬT VÀ CÁC THUẬT TOÁN CỐT LÕI

> **Dự án**: EYEAI (EyeTalk Assistant) - Hệ thống giao tiếp thông minh & hỗ trợ y tế bằng cử chỉ mắt và Trợ lý AI dành cho người khuyết tật.  
> **Thời gian phân tích**: Tháng 8, 2026  
> **Tác giả báo cáo**: Antigravity AI Team  

---

## 1. TỔNG QUAN DỰ ÁN & ĐỊNH HƯỚNG SẢN PHẨM

### 1.1. Bối cảnh & Mục đích
**EYEAI (EyeTalk Assistant)** là ứng dụng web hỗ trợ truy cập y tế (Accessibility Web Application) cao cấp, được thiết kế đặc biệt nhằm giải quyết bài toán giao tiếp cho những bệnh nhân tổn thương chức năng vận động và phát âm nghiêm trọng. 
Đối tượng phục vụ chính bao gồm:
* Bệnh nhân mắc **Hội chứng Xơ cứng cột bên teo cơ (ALS)**.
* Bệnh nhân đột quỵ, tai biến mạch máu não bị liệt toàn thân hoặc mất khả năng nói (Aphasia).
* Người cao tuổi suy giảm thị lực, thính lực và khả năng vận động tay chân.

### 1.2. Triết lý Thiết kế Hệ thống
1. **Không tốn chi phí phần cứng chuyên dụng**: Tận dụng webcam thông thường trên máy tính/laptop hoặc camera trước của máy tính bảng/điện thoại thay vì các thiết bị theo dõi ánh mắt đắt đỏ (như Tobii Dynavox).
2. **Hệ thống điều hướng đa phương thức (Multi-modal Navigation)**: Kết hợp linh hoạt giữa **Cử chỉ mắt (Eye Tracking)**, **Bàn phím cơ giả lập (Keyboard Simulation)** và **Tương tác chạm/click truyền thống**.
3. **Phản hồi tức thì & Khả năng truy cập cực cao (Accessibility-First)**: Giao diện chữ cực đại (Font Scale), phối màu tương phản cao (High Contrast), hiệu ứng tô đậm vùng chọn (*Focus Ring*) và âm thanh phản hồi bằng giọng nói tiếng Việt cho mỗi hành động.

---

## 2. KIẾN TRÚC KỸ THUẬT & CÔNG NGHIỆP CỐT LÕI (TECH STACK)

```text
                               ┌─────────────────────────────────────────┐
                               │             USER INTERFACE              │
                               │   React 19 + TypeScript + Motion v12    │
                               │   TailwindCSS v4 + Lucide Icons + Audio │
                               └────────────────────┬────────────────────┘
                                                    │
                      ┌─────────────────────────────┼─────────────────────────────┐
                      ▼                             ▼                             ▼
         ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
         │ COMPUTER VISION ENGINE  │   │  EYE NAVIGATION SYSTEM  │   │   BACKEND API SERVER    │
         │  MediaPipe FaceMesh CDN │   │   2D Spatial Bounding   │   │  Express 4 + Node.js    │
         │ (468+ Face & Iris Mesh) │   │     Box Vector Cone     │   │ Gemini 3.5/3.6 Flash AI │
         └────────────┬────────────┘   └────────────┬────────────┘   └────────────┬────────────┘
                      │                             │                             │
                      └─────────────────────────────┼─────────────────────────────┘
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │           EXTERNAL SERVICES             │
                               │  Google Gemini API + YouTube Data API   │
                               │   Google Maps API + Web Speech API      │
                               │         Supabase PostgreSQL DB          │
                               └─────────────────────────────────────────┘
```

### 2.1. Front-End Architecture
* **Framework**: `React 19` kết hợp `TypeScript ~5.8` đảm bảo type-safety chặt chẽ.
* **Build Tool**: `Vite 6` giúp HMR (Hot Module Replacement) siêu tốc và đóng gói bundle tối ưu.
* **UI & Styling**: `TailwindCSS v4` (`@tailwindcss/vite`) cho hệ thống style responsive, dynamic token và dark/light visual.
* **Biểu tượng & Dynamic Animation**: `Lucide React` + `Motion v12` (Framer Motion) đảm bảo hiệu ứng chuyển cảnh mềm mại, chuyển đổi trang không bị giật khựng.

### 2.2. Back-End Proxy & AI Server (`server.ts`)
* **Runtime**: `Node.js` + `Express 4`.
* **AI Engine**: SDK `@google/genai` giao tiếp trực tiếp với **Google Gemini 3.5 Flash / 3.6 Flash**.
* **Cơ chế Fallback 4 tầng cho AI**: Hệ thống tự động chuyển đổi mô hình dự phòng khi gặp sự cố quota hoặc quá tải (`gemini-flash-latest` $\rightarrow$ `gemini-3.6-flash` $\rightarrow$ `gemini-flash-lite-latest` $\rightarrow$ `gemini-2.0-flash`).
* **YouTube Entertainment Service**: Express Server điều phối gọi YouTube Data API v3 để lấy video/audio theo ngữ cảnh, kết hợp cơ chế fallback trực tiếp ở Client khi triển khai trên các hạ tầng Static Host như Netlify/Vercel.

### 2.3. Computer Vision & Sensor Layer (`src/utils/eyeTracker.ts`, `EyeTrackingProvider.tsx`)
* **Core Vision Engine**: `MediaPipe FaceMesh` được nạp động từ CDN, nhận diện 468 mốc tọa độ khuôn mặt 3D và 10 mốc tọa độ mống mắt (Iris Landmarks 468 cho mắt trái & 473 cho mắt phải).
* **Luồng xử lý dữ liệu kép (Dual-tier Data Flow)**:
  * *High-Frequency Engine*: Chạy ở tốc độ 30–60 FPS thông qua `requestAnimationFrame` và React `useRef` nhằm tính toán độ đóng/mở mắt (EAR) và vị trí mống mắt (Iris) không gây re-render DOM.
  * *Low-Frequency Telemetry UI*: Giảm tần suất cập nhật UI xuống 8–12 FPS (mỗi 90ms) để tiết kiệm CPU/GPU cho thiết bị yếu.

### 2.4. Audio & Accessibility Layer
* **Web Speech API**: Tích hợp `window.speechSynthesis` hỗ trợ giọng đọc chuẩn tiếng Việt (`vi-VN`) phát biểu câu nói của người bệnh và câu hồi đáp của AI.
* **Audio Unlock Banner (`AudioUnlockBanner.tsx`)**: Giải quyết triệt để rào cản chặn tự động phát âm thanh (Autoplay Policy) trên trình duyệt Safari iOS bằng cách kích hoạt một Web Audio Context câm ngay từ cử chỉ chạm/nháy mắt đầu tiên.

---

## 3. PHÂN TÍCH CHI TIẾT TOÀN BỘ CÁC CHỨC NĂNG (FEATURE BREAKDOWN)

### 3.1. Chức năng Soạn thảo & Giao tiếp Tiếng Việt (Speak Page & Virtual Keyboard)
* **Bàn phím ảo Telex chuyên dụng (`VirtualKeyboard.tsx`)**: Bố cục ma trận các phím chữ cái, số, phím điều khiển (Xóa chữ, Xóa tất cả, Cách, Gửi) và cụm phím dấu tiếng Việt (`s`, `f`, `r`, `x`, `j`, `w`, `a`, `e`, `o`, `d`).
* **Cụm câu giao tiếp y tế / Cấp cứu nhanh**: Hàng nút chọn nhanh các nhu cầu thiết yếu (*"SOS Hỗ trợ tôi"*, *"Tôi đói bụng"*, *"Tôi khát nước"*, *"Đi vệ sinh"*, *"Tôi thấy đau"*, *"Cần bác sĩ"*, *"Muốn nghỉ ngơi"*).
* **Chuyển văn bản thành giọng nói (Text-to-Speech)**: Khi người dùng chọn nút **GỬI/ĐỌC**, hệ thống phát âm nội dung đã soạn thảo ra loa ngoài với âm lượng lớn.

### 3.2. Chức năng Trợ lý AI Y tế (Ai Page & Gemini AI Proxy)
* **Trò chuyện y tế thông minh**: Người bệnh soạn tin nhắn bằng mắt và gửi tới AI Trợ lý.
* **Kỹ thuật System Prompt chuyên biệt**: AI được định hình vai trò trợ lý y tế thân thiện thuộc hệ thống EYEAI:
  * Trả lời ngắn gọn từ 2 đến 5 câu tiếng Việt.
  * Giọng văn đồng cảm, động viên, dễ hiểu.
  * Không chẩn đoán bệnh thay bác sĩ, hướng dẫn kích hoạt nút SOS nếu có dấu hiệu cấp cứu khẩn cấp.
* **Tự động đọc phản hồi (Auto-TTS)**: Mọi câu trả lời của AI lập tức được chuyển thành giọng nói tiếng Việt giúp người nuôi bệnh hoặc bác sĩ ở gần có thể nghe trực tiếp.

### 3.3. Chức năng Cấp cứu Khẩn cấp SOS (Sos Page)
* **Kích hoạt bằng hành vi nhắm mắt 8s**: Khi người bệnh nhắm mắt liên tục 8.0 giây, hệ thống nhận diện đây là tình huống khẩn cấp (ngất xỉu, đột quỵ hoặc suy hô hấp) và tự động kích hoạt báo động.
* **Visual Đồng hồ đếm ngược**: Vòng tròn tiến trình hiển thị đếm ngược 8s trực quan.
* **Cảnh báo âm thanh & Gọi điện khẩn cấp**: Phát âm thanh cảnh báo tới người xung quanh và hỗ trợ cuộc gọi nhanh tới Bác sĩ điều trị, Người thân hoặc Trung tâm Cấp cứu 115.

### 3.4. Chức năng Định vị & Chia sẻ Vị trí (Location Page)
* **Xác định vị trí thời gian thực**: Sử dụng HTML5 Geolocation API để lấy tọa độ kinh độ/vĩ độ chính xác của bệnh nhân.
* **Tích hợp Bản đồ Google Maps**: Sử dụng `@googlemaps/js-api-loader` hiển thị bản đồ trực quan kèm địa chỉ đã được mã hóa địa lý (Reverse Geocoding).
* **Chia sẻ tọa độ khẩn cấp**: Cho phép gửi nhanh thông tin vị trí tới người chăm sóc qua SMS hoặc ứng dụng tin nhắn.

### 3.5. Chức năng Giải trí Thông minh (Entertainment Page)
* **3 Chế độ giải trí**:
  1. *Sách nói & Truyện đọc (Books)*
  2. *Radio & Tin tức trực tuyến (Radio)*
  3. *Âm nhạc & MV Thư giãn (Music)*
* **Tìm kiếm thông minh**: Tự động ghép nối từ khóa tìm kiếm tiếng Việt phù hợp (ví dụ: gõ "nhạc Trịnh" $\rightarrow$ tự động tìm "nhạc Trịnh nhạc", gõ "truyện kiều" $\rightarrow$ tự động tìm "truyện kiều sách nói").
* **Phát trực tiếp chuẩn Embedded Player**: Hiển thị danh sách kết quả trực quan lớn, dễ chọn bằng mắt và phát video ngay trong ứng dụng.

### 3.6. Chức năng Danh bạ & Nhắn tin Người - Người (Contacts & Human Chat Page)
* **Quản lý danh bạ người thân / bác sĩ**: Danh sách liên hệ kèm ảnh đại diện và trạng thái trực tuyến.
* **Giao diện nhắn tin hỗ trợ mắt**: Người bệnh chọn một liên hệ để mở phòng chat, gõ tin nhắn bằng cử chỉ mắt và gửi đi.
* **Tích hợp Supabase Database**: Lưu trữ lịch sử tin nhắn và đồng bộ dữ liệu người dùng.

### 3.7. Chức năng Hiệu chuẩn & Cài đặt (Settings & Calibration Page)
* **Hiệu chuẩn mắt tự động (Eye Calibration)**: Thu thập dữ liệu trạng thái nghỉ (Neutral State) trong 3 giây để cá nhân hóa ngưỡng nháy mắt (*blinkThreshold*).
* **Phóng to chữ chuyên dụng (Accessibility Font Scale)**: Cho phép chuyển đổi giữa các kích thước phông chữ siêu lớn.
* **Giả lập Bàn phím Cơ (Keyboard Simulator)**: Hỗ trợ phím `Arrow Keys` + `Enter` phục vụ kiểm thử không cần webcam.

---

## 4. PHÂN TÍCH SÂU CÁC THUẬT TOÁN CỐT LÕI (ALGORITHMIC ANALYSIS)

### 4.1. Thuật toán Nhận diện Cử chỉ Mắt (Eye Gesture Recognition Algorithm)

#### A. Tính Tỷ lệ Đóng/Mở Mắt - Eye Aspect Ratio (EAR)
Để xác định mắt đang mở hay đóng, thuật toán đo khoảng cách Euclidian giữa các mốc mi trên và mi dưới, sau đó chia cho khoảng cách giữa hai khóe mắt:

$$\text{Distance}(p_1, p_2) = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2 + (z_1 - z_2)^2}$$

Đối với Mắt Trái (Left Eye):
* Khóe ngoài: Mốc 33, Khóe trong: Mốc 133.
* Mi trên: Mốc 159, Mi dưới: Mốc 145.

$$EAR_{Left} = \frac{\text{Distance}(p_{159}, p_{145})}{\text{Distance}(p_{33}, p_{133})}$$

Đối với Mắt Phải (Right Eye):
* Khóe trong: Mốc 362, Khóe ngoài: Mốc 263.
* Mi trên: Mốc 386, Mi dưới: Mốc 374.

$$EAR_{Right} = \frac{\text{Distance}(p_{386}, p_{374})}{\text{Distance}(p_{362}, p_{263})}$$

Tỷ lệ trung bình hai mắt:

$$EAR_{Avg} = \frac{EAR_{Left} + EAR_{Right}}{2}$$

* **Quy tắc Phân loại**:
  * Nếu $EAR_{Avg} < EAR_{Threshold}$ (mặc định $0.15$): Mắt được xác định ở trạng thái **ĐÓNG (CLOSED)**.
  * Nếu $EAR_{Avg} \ge EAR_{Threshold}$: Mắt ở trạng thái **MỞ (OPEN)**.

#### B. Thuật toán Xác định Vị trí Con ngươi (Iris Ratio Tracking)
Thuật toán lấy tọa độ mống mắt (Iris Landmark 468 cho mắt trái, 473 cho mắt phải) và tính vị trí tương đối theo chiều ngang ($H$) và chiều dọc ($V$):

$$Iris_H = \frac{x_{iris} - x_{outer}}{x_{inner} - x_{outer}}, \quad Iris_V = \frac{y_{iris} - y_{top}}{y_{bottom} - y_{top}}$$

* $Iris_H < 0.35$: Nhìn sang trái.
* $Iris_H > 0.65$: Nhìn sang phải.
* $Iris_V < 0.35$: Nhìn lên trên.
* $Iris_V > 0.65$: Nhìn xuống dưới.

#### C. Cỗ máy Trạng thái Hữu hạn Cử chỉ Mắt (Gesture Finite State Machine - FSM)
Dựa vào số lần nháy mắt và thời gian nhắm mắt giữ liên tục, hệ thống phân loại cử chỉ theo thuật toán Cửa sổ Thời gian (Time-Window Matching):

```text
[Mắt Đóng: EAR < Threshold]
        │
        ├──► Giữ 1.5s - 2.0s ─────────► Kích hoạt lệnh DOWN (Xuống)
        ├──► Giữ > 2.5s ──────────────► Kích hoạt lệnh UP (Lên)
        └──► Giữ 8.0s liên tục ───────► Kích hoạt BÁO ĐỘNG SOS
        
[Mắt Nháy Nhanh: Mở -> Đóng -> Mở]
        │
        ├──► 1 Lần Nháy ──────────────► Kích hoạt lệnh SELECT (Chọn)
        ├──► 2 Lần Nháy (trong 1.5s) ──► Kích hoạt lệnh NEXT (Di chuyển Phải)
        └──► 3 Lần Nháy (trong 3.5s) ──► Kích hoạt lệnh BACK (Di chuyển Trái)
```

---

### 4.2. Thuật toán Điều hướng Không gian 2D bằng Mắt (2D Spatial Bounding-Box Navigation Engine)

Khi người bệnh đưa ra câu lệnh di chuyển (`NEXT`, `BACK`, `UP`, `DOWN`), hệ thống không cố định danh sách 1D mà tính toán vị trí động của các phần tử UI trên màn hình thông qua file `EyeNavigationProvider.tsx`:

#### Bước 1: Điều hướng theo Ma trận Group (Grid-based Matching)
Nếu phần tử hiện tại có thuộc tính `row` và `col` trong cùng một nhóm `groupId`, thuật toán ưu tiên tìm phần tử ô kế tiếp:
* **Lệnh `NEXT`**: Tìm phần tử cùng `row` có `col = col_current + 1`.
* **Lệnh `BACK`**: Tìm phần tử cùng `row` có `col = col_current - 1`.
* **Lệnh `DOWN`**: Tìm phần tử có `row = row_current + 1` cùng hoặc gần `col` nhất.
* **Lệnh `UP`**: Tìm phần tử có `row = row_current - 1` cùng hoặc gần `col` nhất.

#### Bước 2: Điều hướng Vector Nón Không gian 2D (Euclidean Vector Cone Search)
Nếu phần tử không có ma trận `(row, col)`, thuật toán sử dụng tọa độ hình chữ nhật bao quanh (`getBoundingClientRect()`):
1. Tính điểm tâm của phần tử hiện tại $C_{curr} = (x_1, y_1)$ và điểm tâm của tất cả ứng viên $C_{cand} = (x_2, y_2)$.
2. Tính khoảng cách biến thiên: $dx = x_2 - x_1$, $dy = y_2 - y_1$.
3. Kiểm tra xem ứng viên có nằm trong **Nón Hướng Hợp Lệ (Valid Directional Cone)** hay không:
   * **Chướng ngại `NEXT` (Phải)**: $dx > 20$ và $|dy| \le 1.5 \times |dx|$.
   * **Chướng ngại `BACK` (Trái)**: $dx < -20$ và $|dy| \le 1.5 \times |dx|$.
   * **Chướng ngại `DOWN` (Dưới)**: $dy > 20$ và $|dx| \le 1.5 \times |dy|$.
   * **Chướng ngại `UP` (Trên)**: $dy < -20$ và $|dx| \le 1.5 \times |dy|$.
4. Chọn ứng viên nằm trong nón hướng có khoảng cách Euclidean nhỏ nhất:

$$d = \sqrt{dx^2 + dy^2} \rightarrow \min(d)$$

#### Bước 3: Vòng lặp Tuyến tính Dự phòng (Linear Cyclic Fallback)
Nếu không tìm thấy phần tử nào nằm trong nón hướng 2D, thuật toán chuyển sang mảng 1D tuần hoàn, cho phép con trỏ không bao giờ bị "kẹt" trên màn hình.

---

### 4.3. Thuật toán Ghép Dấu Tiếng Việt Telex Tự Động (`applyVietnameseAccents`)

Để hỗ trợ gõ tiếng Việt bằng mắt nhanh chóng mà không cần bàn phím Telex phức tạp, file `vietnameseTelex.ts` cài đặt thuật toán kiểm tra chuỗi hậu tố:

```typescript
export function applyVietnameseAccents(text: string): string {
  if (!text || text.length < 2) return text;
  
  const combinations: Record<string, string> = {
    'as': 'á', 'af': 'à', 'ar': 'ả', 'ax': 'ã', 'aj': 'ạ',
    'âs': 'ấ', 'âf': 'ầ', 'âr': 'ẩ', 'âx': 'ẫ', 'âj': 'ậ',
    'ăs': 'ắ', 'ăf': 'ằ', 'ăr': 'ẳ', 'ăx': 'ẵ', 'ăj': 'ặ',
    'es': 'é', 'ef': 'è', 'er': 'ẻ', 'ex': 'ẽ', 'ej': 'ẹ',
    'ês': 'ế', 'êf': 'ề', 'êr': 'ể', 'êx': 'ễ', 'êj': 'ệ',
    'is': 'í', 'if': 'ì', 'ir': 'ỉ', 'ix': 'ĩ', 'ij': 'ị',
    'os': 'ó', 'of': 'ò', 'or': 'ỏ', 'ox': 'õ', 'oj': 'ọ',
    'ôs': 'ố', 'ôf': 'ồ', 'ôr': 'ổ', 'ôx': 'ỗ', 'ôj': 'ộ',
    'ơs': 'ớ', 'ơf': 'ờ', 'ơr': 'ở', 'ơx': 'ỡ', 'ơj': 'ợ',
    'us': 'ú', 'uf': 'ù', 'ur': 'ủ', 'ux': 'ũ', 'uj': 'ụ',
    'ưs': 'ứ', 'ưf': 'ừ', 'ưr': 'ử', 'ưx': 'ữ', 'ưj': 'ự',
    'ys': 'ý', 'yf': 'ỳ', 'yr': 'ỷ', 'yx': 'ỹ', 'yj': 'ỵ',
  };

  const lastTwo = text.slice(-2);
  if (combinations[lastTwo]) {
    return text.slice(0, -2) + combinations[lastTwo];
  }
  return text;
}
```

* **Cơ chế**: Mỗi khi người dùng nháy mắt chọn thêm một ký tự dấu (như `s`, `f`, `r`, `x`, `j`), thuật toán cắt 2 ký tự cuối cùng, tra bảng hash table $O(1)$ và thay thế bằng ký tự đã được ghép dấu chuẩn xác.

---

### 4.4. Thuật toán Tự động Hiệu chuẩn Mắt (Auto Eye Calibration Algorithm)

Mỗi người có kích thước mắt và khoảng cách với webcam khác nhau. Thuật toán hiệu chuẩn tự động thực thi qua 3 bước:
1. **Thu thập dữ liệu (Collect Stage)**: Đếm ngược 3 giây, thu thập 90 mẫu chỉ số $EAR$ và vị trí mống mắt $Iris_H, Iris_V$ ở trạng thái nhìn thẳng tự nhiên (Neutral State).
2. **Tính giá trị trung bình (Mean Calculation)**:

$$EAR_{resting} = \frac{1}{N} \sum_{i=1}^{N} EAR_i$$

3. **Cấu hình ngưỡng cá nhân hóa (Threshold Customization)**:

$$EAR_{threshold} = EAR_{resting} \times 0.65$$

* Nếu chỉ số $EAR_{resting} = 0.28$, ngưỡng nháy mắt sẽ tự động điều chỉnh thành $0.182$, tránh hiện tượng nhận diện nhầm khi người dùng mắt tiệt hoặc mắt to.

---

## 5. ĐÁNH GIÁ ĐẶC TÍNH KỸ THUẬT & HƯỚNG MỞ RỘNG

### 5.1. Ưu điểm nổi bật về Kỹ thuật
1. **Zero DOM Over-rendering**: Luồng MediaPipe nhận diện 30-60 lần/giây nhưng không bắt React render lại toàn bộ component, giữ cho FPS ứng dụng mượt mà.
2. **Khả năng dự phòng cao (High Resilience)**:
   * AI Proxy tự động thử nghiệm qua 4 model Gemini khi bị giới hạn Quota.
   * Tìm kiếm YouTube tự động chuyển đổi giữa Server Proxy và Direct Client Fetch khi deploy trên hạ tầng Serverless/Static.
3. **Trải nghiệm tiếp cận toàn diện (Inclusive UX)**: Hỗ trợ cả giọng đọc thoại, hiệu ứng viền sáng, đếm ngược đẫn hướng và phông chữ cỡ đại.

### 5.2. Hướng Phát Triển Nâng Cao (Roadmap)
* **Tích hợp Thuật toán Dự đoán từ AI (Predictive Word Completion)**: Sử dụng mô hình ngôn ngữ nhỏ (N-gram hoặc AI Local Model) để gợi ý từ tiếp theo, giúp giảm 60% số lần nháy mắt của bệnh nhân.
* **Điều khiển Thiết bị Nhà thông minh (IoT Integration)**: Tích hợp WebSockets/MQTT cho phép nháy mắt để bật/tắt đèn, mở quạt hoặc gọi chuông cấp cứu phần cứng trong phòng bệnh.
* **Lưu trữ Lịch sử Sức khỏe & Tần suất Nháy mắt**: Theo dõi sự thay đổi chỉ số $EAR$ theo thời gian để cảnh báo mức độ mệt mỏi của người bệnh.

---
*Báo cáo phân tích kỹ thuật được tổng hợp chi tiết cho hệ thống EYEAI (EyeTalk Assistant).*
