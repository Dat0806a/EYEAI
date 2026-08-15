import React, { useState, useEffect } from 'react';
import { EyeTrackingProvider } from './modules/eye-control/EyeTrackingProvider';
import { EyeNavigationProvider } from './modules/eye-control/EyeNavigationProvider';
import { CallProvider } from './modules/calls/CallProvider';
import { GlobalEyeHUD } from './components/ui/GlobalEyeHUD';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { AiPage } from './pages/AiPage';
import { SosPage } from './pages/SosPage';
import { EntertainmentPage } from './pages/EntertainmentPage';
import { LocationPage } from './pages/LocationPage';
import { ContactsPage } from './pages/ContactsPage';
import { HumanChatPage } from './pages/HumanChatPage';
import { SpeakPage } from './pages/SpeakPage';
import EyeTalkDashboard from './components/EyeTalkDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { BackgroundVideo } from './components/ui/BackgroundVideo';
import { AudioUnlockBanner } from './components/ui/AudioUnlockBanner';
import { SplashScreen } from './components/ui/SplashScreen';
import { preloadManager, PreloadProgressState } from './services/preloadManager';

import { AuthPage } from './pages/AuthPage';
import { useAuth } from './hooks/useAuth';

// Patient Experience Imports
import { PatientDashboardPage } from './experiences/patient/pages/PatientDashboardPage';
import { PatientScanPage } from './experiences/patient/pages/PatientScanPage';
import { PatientReviewPage } from './experiences/patient/pages/PatientReviewPage';
import { PatientAnalysisPage } from './experiences/patient/pages/PatientAnalysisPage';
import { PatientHistoryPage } from './experiences/patient/pages/PatientHistoryPage';
import { OcrResultItem, AnalysisBundle } from './types/patient';

export type AppRoute =
  | 'home'
  | 'speak'
  | 'settings'
  | 'ai'
  | 'sos'
  | 'entertainment'
  | 'location'
  | 'contacts'
  | 'chat'
  | 'dev-dashboard'
  | 'auth'
  | 'login'
  | 'register'
  // Patient routes
  | 'patient-home'
  | 'patient-scan'
  | 'patient-review'
  | 'patient-analysis'
  | 'patient-history';

export default function App() {
  const { isAuthenticated, profile, loading: authLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [chatFriend, setChatFriend] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);

  // Patient Route State Parameters
  const [activeReportId, setActiveReportId] = useState<string>('');
  const [ocrResultsState, setOcrResultsState] = useState<OcrResultItem[]>([]);
  const [analysisBundleState, setAnalysisBundleState] = useState<AnalysisBundle | null>(null);
  const [analysisInitialTab, setAnalysisInitialTab] = useState<'analysis' | 'meal' | 'exercise'>('analysis');

  // Startup Splash & Real Preload State
  const [isSplashActive, setIsSplashActive] = useState<boolean>(true);
  const [preloadState, setPreloadState] = useState<PreloadProgressState>({
    progress: 0,
    completedTasks: 0,
    totalTasks: 0,
    currentTaskName: 'Đang chuẩn bị...',
    isComplete: false,
    hasError: false,
  });

  useEffect(() => {
    const unsubscribe = preloadManager.subscribe((state) => {
      setPreloadState(state);
    });

    preloadManager.startPreload();

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRetryPreload = () => {
    preloadManager.startPreload();
  };

  const navigateTo = (route: string, params?: Record<string, any>) => {
    if (params) {
      if (params.reportId) setActiveReportId(params.reportId);
      if (params.results) setOcrResultsState(params.results);
      if (params.bundle) setAnalysisBundleState(params.bundle);
      if (params.tab) setAnalysisInitialTab(params.tab);
    }
    setCurrentRoute(route as AppRoute);
    window.scrollTo(0, 0);
  };

  const handleOpenHumanChat = (friend: { id: string; name: string; avatarUrl?: string | null }) => {
    setChatFriend(friend);
    setCurrentRoute('chat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [hasPassedAuth, setHasPassedAuth] = useState<boolean>(false);

  // Reset auth gate if unauthenticated
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      setHasPassedAuth(false);
    }
  }, [isAuthenticated, authLoading]);

  // EXPERIENCE ROUTER ENGINE: Handle account_type switching automatically
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    const accountType = profile?.account_type;

    // Check if user account_type has changed while logged in
    if (accountType === 'patient') {
      const impairedRoutes: AppRoute[] = ['home', 'speak', 'ai', 'sos', 'entertainment', 'location', 'contacts', 'chat', 'dev-dashboard'];
      if (impairedRoutes.includes(currentRoute)) {
        setCurrentRoute('patient-home');
      }
    } else if (accountType === 'impaired') {
      const patientRoutes: AppRoute[] = ['patient-home', 'patient-scan', 'patient-review', 'patient-analysis', 'patient-history'];
      if (patientRoutes.includes(currentRoute)) {
        setCurrentRoute('home');
      }
    }
  }, [profile?.account_type, isAuthenticated, authLoading, currentRoute]);

  // Show Auth Screen whenever splash is closed and user hasn't passed auth yet, or route is auth/login/register
  const shouldShowAuth =
    !hasPassedAuth ||
    !isAuthenticated ||
    currentRoute === 'auth' ||
    currentRoute === 'login' ||
    currentRoute === 'register';

  const handleLoginSuccess = () => {
    setHasPassedAuth(true);
    if (profile?.account_type === 'patient') {
      navigateTo('patient-home');
    } else {
      navigateTo('home');
    }
  };

  const getHomeRoute = (): AppRoute => {
    return profile?.account_type === 'patient' ? 'patient-home' : 'home';
  };

  return (
    <EyeTrackingProvider>
      <EyeNavigationProvider>
        <CallProvider>
          {/* iOS Safari Audio Unlock Helper Banner */}
          <AudioUnlockBanner />

          {/* 0. Startup Splash Screen with Real Preloader */}
          <AnimatePresence>
            {isSplashActive && (
              <SplashScreen
                isPreloadComplete={preloadState.isComplete}
                preloadProgress={preloadState.progress}
                preloadStatusText={preloadState.currentTaskName}
                preloadError={preloadState.hasError ? preloadState.errorMessage || 'Lỗi tải tài nguyên' : null}
                onRetryPreload={handleRetryPreload}
                onSplashFinished={() => setIsSplashActive(false)}
              />
            )}
          </AnimatePresence>

          {/* Global Accessibility Eye Camera HUD */}
          {!isSplashActive && !shouldShowAuth && (
            <GlobalEyeHUD variant="floating" currentRoute={currentRoute} />
          )}

          <div className="min-h-screen text-[#14213D] font-sans antialiased selection:bg-[#6AC9F0] selection:text-[#14213D] relative bg-[#FFF2D6]">
            {/* Continuous Full-Screen Global Video Background for main app */}
            {!shouldShowAuth && <BackgroundVideo />}

            {/* Application Content Layer */}
            <div className="relative z-10">
              <AnimatePresence mode="wait">
                {/* 1. Unauthenticated Gateway: Login / Register */}
                {!isSplashActive && shouldShowAuth && (
                  <motion.div
                    key="page-auth"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <AuthPage
                      initialMode={currentRoute === 'register' ? 'register' : 'login'}
                      onLoginSuccess={handleLoginSuccess}
                    />
                  </motion.div>
                )}

                {/* 2A. IMPAIRED EXPERIENCE PAGES */}
                {!isSplashActive && !shouldShowAuth && currentRoute === 'home' && (
                  <motion.div
                    key="page-home"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <HomePage onNavigate={navigateTo} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'speak' && (
                  <motion.div
                    key="page-speak"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SpeakPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'ai' && (
                  <motion.div
                    key="page-ai"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <AiPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'sos' && (
                  <motion.div
                    key="page-sos"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SosPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'entertainment' && (
                  <motion.div
                    key="page-entertainment"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EntertainmentPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'location' && (
                  <motion.div
                    key="page-location"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <LocationPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'contacts' && (
                  <motion.div
                    key="page-contacts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ContactsPage
                      onBack={() => navigateTo('home')}
                      onOpenChat={handleOpenHumanChat}
                    />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'chat' && chatFriend && (
                  <motion.div
                    key="page-chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <HumanChatPage
                      friend={chatFriend}
                      onBack={() => navigateTo('contacts')}
                    />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'dev-dashboard' && (
                  <motion.div
                    key="page-dev-dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EyeTalkDashboard onBackToHome={() => navigateTo('home')} />
                  </motion.div>
                )}

                {/* 2B. SHARED SETTINGS PAGE */}
                {!shouldShowAuth && !authLoading && currentRoute === 'settings' && (
                  <motion.div
                    key="page-settings"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SettingsPage onBack={() => navigateTo(getHomeRoute())} />
                  </motion.div>
                )}

                {/* 2C. PATIENT EXPERIENCE PAGES */}
                {!shouldShowAuth && !authLoading && currentRoute === 'patient-home' && (
                  <motion.div
                    key="page-patient-home"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PatientDashboardPage onNavigate={navigateTo} />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'patient-scan' && (
                  <motion.div
                    key="page-patient-scan"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PatientScanPage
                      onBack={() => navigateTo('patient-home')}
                      onOpenSettings={() => navigateTo('settings')}
                      onScanComplete={(reportId, results) => {
                        navigateTo('patient-review', { reportId, results });
                      }}
                    />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'patient-review' && (
                  <motion.div
                    key="page-patient-review"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PatientReviewPage
                      reportId={activeReportId}
                      initialResults={ocrResultsState}
                      onBack={() => navigateTo('patient-scan')}
                      onOpenSettings={() => navigateTo('settings')}
                      onConfirmSuccess={(bundle) => {
                        navigateTo('patient-analysis', { reportId: activeReportId, bundle });
                      }}
                    />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'patient-analysis' && (
                  <motion.div
                    key="page-patient-analysis"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PatientAnalysisPage
                      reportId={activeReportId}
                      initialBundle={analysisBundleState}
                      initialTab={analysisInitialTab}
                      onBack={() => navigateTo('patient-home')}
                      onOpenSettings={() => navigateTo('settings')}
                    />
                  </motion.div>
                )}

                {!shouldShowAuth && !authLoading && currentRoute === 'patient-history' && (
                  <motion.div
                    key="page-patient-history"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PatientHistoryPage
                      onBack={() => navigateTo('patient-home')}
                      onOpenSettings={() => navigateTo('settings')}
                      onSelectReport={(reportId) => {
                        navigateTo('patient-analysis', { reportId, bundle: null });
                      }}
                      onNavigateScan={() => navigateTo('patient-scan')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </CallProvider>
      </EyeNavigationProvider>
    </EyeTrackingProvider>
  );
}
