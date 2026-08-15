import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthProviders, requestPhoneLoginOtp } from '../services/api';
import { LoginPage } from './LoginPage';

const authMocks = vi.hoisted(() => ({
  completePhoneOtp: vi.fn(),
  login: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: null, ...authMocks }),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, getAuthProviders: vi.fn(), requestPhoneLoginOtp: vi.fn() };
});

beforeEach(() => {
  vi.mocked(getAuthProviders).mockReset();
  vi.mocked(requestPhoneLoginOtp).mockReset();
  authMocks.completePhoneOtp.mockReset();
  authMocks.login.mockReset();
});

describe('LoginPage provider buttons', () => {
  it('shows the OAuth error returned to the login route', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: false, phoneOtp: false });
    render(
      <MemoryRouter initialEntries={['/login?oauth_error=Google%20denied']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Google denied')).toBeInTheDocument();
  });

  it('hides Google and Facebook buttons when providers are not configured', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: false });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Đăng nhập bằng Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng nhập bằng Facebook' })).not.toBeInTheDocument();
  });

  it('shows Google and Facebook buttons when configured', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: true, phoneOtp: false });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Đăng nhập bằng Google' })).toHaveAttribute(
      'href',
      '/api/auth/google?intent=LOGIN',
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập bằng Facebook' })).toHaveAttribute(
      'href',
      '/api/auth/facebook?intent=LOGIN',
    );
  });

  it('shows phone login only when configured and preserves email and OAuth controls', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: true, phoneOtp: true });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Đăng nhập bằng số điện thoại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập bằng Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập bằng Facebook' })).toBeInTheDocument();
  });

  it('does not show phone login when phone OTP is unavailable', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: false });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Đăng nhập bằng số điện thoại' })).not.toBeInTheDocument();
  });

  it('opens the Vietnamese phone login mode without removing the email return path', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập bằng số điện thoại' }));
    expect(screen.getByRole('heading', { name: 'Đăng nhập bằng số điện thoại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quay lại đăng nhập bằng email' })).toBeInTheDocument();
  });

  it('completes phone login through AuthContext and redirects to the dashboard', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue({
      challengeToken: 'a'.repeat(43),
      expiresAt: '2026-08-13T10:05:00.000Z',
      resendAvailableAt: '2026-08-13T10:01:00.000Z',
    });
    authMocks.completePhoneOtp.mockResolvedValue({ hasProfile: true });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập bằng số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));

    expect(await screen.findByText('Dashboard route')).toBeInTheDocument();
    expect(authMocks.completePhoneOtp).toHaveBeenCalledWith('LOGIN', 'a'.repeat(43), '123456');
  });

  it('redirects a phone-only user without a profile directly to onboarding', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue({
      challengeToken: 'a'.repeat(43),
      expiresAt: '2026-08-13T10:05:00.000Z',
      resendAvailableAt: '2026-08-13T10:01:00.000Z',
    });
    authMocks.completePhoneOtp.mockResolvedValue({ hasProfile: false });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard route</div>} />
          <Route path="/profile" element={<div>Profile onboarding route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập bằng số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));

    expect(await screen.findByText('Profile onboarding route')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard route')).not.toBeInTheDocument();
  });
});
