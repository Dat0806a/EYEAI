import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  verifyPhoneLoginOtp,
  verifyPhoneRegisterOtp,
  exchangeOAuthCode,
  getMe,
  login as apiLogin,
  register as apiRegister,
} from '../services/api';
import type { MeResponse } from '../types';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    exchangeOAuthCode: vi.fn(),
    verifyPhoneLoginOtp: vi.fn(),
    verifyPhoneRegisterOtp: vi.fn(),
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const oldMe: MeResponse = {
  userId: 'old-user',
  hasProfile: true,
  profile: {
    id: 'old-profile',
    user_id: 'old-user',
    full_name: 'Old profile',
    date_of_birth: '1980-01-01',
    gender: 'MALE',
  },
  phone: { phoneVerified: false, maskedPhone: null },
};

const newMe: MeResponse = {
  userId: 'new-user',
  hasProfile: true,
  profile: {
    id: 'new-profile',
    user_id: 'new-user',
    full_name: 'New profile',
    date_of_birth: '1990-01-01',
    gender: 'FEMALE',
  },
  phone: { phoneVerified: true, maskedPhone: '+84******678' },
};

function AuthProbe() {
  const { completeOAuth, completePhoneOtp, login, phone, profile, register, token, userId } = useAuth();
  const [completion, setCompletion] = useState('idle');

  const finishOAuth = (code = 'new-code') => {
    setCompletion('pending');
    void completeOAuth(code, 'LOGIN')
      .then(() => setCompletion('success'))
      .catch(() => setCompletion('error'));
  };

  const finishPhone = (challengeToken = 'phone-challenge') => {
    setCompletion('pending');
    void completePhoneOtp('LOGIN', challengeToken, '012345')
      .then(() => setCompletion('success'))
      .catch(() => setCompletion('error'));
  };

  return (
    <div>
      <div data-testid="token">{token ?? 'none'}</div>
      <div data-testid="user-id">{userId ?? 'none'}</div>
      <div data-testid="profile-name">{profile?.full_name ?? 'none'}</div>
      <div data-testid="phone-status">{phone.maskedPhone ?? 'none'}</div>
      <div data-testid="completion">{completion}</div>
      <button type="button" onClick={() => finishOAuth()}>Complete OAuth</button>
      <button type="button" onClick={() => finishOAuth('code-A')}>Complete OAuth A</button>
      <button type="button" onClick={() => finishOAuth('code-B')}>Complete OAuth B</button>
      <button type="button" onClick={() => finishPhone()}>Complete Phone</button>
      <button type="button" onClick={() => finishPhone('phone-A')}>Complete Phone A</button>
      <button type="button" onClick={() => finishPhone('phone-B')}>Complete Phone B</button>
      <button type="button" onClick={() => void login('person@example.test', 'password')}>Login</button>
      <button type="button" onClick={() => void register('person@example.test', 'password')}>Register</button>
    </div>
  );
}

function renderAuthProbe() {
  return render(
    <StrictMode>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(exchangeOAuthCode).mockReset();
  vi.mocked(verifyPhoneLoginOtp).mockReset();
  vi.mocked(verifyPhoneRegisterOtp).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(apiLogin).mockReset();
  vi.mocked(apiRegister).mockReset();
});

describe('AuthProvider refresh isolation', () => {
  it.each(['LOGIN', 'REGISTER'] as const)(
    'binds %s OAuth completion to the exchange and validates the server intent',
    async (intent) => {
      vi.mocked(exchangeOAuthCode).mockResolvedValue({
        userId: 'new-user',
        token: 'new-token',
        intent,
      });
      vi.mocked(getMe).mockResolvedValue(newMe);

      function IntentProbe() {
        const { completeOAuth } = useAuth();
        const [result, setResult] = useState('idle');
        return (
          <>
            <div data-testid="intent-result">{result}</div>
            <button
              type="button"
              onClick={() => void completeOAuth('intent-code', intent).then((completed) => {
                setResult(completed === false ? 'false' : `${completed.intent}:${completed.hasProfile}`);
              })}
            >
              Complete {intent}
            </button>
          </>
        );
      }

      render(<AuthProvider><IntentProbe /></AuthProvider>);
      fireEvent.click(screen.getByRole('button', { name: `Complete ${intent}` }));

      await waitFor(() => expect(screen.getByTestId('intent-result')).toHaveTextContent(`${intent}:true`));
      expect(exchangeOAuthCode).toHaveBeenCalledWith('intent-code', intent);
      expect(localStorage.getItem('yte_token')).toBe('new-token');
    },
  );

  it('uses the registration verifier for REGISTER phone completion', async () => {
    vi.mocked(verifyPhoneRegisterOtp).mockResolvedValue({
      userId: 'new-user',
      token: 'phone-register-token',
    });
    vi.mocked(getMe).mockResolvedValue({ ...newMe, hasProfile: false, profile: null });

    function RegisterPhoneProbe() {
      const { completePhoneOtp } = useAuth();
      const [result, setResult] = useState('idle');
      return (
        <>
          <div data-testid="phone-register-result">{result}</div>
          <button
            type="button"
            onClick={() => void completePhoneOtp('REGISTER', 'register-challenge', '012345')
              .then((completed) => setResult(completed === false ? 'false' : String(completed.hasProfile)))
              .catch(() => setResult('error'))}
          >
            Register phone
          </button>
        </>
      );
    }

    render(<AuthProvider><RegisterPhoneProbe /></AuthProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Register phone' }));

    await waitFor(() => expect(screen.getByTestId('phone-register-result')).toHaveTextContent('false'));
    expect(verifyPhoneRegisterOtp).toHaveBeenCalledWith('register-challenge', '012345');
    expect(verifyPhoneLoginOtp).not.toHaveBeenCalled();
    expect(localStorage.getItem('yte_token')).toBe('phone-register-token');
  });
  it('deduplicates the StrictMode initial refresh and ignores its stale success after OAuth completion', async () => {
    const staleRefresh = deferred<MeResponse>();
    localStorage.setItem('yte_token', 'stale-token');
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ userId: 'new-user', token: 'new-token', intent: 'LOGIN' });
    vi.mocked(getMe).mockImplementation((tokenOverride) => (
      tokenOverride === 'new-token'
        ? Promise.resolve(newMe)
        : staleRefresh.promise
    ));

    renderAuthProbe();

    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth' }));

    await waitFor(() => expect(screen.getByTestId('completion')).toHaveTextContent('success'));
    expect(screen.getByTestId('token')).toHaveTextContent('new-token');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('New profile');

    await act(async () => staleRefresh.resolve(oldMe));

    expect(screen.getByTestId('token')).toHaveTextContent('new-token');
    expect(screen.getByTestId('user-id')).toHaveTextContent('new-user');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('New profile');
    expect(localStorage.getItem('yte_token')).toBe('new-token');
  });

  it('ignores a stale initial refresh failure instead of clearing the new OAuth session', async () => {
    const staleRefresh = deferred<MeResponse>();
    localStorage.setItem('yte_token', 'stale-token');
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ userId: 'new-user', token: 'new-token', intent: 'LOGIN' });
    vi.mocked(getMe).mockImplementation((tokenOverride) => (
      tokenOverride === 'new-token'
        ? Promise.resolve(newMe)
        : staleRefresh.promise
    ));

    renderAuthProbe();
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth' }));
    await waitFor(() => expect(screen.getByTestId('completion')).toHaveTextContent('success'));

    await act(async () => staleRefresh.reject(new Error('stale session rejected')));

    expect(screen.getByTestId('token')).toHaveTextContent('new-token');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('New profile');
    expect(localStorage.getItem('yte_token')).toBe('new-token');
  });

  it('rejects OAuth completion when the current session /me refresh fails', async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ userId: 'new-user', token: 'new-token', intent: 'LOGIN' });
    vi.mocked(getMe).mockRejectedValue(new Error('current session rejected'));

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth' }));

    await waitFor(() => expect(screen.getByTestId('completion')).toHaveTextContent('error'));
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(localStorage.getItem('yte_token')).toBeNull();
  });

  it('does not leave an older OAuth token installed when a newer callback code fails', async () => {
    const codeAMe = deferred<MeResponse>();
    const codeBExchange = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    vi.mocked(exchangeOAuthCode).mockImplementation((code) => {
      if (code === 'code-A') return Promise.resolve({ userId: 'user-A', token: 'token-A', intent: 'LOGIN' as const });
      return codeBExchange.promise;
    });
    vi.mocked(getMe).mockImplementation(() => codeAMe.promise);

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth A' }));
    await waitFor(() => expect(getMe).toHaveBeenCalledWith('token-A'));

    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth B' }));
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-B', 'LOGIN'));
    await act(async () => codeBExchange.reject(new Error('newer code failed')));
    await act(async () => codeAMe.resolve(oldMe));

    expect(localStorage.getItem('yte_token')).toBeNull();
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(screen.getByTestId('user-id')).toHaveTextContent('none');
  });

  it.each([
    ['login', 'Login', apiLogin],
    ['register', 'Register', apiRegister],
  ] as const)('keeps a newer password %s session when an older OAuth exchange finishes late', async (
    _operation,
    buttonName,
    passwordAuth,
  ) => {
    const oauthExchange = deferred<{ userId: string; token: string; intent: 'LOGIN' }>();
    vi.mocked(exchangeOAuthCode).mockReturnValue(oauthExchange.promise);
    vi.mocked(passwordAuth).mockResolvedValue({ userId: 'new-user', token: 'password-token' });
    vi.mocked(getMe).mockImplementation(async (tokenOverride) => (
      tokenOverride === 'password-token'
        ? newMe
        : oldMe
    ));

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete OAuth A' }));
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledWith('code-A', 'LOGIN'));

    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    await waitFor(() => expect(localStorage.getItem('yte_token')).toBe('password-token'));

    await act(async () => oauthExchange.resolve({ userId: 'oauth-user', token: 'oauth-token', intent: 'LOGIN' }));

    await waitFor(() => expect(localStorage.getItem('yte_token')).toBe('password-token'));
    expect(screen.getByTestId('token')).toHaveTextContent('password-token');
    expect(screen.getByTestId('user-id')).toHaveTextContent('new-user');
  });

  it('validates and stores a phone session through the same candidate /auth/me path', async () => {
    vi.mocked(verifyPhoneLoginOtp).mockResolvedValue({
      userId: 'new-user',
      token: 'phone-token',
    });
    vi.mocked(getMe).mockResolvedValue(newMe);

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete Phone' }));

    await waitFor(() => expect(screen.getByTestId('completion')).toHaveTextContent('success'));
    expect(verifyPhoneLoginOtp).toHaveBeenCalledWith('phone-challenge', '012345');
    expect(getMe).toHaveBeenCalledWith('phone-token');
    expect(localStorage.getItem('yte_token')).toBe('phone-token');
    expect(screen.getByTestId('phone-status')).toHaveTextContent('+84******678');
  });

  it('returns the validated profile state to the phone login caller', async () => {
    const phoneOnlyMe: MeResponse = {
      userId: 'new-user',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: true, maskedPhone: '+84******678' },
    };
    vi.mocked(verifyPhoneLoginOtp).mockResolvedValue({
      userId: 'new-user',
      token: 'phone-token',
    });
    vi.mocked(getMe).mockResolvedValue(phoneOnlyMe);

    function DestinationProbe() {
      const { completePhoneOtp } = useAuth();
      const [destination, setDestination] = useState('idle');
      return (
        <>
          <div data-testid="destination">{destination}</div>
          <button
            type="button"
            onClick={() => void completePhoneOtp('LOGIN', 'phone-challenge', '012345')
              .then((result: unknown) => {
                const hasProfile = (result as { hasProfile?: unknown } | null)?.hasProfile;
                setDestination(hasProfile === false ? 'profile' : hasProfile === true ? 'dashboard' : 'invalid');
              })}
          >
            Complete phone with destination
          </button>
        </>
      );
    }

    render(
      <AuthProvider>
        <DestinationProbe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete phone with destination' }));

    await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent('profile'));
  });

  it('does not store a phone token when candidate /auth/me validation fails', async () => {
    vi.mocked(verifyPhoneLoginOtp).mockResolvedValue({
      userId: 'new-user',
      token: 'phone-token',
    });
    vi.mocked(getMe).mockRejectedValue(new Error('candidate rejected'));

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete Phone' }));

    await waitFor(() => expect(screen.getByTestId('completion')).toHaveTextContent('error'));
    expect(localStorage.getItem('yte_token')).toBeNull();
    expect(screen.getByTestId('token')).toHaveTextContent('none');
  });

  it('ignores an older phone completion after a newer phone operation succeeds', async () => {
    const first = deferred<{ userId: string; token: string }>();
    vi.mocked(verifyPhoneLoginOtp).mockImplementation((challengeToken) => (
      challengeToken === 'phone-A'
        ? first.promise
        : Promise.resolve({ userId: 'new-user', token: 'phone-B-token' })
    ));
    vi.mocked(getMe).mockResolvedValue(newMe);

    renderAuthProbe();
    fireEvent.click(screen.getByRole('button', { name: 'Complete Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete Phone B' }));
    await waitFor(() => expect(localStorage.getItem('yte_token')).toBe('phone-B-token'));

    await act(async () => first.resolve({ userId: 'old-user', token: 'phone-A-token' }));

    expect(localStorage.getItem('yte_token')).toBe('phone-B-token');
    expect(screen.getByTestId('token')).toHaveTextContent('phone-B-token');
  });

  it('logout cancels an in-flight phone completion', async () => {
    const phoneExchange = deferred<{ userId: string; token: string }>();
    vi.mocked(verifyPhoneLoginOtp).mockReturnValue(phoneExchange.promise);
    vi.mocked(getMe).mockResolvedValue(newMe);

    function LogoutProbe() {
      const { completePhoneOtp, logout } = useAuth();
      return (
        <>
          <button type="button" onClick={() => void completePhoneOtp('LOGIN', 'phone-A', '012345')}>Phone</button>
          <button type="button" onClick={logout}>Logout</button>
        </>
      );
    }

    render(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await act(async () => phoneExchange.resolve({ userId: 'new-user', token: 'late-token' }));

    expect(localStorage.getItem('yte_token')).toBeNull();
  });
});
