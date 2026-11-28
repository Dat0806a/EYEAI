import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  onFallbackToDefaultMode?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Patient-only Error Boundary isolating Voice Agent UI/runtime failures
 * so Default Mode and Impaired Mode are never impacted.
 */
export class PatientAgentErrorBoundary extends (Component as any) {
  public declare props: Props;
  public declare setState: (next: Partial<State>) => void;

  public state: State = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Trợ lý AI gặp sự cố hiển thị.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PatientAgentErrorBoundary]', error, info);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="patient-agent-error-boundary"
          className="fixed bottom-6 right-6 z-50 max-w-xs bg-white border-2 border-rose-300 rounded-[22px] p-4 shadow-xl text-[#14213D] flex flex-col gap-2.5"
        >
          <div className="flex items-center gap-2 text-rose-700 font-black text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>AI Agent tạm gián đoạn</span>
          </div>
          <p className="text-xs font-bold text-slate-600">{this.state.errorMessage}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRecover}
              className="px-3 py-1.5 rounded-xl bg-[#0E6C99] text-white text-xs font-black inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
            {this.props.onFallbackToDefaultMode && (
              <button
                type="button"
                onClick={this.props.onFallbackToDefaultMode}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-[#14213D] text-xs font-black cursor-pointer"
              >
                Về mặc định
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
