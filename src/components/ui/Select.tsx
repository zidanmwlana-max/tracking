import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-[12px] font-semibold uppercase tracking-wider text-[#0F172A]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full h-9 px-3 rounded-[6px] text-sm text-[#0F172A] bg-white border transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F] focus-visible:border-[#073E7F] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] disabled:cursor-not-allowed ${
            error ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : 'border-[#E2E8F0]'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error ? (
          <span className="text-[12px] text-[#DC2626] leading-tight">{error}</span>
        ) : helperText ? (
          <span className="text-[12px] text-[#475569] leading-tight">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
