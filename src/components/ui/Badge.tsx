import React from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  className = '',
  ...props
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    neutral: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
    success: 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]',
    warning: 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',
    danger: 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded-[6px] border ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
