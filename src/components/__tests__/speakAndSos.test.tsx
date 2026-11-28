import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockTelemetryState = {
  closedDuration: 0,
  eyesClosed: false,
  blinkCount: 0,
  lastExecutedAction: 'NONE',
  lastExecutedTimestamp: 0,
};

vi.mock('../../modules/eye-control/useEyeTracking', () => ({
  useEyeTrackingSettings: () => ({
    settings: {
      eyeControlEnabled: true,
      speakerEnabled: true,
      soundFeedback: true,
    },
    setKeyboardOpen: vi.fn(),
  }),
  useEyeTrackingTelemetry: () => ({
    trackingState: mockTelemetryState,
  }),
}));

vi.mock('../../modules/eye-control/EyeNavigationProvider', () => ({
  useEyeNavigationContext: () => ({
    activeFocusId: null,
    activeScopeId: 'root',
    registerFocusNode: vi.fn(),
    unregisterFocusNode: vi.fn(),
    setFocusId: vi.fn(),
    navigate: vi.fn(),
    triggerSelect: vi.fn(),
    ensureFocusVisible: vi.fn(),
    pushFocusScope: vi.fn(),
    popFocusScope: vi.fn(),
    registerEscapeHandler: vi.fn(() => () => {}),
    triggerEscape: vi.fn(),
  }),
}));

vi.mock('../../modules/eye-control/EyeFocusable', () => ({
  EyeFocusable: ({
    children,
    onSelect,
    className,
    id,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    className?: string;
    id?: string;
  }) => (
    <div data-testid={id} className={className} onClick={onSelect}>
      {children}
    </div>
  ),
}));

vi.mock('../../components/ui/KeyboardHudSlot', () => ({
  KeyboardHudSlot: () => <div data-testid="keyboard-hud-slot" />,
}));

vi.mock('../../modules/calls/CallProvider', () => ({
  useCall: () => ({ callState: 'idle' }),
}));

vi.mock('../../utils/speech', () => ({
  speakVietnamese: vi.fn(),
  stopSpeech: vi.fn(),
  isSpeaking: vi.fn(() => false),
  isSpeechSupported: vi.fn(() => true),
}));

import { SpeakPage } from '../../pages/SpeakPage';
import { SosPage, toTelHref } from '../../pages/SosPage';

describe('SpeakPage composer input visibility and letter input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders visible input box positioned above the virtual keyboard and updates letters on key press', () => {
    render(<SpeakPage onBack={vi.fn()} />);

    const input = screen.getByPlaceholderText('Nhập nội dung muốn nói…') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Composer container must sit above --virtual-keyboard-height (no conflicting md:p-3 override)
    const composerContainer = input.closest('.fixed');
    expect(composerContainer).not.toBeNull();
    expect(composerContainer?.className).not.toContain('md:p-3');
    expect((composerContainer as HTMLElement).style.bottom).toBe('var(--virtual-keyboard-height, 245px)');

    // Tapping letters on the virtual keyboard updates the visible input immediately
    fireEvent.click(screen.getByTestId('key-a'));
    fireEvent.click(screen.getByTestId('key-n'));
    expect(input.value).toBe('an');

    // Direct typing in the input box also works
    fireEvent.change(input, { target: { value: 'xin chào' } });
    expect(input.value).toBe('xin chào');
  });
});

describe('SosPage device phone dialer redirect', () => {
  const originalLocation = window.location;
  let assignedHref = '';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTelemetryState.closedDuration = 0;
    mockTelemetryState.eyesClosed = false;
    mockTelemetryState.blinkCount = 0;
    mockTelemetryState.lastExecutedAction = 'NONE';
    mockTelemetryState.lastExecutedTimestamp = 0;
    assignedHref = '';

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        get href() {
          return assignedHref;
        },
        set href(val: string) {
          assignedHref = val;
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('normalizes phone numbers into tel: URIs', () => {
    expect(toTelHref('115')).toBe('tel:115');
    expect(toTelHref('0901 234 567')).toBe('tel:0901234567');
  });

  it('automatically redirects to device phone app (tel:115) when SOS autoCall activates', () => {
    render(<SosPage onBack={vi.fn()} autoCall />);

    expect(assignedHref).toBe('tel:115');
    const callLink = screen.getByRole('link', { name: /GỌI NGAY \(115\)/i });
    expect(callLink).toHaveAttribute('href', 'tel:115');
  });

  it('redirects to device phone app for selected contact on confirmation', () => {
    render(<SosPage onBack={vi.fn()} autoCall={false} />);
    expect(assignedHref).toBe('');

    fireEvent.click(screen.getByText('Bác sĩ Nguyễn Văn A'));
    fireEvent.click(screen.getByText('XÁC NHẬN GỌI'));

    expect(assignedHref).toBe('tel:0901234567');
    const callLink = screen.getByRole('link', { name: /GỌI NGAY \(0901 234 567\)/i });
    expect(callLink).toHaveAttribute('href', 'tel:0901234567');
  });

  it('redirects to tel:115 when eyeai:emergency event is dispatched', () => {
    render(<SosPage onBack={vi.fn()} autoCall={false} />);
    expect(assignedHref).toBe('');

    fireEvent(window, new CustomEvent('eyeai:emergency'));
    expect(assignedHref).toBe('tel:115');
  });
});
