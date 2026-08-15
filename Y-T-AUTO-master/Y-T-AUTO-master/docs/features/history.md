# Feature: History & Persistence (F10)

## Description
Lưu trữ và xem lại các kết quả phân tích xét nghiệm, thực đơn và bài tập cũ của người dùng.

## Read and Write Semantics
- Mỗi lần xác nhận ghi analysis summary, explanation theo từng occurrence của kết quả, meal plan và exercise plan trong cùng một transaction.
- Report detail ưu tiên dữ liệu đã lưu: summary/explanation không rỗng trong database được trả nguyên vẹn và frontend map trực tiếp khi navigation từ History hoặc direct reload.
- Với report legacy có narrative `NULL`, rỗng hoặc chỉ có khoảng trắng, backend tạo fallback xác định từ giá trị và reference range đã lưu. Fallback là read-only, không âm thầm sửa hoặc xóa dữ liệu lịch sử.
- Hai confirmation đồng thời cho cùng report được serialize theo transaction. Bundle commit sau cùng thay thế trọn vẹn bundle trước đó (last-commit-wins), không trộn summary/results/meal/exercise giữa hai lần ghi.
- Report detail đọc report, results, meal plan và exercise plan trong một read transaction, vì vậy một response luôn thuộc cùng một database snapshot ngay cả khi confirmation mới commit đồng thời.

## Acceptance Criteria
- Mọi dữ liệu về phiếu xét nghiệm (`lab_reports`, `lab_results`, `meal_plans`, `exercise_plans`) đều phải được lưu trữ vĩnh viễn trong CSDL thật.
- Người dùng có thể xem danh sách lịch sử sắp xếp theo thời gian tại màn hình Lịch sử.
- Người dùng click vào một mục lịch sử sẽ hiển thị lại đầy đủ giao diện giải thích kết quả và thực đơn/bài tập của lần quét đó mà không cần quét lại.
- Direct route `/analysis/:reportId` không cần navigation state và vẫn hiển thị đúng stored-first summary/explanation từ report detail API.
- Legacy fallback phải giữ tính thông tin, không chẩn đoán và không mutate các cột narrative cũ trong lúc đọc.
- Lỗi giữa transaction xác nhận phải rollback toàn bộ bundle và giữ nguyên phiên bản đã commit trước đó.
