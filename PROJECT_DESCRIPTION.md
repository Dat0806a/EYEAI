# BẢN MÔ TẢ VÀ PHÂN TÍCH DỰ ÁN EYEAI (EYETALK ASSISTANT)

> **Dự án**: EYEAI (EyeTalk Assistant) - Hệ thống hỗ trợ giao tiếp thông minh cho người khuyết tật và người cao tuổi bằng cử chỉ mắt và AI.
> **Thời gian phân tích**: Tháng 8, 2026
> **Công nghệ cốt lõi**: React 19, TypeScript, MediaPipe FaceMesh, Express.js, Google Gemini 3.5 Flash API, Web Speech API.

---

## 1. Tổng Quan Dự Án (Project Overview)

**EYEAI (EyeTalk Assistant)** là một ứng dụng web hỗ trợ y tế và truy cập (Accessibility Web Application), được thiết kế đặc biệt nhằm giúp những người gặp khó khăn trong việc giao tiếp và vận động (như bệnh nhân mắc hội chứng ALS, bệnh nhân đột quỵ/tai biến, người liệt toàn thân hoặc người cao tuổi suy giảm chức năng nói/tay chân) có thể **giao tiếp dễ dàng thông qua cử chỉ mắt (Eye Tracking)** hoặc **bàn phím giả lập**.

Hệ thống cho phép người dùng:
1. **Soạn thảo văn bản/cụm từ bằng mắt**: Nhìn và nháy mắt/nhắm mắt để chọn ký tự, từ gợi ý cấp cứu, hoặc câu thoại.
2. **Chuyển văn bản thành giọng nói (Text-to-Speech - TTS)**: Tự động phát âm câu nói tiếng Việt giúp người xung quanh/bác sĩ/người nuôi bệnh lắng nghe.
3. **Trò chuyện với AI Trợ lý y tế (Gemini 3.5 Flash)**: Nhận phản hồi siêu ngắn gọn, đồng cảm và phù hợp từ AI để duy trì hội thoại.

---

## 2. Kiến Trúc Hệ Thống & Đống Công Nghệ (Tech Stack)

### 2.1 Front-End (Giao diện người dùng)
* **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
* **Build Tool**: [Vite 6](https://vitejs.dev/)
* **Styling**: [TailwindCSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) kết hợp icon set [Lucide React](https://lucide.dev/)
* **Animations**: [Motion](https://motion.dev/) (Framer Motion v12) cho chuyển cảnh mượt mà.
* **Accessibility**: Hỗ trợ chế độ phóng to chữ chuyên dụng (*Accessibility Font Scale*) cho người thị lực kém.

### 2.2 Back-End & AI Proxy (`server.ts`)
* **Runtime**: [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
* **AI Integration**: Trợ lý [Google GenAI SDK](https://www.npmjs.com/package/@google/genai) sử dụng mô hình **Gemini 3.5 Flash** (`gemini-3.5-flash`).
* **System Prompt chuyên biệt**: Tối ưu AI phản hồi ngắn gọn (1–2 câu) bằng tiếng Việt, mang tính đồng cảm và dễ chịu, hỗ trợ người khuyết tật nhanh chóng đưa ra lựa chọn phản hồi tiếp theo.
* **Chế độ Dev/Prod tích hợp**: Tích hợp Vite Dev Middleware trong môi trường Development và phục vụ Static Build trong môi trường Production.

### 2.3 Computer Vision & Eye Tracking (`src/utils/eyeTracker.ts`)
* **Thư viện**: [MediaPipe FaceMesh](https://google.github.io/mediapipe/solutions/face_mesh.html) (Load động qua CDN với 468+ mốc tọa độ khuôn mặt).
* **Thuật toán xử lý cử chỉ**:
  * **EAR (Eye Aspect Ratio)**: Tính tỷ lệ đóng/mở mắt từ các mốc mi trên và mi dưới.
  * **Iris Ratio Tracking**: Tính tỷ lệ tọa độ con ngươi (Iris Index 468 & 473) so với khóe mắt để xác định hướng nhìn.
* **Bảng điều khiển cử chỉ mắt**:
  * **Nháy mắt 1 lần**: `SELECT` (Kích hoạt/Chọn ô đang tô đậm).
  * **Nháy mắt 2 lần (trong 1.5s)**: `NEXT` (Di chuyển sang phải).
  * **Nháy mắt 3 lần (trong 3.5s)**: `BACK` (Di chuyển sang trái).
  * **Nhắm mắt giữ 1.5s - 2.0s**: `DOWN` (Di chuyển xuống hàng dưới).
  * **Nhắm mắt giữ > 2.5s**: `UP` (Di chuyển lên hàng trên).

### 2.4 Chế Độ Cảm Biến Bàn Phím Giả Lập (Keyboard Simulator)
* Phục vụ quá trình thử nghiệm/kiểm thử không cần webcam:
  * Phím mũi tên `→`: Di chuyển tới (Next).
  * Phím mũi tên `←`: Di chuyển lùi (Back).
  * Phím mũi tên `↓`: Di chuyển xuống (Down).
  * Phím mũi tên `↑`: Di chuyển lên (Up).
  * Phím `Enter`: Chọn phím (Select).

---

## 3. Cấu Trúc Thư Mục Dự Án (Project Directory Structure)

```text
eyetalk-assistant/
├── assets/                    # Tài nguyên hình ảnh, biểu tượng
├── src/
│   ├── components/
│   │   └── EyeTalkDashboard.tsx  # Component chính: Xử lý Video Stream, Eye Tracking, Virtual Keyboard, Gemini Chat & TTS
│   ├── utils/
│   │   ├── eyeTracker.ts      # Hàm toán học tính toán EAR và Iris position từ MediaPipe landmarks
│   │   ├── keyboardLayout.ts  # Ma trận bố cục bàn phím ảo tiếng Việt & Thuật toán ghép dấu Telex tự động
│   │   └── speech.ts          # Tích hợp Web Speech API (speechSynthesis) cho giọng nói tiếng Việt
│   ├── types.ts               # Định nghĩa TypeScript Interfaces (EyeTrackingState, EyeCalibrationData, GridItem, ChatMessage...)
│   ├── App.tsx                # Trang chủ ứng dụng, màn hình hướng dẫn & chuyển đổi trang
│   ├── main.tsx               # Khởi tạo React App DOM Root
│   └── index.css              # Style tổng thể ứng dụng
├── server.ts                  # Server Express Proxy API Gemini & Server static/vite middleware
├── vite.config.ts             # Cấu hình Vite & TailwindCSS plugin
├── tsconfig.json              # Cấu hình TypeScript compiler
├── package.json               # Định nghĩa Dependencies và Scripts dự án
├── metadata.json              # Metadata hệ thống (Cấp quyền Camera & Capabilities)
└── README.md                  # Hướng dẫn khởi chạy nhanh
```

---

## 4. Các Chức Năng Nổi Bật (Key Features)

### 4.1 Bàn Phím Ảo Tiếng Việt Thông Minh & Gõ Dấu Telex
* **Cụm từ giao tiếp cấp cứu nhanh**: Gồm các ô chọn nhanh như *🆘 Hỗ trợ tôi*, *😋 Tôi đói bụng*, *💧 Tôi khát nước*, *🚾 Đi vệ sinh*, *🤕 Tôi thấy đau*, *📞 Gọi người thân*, *🩺 Cần bác sĩ*, *🛌 Muốn nghỉ ngơi*.
* **Xử lý dấu Telex tự động (`applyVietnameseAccents`)**: Khi gõ ký tự kết hợp với phím dấu (Sắc `s`, Huyền `f`, Hỏi `r`, Ngã `x`, Nặng `j`), hệ thống tự động ghép thành chữ tiếng Việt có dấu (ví dụ: `a` + `s` $\rightarrow$ `á`, `e` + `f` $\rightarrow$ `è`).
* **Nút điều khiển**: Dấu cách, Xóa chữ (Backspace), Xóa tất cả, Gửi tin nhắn.

### 4.2 Hiệu Chuẩn Mắt Tự Động (Eye Calibration)
* Cho phép người dùng đo đạc chỉ số EAR trung bình và vị trí mắt ở trạng thái nghỉ (Neutral State) trong 3 giây.
* Tự động điều chỉnh ngưỡng nháy mắt (*blinkThreshold*) cá nhân hóa theo đặc điểm mắt của từng người bệnh.

### 4.3 Đọc Giọng Nói Tiếng Việt (Text-to-Speech)
* Khi bấm/chọn nút **GỬI TIN NHẮN**, ứng dụng tự động phát âm nội dung tin nhắn ra loa máy tính bằng Web Speech API tiếng Việt (`vi-VN`), giúp người xung quanh nghe rõ yêu cầu của người bệnh.

### 4.4 Trợ Lý AI Gemini Đa Năng
* Tin nhắn sau khi gửi sẽ được gửi tới Express Server backend (`/api/gemini/chat`).
* Gemini AI hồi đáp câu phản hồi ngắn gọn, dễ hiểu, mang tính tương tác y tế.

### 4.5 Thiết Kế Trực Quan & Truy Cập Cao (Accessibility & UI/UX)
* Phối màu sắc nét, hỗ trợ Dark Mode / Light Mode.
* Hiệu ứng con trỏ tô đậm ô đang chọn (*Focus Highlight*).
* Nút chuyển đổi kích thước chữ **CỰC TO** phục vụ người lớn tuổi mắt kém.

---

## 5. Quy Trình Vận Hành & Khởi Chạy (Installation & Run Guide)

### 5.1 Cài Đặt Ban Đầu
```bash
# 1. Cài đặt các gói phụ thuộc (Dependencies)
npm install

# 2. Tạo file môi trường cấu hình API Key của Google Gemini
# Tạo file .env ở thư mục gốc và thêm:
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### 5.2 Khởi Chạy Ứng Dụng
```bash
# Khởi chạy ứng dụng trong môi trường phát triển (Dev Mode)
npm run dev
```
* Ứng dụng sẽ chạy tại địa chỉ: `http://localhost:3000`

### 5.3 Build Sản Phẩm (Production)
```bash
# Biên dịch React Vite app và đóng gói Express Server
npm run build

# Chạy server sản phẩm
npm run start
```

---

## 6. Đánh Giá Đóng Góp & Hướng Phát Triển (Evaluation & Roadmap)

### Ưu điểm nổi bật:
1. **Không tốn chi phí phần cứng đắt đỏ**: Chỉ cần 1 chiếc Laptop/Máy tính có Webcam phổ thông là có thể vận hành hệ thống eye-tracking.
2. **Khả năng dự phòng cao**: Có sẵn chế độ giả lập bàn phím cơ phòng trường hợp phòng tối hoặc webcam hỏng.
3. **AI Y tế tích hợp**: Gemini AI được điều hướng (System Instruction) chuyên biệt cho giao tiếp y tế với người bệnh.

### Hướng phát triển nâng cao (Roadmap):
* Tích hợp thuật toán **Dự đoán từ thông minh (Word Completion / Next-Word Prediction)** bằng AI để giảm bớt số lần nháy mắt của bệnh nhân.
* Hỗ trợ điều khiển **Thiết bị nhà thông minh (IoT)** trong phòng bệnh (bật/tắt đèn, gọi chuông cấp cứu phần cứng qua Web Socket).
* Lưu trữ lịch sử giao tiếp và đo đạc chỉ số sức khỏe/tần suất giao tiếp của bệnh nhân.

---
*Bản báo cáo phân tích được tổng hợp tự động cho dự án EYEAI (EyeTalk Assistant).*
