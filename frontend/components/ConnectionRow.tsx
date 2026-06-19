import React, { useState, useRef, useEffect } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Zap, Trash2, ToggleLeft, ToggleRight, Loader2, CheckCircle, XCircle, Pencil, Check, X } from 'lucide-react';

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
  onRename?: (newLabel: string) => Promise<void>;
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
  onRename,
}: ConnectionRowProps) {
  const [showTestResult, setShowTestResult] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(account.label);
  const [savingLabel, setSavingLabel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditLabel(account.label);
    setIsEditing(true);
  };

  const handleSaveLabel = async () => {
    const trimmed = editLabel.trim();
    if (!trimmed || trimmed === account.label) {
      setIsEditing(false);
      return;
    }
    if (!onRename) return;
    setSavingLabel(true);
    try {
      await onRename(trimmed);
      setIsEditing(false);
    } catch {
      // Keep editing on error
    } finally {
      setSavingLabel(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditLabel(account.label);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

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
              {isEditing ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    ref={inputRef}
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveLabel}
                    disabled={savingLabel}
                    className="px-2 py-0.5 text-sm font-semibold text-gray-900 border border-blue-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-0 flex-1"
                    maxLength={100}
                  />
                  {savingLabel ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
                  ) : (
                    <>
                      <button
                        onClick={handleSaveLabel}
                        className="p-0.5 rounded hover:bg-green-50 text-green-600 shrink-0"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-0.5 rounded hover:bg-red-50 text-red-500 shrink-0"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-900 truncate">
                    {account.label}
                  </h3>
                  {onRename && (
                    <button
                      onClick={handleStartEdit}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                      title="Rename account"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
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
