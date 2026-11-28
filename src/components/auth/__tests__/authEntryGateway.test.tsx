import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { supabase } from '../../../lib/supabase';
import { MfaEnrollView } from '../MfaEnrollView';
import { EyeTrackingProvider } from '../../../modules/eye-control/EyeTrackingProvider';
import { EyeNavigationProvider } from '../../../modules/eye-control/EyeNavigationProvider';

vi.mock('../../../components/ui/SplashScreen', () => ({
  SplashScreen: ({ onSplashFinished }: { onSplashFinished: () => void }) => (
    <button type="button" onClick={onSplashFinished}>
      Bấm để tiếp tục
    </button>
  ),
}));

vi.mock('../../../components/auth/AuthBackgroundVideo', () => ({
  AuthBackgroundVideo: () => <div data-testid="auth-bg-video" />,
}));

vi.mock('../../../components/ui/BackgroundVideo', () => ({
  BackgroundVideo: () => <div data-testid="app-bg-video" />,
}));

import App from '../../../App';

describe('Auth Entry Gateway after Splash Continue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows Login/Register form immediately after clicking Continue when unauthenticated even if getSession is pending', async () => {
    // Simulate slow getSession() that has not resolved yet when user clicks "Bấm để tiếp tục"
    vi.spyOn(supabase.auth, 'getSession').mockReturnValue(new Promise(() => {}) as any);
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any);

    render(<App />);

    fireEvent.click(screen.getByText('Bấm để tiếp tục'));

    await waitFor(() => {
      expect(screen.getByText('ĐĂNG NHẬP')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
    expect(screen.queryByText(/Đang xác minh phiên & bảo mật tài khoản/i)).not.toBeInTheDocument();
  });

  it('clears stale/quarantined leftover session on boot and shows Login/Register form after Continue', async () => {
    const quarantinedUser = {
      id: 'u_stale_quarantined',
      email: 'old@eyetalk.app',
      app_metadata: {},
    };

    let authCallback: ((event: string, session: any) => void) | null = null;

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok_stale', user: quarantinedUser } as any },
      error: null,
    });
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockImplementation(async () => {
      authCallback?.('SIGNED_OUT', null);
      return { error: null };
    });
    vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    } as any);
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'user_account_policies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  account_type: 'patient',
                  mfa_enforced: true,
                  role_verified: false,
                  requires_role_review: true,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'u_stale_quarantined', display_name: 'OldUser' },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    render(<App />);

    await waitFor(() => expect(signOutSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Bấm để tiếp tục'));

    await waitFor(() => {
      expect(screen.getByText('ĐĂNG NHẬP')).toBeInTheDocument();
    });
    expect(screen.queryByText(/role_verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đang xác minh phiên & bảo mật tài khoản/i)).not.toBeInTheDocument();
  });

  it('triggers Email OTP verification after password login without immediately locking on post-auth gate', async () => {
    let authCallback: ((event: string, session: any) => void) | null = null;
    const unverifiedUser = {
      id: 'u_pat_login',
      email: 'user@eyetalk.app',
      app_metadata: {},
    };

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    const signInPwdSpy = vi.spyOn(supabase.auth, 'signInWithPassword').mockImplementation(async () => {
      authCallback?.('SIGNED_IN', { access_token: 'tmp_tok', user: unverifiedUser });
      return { data: { user: unverifiedUser, session: { access_token: 'tmp_tok', user: unverifiedUser } }, error: null } as any;
    });
    vi.spyOn(supabase.auth, 'signOut').mockImplementation(async () => {
      authCallback?.('SIGNED_OUT', null);
      return { error: null };
    });
    const signInOtpSpy = vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValue({
      data: {} as any,
      error: null,
    });
    const verifyOtpSpy = vi.spyOn(supabase.auth, 'verifyOtp').mockImplementation(async () => {
      authCallback?.('SIGNED_IN', { access_token: 'verified_aal1', user: unverifiedUser });
      return { data: { session: { access_token: 'verified_aal1', user: unverifiedUser }, user: unverifiedUser }, error: null } as any;
    });
    vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    } as any);
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'user_account_policies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  account_type: 'impaired',
                  mfa_enforced: false,
                  role_verified: false,
                  requires_role_review: true,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'u_pat_login', display_name: 'User' },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    render(<App />);
    fireEvent.click(screen.getByText('Bấm để tiếp tục'));

    await waitFor(() => expect(screen.getByText('ĐĂNG NHẬP')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@eyetalk.app' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByText('ĐĂNG NHẬP'));

    await waitFor(() => {
      expect(signInPwdSpy).toHaveBeenCalledWith({
        email: 'user@eyetalk.app',
        password: 'Secret123',
      });
      expect(signInOtpSpy).toHaveBeenCalledWith({
        email: 'user@eyetalk.app',
        options: { shouldCreateUser: false },
      });
      expect(screen.getByLabelText('Mã Email OTP (6 chữ số)')).toBeInTheDocument();
    });

    // Must NOT lock on role_verified before user submits the Email OTP
    expect(screen.queryByText(/role_verified/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mã Email OTP (6 chữ số)'), { target: { value: '654321' } });
    fireEvent.click(screen.getByText('XÁC MINH EMAIL OTP'));

    await waitFor(() => {
      expect(verifyOtpSpy).toHaveBeenCalledWith({
        email: 'user@eyetalk.app',
        token: '654321',
        type: 'email',
      });
    });
  });

  it('deduplicates MfaEnrollView enrollment under React.StrictMode without 404/422 race and completes verification', async () => {
    const unenrollSpy = vi.spyOn(supabase.auth.mfa, 'unenroll').mockResolvedValue({ data: {} as any, error: null });
    vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
      data: {
        all: [{ id: 'stale_factor_1', factor_type: 'totp', status: 'unverified' }],
        totp: [{ id: 'stale_factor_1', factor_type: 'totp', status: 'unverified' }],
      },
      error: null,
    } as any);
    const enrollSpy = vi.spyOn(supabase.auth.mfa, 'enroll').mockResolvedValue({
      data: {
        id: 'factor_strict_ok',
        type: 'totp',
        totp: {
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/EYEAI:u@eyetalk.app?secret=JBSWY3DPEHPK3PXP',
        },
      } as any,
      error: null,
    });
    const challengeSpy = vi.spyOn(supabase.auth.mfa, 'challenge').mockResolvedValue({
      data: { id: 'ch_strict' } as any,
      error: null,
    });
    const verifySpy = vi.spyOn(supabase.auth.mfa, 'verify').mockResolvedValue({
      data: { access_token: 'aal2_tok' } as any,
      error: null,
    });
    const onEnrolled = vi.fn();

    render(
      <React.StrictMode>
        <EyeTrackingProvider>
          <EyeNavigationProvider>
            <MfaEnrollView mandatory onEnrolled={onEnrolled} idPrefix="strict-enroll" />
          </EyeNavigationProvider>
        </EyeTrackingProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByAltText('Mã QR Google Authenticator')).toBeInTheDocument();
    });
    expect(unenrollSpy).toHaveBeenCalledTimes(1);
    expect(enrollSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('2. Nhập mã 6 chữ số để xác nhận kích hoạt'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByText('XÁC NHẬN & BẬT 2FA'));

    await waitFor(() => {
      expect(challengeSpy).toHaveBeenCalledWith({ factorId: 'factor_strict_ok' });
      expect(verifySpy).toHaveBeenCalledWith({
        factorId: 'factor_strict_ok',
        challengeId: 'ch_strict',
        code: '123456',
      });
      expect(onEnrolled).toHaveBeenCalledTimes(1);
    });
  });

  it('logs verified patient into the app right after Email OTP without forcing 2FA TOTP screen', async () => {
    let authCallback: ((event: string, session: any) => void) | null = null;
    const verifiedPatient = {
      id: 'u_pat_otp_only',
      email: 'patient@eyetalk.app',
      app_metadata: { account_type: 'patient' },
    };

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: verifiedPatient, session: { access_token: 'tmp', user: verifiedPatient } },
      error: null,
    } as any);
    vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });
    vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValue({ data: {} as any, error: null });
    vi.spyOn(supabase.auth, 'verifyOtp').mockImplementation(async () => {
      authCallback?.('SIGNED_IN', { access_token: 'aal1_patient_tok', user: verifiedPatient });
      return {
        data: { session: { access_token: 'aal1_patient_tok', user: verifiedPatient }, user: verifiedPatient },
        error: null,
      } as any;
    });
    vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
      error: null,
    } as any);
    vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    } as any);
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'user_account_policies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  account_type: 'patient',
                  mfa_enforced: false,
                  role_verified: true,
                  requires_role_review: false,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'u_pat_otp_only', display_name: 'Bệnh Nhân' },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    render(<App />);
    fireEvent.click(screen.getByText('Bấm để tiếp tục'));
    await waitFor(() => expect(screen.getByText('ĐĂNG NHẬP')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'patient@eyetalk.app' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByText('ĐĂNG NHẬP'));

    await waitFor(() => expect(screen.getByLabelText('Mã Email OTP (6 chữ số)')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Mã Email OTP (6 chữ số)'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('XÁC MINH EMAIL OTP'));

    await waitFor(() => {
      expect(screen.queryByText(/Bắt buộc thiết lập 2FA/i)).not.toBeInTheDocument();
      expect(screen.queryByText('ĐĂNG NHẬP')).not.toBeInTheDocument();
    });
  });
});
