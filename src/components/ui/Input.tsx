import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftElement, rightElement, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-semibold uppercase tracking-wider text-[#0F172A]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftElement && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[#475569]">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full h-9 px-3 rounded-[6px] text-sm text-[#0F172A] bg-white border placeholder-[#94A3B8] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F] focus-visible:border-[#073E7F] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] disabled:cursor-not-allowed ${
              leftElement ? 'pl-9' : ''
            } ${rightElement ? 'pr-9' : ''} ${
              error ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : 'border-[#E2E8F0]'
            } ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center text-[#475569]">
              {rightElement}
            </div>
          )}
        </div>
        {error ? (
          <span className="text-[12px] text-[#DC2626] leading-tight">{error}</span>
        ) : helperText ? (
          <span className="text-[12px] text-[#475569] leading-tight">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
