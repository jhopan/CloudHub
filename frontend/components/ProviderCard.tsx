import React from 'react';
import Link from 'next/link';
import { ProviderIcon } from '@/components/ProviderIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  type: string;
  display_name: string;
  icon_url: string;
  auth_type: string;
  account_count: number;
  total_capacity: number;
  total_used: number;
}

interface StorageAccount {
  id: string;
  provider_id: string;
  health_status: string;
  is_active: boolean;
}

interface ProviderCardProps {
  provider: Provider;
  accounts: StorageAccount[];
  onToggle?: (active: boolean) => void;
  onClick?: () => void;
}

export function ProviderCard({ provider, accounts, onToggle, onClick }: ProviderCardProps) {
  const providerAccounts = accounts.filter(a => a.provider_id === provider.id);
  const connectedCount = providerAccounts.filter(a => a.health_status === 'healthy').length;
  const errorCount = providerAccounts.filter(a => a.health_status === 'unhealthy').length;
  const allDisabled = providerAccounts.length > 0 && providerAccounts.every(a => !a.is_active);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle) {
      onToggle(!allDisabled);
    }
  };

  // Provider color mapping
  const providerColors: Record<string, string> = {
    gdrive: '#4285F4',
    onedrive: '#0078D4',
    dropbox: '#0061FF',
    mega: '#D9272E',
    s3: '#FF9900',
    cloudflare: '#F38020',
    backblaze: '#E21D38',
  };

  const color = providerColors[provider.type] || '#6B7280';

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
    // If no onClick, Link will handle navigation
  };

  return (
    <Link 
      href={`/providers/${provider.type}`} 
      className="group min-w-0"
      onClick={handleCardClick}
    >
      <div
        className={`
          h-full rounded-xl border border-gray-200 bg-white p-4
          transition-all duration-200
          hover:bg-gray-50/50 hover:shadow-md cursor-pointer
          ${allDisabled ? 'opacity-50' : ''}
        `}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          {/* Icon + Info */}
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="size-10 shrink-0 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${color}15`,
              }}
            >
              <ProviderIcon
                src={provider.icon_url}
                alt={provider.display_name}
                size={32}
                fallbackText={provider.type.slice(0, 2).toUpperCase()}
                fallbackColor={color}
              />
            </div>
            
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-gray-900">
                {provider.display_name}
              </h3>
              <div className="flex min-w-0 items-center gap-1.5 text-xs flex-wrap mt-1">
                {allDisabled ? (
                  <StatusBadge variant="default" size="sm">
                    <span className="flex items-center gap-1">
                      Disabled
                    </span>
                  </StatusBadge>
                ) : providerAccounts.length === 0 ? (
                  <span className="text-gray-500">No connections</span>
                ) : (
                  <>
                    {connectedCount > 0 && (
                      <StatusBadge variant="success" size="sm" dot>
                        {connectedCount} Connected
                      </StatusBadge>
                    )}
                    {errorCount > 0 && (
                      <StatusBadge variant="error" size="sm" dot>
                        {errorCount} Error
                      </StatusBadge>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Toggle (show on hover desktop, always visible mobile) */}
          {providerAccounts.length > 0 && (
            <div
              className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
              onClick={handleToggle}
            >
              <button
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title={allDisabled ? 'Enable provider' : 'Disable provider'}
              >
                {allDisabled ? (
                  <ToggleLeft className="w-5 h-5 text-gray-400" />
                ) : (
                  <ToggleRight className="w-5 h-5 text-blue-600" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
