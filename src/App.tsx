import React, { useState, useEffect } from 'react';
import { EyeTrackingProvider } from './modules/eye-control/EyeTrackingProvider';
import { EyeNavigationProvider } from './modules/eye-control/EyeNavigationProvider';
import { useEyeTrackingSettings } from './modules/eye-control/useEyeTracking';
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
import { TutorialProvider, useTutorial } from './context/TutorialContext';
import { OnboardingModal } from './components/ui/OnboardingModal';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Patient Experience Imports
import { PatientDashboardPage } from './experiences/patient/pages/PatientDashboardPage';
import { PatientScanPage } from './experiences/patient/pages/PatientScanPage';
import { PatientReviewPage } from './experiences/patient/pages/PatientReviewPage';
import { PatientAnalysisPage } from './experiences/patient/pages/PatientAnalysisPage';
import { PatientHistoryPage } from './experiences/patient/pages/PatientHistoryPage';
import { PatientModeProvider, usePatientMode } from './experiences/patient/mode/PatientModeProvider';
import { PatientModeSelectPage } from './experiences/patient/mode/PatientModeSelectPage';
import { OcrResultItem, AnalysisBundle } from './types/patient';
import { resetPatientRuntimeSnapshot } from './experiences/patient/voice-agent/context/patientRuntimeStore';

const LazyPatientAgentRuntimeRoot = React.lazy(
  () => import('./experiences/patient/voice-agent/PatientAgentRuntimeRoot')
);

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
  | 'patient-mode-select'
  | 'patient-home'
  | 'patient-scan'
  | 'patient-review'
  | 'patient-analysis'
  | 'patient-history';

function AppContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { isTutorialOpen, openTutorial, closeTutorial } = useTutorial();
  const { isAuthenticated, profile, loading: authLoading } = auth;
  const { settings, setEyeControlEnabled } = useEyeTrackingSettings();
  const { mode: patientMode, featureEnabled: patientAgentFeatureEnabled, selectMode: selectPatientMode, resetMode: resetPatientMode } = usePatientMode();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [awaitingLoginRoute, setAwaitingLoginRoute] = useState<boolean>(false);

  // Auto-disable eye control mode for patient accounts
  useEffect(() => {
    if (profile?.account_type === 'patient' && settings.eyeControlEnabled) {
      setEyeControlEnabled(false);
    }
  }, [profile?.account_type, settings.eyeControlEnabled, setEyeControlEnabled]);
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
  const [isAutoEmergencyCall, setIsAutoEmergencyCall] = useState<boolean>(false);

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
      if (params.autoCall !== undefined) {
        setIsAutoEmergencyCall(params.autoCall);
      } else {
        setIsAutoEmergencyCall(false);
      }
    } else {
      setIsAutoEmergencyCall(false);
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
      setAwaitingLoginRoute(false);
    }
  }, [isAuthenticated, authLoading]);

  // Resolve post-login route only after profile account_type is verified
  useEffect(() => {
    if (!awaitingLoginRoute || !isAuthenticated || authLoading || !profile?.account_type) return;
    setAwaitingLoginRoute(false);
    if (profile.account_type === 'patient') {
      navigateTo(patientAgentFeatureEnabled ? 'patient-mode-select' : 'patient-home');
    } else {
      openTutorial();
      navigateTo('home');
    }
  }, [awaitingLoginRoute, isAuthenticated, authLoading, profile?.account_type, patientAgentFeatureEnabled]);

  // Lang nghe su kien thoat toan cuc `eyeai:escape` (tu EyeNavigationProvider khi het modal/nut Back) de dua ve trang chu
  useEffect(() => {
    const handleEyeEscape = () => {
      const homeRoute = profile?.account_type === 'patient' ? 'patient-home' : 'home';
      if (currentRoute !== homeRoute && currentRoute !== 'patient-mode-select' && currentRoute !== 'auth' && currentRoute !== 'login' && currentRoute !== 'register') {
        navigateTo(homeRoute);
      }
    };

    window.addEventListener('eyeai:escape', handleEyeEscape);
    return () => window.removeEventListener('eyeai:escape', handleEyeEscape);
  }, [currentRoute, profile?.account_type]);

  // Lang nghe su kien khan cap toan cuc `eyeai:emergency` (khi chop mat 3 lan hoac bam F1) de mo ngay trang SOS va tu dong goi
  useEffect(() => {
    const handleGlobalEmergency = () => {
      if (profile?.account_type === 'patient') return;
      setIsAutoEmergencyCall(true);
      setCurrentRoute('sos');
      window.scrollTo(0, 0);
    };

    window.addEventListener('eyeai:emergency', handleGlobalEmergency);
    return () => window.removeEventListener('eyeai:emergency', handleGlobalEmergency);
  }, [profile?.account_type]);

  // EXPERIENCE ROUTER ENGINE: Handle account_type switching automatically
  useEffect(() => {
    if (!isAuthenticated || authLoading || !profile?.account_type) return;

    const accountType = profile.account_type;

    // Check if user account_type has changed while logged in
    if (accountType === 'patient') {
      const impairedRoutes: AppRoute[] = ['home', 'speak', 'ai', 'sos', 'entertainment', 'location', 'contacts', 'chat', 'dev-dashboard'];
      const patientWorkRoutes: AppRoute[] = ['patient-home', 'patient-scan', 'patient-review', 'patient-analysis', 'patient-history'];
      if (impairedRoutes.includes(currentRoute)) {
        setCurrentRoute(patientAgentFeatureEnabled && patientMode === null ? 'patient-mode-select' : 'patient-home');
      } else if (patientAgentFeatureEnabled && patientMode === null && patientWorkRoutes.includes(currentRoute)) {
        setCurrentRoute('patient-mode-select');
      }
    } else if (accountType === 'impaired') {
      const patientRoutes: AppRoute[] = ['patient-mode-select', 'patient-home', 'patient-scan', 'patient-review', 'patient-analysis', 'patient-history'];
      if (patientRoutes.includes(currentRoute)) {
        setCurrentRoute('home');
      }
    }
  }, [profile?.account_type, isAuthenticated, authLoading, currentRoute, patientMode, patientAgentFeatureEnabled]);

  // Show Auth Screen whenever splash is closed and user hasn't passed auth yet, or route is auth/login/register
  const shouldShowAuth =
    !hasPassedAuth ||
    !isAuthenticated ||
    currentRoute === 'auth' ||
    currentRoute === 'login' ||
    currentRoute === 'register';

  const isResolvingPostLoginProfile =
    !isSplashActive &&
    !shouldShowAuth &&
    (authLoading || !profile?.account_type || awaitingLoginRoute);

  const handleLoginSuccess = () => {
    setHasPassedAuth(true);
    resetPatientMode();
    resetPatientRuntimeSnapshot();
    if (profile?.account_type === 'patient') {
      navigateTo(patientAgentFeatureEnabled ? 'patient-mode-select' : 'patient-home');
    } else if (profile?.account_type === 'impaired') {
      openTutorial();
      navigateTo('home');
    } else {
      setAwaitingLoginRoute(true);
    }
  };

  const getHomeRoute = (): AppRoute => {
    if (profile?.account_type === 'patient') {
      return patientAgentFeatureEnabled && patientMode === null ? 'patient-mode-select' : 'patient-home';
    }
    return 'home';
  };

  return (
    <>
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

      {/* Global Accessibility Eye Camera HUD - only for verified Impaired users, never on Patient routes or while resolving profile */}
      {!isSplashActive && !shouldShowAuth && !isResolvingPostLoginProfile && profile?.account_type === 'impaired' && !currentRoute.startsWith('patient-') && (
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

            {/* 1B. Profile Resolution Gate (prevents routing patient through Impaired Home) */}
            {isResolvingPostLoginProfile && (
              <motion.div
                key="page-resolving-profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="min-h-screen flex items-center justify-center p-6"
              >
                <div className="bg-white/95 rounded-[28px] px-6 py-5 border-2 border-[#14213D]/12 shadow-md text-center">
                  <p className="font-black text-base text-[#14213D]">Đang xác minh tài khoản...</p>
                  <p className="text-xs font-bold text-[#3B4B68] mt-1">Vui lòng chờ trong giây lát</p>
                </div>
              </motion.div>
            )}

            {/* 2A. IMPAIRED EXPERIENCE PAGES */}
            {!isSplashActive && !shouldShowAuth && !isResolvingPostLoginProfile && profile?.account_type === 'impaired' && currentRoute === 'home' && (
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
                <SosPage onBack={() => navigateTo('home')} autoCall={isAutoEmergencyCall} />
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
            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-mode-select' && (
              <motion.div
                key="page-patient-mode-select"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <PatientModeSelectPage
                  onSelectDefaultMode={() => {
                    selectPatientMode('default');
                    resetPatientRuntimeSnapshot();
                    navigateTo('patient-home');
                  }}
                  onSelectAgentMode={() => {
                    selectPatientMode('agent');
                    resetPatientRuntimeSnapshot();
                    navigateTo('patient-home');
                  }}
                  onOpenSettings={() => navigateTo('settings')}
                />
              </motion.div>
            )}

            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-home' && (
              <motion.div
                key="page-patient-home"
                data-patient-workspace="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <PatientDashboardPage
                  onNavigate={navigateTo}
                  onOpenModeSelect={() => {
                    resetPatientMode();
                    navigateTo('patient-mode-select');
                  }}
                />
              </motion.div>
            )}

            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-scan' && (
              <motion.div
                key="page-patient-scan"
                data-patient-workspace="true"
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

            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-review' && (
              <motion.div
                key="page-patient-review"
                data-patient-workspace="true"
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
                    const targetId = activeReportId || bundle.analysis?.reportId;
                    navigateTo('patient-analysis', { reportId: targetId, bundle });
                  }}
                />
              </motion.div>
            )}

            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-analysis' && (
              <motion.div
                key="page-patient-analysis"
                data-patient-workspace="true"
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

            {!shouldShowAuth && !authLoading && !isResolvingPostLoginProfile && profile?.account_type === 'patient' && currentRoute === 'patient-history' && (
              <motion.div
                key="page-patient-history"
                data-patient-workspace="true"
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

      {/* Persistent Lazy-Loaded Patient Autonomous Voice Agent (Mode B only) */}
      {!isSplashActive &&
        !shouldShowAuth &&
        !isResolvingPostLoginProfile &&
        profile?.account_type === 'patient' &&
        patientAgentFeatureEnabled &&
        patientMode === 'agent' && (
          <React.Suspense fallback={null}>
            <LazyPatientAgentRuntimeRoot
              currentRoute={currentRoute}
              isVisible={currentRoute.startsWith('patient-') && currentRoute !== 'patient-mode-select'}
              userId={auth.userId}
              onNavigate={navigateTo}
              onSwitchToDefaultMode={() => {
                selectPatientMode('default');
                if (currentRoute === 'patient-mode-select') {
                  navigateTo('patient-home');
                }
              }}
            />
          </React.Suspense>
        )}

      {/* Onboarding Tutorial Modal (never obstructs patient mode selection) */}
      <OnboardingModal
        isOpen={isTutorialOpen && currentRoute !== 'patient-mode-select'}
        onClose={closeTutorial}
      />
    </>
  );
}

function AppWithPatientMode() {
  const auth = useAuth();
  return (
    <PatientModeProvider
      userId={auth.userId}
      accountType={auth.profile?.account_type}
      isAuthenticated={auth.isAuthenticated}
    >
      <AppContent auth={auth} />
    </PatientModeProvider>
  );
}

/**
 * Thanh phan goc `App`: Boc he thong trong cay cung cap ngu canh phan tang.
 * - `ErrorBoundary` -> `TutorialProvider` -> `EyeTrackingProvider` (nhan dien camera va cu chi mat)
 *   -> `EyeNavigationProvider` (dieu huong khong gian 2 chieu va luoi) -> `CallProvider` (goi thoai) -> `AppWithPatientMode`.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <TutorialProvider>
        <EyeTrackingProvider>
          <EyeNavigationProvider>
            <CallProvider>
              <AppWithPatientMode />
            </CallProvider>
          </EyeNavigationProvider>
        </EyeTrackingProvider>
      </TutorialProvider>
    </ErrorBoundary>
  );
}
