import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Camera, HeartPulse, History, LogOut, ScanLine, Utensils, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import { ChatWidget } from '../components/ChatWidget';

export function DashboardPage() {
  const { token, profile, hasProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!hasProfile) {
      navigate('/profile');
    }
  }, [hasProfile, navigate]);

  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-soft-gray">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-coral" />
            <span className="text-lg font-bold text-navy">Y tế cho người bình thường</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="touch-target flex h-10 w-10 items-center justify-center rounded-full bg-sky-blue text-white"
              aria-label="Menu tài khoản"
            >
              <User className="h-5 w-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 w-52 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
                <Link to="/history" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-navy hover:bg-gray-50">
                  <History className="h-4 w-4" /> Lịch sử
                </Link>
                <Link to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-navy hover:bg-gray-50">
                  <User className="h-4 w-4" /> Hồ sơ
                </Link>
                <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-coral hover:bg-red-50">
                  <LogOut className="h-4 w-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-navy">
          Xin chào, {profile?.full_name?.split(' ').pop() ?? 'bạn'} 👋
        </h1>
        <p className="mt-1 text-gray-500">Chụp hoặc tải ảnh giấy xét nghiệm để xem giải thích dễ hiểu.</p>

        <div className="mt-6 grid gap-4">
          <Card className="bg-gradient-to-br from-sky-blue to-health-green text-white">
            <button
              onClick={() => navigate('/scan')}
              className="flex w-full flex-col items-center gap-3 rounded-2xl py-8 text-center"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                <ScanLine className="h-10 w-10" />
              </span>
              <span className="text-3xl font-extrabold tracking-wide">SCAN OCR</span>
              <span className="text-sm text-white/85">Chụp hoặc tải giấy xét nghiệm lên</span>
            </button>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Link to="/scan" className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-navy shadow-sm transition hover:shadow-md">
              <Camera className="h-6 w-6 text-sky-blue" />
              <span className="text-sm font-medium">Quét xét nghiệm</span>
            </Link>
            <Link to="/history" className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-navy shadow-sm transition hover:shadow-md">
              <History className="h-6 w-6 text-health-green" />
              <span className="text-sm font-medium">Lịch sử</span>
            </Link>
            <Link to="/scan" className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-navy shadow-sm transition hover:shadow-md">
              <Utensils className="h-6 w-6 text-coral" />
              <span className="text-sm font-medium">Thực đơn</span>
            </Link>
            <Link to="/history" className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-navy shadow-sm transition hover:shadow-md">
              <HeartPulse className="h-6 w-6 text-health-green" />
              <span className="text-sm font-medium">Thể dục</span>
            </Link>
          </div>
        </div>

        <Button variant="ghost" className="mt-6 w-full" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </main>
      <ChatWidget />
    </div>
  );
}
