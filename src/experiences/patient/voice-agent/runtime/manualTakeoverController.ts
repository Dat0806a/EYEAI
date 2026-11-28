import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Detects genuine human interaction inside the patient workspace while the Agent is actively executing
 * so the Agent pauses conflicting actions, refreshes context, and avoids executing stale plans.
 */
export function useManualTakeoverWatcher(params: {
  isAgentActive: boolean;
  isAgentActingRef: MutableRefObject<boolean>;
  onManualTakeover: () => void;
}) {
  const { isAgentActive, isAgentActingRef, onManualTakeover } = params;
  const callbackRef = useRef(onManualTakeover);
  callbackRef.current = onManualTakeover;

  useEffect(() => {
    if (!isAgentActive) return;

    const handleUserEvent = (e: Event) => {
      if (isAgentActingRef.current) return;
      const target = e.target as Element | null;
      if (!target) return;
      // Ignore interactions with the Agent's own launcher/popup controls
      if (target.closest('[data-testid="patient-agent-runtime-root"]')) return;
      if (!target.closest('[data-patient-workspace="true"]')) return;
      callbackRef.current();
    };

    document.addEventListener('pointerdown', handleUserEvent, true);
    document.addEventListener('keydown', handleUserEvent, true);
    document.addEventListener('change', handleUserEvent, true);

    return () => {
      document.removeEventListener('pointerdown', handleUserEvent, true);
      document.removeEventListener('keydown', handleUserEvent, true);
      document.removeEventListener('change', handleUserEvent, true);
    };
  }, [isAgentActive, isAgentActingRef]);
}
