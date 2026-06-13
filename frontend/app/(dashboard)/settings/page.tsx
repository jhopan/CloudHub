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

  // ─── Fetch Settings ──────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/settings');
      const data: SettingsData = res.data;
      setSettings(data);
      setSelectedStrategy(data.scheduler_mode || 'largest_free');
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
              </div>
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
