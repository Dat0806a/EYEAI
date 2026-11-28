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

  // Reset mode whenever user logs out, switches accounts, or account_type is not patient
  useEffect(() => {
    if (!isAuthenticated || accountType !== 'patient' || !userId) {
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
