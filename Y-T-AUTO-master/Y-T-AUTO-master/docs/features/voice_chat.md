# Feature: Voice Chatbot (F16)

## Description
Hỗ trợ người dùng nhập liệu bằng giọng nói (Voice-to-Text) và nghe chatbot trả lời bằng giọng nói (Text-to-Speech) qua trình duyệt.

## Status
DONE (P1)

## Implementation
- Voice input dùng Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) với `lang=vi-VN`.
- Nút mic trong ChatWidget chuyển transcript nhận dạng vào ô nhập; nút bị vô hiệu hoá khi trình duyệt không hỗ trợ.
- Voice output dùng `speechSynthesis` với `SpeechSynthesisUtterance` `lang=vi-VN`; mỗi tin nhắn trợ lý có nút "Đọc câu trả lời".
- Lỗi quyền microphone được map sang thông báo tiếng Việt rõ ràng.

## Acceptance Criteria
- Người dùng bật mic trong chatbot và transcript tiếng Việt điền vào ô nhập.
- Người dùng có thể bấm đọc để nghe câu trả lời của chatbot bằng tiếng Việt.
- Khi trình duyệt không hỗ trợ hoặc từ chối quyền micro, UI vô hiệu hoá nút và/hoặc hiển thị thông báo rõ ràng.
- Không thay đổi các quy tắc an toàn y khoa của chatbot.
