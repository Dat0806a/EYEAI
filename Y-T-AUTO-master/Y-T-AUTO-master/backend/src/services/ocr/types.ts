export interface ReferenceRange {
  low: number | null;
  high: number | null;
  text: string | null;
}

export interface OcrResultItem {
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceRange: ReferenceRange | null;
  ocrConfidence: number;
}

export interface OcrScanOutput {
  results: OcrResultItem[];
  rawText: string;
  provider: string;
}

export interface IOCRProvider {
  readonly name: string;
  scanAndNormalize(imageBuffer: Buffer): Promise<OcrScanOutput>;
}
