import { config } from '../../config';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function isGoogleOAuthConfigured(cfg: GoogleOAuthConfig = config.googleOAuth): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

export function buildGoogleAuthorizationUrl(
  state: string,
  cfg: GoogleOAuthConfig = config.googleOAuth,
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForToken(
  code: string,
  cfg: GoogleOAuthConfig = config.googleOAuth,
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error('Google không chấp nhận mã xác thực. Vui lòng thử lại.');
  }
  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error('Google không trả về access token.');
  }
  return { accessToken: data.access_token };
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Không thể lấy thông tin tài khoản Google.');
  }
  const data = (await response.json()) as Partial<GoogleUserInfo>;
  if (!data.sub || !data.email) {
    throw new Error('Tài khoản Google không có email hợp lệ.');
  }
  return {
    sub: data.sub,
    email: data.email,
    email_verified: data.email_verified === true,
    name: data.name ?? null,
  };
}
