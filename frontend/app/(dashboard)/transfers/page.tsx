'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  ArrowRightLeft,
  Upload,
  Download,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Pause,
  X,
  Zap,
  Activity,
  TrendingUp,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  FileCode,
  Cloud,
  HardDrive,
  Database,
  Timer,
  Gauge,
  ChevronDown,
  ChevronUp,
  Files,
  ArrowUpFromLine,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TransferLog {
  id: string;
  file_id?: string;
  user_id: string;
  account_id?: string;
  operation: string;
  status: string;
  bytes_transferred: number;
  total_bytes?: number;
  file_name?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  speed?: number;
  account_label?: string;
  provider_type?: string;
}

interface ActiveUpload {
  upload_id: string;
  filename: string;
  total_size: number;
  uploaded_bytes: number;
  total_chunks: number;
  completed_chunks: number;
  status: 'uploading' | 'finalizing' | 'complete' | 'error' | 'paused' | 'restarting';
  error?: string;
  speed?: number;
  started_at?: string;
  account_label?: string;
  provider_type?: string;
  account_id?: string;
}

interface StorageAccount {
  id: string;
  label: string;
  provider_type: string;
  provider_display_name: string;
}

// ─── Provider Config ─────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string; dot: string }> = {
  gdrive: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', gradient: 'from-blue-500 via-green-500 to-yellow-500', dot: 'bg-blue-500' },
  mega: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', gradient: 'from-red-500 to-red-600', dot: 'bg-red-500' },
  onedrive: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', gradient: 'from-sky-400 to-sky-600', dot: 'bg-sky-500' },
  dropbox: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', gradient: 'from-indigo-400 to-indigo-600', dot: 'bg-indigo-500' },
  s3: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', gradient: 'from-orange-400 to-orange-600', dot: 'bg-orange-500' },
  r2: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', gradient: 'from-amber-400 to-orange-500', dot: 'bg-amber-500' },
  b2: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', gradient: 'from-rose-400 to-rose-600', dot: 'bg-rose-500' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', gradient: 'from-gray-400 to-gray-600', dot: 'bg-gray-500' };

function getProviderColor(providerType?: string) {
  return PROVIDER_COLORS[providerType || ''] || DEFAULT_COLOR;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return formatBytes(bytesPerSec) + '/s';
}

function formatETA(remainingBytes: number, speed: number): string {
  if (!speed || speed <= 0 || !remainingBytes || remainingBytes <= 0) return '';
  const seconds = Math.round(remainingBytes / speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
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

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getFileIcon(filename: string, large = false) {
  const size = large ? 'h-8 w-8' : 'h-5 w-5';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
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

function getProviderIcon(providerType?: string) {
  const color = getProviderColor(providerType);
  const iconClass = 'h-3.5 w-3.5';
  switch (providerType) {
    case 'gdrive':
    case 'mega':
    case 'dropbox':
    case 'onedrive':
      return (
        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${color.gradient} text-white`}>
          <Cloud className={iconClass} />
        </div>
      );
    case 's3':
    case 'r2':
    case 'b2':
      return (
        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${color.gradient} text-white`}>
          <Database className={iconClass} />
        </div>
      );
    default:
      return (
        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${color.gradient} text-white`}>
          <HardDrive className={iconClass} />
        </div>
      );
  }
}

function getOperationIcon(op: string) {
  switch (op) {
    case 'upload': return <Upload className="h-4 w-4 text-blue-500" />;
    case 'download': return <Download className="h-4 w-4 text-green-500" />;
    case 'delete': return <Trash2 className="h-4 w-4 text-red-500" />;
    case 'move': return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
    default: return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, retryCount, maxRetries }: { status: string; retryCount?: number; maxRetries?: number }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold';

  switch (status) {
    case 'uploading':
      return (
        <span className={`${base} bg-blue-100 text-blue-700`}>
          <ArrowUpFromLine className="h-3 w-3" />
          Uploading
        </span>
      );
    case 'finalizing':
      return (
        <span className={`${base} bg-violet-100 text-violet-700 animate-pulse`}>
          <Zap className="h-3 w-3" />
          Finalizing
        </span>
      );
    case 'complete':
    case 'completed':
    case 'success':
      return (
        <span className={`${base} bg-emerald-100 text-emerald-700`}>
          <CheckCircle2 className="h-3 w-3" />
          Complete
        </span>
      );
    case 'error':
    case 'failed':
      return (
        <span className={`${base} bg-red-100 text-red-700`}>
          <XCircle className="h-3 w-3" />
          {retryCount && maxRetries && retryCount < maxRetries
            ? `Retry ${retryCount}/${maxRetries}`
            : 'Failed'}
        </span>
      );
    case 'paused':
      return (
        <span className={`${base} bg-slate-100 text-slate-600`}>
          <Pause className="h-3 w-3" />
          Paused
        </span>
      );
    case 'restarting':
      return (
        <span className={`${base} bg-amber-100 text-amber-700`}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          Restarting
        </span>
      );
    case 'in_progress':
      return (
        <span className={`${base} bg-blue-100 text-blue-700`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          In Progress
        </span>
      );
    case 'retrying':
      return (
        <span className={`${base} bg-orange-100 text-orange-700`}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          Retrying
        </span>
      );
    case 'pending':
      return (
        <span className={`${base} bg-yellow-100 text-yellow-700`}>
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-100 text-slate-600`}>
          {status}
        </span>
      );
  }
}

// ─── Transfer Card ───────────────────────────────────────────────────────────

function TransferCard({
  transfer,
  type,
  onCancel,
  onRetry,
  fading,
}: {
  transfer: TransferLog | ActiveUpload;
  type: 'active' | 'completed' | 'failed';
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  fading?: boolean;
}) {
  const isLog = 'operation' in transfer;
  const filename = isLog
    ? (transfer as TransferLog).file_name || 'Unknown file'
    : (transfer as ActiveUpload).filename;

  const status = isLog ? (transfer as TransferLog).status : (transfer as ActiveUpload).status;
  const totalSize = isLog
    ? ((transfer as TransferLog).total_bytes || (transfer as TransferLog).bytes_transferred)
    : (transfer as ActiveUpload).total_size;
  const uploadedBytes = isLog
    ? (transfer as TransferLog).bytes_transferred
    : (transfer as ActiveUpload).uploaded_bytes;
  const speed = isLog ? (transfer as TransferLog).speed : (transfer as ActiveUpload).speed;
  const accountLabel = isLog
    ? (transfer as TransferLog).account_label
    : (transfer as ActiveUpload).account_label;
  const providerType = isLog
    ? (transfer as TransferLog).provider_type
    : (transfer as ActiveUpload).provider_type;
  const errorMessage = isLog ? (transfer as TransferLog).error_message : (transfer as ActiveUpload).error;
  const retryCount = isLog ? (transfer as TransferLog).retry_count : 0;
  const maxRetries = isLog ? (transfer as TransferLog).max_retries : 0;

  const percent = totalSize > 0 ? Math.min(Math.round((uploadedBytes / totalSize) * 100), 100) : 0;
  const remainingBytes = totalSize - uploadedBytes;
  const eta = formatETA(remainingBytes, speed || 0);
  const isActive = status === 'uploading' || status === 'finalizing' || status === 'restarting';
  const isComplete = status === 'complete' || status === 'completed' || status === 'success';
  const isFailed = status === 'error' || status === 'failed';
  const uploadId = 'upload_id' in transfer ? (transfer as ActiveUpload).upload_id : '';
  const transferId = 'id' in transfer ? (transfer as TransferLog).id : '';
  const id = uploadId || transferId;

  const progressColor = isComplete
    ? 'bg-emerald-500'
    : isFailed
    ? 'bg-red-500'
    : status === 'finalizing'
    ? 'bg-gradient-to-r from-violet-500 to-blue-500'
    : status === 'restarting'
    ? 'bg-amber-400'
    : status === 'paused'
    ? 'bg-slate-400'
    : 'bg-gradient-to-r from-violet-500 to-blue-500';

  const borderColor = type === 'active'
    ? 'border-blue-200/60'
    : type === 'failed'
    ? 'border-red-200/60'
    : 'border-emerald-200/60';

  const bgColor = type === 'active'
    ? 'bg-blue-50/20'
    : type === 'failed'
    ? 'bg-red-50/20'
    : 'bg-white';

  return (
    <div
      className={`
        group relative rounded-xl border ${borderColor} ${bgColor} bg-white shadow-sm
        hover:shadow-md transition-all duration-300
        ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      <div className="p-4">
        {/* Top row: icon, name, status badge, actions */}
        <div className="flex items-start gap-3 mb-3">
          {/* File icon */}
          <div className="flex-shrink-0 p-2 rounded-xl bg-slate-50 border border-slate-100">
            {getFileIcon(filename, true)}
          </div>

          {/* Name and destination */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate" title={filename}>
              {filename}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {accountLabel && (
                <div className="flex items-center gap-1.5">
                  {getProviderIcon(providerType)}
                  <span className="text-xs text-slate-500 truncate max-w-[120px]">
                    {accountLabel}
                  </span>
                </div>
              )}
              {isLog && (
                <div className="flex items-center gap-1.5">
                  {getOperationIcon((transfer as TransferLog).operation)}
                  <span className="text-xs text-slate-400 capitalize">
                    {(transfer as TransferLog).operation}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Status + Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={status} retryCount={retryCount} maxRetries={maxRetries} />
            {(isActive || status === 'paused') && uploadId && onCancel && (
              <button
                onClick={() => onCancel(uploadId)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                title="Cancel upload"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {isFailed && onRetry && (
              <button
                onClick={() => onRetry(transferId || uploadId)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                title="Retry upload"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {(isActive || isComplete || status === 'paused' || status === 'restarting') && (
          <div className="mb-2.5">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden relative">
              <div
                className={`h-full rounded-full relative overflow-hidden transition-all duration-300 ease-out ${progressColor}`}
                style={{ width: `${Math.max(percent, 2)}%` }}
              >
                {status === 'uploading' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.5s_infinite]" />
                )}
                {status === 'finalizing' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1s_infinite]" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Details row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {/* Size */}
            <span className="font-mono">
              {isComplete
                ? formatBytes(totalSize)
                : `${formatBytes(uploadedBytes)} / ${formatBytes(totalSize)}`}
            </span>

            {/* Percentage */}
            {!isFailed && (
              <span className={`font-semibold ${
                isComplete ? 'text-emerald-600' : status === 'finalizing' ? 'text-violet-600' : 'text-slate-500'
              }`}>
                {percent}%
              </span>
            )}

            {/* Speed */}
            {speed && isActive && (
              <span className="flex items-center gap-0.5 text-blue-500 font-mono">
                <Gauge className="h-3 w-3" />
                {formatSpeed(speed)}
              </span>
            )}

            {/* ETA */}
            {eta && isActive && status === 'uploading' && (
              <span className="flex items-center gap-0.5 text-slate-400">
                <Timer className="h-3 w-3" />
                {eta}
              </span>
            )}
          </div>

          {/* Right side details */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {status === 'finalizing' && (
              <span className="text-violet-500 font-medium animate-pulse">✨ Merging chunks...</span>
            )}
            {status === 'restarting' && (
              <span className="text-amber-600 font-medium">{errorMessage || 'Restarting...'}</span>
            )}
            {isFailed && errorMessage && (
              <span className="text-red-500 truncate max-w-[200px]" title={errorMessage}>
                {errorMessage}
              </span>
            )}
            {isLog && (transfer as TransferLog).created_at && (
              <span>{formatDate((transfer as TransferLog).created_at)}</span>
            )}
            {isComplete && (
              <span className="text-emerald-500">✓ Done</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full ${accent} opacity-10`} />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  icon,
  color,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-left group"
    >
      <div className={`p-1.5 rounded-lg ${color}`}>
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
        {count}
      </span>
      <div className="flex-1 border-b border-dashed border-slate-200 mx-2" />
      {collapsed ? (
        <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
      ) : (
        <ChevronUp className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
      )}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TransfersPage() {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [transferLogs, setTransferLogs] = useState<TransferLog[]>([]);
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollingActive, setPollingActive] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [completedTimestamps, setCompletedTimestamps] = useState<Record<string, number>>({});
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchActiveUploads = useCallback(async () => {
    try {
      const res = await apiClient.get('/vfs/uploads/active');
      const data = res.data;
      setActiveUploads(Array.isArray(data) ? data : data.uploads || []);
    } catch {
      // Endpoint may not exist — that's fine
      setActiveUploads([]);
    }
  }, []);

  const fetchTransferLogs = useCallback(async () => {
    try {
      const res = await apiClient.get('/transfer-logs', { params: { limit: 50, offset: 0 } });
      const data = res.data;
      const logs = (Array.isArray(data) ? data : data.logs || []) as TransferLog[];
      setTransferLogs(logs);
    } catch {
      setTransferLogs([]);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiClient.get('/storage-accounts');
      const data = Array.isArray(res.data) ? res.data : res.data.accounts || [];
      setAccounts(data);
    } catch {
      // silent
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchActiveUploads(), fetchTransferLogs()]);
    setLoading(false);
  }, [fetchActiveUploads, fetchTransferLogs]);

  // ─── Enrich logs with account info ────────────────────────────────────────

  const enrichedLogs = useMemo(() => {
    return transferLogs.map((log) => {
      if (log.account_label) return log;
      const account = accounts.find((a) => a.id === log.account_id);
      if (account) {
        return {
          ...log,
          account_label: account.label,
          provider_type: account.provider_type,
        };
      }
      return log;
    });
  }, [transferLogs, accounts]);

  // ─── Group transfers ──────────────────────────────────────────────────────

  const { active, completed, failed } = useMemo(() => {
    const activeStatuses = new Set(['uploading', 'finalizing', 'restarting', 'in_progress', 'retrying', 'pending']);
    const completedStatuses = new Set(['complete', 'completed', 'success']);
    const failedStatuses = new Set(['error', 'failed']);

    // Active uploads from the active endpoint
    const activeItems: (ActiveUpload | TransferLog)[] = [...activeUploads];

    // Also include in_progress logs that don't overlap with active uploads
    for (const log of enrichedLogs) {
      if (activeStatuses.has(log.status)) {
        const alreadyActive = activeUploads.some(
          (u) => u.filename === log.file_name && u.upload_id === log.file_id
        );
        if (!alreadyActive) {
          activeItems.push(log);
        }
      }
    }

    const completedItems: TransferLog[] = [];
    const failedItems: TransferLog[] = [];

    for (const log of enrichedLogs) {
      if (completedStatuses.has(log.status)) {
        // Skip if it's also in active (shouldn't happen but safety)
        const inActive = activeUploads.some(
          (u) => u.filename === log.file_name
        );
        if (!inActive) {
          completedItems.push(log);
        }
      } else if (failedStatuses.has(log.status)) {
        failedItems.push(log);
      }
    }

    return {
      active: activeItems,
      completed: completedItems,
      failed: failedItems,
    };
  }, [activeUploads, enrichedLogs]);

  // ─── Summary Stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const activeCount = active.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCompleted = completed.filter((log) => {
      const d = new Date(log.created_at);
      return d >= today;
    });

    const completedCount = todayCompleted.length;

    const totalDataToday = todayCompleted.reduce(
      (sum, log) => sum + (log.bytes_transferred || 0),
      0
    );

    // Average speed from active uploads
    const activeSpeeds = activeUploads
      .filter((u) => u.speed && u.speed > 0)
      .map((u) => u.speed!);
    const avgSpeed = activeSpeeds.length > 0
      ? activeSpeeds.reduce((a, b) => a + b, 0) / activeSpeeds.length
      : 0;

    return {
      activeCount,
      completedCount,
      totalDataToday,
      avgSpeed,
    };
  }, [active, completed, activeUploads]);

  // ─── Auto-fade completed transfers after 30 seconds ───────────────────────

  useEffect(() => {
    // Track when items become completed
    for (const log of completed) {
      const key = log.id || (log as unknown as { upload_id: string }).upload_id || log.file_name || '';
      if (key && !completedTimestamps[key]) {
        setCompletedTimestamps((prev) => ({ ...prev, [key]: Date.now() }));
      }
    }
  }, [completed]);

  useEffect(() => {
    fadeTimerRef.current = setInterval(() => {
      const now = Date.now();
      const newFading = new Set<string>();

      for (const [key, timestamp] of Object.entries(completedTimestamps)) {
        if (now - timestamp > 30000) {
          newFading.add(key);
        }
      }

      setFadingIds(newFading);
    }, 1000);

    return () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    };
  }, [completedTimestamps]);

  // ─── Polling ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    fetchAccounts();
    fetchAll();

    pollRef.current = setInterval(() => {
      if (pollingActive) {
        fetchActiveUploads();
        fetchTransferLogs();
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, pollingActive, fetchAll, fetchActiveUploads, fetchTransferLogs, router]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleCancelUpload = async (uploadId: string) => {
    try {
      await apiClient.delete(`/vfs/upload/${uploadId}`);
      setActiveUploads((prev) => prev.filter((u) => u.upload_id !== uploadId));
    } catch {
      // silent
    }
  };

  const handleRetry = async (transferId: string) => {
    try {
      await apiClient.post('/transfer-logs/retry', { transfer_id: transferId });
      fetchAll();
    } catch {
      // silent
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchAccounts();
    fetchAll();
  };

  // ─── Check if truly empty ─────────────────────────────────────────────────

  const hasAnyTransfers = active.length > 0 || completed.length > 0 || failed.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-[1200px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ═══ Header ═══ */}
          <section className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-200/50">
                    <ArrowRightLeft className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Transfers</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Monitor uploads, downloads, and file operations</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Polling toggle */}
                <button
                  onClick={() => setPollingActive(!pollingActive)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${pollingActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200'
                    }
                  `}
                >
                  <Activity className={`h-3 w-3 ${pollingActive ? 'animate-pulse' : ''}`} />
                  {pollingActive ? 'Live' : 'Paused'}
                </button>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          {/* ═══ Summary Stats ═══ */}
          {hasAnyTransfers && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <StatCard
                icon={<Upload className="h-4 w-4 text-blue-500" />}
                label="Active Transfers"
                value={String(stats.activeCount)}
                accent="bg-blue-500"
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                label="Completed Today"
                value={String(stats.completedCount)}
                accent="bg-emerald-500"
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4 text-violet-500" />}
                label="Data Transferred"
                value={formatBytes(stats.totalDataToday)}
                accent="bg-violet-500"
              />
              <StatCard
                icon={<Gauge className="h-4 w-4 text-sky-500" />}
                label="Avg Speed"
                value={stats.avgSpeed > 0 ? formatSpeed(stats.avgSpeed) : '—'}
                accent="bg-sky-500"
              />
            </section>
          )}

          {/* ═══ Loading ═══ */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-violet-500 mb-3" />
              <p className="text-sm text-slate-400">Loading transfers...</p>
            </div>
          )}

          {/* ═══ Empty State ═══ */}
          {!loading && !hasAnyTransfers && (
            <div className="flex flex-col items-center justify-center py-20 px-4 animate-in fade-in duration-500">
              <div className="relative mb-6">
                <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 shadow-inner">
                  <ArrowRightLeft className="h-12 w-12 text-slate-300" />
                </div>
                <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-white border border-slate-200 shadow-sm">
                  <Clock className="h-4 w-4 text-slate-400" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No Transfers Yet</h3>
              <p className="text-sm text-slate-500 text-center max-w-sm mb-6">
                Upload or download files to see your transfer activity here. Active transfers will appear in real-time.
              </p>
              <Button
                onClick={() => router.push('/files')}
                className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
              >
                <Files className="h-4 w-4 mr-2" />
                Go to Files
              </Button>
            </div>
          )}

          {/* ═══ Active Transfers ═══ */}
          {!loading && active.length > 0 && (
            <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <SectionHeader
                title="Active"
                count={active.length}
                icon={<Upload className="h-3.5 w-3.5 text-blue-600" />}
                color="bg-blue-100"
                collapsed={!!collapsedSections['active']}
                onToggle={() => toggleSection('active')}
              />
              {!collapsedSections['active'] && (
                <div className="space-y-2">
                  {active.map((transfer) => {
                    const key = 'upload_id' in transfer
                      ? (transfer as ActiveUpload).upload_id
                      : (transfer as TransferLog).id;
                    return (
                      <TransferCard
                        key={key || Math.random().toString()}
                        transfer={transfer}
                        type="active"
                        onCancel={handleCancelUpload}
                        onRetry={handleRetry}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ═══ Completed Transfers ═══ */}
          {!loading && completed.length > 0 && (
            <section className="space-y-3 animate-in fade-in duration-500">
              <SectionHeader
                title="Completed"
                count={completed.length}
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                color="bg-emerald-100"
                collapsed={!!collapsedSections['completed']}
                onToggle={() => toggleSection('completed')}
              />
              {!collapsedSections['completed'] && (
                <div className="space-y-2">
                  {completed.map((transfer) => {
                    const key = transfer.id || transfer.file_name || Math.random().toString();
                    const isFading = fadingIds.has(key);
                    return (
                      <TransferCard
                        key={key}
                        transfer={transfer}
                        type="completed"
                        fading={isFading}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ═══ Failed Transfers ═══ */}
          {!loading && failed.length > 0 && (
            <section className="space-y-3 animate-in fade-in duration-500">
              <SectionHeader
                title="Failed"
                count={failed.length}
                icon={<XCircle className="h-3.5 w-3.5 text-red-600" />}
                color="bg-red-100"
                collapsed={!!collapsedSections['failed']}
                onToggle={() => toggleSection('failed')}
              />
              {!collapsedSections['failed'] && (
                <div className="space-y-2">
                  {failed.map((transfer) => (
                    <TransferCard
                      key={transfer.id || transfer.file_name || Math.random().toString()}
                      transfer={transfer}
                      type="failed"
                      onRetry={handleRetry}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
