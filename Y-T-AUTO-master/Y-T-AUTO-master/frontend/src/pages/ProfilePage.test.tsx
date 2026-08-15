import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthProviders,
  requestPhoneLinkOtp,
  startOAuthLink,
  verifyPhoneLinkOtp,
} from '../services/api';
import { ProfilePage } from './ProfilePage';

const authMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  refreshMe: vi.fn(),
  phone: { phoneVerified: false, maskedPhone: null } as {
    phoneVerified: boolean;
    maskedPhone: string | null;
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'profile-1',
      user_id: 'user-1',
      full_name: 'Nguyễn Văn A',
      date_of_birth: '1990-01-01',
      gender: 'MALE',
    },
    hasProfile: true,
    phone: authMocks.phone,
    refreshMe: authMocks.refreshMe,
    logout: authMocks.logout,
  }),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getAuthProviders: vi.fn(),
    requestPhoneLinkOtp: vi.fn(),
    startOAuthLink: vi.fn(),
    verifyPhoneLinkOtp: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(getAuthProviders).mockReset();
  vi.mocked(startOAuthLink).mockReset();
  vi.mocked(requestPhoneLinkOtp).mockReset();
  vi.mocked(verifyPhoneLinkOtp).mockReset();
  authMocks.logout.mockReset();
  authMocks.refreshMe.mockReset();
  authMocks.phone.phoneVerified = false;
  authMocks.phone.maskedPhone = null;
});

describe('ProfilePage provider linking', () => {
  it('lets an incomplete-profile user log out without submitting profile data', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: false });

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<div>Login route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    expect(authMocks.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Login route')).toBeInTheDocument();
  });

  it('starts an authenticated Facebook link and navigates to the returned authorization URL', async () => {
    let resolveLink!: (value: { provider: 'FACEBOOK'; authorizationUrl: string }) => void;
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: true, phoneOtp: false });
    vi.mocked(startOAuthLink).mockReturnValue(new Promise((resolve) => {
      resolveLink = resolve;
    }));
    const navigateExternal = vi.fn();

    render(
      <MemoryRouter>
        <ProfilePage navigateExternal={navigateExternal} />
      </MemoryRouter>,
    );

    const facebookButton = await screen.findByRole('button', { name: 'Liên kết Facebook' });
    expect(screen.queryByRole('button', { name: 'Liên kết Google' })).not.toBeInTheDocument();
    fireEvent.click(facebookButton);

    expect(await screen.findByRole('button', { name: 'Đang mở Facebook...' })).toBeDisabled();
    expect(startOAuthLink).toHaveBeenCalledWith('FACEBOOK');

    resolveLink({
      provider: 'FACEBOOK',
      authorizationUrl: 'https://www.facebook.com/v23.0/dialog/oauth?state=opaque-state',
    });

    await waitFor(() => expect(navigateExternal).toHaveBeenCalledWith(
      'https://www.facebook.com/v23.0/dialog/oauth?state=opaque-state',
    ));
  });

  it('shows an error and remains on the page when link start fails', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: false, phoneOtp: false });
    vi.mocked(startOAuthLink).mockRejectedValue(new Error('link unavailable'));
    const navigateExternal = vi.fn();

    render(
      <MemoryRouter>
        <ProfilePage navigateExternal={navigateExternal} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Liên kết Google' }));

    expect(await screen.findByText('Đã xảy ra lỗi không xác định.')).toBeInTheDocument();
    expect(navigateExternal).not.toHaveBeenCalled();
  });

  it.each([
    [
      'mismatched provider',
      { provider: 'GOOGLE', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state' },
    ],
    [
      'javascript URL',
      { provider: 'FACEBOOK', authorizationUrl: 'javascript:alert(1)' },
    ],
    [
      'attacker HTTPS host',
      { provider: 'FACEBOOK', authorizationUrl: 'https://www.facebook.com.attacker.example/v23.0/dialog/oauth' },
    ],
    [
      'credentials or fragment',
      { provider: 'FACEBOOK', authorizationUrl: 'https://user:pass@www.facebook.com/v23.0/dialog/oauth#token' },
    ],
  ] as const)('shows safe UI and never navigates for a %s response', async (_name, response) => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: true, phoneOtp: false });
    vi.mocked(startOAuthLink).mockResolvedValue(response as never);
    const navigateExternal = vi.fn();

    render(
      <MemoryRouter>
        <ProfilePage navigateExternal={navigateExternal} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Liên kết Facebook' }));

    expect(await screen.findByText('Đã xảy ra lỗi không xác định.')).toBeInTheDocument();
    expect(navigateExternal).not.toHaveBeenCalled();
  });

  it('shows only the masked verified phone identity', async () => {
    authMocks.phone.phoneVerified = true;
    authMocks.phone.maskedPhone = '+84******678';
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Đã xác minh')).toBeInTheDocument();
    expect(screen.getByText('+84******678')).toBeInTheDocument();
    expect(screen.queryByText('+84912345678')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm số điện thoại' })).not.toBeInTheDocument();
  });

  it('shows unverified status and gates phone linking by provider availability', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: false, phoneOtp: false });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Chưa xác minh')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm số điện thoại' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liên kết Google' })).toBeInTheDocument();
  });

  it('links a verified phone and refreshes the authenticated account status', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: true, phoneOtp: true });
    vi.mocked(requestPhoneLinkOtp).mockResolvedValue({
      challengeToken: 'a'.repeat(43),
      expiresAt: '2026-08-13T10:05:00.000Z',
      resendAvailableAt: '2026-08-13T10:01:00.000Z',
    });
    vi.mocked(verifyPhoneLinkOtp).mockResolvedValue({ phoneVerified: true, maskedPhone: '+84******678' });
    authMocks.refreshMe.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Thêm số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và liên kết' }));

    await waitFor(() => expect(verifyPhoneLinkOtp).toHaveBeenCalledWith('a'.repeat(43), '123456'));
    expect(authMocks.refreshMe).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Số điện thoại đã được xác minh và liên kết.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liên kết Facebook' })).toBeInTheDocument();
  });

  it('keeps the link flow open with safe guidance when the phone belongs elsewhere', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });
    vi.mocked(requestPhoneLinkOtp).mockResolvedValue({
      challengeToken: 'a'.repeat(43),
      expiresAt: '2026-08-13T10:05:00.000Z',
      resendAvailableAt: '2026-08-13T10:01:00.000Z',
    });
    vi.mocked(verifyPhoneLinkOtp).mockRejectedValue({
      response: { data: { error: { code: 'PHONE_IDENTITY_CONFLICT', message: 'Internal detail' } } },
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Thêm số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và liên kết' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại này không thể liên kết với tài khoản hiện tại.',
    );
    expect(screen.getByRole('button', { name: 'Đổi số điện thoại' })).toBeInTheDocument();
    expect(authMocks.refreshMe).not.toHaveBeenCalled();
  });
});
