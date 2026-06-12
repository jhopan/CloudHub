'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import { Loader2, Zap } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ProviderCard } from '@/components/ProviderCard';
import { SkeletonPage } from '@/components/Skeleton';
import { EmptyProviders } from '@/components/EmptyState';
import { AddAccountModal } from '@/components/AddAccountModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  type: string;
  display_name: string;
  icon_url: string;
  auth_type: string;
  config_schema: string;
  is_active: boolean;
  account_count: number;
  total_capacity: number;
  total_used: number;
  total_available: number;
}

interface StorageAccount {
  id: string;
  provider_id: string;
  provider_type: string;
  label: string;
  health_status: string;
  is_active: boolean;
  capacity_bytes: number;
  used_bytes: number;
}

interface StoragePool {
  total_capacity: number;
  total_used: number;
  total_available: number;
  account_count: number;
  provider_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [pool, setPool] = useState<StoragePool | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [providersRes, accountsRes, poolRes] = await Promise.all([
        apiClient.get('/providers'),
        apiClient.get('/storage-accounts'),
        apiClient.get('/storage-pool'),
      ]);
      setProviders(providersRes.data || []);
      setAccounts(accountsRes.data || []);
      setPool(poolRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  // ─── Toggle Provider ─────────────────────────────────────────────────────

  const handleToggleProvider = async (providerId: string, newActive: boolean) => {
    const providerAccounts = accounts.filter(a => a.provider_id === providerId);
    
    // Optimistic update
    setAccounts(prev => 
      prev.map(a => 
        a.provider_id === providerId ? { ...a, is_active: newActive } : a
      )
    );

    try {
      await Promise.all(
        providerAccounts.map(account =>
          apiClient.put(`/storage-accounts/${account.id}`, { is_active: newActive })
        )
      );
      fetchData(); // Refresh
    } catch (error) {
      console.error('Failed to toggle provider:', error);
      fetchData(); // Revert on error
    }
  };

  // ─── Test All ────────────────────────────────────────────────────────────

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      // TODO: Implement batch test endpoint
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert('Test all completed! (Demo)');
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setTestingAll(false);
    }
  };

  // ─── Grouping ────────────────────────────────────────────────────────────

  const connectedProviders = providers.filter(p => 
    accounts.some(a => a.provider_id === p.id)
  );

  const availableProviders = providers.filter(p => 
    !accounts.some(a => a.provider_id === p.id)
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Storage Providers</h1>
          <p className="text-gray-600 mt-2">
            Connect and manage your cloud storage accounts
          </p>
        </div>

        {/* Storage Pool Summary */}
        {pool && pool.account_count > 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Capacity</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatBytes(pool.total_capacity)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Used Space</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatBytes(pool.total_used)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Available</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatBytes(pool.total_available)}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                  style={{ 
                    width: `${pool.total_capacity > 0 ? (pool.total_used / pool.total_capacity) * 100 : 0}%` 
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {pool.account_count} accounts across {pool.provider_count} providers
              </p>
            </div>
          </div>
        )}

        {/* Connected Providers Section */}
        {connectedProviders.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Connected Providers
              </h2>
              <button
                onClick={handleTestAll}
                disabled={testingAll}
                className={`
                  flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  transition-all border
                  ${testingAll
                    ? 'bg-blue-50 border-blue-300 text-blue-600 animate-pulse'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600'
                  }
                `}
              >
                <Zap className={`w-4 h-4 ${testingAll ? 'animate-spin' : ''}`} />
                {testingAll ? 'Testing...' : 'Test All'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {connectedProviders.map(provider => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  accounts={accounts}
                  onToggle={(active) => handleToggleProvider(provider.id, active)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available Providers Section */}
        {availableProviders.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Available Providers
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {availableProviders.map(provider => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  accounts={accounts}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {providers.length === 0 && (
          <EmptyProviders />
        )}
      </div>
    </DashboardLayout>
  );
}
