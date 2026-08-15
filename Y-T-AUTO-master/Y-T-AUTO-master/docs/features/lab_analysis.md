# Feature: Lab Analysis & Explanation (F07)

## Description
Phân tích các kết quả đã được người dùng review và xác nhận, sau đó tạo phần tóm tắt và giải thích tiếng Việt dễ hiểu bằng logic xác định (deterministic). Nội dung này chỉ cung cấp thông tin tham khảo và không phải chẩn đoán y khoa.

## Public Narrative Rules
- Narrative công khai của xét nghiệm không gọi Gemini. Cả provider rule-based và Gemini đều dùng chung bộ phân tích xác định; Gemini chỉ còn phục vụ các ranh giới riêng như thực đơn, bài tập và chatbot.
- `LOW` và `HIGH` chỉ mô tả giá trị thấp hơn hoặc cao hơn giới hạn tham chiếu đã xác nhận trên phiếu, kèm lời khuyên trao đổi với bác sĩ khi cần; không suy diễn thành bệnh hoặc hướng dẫn dùng thuốc.
- `UNKNOWN` có nghĩa là không đủ giới hạn tham chiếu để phân loại. Nội dung phải yêu cầu kiểm tra lại phiếu thay vì khẳng định chỉ số bình thường hay bất thường.
- Khi không có kết quả đã xác nhận, summary trung tính là `Chưa có kết quả xét nghiệm đã xác nhận để phân tích.` và danh sách kết quả rỗng.
- Summary và từng explanation của một lần xác nhận được persist cùng report. Khi mở lịch sử hoặc tải trực tiếp URL report, frontend phải hiển thị narrative đã lưu thay vì tạo placeholder rỗng hoặc gọi phân tích lại.

## Acceptance Criteria
- Cung cấp giải thích chi tiết cho từng chỉ số bằng tiếng Việt dễ hiểu.
- Phân loại trạng thái chỉ số rõ ràng: LOW, NORMAL, HIGH, UNKNOWN.
- Tính trạng thái từ giá trị và giới hạn tham chiếu đã xác nhận, bao gồm khoảng hai phía và giới hạn một phía; không tự tạo reference range ngoài dữ liệu phiếu.
- Kết quả direct-load/history giữ nguyên summary, explanation, status và thứ tự kết quả đã persist.
- Tuyệt đối không đưa ra các chẩn đoán khẳng định bệnh hoặc hướng dẫn dùng thuốc điều trị.
- Phải hiển thị tuyên bố miễn trừ trách nhiệm y tế (medical disclaimer) ở giao diện phân tích.
