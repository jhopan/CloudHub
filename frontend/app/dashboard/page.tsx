'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HardDrive, Cloud, Upload, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

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

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pool, setPool] = useState<StoragePool | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [user, router]);

  const fetchData = async () => {
    try {
      const [poolRes, providersRes] = await Promise.all([
        apiClient.get('/storage-pool'),
        apiClient.get('/providers'),
      ]);

      setPool(poolRes.data);
      setProviders(providersRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const getUsagePercentage = (used: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
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
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.email}</p>
        </div>

      {pool && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Pool Overview
            </CardTitle>
            <CardDescription>
              Aggregated storage across all your connected accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Capacity</p>
                <p className="text-2xl font-bold">{formatBytes(pool.total_capacity)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Used</p>
                <p className="text-2xl font-bold">{formatBytes(pool.total_used)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-green-600">{formatBytes(pool.total_available)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Accounts</p>
                <p className="text-2xl font-bold">{pool.account_count}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Providers</p>
                <p className="text-2xl font-bold">{pool.provider_count}</p>
              </div>
            </div>
            {pool.total_capacity > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Overall Usage</span>
                  <span>{getUsagePercentage(pool.total_used, pool.total_capacity)}%</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${getUsagePercentage(pool.total_used, pool.total_capacity)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pool ? formatBytes(pool.total_capacity) : '0 B'}</div>
            <p className="text-xs text-muted-foreground">
              {pool ? formatBytes(pool.total_available) : '0 B'} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected Providers</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pool?.provider_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {pool?.account_count || 0} storage accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usage</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pool ? getUsagePercentage(pool.total_used, pool.total_capacity) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {pool ? formatBytes(pool.total_used) : '0 B'} used
            </p>
          </CardContent>
        </Card>
      </div>

      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Status</CardTitle>
            <CardDescription>Overview of your connected storage providers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {providers.map((provider) => {
                const usagePercent = getUsagePercentage(provider.total_used, provider.total_capacity);
                return (
                  <div key={provider.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{provider.display_name}</span>
                        <Badge variant={provider.is_active ? 'default' : 'secondary'} className="text-xs">
                          {provider.account_count} account{provider.account_count !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatBytes(provider.total_used)} / {formatBytes(provider.total_capacity)}
                      </span>
                    </div>
                    {provider.total_capacity > 0 && (
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {providers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Providers Connected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Connect your first cloud storage provider to get started
            </p>
            <button
              onClick={() => router.push('/providers')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Add Provider
            </button>
          </CardContent>
        </Card>
      )}
      </div>
    </DashboardLayout>
  );
}
