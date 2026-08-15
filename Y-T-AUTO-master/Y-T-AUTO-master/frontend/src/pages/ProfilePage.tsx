import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  apiError,
  AuthProviders,
  getAuthProviders,
  startOAuthLink,
  updateProfile,
  validateOAuthAuthorization,
  verifyPhoneLinkOtp,
} from '../services/api';
import type { OAuthProvider } from '../types';
import { Alert, Button, Card, Input } from '../components/ui';
import { PhoneOtpFlow } from '../components/PhoneOtpFlow';

interface ProfilePageProps {
  navigateExternal?: (url: string) => void;
}

export function ProfilePage({
  navigateExternal = (url) => window.location.assign(url),
}: ProfilePageProps = {}) {
  const { profile, hasProfile, phone, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth ?? '');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(profile?.gender ?? 'MALE');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [providerError, setProviderError] = useState('');
  const [linkingProvider, setLinkingProvider] = useState<OAuthProvider | null>(null);
  const [phoneLinkOpen, setPhoneLinkOpen] = useState(false);
  const [phoneSuccess, setPhoneSuccess] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setDateOfBirth(profile.date_of_birth);
      setGender(profile.gender);
    }
  }, [profile]);

  useEffect(() => {
    getAuthProviders()
      .then(setProviders)
      .catch(() => setProviderError('Không thể tải các tùy chọn liên kết tài khoản.'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!dateOfBirth) {
      setError('Vui lòng chọn ngày sinh.');
      return;
    }
    setLoading(true);
    try {
      await updateProfile({ fullName: fullName.trim(), dateOfBirth, gender });
      await refreshMe();
      navigate('/dashboard');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const onLinkProvider = async (provider: OAuthProvider) => {
    setProviderError('');
    setLinkingProvider(provider);
    try {
      const authorization = validateOAuthAuthorization(provider, await startOAuthLink(provider));
      navigateExternal(authorization.authorizationUrl);
    } catch (err) {
      setProviderError(apiError(err));
    } finally {
      setLinkingProvider(null);
    }
  };

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const onVerifyPhone = async (challengeToken: string, code: string) => {
    await verifyPhoneLinkOtp(challengeToken, code);
    await refreshMe();
    return true;
  };

  const onPhoneLinked = () => {
    setPhoneLinkOpen(false);
    setPhoneSuccess('Số điện thoại đã được xác minh và liên kết.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-blue/20 via-cream/60 to-white p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-navy">{hasProfile ? 'Hồ sơ cá nhân' : 'Hoàn thiện hồ sơ ✨'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Thông tin này giúp hệ thống giải thích chỉ số và gợi ý dinh dưỡng, vận động phù hợp hơn với bạn.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="mb-1 block text-sm font-medium text-navy">Họ và tên</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-navy">Ngày sinh</label>
            <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-navy">Giới tính</label>
            <div className="grid grid-cols-3 gap-2">
              {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`touch-target rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                    gender === g ? 'border-sky-blue bg-sky-blue/10 text-navy' : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  {g === 'MALE' ? 'Nam' : g === 'FEMALE' ? 'Nữ' : 'Khác'}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu hồ sơ'}
          </Button>
        </form>
        <section className="mt-7 border-t border-gray-100 pt-6" aria-labelledby="phone-account-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="phone-account-heading" className="text-lg font-bold text-navy">Số điện thoại</h2>
              <p className="mt-1 text-sm text-gray-500">Dùng số đã xác minh để đăng nhập an toàn bằng OTP.</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              phone.phoneVerified ? 'bg-health-green/10 text-health-green' : 'bg-amber-50 text-amber-700'
            }`}>
              {phone.phoneVerified ? 'Đã xác minh' : 'Chưa xác minh'}
            </span>
          </div>
          {phone.phoneVerified && phone.maskedPhone ? (
            <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 font-semibold tracking-wide text-navy">
              {phone.maskedPhone}
            </p>
          ) : null}
          {phoneSuccess ? <div className="mt-4"><Alert tone="info">{phoneSuccess}</Alert></div> : null}
          {!phone.phoneVerified && providers?.phoneOtp && !phoneLinkOpen ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => {
                setPhoneSuccess('');
                setPhoneLinkOpen(true);
              }}
            >
              Thêm số điện thoại
            </Button>
          ) : null}
          {!phone.phoneVerified && phoneLinkOpen ? (
            <div className="mt-4 rounded-2xl border border-sky-blue/20 bg-sky-blue/5 p-4">
              <PhoneOtpFlow mode="link" onVerify={onVerifyPhone} onSuccess={onPhoneLinked} />
              <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setPhoneLinkOpen(false)}>
                Đóng
              </Button>
            </div>
          ) : null}
        </section>
        <section className="mt-7 border-t border-gray-100 pt-6" aria-labelledby="linked-accounts-heading">
          <h2 id="linked-accounts-heading" className="text-lg font-bold text-navy">Tài khoản liên kết</h2>
          <p className="mt-1 text-sm text-gray-500">
            Liên kết nhà cung cấp đăng nhập để có thêm cách truy cập an toàn vào tài khoản này.
          </p>
          {providerError && <div className="mt-4"><Alert>{providerError}</Alert></div>}
          {providers ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {providers.google && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={linkingProvider !== null}
                  onClick={() => void onLinkProvider('GOOGLE')}
                  className="w-full"
                >
                  {linkingProvider === 'GOOGLE' ? 'Đang mở Google...' : 'Liên kết Google'}
                </Button>
              )}
              {providers.facebook && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={linkingProvider !== null}
                  onClick={() => void onLinkProvider('FACEBOOK')}
                  className="w-full"
                >
                  {linkingProvider === 'FACEBOOK' ? 'Đang mở Facebook...' : 'Liên kết Facebook'}
                </Button>
              )}
              {!providers.google && !providers.facebook && (
                <p className="text-sm text-gray-500 sm:col-span-2">Chưa có nhà cung cấp liên kết nào được cấu hình.</p>
              )}
            </div>
          ) : !providerError ? (
            <p className="mt-4 text-sm text-gray-500">Đang tải tùy chọn liên kết...</p>
          ) : null}
        </section>
        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={onLogout}>
          Đăng xuất
        </Button>
      </Card>
    </div>
  );
}
