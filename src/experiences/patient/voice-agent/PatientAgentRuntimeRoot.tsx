import React, { ReactNode } from 'react';
import { PatientAgentErrorBoundary } from './components/PatientAgentErrorBoundary';
import { PatientAgentProvider, usePatientAgent } from './providers/PatientAgentProvider';
import { AgentLauncher } from './components/AgentLauncher';
import { AgentPopup } from './components/AgentPopup';

export interface PatientAgentRuntimeRootProps {
  currentRoute: string;
  isVisible: boolean;
  userId: string | null;
  onNavigate: (route: string, params?: Record<string, any>) => void;
  onSwitchToDefaultMode: () => void;
  children?: ReactNode;
}

function PatientAgentOverlay({ isVisible }: { isVisible: boolean }) {
  const agent = usePatientAgent();

  if (!isVisible) return null;

  return (
    <div data-testid="patient-agent-runtime-root">
      <AgentPopup
        isOpen={agent.popupOpen}
        taskState={agent.taskState}
        messages={agent.messages}
        input={agent.input}
        interimTranscript={agent.interimTranscript}
        activeActionSummary={agent.activeActionSummary}
        pendingConfirmation={agent.pendingConfirmation}
        pendingGesture={agent.pendingGesture}
        errorText={agent.errorText}
        isListening={agent.isListening}
        sttSupported={agent.sttSupported}
        sttNotice={agent.sttNotice}
        voiceOutputEnabled={agent.voiceOutputEnabled}
        onInputChange={agent.setInput}
        onSubmitText={() => {
          void agent.sendMessage();
        }}
        onMinimize={agent.minimizePopup}
        onStopTask={agent.stopTask}
        onResetSession={agent.resetSession}
        onToggleListening={agent.toggleListening}
        onToggleVoiceOutput={agent.toggleVoiceOutput}
        onSpeakMessage={agent.speakMessage}
        onRespondConfirmation={(approved) => {
          void agent.respondToConfirmation(approved);
        }}
        onTriggerGesture={() => {
          void agent.triggerPendingGesture();
        }}
        onDismissGesture={agent.dismissPendingGesture}
      />

      <AgentLauncher
        popupOpen={agent.popupOpen}
        isMinimized={agent.isMinimized}
        taskState={agent.taskState}
        activeActionSummary={agent.activeActionSummary}
        pendingGesture={agent.pendingGesture}
        onToggleOpen={agent.togglePopup}
        onExpandFromMinimized={agent.openPopup}
        onStopTask={agent.stopTask}
        onTriggerGesture={() => {
          void agent.triggerPendingGesture();
        }}
      />
    </div>
  );
}

/**
 * Lazy-loaded boundary for Patient AI Agent runtime.
 * Only mounted when account_type === 'patient' and patientMode === 'agent'.
 */
export default function PatientAgentRuntimeRoot({
  currentRoute,
  isVisible,
  userId,
  onNavigate,
  onSwitchToDefaultMode,
  children,
}: PatientAgentRuntimeRootProps) {
  return (
    <PatientAgentErrorBoundary onFallbackToDefaultMode={onSwitchToDefaultMode}>
      <PatientAgentProvider
        userId={userId}
        currentRoute={currentRoute}
        onNavigate={onNavigate}
      >
        {children}
        <PatientAgentOverlay isVisible={isVisible} />
      </PatientAgentProvider>
    </PatientAgentErrorBoundary>
  );
}
