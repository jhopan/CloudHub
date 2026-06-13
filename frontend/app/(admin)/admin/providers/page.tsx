'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Cloud, HardDrive, Heart, AlertTriangle } from 'lucide-react';

interface ProviderStats {
  id: string;
  name: string;
  type: string;
  display_name: string;
  icon_url: string;
  accounts_count: number;
  total_capacity_bytes: number;
  total_used_bytes: number;
  healthy_count: number;
  unhealthy_count: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  gdrive: { bg: 'bg-blue-500/10', text: 'text-blue-600', bar: 'bg-blue-500' },
  mega: { bg: 'bg-red-500/10', text: 'text-red-600', bar: 'bg-red-500' },
  onedrive: { bg: 'bg-sky-500/10', text: 'text-sky-600', bar: 'bg-sky-500' },
  dropbox: { bg: 'bg-indigo-500/10', text: 'text-indigo-600', bar: 'bg-indigo-500' },
  s3: { bg: 'bg-orange-500/10', text: 'text-orange-600', bar: 'bg-orange-500' },
  r2: { bg: 'bg-amber-500/10', text: 'text-amber-600', bar: 'bg-amber-500' },
  b2: { bg: 'bg-rose-500/10', text: 'text-rose-600', bar: 'bg-rose-500' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-500/10', text: 'text-gray-600', bar: 'bg-gray-500' };

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/providers');
      setProviders(res.data.providers || []);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-56 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const connectedProviders = providers.filter((p) => p.accounts_count > 0);
  const emptyProviders = providers.filter((p) => p.accounts_count === 0);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Providers</h1>
        <p className="text-muted-foreground mt-1">
          {providers.length} providers &middot; {connectedProviders.length} with active accounts
        </p>
      </div>

      {connectedProviders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {connectedProviders.map((provider) => {
            const colors = PROVIDER_COLORS[provider.type] || DEFAULT_COLOR;
            const freeBytes = provider.total_capacity_bytes - provider.total_used_bytes;
            const usagePercent =
              provider.total_capacity_bytes > 0
                ? Math.round((provider.total_used_bytes / provider.total_capacity_bytes) * 100)
                : 0;

            return (
              <div
                key={provider.id}
                className="bg-card border rounded-xl p-5 hover:shadow-md transition-shadow space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${colors.bg}`}>
                      <Cloud className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{provider.display_name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{provider.type}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted">
                    {provider.accounts_count} acct{provider.accounts_count !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Capacity</p>
                    <p className="text-sm font-semibold">{formatBytes(provider.total_capacity_bytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Used</p>
                    <p className="text-sm font-semibold">{formatBytes(provider.total_used_bytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Free</p>
                    <p className="text-sm font-semibold">{formatBytes(freeBytes > 0 ? freeBytes : 0)}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Usage</span>
                    <span className="font-medium">{usagePercent}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-600">
                      {provider.healthy_count} healthy
                    </span>
                  </div>
                  {provider.unhealthy_count > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs font-medium text-red-600">
                        {provider.unhealthy_count} unhealthy
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {emptyProviders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">No Accounts Connected</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {emptyProviders.map((provider) => {
              const colors = PROVIDER_COLORS[provider.type] || DEFAULT_COLOR;
              return (
                <div key={provider.id} className="bg-card border rounded-xl p-5 opacity-60 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${colors.bg}`}>
                      <Cloud className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{provider.display_name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{provider.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HardDrive className="h-4 w-4" />
                    <span>No accounts connected</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {providers.length === 0 && (
        <div className="bg-card border rounded-xl p-12 text-center">
          <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Providers</h3>
          <p className="text-muted-foreground">No storage providers are configured.</p>
        </div>
      )}
    </div>
  );
}
