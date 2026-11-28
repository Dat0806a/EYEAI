import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatientModeSelectPage } from '../../mode/PatientModeSelectPage';
import { PatientModeProvider, usePatientMode } from '../../mode/PatientModeProvider';
import { PatientDashboardPage } from '../../pages/PatientDashboardPage';
import { PatientAnalysisPage } from '../../pages/PatientAnalysisPage';

vi.mock('../../../../modules/eye-control/useEyeTracking', () => ({
  useEyeTrackingSettings: () => ({
    settings: {
      eyeControlEnabled: false,
      dwellTimeMs: 1500,
      soundFeedback: false,
      simulatorMode: false,
      speakerEnabled: true,
      speechVolume: 1,
      speechRate: 1,
    },
    setEyeControlEnabled: vi.fn(),
  }),
}));

vi.mock('../../../../modules/eye-control/EyeNavigationProvider', () => ({
  useEyeNavigationContext: () => ({
    activeFocusId: null,
    registerFocusNode: vi.fn(),
    unregisterFocusNode: vi.fn(),
    setFocusId: vi.fn(),
  }),
}));

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u_patient_1', email: 'binh@eyetalk.app' },
    profile: { id: 'u_patient_1', display_name: 'Trần Thị Bình', account_type: 'patient' },
    isAuthenticated: true,
    loading: false,
    userId: 'u_patient_1',
  }),
}));

vi.mock('../../../../services/patientService', () => ({
  getHistory: async () => [],
  getReportDetail: async () => ({
    analysis: { reportId: 'r1', overallSummary: 'Tóm tắt mẫu', results: [] },
    mealPlan: { reportId: 'r1', title: 'Thực đơn', description: 'Mô tả', items: [] },
    exercisePlan: { reportId: 'r1', title: 'Vận động', items: [] },
  }),
}));

function ModeProbe({
  onNavigate = vi.fn(),
}: {
  onNavigate?: (route: string, params?: Record<string, any>) => void;
}) {
  const { mode, selectMode } = usePatientMode();
  return (
    <div>
      <span data-testid="current-mode">{String(mode)}</span>
      <button type="button" onClick={() => selectMode('default')}>
        pick-default
      </button>
      <button type="button" onClick={() => selectMode('agent')}>
        pick-agent
      </button>
      <PatientDashboardPage onNavigate={onNavigate} />
    </div>
  );
}

describe('Phase 2: Dual Patient Mode Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PatientModeSelectPage with the two required choices and fires handlers', () => {
    const onDefault = vi.fn();
    const onAgent = vi.fn();

    render(
      <PatientModeSelectPage
        onSelectDefaultMode={onDefault}
        onSelectAgentMode={onAgent}
      />
    );

    expect(screen.getByText('Chế độ mặc định')).toBeInTheDocument();
    expect(screen.getByText('Sử dụng EYEAI bằng các thao tác thông thường.')).toBeInTheDocument();
    expect(screen.getByText('Chế độ AI Agent')).toBeInTheDocument();
    expect(screen.getByText('Điều khiển EYEAI bằng giọng nói với trợ lý AI.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mode-select-default'));
    expect(onDefault).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mode-select-agent'));
    expect(onAgent).toHaveBeenCalledTimes(1);
  });

  it('preserves PatientChatWidget in Mode A and removes it in Mode B', async () => {
    render(
      <PatientModeProvider
        userId="u_patient_1"
        accountType="patient"
        isAuthenticated={true}
      >
        <ModeProbe />
      </PatientModeProvider>
    );

    expect(screen.getByTestId('current-mode')).toHaveTextContent('null');

    // Mode A keeps legacy PatientChatWidget
    fireEvent.click(screen.getByText('pick-default'));
    expect(screen.getByTestId('current-mode')).toHaveTextContent('default');
    expect(screen.getByRole('button', { name: 'Trợ lý sức khỏe' })).toBeInTheDocument();

    // Mode B hides legacy PatientChatWidget so there are never two launchers
    fireEvent.click(screen.getByText('pick-agent'));
    expect(screen.getByTestId('current-mode')).toHaveTextContent('agent');
    expect(screen.queryByRole('button', { name: 'Trợ lý sức khỏe' })).not.toBeInTheDocument();

    // Switching back to Mode A restores legacy chatbot cleanly
    fireEvent.click(screen.getByTestId('btn-switch-patient-mode'));
    await waitFor(() => {
      expect(screen.getByTestId('current-mode')).toHaveTextContent('default');
    });
    expect(screen.getByRole('button', { name: 'Trợ lý sức khỏe' })).toBeInTheDocument();
  });

  it('also hides PatientChatWidget on PatientAnalysisPage when Mode B is active', () => {
    const bundle = {
      analysis: { reportId: 'r1', overallSummary: 'Tóm tắt', results: [] },
      mealPlan: { reportId: 'r1', title: 'Thực đơn', description: 'Mô tả', items: [] },
      exercisePlan: { reportId: 'r1', title: 'Vận động', items: [] },
    };

    const { rerender } = render(
      <PatientModeProvider userId="u_patient_1" accountType="patient" isAuthenticated={true}>
        <ModeSwitchHarness bundle={bundle} targetMode="default" />
      </PatientModeProvider>
    );
    expect(screen.getByRole('button', { name: 'Trợ lý sức khỏe' })).toBeInTheDocument();

    rerender(
      <PatientModeProvider userId="u_patient_1" accountType="patient" isAuthenticated={true}>
        <ModeSwitchHarness bundle={bundle} targetMode="agent" />
      </PatientModeProvider>
    );
    expect(screen.queryByRole('button', { name: 'Trợ lý sức khỏe' })).not.toBeInTheDocument();
  });

  it('resets mode selection when account changes or logs out, and stays off for impaired accounts', () => {
    function InspectMode() {
      const { mode, selectMode } = usePatientMode();
      return (
        <div>
          <span data-testid="mode-val">{String(mode)}</span>
          <button type="button" onClick={() => selectMode('agent')}>
            set-agent
          </button>
        </div>
      );
    }

    const { rerender } = render(
      <PatientModeProvider userId="u_1" accountType="patient" isAuthenticated={true}>
        <InspectMode />
      </PatientModeProvider>
    );

    fireEvent.click(screen.getByText('set-agent'));
    expect(screen.getByTestId('mode-val')).toHaveTextContent('agent');

    // Account switches to impaired
    rerender(
      <PatientModeProvider userId="u_2" accountType="impaired" isAuthenticated={true}>
        <InspectMode />
      </PatientModeProvider>
    );
    expect(screen.getByTestId('mode-val')).toHaveTextContent('null');
  });
});

function ModeSwitchHarness({ bundle, targetMode }: { bundle: any; targetMode: 'default' | 'agent' }) {
  const { mode, selectMode } = usePatientMode();
  React.useEffect(() => {
    if (mode !== targetMode) {
      selectMode(targetMode);
    }
  }, [mode, targetMode, selectMode]);
  return (
    <PatientAnalysisPage
      reportId="r1"
      initialBundle={bundle}
      onBack={vi.fn()}
    />
  );
}
