import { GeminiAIProvider } from '../src/services/ai/geminiProvider';
import {
  goldenConfirmedLabResults,
  goldenLabAnalysis,
  goldenLabReportId,
} from './fixtures/labAnalysisGolden';

describe('GeminiAIProvider lab analysis', () => {
  it('matches the exact golden LabAnalysis without calling text', async () => {
    const geminiProvider = new GeminiAIProvider();
    const textSpy = jest
      .spyOn(geminiProvider as unknown as { text: () => Promise<string> }, 'text')
      .mockRejectedValue(new Error('private text boundary called'));

    const actual = await geminiProvider.analyzeLabResults(
      goldenLabReportId,
      goldenConfirmedLabResults,
      30,
    );

    expect(actual).toEqual(goldenLabAnalysis);
    expect(textSpy).not.toHaveBeenCalled();
  });
});
