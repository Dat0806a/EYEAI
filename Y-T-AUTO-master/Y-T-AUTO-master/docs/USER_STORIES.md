# User Stories — Y tế cho người bình thường

## 1. Authentication & Profile
- **US1.1:** Là một người dùng mới, tôi muốn đăng ký tài khoản bằng Email và mật khẩu để tôi có thể lưu trữ lịch sử xét nghiệm cá nhân.
- **US1.1a:** Là người lần đầu sử dụng, tôi muốn `/register` hỗ trợ Google, Facebook, số điện thoại và Email/mật khẩu mà không đăng nhập nhầm vào account đã tồn tại.
- **US1.2:** Là một người dùng, tôi muốn cập nhật hồ sơ cá nhân của mình gồm họ tên, ngày sinh, và giới tính để hệ thống có thể tính toán tuổi và đưa ra các giải thích chỉ số xét nghiệm cũng như thực đơn ăn uống phù hợp với bối cảnh cơ thể tôi.
- **US1.3:** Là người đã có tài khoản, tôi muốn đăng nhập bằng Google/Facebook mà không tự tạo account nếu identity chưa đăng ký. (P1)
- **US1.4:** Là người đã có tài khoản, tôi muốn đăng nhập bằng phone OTP; unknown phone phải hướng sang đăng ký thay vì tự tạo user. (P2)
- **US1.4a:** Là người dùng mới, tôi muốn đăng ký bằng phone OTP và chỉ sau verification mới tạo đúng một account.
- **US1.5:** Là người dùng đã đăng nhập, tôi muốn liên kết một số điện thoại đã xác minh để có thêm phương thức đăng nhập, đồng thời chỉ thấy số đã che trên hồ sơ. (P2)
- **US1.6:** Là người dùng OTP, tôi muốn thấy countdown gửi lại/thử lại theo server, thông báo tiếng Việt an toàn cho mã sai/hết hạn/khóa/rate limit/provider unavailable và có thể đổi số mà không vượt thời gian chờ. (P2)

## 2. OCR Scan & Verification
- **US2.1:** Là một người dùng tại Dashboard, tôi muốn thấy nút "SCAN OCR" nổi bật nhất để tôi có thể bắt đầu quá trình quét giấy xét nghiệm ngay lập tức.
- **US2.2:** Là một người dùng, tôi muốn kéo thả ảnh chụp giấy xét nghiệm hoặc dùng camera trên điện thoại chụp lại để tải lên hệ thống.
- **US2.3:** Là một người dùng, tôi muốn xem lại các chỉ số mà AI đã trích xuất từ ảnh xét nghiệm tại màn hình Review, để tôi có thể chỉnh sửa các con số bị nhận diện sai trước khi gửi đi phân tích.
- **US2.4:** Là một người dùng, tôi muốn nhận được cảnh báo nổi bật đối với các chỉ số có độ tin cậy nhận diện thấp hoặc thiếu thông tin khoảng tham chiếu để tôi chú ý kiểm tra lại kỹ hơn.

## 3. Analysis & Medical Safety
- **US3.1:** Là một người dùng, tôi muốn xem giải thích dễ hiểu của từng chỉ số xét nghiệm bằng tiếng Việt để tôi nắm rõ tình trạng sức khỏe của mình mà không cần tra cứu y khoa phức tạp.
- **US3.2:** Là một người dùng, tôi muốn thấy cảnh báo trực quan bằng màu sắc (Đỏ cho Cao/Thấp, Xanh cho Bình thường) đối với các chỉ số của tôi để tôi nhanh chóng nhận biết vấn đề.
- **US3.3:** Là một người dùng, tôi muốn hệ thống hiển thị tuyên bố từ chối trách nhiệm y tế rõ ràng để tôi hiểu rằng đây chỉ là thông tin tham khảo hỗ trợ và tôi vẫn cần tham khảo ý kiến bác sĩ khi cần.

## 4. Supporting Recommendations (Meal Plan & Exercise)
- **US4.1:** Là một người dùng có chỉ số xét nghiệm bất thường, tôi muốn nhận được gợi ý thực đơn ăn uống hàng ngày (Sáng, Trưa, Tối, Phụ) để hỗ trợ điều hòa chỉ số sức khỏe của mình.
- **US4.2:** Là một người dùng, tôi muốn xem cách chuẩn bị nguyên liệu và lý do món ăn này tốt cho tôi để tôi có thể dễ dàng tự nấu tại nhà.
- **US4.3:** Là một người dùng, tôi muốn nhận gợi ý các bài tập thể dục phù hợp với thể trạng của mình kèm theo thời lượng và độ khó để cải thiện sức khỏe một cách an toàn.
- **US4.4:** Là một người dùng, tôi muốn xem video YouTube hướng dẫn tập luyện thực tế cho bài tập được đề xuất để tôi tập đúng tư thế. (P1)

## 5. History & Chatbot
- **US5.1:** Là một người dùng, tôi muốn xem lại danh sách các lần quét xét nghiệm cũ trong phần Lịch sử để tôi theo dõi sự thay đổi của các chỉ số qua thời gian.
- **US5.2:** Là một người dùng, tôi muốn chat với trợ lý AI ngay trên màn hình kết quả hoặc ở góc dưới màn hình để hỏi thêm về thực đơn hoặc giải nghĩa các chỉ số xét nghiệm chi tiết hơn.
