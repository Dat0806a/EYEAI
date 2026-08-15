import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import type { AuthIntent } from '../types';

const MISSING_CODE_MESSAGE = 'Không tìm thấy mã đăng nhập hợp lệ.';
const INVALID_INTENT_MESSAGE = 'Mục đích xác thực không hợp lệ. Vui lòng bắt đầu lại.';
const EXCHANGE_ERROR_MESSAGE = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.';

function parseIntent(value: string | null): AuthIntent | null {
  return value === 'LOGIN' || value === 'REGISTER' || value === 'LINK' ? value : null;
}

function authErrorCode(error: unknown): string | null {
  const code = (error as {
    response?: { data?: { error?: { code?: unknown } } };
  } | null)?.response?.data?.error?.code;
  return typeof code === 'string' ? code : null;
}

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();
  const code = params.get('code');
  const rawIntent = params.get('intent');
  const intent = useMemo(() => parseIntent(rawIntent), [rawIntent]);
  const attemptKey = code && intent ? `${intent}:${code}` : null;
  const attemptedKey = useRef<string | null>(null);
  const effectGeneration = useRef(0);
  const [error, setError] = useState(() => (
    !code ? MISSING_CODE_MESSAGE : !intent ? INVALID_INTENT_MESSAGE : ''
  ));
  const [guidanceTarget, setGuidanceTarget] = useState<'login' | 'register' | null>(null);

  useEffect(() => {
    if (!code || !intent || !attemptKey) {
      effectGeneration.current += 1;
      attemptedKey.current = null;
      setGuidanceTarget(null);
      setError(!code ? MISSING_CODE_MESSAGE : INVALID_INTENT_MESSAGE);
      return;
    }
    if (attemptedKey.current === attemptKey) return;

    attemptedKey.current = attemptKey;
    const currentEffectGeneration = ++effectGeneration.current;
    setError('');
    setGuidanceTarget(null);
    void completeOAuth(code, intent)
      .then((completed) => {
        if (currentEffectGeneration !== effectGeneration.current) return;
        if (!completed) {
          setError(EXCHANGE_ERROR_MESSAGE);
          return;
        }
        navigate(intent === 'LOGIN' ? '/dashboard' : '/profile', { replace: true });
      })
      .catch((caught) => {
        if (currentEffectGeneration !== effectGeneration.current) return;
        const codeResult = authErrorCode(caught);
        if (codeResult === 'REGISTRATION_REQUIRED') {
          setError('Bạn chưa có tài khoản. Hãy đăng ký.');
          setGuidanceTarget('register');
          return;
        }
        if (codeResult === 'LOGIN_REQUIRED') {
          setError('Tài khoản này đã được đăng ký. Vui lòng đăng nhập.');
          setGuidanceTarget('login');
          return;
        }
        setError(EXCHANGE_ERROR_MESSAGE);
      });
  }, [attemptKey, code, completeOAuth, intent, navigate]);

  const operationName = intent === 'REGISTER'
    ? 'đăng ký'
    : intent === 'LINK'
      ? 'liên kết tài khoản'
      : 'đăng nhập';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-blue/20 via-cream/60 to-white p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-navy">
          {error ? `Không thể hoàn tất ${operationName}` : `Đang xử lý ${operationName}`}
        </h1>
        {error ? (
          <>
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
            <p className="mt-4 text-center text-sm">
              <Link
                to={guidanceTarget === 'register' ? '/register' : '/login'}
                className="font-semibold text-sky-blue hover:underline"
              >
                {guidanceTarget === 'register'
                  ? 'Đăng ký'
                  : guidanceTarget === 'login'
                    ? 'Đăng nhập'
                    : 'Quay lại đăng nhập'}
              </Link>
            </p>
          </>
        ) : (
          <div className="mt-6">
            <Spinner label={`Đang ${operationName}...`} />
          </div>
        )}
      </Card>
    </div>
  );
}
