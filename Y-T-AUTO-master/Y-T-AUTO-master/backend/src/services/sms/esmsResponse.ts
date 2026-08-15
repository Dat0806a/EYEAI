export interface EsmsSendResponse {
  CodeResult: string;
  CountRegenerate?: number;
  SMSID?: string;
  ErrorMessage?: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEsmsSendResponse(value: unknown): EsmsSendResponse | null {
  if (!isRecord(value) || typeof value.CodeResult !== 'string' || value.CodeResult.length === 0) {
    return null;
  }
  if (
    value.CountRegenerate !== undefined
    && (!Number.isSafeInteger(value.CountRegenerate) || (value.CountRegenerate as number) < 0)
  ) {
    return null;
  }
  if (value.SMSID !== undefined && typeof value.SMSID !== 'string') return null;
  if (value.ErrorMessage !== undefined && typeof value.ErrorMessage !== 'string') return null;
  return value as EsmsSendResponse;
}
