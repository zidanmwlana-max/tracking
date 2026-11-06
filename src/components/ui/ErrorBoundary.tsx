import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  moduleName?: string;
  onResetModule?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Terjadi kesalahan tidak terduga pada modul ini.'
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary - ${this.props.moduleName || 'App'}]:`, error, errorInfo);
    // Send telemetry to local company server log
    fetch('/api/logs/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: this.props.moduleName || 'App',
        message: error.message,
        stack: errorInfo.componentStack || error.stack || ''
      })
    }).catch(() => {
      // Ignore network failure if offline
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onResetModule) {
      this.props.onResetModule();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 bg-white border border-[#FECACA] rounded-[10px] shadow-[0_1px_3px_rgba(15,23,42,0.08)] max-w-xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-[6px] bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-[#0F172A]">
                Gangguan Tampilan Modul {this.props.moduleName ? `(${this.props.moduleName})` : ''}
              </h2>
              <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                Sistem mendeteksi kendala saat memuat komponen ini. Data operasional Anda tetap aman.
              </p>
              <div className="mt-2.5 p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] font-mono text-[11px] text-[#DC2626] break-words">
                {this.state.errorMessage}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={this.handleRetry}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Muat Ulang Modul
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.reload()}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Segarkan Halaman
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
