'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import { useEscapeKey } from '@/lib/use-escape-key';
import {
  Plus, HardDrive, CheckCircle, XCircle, Loader2, Trash2,
  ChevronRight, ChevronLeft, Zap, Clock, Check, X,
  FolderOpen, File, Upload, FolderPlus, RefreshCw, ArrowLeft,
  LayoutGrid, List, Download, MoreVertical, Cloud, CloudUpload,
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Account actions state
  const [testingAccounts, setTestingAccounts] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Auto health check after OAuth
  const [pendingHealthCheckLabel, setPendingHealthCheckLabel] = useState<string | null>(null);

  // File actions state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [showMkdirDialog, setShowMkdirDialog] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escape key closes modals
  useEscapeKey(() => setShowMkdirDialog(false), showMkdirDialog);

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
      // Map rclone PascalCase response to frontend camelCase FileItem
      const mapped: FileItem[] = (data.items || []).map((item: any) => ({
        name: item.Name || item.name || '',
        type: (item.IsDir || item.isDir) ? 'folder' : 'file',
        size: item.Size ?? item.size ?? 0,
        mime_type: item.MimeType || item.mime_type || '',
        modified: item.ModTime || item.modified || '',
        path: item.Path || item.path || item.Name || item.name || '',
      }));
      setFiles(mapped);
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

  // ─── Auto Health Check After OAuth ──────────────────────────────────────

  useEffect(() => {
    if (pendingHealthCheckLabel && accounts.length > 0) {
      const newAccount = accounts.find(a => a.label === pendingHealthCheckLabel);
      if (newAccount) {
        const timer = setTimeout(() => {
          handleTestConnection(newAccount.id);
          setPendingHealthCheckLabel(null);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [pendingHealthCheckLabel, accounts]);

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

  // ─── Rename Account ─────────────────────────────────────────────────────

  const handleRenameAccount = async (accountId: string, newLabel: string) => {
    try {
      await apiClient.patch(`/storage-accounts/${accountId}`, { label: newLabel });
      // Update local state immediately for snappy UX
      setAccounts(prev => prev.map(a =>
        a.id === accountId ? { ...a, label: newLabel } : a
      ));
    } catch (err: any) {
      alert('Failed to rename account: ' + err.message);
      throw err;
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
    setUploadProgress(0);
    
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadFileName(files[i].name);
        setUploadProgress(Math.round((i / files.length) * 100));
        
        const formData = new FormData();
        formData.append('file', files[i]);
        await apiClient.post(`/storage-accounts/${selectedAccountId}/files/upload?path=${encodeURIComponent(currentPath)}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setUploadProgress(100);
      fetchFiles();
      fetchData(); // refresh capacity
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName('');
      if (e.target) e.target.value = '';
    }
  };

  // ─── Drag and Drop Upload ───────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0 || !selectedAccountId) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < droppedFiles.length; i++) {
        setUploadFileName(droppedFiles[i].name);
        setUploadProgress(Math.round((i / droppedFiles.length) * 100));
        
        const formData = new FormData();
        formData.append('file', droppedFiles[i]);
        await apiClient.post(`/storage-accounts/${selectedAccountId}/files/upload?path=${encodeURIComponent(currentPath)}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setUploadProgress(100);
      fetchFiles();
      fetchData();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName('');
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
    if (totalUsagePercent >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (totalUsagePercent >= 70) return 'bg-gradient-to-r from-amber-500 to-amber-600';
    return 'bg-gradient-to-r from-blue-500 to-blue-600';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-sm text-gray-500">Loading provider details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !provider) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Provider not found'}</h3>
            <p className="text-sm text-gray-500 mb-6">The provider you're looking for doesn't exist or has been removed.</p>
            <button
              onClick={() => router.push('/providers')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Providers
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
        <nav className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push('/providers')}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Providers</span>
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <div className="flex items-center gap-2">
            <ProviderIcon 
              src={provider.icon_url} 
              alt={provider.display_name}
              size={16}
              fallbackText={providerType.slice(0, 2).toUpperCase()}
              fallbackColor={meta?.accent || '#6B7280'}
            />
            <span className="font-medium text-gray-900">{provider.display_name}</span>
          </div>
        </nav>

        {/* Header Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-gray-50/50 to-gray-100/50 rounded-2xl border border-gray-200 shadow-sm">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br opacity-[0.03] -translate-y-1/2 translate-x-1/2 rounded-full" 
               style={{ background: `radial-gradient(circle, ${meta?.accent || '#6B7280'}, transparent)` }} />
          
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-white shadow-lg shadow-gray-200/50 flex items-center justify-center border border-gray-100 ring-4 ring-gray-50">
                  <ProviderIcon 
                    src={provider.icon_url} 
                    alt={provider.display_name}
                    size={72}
                    fallbackText={providerType.slice(0, 2).toUpperCase()}
                    fallbackColor={meta?.accent || '#6B7280'}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{provider.display_name}</h1>
                    {provider.is_active && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} connected
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 active:scale-[0.98] transition-all shadow-lg shadow-gray-900/10"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            </div>
          </div>
        </div>

        {/* Total Storage Card */}
        {accounts.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Total Storage</h2>
                  <p className="text-xs text-gray-500">Across all {provider.display_name} accounts</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{totalUsagePercent}%</div>
                <div className="text-xs text-gray-500">used</div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getTotalStorageColor()} transition-all duration-700 ease-out rounded-full`}
                  style={{ width: `${Math.min(totalUsagePercent, 100)}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  <span className="font-medium text-gray-900">{formatBytes(totalStorage.used)}</span>
                  <span className="text-gray-400 mx-1.5">of</span>
                  <span className="font-medium text-gray-900">{formatBytes(totalStorage.capacity)}</span>
                </span>
                {totalStorage.available > 0 && (
                  <span className="text-gray-500">
                    <span className="font-medium text-green-600">{formatBytes(totalStorage.available)}</span>
                    <span className="ml-1">free</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Connections Section */}
        {accounts.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Connections</h2>
                    <p className="text-xs text-gray-500">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedAccountIds.length === accounts.length && accounts.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Select All</span>
                </label>
              </div>
            </div>

            <div className="p-4 space-y-3">
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
                  onRename={(newLabel) => handleRenameAccount(account.id, newLabel)}
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
          <div 
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">File Browser</h2>
                    <p className="text-xs text-gray-500">
                      {accounts.find(a => a.id === selectedAccountId)?.label || 'Select an account'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Account Selector */}
                  <select
                    value={selectedAccountId || ''}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                  >
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-center justify-between">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => setCurrentPath('/')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      currentPath === '/' 
                        ? 'font-medium text-gray-900 bg-white shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 inline mr-1" />
                    Home
                  </button>
                  {currentPath !== '/' && currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                    const path = '/' + arr.slice(0, i + 1).join('/');
                    const isLast = i === arr.length - 1;
                    return (
                      <span key={path} className="flex items-center gap-1">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <button
                          onClick={() => setCurrentPath(path)}
                          className={`px-2.5 py-1 rounded-md transition-all truncate max-w-[120px] ${
                            isLast
                              ? 'font-medium text-gray-900 bg-white shadow-sm' 
                              : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                          }`}
                        >
                          {part}
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {/* View Toggle */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 mr-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded-md transition-all ${
                        viewMode === 'grid' 
                          ? 'bg-white shadow-sm text-gray-900' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      title="Grid view"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded-md transition-all ${
                        viewMode === 'list' 
                          ? 'bg-white shadow-sm text-gray-900' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      title="List view"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={fetchFiles}
                    disabled={loadingFiles}
                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg transition-all"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                  <button 
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                    onClick={() => setShowMkdirDialog(true)}
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">New Folder</span>
                  </button>
                  <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-[0.98] cursor-pointer transition-all shadow-sm">
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center gap-3">
                  <CloudUpload className="w-5 h-5 text-blue-600 animate-bounce" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-blue-900 truncate">{uploadFileName}</span>
                      <span className="text-blue-600 font-semibold">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* File Content */}
            <div className="p-6">
              {loadingFiles ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                  <p className="text-sm text-gray-500">Loading files...</p>
                </div>
              ) : files.length === 0 ? (
                <div 
                  className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                    dragOver 
                      ? 'border-blue-400 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                  }`}
                >
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <CloudUpload className={`w-8 h-8 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    {dragOver ? 'Drop files here' : 'This folder is empty'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {dragOver ? 'Release to upload' : 'Drag and drop files here, or click to upload'}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      Upload Files
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                    </label>
                    <button
                      onClick={() => setShowMkdirDialog(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <FolderPlus className="w-4 h-4" />
                      New Folder
                    </button>
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {files.map((file, index) => (
                    <div
                      key={`${file.path}-${index}`}
                      onClick={() => {
                        if (file.type === 'folder') {
                          setCurrentPath(file.path);
                        } else {
                          handleDownload(file.path, file.name);
                        }
                      }}
                      className="group relative p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md cursor-pointer transition-all bg-white hover:-translate-y-0.5"
                    >
                      {/* Delete button */}
                      {file.type !== 'folder' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path, file.name); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:border-red-200 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      {/* Icon */}
                      <div className="flex justify-center mb-3">
                        {file.type === 'folder' ? (
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <FolderOpen className="w-6 h-6 text-blue-500" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
                            <File className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Name */}
                      <p className={`text-sm text-center truncate ${
                        file.type === 'folder' ? 'font-medium text-gray-900' : 'text-gray-700'
                      }`}>
                        {file.name}
                      </p>
                      
                      {/* Meta */}
                      <p className="text-xs text-gray-400 text-center mt-1">
                        {file.type === 'folder' ? 'Folder' : formatBytes(file.size)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50/80">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Size</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Modified</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {files.map((file, index) => (
                        <tr
                          key={`${file.path}-${index}`}
                          className="hover:bg-gray-50 cursor-pointer group transition-colors"
                          onClick={() => {
                            if (file.type === 'folder') {
                              setCurrentPath(file.path);
                            } else {
                              handleDownload(file.path, file.name);
                            }
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {file.type === 'folder' ? (
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                  <FolderOpen className="w-4 h-4 text-blue-500" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                                  <File className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <span className={`text-sm truncate ${
                                file.type === 'folder' ? 'font-medium text-gray-900' : 'text-gray-700'
                              }`}>
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">
                            {file.type === 'folder' ? '—' : formatBytes(file.size)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">
                            {formatDate(file.modified)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {file.type !== 'folder' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path, file.name); }}
                                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Create Folder Dialog */}
      {showMkdirDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <FolderPlus className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">New Folder</h3>
            </div>
            <input
              type="text"
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Enter folder name"
              autoFocus
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
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
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {selectedAccountIds.length} {selectedAccountIds.length === 1 ? 'account' : 'accounts'} selected
                </span>
                <button
                  onClick={() => setSelectedAccountIds([])}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline"
                >
                  Clear
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
          accountCount={accounts.length}
          onClose={() => setShowAddModal(false)}
          onSuccess={async (newAccountLabel) => {
            await fetchData(); // Refresh accounts - await to ensure state updates
            setShowAddModal(false);
            // Auto health check: find new account and test after 3s
            if (newAccountLabel) {
              // Use setTimeout to let state updates settle first
              setTimeout(async () => {
                // Re-fetch to get latest accounts
                try {
                  const accRes = await apiClient.get('/storage-accounts');
                  const allAccs = accRes.data.filter((a: any) => a.provider_type === providerType);
                  setAccounts(allAccs);
                  const newAcc = allAccs.find((a: any) => a.label === newAccountLabel);
                  if (newAcc) {
                    handleTestConnection(newAcc.id);
                  }
                } catch (e) {
                  console.error('Auto health check failed:', e);
                }
              }, 3000);
            }
          }}
        />
      )}
    </DashboardLayout>
  );
}
