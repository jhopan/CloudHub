'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

interface UploadProgress {
  filename: string;
  upload_id: string;
  total_size: number;
  uploaded_bytes: number;
  total_chunks: number;
  completed_chunks: number;
  status: 'uploading' | 'finalizing' | 'complete' | 'error' | 'paused';
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileIcon(file: VFSFile) {
  if (file.type === 'directory') {
    return <Folder className="h-5 w-5 text-amber-500" />;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <FileImage className="h-5 w-5 text-blue-500" />;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'].includes(ext)) {
    return <FileVideo className="h-5 w-5 text-purple-500" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
    return <FileAudio className="h-5 w-5 text-pink-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <FileArchive className="h-5 w-5 text-orange-500" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sh'].includes(ext)) {
    return <FileCode className="h-5 w-5 text-emerald-500" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'csv', 'xls', 'xlsx'].includes(ext)) {
    return <FileText className="h-5 w-5 text-sky-600" />;
  }
  return <File className="h-5 w-5 text-gray-500" />;
}

function getLargeFileIcon(file: VFSFile) {
  if (file.type === 'directory') {
    return <Folder className="h-10 w-10 text-amber-500" />;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <FileImage className="h-10 w-10 text-blue-500" />;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'].includes(ext)) {
    return <FileVideo className="h-10 w-10 text-purple-500" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
    return <FileAudio className="h-10 w-10 text-pink-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <FileArchive className="h-10 w-10 text-orange-500" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sh'].includes(ext)) {
    return <FileCode className="h-10 w-10 text-emerald-500" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'csv', 'xls', 'xlsx'].includes(ext)) {
    return <FileText className="h-10 w-10 text-sky-600" />;
  }
  return <File className="h-10 w-10 text-gray-500" />;
}

function getProviderIcon(providerType?: string) {
  switch (providerType) {
    case 'gdrive':
      return <Cloud className="h-4 w-4 text-blue-500" />;
    case 'mega':
      return <HardDrive className="h-4 w-4 text-red-500" />;
    case 'dropbox':
      return <Cloud className="h-4 w-4 text-blue-600" />;
    case 'onedrive':
      return <Cloud className="h-4 w-4 text-sky-500" />;
    case 's3':
      return <HardDrive className="h-4 w-4 text-orange-500" />;
    default:
      return <Cloud className="h-4 w-4 text-gray-500" />;
  }
}

function getProviderBadgeColor(providerType?: string): string {
  switch (providerType) {
    case 'gdrive':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'mega':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'dropbox':
      return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'onedrive':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 's3':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
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

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
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

  // Get the account_id from the current context (first file with account_id)
  const currentAccountId = useMemo(() => {
    if (isAtRoot) return null;
    const fileWithAccount = files.find((f) => f.account_id);
    return fileWithAccount?.account_id || null;
  }, [isAtRoot, files]);

  // Breadcrumbs from path
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'My Files', path: '/' }];
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

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.account_label?.toLowerCase().includes(q) ||
        f.provider_type?.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  // Sort: directories first, then alphabetical
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredFiles]);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchFiles = useCallback(
    async (path: string) => {
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
    },
    []
  );

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchFiles(currentPath);
  }, [user, currentPath, fetchFiles]);

  // ─── Navigation ──────────────────────────────────────────────────────────

  const navigateToPath = (path: string) => {
    setCurrentPath(path);
    setSearchQuery('');
  };

  const navigateToFolder = (file: VFSFile) => {
    if (file.type === 'directory') {
      navigateToPath(file.path);
    }
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
      alert('Download failed. Please try again.');
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
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Delete failed. Please try again.');
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
      // Build the remote path for the new folder
      // currentPath is like /AccountLabel/subfolder, remote path is /subfolder
      const pathParts = currentPath.split('/').filter(Boolean);
      // Remove the first part (account label) to get the remote path
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
      alert('Failed to create folder.');
    } finally {
      setCreatingFolder(false);
    }
  };

  // ─── Chunked Upload ──────────────────────────────────────────────────────

  const uploadFileChunked = async (file: File) => {
    if (!currentAccountId) {
      alert('Please navigate into an account folder before uploading.');
      return;
    }

    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    // Build remote path
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.shift(); // Remove account label
    const remotePath = '/' + pathParts.join('/');

    const uploadKey = `${Date.now()}-${file.name}`;
    const progress: UploadProgress = {
      filename: file.name,
      upload_id: '',
      total_size: totalSize,
      uploaded_bytes: 0,
      total_chunks: totalChunks,
      completed_chunks: 0,
      status: 'uploading',
    };

    setUploads((prev) => [...prev, { ...progress }]);

    const updateUpload = (updates: Partial<UploadProgress>) => {
      setUploads((prev) =>
        prev.map((u) => (u.filename === file.name && u.upload_id === progress.upload_id ? { ...u, ...updates } : u))
      );
    };

    try {
      // 1. Init upload
      const initRes = await apiClient.post('/vfs/upload/init', {
        account_id: currentAccountId,
        path: remotePath === '/' ? '/' : remotePath,
        filename: file.name,
        total_size: totalSize,
        chunk_size: CHUNK_SIZE,
      });

      const { upload_id, total_chunks, chunk_size: serverChunkSize } = initRes.data;
      progress.upload_id = upload_id;
      const effectiveChunkSize = serverChunkSize || CHUNK_SIZE;
      const effectiveTotalChunks = total_chunks || totalChunks;

      updateUpload({
        upload_id,
        total_chunks: effectiveTotalChunks,
      });

      // Create abort controller
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
              // Try to check status and resume
              try {
                const statusRes = await apiClient.get(`/vfs/upload/${upload_id}/status`);
                const { missing_chunks } = statusRes.data;
                if (missing_chunks && !missing_chunks.includes(i)) {
                  // Chunk was actually received
                  chunkUploaded = true;
                } else {
                  throw chunkErr;
                }
              } catch {
                throw chunkErr;
              }
            }
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
          }
        }

        uploadedBytes += end - start;
        updateUpload({
          uploaded_bytes: uploadedBytes,
          completed_chunks: i + 1,
        });
      }

      // 3. Finalize
      updateUpload({ status: 'finalizing' });
      await apiClient.post(`/vfs/upload/${upload_id}/finalize`);

      updateUpload({ status: 'complete', uploaded_bytes: totalSize });

      // Clean up
      abortControllerRef.current.delete(uploadKey);

      // Refresh file list
      fetchFiles(currentPath);

      // Auto-remove completed upload after 3 seconds
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.upload_id !== upload_id));
      }, 3000);
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
    if (isAtRoot) {
      alert('Please navigate into an account folder before uploading files.');
      return;
    }
    for (let i = 0; i < fileList.length; i++) {
      uploadFileChunked(fileList[i]);
    }
  };

  const cancelUpload = (uploadId: string) => {
    // Find the upload key for this upload_id
    const upload = uploads.find((u) => u.upload_id === uploadId);
    if (upload) {
      // Abort in-flight requests
      for (const [key, controller] of abortControllerRef.current.entries()) {
        if (key.includes(upload.filename)) {
          controller.abort();
          abortControllerRef.current.delete(key);
          break;
        }
      }

      // Cancel on server
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
    // Only set false if we're leaving the drop zone
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">My Files</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage files across all connected storage accounts
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Upload button */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAtRoot}
              title={isAtRoot ? 'Select an account folder first' : 'Upload files'}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Upload
            </Button>

            {/* New folder button - only inside account folders */}
            {!isAtRoot && (
              <Button
                variant="outline"
                onClick={() => setShowNewFolder(!showNewFolder)}
              >
                <FolderPlus className="h-4 w-4 mr-1.5" />
                New Folder
              </Button>
            )}

            {/* View toggle */}
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon-sm"
                onClick={() => setViewMode('list')}
                className="rounded-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon-sm"
                onClick={() => setViewMode('grid')}
                className="rounded-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>

            {/* Refresh */}
            <Button variant="outline" size="icon-sm" onClick={() => fetchFiles(currentPath)}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter files by name, account, or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.path} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                onClick={() => navigateToPath(crumb.path)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-accent ${
                  i === breadcrumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {i === 0 && <Home className="h-3.5 w-3.5" />}
                {crumb.label}
              </button>
            </div>
          ))}
        </nav>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg border">
            <Folder className="h-5 w-5 text-amber-500" />
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
              className="flex-1"
            />
            <Button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Create
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderName('');
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Upload progress bars */}
        {uploads.length > 0 && (
          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.upload_id || upload.filename}
                className="p-3 bg-card border rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {upload.status === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : upload.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{upload.filename}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {upload.status === 'finalizing'
                        ? 'Finalizing...'
                        : upload.status === 'complete'
                          ? 'Complete'
                          : upload.status === 'error'
                            ? 'Error'
                            : `${upload.completed_chunks}/${upload.total_chunks} chunks`}
                    </span>
                    {(upload.status === 'uploading' || upload.status === 'error') &&
                      upload.upload_id && (
                        <button
                          onClick={() => cancelUpload(upload.upload_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      upload.status === 'complete'
                        ? 'bg-green-500'
                        : upload.status === 'error'
                          ? 'bg-red-500'
                          : upload.status === 'finalizing'
                            ? 'bg-blue-400 animate-pulse'
                            : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${upload.total_size > 0 ? (upload.uploaded_bytes / upload.total_size) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(upload.uploaded_bytes)} / {formatBytes(upload.total_size)}
                  </span>
                  {upload.error && (
                    <span className="text-xs text-red-500">{upload.error}</span>
                  )}
                  {upload.total_size > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round((upload.uploaded_bytes / upload.total_size) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Main file browser area with drag & drop */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`relative min-h-[300px] transition-colors rounded-xl ${
            isDragOver
              ? 'ring-2 ring-primary ring-offset-2 bg-primary/5'
              : ''
          }`}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-xl pointer-events-none">
              <Upload className="h-12 w-12 text-primary mb-3" />
              <p className="text-lg font-medium text-primary">Drop files here to upload</p>
              <p className="text-sm text-muted-foreground">
                Files will be uploaded to {breadcrumbs[breadcrumbs.length - 1]?.label || 'current folder'}
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">{error}</p>
                <Button variant="outline" onClick={() => fetchFiles(currentPath)}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {loading && !error && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state - no accounts connected */}
          {!loading && !error && sortedFiles.length === 0 && isAtRoot && !searchQuery && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <Cloud className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Storage Accounts Connected</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                  Connect your first cloud storage provider to start browsing and managing files
                  from a single unified interface.
                </p>
                <Button onClick={() => router.push('/providers')}>
                  <Cloud className="h-4 w-4 mr-1.5" />
                  Connect Provider
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Empty state - empty folder */}
          {!loading &&
            !error &&
            sortedFiles.length === 0 &&
            !isAtRoot &&
            !searchQuery && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 bg-muted rounded-full mb-4">
                    <Folder className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">This folder is empty</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                    Upload files or create a new folder to get started.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Upload Files
                    </Button>
                    <Button variant="outline" onClick={() => setShowNewFolder(true)}>
                      <FolderPlus className="h-4 w-4 mr-1.5" />
                      New Folder
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* No search results */}
          {!loading && !error && sortedFiles.length === 0 && searchQuery && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                <p className="text-sm text-muted-foreground">
                  No files matching &quot;{searchQuery}&quot;
                </p>
              </CardContent>
            </Card>
          )}

          {/* File list/grid */}
          {!loading && !error && sortedFiles.length > 0 && (
            <>
              {/* Grid View */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sortedFiles.map((file) => (
                    <div
                      key={file.path}
                      className="group relative p-3 bg-card border rounded-xl hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                      onDoubleClick={() => navigateToFolder(file)}
                    >
                      {/* Actions overlay */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        {file.type === 'file' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file);
                            }}
                            className="p-1.5 bg-background border rounded-md hover:bg-accent transition-colors"
                            title="Download"
                          >
                            {downloadingFile === file.path ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        {file.type !== 'directory' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(file);
                            }}
                            className="p-1.5 bg-background border rounded-md hover:bg-destructive/10 transition-colors text-destructive"
                            title="Delete"
                          >
                            {deletingFile === file.path ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Icon */}
                      <div className="flex justify-center mb-3 mt-2">
                        {getLargeFileIcon(file)}
                      </div>

                      {/* Name */}
                      <p className="text-xs font-medium text-center truncate" title={file.name}>
                        {file.name}
                      </p>

                      {/* Meta */}
                      <p className="text-[10px] text-muted-foreground text-center mt-1">
                        {file.type === 'directory'
                          ? 'Folder'
                          : formatBytes(file.size)}
                      </p>

                      {/* Account badge for root level */}
                      {isAtRoot && file.account_label && (
                        <div className="flex justify-center mt-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${getProviderBadgeColor(file.provider_type)}`}
                          >
                            {getProviderIcon(file.provider_type)}
                            {file.account_label}
                          </span>
                        </div>
                      )}

                      {/* Account badge for non-root files */}
                      {!isAtRoot && file.account_label && (
                        <div className="flex justify-center mt-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${getProviderBadgeColor(file.provider_type)}`}
                          >
                            {getProviderIcon(file.provider_type)}
                            {file.account_label}
                          </span>
                        </div>
                      )}

                      {/* Click handler for navigation */}
                      {file.type === 'directory' && (
                        <button
                          onClick={() => navigateToFolder(file)}
                          className="absolute inset-0 z-0 rounded-xl"
                          aria-label={`Open ${file.name}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* List View */}
              {viewMode === 'list' && (
                <Card>
                  <CardContent className="p-0">
                    {/* Table header */}
                    <div className="hidden sm:grid grid-cols-[1fr_120px_140px_100px] gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div>Name</div>
                      <div>Account</div>
                      <div>Modified</div>
                      <div className="text-right">Size</div>
                    </div>

                    <div className="divide-y">
                      {sortedFiles.map((file) => (
                        <div
                          key={file.path}
                          className="group flex flex-col sm:grid sm:grid-cols-[1fr_120px_140px_100px] gap-2 sm:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
                        >
                          {/* Name + icon */}
                          <div
                            className="flex items-center gap-3 min-w-0 cursor-pointer"
                            onClick={() => navigateToFolder(file)}
                          >
                            <div className="shrink-0">{getFileIcon(file)}</div>
                            <div className="min-w-0">
                              <p className="font-medium truncate text-sm">{file.name}</p>
                              {/* Mobile meta */}
                              <div className="flex items-center gap-2 sm:hidden mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {file.type === 'directory' ? 'Folder' : formatBytes(file.size)}
                                </span>
                                {file.account_label && (
                                  <span
                                    className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border ${getProviderBadgeColor(file.provider_type)}`}
                                  >
                                    {file.account_label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Account badge (desktop) */}
                          <div className="hidden sm:flex items-center">
                            {file.account_label && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${getProviderBadgeColor(file.provider_type)}`}
                              >
                                {getProviderIcon(file.provider_type)}
                                <span className="truncate max-w-[90px]">{file.account_label}</span>
                              </span>
                            )}
                          </div>

                          {/* Modified date */}
                          <div className="hidden sm:flex items-center text-xs text-muted-foreground">
                            {file.modified ? formatDate(file.modified) : '—'}
                          </div>

                          {/* Size + actions */}
                          <div className="hidden sm:flex items-center justify-end gap-1">
                            <span className="text-xs text-muted-foreground mr-2">
                              {file.type === 'directory' ? '—' : formatBytes(file.size)}
                            </span>

                            {/* Action buttons */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {file.type === 'file' && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleDownload(file)}
                                  disabled={downloadingFile === file.path}
                                  title="Download"
                                >
                                  {downloadingFile === file.path ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleDelete(file)}
                                disabled={deletingFile === file.path}
                                className="text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                {deletingFile === file.path ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Mobile action row */}
                          <div className="flex items-center gap-1 sm:hidden">
                            {file.type === 'file' && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleDownload(file)}
                                disabled={downloadingFile === file.path}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDelete(file)}
                              disabled={deletingFile === file.path}
                              className="text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Status bar */}
        {!loading && !error && sortedFiles.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              {sortedFiles.filter((f) => f.type === 'directory').length} folders,{' '}
              {sortedFiles.filter((f) => f.type === 'file').length} files
            </span>
            <span>
              Total:{' '}
              {formatBytes(
                sortedFiles
                  .filter((f) => f.type === 'file')
                  .reduce((acc, f) => acc + (f.size || 0), 0)
              )}
            </span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
