'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Monitor,
  Moon,
  RefreshCw,
  Square,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
  GOOGLE_AI_STUDIO_RATE_LIMIT_URL,
} from '@/lib/constants';
import { deleteAllLocalData, getDataCounts } from '@/lib/db';
import { formatBytes } from '@/lib/media/process';
import {
  GeminiRequestError,
  isAbortError,
  listGeminiModels,
  maskApiKey,
  type GeminiModel,
} from '@/lib/gemini';
import {
  clearStoredApiKey,
  getStoredAutoBuild,
  getStoredDailyRequestLimits,
  getStoredDefaultFormat,
  normalizeModelStorageKey,
  setStoredApiKey,
  setStoredAutoBuild,
  setStoredBackupModel,
  setStoredDailyRequestLimit,
  setStoredDefaultFormat,
  setStoredModel,
} from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import type { FormatPreference, SessionUsage, ThemePreference } from '@/lib/types';
import {
  getQuotaDayUsageSummary,
  type ModelQuotaDayUsage,
  type QuotaDayUsageSummary,
} from '@/lib/usage-ledger';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  selectedModel: string;
  backupModel: string;
  models: GeminiModel[];
  autoBuild?: boolean;
  onAutoBuildChange?: (enabled: boolean) => void;
  defaultFormat?: FormatPreference;
  onDefaultFormatChange?: (format: FormatPreference) => void;
  sessionUsage: SessionUsage;
  onResetSessionUsage: () => void;
  onApiKeyUpdated: (newKey: string) => void;
  onApiKeyRemoved: () => void;
  onModelsUpdated: (models: GeminiModel[], nextSelectedModel: string) => void;
  onModelSelected: (modelName: string) => void;
  onBackupModelSelected: (modelName: string) => void;
  onLocalDataDeleted: () => Promise<void>;
}

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
];

const FORMAT_OPTIONS: ReadonlyArray<{
  value: FormatPreference;
  label: string;
  description: string;
}> = [
  { value: '9:16', label: '9:16', description: 'Portrait' },
  { value: '16:9', label: '16:9', description: 'Landscape' },
  { value: '1:1', label: '1:1', description: 'Square' },
  { value: 'auto', label: 'Auto', description: 'AI decides automatically' },
];

function formatBuildTimestamp(raw: string | undefined): string {
  if (!raw || !raw.trim()) {
    return 'Development build';
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function useElapsedMs(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - started));
    }, 100);
    return () => {
      window.clearInterval(id);
      setElapsedMs(0);
    };
  }, [active]);

  return active ? elapsedMs : 0;
}

export function SettingsSheet({
  open,
  onClose,
  apiKey,
  selectedModel,
  backupModel,
  models,
  autoBuild,
  onAutoBuildChange,
  defaultFormat,
  onDefaultFormatChange,
  sessionUsage,
  onResetSessionUsage,
  onApiKeyUpdated,
  onApiKeyRemoved,
  onModelsUpdated,
  onModelSelected,
  onBackupModelSelected,
  onLocalDataDeleted,
}: SettingsSheetProps) {
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [counts, setCounts] = useState<{
    projectCount: number;
    messageCount: number;
    mediaCount: number;
    mediaBytes: number;
  } | null>(null);

  const [quotaUsage, setQuotaUsage] = useState<QuotaDayUsageSummary | null>(null);
  const [dailyLimits, setDailyLimits] = useState<Record<string, number>>({});
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

  const [replacingKey, setReplacingKey] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<{
    friendly: string;
    action?: string;
    raw: string;
  } | null>(null);
  const [showKeyErrorDetails, setShowKeyErrorDetails] = useState(false);

  const [refreshingModels, setRefreshingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [confirmRemoveKey, setConfirmRemoveKey] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [fallbackAutoBuild, setFallbackAutoBuild] = useState<boolean>(() =>
    typeof window !== 'undefined' ? getStoredAutoBuild() : true
  );
  const effectiveAutoBuild = autoBuild ?? fallbackAutoBuild;
  const [fallbackDefaultFormat, setFallbackDefaultFormat] =
    useState<FormatPreference>(() =>
      typeof window !== 'undefined' ? getStoredDefaultFormat() : 'auto'
    );
  const effectiveDefaultFormat = defaultFormat ?? fallbackDefaultFormat;

  const saveKeyAbortRef = useRef<AbortController | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);

  const savingKeyElapsedMs = useElapsedMs(savingKey);
  const refreshElapsedMs = useElapsedMs(refreshingModels);

  const loadQuotaAndCounts = useCallback(async () => {
    try {
      const [nextCounts, nextQuota] = await Promise.all([
        getDataCounts(),
        getQuotaDayUsageSummary(),
      ]);
      setCounts(nextCounts);
      setQuotaUsage(nextQuota);
    } catch {
      setCounts({ projectCount: 0, messageCount: 0, mediaCount: 0, mediaBytes: 0 });
    }
    const storedLimits = getStoredDailyRequestLimits();
    setDailyLimits(storedLimits);
    const nextDrafts: Record<string, string> = {};
    for (const [k, v] of Object.entries(storedLimits)) {
      nextDrafts[k] = String(v);
    }
    setLimitDrafts(nextDrafts);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      if (active) {
        await loadQuotaAndCounts();
      }
    })();
    return () => {
      active = false;
    };
  }, [open, loadQuotaAndCounts]);

  useEffect(() => {
    return () => {
      saveKeyAbortRef.current?.abort();
      refreshAbortRef.current?.abort();
    };
  }, []);

  const displayedDailyModels = useMemo<ModelQuotaDayUsage[]>(() => {
    const byModel = new Map<string, ModelQuotaDayUsage>();
    for (const row of quotaUsage?.models ?? []) {
      byModel.set(row.model, row);
    }

    const activeKeys = [selectedModel, backupModel]
      .map((m) => normalizeModelStorageKey(m))
      .filter((m) => m.length > 0);

    for (const key of activeKeys) {
      if (!byModel.has(key)) {
        byModel.set(key, {
          model: key,
          requests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          promptTokens: 0,
          outputTokens: 0,
          thoughtTokens: 0,
          totalTokens: 0,
        });
      }
    }

    return Array.from(byModel.values());
  }, [quotaUsage, selectedModel, backupModel]);

  const handleStopRefreshModels = () => {
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    setRefreshingModels(false);
  };

  const handleStopSaveKey = () => {
    saveKeyAbortRef.current?.abort();
    saveKeyAbortRef.current = null;
    setSavingKey(false);
  };

  const handleRefreshModels = async () => {
    if (!apiKey) return;
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setRefreshingModels(true);
    setModelsError(null);

    try {
      const result = await listGeminiModels(apiKey, {
        signal: controller.signal,
      });
      const capable = result.models.filter((m) =>
        m.supportedGenerationMethods.includes('generateContent')
      );
      if (capable.length === 0) {
        setModelsError('No generateContent models were returned for this key.');
        return;
      }

      const stillValid = capable.some((m) => m.name === selectedModel);
      const nextModel = stillValid
        ? selectedModel
        : capable.find((m) => m.name.toLowerCase().includes('flash'))?.name ??
          capable[0].name;

      setStoredModel(nextModel);
      onModelsUpdated(capable, nextModel);

      if (backupModel && !capable.some((m) => m.name === backupModel)) {
        setStoredBackupModel('');
        onBackupModelSelected('');
      }

      showToast(`Loaded ${capable.length} models`, 'success');
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        return;
      }
      const msg =
        err instanceof GeminiRequestError
          ? `${err.message} ${err.userAction}`.trim()
          : err instanceof Error
            ? err.message
            : String(err);
      setModelsError(msg);
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
      setRefreshingModels(false);
    }
  };

  const handleSaveReplacementKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeyInput.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    saveKeyAbortRef.current = controller;
    setSavingKey(true);
    setKeyError(null);
    setShowKeyErrorDetails(false);

    try {
      const result = await listGeminiModels(trimmed, {
        signal: controller.signal,
      });
      const capable = result.models.filter((m) =>
        m.supportedGenerationMethods.includes('generateContent')
      );
      if (capable.length === 0) {
        setKeyError({
          friendly: 'Key connected, but no generateContent models were found.',
          raw: `Returned ${result.models.length} models, 0 compatible.`,
        });
        return;
      }

      const nextModel =
        capable.find((m) => m.name.toLowerCase().includes('flash'))?.name ??
        capable[0].name;

      setStoredApiKey(trimmed);
      setStoredModel(nextModel);
      onApiKeyUpdated(trimmed);
      onModelsUpdated(capable, nextModel);

      if (backupModel && !capable.some((m) => m.name === backupModel)) {
        setStoredBackupModel('');
        onBackupModelSelected('');
      }

      setReplacingKey(false);
      setNewKeyInput('');
      showToast('Gemini API key updated', 'success');
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        return;
      }
      if (err instanceof GeminiRequestError) {
        setKeyError({
          friendly: err.message,
          action: err.userAction,
          raw: `${err.explanation}\n\n${err.rawDetails}`,
        });
      } else {
        setKeyError({
          friendly: 'Could not validate this API key.',
          raw: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (saveKeyAbortRef.current === controller) {
        saveKeyAbortRef.current = null;
      }
      setSavingKey(false);
    }
  };

  const handleConfirmRemoveKey = () => {
    clearStoredApiKey();
    setConfirmRemoveKey(false);
    onClose();
    onApiKeyRemoved();
  };

  const handleConfirmDeleteAll = async () => {
    setDeletingData(true);
    try {
      await deleteAllLocalData();
      setCounts({ projectCount: 0, messageCount: 0, mediaCount: 0, mediaBytes: 0 });
      await onLocalDataDeleted();
      await loadQuotaAndCounts();
      setConfirmDeleteAll(false);
      showToast('All local projects and messages deleted', 'info');
    } finally {
      setDeletingData(false);
    }
  };

  const handleLimitChange = (modelKey: string, rawValue: string) => {
    setLimitDrafts((prev) => ({ ...prev, [modelKey]: rawValue }));
    const trimmed = rawValue.trim();
    if (!trimmed) {
      const updated = setStoredDailyRequestLimit(modelKey, null);
      setDailyLimits(updated);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      const updated = setStoredDailyRequestLimit(modelKey, Math.floor(parsed));
      setDailyLimits(updated);
    }
  };

  const buildTimeLabel = formatBuildTimestamp(
    process.env.NEXT_PUBLIC_BUILD_TIME
  );

  return (
    <>
      <Sheet open={open} onClose={onClose} side="right" title="Settings">
        <div className="space-y-5 pb-2">
          <section className="space-y-3.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              AI Connection
            </h3>

            <div className="rounded-[12px] border border-border bg-surface-2/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">
                  API key
                </span>
                <span className="font-mono text-xs text-text truncate">
                  {apiKey ? maskApiKey(apiKey) : 'No key stored'}
                </span>
              </div>

              {!replacingKey ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReplacingKey(true);
                      setKeyError(null);
                    }}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRemoveKey(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSaveReplacementKey} className="space-y-2.5">
                  <div className="relative flex items-center">
                    <input
                      type={showNewKey ? 'text' : 'password'}
                      value={newKeyInput}
                      onChange={(e) => setNewKeyInput(e.target.value)}
                      placeholder="Paste new Gemini API key"
                      autoComplete="off"
                      autoFocus
                      className="min-h-[44px] w-full rounded-[12px] border border-border bg-surface-1 py-2 pl-3 pr-11 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <IconButton
                      aria-label={showNewKey ? 'Hide key' : 'Show key'}
                      onClick={() => setShowNewKey((prev) => !prev)}
                      className="absolute right-0.5"
                    >
                      {showNewKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </IconButton>
                  </div>

                  {keyError && (
                    <div className="rounded-[10px] border border-danger/35 bg-danger/10 p-2.5 text-xs text-text">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                        <div className="min-w-0 flex-1">
                          <p>{keyError.friendly}</p>
                          {keyError.action && (
                            <p className="mt-1 text-text-secondary">
                              {keyError.action}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowKeyErrorDetails((prev) => !prev)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text"
                          >
                            <span>Details</span>
                            {showKeyErrorDetails ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                          {showKeyErrorDetails && (
                            <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-bg p-2 font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-words">
                              {keyError.raw}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {savingKey && (
                    <div className="rounded-[10px] border border-border bg-surface-1 px-2.5 py-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-secondary">
                          Validating key with Google...
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-text-muted tabular-nums">
                            {(savingKeyElapsedMs / 1000).toFixed(1)}s
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleStopSaveKey}
                          >
                            <Square className="h-2.5 w-2.5 fill-current" />
                            <span>Stop</span>
                          </Button>
                        </div>
                      </div>
                      {savingKeyElapsedMs >= 25_000 && (
                        <p className="text-[11px] text-warning">
                          Still waiting for Google. You can stop and retry, or check your connection.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleStopSaveKey();
                        setReplacingKey(false);
                        setNewKeyInput('');
                        setKeyError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={savingKey}
                      disabled={!newKeyInput.trim() || savingKey}
                    >
                      Validate & save
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <div className="space-y-3 rounded-[12px] border border-border bg-surface-2/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">
                  Models
                </span>
                <div className="flex items-center gap-1.5">
                  {refreshingModels && (
                    <>
                      <span className="font-mono text-[11px] text-text-muted tabular-nums">
                        {(refreshElapsedMs / 1000).toFixed(1)}s
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStopRefreshModels}
                      >
                        <Square className="h-2.5 w-2.5 fill-current" />
                        <span>Stop</span>
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={refreshingModels}
                    disabled={refreshingModels}
                    onClick={() => void handleRefreshModels()}
                  >
                    {!refreshingModels && <RefreshCw className="h-3.5 w-3.5" />}
                    <span>Refresh models</span>
                  </Button>
                </div>
              </div>

              {refreshingModels && refreshElapsedMs >= 25_000 && (
                <p className="text-[11px] text-warning">
                  Still waiting for Google. You can stop and retry, or check your connection.
                </p>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-primary-model"
                  className="block text-[11px] font-medium text-text-secondary"
                >
                  Primary model
                </label>
                <select
                  id="settings-primary-model"
                  aria-label="Selected Gemini model"
                  value={selectedModel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStoredModel(next);
                    onModelSelected(next);
                  }}
                  className="min-h-[44px] w-full rounded-[10px] border border-border bg-surface-1 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {models.length === 0 ? (
                    selectedModel ? (
                      <option value={selectedModel}>
                        {selectedModel.replace(/^models\//, '')}
                      </option>
                    ) : (
                      <option value="">Refresh models to load list</option>
                    )
                  ) : (
                    models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.displayName} ({m.name.replace(/^models\//, '')})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-backup-model"
                  className="block text-[11px] font-medium text-text-secondary"
                >
                  Backup model (optional fallback)
                </label>
                <select
                  id="settings-backup-model"
                  aria-label="Backup Gemini model"
                  value={backupModel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStoredBackupModel(next);
                    onBackupModelSelected(next);
                  }}
                  className="min-h-[44px] w-full rounded-[10px] border border-border bg-surface-1 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">None</option>
                  {models.length === 0 ? (
                    backupModel ? (
                      <option value={backupModel}>
                        {backupModel.replace(/^models\//, '')}
                      </option>
                    ) : null
                  ) : (
                    models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.displayName} ({m.name.replace(/^models\//, '')})
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  Used automatically if the primary model is overloaded, times out, or hits quota. Not every listed model is available on the free tier, so test it.
                </p>
              </div>

              {modelsError && (
                <p className="text-xs text-danger break-words">{modelsError}</p>
              )}
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Workflow
            </h3>

            <div className="flex items-start justify-between gap-3 rounded-[12px] border border-border bg-surface-2/60 p-3.5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text">
                  Auto-build videos
                </p>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  When on, the AI builds the video immediately after planning without asking you to confirm. When off, the plan card appears first so you can review and edit before building.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={effectiveAutoBuild}
                aria-label="Auto-build videos"
                onClick={() => {
                  const next = !effectiveAutoBuild;
                  setStoredAutoBuild(next);
                  setFallbackAutoBuild(next);
                  onAutoBuildChange?.(next);
                }}
                className={cn(
                  'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  effectiveAutoBuild
                    ? 'border-accent bg-accent'
                    : 'border-border bg-surface-1'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    effectiveAutoBuild ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="space-y-2.5 rounded-[12px] border border-border bg-surface-2/60 p-3.5">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-text">
                  Default format
                </p>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  Starting aspect ratio for new projects unless overridden in chat.
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Default format"
                className="grid grid-cols-2 gap-2"
              >
                {FORMAT_OPTIONS.map((option) => {
                  const active = effectiveDefaultFormat === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setStoredDefaultFormat(option.value);
                        setFallbackDefaultFormat(option.value);
                        onDefaultFormatChange?.(option.value);
                      }}
                      className={cn(
                        'flex min-h-[44px] flex-col items-start justify-center rounded-[10px] border px-3 py-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        active
                          ? 'border-accent/60 bg-accent/12 text-text'
                          : 'border-border bg-surface-1 text-text-secondary hover:text-text'
                      )}
                    >
                      <span className="font-mono text-xs font-semibold text-text">
                        {option.label}
                      </span>
                      <span className="text-[11px] leading-tight text-text-muted">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Appearance
            </h3>
            <div
              role="radiogroup"
              aria-label="Theme preference"
              className="grid grid-cols-3 gap-1.5 rounded-[12px] border border-border bg-surface-2/60 p-1"
            >
              {THEME_OPTIONS.map(({ value, label, Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex min-h-[40px] items-center justify-center gap-1.5 rounded-[9px] px-2 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      active
                        ? 'bg-surface-1 text-text border border-border'
                        : 'text-text-secondary hover:text-text border border-transparent'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3.5 border-t border-border pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Usage
            </h3>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">
                  This session
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    sessionUsage.requestsMade === 0 &&
                    sessionUsage.promptTokens === 0 &&
                    sessionUsage.outputTokens === 0
                  }
                  onClick={onResetSessionUsage}
                >
                  Reset
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-[12px] border border-border bg-surface-2/60 p-3 text-xs">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-text-muted">Requests</p>
                  <p className="font-mono font-semibold text-text tabular-nums">
                    {sessionUsage.requestsMade.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-text-muted">Input tokens</p>
                  <p className="font-mono font-semibold text-text tabular-nums">
                    {sessionUsage.promptTokens.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-text-muted">Output tokens</p>
                  <p className="font-mono font-semibold text-text tabular-nums">
                    {sessionUsage.outputTokens.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">
                  This quota day
                </span>
                {quotaUsage && (
                  <span className="text-[11px] text-text-muted tabular-nums">
                    Resets at {quotaUsage.resetLocalTime}
                  </span>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-text-muted">
                Counts requests made from this browser since midnight Pacific time. Real limits vary per account and model — check{' '}
                <a
                  href={GOOGLE_AI_STUDIO_RATE_LIMIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-accent hover:underline"
                >
                  <span>Google AI Studio rate limits</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                .
              </p>

              {displayedDailyModels.length === 0 ? (
                <div className="rounded-[12px] border border-border bg-surface-2/60 p-3 text-xs text-text-muted">
                  No requests recorded yet today.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayedDailyModels.map((row) => {
                    const limit = dailyLimits[row.model];
                    const draft = limitDrafts[row.model] ?? '';
                    const pct =
                      limit && limit > 0
                        ? Math.min(100, Math.round((row.requests / limit) * 100))
                        : null;
                    const isWarning = pct !== null && pct > 80;

                    return (
                      <div
                        key={row.model}
                        className="rounded-[12px] border border-border bg-surface-2/60 p-3 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-medium text-text break-all">
                            {row.model}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-xs font-semibold tabular-nums',
                              isWarning ? 'text-warning' : 'text-text'
                            )}
                          >
                            {limit
                              ? `${row.requests.toLocaleString()} / ${limit.toLocaleString()}`
                              : `${row.requests.toLocaleString()} ${row.requests === 1 ? 'req' : 'reqs'}`}
                          </span>
                        </div>

                        {pct !== null && (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
                            <div
                              className={cn(
                                'h-full transition-[width] duration-200',
                                isWarning ? 'bg-warning' : 'bg-accent'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted tabular-nums">
                          <span>In: {row.promptTokens.toLocaleString()}</span>
                          <span>Out: {row.outputTokens.toLocaleString()}</span>
                          {row.thoughtTokens > 0 && (
                            <span>Think: {row.thoughtTokens.toLocaleString()}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <label
                            htmlFor={`limit-${row.model}`}
                            className="text-[11px] text-text-secondary"
                          >
                            My daily request limit (read it in Google AI Studio)
                          </label>
                          <input
                            id={`limit-${row.model}`}
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={draft}
                            onChange={(e) =>
                              handleLimitChange(row.model, e.target.value)
                            }
                            placeholder="Optional"
                            className="h-8 w-24 shrink-0 rounded-[8px] border border-border bg-surface-1 px-2 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Data
            </h3>
            <div className="rounded-[12px] border border-border bg-surface-2/60 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary">Stored locally</span>
                <span className="font-mono text-right text-text tabular-nums">
                  {counts
                    ? `${counts.projectCount} ${counts.projectCount === 1 ? 'project' : 'projects'} · ${counts.messageCount} ${counts.messageCount === 1 ? 'message' : 'messages'} · ${counts.mediaCount} ${counts.mediaCount === 1 ? 'file' : 'files'} (${formatBytes(counts.mediaBytes)})`
                    : 'Counting...'}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => setConfirmDeleteAll(true)}
                className="text-danger hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete all local data</span>
              </Button>
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              About
            </h3>
            <div className="rounded-[12px] border border-border bg-surface-2/60 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span className="font-medium text-text">{APP_NAME}</span>
                <span className="font-mono tabular-nums">v{APP_VERSION}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                <span>Built</span>
                <span className="font-mono tabular-nums text-right">
                  {buildTimeLabel}
                </span>
              </div>
            </div>
          </section>
        </div>
      </Sheet>

      <Dialog
        open={confirmRemoveKey}
        onClose={() => setConfirmRemoveKey(false)}
        title="Remove Gemini key?"
        description="Your API key will be cleared from this browser. You will need to connect a key again to continue."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmRemoveKey(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmRemoveKey}>
              Remove key
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="Delete all local data?"
        description="This permanently removes all projects and chat messages stored in this browser's IndexedDB. Your Gemini API key will remain saved."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDeleteAll(false)}
              disabled={deletingData}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deletingData}
              onClick={() => void handleConfirmDeleteAll()}
            >
              Delete all
            </Button>
          </>
        }
      />
    </>
  );
}

