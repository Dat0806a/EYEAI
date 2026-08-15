import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RequireAuth() {
  const { token, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-soft-gray">
        <div className="text-navy">Đang tải...</div>
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
