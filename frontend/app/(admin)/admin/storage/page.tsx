'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Database, HardDrive, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ProviderBreakdown {
  name: string;
  total: number;
  used: number;
  free: number;
  percentage: number;
}

interface AccountBreakdown {
  label: string;
  provider: string;
  total: number;
  used: number;
  free: number;
  health: string;
  owner_email: string;
}

interface StorageStats {
  total_capacity: number;
  total_used: number;
  total_free: number;
  by_provider: ProviderBreakdown[];
  by_account: AccountBreakdown[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getBarColor(percent: number): string {
  if (percent >= 90) return 'from-red-500 to-red-600';
  if (percent >= 70) return 'from-orange-500 to-orange-600';
  if (percent >= 50) return 'from-yellow-500 to-amber-500';
  return 'from-blue-500 to-indigo-500';
}

export default function AdminStoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/storage-stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch storage stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Failed to load storage statistics.</p>
      </div>
    );
  }

  const overallPercent =
    stats.total_capacity > 0
      ? Math.round((stats.total_used / stats.total_capacity) * 100)
      : 0;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Storage</h1>
        <p className="text-muted-foreground mt-1">Detailed storage statistics across all providers</p>
      </div>

      {/* Overview Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-blue-500/10">
            <Database className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Total Storage Overview</h2>
            <p className="text-sm text-muted-foreground">{stats.by_account.length} accounts across {stats.by_provider.length} providers</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-sm text-muted-foreground">Total Capacity</p>
            <p className="text-2xl font-bold mt-1">{formatBytes(stats.total_capacity)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Used</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{formatBytes(stats.total_used)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Free</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{formatBytes(stats.total_free)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{formatBytes(stats.total_used)} of {formatBytes(stats.total_capacity)} used</span>
            <span className="font-semibold">{overallPercent}%</span>
          </div>
          <div className="w-full bg-white/50 dark:bg-black/20 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getBarColor(overallPercent)} transition-all duration-700`}
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Per-Provider Breakdown */}
      {stats.by_provider.length > 0 && (
        <div className="bg-card border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">By Provider</h2>
          <div className="space-y-4">
            {stats.by_provider.map((prov) => (
              <div key={prov.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{prov.name}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{formatBytes(prov.used)} / {formatBytes(prov.total)}</span>
                    <span className="font-medium text-foreground w-12 text-right">
                      {prov.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getBarColor(prov.percentage)} transition-all duration-500`}
                    style={{ width: `${Math.min(prov.percentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(prov.free)} free
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Account Detailed Table */}
      {stats.by_account.length > 0 && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="p-6 pb-0">
            <h2 className="text-lg font-semibold mb-1">Account Details</h2>
            <p className="text-sm text-muted-foreground mb-4">{stats.by_account.length} storage accounts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">Label</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Capacity</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Used</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Free</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Health</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_account.map((acc, idx) => {
                  const accPercent = acc.total > 0 ? Math.round((acc.used / acc.total) * 100) : 0;
                  return (
                    <tr key={`${acc.label}-${idx}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{acc.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted capitalize">
                          {acc.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{acc.owner_email}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatBytes(acc.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className="font-medium">{formatBytes(acc.used)}</span>
                          <span className="text-xs text-muted-foreground ml-1">({accPercent}%)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {formatBytes(acc.free)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {acc.health === 'healthy' || !acc.health ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            <CheckCircle className="h-3 w-3" />
                            Healthy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            <XCircle className="h-3 w-3" />
                            {acc.health}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats.by_account.length === 0 && (
        <div className="bg-card border rounded-xl p-12 text-center">
          <HardDrive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Storage Accounts</h3>
          <p className="text-muted-foreground">No storage accounts have been connected yet.</p>
        </div>
      )}
    </div>
  );
}
