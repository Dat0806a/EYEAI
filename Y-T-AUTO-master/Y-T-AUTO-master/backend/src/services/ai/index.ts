import { config } from '../../config';
import { RuleBasedAIProvider } from './ruleBasedProvider';
import { GeminiAIProvider } from './geminiProvider';
import { IAIProvider } from './types';

export function createAIProvider(): IAIProvider {
  if (config.geminiApiKey) {
    return new GeminiAIProvider();
  }
  return new RuleBasedAIProvider();
}

export type { IAIProvider };
