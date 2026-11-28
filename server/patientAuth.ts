export interface VerifiedPatientIdentity {
  userId: string;
  email: string | null;
  accountType: 'patient' | 'impaired' | null;
  displayName: string | null;
}

export interface PatientAuthVerificationResult {
  ok: boolean;
  status: 200 | 401 | 403 | 500;
  identity?: VerifiedPatientIdentity;
  error?: string;
}

export type PatientAuthVerifier = (authorizationHeader?: string) => Promise<PatientAuthVerificationResult>;

function getSupabaseServerConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey || url.includes('placeholder-eyetalk.supabase.co')) {
    return null;
  }
  return { url, anonKey };
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the caller's Supabase JWT server-side via Supabase Auth (/auth/v1/user)
 * and resolves the authoritative account_type from public.profiles (respecting RLS)
 * or Supabase-verified user metadata. Never trusts client-body userId or role.
 */
export async function verifyPatientAuthHeader(
  authorizationHeader?: string
): Promise<PatientAuthVerificationResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Thiếu thông tin xác thực phiên đăng nhập (Bearer token).',
    };
  }

  const cfg = getSupabaseServerConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 500,
      error: 'Hệ thống xác thực máy chủ chưa được cấu hình đầy đủ.',
    };
  }

  try {
    const userRes = await fetch(`${cfg.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userRes.ok) {
      return {
        ok: false,
        status: 401,
        error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      };
    }

    const userData: any = await userRes.json();
    const userId = typeof userData?.id === 'string' ? userData.id : null;
    if (!userId) {
      return {
        ok: false,
        status: 401,
        error: 'Không thể xác minh danh tính người dùng.',
      };
    }

    let accountType: 'patient' | 'impaired' | null = null;
    let displayName: string | null = null;

    // Query authoritative public.profiles row using caller's own JWT (RLS enforced)
    try {
      const profileUrl = `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,account_type,display_name`;
      const profileRes = await fetch(profileUrl, {
        method: 'GET',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (profileRes.ok) {
        const rows = (await profileRes.json()) as Array<{
          id?: string;
          account_type?: string | null;
          display_name?: string | null;
        }>;
        const row = Array.isArray(rows) ? rows[0] : undefined;
        if (row) {
          if (row.account_type === 'patient' || row.account_type === 'impaired') {
            accountType = row.account_type;
          }
          if (typeof row.display_name === 'string') {
            displayName = row.display_name;
          }
        }
      }
    } catch {
      // Fallback solely to Supabase-verified auth metadata if profile query fails transiently
    }

    if (!accountType) {
      const metaType = userData?.user_metadata?.account_type || userData?.user_metadata?.role;
      if (metaType === 'patient' || metaType === 'impaired') {
        accountType = metaType;
      }
    }

    if (accountType !== 'patient') {
      return {
        ok: false,
        status: 403,
        identity: {
          userId,
          email: typeof userData?.email === 'string' ? userData.email : null,
          accountType,
          displayName,
        },
        error: 'Tài khoản này không thuộc phân hệ bệnh nhân và không có quyền truy cập Patient AI Agent.',
      };
    }

    return {
      ok: true,
      status: 200,
      identity: {
        userId,
        email: typeof userData?.email === 'string' ? userData.email : null,
        accountType: 'patient',
        displayName,
      },
    };
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'Không thể xác thực phiên đăng nhập với máy chủ.',
    };
  }
}
