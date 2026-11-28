import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PatientAgentRuntimeRoot from '../PatientAgentRuntimeRoot';

describe('Phase 3: Persistent Floating Agent UI', () => {
  it('renders single AI AGENT launcher, opens/minimizes popup, and persists conversation across route changes', async () => {
    const onNavigate = vi.fn();
    const onSwitchToDefaultMode = vi.fn();

    const { rerender } = render(
      <PatientAgentRuntimeRoot
        currentRoute="patient-home"
        isVisible={true}
        userId="u_pat_1"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={onSwitchToDefaultMode}
      />
    );

    const launcher = screen.getByTestId('patient-agent-launcher');
    expect(launcher).toHaveTextContent('AI AGENT');
    expect(screen.queryByTestId('patient-agent-popup')).not.toBeInTheDocument();

    // Open popup
    fireEvent.click(launcher);
    expect(screen.getByTestId('patient-agent-popup')).toBeInTheDocument();
    expect(screen.getByTestId('agent-status-indicator')).toHaveTextContent('Sẵn sàng');

    // Send a message
    const input = screen.getByTestId('agent-text-input');
    fireEvent.change(input, { target: { value: 'Kiểm tra kết quả xét nghiệm' } });
    fireEvent.click(screen.getByTestId('agent-send-button'));

    expect(await screen.findByText('Kiểm tra kết quả xét nghiệm')).toBeInTheDocument();

    // Minimize popup -> keeps session & shows minimized bar
    fireEvent.click(screen.getByTestId('agent-minimize-btn'));
    expect(screen.queryByTestId('patient-agent-popup')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-minimized-bar')).toBeInTheDocument();

    // Navigate across patient routes -> conversation must persist!
    rerender(
      <PatientAgentRuntimeRoot
        currentRoute="patient-scan"
        isVisible={true}
        userId="u_pat_1"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={onSwitchToDefaultMode}
      />
    );

    fireEvent.click(screen.getByTestId('agent-minimized-expand'));
    expect(screen.getByTestId('patient-agent-popup')).toBeInTheDocument();
    expect(screen.getByText('Kiểm tra kết quả xét nghiệm')).toBeInTheDocument();

    // Switching userId resets conversation completely (patient isolation)
    rerender(
      <PatientAgentRuntimeRoot
        currentRoute="patient-home"
        isVisible={true}
        userId="u_pat_2"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={onSwitchToDefaultMode}
      />
    );
    expect(screen.queryByText('Kiểm tra kết quả xét nghiệm')).not.toBeInTheDocument();
  });

  it('hides floating UI when isVisible is false (e.g. non-patient route) without losing session on return', async () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <PatientAgentRuntimeRoot
        currentRoute="patient-home"
        isVisible={true}
        userId="u_pat_1"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('patient-agent-launcher'));
    fireEvent.change(screen.getByTestId('agent-text-input'), { target: { value: 'Tin nhắn giữ lại' } });
    fireEvent.click(screen.getByTestId('agent-send-button'));
    expect(await screen.findByText('Tin nhắn giữ lại')).toBeInTheDocument();

    rerender(
      <PatientAgentRuntimeRoot
        currentRoute="settings"
        isVisible={false}
        userId="u_pat_1"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={vi.fn()}
      />
    );
    expect(screen.queryByTestId('patient-agent-launcher')).not.toBeInTheDocument();

    rerender(
      <PatientAgentRuntimeRoot
        currentRoute="patient-analysis"
        isVisible={true}
        userId="u_pat_1"
        onNavigate={onNavigate}
        onSwitchToDefaultMode={vi.fn()}
      />
    );
    expect(screen.getByText('Tin nhắn giữ lại')).toBeInTheDocument();
  });
});
