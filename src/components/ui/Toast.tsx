import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Standalone global trigger so it can be called even without hook (e.g. from callbacks)
let globalToastEmitter: ((msg: string, type: ToastType, title?: string) => void) | null = null;

export const toast = {
  success: (msg: string, title?: string) => globalToastEmitter?.(msg, 'success', title),
  error: (msg: string, title?: string) => globalToastEmitter?.(msg, 'error', title),
  warning: (msg: string, title?: string) => globalToastEmitter?.(msg, 'warning', title),
  info: (msg: string, title?: string) => globalToastEmitter?.(msg, 'info', title),
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const newToast: ToastMessage = { id, type, message, title };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  // Bind global emitter
  globalToastEmitter = showToast;

  const contextValue: ToastContextType = {
    showToast,
    success: (msg, title) => showToast(msg, 'success', title),
    error: (msg, title) => showToast(msg, 'error', title),
    warning: (msg, title) => showToast(msg, 'warning', title),
    info: (msg, title) => showToast(msg, 'info', title),
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0" />,
    info: <Info className="w-5 h-5 text-[#073E7F] shrink-0" />,
  };

  const borders: Record<ToastType, string> = {
    success: 'border-[#A7F3D0]',
    error: 'border-[#FECACA]',
    warning: 'border-[#FDE68A]',
    info: 'border-[#BFDBFE]',
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-white border ${borders[item.type]} rounded-[6px] shadow-[0_1px_3px_rgba(15,23,42,0.08)] bmi-toast-enter`}
          >
            {icons[item.type]}
            <div className="flex-1 min-w-0">
              {item.title && (
                <div className="text-xs font-semibold text-[#0F172A] mb-0.5">
                  {item.title}
                </div>
              )}
              <div className="text-sm text-[#0F172A] leading-snug">{item.message}</div>
            </div>
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              aria-label="Tutup notifikasi"
              className="text-[#94A3B8] hover:text-[#0F172A] transition-colors duration-150 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg: string, type?: ToastType, title?: string) =>
        globalToastEmitter?.(msg, type || 'info', title),
      success: (msg: string, title?: string) => globalToastEmitter?.(msg, 'success', title),
      error: (msg: string, title?: string) => globalToastEmitter?.(msg, 'error', title),
      warning: (msg: string, title?: string) => globalToastEmitter?.(msg, 'warning', title),
      info: (msg: string, title?: string) => globalToastEmitter?.(msg, 'info', title),
    };
  }
  return context;
}
