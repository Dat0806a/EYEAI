import axios from 'axios';
import type {
  AnalysisBundle,
  AuthIntent,
  AuthSession,
  ConfirmedResult,
  HistoryReport,
  MeResponse,
  OcrScanResponse,
  OAuthAuthorization,
  OAuthProvider,
  OAuthSession,
  PhoneAccountStatus,
  PhoneOtpChallenge,
  Profile,
  ReportDetail,
} from '../types';

const api = axios.create({ baseURL: '/api', withCredentials: true });

export interface AuthProviders {
  google: boolean;
  facebook: boolean;
  phoneOtp: boolean;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('yte_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function register(email: string, password: string): Promise<{ userId: string; token: string }> {
  const res = await api.post('/auth/register', { email, password });
  return validateAuthSession(res.data.data);
}

export async function login(email: string, password: string): Promise<{ userId: string; token: string }> {
  const res = await api.post('/auth/login', { email, password });
  return validateAuthSession(res.data.data);
}

export async function getAuthProviders(): Promise<AuthProviders> {
  const res = await api.get('/auth/providers');
  return validateAuthProviders(res.data.data.providers);
}

export async function exchangeOAuthCode(code: string, intent: AuthIntent): Promise<OAuthSession> {
  const res = await api.post('/auth/oauth/exchange', { code, intent });
  return validateOAuthSession(intent, res.data.data);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MASKED_PHONE_PATTERN = /^\+[1-9][0-9]{0,2}\*{4,12}[0-9]{2,4}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateAuthProviders(value: unknown): AuthProviders {
  if (!isPlainObject(value) || !hasExactKeys(value, ['google', 'facebook', 'phoneOtp'])) {
    throw new Error('Invalid authentication provider response.');
  }
  if (
    typeof value.google !== 'boolean'
    || typeof value.facebook !== 'boolean'
    || typeof value.phoneOtp !== 'boolean'
  ) {
    throw new Error('Invalid authentication provider response.');
  }
  return {
    google: value.google,
    facebook: value.facebook,
    phoneOtp: value.phoneOtp,
  };
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateAuthSession(value: unknown): AuthSession {
  if (!isPlainObject(value) || !hasExactKeys(value, ['userId', 'token'])) {
    throw new Error('Invalid authentication session response.');
  }
  if (
    typeof value.userId !== 'string'
    || !UUID_PATTERN.test(value.userId)
    || typeof value.token !== 'string'
    || value.token.length < 1
    || value.token.length > 8192
    || /\s/.test(value.token)
  ) {
    throw new Error('Invalid authentication session response.');
  }
  return { userId: value.userId, token: value.token };
}

export function validateOAuthSession(expectedIntent: AuthIntent, value: unknown): OAuthSession {
  if (!isPlainObject(value) || !hasExactKeys(value, ['userId', 'token', 'intent'])) {
    throw new Error('Invalid authentication session response.');
  }
  if (value.intent !== expectedIntent) {
    throw new Error('Invalid authentication session response.');
  }
  const session = validateAuthSession({ userId: value.userId, token: value.token });
  return { ...session, intent: expectedIntent };
}

export function validatePhoneOtpChallenge(value: unknown): PhoneOtpChallenge {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'challengeToken', 'expiresAt', 'resendAvailableAt',
  ])) {
    throw new Error('Invalid phone OTP challenge response.');
  }
  if (
    typeof value.challengeToken !== 'string'
    || !OPAQUE_TOKEN_PATTERN.test(value.challengeToken)
    || !isIsoDateTime(value.expiresAt)
    || !isIsoDateTime(value.resendAvailableAt)
  ) {
    throw new Error('Invalid phone OTP challenge response.');
  }
  return {
    challengeToken: value.challengeToken,
    expiresAt: value.expiresAt,
    resendAvailableAt: value.resendAvailableAt,
  };
}

export function validatePhoneAccountStatus(value: unknown): PhoneAccountStatus {
  if (!isPlainObject(value) || !hasExactKeys(value, ['phoneVerified', 'maskedPhone'])) {
    throw new Error('Invalid phone account status response.');
  }
  const validUnverified = value.phoneVerified === false && value.maskedPhone === null;
  const validVerified = value.phoneVerified === true
    && typeof value.maskedPhone === 'string'
    && MASKED_PHONE_PATTERN.test(value.maskedPhone);
  if (!validUnverified && !validVerified) {
    throw new Error('Invalid phone account status response.');
  }
  return {
    phoneVerified: value.phoneVerified as boolean,
    maskedPhone: value.maskedPhone as string | null,
  };
}

function validateProfile(value: unknown): Profile | null {
  if (value === null) return null;
  if (!isPlainObject(value) || !hasExactKeys(value, [
    'id', 'user_id', 'full_name', 'date_of_birth', 'gender',
  ])) {
    throw new Error('Invalid authenticated user response.');
  }
  if (
    typeof value.id !== 'string'
    || !UUID_PATTERN.test(value.id)
    || typeof value.user_id !== 'string'
    || !UUID_PATTERN.test(value.user_id)
    || typeof value.full_name !== 'string'
    || !/\S/.test(value.full_name)
    || typeof value.date_of_birth !== 'string'
    || !isIsoDate(value.date_of_birth)
    || !['MALE', 'FEMALE', 'OTHER'].includes(String(value.gender))
  ) {
    throw new Error('Invalid authenticated user response.');
  }
  return value as unknown as Profile;
}

export function validateMeResponse(value: unknown): MeResponse {
  if (!isPlainObject(value) || !hasExactKeys(value, ['userId', 'hasProfile', 'profile', 'phone'])) {
    throw new Error('Invalid authenticated user response.');
  }
  if (
    typeof value.userId !== 'string'
    || !UUID_PATTERN.test(value.userId)
    || typeof value.hasProfile !== 'boolean'
  ) {
    throw new Error('Invalid authenticated user response.');
  }
  const profile = validateProfile(value.profile);
  if (value.hasProfile !== Boolean(profile)) {
    throw new Error('Invalid authenticated user response.');
  }
  if (profile && profile.user_id !== value.userId) {
    throw new Error('Invalid authenticated user response.');
  }
  return {
    userId: value.userId,
    hasProfile: value.hasProfile,
    profile,
    phone: validatePhoneAccountStatus(value.phone),
  };
}

export async function requestPhoneLoginOtp(phone: string): Promise<PhoneOtpChallenge> {
  const res = await api.post('/auth/phone/request', { phone });
  return validatePhoneOtpChallenge(res.data.data);
}

export async function requestPhoneRegisterOtp(phone: string): Promise<PhoneOtpChallenge> {
  const res = await api.post('/auth/phone/register/request', { phone });
  return validatePhoneOtpChallenge(res.data.data);
}

export async function verifyPhoneLoginOtp(
  challengeToken: string,
  code: string,
): Promise<AuthSession> {
  const res = await api.post('/auth/phone/verify', { challengeToken, code });
  return validateAuthSession(res.data.data);
}

export async function verifyPhoneRegisterOtp(
  challengeToken: string,
  code: string,
): Promise<AuthSession> {
  const res = await api.post('/auth/phone/register/verify', { challengeToken, code });
  return validateAuthSession(res.data.data);
}

export async function requestPhoneLinkOtp(phone: string): Promise<PhoneOtpChallenge> {
  const res = await api.post('/auth/phone/link/request', { phone });
  return validatePhoneOtpChallenge(res.data.data);
}

export async function verifyPhoneLinkOtp(
  challengeToken: string,
  code: string,
): Promise<PhoneAccountStatus> {
  const res = await api.post('/auth/phone/link/verify', { challengeToken, code });
  return validatePhoneAccountStatus(res.data.data);
}

export async function getPhoneAccountStatus(): Promise<PhoneAccountStatus> {
  const res = await api.get('/auth/phone');
  return validatePhoneAccountStatus(res.data.data);
}

export function validateOAuthAuthorization(
  requestedProvider: OAuthProvider,
  value: unknown,
): OAuthAuthorization {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid OAuth authorization response.');
  }

  const candidate = value as { provider?: unknown; authorizationUrl?: unknown };
  if (candidate.provider !== requestedProvider || typeof candidate.authorizationUrl !== 'string') {
    throw new Error('Invalid OAuth authorization response.');
  }

  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(candidate.authorizationUrl);
  } catch {
    throw new Error('Invalid OAuth authorization response.');
  }

  if (
    authorizationUrl.protocol !== 'https:'
    || authorizationUrl.username
    || authorizationUrl.password
    || authorizationUrl.port
    || authorizationUrl.hash
  ) {
    throw new Error('Invalid OAuth authorization response.');
  }

  const validProviderTarget = requestedProvider === 'GOOGLE'
    ? authorizationUrl.hostname === 'accounts.google.com'
      && authorizationUrl.pathname === '/o/oauth2/v2/auth'
    : authorizationUrl.hostname === 'www.facebook.com'
      && /^\/v[0-9]+(?:\.[0-9]+)?\/dialog\/oauth$/.test(authorizationUrl.pathname);

  if (!validProviderTarget) {
    throw new Error('Invalid OAuth authorization response.');
  }

  return {
    provider: requestedProvider,
    authorizationUrl: candidate.authorizationUrl,
  };
}

export async function startOAuthLink(provider: OAuthProvider): Promise<OAuthAuthorization> {
  const endpoint = provider === 'GOOGLE' ? '/auth/google/link' : '/auth/facebook/link';
  const res = await api.post(endpoint);
  return validateOAuthAuthorization(provider, res.data.data);
}

export async function getMe(tokenOverride?: string): Promise<MeResponse> {
  const res = await api.get('/auth/me', tokenOverride ? {
    headers: { Authorization: `Bearer ${tokenOverride}` },
  } : undefined);
  return validateMeResponse(res.data.data);
}

export async function updateProfile(payload: {
  fullName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
}): Promise<Profile> {
  const res = await api.put('/auth/profile', payload);
  return res.data.data;
}

export async function scanOcr(file: File): Promise<OcrScanResponse> {
  const form = new FormData();
  form.append('reportImage', file);
  const res = await api.post('/ocr/scan', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function confirmAnalysis(reportId: string, results: ConfirmedResult[]): Promise<AnalysisBundle> {
  const res = await api.post('/analysis/confirm', { reportId, results });
  return res.data.data;
}

export async function getHistory(): Promise<HistoryReport[]> {
  const res = await api.get('/analysis/history');
  return res.data.data.reports;
}

export async function getReportDetail(reportId: string): Promise<ReportDetail> {
  const res = await api.get(`/analysis/history/${reportId}`);
  return res.data.data.report;
}

export async function sendChatMessage(message: string, reportId?: string, sessionId?: string) {
  const res = await api.post('/chat/message', { message, reportId, sessionId });
  return res.data.data;
}

export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    if (message) return message;
  }
  return 'Đã xảy ra lỗi không xác định.';
}
