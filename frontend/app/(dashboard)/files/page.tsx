'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder,
  File,
  Upload,
  FolderPlus,
  Search,
  Download,
  Trash2,
  ChevronRight,
  Home,
  Loader2,
  Grid3X3,
  List,
  Cloud,
  HardDrive,
  X,
  CheckCircle2,
  AlertCircle,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  FileCode,
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  MoreVertical,
  Zap,
  Shield,
  ArrowUpRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VFSFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  account_id?: string;
  account_label?: string;
  provider_type?: string;
  remote_path?: string;
}

interface StorageAccount {
  id: string;
  label: string;
  provider_type: string;
  provider_display_name: string;
  provider_icon_url: string;
  capacity_bytes: number;
  used_bytes: number;
  health_status: string;
  is_active: boolean;
  rclone_remote_name: string;
}

interface StoragePool {
  total_capacity_bytes: number;
  total_used_bytes: number;
  account_count: number;
}

interface UploadProgress {
  filename: string;
  upload_id: string;
  total_size: number;
  uploaded_bytes: number;
  total_chunks: number;
  completed_chunks: number;
  status: 'uploading' | 'finalizing' | 'complete' | 'error' | 'paused';
  error?: string;
  speed?: number;
  started_at: number;
  auto_picked?: boolean;
  account_label?: string;
  strategy_used?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// ─── Provider Config ─────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string; dot: string }> = {
  gdrive: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    gradient: 'from-blue-500 via-green-500 to-yellow-500',
    dot: 'bg-blue-500',
  },
  mega: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    gradient: 'from-red-500 to-red-600',
    dot: 'bg-red-500',
  },
  onedrive: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    gradient: 'from-sky-400 to-sky-600',
    dot: 'bg-sky-500',
  },
  dropbox: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    gradient: 'from-indigo-400 to-indigo-600',
    dot: 'bg-indigo-500',
  },
  s3: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    gradient: 'from-orange-400 to-orange-600',
    dot: 'bg-orange-500',
  },
  r2: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    gradient: 'from-amber-400 to-orange-500',
    dot: 'bg-amber-500',
  },
  b2: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    gradient: 'from-rose-400 to-rose-600',
    dot: 'bg-rose-500',
  },
};

const DEFAULT_PROVIDER_COLOR = {
  bg: 'bg-gray-50',
  text: 'text-gray-700',
  border: 'border-gray-200',
  gradient: 'from-gray-400 to-gray-600',
  dot: 'bg-gray-500',
};

function getProviderColor(providerType?: string) {
  return PROVIDER_COLORS[providerType || ''] || DEFAULT_PROVIDER_COLOR;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getFileIcon(file: VFSFile, large = false) {
  const size = large ? 'h-10 w-10' : 'h-5 w-5';
  if (file.type === 'directory') {
    return <Folder className={`${size} text-amber-500`} />;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <FileImage className={`${size} text-blue-500`} />;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'].includes(ext)) {
    return <FileVideo className={`${size} text-purple-500`} />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
    return <FileAudio className={`${size} text-pink-500`} />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <FileArchive className={`${size} text-orange-500`} />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sh'].includes(ext)) {
    return <FileCode className={`${size} text-emerald-500`} />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'csv', 'xls', 'xlsx'].includes(ext)) {
    return <FileText className={`${size} text-sky-600`} />;
  }
  return <File className={`${size} text-gray-400`} />;
}

function getProviderLargeIcon(providerType?: string) {
  const color = getProviderColor(providerType);
  switch (providerType) {
    case 'gdrive':
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <Cloud className="h-5 w-5" />
        </div>
      );
    case 'mega':
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <HardDrive className="h-5 w-5" />
        </div>
      );
    case 'dropbox':
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <Cloud className="h-5 w-5" />
        </div>
      );
    case 'onedrive':
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <Cloud className="h-5 w-5" />
        </div>
      );
    case 's3':
    case 'r2':
    case 'b2':
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <Database className="h-5 w-5" />
        </div>
      );
    default:
      return (
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color.gradient} text-white`}>
          <Cloud className="h-5 w-5" />
        </div>
      );
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MyFilesPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Navigation state
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<VFSFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accounts & pool
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [pool, setPool] = useState<StoragePool | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Upload state
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadPanelExpanded, setUploadPanelExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New folder state
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Action states
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Abort controllers for cancellation
  const abortControllerRef = useRef<Map<string, AbortController>>(new Map());

  // ─── Computed ────────────────────────────────────────────────────────────

  const isAtRoot = currentPath === '/';

  const currentAccountId = useMemo(() => {
    if (isAtRoot) return selectedAccountId;
    const fileWithAccount = files.find((f) => f.account_id);
    return fileWithAccount?.account_id || selectedAccountId;
  }, [isAtRoot, files, selectedAccountId]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'All Files', path: '/' }];
    if (currentPath !== '/') {
      const parts = currentPath.split('/').filter(Boolean);
      let accumulated = '';
      for (const part of parts) {
        accumulated += '/' + part;
        crumbs.push({ label: part, path: accumulated });
      }
    }
    return crumbs;
  }, [currentPath]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (selectedAccountId && isAtRoot) {
      result = result.filter((f) => f.account_id === selectedAccountId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.account_label?.toLowerCase().includes(q) ||
          f.provider_type?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [files, searchQuery, selectedAccountId, isAtRoot]);

  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredFiles]);

  const activeUploads = uploads.filter(
    (u) => u.status === 'uploading' || u.status === 'finalizing' || u.status === 'error' || u.status === 'paused'
  );
  const completedUploads = uploads.filter((u) => u.status === 'complete');

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/vfs/list', { params: { path } });
      setFiles(Array.isArray(res.data) ? res.data : res.data.files || []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || 'Failed to load files';
      setError(msg);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiClient.get('/storage-accounts');
      const data = Array.isArray(res.data) ? res.data : res.data.accounts || [];
      setAccounts(data);
    } catch {
      // silent fail for accounts
    }
  }, []);

  const fetchPool = useCallback(async () => {
    try {
      const res = await apiClient.get('/storage-pool');
      setPool(res.data);
    } catch {
      // silent fail for pool
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchFiles(currentPath);
    fetchAccounts();
    fetchPool();
  }, [user, currentPath, fetchFiles, fetchAccounts, fetchPool, router]);

  // ─── Navigation ──────────────────────────────────────────────────────────

  const navigateToPath = (path: string) => {
    setCurrentPath(path);
    setSearchQuery('');
    if (path === '/') {
      setSelectedAccountId(null);
    }
  };

  const navigateToFolder = (file: VFSFile) => {
    if (file.type === 'directory') {
      navigateToPath(file.path);
    }
  };

  const handleAccountClick = (accountId: string) => {
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null);
    } else {
      setSelectedAccountId(accountId);
    }
  };

  const handleAccountNavigate = (account: StorageAccount) => {
    setCurrentPath('/' + account.label);
    setSelectedAccountId(null);
    setSearchQuery('');
  };

  // ─── Download ────────────────────────────────────────────────────────────

  const handleDownload = async (file: VFSFile) => {
    if (!file.account_id || !file.remote_path) return;
    const key = file.path;
    setDownloadingFile(key);
    try {
      const res = await apiClient.get('/vfs/download', {
        params: { account_id: file.account_id, path: file.remote_path },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloadingFile(null);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async (file: VFSFile) => {
    if (!file.account_id || !file.remote_path) return;
    const confirmed = window.confirm(
      `Delete "${file.name}"${file.type === 'directory' ? ' and all its contents' : ''}?`
    );
    if (!confirmed) return;

    const key = file.path;
    setDeletingFile(key);
    try {
      await apiClient.delete('/vfs/delete', {
        params: { account_id: file.account_id, path: file.remote_path },
      });
      fetchFiles(currentPath);
      fetchAccounts();
      fetchPool();
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeletingFile(null);
    }
  };

  // ─── New Folder ──────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !currentAccountId) return;

    setCreatingFolder(true);
    try {
      const pathParts = currentPath.split('/').filter(Boolean);
      pathParts.shift();
      const remotePath = '/' + [...pathParts, name].join('/');

      await apiClient.post('/vfs/mkdir', {
        account_id: currentAccountId,
        path: remotePath,
      });
      setNewFolderName('');
      setShowNewFolder(false);
      fetchFiles(currentPath);
    } catch (e) {
      console.error('Failed to create folder:', e);
    } finally {
      setCreatingFolder(false);
    }
  };

  // ─── Chunked Upload ──────────────────────────────────────────────────────

  const uploadFileChunked = async (file: File) => {
    const useAutoPick = isAtRoot && !selectedAccountId;

    if (!useAutoPick && !currentAccountId) {
      return;
    }

    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.shift();
    const remotePath = '/' + pathParts.join('/');

    const uploadKey = `${Date.now()}-${file.name}`;
    const startedAt = Date.now();
    const progress: UploadProgress = {
      filename: file.name,
      upload_id: '',
      total_size: totalSize,
      uploaded_bytes: 0,
      total_chunks: totalChunks,
      completed_chunks: 0,
      status: 'uploading',
      started_at: startedAt,
      auto_picked: useAutoPick,
    };

    setUploads((prev) => [...prev, { ...progress }]);
    setUploadPanelExpanded(true);

    const updateUpload = (updates: Partial<UploadProgress>) => {
      setUploads((prev) =>
        prev.map((u) =>
          u.filename === file.name && u.upload_id === progress.upload_id
            ? { ...u, ...updates }
            : u
        )
      );
    };

    try {
      // 1. Init upload — auto-pick or manual
      let upload_id: string;
      let total_chunks_server: number;
      let serverChunkSize: number;

      if (useAutoPick) {
        const initRes = await apiClient.post('/vfs/upload/auto-init', {
          filename: file.name,
          total_size: totalSize,
          path: remotePath === '/' ? '/' : remotePath,
        });

        const data = initRes.data;
        upload_id = data.upload_id;
        total_chunks_server = data.total_chunks;
        serverChunkSize = data.chunk_size;

        // Show auto-pick info in upload panel
        updateUpload({
          upload_id,
          auto_picked: true,
          account_label: data.account_label,
          strategy_used: data.strategy_used,
        });
        progress.upload_id = upload_id;
      } else {
        const initRes = await apiClient.post('/vfs/upload/init', {
          account_id: currentAccountId,
          path: remotePath === '/' ? '/' : remotePath,
          filename: file.name,
          total_size: totalSize,
          chunk_size: CHUNK_SIZE,
        });

        const data = initRes.data;
        upload_id = data.upload_id;
        total_chunks_server = data.total_chunks;
        serverChunkSize = data.chunk_size;
        progress.upload_id = upload_id;
      }

      const effectiveChunkSize = serverChunkSize || CHUNK_SIZE;
      const effectiveTotalChunks = total_chunks_server || totalChunks;

      updateUpload({
        upload_id,
        total_chunks: effectiveTotalChunks,
      });

      const controller = new AbortController();
      abortControllerRef.current.set(uploadKey, controller);

      // 2. Upload chunks
      let uploadedBytes = 0;
      for (let i = 0; i < effectiveTotalChunks; i++) {
        if (controller.signal.aborted) {
          updateUpload({ status: 'paused', error: 'Upload cancelled' });
          return;
        }

        const start = i * effectiveChunkSize;
        const end = Math.min(start + effectiveChunkSize, totalSize);
        const chunk = file.slice(start, end);

        let retries = 0;
        const maxRetries = 3;
        let chunkUploaded = false;

        while (retries < maxRetries && !chunkUploaded) {
          try {
            await apiClient.put(`/vfs/upload/${upload_id}/chunk/${i}`, chunk, {
              headers: { 'Content-Type': 'application/octet-stream' },
              signal: controller.signal,
            });
            chunkUploaded = true;
          } catch (chunkErr) {
            retries++;
            if (retries >= maxRetries) {
              try {
                const statusRes = await apiClient.get(`/vfs/upload/${upload_id}/status`);
                const { missing_chunks } = statusRes.data;
                if (missing_chunks && !missing_chunks.includes(i)) {
                  chunkUploaded = true;
                } else {
                  throw chunkErr;
                }
              } catch {
                throw chunkErr;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
          }
        }

        uploadedBytes += end - start;
        const elapsed = (Date.now() - startedAt) / 1000;
        const speed = elapsed > 0 ? uploadedBytes / elapsed : 0;

        updateUpload({
          uploaded_bytes: uploadedBytes,
          completed_chunks: i + 1,
          speed,
        });
      }

      // 3. Finalize
      updateUpload({ status: 'finalizing' });
      await apiClient.post(`/vfs/upload/${upload_id}/finalize`);
      updateUpload({ status: 'complete', uploaded_bytes: totalSize });

      abortControllerRef.current.delete(uploadKey);
      fetchFiles(currentPath);
      fetchAccounts();
      fetchPool();

      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.upload_id !== upload_id));
      }, 4000);
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error('Upload failed:', e);
      updateUpload({
        status: 'error',
        error: err.message || 'Upload failed',
      });
      abortControllerRef.current.delete(uploadKey);
    }
  };

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (let i = 0; i < fileList.length; i++) {
      uploadFileChunked(fileList[i]);
    }
  };

  const cancelUpload = (uploadId: string) => {
    const upload = uploads.find((u) => u.upload_id === uploadId);
    if (upload) {
      for (const [key, controller] of abortControllerRef.current.entries()) {
        if (key.includes(upload.filename)) {
          controller.abort();
          abortControllerRef.current.delete(key);
          break;
        }
      }
      if (uploadId) {
        apiClient.delete(`/vfs/upload/${uploadId}`).catch(() => {});
      }
    }
    setUploads((prev) => prev.filter((u) => u.upload_id !== uploadId));
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // ─── Pool stats ──────────────────────────────────────────────────────────

  const totalCapacity = pool?.total_capacity_bytes || accounts.reduce((s, a) => s + a.capacity_bytes, 0);
  const totalUsed = pool?.total_used_bytes || accounts.reduce((s, a) => s + a.used_bytes, 0);
  const totalAvailable = totalCapacity - totalUsed;
  const usagePercent = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ═══ SECTION 1: Storage Overview ═══ */}
          <section className="space-y-4 animate-in fade-in duration-500">
            {/* Total Storage Hero Card */}
            <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 via-transparent to-sky-50/50" />
              <div className="relative p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-violet-100">
                        <Database className="h-4 w-4 text-violet-600" />
                      </div>
                      <span className="text-sm font-medium text-slate-500">Total Cloud Storage</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                        {formatBytes(totalUsed)}
                      </span>
                      <span className="text-base text-slate-400 font-medium">
                        of {formatBytes(totalCapacity)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {formatBytes(totalAvailable)} available across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { fetchAccounts(); fetchPool(); fetchFiles(currentPath); }}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Gradient Progress Bar */}
                <div className="mt-5">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-slate-400">{usagePercent.toFixed(1)}% used</span>
                    <span className="text-xs text-slate-400">{formatBytes(totalAvailable)} free</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Account Cards - Horizontal Scroll */}
            {accounts.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
                {accounts.map((account) => {
                  const color = getProviderColor(account.provider_type);
                  const usedPercent = account.capacity_bytes > 0
                    ? (account.used_bytes / account.capacity_bytes) * 100
                    : 0;
                  const isSelected = selectedAccountId === account.id;

                  return (
                    <button
                      key={account.id}
                      onClick={() => handleAccountClick(account.id)}
                      onDoubleClick={() => handleAccountNavigate(account)}
                      className={`
                        group relative flex-shrink-0 w-64 snap-start rounded-xl border p-4 text-left
                        transition-all duration-200 hover:shadow-md
                        ${isSelected
                          ? 'border-violet-300 bg-violet-50/50 shadow-sm ring-1 ring-violet-200'
                          : 'border-slate-200/60 bg-white hover:border-slate-300'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between mb-3">
                        {getProviderLargeIcon(account.provider_type)}
                        <div className="flex items-center gap-1.5">
                          {/* Health dot */}
                          <div
                            className={`h-2 w-2 rounded-full ${
                              account.health_status === 'healthy'
                                ? 'bg-emerald-500'
                                : account.health_status === 'warning'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            title={account.health_status}
                          />
                          {account.is_active && (
                            <Shield className="h-3 w-3 text-emerald-500" />
                          )}
                        </div>
                      </div>

                      <p className="font-medium text-sm text-slate-900 truncate mb-0.5">
                        {account.label}
                      </p>
                      <p className="text-xs text-slate-400 mb-3">
                        {account.provider_display_name}
                      </p>

                      {/* Mini progress bar */}
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${color.gradient} transition-all duration-500`}
                            style={{ width: `${Math.min(usedPercent, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[11px] text-slate-400">
                            {formatBytes(account.used_bytes)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatBytes(account.capacity_bytes)}
                          </span>
                        </div>
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute top-2 left-2">
                          <CheckCircle2 className="h-4 w-4 text-violet-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ═══ SECTION 2: File Browser ═══ */}
          <section className="flex gap-4 min-h-[500px]">
            {/* Left Sidebar - Account Filters */}
            <aside
              className={`
                flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden
                ${sidebarOpen ? 'w-56' : 'w-0'}
              `}
            >
              <div className="w-56 sticky top-6 space-y-1">
                <div className="rounded-xl border border-slate-200/60 bg-white overflow-hidden shadow-sm">
                  <div className="p-3 border-b border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Accounts
                    </h3>
                  </div>
                  <div className="p-2 space-y-0.5">
                    <button
                      onClick={() => {
                        setSelectedAccountId(null);
                        if (!isAtRoot) navigateToPath('/');
                      }}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                        ${!selectedAccountId
                          ? 'bg-violet-50 text-violet-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Cloud className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">All Files</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {accounts.length}
                      </span>
                    </button>

                    {accounts.map((account) => {
                      const color = getProviderColor(account.provider_type);
                      const isActive = selectedAccountId === account.id;
                      return (
                        <button
                          key={account.id}
                          onClick={() => handleAccountClick(account.id)}
                          onDoubleClick={() => handleAccountNavigate(account)}
                          className={`
                            w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                            ${isActive
                              ? `${color.bg} ${color.text} font-medium`
                              : 'text-slate-600 hover:bg-slate-50'
                            }
                          `}
                        >
                          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${color.dot}`} />
                          <span className="truncate flex-1 text-left">{account.label}</span>
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Top Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1 scrollbar-none">
                  {breadcrumbs.map((crumb, i) => (
                    <div key={crumb.path} className="flex items-center gap-1 shrink-0">
                      {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                      <button
                        onClick={() => navigateToPath(crumb.path)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                          i === breadcrumbs.length - 1
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {i === 0 && <Home className="h-3.5 w-3.5" />}
                        {crumb.label}
                      </button>
                    </div>
                  ))}
                </nav>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 w-44 text-sm bg-white border-slate-200"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Sidebar toggle */}
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="border-slate-200"
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    ) : (
                      <PanelLeftOpen className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  {/* View toggle */}
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-violet-100 text-violet-700'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Grid3X3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 transition-colors ${
                        viewMode === 'list'
                          ? 'bg-violet-100 text-violet-700'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Upload button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isAtRoot && !currentAccountId}
                    className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                    title={isAtRoot && !selectedAccountId ? 'Auto-pick best account' : undefined}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {isAtRoot && !selectedAccountId ? 'Auto Upload' : 'Upload'}
                  </Button>

                  {/* New folder */}
                  {!isAtRoot && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewFolder(!showNewFolder)}
                      className="border-slate-200"
                    >
                      <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                      <span className="hidden sm:inline">New Folder</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* New folder input */}
              {showNewFolder && (
                <div className="flex items-center gap-2 p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 animate-in slide-in-from-top-2 duration-200">
                  <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <Input
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') {
                        setShowNewFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    autoFocus
                    className="flex-1 h-8 text-sm bg-white"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateFolder}
                    disabled={creatingFolder || !newFolderName.trim()}
                  >
                    {creatingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewFolder(false);
                      setNewFolderName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* File Browser Area with Drag & Drop */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                  relative min-h-[400px] rounded-2xl border bg-white transition-all duration-200
                  ${isDragOver
                    ? 'border-violet-300 ring-2 ring-violet-200/50 shadow-lg shadow-violet-100/50'
                    : 'border-slate-200/60 shadow-sm'
                  }
                `}
              >
                {/* Drag overlay */}
                {isDragOver && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-violet-50/90 backdrop-blur-sm rounded-2xl pointer-events-none animate-in fade-in duration-200">
                    <div className="p-4 rounded-2xl bg-white shadow-lg border border-violet-200">
                      <Upload className="h-10 w-10 text-violet-500 mx-auto mb-3" />
                      <p className="text-lg font-semibold text-violet-700 text-center">Drop files here</p>
                      <p className="text-sm text-slate-500 text-center mt-1">
                        {isAtRoot && !selectedAccountId
                          ? 'Auto-pick best account'
                          : `Upload to ${breadcrumbs[breadcrumbs.length - 1]?.label || 'current folder'}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {error && !loading && (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="p-3 rounded-2xl bg-red-50 mb-4">
                      <AlertCircle className="h-8 w-8 text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">Something went wrong</h3>
                    <p className="text-sm text-slate-500 text-center max-w-sm mb-4">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => fetchFiles(currentPath)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </div>
                )}

                {/* Loading state */}
                {loading && !error && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-7 w-7 animate-spin text-violet-500 mb-3" />
                    <p className="text-sm text-slate-400">Loading files...</p>
                  </div>
                )}

                {/* Empty state - no accounts */}
                {!loading && !error && sortedFiles.length === 0 && isAtRoot && !searchQuery && accounts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="p-4 rounded-2xl bg-slate-100 mb-4">
                      <Cloud className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">No Storage Connected</h3>
                    <p className="text-sm text-slate-500 text-center max-w-sm mb-5">
                      Connect your first cloud storage provider to start managing files from one place.
                    </p>
                    <Button onClick={() => router.push('/providers')} className="bg-violet-600 hover:bg-violet-700 text-white">
                      <Cloud className="h-4 w-4 mr-1.5" />
                      Connect Provider
                    </Button>
                  </div>
                )}

                {/* Empty state - empty folder */}
                {!loading && !error && sortedFiles.length === 0 && !isAtRoot && !searchQuery && (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="p-4 rounded-2xl bg-slate-100 mb-4">
                      <Folder className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">Empty Folder</h3>
                    <p className="text-sm text-slate-500 text-center max-w-sm mb-5">
                      Upload files or create a new folder to get started.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Upload Files
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
                        <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                        New Folder
                      </Button>
                    </div>
                  </div>
                )}

                {/* No search results */}
                {!loading && !error && sortedFiles.length === 0 && searchQuery && (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="p-4 rounded-2xl bg-slate-100 mb-4">
                      <Search className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">No Results</h3>
                    <p className="text-sm text-slate-500">
                      No files matching &ldquo;{searchQuery}&rdquo;
                    </p>
                  </div>
                )}

                {/* ═══ File Grid ═══ */}
                {!loading && !error && sortedFiles.length > 0 && viewMode === 'grid' && (
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sortedFiles.map((file) => {
                        const color = getProviderColor(file.provider_type);
                        return (
                          <div
                            key={file.path}
                            className="group relative p-3 rounded-xl border border-slate-200/60 bg-white hover:border-slate-300 hover:shadow-md transition-all duration-200 cursor-pointer"
                            onClick={() => {
                              if (file.type === 'directory') navigateToFolder(file);
                              else handleDownload(file);
                            }}
                          >
                            {/* Hover Actions */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-150 flex gap-1 z-10">
                              {file.type === 'file' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(file);
                                  }}
                                  className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-violet-50 hover:border-violet-200 transition-colors shadow-sm"
                                  title="Download"
                                >
                                  {downloadingFile === file.path ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                                  ) : (
                                    <Download className="h-3 w-3 text-slate-600" />
                                  )}
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(file);
                                }}
                                className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm"
                                title="Delete"
                              >
                                {deletingFile === file.path ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-red-500" />
                                ) : (
                                  <Trash2 className="h-3 w-3 text-slate-600" />
                                )}
                              </button>
                            </div>

                            {/* Icon */}
                            <div className="flex justify-center mb-3 pt-1">
                              {getFileIcon(file, true)}
                            </div>

                            {/* Name */}
                            <p className="text-xs font-medium text-slate-900 text-center truncate mb-1" title={file.name}>
                              {file.name}
                            </p>

                            {/* Size */}
                            <p className="text-[10px] text-slate-400 text-center">
                              {file.type === 'directory' ? 'Folder' : formatBytes(file.size)}
                            </p>

                            {/* Provider badge */}
                            {file.account_label && (
                              <div className="flex justify-center mt-2">
                                <span
                                  className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (file.account_id) handleAccountClick(file.account_id);
                                  }}
                                >
                                  {file.provider_type}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ═══ File List ═══ */}
                {!loading && !error && sortedFiles.length > 0 && viewMode === 'list' && (
                  <div className="divide-y divide-slate-100">
                    {/* Header */}
                    <div className="hidden sm:grid grid-cols-[1fr_120px_120px_80px_80px] gap-4 px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <div>Name</div>
                      <div>Provider</div>
                      <div>Modified</div>
                      <div className="text-right">Size</div>
                      <div className="text-right">Actions</div>
                    </div>

                    {sortedFiles.map((file) => {
                      const color = getProviderColor(file.provider_type);
                      return (
                        <div
                          key={file.path}
                          className="group grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_80px_80px] gap-2 sm:gap-4 px-5 py-3 hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => {
                            if (file.type === 'directory') navigateToFolder(file);
                            else handleDownload(file);
                          }}
                        >
                          {/* Name */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0">{getFileIcon(file, false)}</div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                              {/* Mobile meta */}
                              <div className="flex items-center gap-2 sm:hidden mt-0.5">
                                <span className="text-xs text-slate-400">
                                  {file.type === 'directory' ? 'Folder' : formatBytes(file.size)}
                                </span>
                                {file.account_label && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
                                    {file.account_label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Provider badge */}
                          <div className="hidden sm:flex items-center">
                            {file.account_label && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (file.account_id) handleAccountClick(file.account_id);
                                }}
                                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:shadow-sm ${color.bg} ${color.text} ${color.border}`}
                              >
                                <div className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                                <span className="truncate max-w-[80px]">{file.account_label}</span>
                              </button>
                            )}
                          </div>

                          {/* Modified */}
                          <div className="hidden sm:flex items-center text-xs text-slate-400">
                            {file.modified ? formatDate(file.modified) : '—'}
                          </div>

                          {/* Size */}
                          <div className="hidden sm:flex items-center justify-end text-xs text-slate-400">
                            {file.type === 'directory' ? '—' : formatBytes(file.size)}
                          </div>

                          {/* Actions */}
                          <div className="hidden sm:flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.type === 'file' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(file);
                                }}
                                className="p-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                                title="Download"
                              >
                                {downloadingFile === file.path ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 text-slate-500" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(file);
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              {deletingFile === file.path ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                              )}
                            </button>
                          </div>

                          {/* Mobile actions */}
                          <div className="flex items-center gap-1 sm:hidden">
                            {file.type === 'file' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                                className="p-1.5 rounded-lg hover:bg-violet-50"
                              >
                                <Download className="h-3.5 w-3.5 text-slate-500" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                              className="p-1.5 rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status bar */}
              {!loading && !error && sortedFiles.length > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>
                    {sortedFiles.filter((f) => f.type === 'directory').length} folders,&nbsp;
                    {sortedFiles.filter((f) => f.type === 'file').length} files
                  </span>
                  <span>
                    {formatBytes(
                      sortedFiles
                        .filter((f) => f.type === 'file')
                        .reduce((acc, f) => acc + (f.size || 0), 0)
                    )}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ═══ SECTION 3: Upload Panel ═══ */}
          {uploads.length > 0 && (
            <div className="fixed bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] z-50 animate-in slide-in-from-bottom-4 duration-300">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setUploadPanelExpanded(!uploadPanelExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-50 to-sky-50 hover:from-violet-100 hover:to-sky-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-violet-100">
                      <Zap className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {activeUploads.length > 0
                        ? `${activeUploads.length} uploading`
                        : completedUploads.length > 0
                        ? `${completedUploads.length} completed`
                        : 'Uploads'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeUploads.length > 0 && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                    )}
                    {uploadPanelExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Upload items */}
                {uploadPanelExpanded && (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {uploads.map((upload) => {
                      const percent = upload.total_size > 0
                        ? Math.round((upload.uploaded_bytes / upload.total_size) * 100)
                        : 0;
                      const speedStr = upload.speed ? `${formatBytes(upload.speed)}/s` : '';

                      return (
                        <div key={upload.upload_id || upload.filename} className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {upload.status === 'complete' ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                              ) : upload.status === 'error' ? (
                                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              ) : upload.status === 'paused' ? (
                                <MoreVertical className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              ) : (
                                <Loader2 className="h-4 w-4 animate-spin text-violet-500 flex-shrink-0" />
                              )}
                              <span className="text-sm font-medium text-slate-900 truncate">
                                {upload.filename}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {speedStr && upload.status === 'uploading' && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {speedStr}
                                </span>
                              )}
                              {(upload.status === 'uploading' || upload.status === 'error' || upload.status === 'paused') &&
                                upload.upload_id && (
                                  <button
                                    onClick={() => cancelUpload(upload.upload_id)}
                                    className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${
                                upload.status === 'complete'
                                  ? 'bg-emerald-500'
                                  : upload.status === 'error'
                                  ? 'bg-red-500'
                                  : upload.status === 'finalizing'
                                  ? 'bg-violet-400 animate-pulse'
                                  : upload.status === 'paused'
                                  ? 'bg-slate-400'
                                  : 'bg-gradient-to-r from-violet-500 to-blue-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          {/* Details */}
                          <div className="flex justify-between mt-1.5">
                            <span className="text-[10px] text-slate-400">
                              {upload.status === 'finalizing'
                                ? 'Finalizing...'
                                : upload.status === 'complete'
                                ? 'Complete'
                                : upload.status === 'error'
                                ? upload.error || 'Error'
                                : upload.status === 'paused'
                                ? 'Paused'
                                : `Chunk ${upload.completed_chunks}/${upload.total_chunks}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">
                                {formatBytes(upload.uploaded_bytes)} / {formatBytes(upload.total_size)}
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                {percent}%
                              </span>
                            </div>
                          </div>

                          {/* Auto-pick info */}
                          {upload.auto_picked && upload.account_label && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <Zap className="h-3 w-3 text-violet-500 flex-shrink-0" />
                              <span className="text-[10px] text-violet-600 font-medium truncate">
                                Auto → {upload.account_label}
                                {upload.strategy_used && (
                                  <span className="text-violet-400 font-normal"> via {upload.strategy_used.replace(/_/g, ' ')}</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
