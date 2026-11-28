import { useEffect } from 'react';
import { usePatientMode } from '../../mode/PatientModeProvider';
import {
  updatePatientRuntimeSnapshot,
  resetPatientRuntimeSnapshot,
} from './patientRuntimeStore';
import type { PatientRuntimeSnapshot } from '../types/agentTypes';

/**
 * Lightweight hook for patient pages to sync their local state
 * into the global `patientRuntimeStore` so the AI Agent's planner
 * can see verified application state.
 *
 * Only writes when mode === 'agent'; completely no-ops in Default Mode
 * to avoid any performance or bundle overhead for non-agent users.
 *
 * Usage:
 *   useAgentRuntimeSync({ currentRoute: 'patient-scan', ocrStatus, ... });
 */
export function useAgentRuntimeSync(
  partial: Partial<PatientRuntimeSnapshot>
): void {
  const { mode } = usePatientMode();

  useEffect(() => {
    if (mode !== 'agent') return;
    updatePatientRuntimeSnapshot(partial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ...Object.values(partial)]);
}

/**
 * Resets the runtime snapshot when called (e.g., on mode switch or logout).
 * Returns the reset function so callers can invoke it imperatively.
 */
export function useAgentRuntimeReset(): () => void {
  return resetPatientRuntimeSnapshot;
}
