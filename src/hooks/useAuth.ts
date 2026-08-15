import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen to Auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id, session.user);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string, currentUser?: User | null) => {
    const targetUser = currentUser || user;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const metaRole = (targetUser?.user_metadata?.account_type || targetUser?.user_metadata?.role) as AccountType | undefined;

      if (!error && data) {
        const rawType = data.account_type || data.role || metaRole;
        const validAccountType: AccountType | null =
          rawType === 'impaired' || rawType === 'patient' ? rawType : null;

        setProfile({
          id: data.id,
          display_name: data.display_name,
          avatar_url: data.avatar_url,
          role: validAccountType,
          account_type: validAccountType,
        });
      } else {
        // Fallback profile if user profile row isn't fetched yet
        const validMetaType: AccountType | null =
          metaRole === 'impaired' || metaRole === 'patient' ? metaRole : null;

        setProfile({
          id: userId,
          display_name: targetUser?.user_metadata?.display_name || targetUser?.email?.split('@')[0] || 'Người dùng',
          avatar_url: targetUser?.user_metadata?.avatar_url || null,
          role: validMetaType,
          account_type: validMetaType,
        });
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const updateAccountType = async (newType: AccountType): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Chưa đăng nhập' };
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_type: newType, role: newType })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, account_type: newType, role: newType } : null));

      await supabase.auth.updateUser({
        data: { account_type: newType, role: newType },
      });

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật loại tài khoản.';
      return { success: false, error: msg };
    }
  };

  const updateDisplayName = async (newName: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Chưa đăng nhập' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Tên không được để trống.' };
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : null));

      await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật tên hiển thị.';
      return { success: false, error: msg };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    profile,
    loading,
    isAuthenticated: !!user,
    userId: user?.id || null,
    signOut,
    updateAccountType,
    updateDisplayName,
    refreshProfile: () => user && fetchProfile(user.id, user),
  };
}

