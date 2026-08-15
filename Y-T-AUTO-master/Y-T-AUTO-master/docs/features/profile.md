# Feature: User Profile (F02)

## Description
Thông tin cá nhân cơ bản để làm ngữ cảnh phân tích y tế động.

## User Flows
1. Sau khi đăng ký thành công lần đầu, hoặc khi click vào Avatar -> "Hồ sơ cá nhân".
2. Người dùng nhập: Họ và tên, Ngày sinh, Giới tính.
3. Người dùng click "Lưu hồ sơ".
4. Hệ thống tính tuổi tự động dựa trên ngày sinh và lưu thông tin vào CSDL.

## Acceptance Criteria
- Họ tên không được bỏ trống.
- Ngày sinh không được ở tương lai.
- Giới tính phải chọn một trong các giá trị: MALE, FEMALE, OTHER.
- Không lưu giá trị tuổi dạng số tĩnh mà tính toán động khi cần phân tích chỉ số y tế.
