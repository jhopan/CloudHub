'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Upload, Download, Trash2, ArrowRightLeft, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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

export default function TransferLogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<TransferLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetchLogs();
  }, [user, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/transfer-logs', { params: { limit, offset: page * limit } });
      setLogs(res.data.logs || res.data || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const getOperationIcon = (op: string) => {
    switch (op) {
      case 'upload': return <Upload className="h-4 w-4 text-blue-500" />;
      case 'download': return <Download className="h-4 w-4 text-green-500" />;
      case 'delete': return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'move': return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string, retryCount: number, maxRetries: number) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'failed':
        if (retryCount < maxRetries) {
          return <Badge variant="secondary" className="bg-orange-500 text-white"><AlertCircle className="h-3 w-3 mr-1" />Retry {retryCount}/{maxRetries}</Badge>;
        }
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'in_progress':
        return <Badge variant="secondary" className="bg-blue-500 text-white"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
      case 'retrying':
        return <Badge variant="secondary" className="bg-yellow-500 text-white"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Retrying</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Transfer Logs</h1>
            <p className="text-muted-foreground">Track all file operations and transfers</p>
          </div>
          <Button variant="outline" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transfers</CardTitle>
            <CardDescription>
              Showing {logs.length} of {total} transfers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-4" />
                <p>No transfers yet</p>
                <p className="text-sm">Upload or download files to see transfer logs</p>
              </div>
            ) : (
              <div className="space-y-0">
                {/* Table header */}
                <div className="grid grid-cols-6 gap-4 px-4 py-2 border-b text-sm font-medium text-muted-foreground">
                  <div>Operation</div>
                  <div>Status</div>
                  <div>Size</div>
                  <div>Retries</div>
                  <div>Time</div>
                  <div>Error</div>
                </div>

                {/* Table rows */}
                {logs.map((log) => (
                  <div key={log.id} className="grid grid-cols-6 gap-4 px-4 py-3 border-b hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {getOperationIcon(log.operation)}
                      <span className="capitalize font-medium">{log.operation}</span>
                    </div>
                    <div className="flex items-center">
                      {getStatusBadge(log.status, log.retry_count, log.max_retries)}
                    </div>
                    <div className="flex items-center text-sm">
                      {formatBytes(log.bytes_transferred)}
                    </div>
                    <div className="flex items-center text-sm">
                      {log.retry_count > 0 ? `${log.retry_count}/${log.max_retries}` : '-'}
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      {formatDate(log.created_at)}
                    </div>
                    <div className="flex items-center text-sm text-red-500 truncate" title={log.error_message || ''}>
                      {log.error_message ? log.error_message.substring(0, 40) + '...' : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
