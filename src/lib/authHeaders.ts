import { supabase } from './supabase';

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function buildAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) {
    return { ...extra };
  }
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

export class ApiAuthError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
    this.code = code;
  }
}

export function getAuthErrorMessage(err: unknown, fallback = ''): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    if (typeof obj.error_description === 'string' && obj.error_description.trim()) {
      return obj.error_description;
    }
    if (typeof obj.code === 'string' && obj.code.trim()) return obj.code;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

export async function throwIfAuthRejected(res: Response): Promise<void> {
  if (res.status !== 401 && res.status !== 403) return;
  let msg =
    res.status === 401
      ? 'Phiên đăng nhập chưa xác thực hoặc đã hết hạn. Vui lòng đăng nhập lại.'
      : 'Bạn không có quyền truy cập hoặc chưa hoàn tất xác thực 2 lớp (AAL2).';
  let code: string | undefined;

  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      if (typeof json?.error === 'string' && json.error.trim()) {
        msg = json.error;
      } else if (typeof json?.message === 'string' && json.message.trim()) {
        msg = json.message;
      }
      if (typeof json?.code === 'string') {
        code = json.code;
      }
    }
  } catch {
    // Keep default message
  }

  throw new ApiAuthError(res.status, msg, code);
}
