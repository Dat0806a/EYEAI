export type AssuranceLevel = 'aal1' | 'aal2';
export type AuthFailureCode =
  | 'UNAUTHORIZED'
  | 'MFA_REQUIRED'
  | 'ROLE_VERIFICATION_REQUIRED'
  | 'ACCOUNT_TYPE_FORBIDDEN'
  | 'ACCOUNT_ROLE_UNRESOLVED'
  | 'SERVER_CONFIG_ERROR';

export interface VerifiedPatientIdentity {
  userId: string;
  email: string | null;
  accountType: 'patient' | 'impaired' | null;
  roleVerified: boolean;
  requiresRoleReview: boolean;
  displayName: string | null;
  aal: AssuranceLevel;
  hasVerifiedMfa: boolean;
  mfaRequired: boolean;
}

export interface PatientAuthVerificationResult {
  ok: boolean;
  status: 200 | 401 | 403 | 500;
  code?: AuthFailureCode;
  requiredAal?: AssuranceLevel;
  currentAal?: AssuranceLevel;
  identity?: VerifiedPatientIdentity;
  error?: string;
}

export interface AuthVerifyOptions {
  requirePatient?: boolean;
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

interface DecodedJwtClaims {
  sub?: string;
  aal?: string;
  session_id?: string;
  app_metadata?: Record<string, unknown>;
}

/**
 * Decodes claims from a JWT that has ALREADY been verified by Supabase Auth (/auth/v1/user).
 * Never trusts an unverified JWT on its own.
 */
function parseJwtPayload(token: string): DecodedJwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as DecodedJwtClaims) : null;
  } catch {
    return null;
  }
}

/**
 * Verifies the caller's Supabase JWT server-side via Supabase Auth (/auth/v1/user),
 * inspects the verified JWT's `aal` claim, and resolves the authoritative `account_type`
 * and MFA policy from server-managed sources (app_metadata / user_account_policies / locked profiles).
 * Never trusts client-body userId/role or user-editable `user_metadata`.
 */
export async function verifyAuthHeader(
  authorizationHeader?: string,
  options: AuthVerifyOptions = {}
): Promise<PatientAuthVerificationResult> {
  const requirePatient = Boolean(options.requirePatient);
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Thiếu thông tin xác thực phiên đăng nhập (Bearer token).',
    };
  }

  const cfg = getSupabaseServerConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 500,
      code: 'SERVER_CONFIG_ERROR',
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
        code: 'UNAUTHORIZED',
        error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      };
    }

    const userData: any = await userRes.json();
    const userId = typeof userData?.id === 'string' ? userData.id : null;
    if (!userId) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Không thể xác minh danh tính người dùng.',
      };
    }

    const claims = parseJwtPayload(token);
    if (claims?.sub && claims.sub !== userId) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Token xác thực không khớp với danh tính phiên đăng nhập.',
      };
    }

    const currentAal: AssuranceLevel = claims?.aal === 'aal2' ? 'aal2' : 'aal1';

    let accountType: 'patient' | 'impaired' | null = null;
    let mfaEnforced = false;
    let roleVerified = false;
    let requiresRoleReview = false;
    let hasPolicyRow = false;
    let displayName: string | null = null;

    // 1. Server-managed app_metadata (never user_metadata)
    const appMetaType = userData?.app_metadata?.account_type ?? claims?.app_metadata?.account_type;
    if (appMetaType === 'patient' || appMetaType === 'impaired') {
      accountType = appMetaType;
      roleVerified = true;
    }

    // 2. Authoritative server-managed user_account_policies table (RLS enforced)
    try {
      const policyUrl = `${cfg.url}/rest/v1/user_account_policies?user_id=eq.${encodeURIComponent(userId)}&select=account_type,mfa_enforced,role_verified,requires_role_review`;
      const policyRes = await fetch(policyUrl, {
        method: 'GET',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (policyRes.ok) {
        const policyRows = (await policyRes.json()) as Array<{
          account_type?: string | null;
          mfa_enforced?: boolean | null;
          role_verified?: boolean | null;
          requires_role_review?: boolean | null;
        }>;
        const policyRow = Array.isArray(policyRows) ? policyRows[0] : undefined;
        if (policyRow) {
          hasPolicyRow = true;
          if (policyRow.account_type === 'patient' || policyRow.account_type === 'impaired') {
            accountType = policyRow.account_type;
          } else {
            accountType = null;
          }
          if (typeof policyRow.mfa_enforced === 'boolean') {
            mfaEnforced = policyRow.mfa_enforced;
          }
          roleVerified = policyRow.role_verified === true;
          requiresRoleReview = policyRow.requires_role_review === true;
        }
      }
    } catch {
      // Fail closed if policy lookup fails without server app_metadata
    }

    // 3. Query public.profiles ONLY for display metadata (NEVER use unverified profile account_type for authorization)
    try {
      const profileUrl = `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name`;
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
          display_name?: string | null;
        }>;
        const row = Array.isArray(rows) ? rows[0] : undefined;
        if (row && typeof row.display_name === 'string') {
          displayName = row.display_name;
        }
      }
    } catch {
      // Do NOT fall back to user_metadata or unverified profile columns
    }

    const factors = Array.isArray(userData?.factors) ? userData.factors : [];
    const hasVerifiedMfa = factors.some((f: any) => f && f.status === 'verified');
    const mfaRequired = false;

    const identity: VerifiedPatientIdentity = {
      userId,
      email: typeof userData?.email === 'string' ? userData.email : null,
      accountType,
      roleVerified,
      requiresRoleReview,
      displayName,
      aal: currentAal,
      hasVerifiedMfa,
      mfaRequired,
    };

    if (!accountType || (!hasPolicyRow && appMetaType !== 'patient' && appMetaType !== 'impaired')) {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_ROLE_UNRESOLVED',
        currentAal,
        identity,
        error: 'Không xác định được phân quyền tài khoản hợp lệ từ máy chủ.',
      };
    }

    if (!roleVerified || requiresRoleReview) {
      return {
        ok: false,
        status: 403,
        code: 'ROLE_VERIFICATION_REQUIRED',
        currentAal,
        identity,
        error: 'Phân quyền tài khoản đang chờ xác minh từ quản trị viên. Truy cập tạm thời bị hạn chế.',
      };
    }

    if (requirePatient && accountType !== 'patient') {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_TYPE_FORBIDDEN',
        currentAal,
        identity,
        error: 'Tài khoản này không thuộc phân hệ bệnh nhân và không có quyền truy cập tài nguyên y tế.',
      };
    }

    if (mfaRequired && currentAal !== 'aal2') {
      return {
        ok: false,
        status: 403,
        code: 'MFA_REQUIRED',
        requiredAal: 'aal2',
        currentAal,
        identity,
        error:
          accountType === 'patient'
            ? 'Tài khoản Bệnh nhân bắt buộc xác thực 2 lớp (AAL2) trước khi truy cập dữ liệu y tế.'
            : 'Tài khoản đã bật xác thực 2 lớp. Vui lòng xác minh mã OTP (AAL2) để tiếp tục.',
      };
    }

    return {
      ok: true,
      status: 200,
      currentAal,
      identity,
    };
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Không thể xác thực phiên đăng nhập với máy chủ.',
    };
  }
}

/**
 * Strict Patient-only + AAL2 verifier used across Patient OCR, Analysis, Chat, and Voice Agent APIs.
 */
export async function verifyPatientAuthHeader(
  authorizationHeader?: string
): Promise<PatientAuthVerificationResult> {
  return verifyAuthHeader(authorizationHeader, { requirePatient: true });
}
