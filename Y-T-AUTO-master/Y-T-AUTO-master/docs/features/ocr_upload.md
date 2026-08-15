# Feature: OCR Upload & Camera (F04)

## Description
Chức năng chụp ảnh hoặc tải ảnh giấy xét nghiệm lên hệ thống.

## Acceptance Criteria
- Hỗ trợ tải file từ máy tính hoặc mở camera trên thiết bị di động để chụp ảnh.
- Kiểm tra định dạng tệp (chỉ cho phép các MIME type ảnh: image/jpeg, image/png, image/webp và ứng dụng PDF: application/pdf).
- Giới hạn kích thước tệp tải lên tối đa là 10MB.
- Phải hiển thị trạng thái loading/skeleton trong khi file đang được upload và xử lý ở backend.
