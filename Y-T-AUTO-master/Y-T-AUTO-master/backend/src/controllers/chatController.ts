import { Request, Response } from 'express';
import { getDb } from '../database';
import { createAIProvider } from '../services/ai';
import { getProfile } from '../repositories/authRepository';
import { calculateAge, uuid } from '../utils/age';
import { AuthedRequest } from '../middleware/auth';

interface ChatBody {
  sessionId?: string;
  reportId?: string;
  message: string;
}

export async function sendMessage(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const { sessionId, reportId, message } = req.body as ChatBody;
    const userId = req.userId as string;
    const db = await getDb();

    let activeSessionId = sessionId;
    if (activeSessionId) {
      const session = await db.get<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM chat_sessions WHERE id = ?',
        activeSessionId,
      );
      if (!session || session.user_id !== userId) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiên chat.' },
        });
        return;
      }
    } else {
      activeSessionId = uuid();
      await db.run('INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)', activeSessionId, userId);
    }

    await db.run(
      'INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      uuid(),
      activeSessionId,
      'USER',
      message,
    );

    let reportSummary: string | undefined;
    if (reportId) {
      const report = await db.get<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM lab_reports WHERE id = ?',
        reportId,
      );
      if (report && report.user_id === userId) {
        const abnormal = await db.all<{ test_name: string; test_code: string; status: string }[]>(
          "SELECT test_name, test_code, status FROM lab_results WHERE report_id = ? AND status != 'NORMAL'",
          reportId,
        );
        reportSummary =
          abnormal.length > 0
            ? `Có ${abnormal.length} chỉ số nằm ngoài khoảng tham chiếu: ${abnormal.map((r) => `${r.test_name} (${r.test_code})`).join(', ')}`
            : 'Các chỉ số nằm trong khoảng tham chiếu.';
      }
    }

    const profile = await getProfile(userId);
    const context = {
      profile: profile
        ? { age: calculateAge(profile.date_of_birth), gender: profile.gender }
        : undefined,
      reportSummary,
    };
    const provider = createAIProvider();
    const reply = await provider.answerChat(message, context);

    await db.run(
      'INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      uuid(),
      activeSessionId,
      'ASSISTANT',
      reply,
    );
    await db.run("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?", activeSessionId);

    res.json({
      success: true,
      data: { sessionId: activeSessionId, reply, audioUrl: null },
      error: null,
    });
  } catch (err) {
    const e = err as Error;
    console.error(e);
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'CHAT_FAILED', message: e.message ?? 'Không thể trả lời.' },
    });
  }
}
