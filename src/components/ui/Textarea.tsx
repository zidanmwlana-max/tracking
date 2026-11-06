import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, className = '', id, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[12px] font-semibold uppercase tracking-wider text-[#0F172A]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full p-3 rounded-[6px] text-sm text-[#0F172A] bg-white border placeholder-[#94A3B8] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F] focus-visible:border-[#073E7F] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] disabled:cursor-not-allowed ${
            error ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : 'border-[#E2E8F0]'
          } ${className}`}
          {...props}
        />
        {error ? (
          <span className="text-[12px] text-[#DC2626] leading-tight">{error}</span>
        ) : helperText ? (
          <span className="text-[12px] text-[#475569] leading-tight">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
