'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import {
  Plus, HardDrive, CheckCircle, XCircle, Loader2, Trash2,
  ChevronRight, ChevronLeft, Zap, Clock, Check, X,
  FolderOpen, File, Upload, FolderPlus, RefreshCw, ArrowLeft,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ConnectionRow } from '@/components/ConnectionRow';
import { StatusBadge } from '@/components/StatusBadge';
import { ProviderIcon } from '@/components/ProviderIcon';
import { SkeletonConnectionRow } from '@/components/Skeleton';
import { EmptyAccounts, EmptyFiles } from '@/components/EmptyState';
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
  user_id: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  provider_icon_url: string;
  label: string;
  rclone_remote_name: string;
  capacity_bytes: number;
  used_bytes: number;
  available_bytes: number;
  health_status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size: number;
  mime_type?: string;
  modified: string;
  path: string;
}

interface TestResult {
  success: boolean;
  responseTime: number;
  message?: string;
  capacityBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  error?: string;
}

// ─── Provider Metadata ───────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { logo: string; color: string; accent: string; description: string }> = {
  gdrive: {
    logo: '/providers/google-drive.svg',
    color: 'from-blue-500/10 to-green-500/10',
    accent: '#4285F4',
    description: 'Google Drive',
  },
  mega: {
    logo: '/providers/mega.svg',
    color: 'from-red-500/10 to-red-600/10',
    accent: '#D9272E',
    description: 'Mega',
  },
  onedrive: {
    logo: '/providers/microsoft-onedrive.svg',
    color: 'from-blue-500/10 to-blue-600/10',
    accent: '#0078D4',
    description: 'OneDrive',
  },
  dropbox: {
    logo: '/providers/dropbox.svg',
    color: 'from-blue-400/10 to-blue-500/10',
    accent: '#0061FF',
    description: 'Dropbox',
  },
  r2: {
    logo: '/providers/r2.svg',
    color: 'from-orange-500/10 to-amber-500/10',
    accent: '#F48120',
    description: 'Cloudflare R2',
  },
  s3: {
    logo: '/providers/s3-storage.svg',
    color: 'from-amber-500/10 to-yellow-500/10',
    accent: '#FF9900',
    description: 'S3 Storage',
  },
  b2: {
    logo: '/providers/b2.svg',
    color: 'from-red-500/10 to-red-600/10',
    accent: '#E21B22',
    description: 'Backblaze B2',
  },
  webdav: {
    logo: '/providers/webdav.svg',
    color: 'from-gray-500/10 to-gray-600/10',
    accent: '#6B7280',
    description: 'WebDAV',
  },
  nextcloud: {
    logo: '/providers/nextcloud.svg',
    color: 'from-blue-500/10 to-blue-600/10',
    accent: '#0082C9',
    description: 'Nextcloud',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProviderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();

  const providerType = params.providerType as string;
  const meta = PROVIDER_META[providerType];

  const [provider, setProvider] = useState<Provider | null>(null);
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // File browser state
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Account actions state
  const [testingAccounts, setTestingAccounts] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // File actions state
  const [uploading, setUploading] = useState(false);
  const [showMkdirDialog, setShowMkdirDialog] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch Data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const [providersRes, accountsRes] = await Promise.all([
        apiClient.get('/providers'),
        apiClient.get('/storage-accounts'),
      ]);

      const allProviders: Provider[] = providersRes.data;
      const allAccounts: StorageAccount[] = accountsRes.data;

      const foundProvider = allProviders.find(p => p.type === providerType);
      if (!foundProvider) {
        setError('Provider not found');
        setLoading(false);
        return;
      }

      setProvider(foundProvider);

      const providerAccounts = allAccounts.filter(a => a.provider_type === providerType);
      setAccounts(providerAccounts);

      // Auto-select first account
      if (providerAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(providerAccounts[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, providerType, selectedAccountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Fetch Files ─────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    if (!selectedAccountId) return;

    try {
      setLoadingFiles(true);
      const res = await apiClient.get(`/storage-accounts/${selectedAccountId}/files?path=${encodeURIComponent(currentPath)}`);
      const data = res.data;
      setFiles(data.items || []);
    } catch (err: any) {
      console.error('Failed to fetch files:', err);
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedAccountId, currentPath]);

  useEffect(() => {
    if (selectedAccountId) {
      fetchFiles();
    }
  }, [selectedAccountId, currentPath, fetchFiles]);

  // ─── Test Connection ─────────────────────────────────────────────────────

  const handleTestConnection = async (accountId: string) => {
    setTestingAccounts(prev => new Set(prev).add(accountId));
    setTestResults(prev => ({ ...prev, [accountId]: undefined as any }));

    try {
      const res = await apiClient.post(`/storage-accounts/${accountId}/test`);
      const result: TestResult = res.data;
      setTestResults(prev => ({ ...prev, [accountId]: result }));

      // Refresh data if successful
      if (result.success) {
        fetchData();
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [accountId]: { success: false, responseTime: 0, error: err.message },
      }));
    } finally {
      setTestingAccounts(prev => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  // ─── Toggle Account ──────────────────────────────────────────────────────

  const handleToggleAccount = async (accountId: string, active: boolean) => {
    try {
      await apiClient.put(`/storage-accounts/${accountId}`, { is_active: active });
      fetchData();
    } catch (err: any) {
      alert('Failed to toggle account: ' + err.message);
    }
  };

  // ─── Delete Account ──────────────────────────────────────────────────────

  const handleDeleteAccount = async (accountId: string, label: string) => {
    if (!confirm(`Delete account "${label}"? This cannot be undone.`)) return;

    try {
      await apiClient.delete(`/storage-accounts/${accountId}`);
      fetchData();
      setSelectedAccountIds(prev => prev.filter(id => id !== accountId));
    } catch (err: any) {
      alert('Failed to delete account: ' + err.message);
    }
  };

  // ─── Bulk Operations ─────────────────────────────────────────────────────

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAccountIds(accounts.map(a => a.id));
    } else {
      setSelectedAccountIds([]);
    }
  };

  const handleTestSelected = async () => {
    for (const accountId of selectedAccountIds) {
      await handleTestConnection(accountId);
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedAccountIds.length} selected accounts? This cannot be undone.`)) return;

    try {
      await Promise.all(
        selectedAccountIds.map(id => apiClient.delete(`/storage-accounts/${id}`))
      );
      setSelectedAccountIds([]);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete accounts: ' + err.message);
    }
  };

  // ─── Upload File ────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedAccountId) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        await apiClient.post(`/storage-accounts/${selectedAccountId}/files/upload?path=${encodeURIComponent(currentPath)}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      fetchFiles();
      fetchData(); // refresh capacity
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // ─── Create Folder ──────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!mkdirName.trim() || !selectedAccountId) return;

    setCreatingFolder(true);
    try {
      const folderPath = currentPath === '/' ? `/${mkdirName.trim()}` : `${currentPath}/${mkdirName.trim()}`;
      await apiClient.post(`/storage-accounts/${selectedAccountId}/files/mkdir`, { path: folderPath });
      setShowMkdirDialog(false);
      setMkdirName('');
      fetchFiles();
    } catch (err: any) {
      alert('Create folder failed: ' + err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  // ─── Delete File ────────────────────────────────────────────────────────

  const handleDeleteFile = async (filePath: string, fileName: string) => {
    if (!selectedAccountId) return;
    if (!confirm(`Delete "${fileName}"?`)) return;

    try {
      await apiClient.delete(`/storage-accounts/${selectedAccountId}/files?path=${encodeURIComponent(filePath)}`);
      fetchFiles();
      fetchData();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // ─── Download File ──────────────────────────────────────────────────────

  const handleDownload = async (filePath: string, fileName: string) => {
    if (!selectedAccountId) return;

    try {
      const response = await apiClient.get(`/storage-accounts/${selectedAccountId}/files/download?path=${encodeURIComponent(filePath)}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Download failed: ' + err.message);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const usagePercent = selectedAccount
    ? selectedAccount.capacity_bytes > 0
      ? Math.round((selectedAccount.used_bytes / selectedAccount.capacity_bytes) * 100)
      : 0
    : 0;

  // Calculate total storage across all accounts
  const totalStorage = accounts.reduce((sum, acc) => ({
    capacity: sum.capacity + acc.capacity_bytes,
    used: sum.used + acc.used_bytes,
    available: sum.available + acc.available_bytes,
  }), { capacity: 0, used: 0, available: 0 });

  const totalUsagePercent = totalStorage.capacity > 0
    ? Math.round((totalStorage.used / totalStorage.capacity) * 100)
    : 0;

  const getTotalStorageColor = () => {
    if (totalUsagePercent >= 90) return 'bg-red-500';
    if (totalUsagePercent >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !provider) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">{error || 'Provider not found'}</h3>
            <button
              onClick={() => router.push('/providers')}
              className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Back to Providers
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push('/providers')}
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Providers
          </button>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="text-gray-900 font-medium">{provider.display_name}</span>
        </div>

        {/* Header Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border border-gray-200">
                <ProviderIcon 
                  src={provider.icon_url} 
                  alt={provider.display_name}
                  size={64}
                  fallbackText={providerType.slice(0, 2).toUpperCase()}
                  fallbackColor={meta?.accent || '#6B7280'}
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{provider.display_name}</h1>
                <p className="text-sm text-gray-500 mt-1">{meta?.description || provider.display_name}</p>
              </div>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>
        </div>

        {/* Total Storage Card */}
        {accounts.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Total Storage</h2>
              <span className="text-sm text-gray-500">
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>
            
            <div className="mb-2">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">
                  {formatBytes(totalStorage.used)} / {formatBytes(totalStorage.capacity)}
                </span>
                <span className="font-semibold text-gray-900">{totalUsagePercent}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getTotalStorageColor()} transition-all duration-500`}
                  style={{ width: `${Math.min(totalUsagePercent, 100)}%` }}
                />
              </div>
            </div>
            
            {totalStorage.available > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {formatBytes(totalStorage.available)} available
              </p>
            )}
          </div>
        )}

        {/* Connections Section */}
        {accounts.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Connections</h2>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                <input
                  type="checkbox"
                  checked={selectedAccountIds.length === accounts.length && accounts.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Select All
              </label>
            </div>

            <div className="space-y-3">
              {accounts.map(account => (
                <ConnectionRow
                  key={account.id}
                  account={account}
                  selected={selectedAccountIds.includes(account.id)}
                  testing={testingAccounts.has(account.id)}
                  testResult={testResults[account.id]}
                  onSelect={(checked) => {
                    if (checked) {
                      setSelectedAccountIds(prev => [...prev, account.id]);
                    } else {
                      setSelectedAccountIds(prev => prev.filter(id => id !== account.id));
                    }
                  }}
                  onTest={() => handleTestConnection(account.id)}
                  onToggle={(active) => handleToggleAccount(account.id, active)}
                  onDelete={() => handleDeleteAccount(account.id, account.label)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyAccounts 
            providerName={provider.display_name}
            onAdd={() => router.push('/providers')}
          />
        )}

        {/* File Browser Section */}
        {accounts.length > 0 && selectedAccountId && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">File Browser</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {accounts.find(a => a.id === selectedAccountId)?.label || 'Select an account'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mb-4">
              <button
                onClick={fetchFiles}
                disabled={loadingFiles}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
              </button>
              <button 
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => setShowMkdirDialog(true)}
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Upload'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-4 overflow-x-auto">
              <button
                onClick={() => setCurrentPath('/')}
                className={`px-2 py-1 rounded hover:bg-gray-100 ${currentPath === '/' ? 'font-medium text-gray-900' : ''}`}
              >
                /
              </button>
              {currentPath !== '/' && currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                const path = '/' + arr.slice(0, i + 1).join('/');
                return (
                  <span key={path} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <button
                      onClick={() => setCurrentPath(path)}
                      className={`px-2 py-1 rounded hover:bg-gray-100 ${i === arr.length - 1 ? 'font-medium text-gray-900' : ''}`}
                    >
                      {part}
                    </button>
                  </span>
                );
              })}
            </div>

            {/* File List */}
            {loadingFiles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">This folder is empty</p>
                <p className="text-xs text-gray-400 mt-1">Upload files or create folders to get started</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Modified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {files.map(file => (
                      <tr
                        key={file.path}
                        className="hover:bg-gray-50 cursor-pointer group"
                        onClick={() => {
                          if (file.type === 'folder') {
                            setCurrentPath(file.path);
                          } else {
                            handleDownload(file.path, file.name);
                          }
                        }}
                      >
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            {file.type === 'folder' ? (
                              <FolderOpen className="w-4 h-4 text-blue-500" />
                            ) : (
                              <File className="w-4 h-4 text-gray-400" />
                            )}
                            <span className={file.type === 'folder' ? 'font-medium text-gray-900' : 'text-gray-700'}>
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 text-right">
                          {file.type === 'folder' ? '—' : formatBytes(file.size)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatDate(file.modified)}</span>
                            {file.type !== 'folder' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path, file.name); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 rounded transition-opacity"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {accounts.length === 0 && (
          <div className="text-center py-16">
            <HardDrive className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No accounts connected</h3>
            <p className="text-sm text-gray-500 mt-1">Connect your first {provider.display_name} account to get started</p>
            <button
              onClick={() => router.push('/providers')}
              className="mt-4 px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              + Add Account
            </button>
          </div>
        )}
      </div>

      {/* Create Folder Dialog */}
      {showMkdirDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">New Folder</h3>
            <input
              type="text"
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowMkdirDialog(false); setMkdirName(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!mkdirName.trim() || creatingFolder}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Operations Bar */}
      {selectedAccountIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">
                  {selectedAccountIds.length} {selectedAccountIds.length === 1 ? 'account' : 'accounts'} selected
                </span>
                <button
                  onClick={() => setSelectedAccountIds([])}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestSelected}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Test Selected
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && provider && (
        <AddAccountModal
          provider={provider}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            fetchData(); // Refresh accounts
            setShowAddModal(false);
          }}
        />
      )}
    </DashboardLayout>
  );
}
