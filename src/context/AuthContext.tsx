import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Factor, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AccountType } from '../types/account';

export type RegistrationRole = AccountType;

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  account_type: AccountType | null;
  role?: string | null;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  mfaLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  currentAal: 'aal1' | 'aal2' | null;
  nextAal: 'aal1' | 'aal2' | null;
  mfaFactors: Factor[];
  verifiedMfaFactors: Factor[];
  hasVerifiedMfa: boolean;
  mfaRequired: boolean;
  needsMfaEnrollment: boolean;
  needsMfaVerification: boolean;
  mfaSatisfied: boolean;
  roleVerified: boolean;
  requiresRoleReview: boolean;
  isPasswordRecovery: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  updateAccountType: (newType: AccountType) => Promise<{ success: boolean; error?: string }>;
  updateDisplayName: (newName: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  refreshMfaState: () => Promise<{
    currentAal: 'aal1' | 'aal2' | null;
    nextAal: 'aal1' | 'aal2' | null;
    verifiedFactors: Factor[];
  }>;
  completePasswordRecovery: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isRecoveryUrlHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    return hash.includes('type=recovery') || search.includes('type=recovery');
  } catch {
    return false;
  }
}

async function withAuthTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [policyMfaEnforced, setPolicyMfaEnforced] = useState<boolean>(false);
  const [roleVerified, setRoleVerified] = useState<boolean>(false);
  const [requiresRoleReview, setRequiresRoleReview] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [mfaLoading, setMfaLoading] = useState<boolean>(false);
  const [currentAal, setCurrentAal] = useState<'aal1' | 'aal2' | null>(null);
  const [nextAal, setNextAal] = useState<'aal1' | 'aal2' | null>(null);
  const [mfaFactors, setMfaFactors] = useState<Factor[]>([]);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => isRecoveryUrlHint());
  const [profileError, setProfileError] = useState<string | null>(null);

  const hydrateSeqRef = useRef(0);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;
  const hydratedUserIdRef = useRef<string | null>(null);

  const refreshMfaState = useCallback(async () => {
    setMfaLoading(true);
    try {
      const [aalRes, factorsRes] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      const cur = (aalRes.data?.currentLevel as 'aal1' | 'aal2' | null) ?? null;
      const nxt = (aalRes.data?.nextLevel as 'aal1' | 'aal2' | null) ?? null;

      const allFactors: Factor[] = [
        ...(factorsRes.data?.totp ?? []),
        ...((factorsRes.data?.all ?? []).filter(
          (f) => !(factorsRes.data?.totp ?? []).some((t) => t.id === f.id)
        )),
      ];
      const verified = allFactors.filter((f) => f.status === 'verified');

      setCurrentAal(cur);
      setNextAal(nxt);
      setMfaFactors(allFactors);

      return { currentAal: cur, nextAal: nxt, verifiedFactors: verified };
    } catch {
      setCurrentAal(null);
      setNextAal(null);
      setMfaFactors([]);
      return { currentAal: null, nextAal: null, verifiedFactors: [] };
    } finally {
      setMfaLoading(false);
    }
  }, []);

  /**
   * Resolves user profile and authoritative server-managed role (`account_type`).
   * NEVER uses user-editable `user_metadata.account_type` or `user_metadata.role` for authorization.
   */
  const fetchProfile = useCallback(async (userId: string, currentUser?: User | null) => {
    const targetUser = currentUser || userRef.current;
    setProfileError(null);

    try {
      let resolvedAccountType: AccountType | null = null;
      let resolvedMfaEnforced = false;
      let resolvedRoleVerified = false;
      let resolvedRequiresReview = false;
      let hasPolicyRow = false;

      // 1. Server-managed app_metadata (admin/trigger controlled, never user_metadata)
      const appMetaType = targetUser?.app_metadata?.account_type;
      if (appMetaType === 'patient' || appMetaType === 'impaired') {
        resolvedAccountType = appMetaType;
        resolvedRoleVerified = true;
      }

      // 2. Authoritative server-managed user_account_policies table
      try {
        const { data: policyRow, error: policyErr } = await supabase
          .from('user_account_policies')
          .select('account_type, mfa_enforced, role_verified, requires_role_review')
          .eq('user_id', userId)
          .maybeSingle();

        if (!policyErr && policyRow) {
          hasPolicyRow = true;
          if (policyRow.account_type === 'patient' || policyRow.account_type === 'impaired') {
            resolvedAccountType = policyRow.account_type;
          } else {
            resolvedAccountType = null;
          }
          if (typeof policyRow.mfa_enforced === 'boolean') {
            resolvedMfaEnforced = policyRow.mfa_enforced;
          }
          resolvedRoleVerified = policyRow.role_verified === true;
          resolvedRequiresReview = policyRow.requires_role_review === true;
        }
      } catch {
        // Fail closed when user_account_policies lookup fails and app_metadata has no verified role
      }

      // 3. Query public.profiles ONLY for display metadata (never use unverified profile account_type for authorization)
      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      const hasVerifiedRoleSource = hasPolicyRow || appMetaType === 'patient' || appMetaType === 'impaired';
      if (!hasVerifiedRoleSource) {
        resolvedAccountType = null;
        resolvedRoleVerified = false;
        resolvedRequiresReview = false;
      }

      setPolicyMfaEnforced(false);
      setRoleVerified(resolvedRoleVerified);
      setRequiresRoleReview(resolvedRequiresReview);

      if (!resolvedAccountType) {
        setProfileError('Không tìm thấy thông tin phân quyền hợp lệ từ máy chủ cho tài khoản này.');
      } else if (!resolvedRoleVerified || resolvedRequiresReview) {
        setProfileError(
          'Phân quyền tài khoản đang chờ quản trị viên xác minh (role_verified). Truy cập dữ liệu tạm thời bị hạn chế.'
        );
      }

      if (!profileErr && profileRow) {
        setProfile({
          id: profileRow.id,
          display_name:
            profileRow.display_name ||
            targetUser?.user_metadata?.display_name ||
            targetUser?.email?.split('@')[0] ||
            'Người dùng',
          avatar_url: profileRow.avatar_url ?? null,
          role: resolvedAccountType,
          account_type: resolvedAccountType,
        });
      } else {
        setProfile({
          id: userId,
          display_name:
            targetUser?.user_metadata?.display_name ||
            targetUser?.email?.split('@')[0] ||
            'Người dùng',
          avatar_url: null,
          role: resolvedAccountType,
          account_type: resolvedAccountType,
        });
      }
    } catch {
      setPolicyMfaEnforced(false);
      setRoleVerified(false);
      setRequiresRoleReview(false);
      setProfile({
        id: userId,
        display_name: targetUser?.email?.split('@')[0] || 'Người dùng',
        avatar_url: null,
        role: null,
        account_type: null,
      });
      setProfileError('Không thể tải hồ sơ phân quyền tài khoản.');
    }
  }, []);

  const hydrateSession = useCallback(
    async (nextSession: Session | null, event?: string) => {
      const seq = ++hydrateSeqRef.current;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        hydratedUserIdRef.current = null;
        profileRef.current = null;
        setProfile(null);
        setPolicyMfaEnforced(false);
        setRoleVerified(false);
        setRequiresRoleReview(false);
        setCurrentAal(null);
        setNextAal(null);
        setMfaFactors([]);
        setProfileError(null);
        setLoading(false);
        return;
      }

      // Preserve active session & UI state across tab-switch / window-focus re-emissions
      // (TOKEN_REFRESHED, redundant SIGNED_IN, INITIAL_SESSION) for the same already-hydrated user.
      const isSameHydratedUser =
        hydratedUserIdRef.current === nextSession.user.id &&
        profileRef.current?.id === nextSession.user.id;

      if (isSameHydratedUser) {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          return;
        }
        if (event === 'USER_UPDATED') {
          try {
            await withAuthTimeout(fetchProfile(nextSession.user.id, nextSession.user), 8000);
          } catch {
            // Keep existing hydrated profile on transient background refresh errors
          }
          return;
        }
      }

      setLoading(true);
      try {
        await withAuthTimeout(
          Promise.all([
            fetchProfile(nextSession.user.id, nextSession.user),
            refreshMfaState(),
          ]),
          8000
        );
        if (seq === hydrateSeqRef.current) {
          hydratedUserIdRef.current = nextSession.user.id;
        }
      } catch {
        // Fail closed if profile/MFA hydration times out
      } finally {
        if (seq === hydrateSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [fetchProfile, refreshMfaState]
  );

  useEffect(() => {
    let active = true;

    withAuthTimeout(supabase.auth.getSession(), 5000)
      .then(({ data: { session: initialSession } }) => {
        if (!active) return;
        return hydrateSession(initialSession, 'INITIAL_SESSION');
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    let subscription: { unsubscribe?: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (event === 'SIGNED_OUT') {
          setIsPasswordRecovery(false);
        }
        void hydrateSession(nextSession, event);
      });
      subscription = data?.subscription ?? null;
    } catch {
      if (active) setLoading(false);
    }

    return () => {
      active = false;
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, [hydrateSession]);

  const refreshProfile = useCallback(async () => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    await fetchProfile(activeUser.id, activeUser);
  }, [fetchProfile]);

  const updateAccountType = useCallback(
    async (_newType: AccountType): Promise<{ success: boolean; error?: string }> => {
      return {
        success: false,
        error: 'Loại tài khoản được quản lý bởi hệ thống bảo mật máy chủ và không thể tự thay đổi từ trình duyệt.',
      };
    },
    []
  );

  const updateDisplayName = useCallback(
    async (newName: string): Promise<{ success: boolean; error?: string }> => {
      const activeUser = userRef.current;
      if (!activeUser) return { success: false, error: 'Chưa đăng nhập' };
      const trimmed = newName.trim();
      if (!trimmed) return { success: false, error: 'Tên không được để trống.' };

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: trimmed })
          .eq('id', activeUser.id);

        if (error) throw error;

        setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : null));
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể cập nhật tên hiển thị.';
        return { success: false, error: msg };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setIsPasswordRecovery(false);
    hydratedUserIdRef.current = null;
    profileRef.current = null;
    try {
      await supabase.auth.signOut();
    } catch {
      // Ensure local auth state still clears even if remote signOut fails
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setPolicyMfaEnforced(false);
      setRoleVerified(false);
      setRequiresRoleReview(false);
      setCurrentAal(null);
      setNextAal(null);
      setMfaFactors([]);
      setProfileError(null);
      setLoading(false);
    }
  }, []);

  const completePasswordRecovery = useCallback(async () => {
    setIsPasswordRecovery(false);
    hydratedUserIdRef.current = null;
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // Ignore
      }
    }
    const { data } = await supabase.auth.getSession();
    await hydrateSession(data.session ?? null);
  }, [hydrateSession]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (session?.access_token) {
      return session.access_token;
    }
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }, [session?.access_token]);

  const verifiedMfaFactors = useMemo(
    () => mfaFactors.filter((f) => f.status === 'verified'),
    [mfaFactors]
  );

  const hasVerifiedMfa = verifiedMfaFactors.length > 0;
  const isAuthenticated = Boolean(user && session);
  const isRoleApproved = Boolean(profile?.account_type) && roleVerified && !requiresRoleReview;
  const mfaRequired = false;

  const needsMfaEnrollment = false;

  const needsMfaVerification = false;

  const mfaSatisfied =
    isAuthenticated &&
    !loading &&
    !isPasswordRecovery &&
    isRoleApproved;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      mfaLoading,
      isAuthenticated,
      userId: user?.id || null,
      currentAal,
      nextAal,
      mfaFactors,
      verifiedMfaFactors,
      hasVerifiedMfa,
      mfaRequired,
      needsMfaEnrollment,
      needsMfaVerification,
      mfaSatisfied,
      roleVerified,
      requiresRoleReview,
      isPasswordRecovery,
      profileError,
      signOut,
      updateAccountType,
      updateDisplayName,
      refreshProfile,
      refreshMfaState,
      completePasswordRecovery,
      getAccessToken,
    }),
    [
      user,
      session,
      profile,
      loading,
      mfaLoading,
      isAuthenticated,
      currentAal,
      nextAal,
      mfaFactors,
      verifiedMfaFactors,
      hasVerifiedMfa,
      mfaRequired,
      needsMfaEnrollment,
      needsMfaVerification,
      mfaSatisfied,
      roleVerified,
      requiresRoleReview,
      isPasswordRecovery,
      profileError,
      signOut,
      updateAccountType,
      updateDisplayName,
      refreshProfile,
      refreshMfaState,
      completePasswordRecovery,
      getAccessToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const FALLBACK_AUTH_VALUE: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  loading: false,
  mfaLoading: false,
  isAuthenticated: false,
  userId: null,
  currentAal: null,
  nextAal: null,
  mfaFactors: [],
  verifiedMfaFactors: [],
  hasVerifiedMfa: false,
  mfaRequired: false,
  needsMfaEnrollment: false,
  needsMfaVerification: false,
  mfaSatisfied: false,
  roleVerified: false,
  requiresRoleReview: false,
  isPasswordRecovery: false,
  profileError: null,
  signOut: async () => { },
  updateAccountType: async () => ({ success: false, error: 'Chưa khởi tạo AuthProvider.' }),
  updateDisplayName: async () => ({ success: false, error: 'Chưa khởi tạo AuthProvider.' }),
  refreshProfile: async () => { },
  refreshMfaState: async () => ({ currentAal: null, nextAal: null, verifiedFactors: [] }),
  completePasswordRecovery: async () => { },
  getAccessToken: async () => null,
};

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? FALLBACK_AUTH_VALUE;
}
