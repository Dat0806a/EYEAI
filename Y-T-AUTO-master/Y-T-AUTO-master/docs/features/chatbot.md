# Feature: Text Chatbot (F11)

## Description
Trợ lý AI hỗ trợ trả lời các thắc mắc về kết quả xét nghiệm, thực đơn ăn uống và tập luyện.

## Acceptance Criteria
- Chatbot hiển thị dạng cửa sổ chat nổi ở góc dưới bên phải màn hình.
- Trả lời bằng tiếng Việt thân thiện, rõ ràng, dựa trên ngữ cảnh chỉ số xét nghiệm hiện tại của người dùng.
- Chatbot tuân thủ các quy tắc an toàn y khoa: Không chẩn đoán bệnh, không kê đơn thuốc.

## Voice support (F16)
- Input bằng giọng nói (Web Speech API) và output bằng `speechSynthesis` đã được tích hợp vào ChatWidget; xem [voice_chat.md](voice_chat.md).
