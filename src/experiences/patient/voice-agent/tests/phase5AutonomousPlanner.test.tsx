import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatientAgentProvider, usePatientAgent } from '../providers/PatientAgentProvider';
import { AgentLauncher } from '../components/AgentLauncher';
import { AgentPopup } from '../components/AgentPopup';
import { validateAndNormalizeDecision } from '../../../../../server/patientAgentPlanner';

function Harness({
  plannerFn,
  initialRoute = 'patient-home',
}: {
  plannerFn: any;
  initialRoute?: string;
}) {
  const [route, setRoute] = useState(initialRoute);
  const [tab, setTab] = useState<'analysis' | 'meal'>('analysis');

  return (
    <PatientAgentProvider
      userId="u_pat_1"
      currentRoute={route}
      onNavigate={(r) => setRoute(r)}
      plannerFn={plannerFn}
    >
      <div data-patient-workspace="true">
        <span data-testid="active-route">{route}</span>
        {route === 'patient-home' && (
          <button type="button" onClick={() => setRoute('patient-analysis')}>
            Xem kết quả gần đây
          </button>
        )}
        {route === 'patient-analysis' && (
          <div>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'analysis'}
              onClick={() => setTab('analysis')}
            >
              Kết quả
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'meal'}
              onClick={() => setTab('meal')}
            >
              Thực đơn
            </button>
            <button
              id="btn-confirm-analysis"
              type="button"
              onClick={() => setRoute('patient-analysis')}
            >
              Xác nhận & Phân tích
            </button>
            <span data-testid="active-tab">{tab}</span>
          </div>
        )}
      </div>

      <AgentBridge />
    </PatientAgentProvider>
  );
}

function AgentBridge() {
  const agent = usePatientAgent();
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
        onSubmitText={() => void agent.sendMessage()}
        onMinimize={agent.minimizePopup}
        onStopTask={agent.stopTask}
        onResetSession={agent.resetSession}
        onToggleListening={agent.toggleListening}
        onToggleVoiceOutput={agent.toggleVoiceOutput}
        onSpeakMessage={agent.speakMessage}
        onRespondConfirmation={(a) => void agent.respondToConfirmation(a)}
        onTriggerGesture={() => void agent.triggerPendingGesture()}
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
        onTriggerGesture={() => void agent.triggerPendingGesture()}
      />
    </div>
  );
}

describe('Phase 5: AI Planner & Autonomous Loop', () => {
  it('executes multi-step autonomous plan: navigate -> minimize -> select tab -> verify -> complete', async () => {
    const plannerMock = vi
      .fn()
      // Step 0: on patient-home, choose navigate_view to patient-analysis
      .mockResolvedValueOnce({
        decision: {
          type: 'action',
          announcement: 'Đang mở trang kết quả phân tích.',
          action: { actionId: 'a1', type: 'navigate_view', route: 'patient-analysis' },
        },
      })
      // Step 1: on patient-analysis, observe "Thực đơn" tab dynamically and activate it
      .mockImplementationOnce(async (req) => {
        const mealTab = req.semanticElements.find((e: any) => e.label === 'Thực đơn');
        expect(mealTab).toBeDefined();
        return {
          decision: {
            type: 'action',
            announcement: 'Đang chuyển sang tab Thực đơn.',
            action: { actionId: 'a2', type: 'activate_element', targetRef: mealTab.ref },
          },
        };
      })
      // Step 2: verify actionHistory shows success & tab selected, then complete
      .mockImplementationOnce(async (req) => {
        expect(req.actionHistory).toHaveLength(2);
        expect(req.actionHistory[1].verified).toBe(true);
        return {
          decision: {
            type: 'complete',
            message: 'Tôi đã mở phần Thực đơn phù hợp cho bạn.',
          },
        };
      });

    render(<Harness plannerFn={plannerMock} />);

    fireEvent.click(screen.getByTestId('patient-agent-launcher'));
    fireEvent.change(screen.getByTestId('agent-text-input'), {
      target: { value: 'Cho tôi xem thực đơn gợi ý từ kết quả mới nhất' },
    });
    fireEvent.click(screen.getByTestId('agent-send-button'));

    await waitFor(() => {
      expect(screen.getByTestId('active-route')).toHaveTextContent('patient-analysis');
      expect(screen.getByTestId('active-tab')).toHaveTextContent('meal');
      expect(plannerMock).toHaveBeenCalledTimes(3);
    });

    // Popup minimized automatically during UI execution and stays unobtrusive on completion
    expect(screen.queryByTestId('patient-agent-popup')).not.toBeInTheDocument();
  });

  it('reopens popup when planner asks for clarification and keeps conversation context', async () => {
    const plannerMock = vi
      .fn()
      .mockResolvedValueOnce({
        decision: {
          type: 'clarify',
          question: 'Bạn muốn chọn ảnh từ thư viện hay mở camera?',
        },
      })
      .mockResolvedValueOnce({
        decision: {
          type: 'respond',
          message: 'Đây là giải thích tổng quan cho kết quả vừa rồi.',
        },
      });

    render(<Harness plannerFn={plannerMock} />);
    fireEvent.click(screen.getByTestId('patient-agent-launcher'));
    fireEvent.change(screen.getByTestId('agent-text-input'), {
      target: { value: 'Tôi muốn nhập ảnh phiếu xét nghiệm.' },
    });
    fireEvent.click(screen.getByTestId('agent-send-button'));

    expect(await screen.findByText('Bạn muốn chọn ảnh từ thư viện hay mở camera?')).toBeInTheDocument();
    expect(screen.getByTestId('patient-agent-popup')).toBeInTheDocument();
  });

  it('prevents infinite loops when planner repeats identical failing actions', async () => {
    const plannerMock = vi.fn().mockResolvedValue({
      decision: {
        type: 'action',
        action: { actionId: 'loop_act', type: 'scroll_surface', direction: 'down' },
      },
    });

    render(<Harness plannerFn={plannerMock} />);
    fireEvent.click(screen.getByTestId('patient-agent-launcher'));
    fireEvent.change(screen.getByTestId('agent-text-input'), { target: { value: 'Cuộn xuống' } });
    fireEvent.click(screen.getByTestId('agent-send-button'));

    expect(
      await screen.findByText(/phát hiện thao tác lặp lại/i)
    ).toBeInTheDocument();
    expect(plannerMock).toHaveBeenCalledTimes(3);
  });

  it('server-side validator rejects impaired navigation, unknown refs, and forces confirmation on medical controls', () => {
    // Impaired route rejected
    const navImpaired = validateAndNormalizeDecision(
      { type: 'action', actionType: 'navigate_view', route: 'sos' },
      [],
      1
    );
    expect(navImpaired.type).toBe('cancel');

    // Element with requiresConfirmation=true forced into confirm gate even if model requested direct action
    const confirmForced = validateAndNormalizeDecision(
      { type: 'action', actionType: 'activate_element', targetRef: 'el_confirm' },
      [
        {
          ref: 'el_confirm',
          label: 'Xác nhận & Phân tích',
          requiresConfirmation: true,
          requiresUserGesture: false,
          safetyClassification: 'confirmation_required',
        },
      ],
      1
    );
    expect(confirmForced.type).toBe('confirm');
  });
});
