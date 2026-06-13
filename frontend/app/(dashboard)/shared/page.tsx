'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  Download,
  FileText,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SharedLink {
  id: string;
  user_id: string;
  token: string;
  file_name: string;
  file_size: number;
  account_id: string | null;
  remote_path: string;
  max_downloads: number;
  download_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  share_url: string;
}

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

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor(diff / 60000);
  return `${minutes}m left`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SharedLinksPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [links, setLinks] = useState<SharedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/shared-links');
      const data = Array.isArray(res.data) ? res.data : [];
      setLinks(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Failed to load shared links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchLinks();
  }, [user, fetchLinks, router]);

  const handleCopy = async (link: SharedLink) => {
    try {
      await navigator.clipboard.writeText(link.share_url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link.share_url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async (link: SharedLink) => {
    const confirmed = window.confirm(`Delete share link for "${link.file_name}"?`);
    if (!confirmed) return;

    setDeletingId(link.id);
    try {
      await apiClient.delete(`/shared-links/${link.id}`);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (link: SharedLink) => {
    if (!link.is_active) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          <XCircle className="h-3 w-3" />
          Revoked
        </span>
      );
    }
    if (isExpired(link.expires_at)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-600 border border-red-200">
          <Clock className="h-3 w-3" />
          Expired
        </span>
      );
    }
    if (link.max_downloads > 0 && link.download_count >= link.max_downloads) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          <Download className="h-3 w-3" />
          Limit reached
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
        <Shield className="h-3 w-3" />
        Active
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Shared Links</h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage your file sharing links
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLinks}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {loading && links.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500 mb-3" />
              <p className="text-sm text-slate-400">Loading shared links...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && links.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="p-4 rounded-2xl bg-slate-100 mb-4">
                <Link2 className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">No Shared Links</h3>
              <p className="text-sm text-slate-500 text-center max-w-sm mb-5">
                You haven&apos;t created any share links yet. Go to your files and click the share button to create one.
              </p>
              <Button onClick={() => router.push('/files')} className="bg-blue-600 hover:bg-blue-700 text-white">
                <FileText className="h-4 w-4 mr-1.5" />
                Go to Files
              </Button>
            </div>
          )}

          {/* Links list */}
          {!loading && links.length > 0 && (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="group relative bg-white rounded-xl border border-slate-200/60 p-4 sm:p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {link.file_name}
                        </h3>
                        {getStatusBadge(link)}
                      </div>

                      {/* Share URL */}
                      <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 text-xs bg-slate-50 px-2 py-1 rounded border border-slate-200 text-slate-600 truncate font-mono">
                          {link.share_url}
                        </code>
                        <button
                          onClick={() => handleCopy(link)}
                          className={`p-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                            copiedId === link.id
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
                          }`}
                          title="Copy link"
                        >
                          {copiedId === link.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {link.download_count} / {link.max_downloads === 0 ? '∞' : link.max_downloads} downloads
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {link.expires_at ? timeUntil(link.expires_at) : 'Never expires'}
                        </span>
                        {link.file_size > 0 && (
                          <span>{formatBytes(link.file_size)}</span>
                        )}
                        <span>Created {formatDate(link.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(link)}
                        className="text-xs"
                      >
                        {copiedId === link.id ? (
                          <>
                            <Check className="h-3 w-3 mr-1 text-emerald-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(link)}
                        disabled={deletingId === link.id}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                      >
                        {deletingId === link.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
