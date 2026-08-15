import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage } from './pages/DashboardPage';
import { ScanPage } from './pages/ScanPage';
import { ReviewPage } from './pages/ReviewPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { HistoryPage } from './pages/HistoryPage';
import { OAuthCallbackPage } from './pages/OAuthCallback';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/review/:reportId" element={<ReviewPage />} />
            <Route path="/analysis/:reportId" element={<AnalysisPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
