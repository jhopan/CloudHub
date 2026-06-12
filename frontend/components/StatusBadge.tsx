import React from 'react';

export interface StatusBadgeProps {
  variant: 'success' | 'error' | 'warning' | 'default';
  dot?: boolean;
  size?: 'sm' | 'md';
  children: React.ReactNode;
  pulse?: boolean;
}

export function StatusBadge({ 
  variant, 
  dot = false, 
  size = 'sm', 
  children,
  pulse = false 
}: StatusBadgeProps) {
  const variantStyles = {
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    default: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  const dotColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    default: 'bg-gray-500',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        ${variantStyles[variant]}
        ${sizeStyles[size]}
      `}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColors[variant]}`}
            />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${dotColors[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}
