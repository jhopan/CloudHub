'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DashboardLayout from '@/components/DashboardLayout';
import {
  HardDrive,
  Cloud,
  Upload,
  Download,
  Loader2,
  Files,
  ArrowRightLeft,
  Link2,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Zap,
  ArrowUpRight,
  Server,
} from 'lucide-react';
import Link from 'next/link';

interface StoragePool {
  total_capacity: number;
  total_used: number;
  total_available: number;
  account_count: number;
  provider_count: number;
}

interface Provider {
  id: string;
  name: string;
  display_name: string;
  type: string;
  auth_type: string;
  is_active: boolean;
  account_count: number;
  total_capacity: number;
  total_used: number;
  total_available: number;
}

interface TransferLog {
  id: string;
  file_id?: string;
  user_id: string;
  account_id?: string;
  operation: string;
  status: string;
  bytes_transferred: number;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  google_drive: 'bg-blue-500',
  onedrive: 'bg-cyan-500',
  dropbox: 'bg-amber-500',
  s3: 'bg-orange-500',
  local: 'bg-slate-500',
  default: 'bg-violet-500',
};

function getProviderColor(type: string): string {
  return PROVIDER_COLORS[type.toLowerCase()] || PROVIDER_COLORS.default;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pool, setPool] = useState<StoragePool | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [transfers, setTransfers] = useState<TransferLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [user, router]);

  const fetchData = async () => {
    try {
      const [poolRes, providersRes, transfersRes] = await Promise.all([
        apiClient.get('/storage-pool'),
        apiClient.get('/providers'),
        apiClient.get('/transfer-logs', { params: { limit: 5, offset: 0 } }),
      ]);

      setPool(poolRes.data);
      setProviders(providersRes.data || []);
      setTransfers(transfersRes.data?.logs || transfersRes.data || []);
      setApiHealthy(true);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setApiHealthy(false);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      title: 'Upload Files',
      subtitle: 'Upload to your storage pool',
      icon: Upload,
      href: '/files',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      title: 'Manage Providers',
      subtitle: 'Connect cloud accounts',
      icon: Cloud,
      href: '/providers',
      color: 'text-violet-500',
      bgColor: 'bg-violet-50 dark:bg-violet-950/30',
    },
    {
      title: 'View Transfers',
      subtitle: 'Track file operations',
      icon: ArrowRightLeft,
      href: '/transfers',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      title: 'Shared Links',
      subtitle: 'Manage shared files',
      icon: Link2,
      href: '/shared',
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            <p className="text-sm text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const usagePercent = pool ? getUsagePercentage(pool.total_used, pool.total_capacity) : 0;
  const userName = user?.display_name || user?.email?.split('@')[0] || 'User';

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-8 max-w-7xl">
        {/* Welcome Section */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {getGreeting()}, {userName}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here&apos;s an overview of your cloud storage
            </p>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <Files className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pool?.account_count || 0}</p>
                <p className="text-xs text-muted-foreground">Total Accounts</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/30">
                <HardDrive className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pool ? formatBytes(pool.total_used) : '0 B'}</p>
                <p className="text-xs text-muted-foreground">Storage Used</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                <ArrowRightLeft className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{transfers.length}</p>
                <p className="text-xs text-muted-foreground">Recent Transfers</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <Cloud className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pool?.provider_count || 0}</p>
                <p className="text-xs text-muted-foreground">Providers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <div className="group relative p-5 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer h-full">
                    <div className={`inline-flex p-3 rounded-xl ${action.bgColor} mb-3`}>
                      <Icon className={`h-5 w-5 ${action.color}`} />
                    </div>
                    <h3 className="font-semibold text-sm">{action.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{action.subtitle}</p>
                    <ArrowUpRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Main Content Grid - 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Storage Overview */}
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-violet-500" />
                  <CardTitle>Storage Overview</CardTitle>
                </div>
                {pool && (
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(pool.total_used)} of {formatBytes(pool.total_capacity)} used
                  </span>
                )}
              </div>
              <CardDescription>
                Aggregated storage across all connected providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Usage Bar */}
              {pool && pool.total_capacity > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Overall Usage</span>
                    <span className={usagePercent > 80 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      {usagePercent}%
                    </span>
                  </div>
                  <div className="h-4 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercent > 90
                          ? 'bg-gradient-to-r from-red-500 to-red-600'
                          : usagePercent > 70
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                          : 'bg-gradient-to-r from-violet-500 to-blue-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatBytes(pool.total_used)} used</span>
                    <span>{formatBytes(pool.total_available)} available</span>
                  </div>
                </div>
              )}

              {/* Per-Provider Breakdown */}
              {providers.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Provider Breakdown</h4>
                  <div className="space-y-3">
                    {providers.map((provider) => {
                      const providerPercent = getUsagePercentage(
                        provider.total_used,
                        provider.total_capacity
                      );
                      return (
                        <div key={provider.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${getProviderColor(provider.type)}`} />
                              <span className="text-sm font-medium">{provider.display_name}</span>
                              <Badge variant="outline" className="text-xs py-0">
                                {provider.account_count} acct
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatBytes(provider.total_used)} / {formatBytes(provider.total_capacity)}
                            </span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${getProviderColor(provider.type)}`}
                              style={{ width: `${providerPercent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Cloud className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium">No providers connected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect a cloud provider to see storage breakdown
                  </p>
                  <Link
                    href="/providers"
                    className="mt-3 text-sm text-violet-500 hover:text-violet-600 font-medium"
                  >
                    Add Provider →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  <CardTitle>Recent Activity</CardTitle>
                </div>
                <Link
                  href="/transfers"
                  className="text-xs text-violet-500 hover:text-violet-600 font-medium"
                >
                  View all →
                </Link>
              </div>
              <CardDescription>Latest file operations</CardDescription>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No recent transfers</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transfers.slice(0, 5).map((transfer) => (
                    <div
                      key={transfer.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-background">
                        {transfer.operation === 'upload' ? (
                          <Upload className="h-4 w-4 text-blue-500" />
                        ) : transfer.operation === 'download' ? (
                          <Download className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ArrowRightLeft className="h-4 w-4 text-violet-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize truncate">
                          {transfer.operation}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(transfer.bytes_transferred)} • {timeAgo(transfer.created_at)}
                        </p>
                      </div>
                      <div>
                        {transfer.status === 'completed' ? (
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        ) : transfer.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Health */}
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <CardTitle>System Health</CardTitle>
              </div>
              <CardDescription>Backend and service status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* API Status */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Backend API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        apiHealthy === true
                          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                          : apiHealthy === false
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                          : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {apiHealthy === true ? 'Online' : apiHealthy === false ? 'Offline' : 'Checking...'}
                    </span>
                  </div>
                </div>

                {/* Connected Accounts */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Connected Accounts</span>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {pool?.account_count || 0}
                  </Badge>
                </div>

                {/* Scheduler */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Scheduler</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    round-robin
                  </Badge>
                </div>

                {/* Storage Health */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Storage Health</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      usagePercent > 90
                        ? 'text-red-500 border-red-200 dark:border-red-800'
                        : usagePercent > 70
                        ? 'text-amber-500 border-amber-200 dark:border-amber-800'
                        : 'text-emerald-500 border-emerald-200 dark:border-emerald-800'
                    }
                  >
                    {usagePercent > 90 ? 'Critical' : usagePercent > 70 ? 'Warning' : 'Healthy'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
