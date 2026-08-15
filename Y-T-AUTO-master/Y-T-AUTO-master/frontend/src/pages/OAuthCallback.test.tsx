import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { exchangeOAuthCode, getMe } from '../services/api';
import { OAuthCallbackPage } from './OAuthCallback';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    exchangeOAuthCode: vi.fn(),
    getMe: vi.fn(),
  };
});

function DashboardProbe() {
  const { token, userId } = useAuth();
  return <div>Dashboard session: {token}:{userId}</div>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function CodeSwitchControl() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/oauth/callback?code=code-B&intent=LOGIN')}>
      Use code B
    </button>
  );
}

function renderCallback(entry: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <AuthProvider>
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/dashboard" element={<DashboardProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

function renderSwitchableCallback() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/oauth/callback?code=code-A&intent=LOGIN']}>
        <AuthProvider>
          <CodeSwitchControl />
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/dashboard" element={<DashboardProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(exchangeOAuthCode).mockReset();
  vi.mocked(getMe).mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('OAuthCallbackPage', () => {
  it('exchanges an opaque LOGIN code with its explicit intent and replaces the dashboard route', async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'session-from-response-body',
      intent: 'LOGIN',
    });
    vi.mocked(getMe).mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    });

    renderCallback('/oauth/callback?code=opaque-callback-code&intent=LOGIN');

    expect(await screen.findByText(
      'Dashboard session: session-from-response-body:11111111-1111-4111-8111-111111111111',
    )).toBeInTheDocument();
    expect(exchangeOAuthCode).toHaveBeenCalledTimes(1);
    expect(exchangeOAuthCode).toHaveBeenCalledWith('opaque-callback-code', 'LOGIN');
    expect(localStorage.getItem('yte_token')).toBe('session-from-response-body');
    expect(getMe).toHaveBeenCalled();
  });

  it('ignores legacy token, jwt, and userId URL values without storing them', async () => {
    renderCallback('/oauth/callback?token=legacy-token&userId=user-1#jwt=legacy-jwt');

    expect(await screen.findByText('Không tìm thấy mã đăng nhập hợp lệ.')).toBeInTheDocument();
    expect(exchangeOAuthCode).not.toHaveBeenCalled();
    expect(localStorage.getItem('yte_token')).toBeNull();
  });

  it('shows provider-neutral guidance when the code is missing', async () => {
    renderCallback('/oauth/callback?intent=LOGIN');

    expect(await screen.findByText('Không tìm thấy mã đăng nhập hợp lệ.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Không thể hoàn tất đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByText(/Google|Facebook/i)).not.toBeInTheDocument();
    expect(exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it.each([
    ['/oauth/callback?code=opaque-code', 'missing'],
    ['/oauth/callback?code=opaque-code&intent=login', 'lowercase'],
    ['/oauth/callback?code=opaque-code&intent=DELETE', 'unknown'],
  ])('rejects %s callback intent before exchanging the code (%s)', async (entry) => {
    renderCallback(entry);

    expect(await screen.findByText('Mục đích xác thực không hợp lệ. Vui lòng bắt đầu lại.')).toBeInTheDocument();
    expect(exchangeOAuthCode).not.toHaveBeenCalled();
    expect(localStorage.getItem('yte_token')).toBeNull();
  });

  it('routes a successful REGISTER callback to profile onboarding', async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({
      userId: '33333333-3333-4333-8333-333333333333',
      token: 'register-session',
      intent: 'REGISTER',
    });
    vi.mocked(getMe).mockResolvedValue({
      userId: '33333333-3333-4333-8333-333333333333',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    });

    render(
      <MemoryRouter initialEntries={['/oauth/callback?code=register-code&intent=REGISTER']}>
        <AuthProvider>
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/profile" element={<div>Profile onboarding route</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Profile onboarding route')).toBeInTheDocument();
    expect(exchangeOAuthCode).toHaveBeenCalledWith('register-code', 'REGISTER');
  });

  it('routes a successful LINK callback back to profile without treating it as public login', async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({
      userId: '44444444-4444-4444-8444-444444444444',
      token: 'linked-session',
      intent: 'LINK',
    });
    vi.mocked(getMe).mockResolvedValue({
      userId: '44444444-4444-4444-8444-444444444444',
      hasProfile: true,
      profile: {
        id: '55555555-5555-4555-8555-555555555555',
        user_id: '44444444-4444-4444-8444-444444444444',
        full_name: 'Linked User',
        date_of_birth: '1990-01-01',
        gender: 'OTHER',
      },
      phone: { phoneVerified: false, maskedPhone: null },
    });

    render(
      <MemoryRouter initialEntries={['/oauth/callback?code=link-code&intent=LINK']}>
        <AuthProvider>
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/profile" element={<div>Profile account route</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Profile account route')).toBeInTheDocument();
    expect(exchangeOAuthCode).toHaveBeenCalledWith('link-code', 'LINK');
  });

  it('shows a safe provider-neutral error when the exchange fails', async () => {
    vi.mocked(exchangeOAuthCode).mockRejectedValue(new Error('provider secret details'));

    renderCallback('/oauth/callback?code=expired-code&intent=LOGIN');

    expect(await screen.findByText('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.queryByText(/provider secret details|Google|Facebook/i)).not.toBeInTheDocument();
    expect(exchangeOAuthCode).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('yte_token')).toBeNull();
  });

  it('guides an unknown LOGIN identity to registration only after the exchange proves the provider identity', async () => {
    vi.mocked(exchangeOAuthCode).mockRejectedValue({
      response: { data: { error: { code: 'REGISTRATION_REQUIRED', message: 'Unsafe account detail' } } },
    });

    renderCallback('/oauth/callback?code=unknown-login&intent=LOGIN');

    expect(await screen.findByText('Bạn chưa có tài khoản. Hãy đăng ký.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
    expect(screen.queryByText('Unsafe account detail')).not.toBeInTheDocument();
  });

  it('guides an existing REGISTER identity back to login only after the exchange proves the provider identity', async () => {
    vi.mocked(exchangeOAuthCode).mockRejectedValue({
      response: { data: { error: { code: 'LOGIN_REQUIRED', message: 'Unsafe account detail' } } },
    });

    renderCallback('/oauth/callback?code=existing-register&intent=REGISTER');

    expect(await screen.findByText('Tài khoản này đã được đăng ký. Vui lòng đăng nhập.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Unsafe account detail')).not.toBeInTheDocument();
  });

  it('does not exchange the same code again after a rerender', async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({
      userId: '22222222-2222-4222-8222-222222222222',
      token: 'second-session',
      intent: 'LOGIN',
    });
    vi.mocked(getMe).mockResolvedValue({
      userId: '22222222-2222-4222-8222-222222222222',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    });

    const view = renderCallback('/oauth/callback?code=single-use-code&intent=LOGIN');
    await screen.findByText('Dashboard session: second-session:22222222-2222-4222-8222-222222222222');
    view.rerender(
      <StrictMode>
        <MemoryRouter initialEntries={['/oauth/callback?code=single-use-code&intent=LOGIN']}>
          <AuthProvider>
            <Routes>
              <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
              <Route path="/dashboard" element={<DashboardProbe />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledTimes(1));
  });

  it('keeps the latest code session when an older exchange completes afterward', async () => {
    const codeA = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    const codeB = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    vi.mocked(exchangeOAuthCode).mockImplementation((code) => (
      code === 'code-A' ? codeA.promise : codeB.promise
    ));
    vi.mocked(getMe).mockImplementation(async (tokenOverride) => {
      return {
        userId: tokenOverride === 'token-B' ? 'user-B' : 'user-A',
        hasProfile: false,
        profile: null,
        phone: { phoneVerified: false, maskedPhone: null },
      };
    });

    renderSwitchableCallback();
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-A', 'LOGIN'));
    fireEvent.click(screen.getByRole('button', { name: 'Use code B' }));
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-B', 'LOGIN'));

    await act(async () => codeB.resolve({ userId: 'user-B', token: 'token-B', intent: 'LOGIN' }));
    expect(await screen.findByText('Dashboard session: token-B:user-B')).toBeInTheDocument();

    await act(async () => codeA.resolve({ userId: 'user-A', token: 'token-A', intent: 'LOGIN' }));

    expect(screen.getByText('Dashboard session: token-B:user-B')).toBeInTheDocument();
    expect(localStorage.getItem('yte_token')).toBe('token-B');
  });

  it('ignores an older exchange error while the latest code is still pending', async () => {
    const codeA = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    const codeB = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    vi.mocked(exchangeOAuthCode).mockImplementation((code) => (
      code === 'code-A' ? codeA.promise : codeB.promise
    ));
    vi.mocked(getMe).mockResolvedValue({
      userId: 'user-B',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    });

    renderSwitchableCallback();
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-A', 'LOGIN'));
    fireEvent.click(screen.getByRole('button', { name: 'Use code B' }));
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-B', 'LOGIN'));

    await act(async () => codeA.reject(new Error('old code failed')));

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Không thể hoàn tất đăng nhập' })).not.toBeInTheDocument();

    await act(async () => codeB.resolve({ userId: 'user-B', token: 'token-B', intent: 'LOGIN' }));
    expect(await screen.findByText('Dashboard session: token-B:user-B')).toBeInTheDocument();
  });
});
