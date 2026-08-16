import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-white/90 backdrop-blur-md rounded-[28px] border-2 border-[#14213D]/15 p-6 shadow-xl flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border-2 border-amber-300">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-black text-[#14213D]">Đã xảy ra lỗi hiển thị</h2>
              <p className="text-xs text-[#3B4B68] font-bold mt-1">
                {this.state.error?.message || 'Có sự cố phát sinh khi tải thành phần ứng dụng.'}
              </p>
            </div>

            <button
              type="button"
              onClick={this.handleReset}
              className="mt-2 px-6 py-3 rounded-full bg-[#14213D] text-[#6AC9F0] font-black text-sm shadow-md hover:bg-[#1d2f56] active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại ứng dụng</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
