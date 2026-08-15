# User Flows — Y tế cho người bình thường

## 1. Flow Đăng ký & Hoàn thiện Hồ sơ
```
[/register]
   ├── Google REGISTER ──┐
   ├── Facebook REGISTER ├──> [Identity mới?] ──> [Tạo đúng 1 user + session]
   ├── Phone REGISTER ───┘            │
   └── Email + password               └── existing: LOGIN_REQUIRED, không duplicate
                                                │
                                                ▼
                              [Nhập Họ tên, Ngày sinh, Giới tính]
                                                │
                                                ▼
                                            [Dashboard]
```
*Điều kiện:* Nếu người dùng chưa cập nhật thông tin hồ sơ (ngày sinh, giới tính), hệ thống sẽ chặn không cho sử dụng tính năng Scan OCR và yêu cầu điền đầy đủ.

## 2. Flow Đăng nhập bằng Số điện thoại
```
[Login: provider phoneOtp khả dụng]
       │
       ▼
[Nhập số VN/quốc tế] ──> [POST /auth/phone/request + browser binding]
       │                              │
       │                              ▼
       │                  [Challenge + countdown server]
       │                              │
       ▼                              ▼
[Nhập OTP 6 số] ───────> [POST /auth/phone/verify]
                                      │
                         ├── existing: [AuthContext validate /auth/me]
                         └── unknown: REGISTRATION_REQUIRED → /register
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
              [Chưa có profile]                [Đã có profile]
                 /profile                        /dashboard
```
*Error/retry:* invalid, expired, attempts exceeded, rate limit, provider unavailable và generic invalid-or-expired được hiển thị bằng thông báo an toàn. Resend/request/verify tôn trọng `resendAvailableAt` và `Retry-After`; đổi số không xóa rate deadline.

## 3. Flow OAuth Đăng nhập
```
[/login] ──> [Google/Facebook ?intent=LOGIN] ──> [State + browser + purpose proof]
       └── existing identity ──> [Opaque code + LOGIN] ──> [Exchange + JWT]
       └── unknown identity ───> REGISTRATION_REQUIRED ──> [/register]
```

OAuth LOGIN không tạo user. OAuth REGISTER không đăng nhập identity đã có. LINK luôn bắt đầu từ profile authenticated và identity thuộc user khác trả conflict.

## 4. Flow Liên kết Số điện thoại
```
[Profile authenticated, chưa verified phone]
       │
       ▼
[Thêm số điện thoại] ──> [LINK request bound user/browser]
       │
       ▼
[OTP verify] ──> [Link E.164 hoặc identity conflict]
       │
       ▼
[Refresh /auth/me] ──> [Hiển thị Đã xác minh + maskedPhone]
```

## 5. Flow Core: Scan OCR -> Review -> Analysis -> Recommendations
```
[Dashboard (Click SCAN OCR)] 
       │
       ▼
[Upload File / Chụp ảnh] ──(Kiểm tra MIME, Kích thước)──> [Hiển thị Loading/Skeleton OCR]
                                                                  │
                                                                  ▼
[Màn hình Review dữ liệu OCR] <─── (Chỉnh sửa thủ công chỉ số nếu sai)
       │
  (Xác nhận kết quả)
       │
       ▼
[Gọi API Phân tích AI & Lưu DB] ──> [Hiển thị Loading/Skeleton Analysis]
                                              │
                                              ▼
[Màn hình Giải thích Kết quả Xét nghiệm] (LOW/NORMAL/HIGH)
       │
       ├───> [Tab 1: Giải thích Chỉ số]
       ├───> [Tab 2: Thực đơn hỗ trợ (Meal Plan)]
       └───> [Tab 3: Bài tập vận động (Exercise)]
```

## 6. Flow Tra cứu Lịch sử (History Flow)
```
[Dashboard / Avatar Menu] ──> [Màn hình Lịch sử] ──> [Danh sách các lần quét cũ] 
                                                                 │
                                                            (Click xem chi tiết)
                                                                 │
                                                                 ▼
                                                  [Hiển thị kết quả Phân tích,
                                                   Thực đơn & Bài tập đã lưu]
```

## 7. Flow Tương tác với Chatbot (Chatbot Flow)
```
[Màn hình bất kỳ (Click Icon Chatbot góc dưới phải)] ──> [Mở hộp thoại Chat]
                                                                 │
                                                      (Nhập câu hỏi bằng text/giọng nói)
                                                                 │
                                                                 ▼
                                                      [AI trả lời dựa trên ngữ cảnh 
                                                       kết quả xét nghiệm hiện tại]
```
