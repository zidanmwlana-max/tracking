import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const hasAutoFocusedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-[480px]',
    md: 'max-w-[640px]',
    lg: 'max-w-[800px]',
    xl: 'max-w-[1024px]',
  };

  useEffect(() => {
    if (!isOpen) {
      hasAutoFocusedRef.current = false;
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus once per modal open: prioritize first form input in body, never focus the close button
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!hasAutoFocusedRef.current) {
      hasAutoFocusedRef.current = true;
      timer = setTimeout(() => {
        if (!modalRef.current) return;
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && modalRef.current.contains(activeEl) && activeEl !== modalRef.current) {
          return;
        }
        const firstFormControl = bodyRef.current?.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])'
        );
        if (firstFormControl) {
          firstFormControl.focus();
        } else {
          modalRef.current.focus();
        }
      }, 30);
    }

    return () => {
      if (timer) clearTimeout(timer);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      if (
        previousActiveElementRef.current &&
         typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A2547]/50 bmi-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`w-full ${sizeClasses[size]} bg-white border border-[#E2E8F0] rounded-[10px] shadow-[0_1px_3px_rgba(15,23,42,0.08)] flex flex-col max-h-[90vh] overflow-hidden outline-none bmi-modal-panel`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#E2E8F0] bg-white">
          <div className="flex flex-col gap-0.5">
            <h2 id="modal-title" className="text-base font-bold text-[#0F172A] leading-snug">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#475569]">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-modal-close="true"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-1 rounded-[6px] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div ref={bodyRef} className="px-6 py-5 overflow-y-auto flex-1 text-sm text-[#0F172A]">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
