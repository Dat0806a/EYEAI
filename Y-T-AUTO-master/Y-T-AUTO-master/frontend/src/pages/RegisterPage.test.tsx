import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthProviders, requestPhoneRegisterOtp } from '../services/api';
import { RegisterPage } from './RegisterPage';

const authMocks = vi.hoisted(() => ({
  completePhoneOtp: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: null, ...authMocks }),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getAuthProviders: vi.fn(),
    requestPhoneRegisterOtp: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(getAuthProviders).mockReset();
  vi.mocked(requestPhoneRegisterOtp).mockReset();
  authMocks.completePhoneOtp.mockReset();
  authMocks.register.mockReset();
});

describe('RegisterPage', () => {
  it('offers Google, Facebook, phone, and email registration when configured', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true, facebook: true, phoneOtp: true });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      '/api/auth/google?intent=REGISTER',
    );
    expect(screen.getByRole('link', { name: 'Tiếp tục với Facebook' })).toHaveAttribute(
      'href',
      '/api/auth/facebook?intent=REGISTER',
    );
    expect(screen.getByRole('button', { name: 'Đăng ký bằng số điện thoại' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
    expect(screen.getByLabelText('Nhập lại mật khẩu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
  });

  it('preserves the existing email registration submission', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: false });
    authMocks.register.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<div>Profile onboarding route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'person@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText('Profile onboarding route')).toBeInTheDocument();
    expect(authMocks.register).toHaveBeenCalledWith('person@example.test', 'password123');
  });

  it('uses REGISTER mode and the register OTP endpoints for phone registration', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false, facebook: false, phoneOtp: true });
    vi.mocked(requestPhoneRegisterOtp).mockResolvedValue({
      challengeToken: 'r'.repeat(43),
      expiresAt: '2026-08-13T10:05:00.000Z',
      resendAvailableAt: '2026-08-13T10:01:00.000Z',
    });
    authMocks.completePhoneOtp.mockResolvedValue({ hasProfile: false });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<div>Profile onboarding route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký bằng số điện thoại' }));
    expect(screen.getByRole('heading', { name: 'Đăng ký bằng số điện thoại' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    await waitFor(() => expect(requestPhoneRegisterOtp).toHaveBeenCalledWith('0912345678'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng ký' }));

    expect(await screen.findByText('Profile onboarding route')).toBeInTheDocument();
    expect(authMocks.completePhoneOtp).toHaveBeenCalledWith('REGISTER', 'r'.repeat(43), '123456');
  });
});
