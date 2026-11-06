import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-[6px] transition-colors duration-150 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F] focus-visible:ring-offset-2';

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-10 px-5 text-sm gap-2',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'bg-[#0A2547] text-white hover:bg-[#073E7F] active:bg-[#062F5F]',
      secondary:
        'bg-[#FFFFFF] border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] active:bg-[#F1F5F9]',
      danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B]',
      ghost: 'bg-transparent text-[#0F172A] hover:bg-[#F1F5F9] active:bg-[#E2E8F0]',
    };

    const disabledStyles = 'bg-[#E2E8F0] text-[#94A3B8] border-transparent cursor-not-allowed';

    const resolvedVariant = isDisabled ? disabledStyles : variantStyles[variant];

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${baseStyles} ${sizeStyles[size]} ${resolvedVariant} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-current" />
            <span>Memproses...</span>
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
