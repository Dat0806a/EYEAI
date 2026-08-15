import { normalizeOcrLines } from './normalizer';
import { IOCRProvider, OcrScanOutput } from './types';

export class DevOcrProvider implements IOCRProvider {
  readonly name = 'DEV_FALLBACK';
  async scanAndNormalize(imageBuffer: Buffer): Promise<OcrScanOutput> {
    const rawText = imageBuffer.toString('utf8');
    const results = normalizeOcrLines(rawText);
    if (results.length === 0) {
      throw new Error('Không nhận diện được chỉ số nào từ ảnh. Vui lòng chụp lại ảnh rõ hơn.');
    }
    return { results, rawText, provider: this.name };
  }
}
