import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-white border border-[#E2E8F0] rounded-[10px] ${className}`}
    >
      <div className="w-12 h-12 rounded-[6px] bg-[#F1F5F9] flex items-center justify-center text-[#475569] mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-[#0F172A] mb-1">{title}</h3>
      <p className="text-sm text-[#475569] max-w-sm mb-4 leading-normal">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
