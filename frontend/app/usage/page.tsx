'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, HardDrive, Activity, CheckCircle, XCircle, Server } from 'lucide-react';

interface AccountUsage {
  account_id: string;
  label: string;
  remote_name: string;
  health_status: string;
  capacity: number;
  used: number;
  free: number;
  usage_percent: number;
  last_health_check?: string;
  last_capacity_sync?: string;
  cost_per_gb_month: number;
}

interface ProviderUsage {
  provider_id: string;
  provider_name: string;
  provider_type: string;
  icon_url: string;
  account_count: number;
  total_capacity: number;
  total_used: number;
  total_free: number;
  usage_percent: number;
  accounts: AccountUsage[];
}

interface UsageSummary {
  total_providers: number;
  total_accounts: number;
  total_capacity: number;
  total_used: number;
  total_free: number;
  overall_usage_percent: number;
  healthy_accounts: number;
  unhealthy_accounts: number;
}

export default function UsagePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetchUsage();
  }, [user]);

  const fetchUsage = async () => {
    try {
      const res = await apiClient.get('/usage');
      setProviders(res.data.providers || []);
      setSummary(res.data.summary);
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getUsageColor = (percent: number): string => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-orange-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Usage Dashboard</h1>
          <p className="text-muted-foreground">Storage usage per provider and account</p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBytes(summary.total_capacity)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(summary.total_used)} used
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Free Space</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBytes(summary.total_free)}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.overall_usage_percent.toFixed(1)}% used
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accounts</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.total_accounts}</div>
                <p className="text-xs text-muted-foreground">
                  across {summary.total_providers} providers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Health</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.healthy_accounts}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.unhealthy_accounts > 0 && (
                    <span className="text-red-500">{summary.unhealthy_accounts} unhealthy</span>
                  )}
                  {summary.unhealthy_accounts === 0 && 'All healthy'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Overall Usage Bar */}
        {summary && summary.total_capacity > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Overall Storage Usage</CardTitle>
              <CardDescription>
                {formatBytes(summary.total_used)} of {formatBytes(summary.total_capacity)} used
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-muted rounded-full h-6 overflow-hidden">
                <div
                  className={`h-full ${getUsageColor(summary.overall_usage_percent)} transition-all duration-500`}
                  style={{ width: `${Math.min(summary.overall_usage_percent, 100)}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {summary.overall_usage_percent.toFixed(1)}% used
              </p>
            </CardContent>
          </Card>
        )}

        {/* Per-Provider Usage */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Per Provider</h2>
          {providers.filter(p => p.account_count > 0).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <HardDrive className="h-12 w-12 mb-4" />
                <p>No storage accounts connected</p>
                <p className="text-sm">Connect providers to see usage details</p>
              </CardContent>
            </Card>
          ) : (
            providers.filter(p => p.account_count > 0).map((provider) => (
              <Card key={provider.provider_id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="capitalize">{provider.provider_name}</CardTitle>
                      <CardDescription>
                        {provider.account_count} account{provider.account_count !== 1 ? 's' : ''} · {formatBytes(provider.total_used)} of {formatBytes(provider.total_capacity)} used
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{provider.provider_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Provider usage bar */}
                  <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full ${getUsageColor(provider.usage_percent)} transition-all duration-500`}
                      style={{ width: `${Math.min(provider.usage_percent, 100)}%` }}
                    />
                  </div>

                  {/* Account details */}
                  <div className="space-y-3">
                    {provider.accounts.map((acc) => (
                      <div key={acc.account_id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{acc.label}</span>
                            {acc.health_status === 'healthy' || !acc.health_status ? (
                              <Badge variant="default" className="bg-green-600 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />Healthy
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="h-3 w-3 mr-1" />{acc.health_status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {formatBytes(acc.used)} / {formatBytes(acc.capacity)} ({acc.usage_percent.toFixed(1)}%)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatBytes(acc.free)} free</p>
                          {acc.cost_per_gb_month > 0 && (
                            <p className="text-xs text-muted-foreground">${acc.cost_per_gb_month}/GB/mo</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
