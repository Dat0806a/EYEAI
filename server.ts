import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Client-side initialization fallback checks
  const apiKey = process.env.GEMINI_API_KEY;

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Gemini chat completion endpoint
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: "Yêu cầu mảng tin nhắn (messages)." });
        return;
      }

      if (!apiKey) {
        res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trong môi trường hệ thống." });
        return;
      }

      // Convert messages to Gemini SDK roles
      const contents = messages
        .filter((msg: any) => msg.sender === 'user' || msg.sender === 'assistant')
        .map((msg: any) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }));

      if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
        res.status(400).json({ error: "Tin nhắn cuối cùng phải từ người dùng." });
        return;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: "Bạn là một trợ lý ảo thông minh, hữu ích và đồng cảm của hệ thống EyeTalk (phần mềm hỗ trợ người khuyết tật vận động/giao tiếp bằng mắt phát biểu thành lời). Hãy trả lời bằng Tiếng Việt một cách cực kỳ ngắn gọn, chân thành, dễ chịu và súc tích (khoảng 1 đến 2 câu ngắn). Vì người dùng giao tiếp bằng mắt nên phản hồi ngắn sẽ giúp họ nhanh chóng lựa chọn/phát âm các từ trả lời thích hợp tiếp theo."
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message || "Đã xảy ra lỗi khi trao đổi với Gemini API." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
