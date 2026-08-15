import React, { useState, useEffect } from 'react';
import { AuthStage } from '../components/auth/AuthStage';

export interface AuthPageProps {
  initialMode?: 'login' | 'register';
  onLoginSuccess: () => void;
}

export function AuthPage({ initialMode = 'login', onLoginSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  return (
    <AuthStage
      mode={mode}
      onModeChange={setMode}
      onLoginSuccess={onLoginSuccess}
    />
  );
}
