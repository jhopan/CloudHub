import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  emoji?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  emoji 
}: EmptyStateProps) {
  return (
    <div className="text-center py-12 sm:py-16 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
      {/* Icon or Emoji */}
      {emoji ? (
        <div className="text-5xl sm:text-6xl mb-4">{emoji}</div>
      ) : Icon ? (
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gray-100 rounded-full">
            <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
          </div>
        </div>
      ) : null}

      {/* Title */}
      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 px-4">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm sm:text-base text-gray-500 mb-6 px-4 max-w-md mx-auto">
          {description}
        </p>
      )}

      {/* Action Button */}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Pre-configured variants
export function EmptyProviders({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      emoji="📦"
      title="No providers available"
      description="Contact your administrator to add storage providers"
    />
  );
}

export function EmptyAccounts({ providerName, onAdd }: { providerName: string; onAdd: () => void }) {
  return (
    <EmptyState
      emoji="🔌"
      title="No accounts connected"
      description={`Add your first ${providerName} account to get started`}
      action={{
        label: 'Add Account',
        onClick: onAdd,
      }}
    />
  );
}

export function EmptyFiles({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      emoji="📁"
      title="This folder is empty"
      description="Upload files to get started"
      action={onUpload ? {
        label: 'Upload Files',
        onClick: onUpload,
      } : undefined}
    />
  );
}

export function ErrorState({ 
  title, 
  description, 
  onRetry 
}: { 
  title: string; 
  description?: string; 
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      emoji="⚠️"
      title={title}
      description={description}
      action={onRetry ? {
        label: 'Try Again',
        onClick: onRetry,
      } : undefined}
    />
  );
}
