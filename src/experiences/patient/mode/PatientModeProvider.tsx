import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type PatientExperienceMode = 'default' | 'agent' | null;

export function isPatientAgentFeatureEnabled(): boolean {
  const flag = import.meta.env?.VITE_ENABLE_PATIENT_AGENT;
  if (flag === undefined || flag === null || flag === '') return true;
  return String(flag).toLowerCase() !== 'false';
}

export interface PatientModeContextValue {
  mode: PatientExperienceMode;
  featureEnabled: boolean;
  selectMode: (nextMode: 'default' | 'agent') => void;
  resetMode: () => void;
}

const PatientModeContext = createContext<PatientModeContextValue | undefined>(undefined);

interface PatientModeProviderProps {
  userId: string | null;
  accountType: string | null | undefined;
  isAuthenticated: boolean;
  children: ReactNode;
}

export function PatientModeProvider({
  userId,
  accountType,
  isAuthenticated,
  children,
}: PatientModeProviderProps) {
  const featureEnabled = isPatientAgentFeatureEnabled();
  const [mode, setMode] = useState<PatientExperienceMode>(() =>
    featureEnabled ? null : 'default'
  );

  const prevUserIdRef = React.useRef<string | null>(userId);

  // Reset mode only when user logs out, switches to a different user, or account_type is not patient
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if ((!isAuthenticated && !userId) || (accountType && accountType !== 'patient')) {
      setMode(featureEnabled ? null : 'default');
    } else if (userId && prevUserId && userId !== prevUserId) {
      setMode(featureEnabled ? null : 'default');
    } else if (!featureEnabled) {
      setMode('default');
    }
  }, [isAuthenticated, accountType, userId, featureEnabled]);

  const selectMode = useCallback(
    (nextMode: 'default' | 'agent') => {
      if (!featureEnabled && nextMode === 'agent') {
        setMode('default');
        return;
      }
      setMode(nextMode);
    },
    [featureEnabled]
  );

  const resetMode = useCallback(() => {
    setMode(featureEnabled ? null : 'default');
  }, [featureEnabled]);

  return (
    <PatientModeContext.Provider
      value={{
        mode,
        featureEnabled,
        selectMode,
        resetMode,
      }}
    >
      {children}
    </PatientModeContext.Provider>
  );
}

export function usePatientMode(): PatientModeContextValue {
  const ctx = useContext(PatientModeContext);
  if (!ctx) {
    return {
      mode: 'default',
      featureEnabled: false,
      selectMode: () => {},
      resetMode: () => {},
    };
  }
  return ctx;
}
