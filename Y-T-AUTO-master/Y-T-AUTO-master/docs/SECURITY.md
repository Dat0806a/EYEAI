# Security — Y tế cho người bình thường

Tài liệu này tổng hợp các nguyên tắc bảo mật và chính sách riêng tư thông tin y tế được áp dụng trong sản phẩm "Y tế cho người bình thường".

## 1. Bảo mật Dữ liệu & Quyền riêng tư (Least Privilege & Privacy)
- **Kiểm soát Truy cập (Authorization):** 
  Dữ liệu sức khỏe là thông tin nhạy cảm. Mỗi bản ghi trong bảng `lab_reports`, `lab_results`, `meal_plans`, và `exercise_plans` đều liên kết chặt chẽ với một `user_id`. Hệ thống áp dụng kiểm tra quyền sở hữu tài nguyên ở tầng API middleware: Người dùng A tuyệt đối không được đọc hoặc sửa đổi dữ liệu của người dùng B.
- **Bảo mật File xét nghiệm (Private Storage):**
  Ảnh giấy xét nghiệm tải lên không được lưu công khai. Chúng phải được lưu ở thư mục lưu trữ riêng tư (private storage) của server hoặc bucket bảo mật của cloud. Khi Frontend cần hiển thị ảnh xét nghiệm, Backend sẽ tạo ra URL tạm thời có chữ ký xác thực (Signed/Temporary URLs) với thời gian hết hạn ngắn (ví dụ: 15 phút).

## 2. Phòng tránh Lộ thông tin nhạy cảm (Sensitive Logging & Secret Handling)
- **Lọc Log (Sanitized Logging):**
  Hệ thống ghi log ghi nhận hoạt động phục vụ mục đích debug và vận hành. Tuy nhiên, hệ thống tự động lọc bỏ các dữ liệu nhạy cảm khỏi log bao gồm: mật khẩu người dùng, mã thông báo truy cập (Access Token, Refresh Token), cookie phiên hoạt động, thông tin API key của Gemini/OCR, và thông tin chỉ số y tế chi tiết của người dùng.
- **Quản lý Secrets:**
  Tuyệt đối không commit các khóa bí mật (API Keys, DB Credentials, JWT Secrets) lên Git. Sử dụng tệp tin `.env` được khai báo trong `.gitignore` để quản lý cấu hình cục bộ và tệp cấu hình mẫu `.env.example`.

## 3. An toàn thông tin y tế (Medical Safety & AI Risk Mitigation)
Hệ thống sử dụng các quy tắc chỉ dẫn hệ thống (System Instructions) rất chặt chẽ đối với các mô hình AI để tránh gây hiểu lầm hoặc nguy hiểm cho người dùng:
- **Tuyên bố miễn trừ trách nhiệm (Medical Disclaimer):** Giao diện giải thích kết quả luôn hiển thị thông điệp: *"Ứng dụng chỉ cung cấp thông tin giải thích tham khảo, không thay thế cho chẩn đoán hoặc điều trị y tế chính thức từ bác sĩ."*
- **Giới hạn AI:** AI không được chẩn đoán bệnh cụ thể, không khuyên dùng các loại thuốc điều trị hoặc điều chỉnh phác đồ điều trị hiện tại của người dùng.
- **Xác thực thông tin:** AI không tự tiện bịa đặt các khoảng tham chiếu y khoa hoặc liên kết YouTube không tồn tại. Khoảng tham chiếu phải ưu tiên lấy trực tiếp từ phiếu xét nghiệm của người dùng.
