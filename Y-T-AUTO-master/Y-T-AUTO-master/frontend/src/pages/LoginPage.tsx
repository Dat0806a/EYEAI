import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiError, AuthProviders, getAuthProviders } from '../services/api';
import { Alert, Button, Card, Input } from '../components/ui';
import { PhoneOtpFlow } from '../components/PhoneOtpFlow';

export function LoginPage() {
  const { token, login, completePhoneOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => searchParams.get('oauth_error') ?? '');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [phoneMode, setPhoneMode] = useState(false);

  useEffect(() => {
    getAuthProviders()
      .then(setProviders)
      .catch(() => setProviders({ google: false, facebook: false, phoneOtp: false }));
  }, []);

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-blue/20 via-cream/60 to-white p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-navy">
          {phoneMode ? 'Đăng nhập bằng số điện thoại' : 'Chào mừng trở lại 👋'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {phoneMode ? 'Nhận mã OTP qua SMS để truy cập tài khoản của bạn.' : 'Đăng nhập để quản lý kết quả xét nghiệm của bạn.'}
        </p>
        {phoneMode ? (
          <>
            <PhoneOtpFlow
              mode="login"
              onVerify={(challengeToken, code) => completePhoneOtp('LOGIN', challengeToken, code)}
              onSuccess={(result) => navigate(
                typeof result === 'object' && result.hasProfile === false ? '/profile' : '/dashboard',
              )}
            />
            <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setPhoneMode(false)}>
              Quay lại đăng nhập bằng email
            </Button>
          </>
        ) : (
          <>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-navy">Email</label>
            <Input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@example.com" />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-navy">Mật khẩu</label>
            <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          hoặc
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        {providers?.google && (
          <a
            href="/api/auth/google?intent=LOGIN"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.5 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C41 35.4 44 30.2 44 24c0-1.3-.1-2.6-.4-3.9z"/>
            </svg>
            Đăng nhập bằng Google
          </a>
        )}
        {providers?.facebook && (
          <a
            href="/api/auth/facebook?intent=LOGIN"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
              <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/>
            </svg>
            Đăng nhập bằng Facebook
          </a>
        )}
        {providers?.phoneOtp && (
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setPhoneMode(true)}>
            Đăng nhập bằng số điện thoại
          </Button>
        )}
        <p className="mt-4 text-center text-sm text-gray-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-semibold text-sky-blue hover:underline">
            Đăng ký
          </Link>
        </p>
          </>
        )}
      </Card>
    </div>
  );
}
