import { config } from '../../config';
import { DevOcrProvider } from './devProvider';
import { GeminiOcrProvider } from './geminiProvider';
import { IOCRProvider, OcrResultItem } from './types';

export function createOcrProvider(): IOCRProvider {
  if (config.geminiApiKey) {
    return new GeminiOcrProvider();
  }
  return new DevOcrProvider();
}

export type { IOCRProvider, OcrResultItem };
