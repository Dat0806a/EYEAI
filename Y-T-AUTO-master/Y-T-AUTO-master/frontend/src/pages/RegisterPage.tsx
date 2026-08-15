import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PhoneOtpFlow } from '../components/PhoneOtpFlow';
import { Alert, Button, Card, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiError, AuthProviders, getAuthProviders } from '../services/api';

export function RegisterPage() {
  const { token, completePhoneOtp, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [phoneMode, setPhoneMode] = useState(false);

  useEffect(() => {
    getAuthProviders()
      .then(setProviders)
      .catch(() => setProviders({ google: false, facebook: false, phoneOtp: false }));
  }, []);

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      navigate('/profile');
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-blue/20 via-cream/60 to-white p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-navy">
          {phoneMode ? 'Đăng ký bằng số điện thoại' : 'Tạo tài khoản'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {phoneMode
            ? 'Xác minh số điện thoại để tạo tài khoản mới.'
            : 'Dành cho người lần đầu sử dụng Y Tế Auto.'}
        </p>

        {phoneMode ? (
          <>
            <PhoneOtpFlow
              mode="register"
              onVerify={(challengeToken, code) => completePhoneOtp('REGISTER', challengeToken, code)}
              onSuccess={() => navigate('/profile')}
            />
            <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setPhoneMode(false)}>
              Quay lại các cách đăng ký
            </Button>
          </>
        ) : (
          <>
            {providers?.google ? (
              <a
                href="/api/auth/google?intent=REGISTER"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-blue"
              >
                Tiếp tục với Google
              </a>
            ) : null}
            {providers?.facebook ? (
              <a
                href="/api/auth/facebook?intent=REGISTER"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-blue"
              >
                Tiếp tục với Facebook
              </a>
            ) : null}
            {providers?.phoneOtp ? (
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setPhoneMode(true)}>
                Đăng ký bằng số điện thoại
              </Button>
            ) : null}

            <div className="mt-5 flex items-center gap-3 text-xs text-gray-400" aria-hidden="true">
              <div className="h-px flex-1 bg-gray-200" />
              hoặc
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              {error ? <Alert>{error}</Alert> : null}
              <div>
                <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-navy">Email</label>
                <Input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ban@example.com"
                />
              </div>
              <div>
                <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-navy">Mật khẩu</label>
                <Input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div>
                <label htmlFor="register-confirm" className="mb-1 block text-sm font-medium text-navy">Nhập lại mật khẩu</label>
                <Input
                  id="register-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Nhập lại mật khẩu"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Đã có tài khoản?{' '}
              <Link to="/login" className="font-semibold text-sky-blue hover:underline">
                Đăng nhập
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
