'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  Users,
  HardDrive,
  Database,
  FileText,
  ArrowRightLeft,
  AlertTriangle,
  Activity,
  Cloud,
} from 'lucide-react';

interface DashboardStats {
  total_users: number;
  total_accounts: number;
  total_storage_bytes: number;
  used_storage_bytes: number;
  total_files: number;
  total_transfers_today: number;
  active_accounts: number;
  unhealthy_accounts: number;
}

interface ProviderStats {
  id: string;
  display_name: string;
  type: string;
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

const PROVIDER_COLORS: Record<string, string> = {
  gdrive: 'bg-blue-500',
  mega: 'bg-red-500',
  onedrive: 'bg-sky-500',
  dropbox: 'bg-indigo-500',
  s3: 'bg-orange-500',
  r2: 'bg-amber-500',
  b2: 'bg-rose-500',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dashboardRes, providersRes] = await Promise.all([
        apiClient.get('/admin/dashboard'),
        apiClient.get('/admin/providers'),
      ]);
      setStats(dashboardRes.data);
      setProviders(providersRes.data.providers || []);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Failed to load dashboard data.</p>
      </div>
    );
  }

  const storagePercent =
    stats.total_storage_bytes > 0
      ? Math.round((stats.used_storage_bytes / stats.total_storage_bytes) * 100)
      : 0;

  const statCards = [
    {
      label: 'Total Users',
      value: stats.total_users,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Storage Accounts',
      value: stats.total_accounts,
      icon: HardDrive,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      subtitle: `${stats.active_accounts} active`,
    },
    {
      label: 'Total Storage',
      value: formatBytes(stats.total_storage_bytes),
      icon: Database,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
      subtitle: `${storagePercent}% used`,
    },
    {
      label: 'Used Storage',
      value: formatBytes(stats.used_storage_bytes),
      icon: Activity,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      label: 'Total Files',
      value: stats.total_files.toLocaleString(),
      icon: FileText,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
    },
    {
      label: 'Transfers Today',
      value: stats.total_transfers_today,
      icon: ArrowRightLeft,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
    },
    {
      label: 'Unhealthy Accounts',
      value: stats.unhealthy_accounts,
      icon: AlertTriangle,
      color: stats.unhealthy_accounts > 0 ? 'text-red-600' : 'text-green-600',
      bgColor:
        stats.unhealthy_accounts > 0
          ? 'bg-red-50 dark:bg-red-950/30'
          : 'bg-green-50 dark:bg-green-950/30',
    },
    {
      label: 'Active Providers',
      value: providers.filter((p) => p.accounts_count > 0).length,
      icon: Cloud,
      color: 'text-sky-600',
      bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    },
  ];

  // Calculate max capacity for bar chart scaling
  const maxCapacity = Math.max(...providers.map((p) => p.total_capacity_bytes), 1);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">System overview and statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-card border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  {card.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  )}
                </div>
                <div className={`p-2.5 rounded-lg ${card.bgColor}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storage Overview */}
      <div className="bg-card border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Storage Overview</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBytes(stats.used_storage_bytes)} of {formatBytes(stats.total_storage_bytes)} used
            </span>
            <span className="font-medium">{storagePercent}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatBytes(stats.total_storage_bytes - stats.used_storage_bytes)} free</span>
            <span>{stats.total_accounts} accounts</span>
          </div>
        </div>
      </div>

      {/* Provider Breakdown */}
      {providers.length > 0 && (
        <div className="bg-card border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Storage by Provider</h2>
          <div className="space-y-4">
            {providers.map((p) => {
              const usedPercent =
                p.total_capacity_bytes > 0
                  ? Math.round((p.total_used_bytes / p.total_capacity_bytes) * 100)
                  : 0;
              const barWidth = Math.max((p.total_capacity_bytes / maxCapacity) * 100, 2);
              const barColor = PROVIDER_COLORS[p.type] || 'bg-gray-500';

              return (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${barColor}`} />
                      <span className="font-medium">{p.display_name}</span>
                      <span className="text-muted-foreground">
                        ({p.accounts_count} account{p.accounts_count !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground">
                        {formatBytes(p.total_used_bytes)} / {formatBytes(p.total_capacity_bytes)}
                      </span>
                      {p.unhealthy_count > 0 && (
                        <span className="ml-2 text-xs text-red-600 font-medium">
                          {p.unhealthy_count} unhealthy
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative w-full bg-muted rounded-full h-3" style={{ width: `${barWidth}%` }}>
                    <div
                      className={`h-full rounded-full ${barColor} opacity-80 transition-all duration-500`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
