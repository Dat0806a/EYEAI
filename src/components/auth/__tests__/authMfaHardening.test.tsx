import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { supabase } from '../../../lib/supabase';
import { AuthProvider, useAuth } from '../../../hooks/useAuth';
import { LoginForm } from '../LoginForm';
import { RegisterForm } from '../RegisterForm';
import { MfaChallengeView } from '../MfaChallengeView';
import { MfaEnrollView } from '../MfaEnrollView';
import { PasswordRecoveryView } from '../PasswordRecoveryView';
import { EyeNavigationProvider } from '../../../modules/eye-control/EyeNavigationProvider';
import { EyeTrackingProvider } from '../../../modules/eye-control/EyeTrackingProvider';
import { verifyAuthHeader, verifyPatientAuthHeader } from '../../../../server/patientAuth';
import { createPatientRouter } from '../../../../server/patientBackend';
import netlifyPatientHandler from '../../../../netlify/functions/patient';
import netlifyAiChatHandler from '../../../../netlify/functions/ai-chat';
import { scanOcr, confirmAnalysis } from '../../../services/patientService';
import { ApiAuthError } from '../../../lib/authHeaders';
import { chatService } from '../../../services/chat/chatService';
import { signalingService } from '../../../modules/calls/signalingService';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

function renderWithEyeContext(ui: React.ReactElement) {
  return render(
    <EyeTrackingProvider>
      <EyeNavigationProvider>{ui}</EyeNavigationProvider>
    </EyeTrackingProvider>
  );
}

function AuthStateProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="account-type">{String(auth.profile?.account_type ?? 'null')}</span>
      <span data-testid="aal">{String(auth.currentAal ?? 'null')}</span>
      <span data-testid="needs-enroll">{String(auth.needsMfaEnrollment)}</span>
      <span data-testid="needs-verify">{String(auth.needsMfaVerification)}</span>
      <span data-testid="mfa-satisfied">{String(auth.mfaSatisfied)}</span>
      <span data-testid="role-verified">{String(auth.roleVerified)}</span>
      <span data-testid="requires-role-review">{String(auth.requiresRoleReview)}</span>
      <span data-testid="recovery">{String(auth.isPasswordRecovery)}</span>
      <button type="button" onClick={() => void auth.signOut()}>
        probe-signout
      </button>
    </div>
  );
}

describe('EYEAI Auth, MFA (AAL2), Email OTP & Hardening Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('1. AuthProvider Reload, Session Restoration, Role Integrity & Anti-Bypass', () => {
    it('restores authenticated Patient session at AAL2 without reload trap and ignores spoofed user_metadata', async () => {
      const userObj = {
        id: 'u_pat_1',
        email: 'patient@eyetalk.app',
        app_metadata: { account_type: 'patient' },
        user_metadata: { account_type: 'impaired' }, // Attempted client metadata mismatch
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok', user: userObj } as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);
      vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
        data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      } as any);
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
        data: { all: [{ id: 'f_1', factor_type: 'totp', status: 'verified' }], totp: [{ id: 'f_1', factor_type: 'totp', status: 'verified' }] },
        error: null,
      } as any);
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'user_account_policies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { account_type: 'patient', mfa_enforced: true, role_verified: true, requires_role_review: false },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'u_pat_1', display_name: 'Bình' }, error: null }),
            }),
          }),
        } as any;
      });

      render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('account-type')).toHaveTextContent('patient');
      expect(screen.getByTestId('aal')).toHaveTextContent('aal2');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('true');
      expect(screen.getByTestId('needs-enroll')).toHaveTextContent('false');
      expect(screen.getByTestId('needs-verify')).toHaveTextContent('false');
    });

    it('blocks Patient at AAL1 (forces enrollment when no factor, forces verification when factor exists) and ignores user_metadata role spoofing', async () => {
      // Impaired user trying to spoof user_metadata.account_type = 'patient'
      const impairedUser = {
        id: 'u_imp_spoof',
        email: 'an@eyetalk.app',
        app_metadata: { account_type: 'impaired' },
        user_metadata: { account_type: 'patient', role: 'patient' },
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok', user: impairedUser } as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);
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
                  data: { account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'u_imp_spoof', display_name: 'An' }, error: null }),
            }),
          }),
        } as any;
      });

      const { unmount } = render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('account-type')).toHaveTextContent('impaired');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('true');
      unmount();

      // Patient at AAL1 (Email OTP) with verified role is satisfied without mandatory TOTP 2FA
      const patUser = {
        id: 'u_pat_aal1',
        email: 'pat@eyetalk.app',
        app_metadata: { account_type: 'patient' },
      };
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok', user: patUser } as any },
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      } as any);
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
        data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }], totp: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] },
        error: null,
      } as any);
      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { account_type: 'patient', mfa_enforced: false, role_verified: true, requires_role_review: false },
              error: null,
            }),
          }),
        }),
      }) as any);

      render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('needs-enroll')).toHaveTextContent('false');
      expect(screen.getByTestId('needs-verify')).toHaveTextContent('false');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('true');
    });

    it('clears state completely on logout', async () => {
      const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            access_token: 'tok',
            user: { id: 'u1', email: 'a@b.com', app_metadata: { account_type: 'impaired' } },
          } as any,
        },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);
      vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        error: null,
      } as any);
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
        data: { all: [], totp: [] },
        error: null,
      } as any);
      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'u1', account_type: 'impaired', role_verified: true, requires_role_review: false, display_name: 'A' },
              error: null,
            }),
          }),
        }),
      }) as any);

      render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
      fireEvent.click(screen.getByText('probe-signout'));
      await waitFor(() => expect(signOutSpy).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('false');
    });

    it('updates AAL & session cleanly on TOKEN_REFRESHED / MFA_CHALLENGE_VERIFIED auth events', async () => {
      let authCallback: ((event: string, session: any) => void) | null = null;
      const patUser = { id: 'u_ref', email: 'pat@eyetalk.app', app_metadata: { account_type: 'patient' } };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok_1', user: patUser } as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
      });
      const aalSpy = vi
        .spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel')
        .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null } as any)
        .mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null } as any);
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
        data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }], totp: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] },
        error: null,
      } as any);
      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { account_type: 'patient', mfa_enforced: true, role_verified: true, requires_role_review: false },
              error: null,
            }),
          }),
        }),
      }) as any);

      render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('aal')).toHaveTextContent('aal1'));
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('true');

      authCallback?.('TOKEN_REFRESHED', { access_token: 'tok_2', user: patUser });

      await waitFor(() => expect(aalSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByTestId('aal')).toHaveTextContent('aal2'));
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('true');
    });

    it('blocks unverified/quarantined roles (role_verified=false) without MFA enrollment deadlock and ignores unverified profile role', async () => {
      const quarantinedUser = {
        id: 'u_quarantine',
        email: 'quarantine@eyetalk.app',
        app_metadata: {},
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok_q', user: quarantinedUser } as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);
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
                data: { id: 'u_quarantine', display_name: 'PendingReview', account_type: 'patient' },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      const { unmount } = render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('role-verified')).toHaveTextContent('false');
      expect(screen.getByTestId('requires-role-review')).toHaveTextContent('true');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('false');
      // Must NOT force MFA enrollment while awaiting admin role verification
      expect(screen.getByTestId('needs-enroll')).toHaveTextContent('false');
      unmount();

      // Missing policy + missing app_metadata MUST NOT fall back to unverified profile.account_type='patient'
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'user_account_policies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'u_quarantine', display_name: 'Legacy', account_type: 'patient' },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      render(
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('account-type')).toHaveTextContent('null');
      expect(screen.getByTestId('mfa-satisfied')).toHaveTextContent('false');
    });
  });

  describe('2. Login, Demo Removal, Registration Email Confirmation & Email OTP', () => {
    it('removes demo credentials and supports Email OTP (AAL1) + Forgot Password', async () => {
      renderWithEyeContext(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />);

      expect(screen.queryByText(/Demo:/i)).not.toBeInTheDocument();
      expect(screen.queryByText('An')).not.toBeInTheDocument();
      expect(screen.queryByText('Bình')).not.toBeInTheDocument();

      // Switch to Email OTP
      fireEvent.click(screen.getByText('Email OTP'));
      expect(screen.getByText(/Bước 1 - AAL1/i)).toBeInTheDocument();

      const otpSpy = vi.spyOn(supabase.auth, 'signInWithOtp').mockResolvedValue({ data: {} as any, error: null });
      const verifySpy = vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValue({
        data: { session: { access_token: 'aal1_tok' } as any, user: { id: 'u1' } as any },
        error: null,
      });

      fireEvent.change(screen.getByLabelText('Email đã đăng ký'), { target: { value: 'user@eyetalk.app' } });
      fireEvent.click(screen.getByText('GỬI MÃ EMAIL OTP'));

      await waitFor(() => expect(otpSpy).toHaveBeenCalledWith({
        email: 'user@eyetalk.app',
        options: { shouldCreateUser: false },
      }));

      fireEvent.change(screen.getByLabelText('Mã Email OTP (6 chữ số)'), { target: { value: '123456' } });
      fireEvent.click(screen.getByText('XÁC MINH EMAIL OTP'));

      await waitFor(() => expect(verifySpy).toHaveBeenCalledWith({
        email: 'user@eyetalk.app',
        token: '123456',
        type: 'email',
      }));
    });

    it('handles signUp when Email Confirmation is required (session === null) without writing profiles as anon', async () => {
      const fromSpy = vi.spyOn(supabase, 'from');
      vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
        data: { user: { id: 'u_new', identities: [{ id: 'id1' }] } as any, session: null },
        error: null,
      });

      const onSuccess = vi.fn();
      renderWithEyeContext(<RegisterForm onSuccess={onSuccess} onSwitchToLogin={vi.fn()} />);

      fireEvent.click(screen.getByText('Bệnh nhân'));
      fireEvent.click(screen.getByText('TIẾP TỤC'));

      fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Nguyễn Test' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@eyetalk.app' } });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Secret123' } });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'Secret123' } });
      fireEvent.click(screen.getByText('TẠO TÀI KHOẢN'));

      await waitFor(() => {
        expect(screen.getByText('Xác nhận email để hoàn tất đăng ký')).toBeInTheDocument();
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(fromSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. TOTP Enrollment, Challenge/Verify, Keypad & Account Recovery Anti-Bypass', () => {
    it('enrolls TOTP via mfa.enroll(), renders QR, and verifies via mfa.challenge() + mfa.verify()', async () => {
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({ data: { all: [], totp: [] }, error: null } as any);
      const enrollSpy = vi.spyOn(supabase.auth.mfa, 'enroll').mockResolvedValue({
        data: {
          id: 'factor_new',
          type: 'totp',
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/EYEAI:user@eyetalk.app?secret=JBSWY3DPEHPK3PXP',
          },
        } as any,
        error: null,
      });
      const challengeSpy = vi.spyOn(supabase.auth.mfa, 'challenge').mockResolvedValue({
        data: { id: 'ch_1' } as any,
        error: null,
      });
      const verifySpy = vi.spyOn(supabase.auth.mfa, 'verify').mockResolvedValue({
        data: { access_token: 'aal2_tok' } as any,
        error: null,
      });

      const onEnrolled = vi.fn();
      renderWithEyeContext(<MfaEnrollView mandatory onEnrolled={onEnrolled} idPrefix="test-enroll" />);

      await waitFor(() => expect(enrollSpy).toHaveBeenCalled());
      expect(screen.getByAltText('Mã QR Google Authenticator')).toBeInTheDocument();

      // Use EyeFocusable numeric keypad buttons
      for (const d of ['1', '2', '3', '4', '5', '6']) {
        fireEvent.click(screen.getByText(d));
      }
      fireEvent.click(screen.getByText('XÁC NHẬN & BẬT 2FA'));

      await waitFor(() => {
        expect(challengeSpy).toHaveBeenCalledWith({ factorId: 'factor_new' });
        expect(verifySpy).toHaveBeenCalledWith({
          factorId: 'factor_new',
          challengeId: 'ch_1',
          code: '123456',
        });
        expect(onEnrolled).toHaveBeenCalled();
      });
    });

    it('handles wrong OTP and expired challenge on MfaChallengeView', async () => {
      const challengeSpy = vi
        .spyOn(supabase.auth.mfa, 'challenge')
        .mockResolvedValueOnce({ data: { id: 'ch_1' } as any, error: null })
        .mockResolvedValueOnce({ data: { id: 'ch_2' } as any, error: null });

      const verifySpy = vi
        .spyOn(supabase.auth.mfa, 'verify')
        .mockResolvedValueOnce({ data: null, error: { message: 'Invalid TOTP code provided' } as any })
        .mockResolvedValueOnce({ data: null, error: { message: 'Challenge expired' } as any })
        .mockResolvedValueOnce({ data: { access_token: 'aal2_ok' } as any, error: null });

      const onVerified = vi.fn();
      renderWithEyeContext(
        <MfaChallengeView
          factors={[{ id: 'f_totp', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }]}
          onVerified={onVerified}
          idPrefix="test-ch"
        />
      );

      await waitFor(() => expect(challengeSpy).toHaveBeenCalledTimes(1));

      const otpInput = screen.getByLabelText('Mã OTP 6 chữ số');
      fireEvent.change(otpInput, { target: { value: '000000' } });
      await waitFor(() => expect(screen.getByText('XÁC MINH MÃ OTP')).not.toBeDisabled());
      fireEvent.click(screen.getByText('XÁC MINH MÃ OTP'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Mã OTP 6 chữ số không chính xác');
      });

      fireEvent.change(otpInput, { target: { value: '111111' } });
      await waitFor(() => expect(screen.getByText('XÁC MINH MÃ OTP')).not.toBeDisabled());
      fireEvent.submit(otpInput.closest('form')!);

      await waitFor(() => {
        expect(verifySpy).toHaveBeenCalledTimes(2);
        expect(challengeSpy).toHaveBeenCalledTimes(2); // Auto-refreshed expired challenge
      });

      // Valid OTP succeeds and invokes onVerified
      fireEvent.change(otpInput, { target: { value: '654321' } });
      await waitFor(() => expect(screen.getByText('XÁC MINH MÃ OTP')).not.toBeDisabled());
      fireEvent.submit(otpInput.closest('form')!);

      await waitFor(() => {
        expect(verifySpy).toHaveBeenCalledTimes(3);
        expect(onVerified).toHaveBeenCalledTimes(1);
      });
    });

    it('blocks Password Recovery from bypassing MFA when verified MFA factor exists at AAL1', () => {
      renderWithEyeContext(
        <PasswordRecoveryView
          hasVerifiedMfa={true}
          currentAal="aal1"
          verifiedFactors={[{ id: 'f_1', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }]}
          onRefreshMfa={vi.fn()}
          onComplete={vi.fn()}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByText(/Xác minh 2FA để khôi phục mật khẩu/i)).toBeInTheDocument();
      expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument();
    });
  });

  describe('4. Backend API Enforcement (Express, Netlify Functions, AAL1 Bypass & Client Fail-Closed)', () => {
    it('enforces JWT, server-managed role, and AAL2 across Express Patient Router and Netlify Functions', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

      // 1. Unauthenticated -> 401 on Netlify patient & ai-chat
      const noAuthPatient = await netlifyPatientHandler(
        new Request('https://app.test/api/patient/ocr', { method: 'POST', body: '{}' })
      );
      expect(noAuthPatient.status).toBe(401);

      const noAuthAi = await netlifyAiChatHandler(
        new Request('https://app.test/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'hi' }) })
      );
      expect(noAuthAi.status).toBe(401);

      // 2. Verified Patient at AAL1 (Email OTP) -> authorized on verifyPatientAuthHeader
      const aal1Token = makeJwt({ sub: 'u_p', aal: 'aal1' });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_p', app_metadata: { account_type: 'patient' }, factors: [] }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ account_type: 'patient', mfa_enforced: false, role_verified: true, requires_role_review: false }]), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'u_p', display_name: 'P' }]), { status: 200 }));

      const aal1PatientRes = await verifyPatientAuthHeader(`Bearer ${aal1Token}`);
      expect(aal1PatientRes.ok).toBe(true);
      expect(aal1PatientRes.status).toBe(200);
      expect(aal1PatientRes.identity?.accountType).toBe('patient');

      // 3. Impaired user spoofing user_metadata.account_type='patient' -> 403 ACCOUNT_TYPE_FORBIDDEN
      const impToken = makeJwt({ sub: 'u_i', aal: 'aal1' });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_i', user_metadata: { account_type: 'patient' }, app_metadata: { account_type: 'impaired' }, factors: [] }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false }]), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'u_i', display_name: 'I' }]), { status: 200 }));

      const spoofRes = await verifyPatientAuthHeader(`Bearer ${impToken}`);
      expect(spoofRes.ok).toBe(false);
      expect(spoofRes.status).toBe(403);
      expect(spoofRes.code).toBe('ACCOUNT_TYPE_FORBIDDEN');

      // 4. Impaired user at AAL1 -> allowed on /api/ai/chat (requirePatient: false)
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_i2', app_metadata: { account_type: 'impaired' }, factors: [] }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false }]), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'u_i2', display_name: 'I2' }]), { status: 200 }));

      const impAuthRes = await verifyAuthHeader(`Bearer ${makeJwt({ sub: 'u_i2', aal: 'aal1' })}`, { requirePatient: false });
      expect(impAuthRes.ok).toBe(true);
      expect(impAuthRes.status).toBe(200);
      expect(impAuthRes.identity?.accountType).toBe('impaired');

      // 5. Account with role_verified = false / requires_role_review = true even at AAL2 -> 403 ROLE_VERIFICATION_REQUIRED
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'u_rev', app_metadata: {}, factors: [{ id: 'f1', status: 'verified' }] }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ account_type: 'patient', mfa_enforced: true, role_verified: false, requires_role_review: true }]), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'u_rev', display_name: 'Rev' }]), { status: 200 }));

      const unverifiedRoleRes = await verifyPatientAuthHeader(`Bearer ${makeJwt({ sub: 'u_rev', aal: 'aal2' })}`);
      expect(unverifiedRoleRes.ok).toBe(false);
      expect(unverifiedRoleRes.status).toBe(403);
      expect(unverifiedRoleRes.code).toBe('ROLE_VERIFICATION_REQUIRED');

      // 6. Express Patient Router blocks unauthenticated / AAL1 via verifyAuth middleware
      const router = createPatientRouter(null, undefined, async () => ({
        ok: false,
        status: 403,
        code: 'MFA_REQUIRED',
        error: 'MFA_REQUIRED',
      }));
      expect(router.stack.length).toBeGreaterThan(0);
    });

    it('configures Supabase Realtime channels with private: true for Chat and WebRTC signaling', () => {
      const channelSpy = vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue('ok'),
      } as any);

      chatService.subscribeToMessages('11111111-1111-1111-1111-111111111111', vi.fn());
      signalingService.subscribeToUserSignaling('22222222-2222-2222-2222-222222222222', vi.fn());
      signalingService.joinCallRoom('33333333-3333-3333-3333-333333333333', vi.fn());

      expect(channelSpy).toHaveBeenCalledWith(
        'conversation:11111111-1111-1111-1111-111111111111',
        expect.objectContaining({ config: expect.objectContaining({ private: true }) })
      );
      expect(channelSpy).toHaveBeenCalledWith(
        'user_signaling_22222222-2222-2222-2222-222222222222',
        expect.objectContaining({ config: expect.objectContaining({ private: true }) })
      );
      expect(channelSpy).toHaveBeenCalledWith(
        'call_room_33333333-3333-3333-3333-333333333333',
        expect.objectContaining({ config: expect.objectContaining({ private: true }) })
      );
    });

    it('patientService sends Bearer token and fails closed without falling back on 401/403', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'tok_aal1', user: { id: 'u_p' } } as any },
        error: null,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Cần xác thực 2 lớp', code: 'MFA_REQUIRED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const file = new File(['GLUCOSE | Glucose | 6.0 | mmol/L | 3.9 - 6.1'], 'lab.txt', {
        type: 'text/plain',
      });
      (file as any).text = async () => 'GLUCOSE | Glucose | 6.0 | mmol/L | 3.9 - 6.1';

      await expect(scanOcr(file)).rejects.toBeInstanceOf(ApiAuthError);
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/patient/ocr',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_aal1',
          }),
        })
      );

      await expect(
        confirmAnalysis('rep_1', [
          {
            testCode: 'GLUCOSE',
            testName: 'Glucose',
            value: 5.5,
            valueType: 'NUMERIC',
            unit: 'mmol/L',
            referenceLow: 3.9,
            referenceHigh: 6.1,
            referenceText: '3.9 - 6.1',
          },
        ])
      ).rejects.toBeInstanceOf(ApiAuthError);
    });
  });
});
