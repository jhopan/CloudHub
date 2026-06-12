import React, { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Zap, Trash2, ToggleLeft, ToggleRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface StorageAccount {
  id: string;
  label: string;
  capacity_bytes: number;
  used_bytes: number;
  available_bytes: number;
  health_status: string;
  is_active: boolean;
}

interface TestResult {
  success: boolean;
  responseTime?: number;
  message?: string;
  error?: string;
}

interface ConnectionRowProps {
  account: StorageAccount;
  selected?: boolean;
  testing?: boolean;
  testResult?: TestResult;
  onSelect?: (checked: boolean) => void;
  onTest: () => void;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}

export function ConnectionRow({
  account,
  selected = false,
  testing = false,
  testResult,
  onSelect,
  onTest,
  onToggle,
  onDelete,
}: ConnectionRowProps) {
  const [showTestResult, setShowTestResult] = useState(false);

  const usagePercent = account.capacity_bytes > 0
    ? (account.used_bytes / account.capacity_bytes) * 100
    : 0;

  const getProgressColor = () => {
    if (usagePercent >= 90) return 'bg-red-500';
    if (usagePercent >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Show test result when testing completes
  React.useEffect(() => {
    if (testResult) {
      setShowTestResult(true);
      const timer = setTimeout(() => setShowTestResult(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [testResult]);

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {account.label}
              </h3>
              <StatusBadge
                variant={account.health_status === 'healthy' ? 'success' : 'error'}
                size="sm"
                dot
              >
                {account.health_status === 'healthy' ? 'Healthy' : 'Error'}
              </StatusBadge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onTest}
                disabled={testing}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 hover:text-blue-600"
                title="Test connection"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => onToggle(!account.is_active)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title={account.is_active ? 'Disable' : 'Enable'}
              >
                {account.is_active ? (
                  <ToggleRight className="w-4 h-4 text-blue-600" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-gray-400" />
                )}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-600 hover:text-red-600"
                title="Delete account"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Storage Info */}
          <div className="text-sm text-gray-600 mb-2">
            {formatBytes(account.used_bytes)} / {formatBytes(account.capacity_bytes)} ({Math.round(usagePercent)}%)
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor()} transition-all duration-500`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>

          {/* Test Result (inline) */}
          {showTestResult && testResult && (
            <div
              className={`mt-3 p-3 rounded-lg border flex items-start gap-2 ${
                testResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  testResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {testResult.success ? 'Connection successful' : 'Connection failed'}
                </p>
                {testResult.responseTime && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    Response time: {testResult.responseTime}ms
                  </p>
                )}
                {testResult.error && (
                  <p className="text-xs text-red-700 mt-1">{testResult.error}</p>
                )}
                {testResult.message && (
                  <p className="text-xs text-gray-600 mt-1">{testResult.message}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
