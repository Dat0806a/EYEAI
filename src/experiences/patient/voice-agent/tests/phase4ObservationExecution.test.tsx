import React, { useState, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { scanPatientWorkspace, validateFreshReference } from '../observation/semanticObserver';
import { executeGenericAction } from '../execution/genericActionExecutor';
import { buildSanitizedApplicationContext } from '../context/applicationContextEngine';
import {
  getPatientRuntimeSnapshot,
  resetPatientRuntimeSnapshot,
  updatePatientRuntimeSnapshot,
} from '../context/patientRuntimeStore';
import { evaluateActionPolicy } from '../policy/permissionPolicy';
import { useManualTakeoverWatcher } from '../runtime/manualTakeoverController';

function SyntheticPatientWorkspaceFixture() {
  const [activeTab, setActiveTab] = useState<'overview' | 'meals'>('overview');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [dynamicControlVisible, setDynamicControlVisible] = useState(false);
  const [dynamicClicked, setDynamicClicked] = useState(false);
  const [noteVal, setNoteVal] = useState('');

  return (
    <div>
      {/* Protected Impaired Surface OUTSIDE patient workspace */}
      <div id="protected-impaired-zone" data-protected-ui="true">
        <button id="impaired-sos-btn" type="button">
          SOS Khẩn Cấp
        </button>
      </div>

      {/* Strictly Scoped Patient Workspace */}
      <div data-patient-workspace="true">
        <h2>Trang thử nghiệm bệnh nhân</h2>
        <div role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          >
            Tổng quan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'meals'}
            onClick={() => setActiveTab('meals')}
          >
            Thực đơn
          </button>
        </div>

        <ul role="list">
          <li role="listitem">
            <button type="button" onClick={() => setSelectedItem('Phiếu #1')}>
              Phiếu #1
            </button>
          </li>
          <li role="listitem">
            <button type="button" onClick={() => setSelectedItem('Phiếu #2')}>
              Phiếu #2
            </button>
          </li>
        </ul>

        <label htmlFor="patient-note-input">Ghi chú cá nhân</label>
        <input
          id="patient-note-input"
          type="text"
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
        />

        {/* Sensitive & External & Unpermitted Controls */}
        <input aria-label="Mật khẩu bí mật" type="password" defaultValue="secret123" />
        <a href="https://evil.example.com" target="_blank" rel="noreferrer">
          Liên kết ngoài
        </a>
        <button type="button" data-patient-permission="denied">
          Nút bị từ chối quyền
        </button>
        <button
          id="btn-confirm-analysis"
          type="button"
          onClick={() => {}}
        >
          Xác nhận & Phân tích
        </button>

        {/* Toggle for Dynamic Discovery Test */}
        <button type="button" onClick={() => setDynamicControlVisible(true)}>
          Hiện nút mới
        </button>
        {dynamicControlVisible && (
          <button type="button" onClick={() => setDynamicClicked(true)}>
            Nút xuất hiện động mới
          </button>
        )}

        <div data-testid="fixture-state">
          tab={activeTab};item={selectedItem};dynamic={String(dynamicClicked)};note={noteVal}
        </div>
      </div>
    </div>
  );
}

describe('Phase 4: Observation & Generic Interaction PoC', () => {
  beforeEach(() => {
    resetPatientRuntimeSnapshot();
  });

  it('observes only scoped patient workspace and excludes impaired UI, passwords, and external links', () => {
    render(<SyntheticPatientWorkspaceFixture />);

    const obs = scanPatientWorkspace('patient-analysis', 1);
    const labels = obs.elements.map((e) => e.label);

    expect(labels).toContain('Tổng quan');
    expect(labels).toContain('Thực đơn');
    expect(labels).toContain('Phiếu #2');
    expect(labels).toContain('Ghi chú cá nhân');

    // Never leaks Impaired UI, passwords, or external URLs
    expect(labels).not.toContain('SOS Khẩn Cấp');
    expect(labels).not.toContain('Mật khẩu bí mật');
    expect(labels).not.toContain('Liên kết ngoài');

    // Unpermitted control fails closed even if discovered
    const deniedEl = obs.elements.find((e) => e.label === 'Nút bị từ chối quyền')!;
    expect(deniedEl.safetyClassification).toBe('restricted');
    const policy = evaluateActionPolicy(
      { actionId: 'a1', type: 'activate_element', targetRef: deniedEl.ref },
      deniedEl
    );
    expect(policy.allowed).toBe(false);

    // Medical confirmation button requires confirmation
    const confirmEl = obs.elements.find((e) => e.label === 'Xác nhận & Phân tích')!;
    expect(confirmEl.requiresConfirmation).toBe(true);
  });

  it('executes generic tab selection, list selection, input setting, navigation, and dynamic discovery', async () => {
    render(<SyntheticPatientWorkspaceFixture />);

    let obs = scanPatientWorkspace('patient-analysis', 1);
    const actingRef = { current: false };
    const navigateTo = vi.fn();

    const refresh = () => {
      obs = scanPatientWorkspace('patient-analysis', obs.stateEpoch + 1);
      return obs;
    };

    // 1. Generic tab selection
    const mealTab = obs.elements.find((e) => e.label === 'Thực đơn')!;
    const tabRes = await executeGenericAction(
      { actionId: 'a_tab', type: 'activate_element', targetRef: mealTab.ref },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 1,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(tabRes.record.success).toBe(true);
    expect(screen.getByTestId('fixture-state')).toHaveTextContent('tab=meals');

    // 2. Stale reference rejection (epoch 1 ref must fail now that epoch is 2)
    const staleRes = validateFreshReference(obs, mealTab.ref, 1);
    expect(staleRes.valid).toBe(false);

    // 3. Generic list selection using fresh ref
    const item2 = obs.elements.find((e) => e.label === 'Phiếu #2')!;
    await executeGenericAction(
      { actionId: 'a_item', type: 'select_list_item', targetRef: item2.ref },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 2,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(screen.getByTestId('fixture-state')).toHaveTextContent('item=Phiếu #2');

    // 4. Generic set_input_value on React controlled input
    const noteInput = obs.elements.find((e) => e.label === 'Ghi chú cá nhân')!;
    await executeGenericAction(
      { actionId: 'a_input', type: 'set_input_value', targetRef: noteInput.ref, value: 'Uống nhiều nước' },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 3,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(screen.getByTestId('fixture-state')).toHaveTextContent('note=Uống nhiều nước');

    // 5. Dynamic discovery of a newly mounted button
    const revealBtn = obs.elements.find((e) => e.label === 'Hiện nút mới')!;
    await executeGenericAction(
      { actionId: 'a_reveal', type: 'activate_element', targetRef: revealBtn.ref },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 4,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    const dynamicBtn = obs.elements.find((e) => e.label === 'Nút xuất hiện động mới');
    expect(dynamicBtn).toBeDefined();

    await executeGenericAction(
      { actionId: 'a_dyn', type: 'activate_element', targetRef: dynamicBtn!.ref },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 5,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(screen.getByTestId('fixture-state')).toHaveTextContent('dynamic=true');

    // 6. Unauthorized navigation rejection (Impaired route 'sos' must be denied)
    const badNav = await executeGenericAction(
      { actionId: 'a_bad_nav', type: 'navigate_view', route: 'sos' as any },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 6,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(badNav.record.success).toBe(false);
    expect(badNav.record.errorClassification).toBe('FORBIDDEN_ROUTE');
    expect(navigateTo).not.toHaveBeenCalled();

    // 7. Allowed patient navigation
    const goodNav = await executeGenericAction(
      { actionId: 'a_good_nav', type: 'navigate_view', route: 'patient-history' },
      {
        sessionId: 's1',
        taskId: 't1',
        contextVersion: 6,
        currentRoute: 'patient-analysis',
        observation: obs,
        isAgentActingRef: actingRef,
        navigateTo,
        refreshObservation: refresh,
      }
    );
    expect(goodNav.record.success).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith('patient-history');
  });

  it('detects manual takeover inside patient workspace while ignoring agent-driven clicks', () => {
    const onManualTakeover = vi.fn();
    function TakeoverHarness() {
      const isAgentActingRef = useRef(false);
      useManualTakeoverWatcher({
        isAgentActive: true,
        isAgentActingRef,
        onManualTakeover,
      });
      return (
        <div data-patient-workspace="true">
          <button
            type="button"
            onClick={() => {}}
          >
            Nút bệnh nhân
          </button>
          <button
            type="button"
            onClick={() => {
              isAgentActingRef.current = true;
            }}
          >
            Set Acting
          </button>
        </div>
      );
    }

    render(<TakeoverHarness />);
    fireEvent.pointerDown(screen.getByText('Nút bệnh nhân'));
    expect(onManualTakeover).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Set Acting'));
    fireEvent.pointerDown(screen.getByText('Nút bệnh nhân'));
    expect(onManualTakeover).toHaveBeenCalledTimes(1);
  });

  it('builds sanitized application context without exposing raw secrets', () => {
    updatePatientRuntimeSnapshot({ currentRoute: 'patient-scan', ocrStatus: 'running' });
    const ctx = buildSanitizedApplicationContext({
      stateVersion: 4,
      stateEpoch: 2,
      currentRoute: 'patient-scan',
      previousRoute: 'patient-home',
      runtimeSnapshot: getPatientRuntimeSnapshot(),
      taskState: 'WAITING_FOR_RESULT',
      activeActionSummary: 'Đang chờ OCR...',
      manualIntervention: false,
      pendingConfirmation: false,
      pendingUserGesture: false,
      semanticElements: [],
    });

    expect(ctx.stateVersion).toBe(4);
    expect(ctx.verifiedState.ocrStatus).toBe('running');
    expect(ctx.pendingState.isBusy).toBe(true);
    expect(ctx.availableRoutes).toContain('patient-analysis');
  });
});
