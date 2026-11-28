import React from 'react';
import { RefreshCw, Bot } from 'lucide-react';
import { usePatientMode } from './PatientModeProvider';

interface PatientModeSwitchBadgeProps {
  onSwitchMode: (targetMode: 'default' | 'agent') => void;
  onOpenModeSelect?: () => void;
}

/**
 * Compact patient-only mode switcher rendered cleanly inside PatientDashboardPage
 * when the Patient AI Agent feature flag is enabled.
 */
export function PatientModeSwitchBadge({
  onSwitchMode,
  onOpenModeSelect,
}: PatientModeSwitchBadgeProps) {
  const { mode, featureEnabled } = usePatientMode();

  if (!featureEnabled) return null;

  const isAgent = mode === 'agent';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isAgent && (
        <span
          data-testid="patient-mode-badge-agent"
          className="px-2.5 py-1 rounded-full bg-[#14213D] text-[#6AC9F0] font-black text-[11px] inline-flex items-center gap-1 border border-[#6AC9F0]/50"
        >
          <Bot className="w-3 h-3" aria-hidden="true" />
          <span>AI Agent</span>
        </span>
      )}
      <button
        type="button"
        data-testid="btn-switch-patient-mode"
        onClick={() => {
          if (isAgent) {
            onSwitchMode('default');
          } else if (onOpenModeSelect) {
            onOpenModeSelect();
          } else {
            onSwitchMode('agent');
          }
        }}
        className="px-2.5 py-1 rounded-full bg-white/80 hover:bg-white border border-[#14213D]/20 text-[#14213D] font-black text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
        title={isAgent ? 'Chuyển về chế độ mặc định' : 'Đổi chế độ sử dụng'}
      >
        <RefreshCw className="w-3 h-3 text-[#0E6C99]" aria-hidden="true" />
        <span>{isAgent ? 'Về chế độ mặc định' : 'Đổi chế độ'}</span>
      </button>
    </div>
  );
}
