import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  exchangeOAuthCode,
  getMe,
  login as apiLogin,
  register as apiRegister,
  verifyPhoneLoginOtp,
  verifyPhoneRegisterOtp,
} from '../services/api';
import type { AuthIntent, PhoneAccountStatus, Profile } from '../types';

type PublicPhoneIntent = Extract<AuthIntent, 'LOGIN' | 'REGISTER'>;

interface AuthContextValue {
  token: string | null;
  userId: string | null;
  profile: Profile | null;
  hasProfile: boolean;
  phone: PhoneAccountStatus;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  completeOAuth: (
    code: string,
    intent: AuthIntent,
  ) => Promise<{ hasProfile: boolean; intent: AuthIntent } | false>;
  completePhoneOtp: (
    intent: PublicPhoneIntent,
    challengeToken: string,
    code: string,
  ) => Promise<{ hasProfile: boolean } | false>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY_PHONE_STATUS: PhoneAccountStatus = { phoneVerified: false, maskedPhone: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('yte_token'));
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [phone, setPhone] = useState<PhoneAccountStatus>(EMPTY_PHONE_STATUS);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(token);
  const authGeneration = useRef(0);
  const authOperationGeneration = useRef(0);
  const initialRefreshStarted = useRef(false);

  const isCurrentSession = useCallback((tokenSnapshot: string, generationSnapshot: number) => (
    tokenRef.current === tokenSnapshot
      && authGeneration.current === generationSnapshot
      && localStorage.getItem('yte_token') === tokenSnapshot
  ), []);

  const clearSession = useCallback(() => {
    authGeneration.current += 1;
    tokenRef.current = null;
    localStorage.removeItem('yte_token');
    setToken(null);
    setUserId(null);
    setProfile(null);
    setHasProfile(false);
    setPhone(EMPTY_PHONE_STATUS);
    setReady(true);
  }, []);

  const storeToken = useCallback((value: string) => {
    authGeneration.current += 1;
    tokenRef.current = value;
    localStorage.setItem('yte_token', value);
    setToken(value);
  }, []);

  const beginAuthOperation = useCallback(() => {
    authGeneration.current += 1;
    authOperationGeneration.current += 1;
    return authOperationGeneration.current;
  }, []);

  const validateAndStoreSession = useCallback(async (
    session: { userId: string; token: string },
    operationGeneration: number,
  ) => {
    const me = await getMe(session.token);
    if (operationGeneration !== authOperationGeneration.current) return false;
    if (me.userId !== session.userId) {
      throw new Error('Authenticated session identity mismatch.');
    }
    storeToken(session.token);
    setUserId(me.userId);
    setProfile(me.profile);
    setHasProfile(me.hasProfile);
    setPhone(me.phone);
    setReady(true);
    return me;
  }, [storeToken]);

  const refreshSession = useCallback(async (rejectCurrentFailure: boolean) => {
    const tokenSnapshot = tokenRef.current;
    const generationSnapshot = authGeneration.current;

    if (!tokenSnapshot) {
      setReady(true);
      return false;
    }

    try {
      const me = await getMe();
      if (!isCurrentSession(tokenSnapshot, generationSnapshot)) return false;
      setUserId(me.userId);
      setProfile(me.profile);
      setHasProfile(me.hasProfile);
      setPhone(me.phone);
      return true;
    } catch (error) {
      if (!isCurrentSession(tokenSnapshot, generationSnapshot)) return false;
      clearSession();
      if (rejectCurrentFailure) throw error;
      return false;
    } finally {
      if (isCurrentSession(tokenSnapshot, generationSnapshot)) setReady(true);
    }
  }, [clearSession, isCurrentSession]);

  const refreshMe = useCallback(async () => {
    await refreshSession(false);
  }, [refreshSession]);

  useEffect(() => {
    if (initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const operationGeneration = beginAuthOperation();
    const result = await apiLogin(email, password);
    await validateAndStoreSession(result, operationGeneration);
  }, [beginAuthOperation, validateAndStoreSession]);

  const register = useCallback(async (email: string, password: string) => {
    const operationGeneration = beginAuthOperation();
    const result = await apiRegister(email, password);
    await validateAndStoreSession(result, operationGeneration);
  }, [beginAuthOperation, validateAndStoreSession]);

  const completeOAuth = useCallback(async (code: string, intent: AuthIntent) => {
    const operationGeneration = beginAuthOperation();

    let session;
    try {
      session = await exchangeOAuthCode(code, intent);
    } catch (error) {
      if (operationGeneration !== authOperationGeneration.current) return false;
      throw error;
    }

    if (operationGeneration !== authOperationGeneration.current) return false;
    try {
      const me = await validateAndStoreSession(session, operationGeneration);
      return me === false ? false : { hasProfile: me.hasProfile, intent: session.intent };
    } catch (error) {
      if (operationGeneration !== authOperationGeneration.current) return false;
      throw error;
    }
  }, [beginAuthOperation, validateAndStoreSession]);

  const completePhoneOtp = useCallback(async (
    intent: PublicPhoneIntent,
    challengeToken: string,
    code: string,
  ) => {
    const operationGeneration = beginAuthOperation();

    let session;
    try {
      session = intent === 'LOGIN'
        ? await verifyPhoneLoginOtp(challengeToken, code)
        : await verifyPhoneRegisterOtp(challengeToken, code);
    } catch (error) {
      if (operationGeneration !== authOperationGeneration.current) return false;
      throw error;
    }

    if (operationGeneration !== authOperationGeneration.current) return false;
    try {
      const me = await validateAndStoreSession(session, operationGeneration);
      return me === false ? false : { hasProfile: me.hasProfile };
    } catch (error) {
      if (operationGeneration !== authOperationGeneration.current) return false;
      throw error;
    }
  }, [beginAuthOperation, validateAndStoreSession]);

  const logout = useCallback(() => {
    authOperationGeneration.current += 1;
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    userId,
    profile,
    hasProfile,
    phone,
    ready,
    login,
    register,
    completeOAuth,
    completePhoneOtp,
    logout,
    refreshMe,
  }), [
    completeOAuth,
    completePhoneOtp,
    hasProfile,
    login,
    logout,
    phone,
    profile,
    ready,
    refreshMe,
    register,
    token,
    userId,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
