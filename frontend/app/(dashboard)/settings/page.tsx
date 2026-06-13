'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Check,
  Trophy,
  Repeat,
  Scale,
  Banknote,
  Save,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Zap,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  color: {
    bg: string;
    bgSelected: string;
    border: string;
    text: string;
    iconBg: string;
    iconText: string;
    ring: string;
  };
}

interface SettingsData {
  scheduler_mode: string;
  valid_strategies: string[];
  encryption_enabled: boolean;
}

// ─── Strategy Definitions ────────────────────────────────────────────────────

const STRATEGIES: Strategy[] = [
  {
    id: 'largest_free',
    name: 'Largest Free',
    description: 'Store files in the account with the most free space',
    icon: Trophy,
    emoji: '🏆',
    color: {
      bg: 'bg-white',
      bgSelected: 'bg-violet-50/70',
      border: 'border-violet-400',
      text: 'text-violet-700',
      iconBg: 'bg-violet-100',
      iconText: 'text-violet-600',
      ring: 'ring-violet-200',
    },
  },
  {
    id: 'round_robin',
    name: 'Round Robin',
    description: 'Distribute files evenly across accounts in sequence',
    icon: Repeat,
    emoji: '🔄',
    color: {
      bg: 'bg-white',
      bgSelected: 'bg-sky-50/70',
      border: 'border-sky-400',
      text: 'text-sky-700',
      iconBg: 'bg-sky-100',
      iconText: 'text-sky-600',
      ring: 'ring-sky-200',
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Balance usage percentages across all accounts',
    icon: Scale,
    emoji: '⚖️',
    color: {
      bg: 'bg-white',
      bgSelected: 'bg-emerald-50/70',
      border: 'border-emerald-400',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconText: 'text-emerald-600',
      ring: 'ring-emerald-200',
    },
  },
  {
    id: 'cheapest',
    name: 'Cheapest',
    description: 'Prefer accounts with the lowest cost per GB',
    icon: Banknote,
    emoji: '💰',
    color: {
      bg: 'bg-white',
      bgSelected: 'bg-amber-50/70',
      border: 'border-amber-400',
      text: 'text-amber-700',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
      ring: 'ring-amber-200',
    },
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('largest_free');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Encryption State ─────────────────────────────────────────────────────
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [showPassphraseForm, setShowPassphraseForm] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);
  const [encryptionSaving, setEncryptionSaving] = useState(false);
  const [encryptionSuccess, setEncryptionSuccess] = useState<string | null>(null);
  const [encryptionError, setEncryptionError] = useState<string | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // ─── Fetch Settings ──────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/settings');
      const data: SettingsData = res.data;
      setSettings(data);
      setSelectedStrategy(data.scheduler_mode || 'largest_free');
      setEncryptionEnabled(data.encryption_enabled ?? false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || 'Failed to load settings';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchSettings();
  }, [user, router, fetchSettings]);

  // ─── Save Settings ───────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiClient.put('/settings', { scheduler_mode: selectedStrategy });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || 'Failed to save settings';
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ─── Check if changed ────────────────────────────────────────────────────

  const hasChanges = settings ? selectedStrategy !== settings.scheduler_mode : false;

  // ─── Encryption Handlers ───────────────────────────────────────────────────

  const handleEnableEncryption = async () => {
    if (passphrase.length < 8) {
      setEncryptionError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setEncryptionError('Passphrases do not match');
      return;
    }
    setEncryptionSaving(true);
    setEncryptionError(null);
    try {
      await apiClient.put('/settings/encryption', { enabled: true, passphrase });
      setEncryptionEnabled(true);
      setShowPassphraseForm(false);
      setPassphrase('');
      setConfirmPassphrase('');
      setEncryptionSuccess('Encryption enabled successfully!');
      setTimeout(() => setEncryptionSuccess(null), 4000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setEncryptionError(err.response?.data?.message || err.message || 'Failed to enable encryption');
    } finally {
      setEncryptionSaving(false);
    }
  };

  const handleDisableEncryption = async () => {
    setEncryptionSaving(true);
    setEncryptionError(null);
    try {
      await apiClient.put('/settings/encryption', { enabled: false });
      setEncryptionEnabled(false);
      setShowDisableConfirm(false);
      setEncryptionSuccess('Encryption disabled successfully!');
      setTimeout(() => setEncryptionSuccess(null), 4000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setEncryptionError(err.response?.data?.message || err.message || 'Failed to disable encryption');
    } finally {
      setEncryptionSaving(false);
    }
  };

  const handleToggleEncryption = () => {
    setEncryptionError(null);
    setEncryptionSuccess(null);
    if (encryptionEnabled) {
      setShowDisableConfirm(true);
    } else {
      setShowPassphraseForm((prev) => !prev);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">

          {/* ═══ Page Header ═══ */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-100">
                <Settings2 className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
                <p className="text-sm text-slate-500">Configure your storage gateway preferences</p>
              </div>
            </div>
          </div>

          {/* ═══ Error Toast ═══ */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 animate-in slide-in-from-top-2 duration-200">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ═══ Success Toast ═══ */}
          {saveSuccess && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 animate-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Settings saved successfully!</p>
            </div>
          )}

          {/* ═══ Scheduler Section ═══ */}
          <section className="space-y-5">
            {/* Section Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                <h2 className="text-lg font-semibold text-slate-900">Storage Scheduler</h2>
              </div>
              <p className="text-sm text-slate-500">
                Choose how files are automatically distributed across your storage accounts
              </p>
            </div>

            {/* Strategy Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STRATEGIES.map((strategy) => {
                const isSelected = selectedStrategy === strategy.id;
                const Icon = strategy.icon;

                return (
                  <button
                    key={strategy.id}
                    onClick={() => setSelectedStrategy(strategy.id)}
                    className={`
                      group relative text-left p-4 rounded-xl border-2 transition-all duration-200
                      ${isSelected
                        ? `${strategy.color.border} ${strategy.color.bgSelected} ring-2 ${strategy.color.ring} shadow-sm`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }
                    `}
                  >
                    {/* Selected checkmark */}
                    {isSelected && (
                      <div className={`absolute top-3 right-3 p-0.5 rounded-full ${strategy.color.iconBg}`}>
                        <Check className={`h-3.5 w-3.5 ${strategy.color.iconText}`} />
                      </div>
                    )}

                    {/* Icon + Emoji */}
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl ${isSelected ? strategy.color.iconBg : 'bg-slate-100'} transition-colors`}>
                        <Icon className={`h-5 w-5 ${isSelected ? strategy.color.iconText : 'text-slate-500'} transition-colors`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-base">{strategy.emoji}</span>
                          <h3 className={`text-sm font-semibold ${isSelected ? strategy.color.text : 'text-slate-900'} transition-colors`}>
                            {strategy.name}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {strategy.description}
                        </p>
                      </div>
                    </div>

                    {/* Radio indicator */}
                    <div className={`mt-3 flex items-center gap-2 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'} transition-opacity`}>
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${isSelected ? strategy.color.border : 'border-slate-300'}`}>
                        {isSelected && (
                          <div className={`h-2 w-2 rounded-full ${strategy.color.iconBg.replace('bg-', 'bg-').replace('100', '500')}`} style={{ backgroundColor: 'currentColor' }} />
                        )}
                      </div>
                      <span className={`text-[11px] font-medium ${isSelected ? strategy.color.text : 'text-slate-400'}`}>
                        {isSelected ? 'Active' : 'Select'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Info box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-600">How it works:</span>{' '}
                When you upload files from the root directory (without selecting a specific account),
                the scheduler automatically picks the best storage account based on your chosen strategy.
                Uploads into a specific account folder always go to that account.
              </p>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm disabled:opacity-50"
                size="lg"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saving ? 'Saving...' : saveSuccess ? 'Saved!' : hasChanges ? 'Save Changes' : 'No Changes'}
              </Button>

              {hasChanges && !saving && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (settings) setSelectedStrategy(settings.scheduler_mode);
                  }}
                  className="text-slate-500"
                >
                  Reset
                </Button>
              )}
            </div>
          </section>

          {/* ═══ File Encryption Section ═══ */}
          <section className="space-y-5">
            {/* Section Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-violet-500" />
                <h2 className="text-lg font-semibold text-slate-900">🔐 File Encryption</h2>
              </div>
              <p className="text-sm text-slate-500">
                Encrypt files before uploading to cloud storage for extra security
              </p>
            </div>

            {/* Encryption Status Card */}
            <div className={`p-5 rounded-xl border-2 bg-white shadow-sm transition-all duration-300 ${
              encryptionEnabled ? 'border-emerald-200' : 'border-slate-200'
            }`}>

              {/* Top row: status badge + toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl transition-colors duration-300 ${
                    encryptionEnabled ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    <ShieldCheck className={`h-5 w-5 transition-colors duration-300 ${
                      encryptionEnabled ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                  </div>
                  <div>
                    {encryptionEnabled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        ✅ Encryption Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                        Encryption Disabled
                      </span>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {encryptionEnabled
                        ? 'All new uploads will be encrypted with AES-256-GCM'
                        : 'Files are stored as-is in cloud storage'}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={handleToggleEncryption}
                  disabled={encryptionSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 ${
                    encryptionEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                  } ${encryptionSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  role="switch"
                  aria-checked={encryptionEnabled}
                  aria-label="Toggle encryption"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    encryptionEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* ─── Encryption Success Message ─── */}
              {encryptionSuccess && (
                <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 animate-in slide-in-from-top-2 duration-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-sm text-emerald-700 font-medium">{encryptionSuccess}</p>
                </div>
              )}

              {/* ─── Encryption Error Message ─── */}
              {encryptionError && (
                <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 animate-in slide-in-from-top-2 duration-200">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{encryptionError}</p>
                </div>
              )}

              {/* ─── Passphrase Form (when enabling) ─── */}
              {showPassphraseForm && !encryptionEnabled && (
                <div className="mt-5 space-y-4 animate-in slide-in-from-top-2 duration-300">
                  {/* Warning Banner */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 leading-relaxed">
                      <span className="font-semibold">⚠️ Remember your passphrase!</span>{' '}
                      Lost passphrase means permanently lost files. Cloud providers cannot recover encrypted data.
                    </p>
                  </div>

                  {/* Passphrase Input */}
                  <div className="space-y-1.5">
                    <label htmlFor="passphrase" className="text-sm font-medium text-slate-700">
                      Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="passphrase"
                        type={showPassphrase ? 'text' : 'password'}
                        value={passphrase}
                        onChange={(e) => {
                          setPassphrase(e.target.value);
                          setEncryptionError(null);
                        }}
                        placeholder="Enter a strong passphrase (min 8 characters)"
                        className="w-full px-4 py-2.5 pr-10 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400
                          focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passphrase.length > 0 && passphrase.length < 8 && (
                      <p className="text-xs text-red-500">Passphrase must be at least 8 characters</p>
                    )}
                  </div>

                  {/* Confirm Passphrase Input */}
                  <div className="space-y-1.5">
                    <label htmlFor="confirm-passphrase" className="text-sm font-medium text-slate-700">
                      Confirm Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-passphrase"
                        type={showConfirmPassphrase ? 'text' : 'password'}
                        value={confirmPassphrase}
                        onChange={(e) => {
                          setConfirmPassphrase(e.target.value);
                          setEncryptionError(null);
                        }}
                        placeholder="Re-enter your passphrase"
                        className="w-full px-4 py-2.5 pr-10 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400
                          focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassphrase((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                      >
                        {showConfirmPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassphrase.length > 0 && passphrase !== confirmPassphrase && (
                      <p className="text-xs text-red-500">Passphrases do not match</p>
                    )}
                  </div>

                  {/* Enable Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleEnableEncryption}
                      disabled={
                        encryptionSaving ||
                        passphrase.length < 8 ||
                        passphrase !== confirmPassphrase
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                      size="lg"
                    >
                      {encryptionSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 mr-2" />
                      )}
                      {encryptionSaving ? 'Enabling...' : 'Enable Encryption'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPassphraseForm(false);
                        setPassphrase('');
                        setConfirmPassphrase('');
                        setEncryptionError(null);
                      }}
                      className="text-slate-500"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* ─── Disable Confirmation Dialog ─── */}
              {showDisableConfirm && encryptionEnabled && (
                <div className="mt-5 space-y-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Disable Encryption?</p>
                      <p className="text-sm text-red-700 mt-1">
                        Future uploads will no longer be encrypted. Already encrypted files will remain encrypted and require your passphrase to access.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleDisableEncryption}
                      disabled={encryptionSaving}
                      className="bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-50"
                      size="lg"
                    >
                      {encryptionSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4 mr-2" />
                      )}
                      {encryptionSaving ? 'Disabling...' : 'Disable Encryption'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDisableConfirm(false)}
                      className="text-slate-500"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Encryption Info Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-600">About encryption:</span>{' '}
                When enabled, files are encrypted client-side using AES-256-GCM before being uploaded
                to your cloud storage providers. Only someone with the correct passphrase can decrypt
                and read the files. This adds an extra layer of security regardless of which storage
                scheduler strategy you use.
              </p>
            </div>
          </section>

          {/* ═══ Current Config Summary ═══ */}
          {settings && (
            <section className="p-5 rounded-xl border border-slate-200/60 bg-white shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Current Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Active Strategy</p>
                  <p className="text-sm font-medium text-slate-900 capitalize">
                    {settings.scheduler_mode.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Available Strategies</p>
                  <p className="text-sm font-medium text-slate-900">
                    {settings.valid_strategies?.length || 4} strategies
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">File Encryption</p>
                  <p className={`text-sm font-medium ${encryptionEnabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {encryptionEnabled ? '✅ Enabled (AES-256-GCM)' : '❌ Disabled'}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
