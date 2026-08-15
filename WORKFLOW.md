# QUY TRÌNH HOẠT ĐỘNG & WORKFLOW CHI TIẾT HỆ THỐNG EYEAI (EYETALK ASSISTANT)

> **Dự án**: EYEAI (EyeTalk Assistant) - Nền tảng giao tiếp thông minh & hỗ trợ y tế bằng cử chỉ mắt và Trợ lý AI  
> **Phiên bản tài liệu**: 2.0 (Tháng 8, 2026)  
> **Định dạng**: Markdown & Sơ đồ luồng Mermaid chuẩn hóa  

---

## MỤC LỤC TỔNG QUAN CÁC WORKFLOW

1. [Sơ Đồ Workflow Tổng Thể Hệ Thống (End-to-End System Workflow)](#1-sơ-đồ-workflow-tổng-thể-hệ-thống)
2. [Workflow 1: Khởi Tạo Ứng Dụng, Video Stream & Hiệu Chuẩn Mắt Tự Động](#2-workflow-1-khởi-tạo-ứng-dụng-video-stream--hiệu-chuẩn-mắt-tự-động)
3. [Workflow 2: Thị Giác Máy Tính & Máy Trạng Thái Cử Chỉ Mắt (Vision & Gesture FSM)](#3-workflow-2-thị-giác-máy-tính--máy-trạng-thái-cử-chỉ-mắt-vision--gesture-fsm)
4. [Workflow 3: Điều Hướng Không Gian 2D & Tự Động Cuộn Focus (2D Spatial Navigation Engine)](#4-workflow-3-điều-hướng-không-gian-2d--tự-động-cuộn-focus-2d-spatial-navigation-engine)
5. [Workflow 4: Soạn Thảo Văn Bản Telex & Chuyển Đổi Giọng Nói (Virtual Keyboard & TTS)](#5-workflow-4-soạn-thảo-văn-bản-telex--chuyển-đổi-giọng-nói-virtual-keyboard--tts)
6. [Workflow 5: Trò Chuyện Trợ Lý AI Y Tế & Cơ Chế Dự Phòng 4 Tầng (Gemini AI Fallback Pipeline)](#6-workflow-5-trò-chuyện-trợ-lý-ai-y-tế--cơ-chế-dự-phòng-4-tầng-gemini-ai-fallback-pipeline)
7. [Workflow 6: Phát Hiện Nguy Cấp & Kích Hoạt Cấp Cứu SOS 8 Giây](#7-workflow-6-phát-hiện-nguy-cấp--kích-hoạt-cấp-cứu-sos-8-giây)
8. [Workflow 7: Tìm Kiếm & Phát Giải Trí Đa Phương Tiện (YouTube Entertainment Stream)](#8-workflow-7-tìm-kiếm--phát-giải-trí-đa-phương-tiện-youtube-entertainment-stream)
9. [Workflow 8: Quản Lý Danh Bạ & Nhắn Tin Người - Người (Realtime Chat & Supabase Sync)](#9-workflow-8-quản-lý-danh-bạ--nhắn-tin-người---người-realtime-chat--supabase-sync)
10. [Workflow 9: Quy Trình Đóng Gói, Triển Khai & Build CI/CD (Deployment & Edge Fallback)](#10-workflow-9-quy-trình-đóng-gói-triển-khai--build-cicd-deployment--edge-fallback)

---

## 1. SƠ ĐỒ WORKFLOW TỔNG THỂ HỆ THỐNG

Sơ đồ thể hiện luồng dữ liệu liên tục từ khi Camera ghi nhận hình ảnh khuôn mặt người bệnh, qua các tầng xử lý thị giác, điều phối tương tác, đến các dịch vụ bên ngoài và phản hồi âm thanh.

```mermaid
flowchart TB
    %% Các Subgraph
    subgraph Inputs["1. TẦNG ĐẦU VÀO CẢM BIẾN"]
        CAM["Webcam / Camera Trước (30-60 FPS)"]
        KBD["Bàn phím cơ Giả lập (Arrow Keys / Enter)"]
        TOUCH["Tương tác Chạm / Click Trực tiếp"]
    end

    subgraph VisionEngine["2. COMPUTER VISION ENGINE (High-Frequency)"]
        MP["MediaPipe FaceMesh (CDN Load)"]
        LM["Trích xuất 468 Face Mesh + 10 Iris Landmarks"]
        EAR_CALC["Tính toán EAR (Eye Aspect Ratio) & Iris Vector"]
        CALIB["Bộ Hiệu chuẩn Mắt Cá nhân hóa (Auto Calibration)"]
    end

    subgraph GestureFSM["3. GESTURE RECOGNITION FSM"]
        FSM{"Máy Trạng Thái Cử Chỉ"}
        BLINK_1["1 Nháy -> SELECT"]
        BLINK_2["2 Nháy -> NEXT (Phải)"]
        BLINK_3["3 Nháy -> BACK (Trái)"]
        DWELL_DOWN["Nhắm 1.5s-2.0s -> DOWN (Dưới)"]
        DWELL_UP["Nhắm > 2.5s -> UP (Trên)"]
        SOS_TRIGGER["Nhắm 8.0s -> SOS ALARM"]
    end

    subgraph Navigation["4. 2D SPATIAL NAVIGATION & FOCUS ENGINE"]
        NAV_PROVIDER["EyeNavigationProvider"]
        GRID_MATCH["1. Grid/Matrix Matching (Row, Col)"]
        CONE_SEARCH["2. Euclidean Vector Cone Search (2D Angle)"]
        FALLBACK_SEARCH["3. Linear Cyclic Fallback"]
        AUTO_SCROLL["Tự động Cuộn Màn hình theo Focus (Auto-Scroll)"]
        HUD["Global Eye HUD & Visual Focus Ring"]
    end

    subgraph AppModules["5. CÁC PHÂN HỆ ỨNG DỤNG"]
        SPEAK["Speak Page (Bàn phím Telex + Quick SOS Phrases)"]
        AI_CHAT["Ai Page (Trợ lý Y tế Thông minh)"]
        SOS_PAGE["Sos Page (Báo động, Gọi Khẩn cấp & GPS)"]
        ENTERTAIN["Entertainment Page (Sách nói, Radio, Nhạc)"]
        HUMAN_CHAT["Contacts & Chat Page (Nhắn tin Người thân)"]
        LOCATION["Location Page (Google Maps Định vị)"]
        SETTINGS["Settings & Calibration Page"]
    end

    subgraph Outputs["6. TẦNG DỊCH VỤ NGOẠI VI & PHẢN HỒI"]
        TTS["Web Speech API (Phát âm Tiếng Việt vi-VN)"]
        GEMINI["Google Gemini AI (Fallback 4 Tầng)"]
        YT_API["YouTube Data API & Audio Stream"]
        SUPABASE["Supabase DB (Lưu trữ tin nhắn & Danh bạ)"]
        MAPS_API["Google Maps API & Geolocation"]
    end

    %% Kết nối
    CAM --> MP --> LM --> EAR_CALC
    CALIB -. Cung cấp Threshold .-> EAR_CALC
    EAR_CALC --> FSM

    KBD --> NAV_PROVIDER
    TOUCH --> NAV_PROVIDER
    FSM --> BLINK_1 & BLINK_2 & BLINK_3 & DWELL_DOWN & DWELL_UP --> NAV_PROVIDER
    FSM --> SOS_TRIGGER --> SOS_PAGE

    NAV_PROVIDER --> GRID_MATCH --> CONE_SEARCH --> FALLBACK_SEARCH
    FALLBACK_SEARCH --> AUTO_SCROLL --> HUD
    NAV_PROVIDER --> AppModules

    SPEAK --> TTS
    AI_CHAT --> GEMINI --> TTS
    SOS_PAGE --> MAPS_API
    ENTERTAIN --> YT_API
    HUMAN_CHAT --> SUPABASE
    LOCATION --> MAPS_API
```

---

## 2. WORKFLOW 1: KHỞI TẠO ỨNG DỤNG, VIDEO STREAM & HIỆU CHUẨN MẮT TỰ ĐỘNG

Quy trình kích hoạt hệ thống khi người dùng mở trang web, xin quyền webcam, nạp mô hình trí tuệ nhân tạo thị giác từ CDN và thu thập trạng thái nhìn tự nhiên để cá nhân hóa tham số nhận diện.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người Bệnh / Người Nuôi Bệnh
    participant UI as Giao Diện Ứng Dụng (React)
    participant AudioBanner as AudioUnlockBanner
    participant EyeProvider as EyeTrackingProvider
    participant MediaPipe as MediaPipe FaceMesh (CDN)
    participant Camera as Webcam / Trình Duyệt Web

    User->>UI: Truy cập ứng dụng EYEAI
    UI->>AudioBanner: Hiển thị Banner mở khóa âm thanh
    UI->>EyeProvider: Khởi tạo EyeTrackingProvider & Navigation
    
    EyeProvider->>MediaPipe: Tải script FaceMesh từ CDN (@mediapipe/face_mesh)
    activate MediaPipe
    MediaPipe-->>EyeProvider: Tải thành công & Sẵn sàng khởi tạo
    deactivate MediaPipe

    EyeProvider->>Camera: navigator.mediaDevices.getUserMedia({ video: true })
    activate Camera
    Camera-->>EyeProvider: Trả về MediaStream (Video Track)
    deactivate Camera

    EyeProvider->>UI: Hiển thị CameraPreview & HUD trạng thái "Chờ Hiệu Chuẩn"

    opt Mở khóa Âm thanh Trình duyệt
        User->>AudioBanner: Chạm màn hình hoặc Nháy mắt lần đầu
        AudioBanner->>UI: Kích hoạt Web AudioContext câm & Ẩn Banner
    end

    rect rgb(235, 248, 255)
        note over EyeProvider, User: GIAI ĐOẠN TỰ ĐỘNG HIỆU CHUẨN MẮT (3 GIÂY)
        EyeProvider->>UI: Hiển thị Countdown 3s: "Nhìn thẳng tự nhiên vào màn hình"
        loop Mỗi frame (30-60 FPS) trong 3 giây
            EyeProvider->>MediaPipe: Gửi frame hình ảnh video
            MediaPipe-->>EyeProvider: Trả về Landmark mi mắt & mống mắt
            EyeProvider->>EyeProvider: Thu thập ~90 mẫu EAR (Eye Aspect Ratio)
        end
        EyeProvider->>EyeProvider: Tính EAR_resting = Trung bình(EAR_1..90)
        EyeProvider->>EyeProvider: Cấu hình blinkThreshold = EAR_resting * 0.65
        EyeProvider->>UI: Phát âm thông báo TTS: "Hiệu chuẩn mắt hoàn tất!"
    end

    EyeProvider->>UI: Chuyển sang trạng thái "THEO DÕI HOẠT ĐỘNG (TRACKING ACTIVE)"
```

---

## 3. WORKFLOW 2: THỊ GIÁC MÁY TÍNH & MÁY TRẠNG THÁI CỬ CHỈ MẮT (VISION & GESTURE FSM)

Quy trình giải mã hình thái mắt theo từng khung hình và phân loại hành vi nháy mắt / giữ mắt bằng Cỗ máy Trạng thái Hữu hạn (Finite State Machine).

```mermaid
flowchart TD
    START(["Nhận Khung Hình Video Mới (requestAnimationFrame)"]) --> MP_PROCESS["MediaPipe FaceMesh Process"]
    MP_PROCESS --> CHECK_FACE{"Có nhận diện được khuôn mặt?"}
    
    CHECK_FACE -- Không --> NO_FACE["Cập nhật HUD: Mất Dấu Khuôn Mặt"] --> END_FRAME(["Chờ Khung Hình Kế Tiếp"])
    
    CHECK_FACE -- Có --> EXTRACT["Trích xuất Tọa độ 3D:
    • Mắt Trái: p33, p133, p159, p145, Iris p468
    • Mắt Phải: p362, p263, p386, p374, Iris p473"]
    
    EXTRACT --> CALC_EAR["Tính EAR = (EAR_Left + EAR_Right) / 2
    Tính Iris Vector (H_ratio, V_ratio)"]

    CALC_EAR --> COMPARE{"EAR < blinkThreshold?"}

    %% Nhánh Mắt Đang Đóng
    COMPARE -- ĐÚNG (Mắt Đang Đóng) --> EYE_CLOSED["Ghi nhận Thời Gian Nhắm Mắt (dwellDuration)"]
    EYE_CLOSED --> CHECK_DWELL{"Kiểm tra dwellDuration"}

    CHECK_DWELL -- ">= 8.0 Giây" --> TRIGGER_SOS["🚨 KÍCH HOẠT BÁO ĐỘNG SOS KHẨN CẤP"]
    CHECK_DWELL -- ">= 2.5 Giây & < 8.0s" --> WAIT_UP["Đánh dấu cờ chuẩn bị Lệnh UP (Lên)"]
    CHECK_DWELL -- ">= 1.5 Giây & < 2.0s" --> WAIT_DOWN["Đánh dấu cờ chuẩn bị Lệnh DOWN (Xuống)"]
    CHECK_DWELL -- "< 1.5 Giây" --> INC_TIME["Tiếp tục tích lũy thời gian đóng"]

    %% Nhánh Mắt Vừa Mở Ra (Transition: Closed -> Open)
    COMPARE -- SAI (Mắt Đang Mở) --> CHECK_PREV{"Trạng thái frame trước là Đóng?"}
    
    CHECK_PREV -- Đúng (Vừa Mở Ra) --> EVALUATE_GESTURE{"Thời gian vừa nhắm mắt là bao lâu?"}
    CHECK_PREV -- Sai (Đang Mở Bình Thường) --> CHECK_TIMEOUT{"Hết thời gian chờ Blink Window?"}

    EVALUATE_GESTURE -- ">= 2.5s" --> EXEC_UP["Thực thi Lệnh: UP (Di chuyển Lên)"]
    EVALUATE_GESTURE -- "1.5s - 2.0s" --> EXEC_DOWN["Thực thi Lệnh: DOWN (Di chuyển Xuống)"]
    EVALUATE_GESTURE -- "< 0.6s (Nháy Nhanh)" --> ADD_BLINK["Tăng số lần nháy: blinkCount += 1
    Khởi động Time-Window Timer (1.5s)"]

    ADD_BLINK --> CHECK_COUNT{"blinkCount hiện tại?"}
    CHECK_COUNT -- "3 Lần (trong 3.5s)" --> EXEC_BACK["Thực thi Lệnh: BACK (Di chuyển Trái)
    Reset blinkCount = 0"]
    CHECK_COUNT -- "2 Lần" --> WAIT_2ND["Chờ xem có nháy lần 3 không..."]
    CHECK_COUNT -- "1 Lần" --> WAIT_1ST["Chờ xem có nháy lần 2 không..."]

    CHECK_TIMEOUT -- Có (Timeout 1.5s) --> FLUSH_BLINKS{"Số nháy chưa xử lý?"}
    FLUSH_BLINKS -- "2 Lần" --> EXEC_NEXT["Thực thi Lệnh: NEXT (Di chuyển Phải)
    Reset blinkCount = 0"]
    FLUSH_BLINKS -- "1 Lần" --> EXEC_SELECT["Thực thi Lệnh: SELECT (Nhấn / Chọn)
    Reset blinkCount = 0"]
    FLUSH_BLINKS -- "0 Lần" --> RESET_STATE["Giữ trạng thái tĩnh"]

    EXEC_UP & EXEC_DOWN & EXEC_BACK & EXEC_NEXT & EXEC_SELECT --> DISPATCH_NAV["Gửi Lệnh tới EyeNavigationProvider"]
    DISPATCH_NAV --> END_FRAME
    TRIGGER_SOS --> END_FRAME
    RESET_STATE --> END_FRAME
```

---

## 4. WORKFLOW 3: ĐIỀU HƯỚNG KHÔNG GIAN 2D & TỰ ĐỘNG CUỘN FOCUS (2D SPATIAL NAVIGATION ENGINE)

Quy trình quản lý danh sách các phần tử tương tác (`EyeFocusable`), tính toán hình học 2D không gian để di chuyển Focus Ring chính xác theo cử chỉ mắt và tự động cuộn màn hình.

```mermaid
flowchart TD
    RECEIVE_CMD["Nhận Lệnh Điều Hướng: (NEXT | BACK | UP | DOWN | SELECT)"] --> CHECK_CMD_TYPE{"Lệnh là gì?"}

    %% Nhánh SELECT
    CHECK_CMD_TYPE -- "SELECT" --> GET_CURRENT["Lấy phần tử đang có Focus hiện tại"]
    GET_CURRENT --> HAS_ACTION{"Có onSelect() hoặc onClick()?"}
    HAS_ACTION -- Có --> EXEC_ACTION["Kích hoạt Handler phần tử
    (Chuyển trang / Gõ chữ / Bật tính năng)"]
    HAS_ACTION -- Không --> NOOP["Bỏ qua"]
    EXEC_ACTION --> PLAY_FEEDBACK["Phát âm thanh Click / Đọc nhãn bằng TTS"]

    %% Nhánh Di Chuyển Không Gian
    CHECK_CMD_TYPE -- "NEXT / BACK / UP / DOWN" --> STEP1["BƯỚC 1: Kiểm Tra Ma Trận Nhóm (Grid / Matrix Matching)"]
    STEP1 --> HAS_GRID{"Phần tử có thuộc tính (row, col)?"}
    
    HAS_GRID -- Có --> FIND_GRID_NEIGHBOR["Tìm phần tử lân cận trong cùng Group:
    • NEXT: cùng row, col = col + 1
    • BACK: cùng row, col = col - 1
    • DOWN: row = row + 1, col tương đương
    • UP: row = row - 1, col tương đương"]
    FIND_GRID_NEIGHBOR --> FOUND_GRID{"Tìm thấy phần tử ô lưới?"}
    FOUND_GRID -- Có --> SET_NEW_FOCUS["Thiết lập Focus mới: setFocusedId(candidate.id)"]

    %% Bước 2: Nón không gian 2D
    HAS_GRID -- Không --> STEP2["BƯỚC 2: Tính Toán Nón Vector Không Gian 2D (Spatial Cone Search)"]
    FOUND_GRID -- Không --> STEP2
    
    STEP2 --> CALC_BOUNDS["Lấy Bounding Box getBoundingClientRect()
    Tính tâm hiện tại C1(x1, y1) và các tâm ứng viên C2(x2, y2)
    Tính dx = x2 - x1, dy = y2 - y1"]
    
    CALC_BOUNDS --> FILTER_CONE["Lọc ứng viên trong Nón Hướng Hợp Lệ:
    • NEXT: dx > 20 và |dy| <= 1.5 * |dx|
    • BACK: dx < -20 và |dy| <= 1.5 * |dx|
    • DOWN: dy > 20 và |dx| <= 1.5 * |dy|
    • UP: dy < -20 và |dx| <= 1.5 * |dy|"]
    
    FILTER_CONE --> FIND_MIN_DIST["Tìm ứng viên có khoảng cách Euclidean nhỏ nhất:
    min(sqrt(dx^2 + dy^2))"]
    
    FIND_MIN_DIST --> FOUND_CONE{"Tìm thấy ứng viên trong nón?"}
    FOUND_CONE -- Có --> SET_NEW_FOCUS

    %% Bước 3: Dự phòng mảng 1D tuần hoàn
    FOUND_CONE -- Không --> STEP3["BƯỚC 3: Tuyến Tính Tuần Hoàn (Cyclic 1D Fallback)"]
    STEP3 --> CYCLIC_MOVE["Chuyển sang phần tử kế tiếp / trước đó trong mảng đã đăng ký"]
    CYCLIC_MOVE --> SET_NEW_FOCUS

    %% Tự động cuộn trang và cập nhật UI
    SET_NEW_FOCUS --> AUTO_SCROLL["TỰ ĐỘNG CUỘN FOCUS (eyeFocusAutoScroll.ts)"]
    AUTO_SCROLL --> CHECK_VIEWPORT{"Phần tử có nằm ngoài Viewport?"}
    CHECK_VIEWPORT -- Có --> SMOOTH_SCROLL["window.scrollTo({ top, behavior: 'smooth' })"]
    CHECK_VIEWPORT -- Không --> RENDER_RING["Cập nhật Viền Sáng EyeFocusRing trên màn hình"]
    SMOOTH_SCROLL --> RENDER_RING
```

---

## 5. WORKFLOW 4: SOẠN THẢO VĂN BẢN TELEX & CHUYỂN ĐỔI GIỌNG NÓI (VIRTUAL KEYBOARD & TTS)

Quy trình người bệnh sử dụng cử chỉ mắt để chọn từng ký tự, tự động ghép dấu tiếng Việt Telex và phát âm ra loa thiết bị.

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Người Bệnh (Bằng Mắt)
    participant VK as VirtualKeyboard.tsx
    participant Telex as vietnameseTelex.ts (Engine)
    participant State as React Text Buffer State
    participant TTS as Web Speech API (window.speechSynthesis)
    participant Speaker as Loa Ngoài Thiết Bị

    Note over Patient, VK: Người bệnh di chuyển Focus Ring tới phím mong muốn
    Patient->>VK: Cử chỉ Nháy Mắt 1 lần (SELECT) vào phím "A"
    VK->>State: setText("a")
    State-->>VK: Cập nhật ô nhập văn bản: "a"

    Patient->>VK: Cử chỉ Nháy Mắt 1 lần (SELECT) vào phím dấu "S" (Dấu Sắc)
    VK->>Telex: applyVietnameseAccents("as")
    activate Telex
    Note over Telex: Tra bảng Hash Table combinations['as'] -> 'á'
    Telex-->>VK: Trả về chuỗi: "á"
    deactivate Telex
    VK->>State: setText("á")
    State-->>VK: Hiển thị ngay ký tự tiếng Việt hoàn chỉnh: "á"

    opt Sử dụng Cụm Câu Khẩn Cấp Nhanh
        Patient->>VK: Chọn phím tắt "SOS Hỗ trợ tôi" hoặc "Tôi đói bụng"
        VK->>State: setText("SOS Hỗ trợ tôi ngay!")
    end

    Note over Patient, VK: Người bệnh hoàn tất câu nói và điều hướng tới nút "GỬI / ĐỌC"
    Patient->>VK: Cử chỉ Nháy Mắt 1 lần (SELECT) vào nút [GỬI & ĐỌC]
    VK->>TTS: speakVietnamese(currentText)
    activate TTS
    TTS->>TTS: Khởi tạo SpeechSynthesisUtterance(currentText)
    TTS->>TTS: Cấu hình lang='vi-VN', rate=0.9, pitch=1.0
    TTS->>Speaker: Phát âm thanh giọng đọc tiếng Việt rõ ràng
    deactivate TTS
    Speaker-->>Patient: Âm thanh phát ra hoàn tất
```

---

## 6. WORKFLOW 5: TRÒ CHUYỆN TRỢ LÝ AI Y TẾ & CƠ CHẾ DỰ PHÒNG 4 TẦNG (GEMINI AI FALLBACK PIPELINE)

Quy trình gửi tin nhắn từ người bệnh tới AI Trợ lý Y tế qua Express Proxy Server với cơ chế chịu lỗi và tự động chuyển đổi mô hình AI dự phòng khi gặp sự cố quota.

```mermaid
flowchart TD
    START_CHAT["Người bệnh gõ tin nhắn & chọn GỬI tới AI"] --> CLIENT_FETCH["Client gửi HTTP POST /api/chat { message, history }"]
    CLIENT_FETCH --> SERVER_PROXY["Express Backend (server.ts) nhận Request"]
    
    SERVER_PROXY --> ATTACH_SYSTEM_PROMPT["Đính kèm Y Tế System Prompt:
    • Ngắn gọn 2-5 câu, động viên, ân cần
    • Ngôn ngữ Tiếng Việt chuẩn mực
    • Hướng dẫn kích hoạt SOS nếu khẩn cấp"]

    ATTACH_SYSTEM_PROMPT --> TRY_MODEL_1["TẦNG 1: Gọi Google Gemini flash-latest"]
    
    TRY_MODEL_1 --> CHECK_M1{"Thành công (200 OK)?"}
    CHECK_M1 -- Có --> PARSE_RESPONSE["Trích xuất Nội dung Phản hồi AI"]
    
    CHECK_M1 -- Lỗi (429 Quota / 503) --> TRY_MODEL_2["TẦNG 2: Fallback gemini-3.6-flash"]
    TRY_MODEL_2 --> CHECK_M2{"Thành công?"}
    CHECK_M2 -- Có --> PARSE_RESPONSE
    
    CHECK_M2 -- Lỗi --> TRY_MODEL_3["TẦNG 3: Fallback gemini-flash-lite-latest"]
    TRY_MODEL_3 --> CHECK_M3{"Thành công?"}
    CHECK_M3 -- Có --> PARSE_RESPONSE

    CHECK_M3 -- Lỗi --> TRY_MODEL_4["TẦNG 4: Fallback gemini-2.0-flash"]
    TRY_MODEL_4 --> CHECK_M4{"Thành công?"}
    CHECK_M4 -- Có --> PARSE_RESPONSE

    CHECK_M4 -- Tất cả đều lỗi --> FALLBACK_LOCAL["Kích hoạt Phản hồi Y tế Khẩn cấp Cố định:
    'Tôi đang gặp sự cố kết nối AI. Nếu bạn cần giúp đỡ gấp, hãy kích hoạt nút SOS!'"]

    PARSE_RESPONSE & FALLBACK_LOCAL --> RETURN_JSON["Server trả kết quả JSON về AiPage.tsx"]
    RETURN_JSON --> RENDER_CHAT["Render tin nhắn AI trên giao diện"]
    RENDER_CHAT --> AUTO_TTS["TỰ ĐỘNG PHÁT ÂM (Auto-TTS):
    Web Speech API tự động đọc to câu trả lời của AI cho bác sĩ/người thân cùng nghe"]
```

---

## 7. WORKFLOW 6: PHÁT HIỆN NGUY CẤP & KÍCH HOẠT CẤP CỨU SOS 8 GIÂY

Quy trình phát hiện khẩn cấp tự động khi người bệnh ngất xỉu, đột quỵ hoặc chủ động nhắm mắt liên tục 8 giây.

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Người Bệnh (Nhắm Mắt Giữ Lâu)
    participant EyeTracker as EyeTrackingProvider (CV)
    participant HUD as GlobalEyeHUD (Visual Countdown)
    participant SosPage as SosPage.tsx
    participant Geo as HTML5 Geolocation API
    participant Audio as Còi Báo Động (Web Audio)
    participant Phone as Hệ Thống Gọi Điện / Người Thân

    Patient->>EyeTracker: Nhắm mắt liên tục (EAR < 0.15)
    
    loop Mỗi 100ms trong 8 giây
        EyeTracker->>HUD: Cập nhật tiến trình: progress = (dwellDuration / 8.0) * 100
        HUD->>HUD: Hiển thị Vòng tròn đếm ngược màu đỏ nổi bật
    end

    Note over EyeTracker: Thời gian nhắm mắt chạm mốc 8.0 GIÂY LIÊN TỤC
    EyeTracker->>SosPage: Kích hoạt sự kiện SOS_TRIGGER_EVENT

    SosPage->>Audio: Phát âm thanh Còi Báo Động Cấp Cứu liên tục âm lượng tối đa
    SosPage->>Geo: navigator.geolocation.getCurrentPosition()
    
    activate Geo
    Geo-->>SosPage: Trả về Tọa độ thực tế (Latitude, Longitude)
    deactivate Geo

    SosPage->>SosPage: Hiển thị Bản đồ Vị trí Bệnh nhân & Địa chỉ Cấp cứu
    SosPage->>Phone: Mở liên kết gọi khẩn cấp (tel:115 hoặc SĐT Người Thân)
    
    note over SosPage, Patient: Người bệnh hoặc Người nuôi bệnh có thể chọn nút "TẮT BÁO ĐỘNG" để hủy nếu nhấn nhầm
```

---

## 8. WORKFLOW 7: TÌM KIẾM & PHÁT GIẢI TRÍ ĐA PHƯƠNG TIỆN (YOUTUBE ENTERTAINMENT STREAM)

Quy trình tìm kiếm nội dung sách nói, radio, bài hát và điều khiển trình phát video trực tiếp bằng cử chỉ mắt.

```mermaid
flowchart TD
    START_ENT["Người bệnh vào EntertainmentPage.tsx"] --> SELECT_TAB["Chọn Thể Loại: (Sách Nói | Radio | Âm Nhạc)"]
    SELECT_TAB --> INPUT_KEYWORD["Soạn từ khóa bằng Bàn phím Mắt (Ví dụ: 'Truyện Kiều')"]
    
    INPUT_KEYWORD --> ENHANCE_QUERY["Tối Ưu Hóa Từ Khóa Tiếng Việt:
    • Tab Sách: 'Truyện Kiều sách nói audio'
    • Tab Radio: 'Truyện Kiều radio tin tức'
    • Tab Nhạc: 'Truyện Kiều bài hát acoustic'"]

    ENHANCE_QUERY --> CHECK_ENV{"Môi trường Triển Khai?"}

    CHECK_ENV -- Node.js Full-stack --> CALL_BACKEND["Gọi Express Proxy: GET /api/youtube/search?q=..."]
    CHECK_ENV -- Serverless / Netlify Static --> DIRECT_CLIENT["Client Fetch trực tiếp YouTube API (có API Key)"]

    CALL_BACKEND --> CHECK_API_SUCCESS{"API trả lời thành công?"}
    DIRECT_CLIENT --> CHECK_API_SUCCESS

    CHECK_API_SUCCESS -- Có --> PARSE_ITEMS["Nhận danh sách 10-20 Video (Title, Thumbnail, VideoId)"]
    CHECK_API_SUCCESS -- Lỗi / Hết Quota --> LOAD_CURATED["Nạp Danh Sách Tuyển Chọn Có Sẵn (Curated Fallback List)"]

    PARSE_ITEMS & LOAD_CURATED --> RENDER_GRID["Hiển thị Danh Sách Video dạng Ô Lưới Lớn (EyeFocusable)"]
    RENDER_GRID --> EYE_SELECT["Người bệnh dùng cử chỉ mắt chọn 1 Video"]
    EYE_SELECT --> PLAY_VIDEO["Nhúng YouTube Embedded IFrame Player & Tự động phát"]
    PLAY_VIDEO --> CONTROL_BAR["Hiển thị Thanh Điều Khiển bằng Mắt: (Tạm dừng, Phát tiếp, Chọn bài khác)"]
```

---

## 9. WORKFLOW 8: QUẢN LÝ DANH BẠ & NHẮN TIN NGƯỜI - NGƯỜI (REALTIME CHAT & SUPABASE SYNC)

Quy trình chọn người liên hệ, soạn thảo tin nhắn bằng mắt và truyền tải tin nhắn thời gian thực qua cơ sở dữ liệu Supabase.

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Người Bệnh
    participant Contacts as ContactsPage.tsx
    participant Chat as HumanChatPage.tsx
    participant Supabase as Supabase Client (PostgreSQL)
    actor Caregiver as Người Thân / Bác Sĩ (Điện Thoại)

    Patient->>Contacts: Mở Danh bạ & Nháy mắt chọn Người thân (VD: "Bác sĩ Nam")
    Contacts->>Chat: Chuyển hướng sang phòng chat với Contact ID tương ứng

    Chat->>Supabase: Lấy lịch sử trò chuyện (SELECT * FROM messages WHERE chat_id = ...)
    Supabase-->>Chat: Trả về danh sách tin nhắn trước đó

    Chat->>Supabase: Đăng ký lắng nghe sự kiện Realtime (supabase.channel('messages'))

    Note over Patient, Chat: Người bệnh dùng Bàn phím Mắt soạn tin nhắn: "Hôm nay tôi thấy đỡ mỏi mắt hơn"
    Patient->>Chat: Nháy mắt chọn nút [GỬI TIN NHẮN]
    
    Chat->>Supabase: INSERT INTO messages (sender_id, receiver_id, content)
    activate Supabase
    Supabase-->>Chat: Xác nhận tin nhắn đã lưu vào CSDL
    Supabase-->>Caregiver: Đẩy thông báo tin nhắn mới qua WebSocket Realtime
    deactivate Supabase

    Caregiver->>Caregiver: Xem tin nhắn & Trả lời: "Tốt lắm, bác nghỉ ngơi nhé"
    Caregiver->>Supabase: Gửi tin nhắn trả lời
    Supabase-->>Chat: WebSocket đẩy tin nhắn của Caregiver về màn hình người bệnh
    Chat->>Chat: Hiển thị tin nhắn mới & Web Speech API đọc to tin nhắn nhận được
```

---

## 10. WORKFLOW 9: QUY TRÌNH ĐÓNG GÓI, TRIỂN KHAI & BUILD CI/CD (DEPLOYMENT & EDGE FALLBACK)

Quy trình biên dịch mã nguồn và chiến lược triển khai linh hoạt trên cả hạ tầng Node.js nguyên bản lẫn nền tảng Edge CDN không máy chủ (Netlify / Vercel).

```mermaid
flowchart TD
    CODE_PUSH["Developer Push Code lên Git Repository (main branch)"] --> CI_BUILD["Khởi chạy CI/CD Pipeline (Build Process)"]
    
    CI_BUILD --> STEP_TS["1. TypeScript Type Checking (tsc -b)"]
    STEP_TS --> STEP_VITE["2. Vite Production Bundle (vite build)"]
    STEP_VITE --> ASSET_GEN["Tạo thư mục tĩnh /dist (HTML, CSS, JS, Chunk Assets)"]

    ASSET_GEN --> DEPLOY_TARGET{"Lựa Chọn Mục Tiêu Triển Khai"}

    %% Nhánh Netlify Static Edge
    DEPLOY_TARGET -- "Triển khai Netlify Edge (Serverless)" --> NETLIFY_DEPLOY["Netlify Build Engine"]
    NETLIFY_DEPLOY --> NETLIFY_CONFIG["Đọc cấu hình netlify.toml:
    • Publish: dist
    • SPA Redirect: /* -> /index.html (200)"]
    NETLIFY_CONFIG --> EDGE_SERVE["Phục vụ Website toàn cầu qua Global CDN"]
    EDGE_SERVE --> CLIENT_MODE["Ứng dụng tự động chạy ở chế độ Client-Direct:
    • Gemini gọi trực tiếp qua VITE_GEMINI_API_KEY
    • YouTube gọi trực tiếp qua VITE_YOUTUBE_API_KEY"]

    %% Nhánh Node.js Full-stack
    DEPLOY_TARGET -- "Triển khai Máy Chủ Riêng / Docker" --> DOCKER_BUILD["Đóng gói Docker / Node Server"]
    DOCKER_BUILD --> START_EXPRESS["Khởi chạy server.ts:
    • Phục vụ Static Files từ /dist
    • Cung cấp Backend API Proxy (/api/chat, /api/youtube)
    • Ẩn API Key an toàn trong biến môi trường Server"]
    START_EXPRESS --> SERVER_SERVE["Hoạt động Full-stack ổn định và bảo mật cao"]
```

---

## TỔNG KẾT BẢNG THAM CHIẾU CÁC FILE NGUỒN TƯƠNG ỨNG

| Quy Trình (Workflow) | File Mã Nguồn Chính | Công Nghệ & Thư Viện Sử Dụng |
| :--- | :--- | :--- |
| **Khởi tạo & Hiệu chuẩn Mắt** | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx), [`eyeTracker.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeTracker.ts) | MediaPipe FaceMesh CDN, HTML5 Video |
| **Máy trạng thái cử chỉ (FSM)** | [`EyeTrackingProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeTrackingProvider.tsx) | Finite State Machine, EAR Euclidean, Time-Window |
| **Điều hướng không gian 2D** | [`EyeNavigationProvider.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/EyeNavigationProvider.tsx), [`eyeFocusAutoScroll.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/eye-control/eyeFocusAutoScroll.ts) | Spatial Vector Cone, BoundingBox Rect, DOM Scroll |
| **Soạn thảo Telex & TTS** | [`VirtualKeyboard.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/modules/virtual-keyboard/VirtualKeyboard.tsx), [`vietnameseTelex.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/utils/vietnameseTelex.ts) | Telex Accents Hash Map, Web Speech API |
| **Trợ lý AI & Fallback** | [`AiPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/AiPage.tsx), [`server.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/server.ts) | Google Gemini SDK (`@google/genai`), Express 4 |
| **Cấp cứu SOS 8 Giây** | [`SosPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/SosPage.tsx), [`GlobalEyeHUD.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/components/ui/GlobalEyeHUD.tsx) | Geolocation API, Web Audio Siren, Countdown Timer |
| **Giải trí Đa phương tiện** | [`EntertainmentPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/EntertainmentPage.tsx), [`entertainmentService.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/services/entertainmentService.ts) | YouTube Data API v3, Embedded IFrame |
| **Danh bạ & Nhắn tin Realtime** | [`HumanChatPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/HumanChatPage.tsx), [`ContactsPage.tsx`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/src/pages/ContactsPage.tsx) | Supabase PostgreSQL Client, Realtime Channels |
| **Build & Triển khai** | [`netlify.toml`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/netlify.toml), [`vite.config.ts`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/vite.config.ts), [`package.json`](file:///c:/Users/Admin/Downloads/eyetalk-assistant/package.json) | Vite 6, TailwindCSS v4, Netlify SPA Redirects |

---
*Tài liệu Workflow được biên soạn hoàn chỉnh cho dự án EYEAI.*
