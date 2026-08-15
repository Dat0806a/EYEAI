import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const oauthExchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  intent: z.enum(['LOGIN', 'REGISTER', 'LINK']),
}).strict();

export const phoneRequestSchema = z.object({
  phone: z.string().trim().min(1).max(64),
}).strict();

export const phoneVerifySchema = z.object({
  challengeToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^[0-9]{6}$/),
}).strict();

export const profileSchema = z.object({
  fullName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải theo định dạng YYYY-MM-DD'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
});

export const referenceRangeSchema = z.object({
  low: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  text: z.string().nullable().optional(),
});

export const labResultSchema = z.object({
  testCode: z.string().min(1),
  testName: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  referenceRange: referenceRangeSchema.optional(),
});

export const confirmAnalysisSchema = z.object({
  reportId: z.string().uuid(),
  results: z.array(labResultSchema).min(1),
});

export const chatMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
