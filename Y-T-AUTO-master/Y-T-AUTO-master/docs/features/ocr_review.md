# Feature: OCR Review & Confirm (F06)

## Description
Màn hình trung gian hiển thị kết quả OCR và cho phép người dùng hiệu chỉnh trước khi gửi đi phân tích chính thức.

## Acceptance Criteria
- Hiển thị danh sách các chỉ số nhận diện được dưới dạng bảng hoặc các thẻ dễ chỉnh sửa.
- Cho phép người dùng chỉnh sửa: Tên chỉ số, Giá trị, Đơn vị, Ngưỡng bình thường.
- Đánh dấu và highlight (màu cam/vàng) đối với các chỉ số có độ tin cậy OCR thấp hoặc thiếu khoảng tham chiếu để người dùng chú ý.
- Chỉ khi người dùng click nút "Xác nhận kết quả", quá trình Phân tích AI mới được thực hiện.
