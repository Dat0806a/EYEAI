import { config } from '../../config';

export interface FacebookOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface FacebookUserInfo {
  id: string;
  email: string;
  name: string | null;
}

const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v19.0/me';
const FACEBOOK_PERMISSIONS_URL = 'https://graph.facebook.com/v19.0/me/permissions';

async function getFacebookEmailPermissionStatus(
  accessToken: string,
): Promise<'granted' | 'declined' | 'missing' | 'unknown'> {
  try {
    const response = await fetch(FACEBOOK_PERMISSIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return 'unknown';
    const data = (await response.json()) as {
      data?: Array<{ permission?: string; status?: string }>;
    };
    const emailPermission = data.data?.find((entry) => entry.permission === 'email');
    if (emailPermission?.status === 'granted') return 'granted';
    if (emailPermission?.status === 'declined') return 'declined';
    return 'missing';
  } catch {
    return 'unknown';
  }
}

export function isFacebookOAuthConfigured(cfg: FacebookOAuthConfig = config.facebookOAuth): boolean {
  return Boolean(cfg.appId && cfg.appSecret && cfg.redirectUri);
}

export function buildFacebookAuthorizationUrl(
  state: string,
  cfg: FacebookOAuthConfig = config.facebookOAuth,
): string {
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: 'email',
  });
  return `${FACEBOOK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeFacebookCodeForToken(
  code: string,
  cfg: FacebookOAuthConfig = config.facebookOAuth,
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  const response = await fetch(FACEBOOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error('Facebook không chấp nhận mã xác thực. Vui lòng thử lại.');
  }
  const data = (await response.json()) as { access_token?: string; error?: { message?: string } };
  if (!data.access_token) {
    throw new Error(data.error?.message ?? 'Facebook không trả về access token.');
  }
  return { accessToken: data.access_token };
}

export async function getFacebookUserInfo(accessToken: string): Promise<FacebookUserInfo> {
  const params = new URLSearchParams({
    fields: 'id,name,email',
  });
  const response = await fetch(`${FACEBOOK_GRAPH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Không thể lấy thông tin tài khoản Facebook.');
  }
  const data = (await response.json()) as Partial<FacebookUserInfo> & { error?: { message?: string } };
  if (data.error) {
    throw new Error(data.error.message ?? 'Không thể lấy thông tin tài khoản Facebook.');
  }
  if (!data.id) throw new Error('Facebook không trả về định danh tài khoản hợp lệ.');
  const emailPermission = await getFacebookEmailPermissionStatus(accessToken);
  if (emailPermission === 'unknown') {
    throw new Error('Không thể xác minh quyền email từ Facebook. Vui lòng thử lại.');
  }
  if (emailPermission !== 'granted') {
    throw new Error(
      'Facebook chưa cấp quyền email cho ứng dụng. Hãy cấp lại quyền email rồi thử lại.',
    );
  }
  if (!data.email) {
    throw new Error(
      'Facebook đã cấp quyền email nhưng tài khoản không trả về email hợp lệ. Hãy dùng tài khoản có email đã xác minh.',
    );
  }
  return { id: data.id, email: data.email, name: data.name ?? null };
}
