# Feature: Authentication (F01)

## Description
Tính năng đăng ký, đăng nhập và đăng xuất người dùng để quản lý phiên hoạt động và lưu lịch sử.

## Target Audience
Người dùng phổ thông của ứng dụng muốn lưu trữ dữ liệu y tế cá nhân một cách bảo mật.

## User Flows
1. Người dùng truy cập website.
2. Nếu chưa đăng nhập, người dùng được hiển thị màn hình Đăng ký / Đăng nhập.
3. Người dùng đăng ký bằng Email và Password hoặc đăng nhập với thông tin đã tạo.
4. Sau khi đăng ký thành công, người dùng được chuyển tới trang điền thông tin Hồ sơ (F02).

## Acceptance Criteria
- Trường email phải đúng định dạng email.
- Mật khẩu phải có tối thiểu 6 ký tự.
- Phiên làm việc được duy trì qua JWT token hoặc session cookie.
- Khi đăng xuất, token bị vô hiệu hóa.

## Known Limitations
- Giai đoạn MVP chỉ hỗ trợ đăng nhập email/mật khẩu thông thường. Đăng nhập Google/Facebook sẽ được tích hợp sau ở P1/P2.
