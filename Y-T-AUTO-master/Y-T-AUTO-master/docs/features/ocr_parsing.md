# Feature: OCR Processing & Parsing (F05)

## Description
Xử lý trích xuất thông tin chữ từ ảnh xét nghiệm và phân tích thành dữ liệu JSON cấu trúc chuẩn.

## JSON Schema Contract
Dữ liệu đầu ra của OCR Service phải tuân theo cấu trúc JSON Schema được định nghĩa tại `contracts/json/ocr_result.schema.json`.

## Acceptance Criteria
- Trích xuất được các thông tin: test_code, test_name, value, unit, referenceRange.
- Chuẩn hóa thông tin khoảng tham chiếu (reference_low, reference_high, reference_text).
- Tính toán độ tin cậy nhận diện (ocrConfidence) cho từng chỉ số nếu API OCR hỗ trợ (hoặc mô phỏng dựa trên cấu trúc nhận diện được từ AI).
- Backend phải thực hiện validation cấu trúc trước khi trả về frontend.
