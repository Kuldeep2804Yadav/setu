import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'info' | 'neutral' | 'danger' | 'outline';
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  className = '',
}: BadgeProps) {
  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    outline: 'bg-transparent text-slate-700 border-slate-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
