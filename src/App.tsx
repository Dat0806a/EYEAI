import React, { useState } from 'react';
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
  | 'dev-dashboard';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [chatFriend, setChatFriend] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);

  const navigateTo = (route: string) => {
    setCurrentRoute(route as AppRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenHumanChat = (friend: { id: string; name: string; avatarUrl?: string | null }) => {
    setChatFriend(friend);
    setCurrentRoute('chat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <EyeTrackingProvider>
      <EyeNavigationProvider>
        <CallProvider>
          {/* iOS Safari Audio Unlock Helper Banner */}
          <AudioUnlockBanner />

          {/* Global Accessibility Eye Camera HUD (Floating mini HUD on normal screens) */}
          <GlobalEyeHUD variant="floating" currentRoute={currentRoute} />

          <div className="min-h-screen text-[#14213D] font-sans antialiased selection:bg-[#6AC9F0] selection:text-[#14213D] relative bg-[#FFF2D6]">
            
            {/* Continuous Full-Screen Global Video Background */}
            <BackgroundVideo />

            {/* Application Content Layer */}
            <div className="relative z-10">
              <AnimatePresence mode="wait">
                {currentRoute === 'home' && (
                  <motion.div
                    key="page-home"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <HomePage onNavigate={navigateTo} />
                  </motion.div>
                )}

                {currentRoute === 'speak' && (
                  <motion.div
                    key="page-speak"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <SpeakPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'settings' && (
                  <motion.div
                    key="page-settings"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <SettingsPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'ai' && (
                  <motion.div
                    key="page-ai"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <AiPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'sos' && (
                  <motion.div
                    key="page-sos"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <SosPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'entertainment' && (
                  <motion.div
                    key="page-entertainment"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <EntertainmentPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'location' && (
                  <motion.div
                    key="page-location"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <LocationPage onBack={() => navigateTo('home')} />
                  </motion.div>
                )}

                {currentRoute === 'contacts' && (
                  <motion.div
                    key="page-contacts"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ContactsPage
                      onBack={() => navigateTo('home')}
                      onOpenChat={handleOpenHumanChat}
                    />
                  </motion.div>
                )}

                {currentRoute === 'chat' && chatFriend && (
                  <motion.div
                    key="page-chat"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <HumanChatPage
                      friend={chatFriend}
                      onBack={() => navigateTo('contacts')}
                    />
                  </motion.div>
                )}

                {currentRoute === 'dev-dashboard' && (
                  <motion.div
                    key="page-dev-dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <EyeTalkDashboard onBackToHome={() => navigateTo('home')} />
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
