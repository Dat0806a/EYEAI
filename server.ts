import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { handleEntertainmentSearch } from "./server/youtubeBackend";
import { createPatientRouter } from "./server/patientBackend";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "25mb" }));

  // API Health Check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const apiKey = process.env.GEMINI_API_KEY;

  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  const SYSTEM_INSTRUCTION = 
    "Bạn là Trợ lý AI giao tiếp và hỗ trợ hàng ngày thuộc hệ thống LUCKY DREAM – EYEAI (phần mềm hỗ trợ người dùng và bệnh nhân cần tiếp cận bằng ánh mắt). " +
    "Trả lời bằng Tiếng Việt thân thiện, rõ ràng, dễ đọc, khoảng 2 đến 5 câu ngắn gọn. " +
    "Tuyệt đối không tự nhận là bác sĩ, không chẩn đoán bệnh tật từ câu hỏi sức khỏe. " +
    "Nếu người dùng hỏi về sức khỏe, hãy đưa ra lời khuyên chăm sóc chung và khuyến khích tham khảo ý kiến chuyên gia y tế khi cần. " +
    "Nếu người dùng cần hỗ trợ khẩn cấp hoặc cấp cứu, hãy gợi ý họ sử dụng tính năng SOS trên màn hình chính của LUCKY DREAM. " +
    "Tránh viết các đoạn quá dài, danh sách dài dòng hoặc bảng biểu phức tạp trừ khi người dùng yêu cầu chi tiết.";

  // Shared Gemini chat handler function
  const handleAiChat = async (req: express.Request, res: express.Response) => {
    try {
      if (!apiKey || !ai) {
        res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trong hệ thống máy chủ." });
        return;
      }

      let userMessage = "";
      let historyMessages: any[] = [];

      if (req.body.message && typeof req.body.message === "string") {
        userMessage = req.body.message.trim();
        if (Array.isArray(req.body.history)) {
          historyMessages = req.body.history;
        }
      } else if (Array.isArray(req.body.messages) && req.body.messages.length > 0) {
        const lastMsg = req.body.messages[req.body.messages.length - 1];
        userMessage = (lastMsg?.text || lastMsg?.content || "").trim();
        historyMessages = req.body.messages.slice(0, -1);
      }

      // Input Validation
      if (!userMessage) {
        res.status(400).json({ error: "Nội dung tin nhắn không được để trống." });
        return;
      }

      if (userMessage.length > 2000) {
        res.status(400).json({ error: "Tin nhắn quá dài (vượt quá 2000 ký tự)." });
        return;
      }

      // Build contents array with history limit (last 15 turns max)
      const recentHistory = historyMessages.slice(-15);
      const contents: any[] = [];

      for (const msg of recentHistory) {
        const text = (msg.text || msg.content || "").trim();
        if (!text) continue;
        const role = msg.sender === 'user' ? 'user' : 'model';
        contents.push({ role, parts: [{ text }] });
      }

      // Append current user message
      contents.push({ role: 'user', parts: [{ text: userMessage }] });

      // Model list with official fallback
      const modelsToTry = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
      let lastError: any = null;
      let replyText = "";

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
            }
          });

          if (response && response.text) {
            replyText = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
          console.warn(`[GEMINI] Model ${modelName} failed:`, errMsg);
        }
      }

      if (replyText) {
        res.json({ message: replyText, text: replyText });
      } else {
        const errStr = typeof lastError === 'string' ? lastError : (lastError?.message || JSON.stringify(lastError || {}));
        console.error("[GEMINI] Model attempt failed. Error detail:", errStr);
        
        let statusCode = 500;
        let userFacingError = "Hiện tôi chưa thể trả lời. Bạn thử lại nhé.";

        if (errStr.includes("PERMISSION_DENIED") || errStr.includes("403") || errStr.includes("API_KEY_SERVICE_BLOCKED")) {
          statusCode = 403;
          userFacingError = "GEMINI_API_KEY bị từ chối hoặc bị giới hạn quyền dịch vụ (PERMISSION_DENIED).";
        } else if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") || errStr.includes("QUOTA")) {
          statusCode = 429;
          userFacingError = "Hệ thống Gemini đang quá tải hoặc đạt giới hạn lượt gọi (429 RATE_LIMIT).";
        } else if (errStr.includes("INVALID_ARGUMENT") || errStr.includes("400")) {
          statusCode = 400;
          userFacingError = "Yêu cầu không hợp lệ với Gemini API.";
        }

        res.status(statusCode).json({ error: userFacingError });
      }
    } catch (error: any) {
      console.error("[GEMINI] Express API Handler error:", error);
      res.status(500).json({ error: "Hiện tôi chưa thể trả lời. Bạn thử lại nhé." });
    }
  };

  // Backend Endpoints for AI Chat
  app.post("/api/ai/chat", handleAiChat);
  app.post("/api/gemini/chat", handleAiChat);
  // Dedicated Isolated Router for Patient Module (OCR Vision + Dynamic Lab Analysis + Health Chat)
  app.use("/api/patient", createPatientRouter(ai, apiKey));

  // Backend Endpoints for Entertainment YouTube Search (FREE QUOTA ONLY)
  app.get("/api/entertainment/search", handleEntertainmentSearch);
  app.post("/api/entertainment/search", handleEntertainmentSearch);

  // Backend Endpoint for Vietnamese TTS Audio (Google Translate TTS proxy)
  app.get("/api/tts", async (req, res) => {
    try {
      const text = (req.query.text as string || "").trim();
      if (!text) {
        res.status(400).send("Text is required");
        return;
      }
      const encoded = encodeURIComponent(text.slice(0, 250));
      const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;
      const response = await fetch(googleTtsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'audio/mpeg, audio/*, */*',
        },
      });
      if (!response.ok) {
        res.status(response.status).send(`TTS upstream error: ${response.statusText}`);
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error("[TTS] Local server error:", err);
      res.status(500).send("Error fetching TTS audio");
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
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();

