import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config';
import { IOCRProvider, OcrScanOutput } from './types';
import { normalizeOcrLines } from './normalizer';

export class GeminiOcrProvider implements IOCRProvider {
  readonly name = 'GEMINI';
  private genAI: GoogleGenerativeAI | null;

  constructor() {
    this.genAI = config.geminiApiKey ? new GoogleGenerativeAI(config.geminiApiKey) : null;
  }

  async scanAndNormalize(imageBuffer: Buffer): Promise<OcrScanOutput> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình cho OCR provider.');
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt =
      'Đây là ảnh giấy xét nghiệm y tế. Hãy trích xuất chính xác các chỉ số xét nghiệm dưới dạng từng dòng, ' +
      'mỗi dòng gồm: MÃ CHỈ SỐ | TÊN CHỈ SỐ | GIÁ TRỊ | ĐƠN VỊ | KHOẢNG THAM CHIẾU. ' +
      'Chỉ trả về danh sách dòng, không giải thích gì thêm.';
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
    ]);
    const rawText = result.response.text();
    const results = normalizeOcrLines(rawText);
    if (results.length === 0) {
      throw new Error('Không nhận diện được chỉ số nào từ ảnh. Vui lòng chụp lại ảnh rõ hơn.');
    }
    return { results, rawText, provider: this.name };
  }
}
