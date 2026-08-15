# PRD — Y tế cho người bình thường

## 1. Product Problem
Giấy xét nghiệm y tế thường chứa các ký hiệu viết tắt khó hiểu (WBC, RBC, SGOT, SGPT...), các chỉ số định lượng phức tạp và các khoảng tham chiếu chuyên môn mà người dùng phổ thông không thể tự hiểu. Điều này dẫn đến sự lo lắng không đáng có hoặc bỏ qua các dấu hiệu cảnh báo sức khỏe quan trọng.

## 2. Target Users
- Người dùng phổ thông không có kiến thức chuyên môn y khoa.
- Bệnh nhân muốn tự theo dõi các chỉ số sức khỏe định kỳ.
- Người lớn tuổi hoặc người chăm sóc muốn hiểu kết quả xét nghiệm của người thân.
- Những người muốn có gợi ý chế độ ăn uống, sinh hoạt lành mạnh sau khi nhận kết quả xét nghiệm.

## 3. Goals
- Giúp người dùng dễ dàng tải hoặc chụp ảnh giấy xét nghiệm.
- Trích xuất tự động và chính xác các chỉ số xét nghiệm thông qua OCR.
- Cho phép người dùng chỉnh sửa thông tin đã nhận diện trước khi xác nhận.
- Giải thích các chỉ số xét nghiệm bằng ngôn ngữ dễ hiểu, thân thiện, khoa học.
- Đưa ra các gợi ý dinh dưỡng (thực đơn) và vận động (bài tập thể dục) cá nhân hóa dựa trên chỉ số xét nghiệm và thông tin người dùng.
- Lưu trữ lịch sử xét nghiệm để theo dõi tiến trình sức khỏe qua thời gian.
- Cung cấp trợ lý AI chatbot hỗ trợ trả lời các thắc mắc về kết quả xét nghiệm.

## 4. Non-goals
- Thay thế chẩn đoán chính thức của bác sĩ hoặc hệ thống bệnh viện chuyên sâu.
- Kê đơn thuốc hoặc đề xuất liều lượng thuốc điều trị bệnh.
- Yêu cầu người dùng dừng hoặc thay đổi phác đồ điều trị của bác sĩ.

## 5. Jobs-to-be-done
- Khi tôi nhận được phiếu xét nghiệm máu, tôi muốn biết các chỉ số này có ý nghĩa gì để tôi không phải lo lắng hay tự tìm kiếm lung tung trên mạng.
- Khi một chỉ số của tôi bị cao hoặc thấp hơn bình thường, tôi muốn biết nguyên nhân sơ bộ và cách cải thiện thông qua ăn uống, tập luyện tại nhà.

## 6. Priorities & Main Workflow

### P0 (Core Requirements)
- Đăng nhập/Đăng ký/Hồ sơ người dùng (Họ tên, giới tính, ngày sinh).
- Tải ảnh/Chụp ảnh giấy xét nghiệm.
- Xử lý OCR và phân tích cấu trúc dữ liệu xét nghiệm (Normalized JSON).
- Màn hình review và chỉnh sửa kết quả OCR.
- Giải thích kết quả xét nghiệm (LOW/NORMAL/HIGH) bằng tiếng Việt dễ hiểu.
- Gợi ý thực đơn ăn uống hỗ trợ.
- Gợi ý bài tập vận động hỗ trợ.
- Lưu trữ lịch sử kết quả.
- Chatbot dạng văn bản (text).
- Giao diện responsive trên mobile và desktop.

### P1
- Google OAuth.
- Hình ảnh món ăn minh họa.
- Link YouTube bài tập vận động thực tế và đã xác minh.
- Chatbot bằng giọng nói (Voice Chat - Input/Output).

### P2
- Facebook OAuth.
- Đăng nhập bằng Số điện thoại & OTP.

### Main Workflow (Bắt buộc)
1. Đăng nhập / Đăng ký.
2. Tạo/Cập nhật Hồ sơ cá nhân (để có bối cảnh phân tích chỉ số).
3. Dashboard hiển thị nút hành động chính "SCAN OCR".
4. Tải ảnh hoặc chụp ảnh giấy xét nghiệm.
5. OCR quét ảnh và trích xuất chỉ số.
6. Hiển thị màn hình Review kết quả OCR (người dùng xác nhận/chỉnh sửa).
7. Phân tích chỉ số xét nghiệm sau khi được xác nhận.
8. Hiển thị giải thích dễ hiểu & cảnh báo chỉ số bất thường.
9. Đưa ra gợi ý thực đơn (Meal Plan) & bài tập (Exercise).
10. Lưu kết quả vào lịch sử.

## 7. Acceptance Criteria (Tiêu chí nghiệm thu)

### Đăng ký / Đăng nhập
- Người dùng có thể đăng ký bằng Email và Mật khẩu.
- Người dùng phải điền đầy đủ Profile (Họ tên, ngày sinh, giới tính) trước khi sử dụng tính năng phân tích.

### Tải ảnh / Chụp ảnh xét nghiệm
- Phải kiểm tra định dạng file ở client và backend (chỉ chấp nhận JPEG, PNG, PDF tối đa 10MB).
- Không cho phép gửi file rỗng hoặc file lỗi lên server.

### OCR & Phân tích
- Kết quả OCR phải được phân tích thành định dạng JSON có cấu trúc gồm: `testCode`, `testName`, `value`, `unit`, `referenceRange` (low, high, text), `ocrConfidence`.
- Chỉ số nào có độ tin cậy (`ocrConfidence`) thấp hoặc khoảng tham chiếu không xác định phải được highlight cảnh báo màu cam/vàng.
- Bắt buộc phải thông qua bước xác nhận của người dùng tại màn hình Review trước khi thực hiện bước phân tích AI.

### Phân tích AI & Giải thích
- AI không đưa ra chẩn đoán khẳng định bệnh hoặc khuyên dùng thuốc.
- Giải thích bằng tiếng Việt dễ hiểu cho các ký hiệu viết tắt (Ví dụ: "WBC là Số lượng bạch cầu - đóng vai trò phòng vệ chống vi khuẩn...").
- Trạng thái chỉ số phải được phân loại chính xác thành: `LOW`, `NORMAL`, `HIGH`, hoặc `UNKNOWN`.

### Thực đơn & Bài tập
- Meal plan phải có các bữa chính (Sáng, Trưa, Tối) và bữa phụ kèm nguyên liệu, cách chế biến và lý do lựa chọn.
- Bài tập thể dục phải ghi rõ độ khó, thời gian thực hiện, hướng dẫn và lý do tốt cho chỉ số nào.

### Lịch sử
- Lưu trữ mọi kết quả phân tích trong database và cho phép tải lại đầy đủ thông tin phân tích cũ.

## 8. Risks & Mitigation
- **OCR sai lệch chỉ số:** Giải quyết bằng cách cung cấp giao diện Review chi tiết và yêu cầu người dùng xác nhận thủ công trước khi phân tích.
- **Rủi ro chẩn đoán y tế (Medical Risk):** Hiển thị tuyên bố từ chối trách nhiệm (medical disclaimer) ở tất cả các trang phân tích. AI được cấu hình hệ thống nghiêm ngặt để không đưa ra chẩn đoán bệnh.
- **Bảo mật thông tin sức khỏe (Privacy Risk):** Dữ liệu xét nghiệm của người dùng A không được truy cập bởi người dùng B. Sử dụng API authentication.
