'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Player, type PlayerRef } from '@remotion/player';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Moon,
  Play,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SettingsSheet } from '@/components/product/SettingsSheet';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { formatShortModelName, isAbortError } from '@/lib/ai/gemini-client';
import { GeminiRequestError, type GeminiErrorKind } from '@/lib/ai/gemini-errors';
import { exportCompositionToMp4, type ExportMp4Progress } from '@/lib/export';
import { listGeminiModels, type GeminiModel } from '@/lib/gemini';
import {
  DEFAULT_CHECKED_FIXTURE_IDS,
  DEFAULT_MUSIC_VOLUME,
  DIRECTOR_TEST_FIXTURES,
  KIT_FONT_CLASS_NAMES,
  STYLE_DEFS,
  VideoFromSpec,
  applyOps,
  computeVarietyReport,
  describeAudioSummary,
  ensureFonts,
  formatLayoutSequence,
  generateSpec,
  getSpecDimensions,
  isAudioActive,
  pickDefaultMusicStyleForTheme,
  posterFrame,
  totalFrames,
  useAudioRenderStatus,
  type AuditIssue,
  type AuditReport,
  type AvoidLookCombination,
  type DirectorTestFixture,
  type GenerateSpecResult,
  type GenerateStatusEvent,
  type VideoSpec,
} from '@/lib/kit';
import {
  clearStoredBackupModel,
  clearStoredModel,
  getStoredApiKey,
  getStoredBackupModel,
  getStoredDailyRequestLimit,
  getStoredExportMode,
  getStoredModel,
  setStoredExportMode,
} from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import type { ExportMode, SessionUsage, VideoFormat } from '@/lib/types';
import {
  getQuotaDayUsageSummary,
  normalizeUsageModelName,
} from '@/lib/usage-ledger';

const FORMAT_OPTIONS: readonly VideoFormat[] = ['9:16', '16:9', '1:1'];
const AVOID_STORAGE_KEY = 'motionai_director_avoid_history_v1';
const TEST_RESULTS_STORAGE_KEY = 'motionai_director_test_results_v1';
const MAX_AVOID_HISTORY = 3;
const MAX_STORED_TEST_RESULTS = 12;
const BATCH_PAUSE_MS = 1500;

interface StoredTestRunEntry {
  fixtureId: number;
  label: string;
  format: VideoFormat;
  targetSeconds: number;
  status: 'ok' | 'error';
  errorMessage?: string;
  errorKind?: GeminiErrorKind;
  result?: GenerateSpecResult;
}

interface QuotaConfirmPrompt {
  fixtureIds: number[];
  estimatedMaxRequests: number;
  usedToday: number;
  dailyLimit: number;
  modelLabel: string;
}

interface DirectorErrorState {
  message: string;
  userAction?: string;
  kind?: GeminiErrorKind;
  rawDetails?: string;
}

function serializeSpecClean(spec: VideoSpec): string {
  return JSON.stringify(
    {
      title: spec.title,
      format: spec.format,
      style: spec.style,
      intensity: spec.intensity,
      seed: spec.seed,
      ...(spec.numerals ? { numerals: spec.numerals } : {}),
      ...(spec.transition ? { transition: spec.transition } : {}),
      ...(spec.audio ? { audio: spec.audio } : {}),
      theme: {
        palette:
          spec.theme.paletteName === 'custom'
            ? spec.theme.palette
            : spec.theme.paletteName,
        mood: spec.theme.mood,
      },
      scenes: spec.scenes,
    },
    null,
    2
  );
}

function loadAvoidHistory(): AvoidLookCombination[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AVOID_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is AvoidLookCombination =>
          typeof item === 'object' && item !== null
      )
      .slice(0, MAX_AVOID_HISTORY);
  } catch {
    return [];
  }
}

function saveAvoidHistory(items: AvoidLookCombination[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AVOID_STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_AVOID_HISTORY))
    );
  } catch {
    // Ignore storage errors
  }
}

function loadStoredTestResults(): StoredTestRunEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TEST_RESULTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_STORED_TEST_RESULTS) as StoredTestRunEntry[];
  } catch {
    return [];
  }
}

function saveStoredTestResults(entries: StoredTestRunEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      TEST_RESULTS_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_STORED_TEST_RESULTS))
    );
  } catch {
    // Ignore storage errors
  }
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pickInitialSeed(): number {
  return Math.floor((Date.now() * 9301 + 49297) % 999999);
}

function toErrorState(err: unknown): DirectorErrorState {
  if (err instanceof GeminiRequestError) {
    return {
      message: err.message,
      userAction: err.userAction,
      kind: err.kind,
      rawDetails: err.rawDetails || err.stack,
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      rawDetails: err.stack,
    };
  }
  return {
    message: String(err),
  };
}

function summarizeAuditCounts(report: AuditReport): {
  errors: number;
  warns: number;
  infos: number;
} {
  let errors = 0;
  let warns = 0;
  let infos = 0;
  for (const issue of report.issues) {
    if (issue.severity === 'error') errors += 1;
    else if (issue.severity === 'warn') warns += 1;
    else infos += 1;
  }
  return { errors, warns, infos };
}

function DirectorLabInner() {
  const { theme, setTheme } = useTheme();
  const isDarkTheme = theme !== 'light';

  // Settings / credentials state
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [backupModel, setBackupModel] = useState('');
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>({
    requestsMade: 0,
    promptTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
  });

  // Generator controls
  const [prompt, setPrompt] = useState(DIRECTOR_TEST_FIXTURES[0].text);
  const [format, setFormat] = useState<VideoFormat>('9:16');
  const [targetSecondsText, setTargetSecondsText] = useState('12');
  const [avoidHistory, setAvoidHistory] = useState<AvoidLookCombination[]>([]);

  // Active generation run state
  const [generating, setGenerating] = useState(false);
  const [statusEvent, setStatusEvent] = useState<GenerateStatusEvent | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorState, setErrorState] = useState<DirectorErrorState | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // Result display
  const [currentResult, setCurrentResult] = useState<GenerateSpecResult | null>(
    null
  );
  const [playerLoadId, setPlayerLoadId] = useState(1);
  const [showJson, setShowJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  // Export state
  const [exportMode, setExportMode] = useState<ExportMode>('standard');
  const [exportState, setExportState] = useState<{
    exporting: boolean;
    progress: ExportMp4Progress | null;
    error: string | null;
    lastResult: {
      bytes: number;
      elapsedMs: number;
      codec: string;
      mode: ExportMode;
      audioLabel: string;
    } | null;
  }>({
    exporting: false,
    progress: null,
    error: null,
    lastResult: null,
  });

  // Batch test runner state
  const [checkedFixtureIds, setCheckedFixtureIds] = useState<number[]>(() => [
    ...DEFAULT_CHECKED_FIXTURE_IDS,
  ]);
  const [testResults, setTestResults] = useState<StoredTestRunEntry[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [batchStopReason, setBatchStopReason] = useState<string | null>(null);
  const [quotaConfirm, setQuotaConfirm] = useState<QuotaConfirmPrompt | null>(
    null
  );

  const singleAbortRef = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<PlayerRef | null>(null);

  // Hydrate credentials, avoid history, export mode, and stored test results
  useEffect(() => {
    let active = true;
    const rafId = requestAnimationFrame(() => {
      if (!active) return;
      const storedKey = getStoredApiKey();
      const storedModel = getStoredModel();
      const storedBackup = getStoredBackupModel();
      setApiKey(storedKey);
      setSelectedModel(storedModel);
      setBackupModel(storedBackup);
      setAvoidHistory(loadAvoidHistory());
      setTestResults(loadStoredTestResults());
      setExportMode(getStoredExportMode());

      if (storedKey) {
        listGeminiModels(storedKey)
          .then((res) => {
            if (active) setModels(res.models);
          })
          .catch(() => {
            // Ignore background model refresh error on lab load
          });
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Pre-warm fonts
  useEffect(() => {
    ensureFonts({ timeoutMs: 4500, hasBengali: true }).catch(() => {
      // Non-fatal
    });
  }, []);

  // Live elapsed timer during active single generation
  useEffect(() => {
    if (!generating) {
      return;
    }
    const start = performance.now();
    const id = setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 100);
    return () => clearInterval(id);
  }, [generating]);

  const parsedTargetSeconds = useMemo(() => {
    const n = Number(targetSecondsText.trim());
    if (!targetSecondsText.trim() || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
    return Math.min(90, Math.max(2, Math.round(n)));
  }, [targetSecondsText]);

  const pushToAvoidHistory = useCallback((spec: VideoSpec) => {
    const entry: AvoidLookCombination = {
      style: spec.style,
      palette:
        spec.theme.paletteName === 'custom'
          ? 'custom'
          : spec.theme.paletteName,
      mood: spec.theme.mood,
    };
    setAvoidHistory((prev) => {
      const deduped = prev.filter(
        (p) =>
          !(
            p.style === entry.style &&
            p.palette === entry.palette &&
            p.mood === entry.mood
          )
      );
      const next = [entry, ...deduped].slice(0, MAX_AVOID_HISTORY);
      saveAvoidHistory(next);
      return next;
    });
  }, []);

  const recordSessionTokens = useCallback((res: GenerateSpecResult) => {
    setSessionUsage((prev) => ({
      requestsMade: prev.requestsMade + res.calls,
      promptTokens: prev.promptTokens + res.tokens.prompt,
      outputTokens: prev.outputTokens + res.tokens.output,
      thoughtTokens: (prev.thoughtTokens ?? 0) + res.tokens.thinking,
    }));
  }, []);

  const runSingleGeneration = useCallback(
    async (opts: { isReroll: boolean }) => {
      if (generating || batchRunning) return;

      const controller = new AbortController();
      singleAbortRef.current = controller;

      setGenerating(true);
      setElapsedMs(0);
      setErrorState(null);
      setShowErrorDetails(false);
      setExportState((prev) => ({ ...prev, error: null }));
      setStatusEvent({ phase: 'writing', message: 'writing the design' });

      let effectiveAvoid = avoidHistory;
      if (opts.isReroll && currentResult) {
        const currentCombo: AvoidLookCombination = {
          style: currentResult.spec.style,
          palette:
            currentResult.spec.theme.paletteName === 'custom'
              ? 'custom'
              : currentResult.spec.theme.paletteName,
          mood: currentResult.spec.theme.mood,
        };
        const already = effectiveAvoid.some(
          (a) =>
            a.style === currentCombo.style &&
            a.palette === currentCombo.palette &&
            a.mood === currentCombo.mood
        );
        if (!already) {
          effectiveAvoid = [currentCombo, ...effectiveAvoid].slice(
            0,
            MAX_AVOID_HISTORY
          );
        }
      }

      try {
        const result = await generateSpec({
          prompt,
          format,
          targetSeconds: parsedTargetSeconds,
          avoid: effectiveAvoid,
          apiKey: apiKey || undefined,
          modelName: selectedModel || undefined,
          backupModelName: backupModel || undefined,
          seed: opts.isReroll ? pickInitialSeed() : undefined,
          signal: controller.signal,
          onStatus: (ev) => setStatusEvent(ev),
        });

        setCurrentResult(result);
        setPlayerLoadId((id) => id + 1);
        setShowWarnings(false);
        pushToAvoidHistory(result.spec);
        recordSessionTokens(result);
      } catch (err) {
        if (isAbortError(err)) {
          setStatusEvent({ phase: 'done', message: 'stopped' });
        } else {
          setErrorState(toErrorState(err));
          setStatusEvent(null);
        }
      } finally {
        singleAbortRef.current = null;
        setGenerating(false);
      }
    },
    [
      apiKey,
      avoidHistory,
      backupModel,
      batchRunning,
      currentResult,
      format,
      generating,
      parsedTargetSeconds,
      prompt,
      pushToAvoidHistory,
      recordSessionTokens,
      selectedModel,
    ]
  );

  const handleStopSingle = useCallback(() => {
    singleAbortRef.current?.abort();
  }, []);

  const handleClearAvoid = useCallback(() => {
    setAvoidHistory([]);
    saveAvoidHistory([]);
  }, []);

  const activeSpec = currentResult?.spec ?? null;
  const dims = activeSpec ? getSpecDimensions(activeSpec) : { width: 1080, height: 1920 };
  const durationInFrames = activeSpec ? totalFrames(activeSpec) : 1;
  const activePosterFrame = activeSpec ? posterFrame(activeSpec) : 0;
  const playerInputProps = useMemo(
    () => (activeSpec ? { spec: activeSpec } : null),
    [activeSpec]
  );
  const audioStatus = useAudioRenderStatus(activeSpec);
  const soundEnabled = isAudioActive(activeSpec?.audio);

  const handleToggleSpeaker = useCallback(() => {
    if (!currentResult) return;
    const spec = currentResult.spec;
    if (!spec.audio) {
      const style = pickDefaultMusicStyleForTheme(spec.style, spec.theme.mood);
      const res = applyOps(spec, [
        {
          type: 'setMusic',
          source: 'synth',
          style,
          seed: spec.seed,
          volume: DEFAULT_MUSIC_VOLUME,
        },
        { type: 'setSfx', sfx: 'auto' },
      ]);
      setCurrentResult({ ...currentResult, spec: res.spec });
      return;
    }
    const nextMute = !spec.audio.mute;
    const res = applyOps(spec, [{ type: 'muteAudio', mute: nextMute }]);
    setCurrentResult({ ...currentResult, spec: res.spec });
  }, [currentResult]);

  // Seek player cleanly to posterFrame when a new result is loaded
  useEffect(() => {
    if (!activeSpec) return;
    const frame = posterFrame(activeSpec);
    const id = requestAnimationFrame(() => {
      playerRef.current?.pause();
      playerRef.current?.seekTo(frame);
    });
    return () => cancelAnimationFrame(id);
  }, [activeSpec, playerLoadId]);

  const handleSeekIssue = useCallback(
    (issue: AuditIssue) => {
      if (!activeSpec || typeof issue.frame !== 'number') return;
      const clamped = Math.max(0, Math.min(durationInFrames - 1, issue.frame));
      playerRef.current?.pause();
      playerRef.current?.seekTo(clamped);
    },
    [activeSpec, durationInFrames]
  );

  const handleCopyJson = useCallback(async () => {
    if (!activeSpec) return;
    try {
      await navigator.clipboard.writeText(serializeSpecClean(activeSpec));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }, [activeSpec]);

  const handleExportModeChange = useCallback((mode: ExportMode) => {
    setExportMode(mode);
    setStoredExportMode(mode);
  }, []);

  const runExportMp4 = useCallback(
    async (modeOverride?: ExportMode) => {
      if (!activeSpec) return;
      const effectiveMode = modeOverride ?? exportMode;
      if (modeOverride) {
        setExportMode(modeOverride);
        setStoredExportMode(modeOverride);
      }

      setExportState({
        exporting: true,
        progress: null,
        error: null,
        lastResult: null,
      });

      try {
        await ensureFonts({ timeoutMs: 4500, hasBengali: true });
        const result = await exportCompositionToMp4({
          compositionId: 'director-kit-video',
          component: VideoFromSpec,
          inputProps: { spec: activeSpec },
          durationInFrames,
          fps: activeSpec.fps,
          width: dims.width,
          height: dims.height,
          mode: effectiveMode,
          muted: !isAudioActive(activeSpec.audio),
          onProgress: (p) => {
            setExportState((prev) => ({ ...prev, progress: p }));
          },
        });

        const url = URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${
          activeSpec.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'director-video'
        }-${activeSpec.format.replace(':', 'x')}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        setExportState({
          exporting: false,
          progress: null,
          error: null,
          lastResult: {
            bytes: result.blob.size,
            elapsedMs: Math.round(result.elapsedMs),
            codec: result.codec,
            mode: result.mode,
            audioLabel: describeAudioSummary(activeSpec.audio),
          },
        });
      } catch (err) {
        setExportState({
          exporting: false,
          progress: null,
          error:
            err instanceof Error ? err.message : 'Browser MP4 export failed.',
          lastResult: null,
        });
      }
    },
    [activeSpec, dims.height, dims.width, durationInFrames, exportMode]
  );

  const toggleFixtureChecked = useCallback((id: number) => {
    setCheckedFixtureIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)
    );
  }, []);

  const executeBatchFixtures = useCallback(
    async (fixtureIds: number[]) => {
      if (batchRunning || generating || fixtureIds.length === 0) return;

      const selectedFixtures = DIRECTOR_TEST_FIXTURES.filter((f) =>
        fixtureIds.includes(f.id)
      );
      if (selectedFixtures.length === 0) return;

      const controller = new AbortController();
      batchAbortRef.current = controller;
      setBatchRunning(true);
      setBatchStopReason(null);
      setQuotaConfirm(null);
      setErrorState(null);

      let collected: StoredTestRunEntry[] = [];
      let localAvoid = [...avoidHistory];

      try {
        for (let idx = 0; idx < selectedFixtures.length; idx++) {
          if (controller.signal.aborted) {
            break;
          }
          const fixture: DirectorTestFixture = selectedFixtures[idx];
          setBatchStatus(
            `Running fixture #${fixture.id} (${idx + 1}/${selectedFixtures.length})...`
          );

          try {
            const res = await generateSpec({
              prompt: fixture.text,
              format: fixture.format,
              targetSeconds: fixture.targetSeconds,
              avoid: localAvoid,
              apiKey: apiKey || undefined,
              modelName: selectedModel || undefined,
              backupModelName: backupModel || undefined,
              signal: controller.signal,
              onStatus: (ev) => {
                setBatchStatus(
                  `Fixture #${fixture.id} (${idx + 1}/${selectedFixtures.length}): ${ev.message}`
                );
              },
            });

            const entry: StoredTestRunEntry = {
              fixtureId: fixture.id,
              label: fixture.label,
              format: fixture.format,
              targetSeconds: fixture.targetSeconds,
              status: 'ok',
              result: res,
            };

            collected = [...collected, entry].slice(0, MAX_STORED_TEST_RESULTS);
            setTestResults(collected);
            saveStoredTestResults(collected);
            recordSessionTokens(res);

            const look: AvoidLookCombination = {
              style: res.spec.style,
              palette:
                res.spec.theme.paletteName === 'custom'
                  ? 'custom'
                  : res.spec.theme.paletteName,
              mood: res.spec.theme.mood,
            };
            localAvoid = [look, ...localAvoid].slice(0, MAX_AVOID_HISTORY);
            setAvoidHistory(localAvoid);
            saveAvoidHistory(localAvoid);

            if (idx === 0) {
              setCurrentResult(res);
              setPlayerLoadId((n) => n + 1);
            }
          } catch (err) {
            if (isAbortError(err)) {
              setBatchStopReason('Batch run stopped by user.');
              break;
            }

            const errMessage = err instanceof Error ? err.message : String(err);
            const errKind =
              err instanceof GeminiRequestError ? err.kind : undefined;

            const failedEntry: StoredTestRunEntry = {
              fixtureId: fixture.id,
              label: fixture.label,
              format: fixture.format,
              targetSeconds: fixture.targetSeconds,
              status: 'error',
              errorMessage: errMessage,
              errorKind: errKind,
            };
            collected = [...collected, failedEntry].slice(
              0,
              MAX_STORED_TEST_RESULTS
            );
            setTestResults(collected);
            saveStoredTestResults(collected);

            if (errKind === 'quota_day') {
              setBatchStopReason(
                `Stopped at fixture #${fixture.id}: daily quota reached (${errMessage}). Kept ${collected.length} completed result${collected.length === 1 ? '' : 's'}.`
              );
              break;
            }

            if (errKind === 'auth') {
              setBatchStopReason(
                `Stopped at fixture #${fixture.id}: ${errMessage}`
              );
              break;
            }
          }

          if (idx < selectedFixtures.length - 1 && !controller.signal.aborted) {
            setBatchStatus(
              `Cooling down ${(BATCH_PAUSE_MS / 1000).toFixed(1)}s before next fixture...`
            );
            try {
              await sleepAbortable(BATCH_PAUSE_MS, controller.signal);
            } catch {
              setBatchStopReason('Batch run stopped by user.');
              break;
            }
          }
        }
      } finally {
        batchAbortRef.current = null;
        setBatchRunning(false);
        setBatchStatus(null);
      }
    },
    [
      apiKey,
      avoidHistory,
      backupModel,
      batchRunning,
      generating,
      recordSessionTokens,
      selectedModel,
    ]
  );

  const handleRunSelectedFixtures = useCallback(async () => {
    if (batchRunning || generating || checkedFixtureIds.length === 0) return;

    const estimatedMaxRequests = checkedFixtureIds.length * 2;
    const activeModel = selectedModel.trim();

    if (activeModel) {
      const dailyLimit = getStoredDailyRequestLimit(activeModel);
      if (typeof dailyLimit === 'number' && dailyLimit > 0) {
        const usage = await getQuotaDayUsageSummary();
        const bareKey = normalizeUsageModelName(activeModel);
        const modelUsage = usage.models.find((m) => m.model === bareKey);
        const usedToday = modelUsage?.requests ?? 0;
        const remaining = Math.max(0, dailyLimit - usedToday);

        if (estimatedMaxRequests > remaining) {
          setQuotaConfirm({
            fixtureIds: [...checkedFixtureIds],
            estimatedMaxRequests,
            usedToday,
            dailyLimit,
            modelLabel: formatShortModelName(activeModel),
          });
          return;
        }
      }
    }

    await executeBatchFixtures(checkedFixtureIds);
  }, [
    batchRunning,
    checkedFixtureIds,
    executeBatchFixtures,
    generating,
    selectedModel,
  ]);

  const handleStopBatch = useCallback(() => {
    batchAbortRef.current?.abort();
  }, []);

  const handleClearTestResults = useCallback(() => {
    setTestResults([]);
    saveStoredTestResults([]);
    setBatchStopReason(null);
  }, []);

  const varietyReport = useMemo(() => {
    const validEntries = testResults
      .filter((entry) => entry.status === 'ok' && entry.result)
      .map((entry) => ({
        id: entry.fixtureId,
        spec: entry.result!.spec,
        calls: entry.result!.calls,
        usedRepair: entry.result!.usedRepair,
        usedRevise: entry.result!.usedRevise,
      }));
    return computeVarietyReport(validEntries);
  }, [testResults]);

  const auditCounts = useMemo(
    () => (currentResult ? summarizeAuditCounts(currentResult.auditAfter) : null),
    [currentResult]
  );

  const shortModelLabel = selectedModel
    ? formatShortModelName(selectedModel)
    : 'No model';

  return (
    <div
      className={`min-h-screen overflow-x-hidden bg-bg text-text ${KIT_FONT_CLASS_NAMES}`}
    >
      {/* Top Bar */}
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2.5 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/lab"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Lab
            </Link>
            <span className="text-border" aria-hidden="true">
              /
            </span>
            <Link
              href="/lab/kit"
              className="hidden sm:inline-flex shrink-0 items-center text-xs font-medium text-text-secondary hover:text-text whitespace-nowrap"
            >
              Kit Workbench
            </Link>
            <span className="hidden sm:inline text-border" aria-hidden="true">
              /
            </span>
            <h1 className="truncate text-sm sm:text-base font-semibold tracking-tight text-text">
              AI Art Director
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{shortModelLabel}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              aria-label="Toggle color theme"
            >
              {isDarkTheme ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            <select
              aria-label="Export mode"
              value={exportMode}
              onChange={(e) =>
                handleExportModeChange(e.target.value as ExportMode)
              }
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
            >
              <option value="standard">Standard</option>
              <option value="compatibility">Compatibility</option>
            </select>

            <Button
              variant="primary"
              size="sm"
              disabled={!activeSpec || exportState.exporting}
              loading={exportState.exporting}
              onClick={() => runExportMp4()}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {exportState.exporting && exportState.progress
                  ? exportState.progress.phase === 'audio'
                    ? 'Rendering audio...'
                    : `Exporting ${exportState.progress.progressPercent}%`
                  : 'Export MP4'}
              </span>
              <span className="sm:hidden">
                {exportState.exporting && exportState.progress
                  ? exportState.progress.phase === 'audio'
                    ? 'Audio...'
                    : `${exportState.progress.progressPercent}%`
                  : 'MP4'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 pb-16">
        {/* Missing API key / model banner */}
        {(!apiKey || !selectedModel) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                {!apiKey
                  ? 'No Gemini API key saved yet. Add your key in Settings to generate specs.'
                  : 'No Gemini model selected yet. Pick a primary model in Settings.'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Open Settings
            </Button>
          </div>
        )}

        {/* Export feedback strip */}
        {(exportState.error || exportState.lastResult) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {exportState.error ? (
                <span className="font-medium text-danger">
                  Export error: {exportState.error}
                </span>
              ) : null}
              {exportState.lastResult ? (
                <span className="font-medium text-success tabular-nums">
                  Exported{' '}
                  {(exportState.lastResult.bytes / (1024 * 1024)).toFixed(2)} MB
                  MP4 ({exportState.lastResult.codec},{' '}
                  {exportState.lastResult.mode}) in{' '}
                  {(exportState.lastResult.elapsedMs / 1000).toFixed(1)}s ·{' '}
                  {exportState.lastResult.audioLabel}
                </span>
              ) : null}
            </div>
            {exportState.lastResult && activeSpec ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-text-muted">
                  Seeing glitches? Re-export in compatibility mode.
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exportState.exporting}
                  onClick={() => runExportMp4('compatibility')}
                >
                  Re-export (compatibility mode)
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Prompt + Result Grid */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Prompt Controls + Status + Error + JSON */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text">
                  Prompt & Art Direction
                </h2>
                <select
                  aria-label="Load test fixture into prompt"
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const found = DIRECTOR_TEST_FIXTURES.find((f) => f.id === id);
                    if (found) {
                      setPrompt(found.text);
                      setFormat(found.format);
                      setTargetSecondsText(String(found.targetSeconds));
                    }
                  }}
                  className="max-w-[180px] rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text-secondary"
                >
                  <option value="" disabled>
                    Load test fixture…
                  </option>
                  {DIRECTOR_TEST_FIXTURES.map((f) => (
                    <option key={f.id} value={f.id}>
                      #{f.id} ({f.format})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
                <span>Prompt</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Describe your video, audience, product, tone, language..."
                  className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5 text-xs text-text-secondary">
                  <span>Format</span>
                  <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                    {FORMAT_OPTIONS.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormat(fmt)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums cursor-pointer ${
                          format === fmt
                            ? 'border border-border bg-surface-1 text-text'
                            : 'text-text-secondary hover:text-text'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
                  <span>Target seconds (optional)</span>
                  <input
                    type="number"
                    min={2}
                    max={90}
                    step={1}
                    value={targetSecondsText}
                    onChange={(e) => setTargetSecondsText(e.target.value)}
                    placeholder="Auto"
                    className="w-28 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={generating || batchRunning || !prompt.trim()}
                  loading={generating}
                  onClick={() => runSingleGeneration({ isReroll: false })}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={generating || batchRunning || !prompt.trim()}
                  onClick={() => runSingleGeneration({ isReroll: true })}
                  title="Generate with a new seed and avoid the current look"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-roll
                </Button>

                {generating ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleStopSingle}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : null}

                {(generating || statusEvent) && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary tabular-nums">
                    <span>{statusEvent?.message ?? 'working'}</span>
                    {generating ? (
                      <span className="text-text-muted">
                        · {(elapsedMs / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </span>
                )}
              </div>

              {statusEvent?.detail ? (
                <div className="text-[11px] text-text-muted">
                  {statusEvent.detail}
                </div>
              ) : null}

              {/* Anti-sameness avoid strip */}
              <div className="border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                  <span>
                    Anti-sameness avoid list (last {MAX_AVOID_HISTORY})
                  </span>
                  {avoidHistory.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearAvoid}
                      className="text-[11px] font-medium text-text-secondary hover:text-text cursor-pointer"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {avoidHistory.length === 0 ? (
                  <p className="mt-1 text-[11px] text-text-muted">
                    Empty — recent style, palette, and mood combinations will be
                    recorded here automatically.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {avoidHistory.map((item, idx) => (
                      <span
                        key={`${item.style}-${item.palette}-${item.mood}-${idx}`}
                        className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary"
                      >
                        {item.style} · {item.palette} · {item.mood}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Real Error Box */}
            {errorState ? (
              <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs text-danger">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <div className="font-semibold">{errorState.message}</div>
                      {errorState.userAction ? (
                        <div className="text-text-secondary">
                          {errorState.userAction}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {(errorState.kind === 'auth' ||
                    errorState.kind === 'model_not_found' ||
                    !apiKey ||
                    !selectedModel) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSettingsOpen(true)}
                    >
                      {errorState.kind === 'model_not_found' && !backupModel
                        ? 'Set a backup model'
                        : 'Open Settings'}
                    </Button>
                  )}
                  {errorState.rawDetails ? (
                    <button
                      type="button"
                      onClick={() => setShowErrorDetails((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text cursor-pointer"
                    >
                      {showErrorDetails ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Details
                    </button>
                  ) : null}
                </div>

                {showErrorDetails && errorState.rawDetails ? (
                  <pre className="max-h-40 overflow-auto rounded-lg border border-danger/30 bg-surface-1 p-2 font-mono text-[10px] text-text-secondary whitespace-pre-wrap break-all">
                    {errorState.rawDetails}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {/* Collapsible JSON Viewer */}
            {activeSpec ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowJson((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-text hover:text-accent cursor-pointer"
                  >
                    {showJson ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Code2 className="h-3.5 w-3.5 text-accent" />
                    Generated VideoSpec JSON
                  </button>
                  <Button variant="secondary" size="sm" onClick={handleCopyJson}>
                    {copiedJson ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                {showJson ? (
                  <pre className="max-h-[380px] overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                    {serializeSpecClean(activeSpec)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Right: Result Panel + Remotion Player + Audit */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-1 p-4">
              {currentResult && activeSpec && playerInputProps ? (
                <>
                  {/* Art Direction Brief & Look Chips */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-text">
                        {activeSpec.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        {audioStatus.active && audioStatus.status.state === 'preparing' ? (
                          <span className="text-[11px] font-medium text-accent">
                            Preparing sound...
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleToggleSpeaker}
                          aria-label={soundEnabled ? 'Mute sound' : 'Unmute or enable sound'}
                          title={`${describeAudioSummary(activeSpec.audio)} — click to toggle`}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                            soundEnabled
                              ? 'border-accent/40 bg-accent/10 text-accent'
                              : 'border-border bg-surface-2 text-text-secondary hover:text-text'
                          }`}
                        >
                          {soundEnabled ? (
                            <Volume2 className="h-3.5 w-3.5" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5" />
                          )}
                          <span>{describeAudioSummary(activeSpec.audio)}</span>
                        </button>
                        <span className="text-xs text-text-muted tabular-nums">
                          {dims.width}×{dims.height} ·{' '}
                          {(durationInFrames / activeSpec.fps).toFixed(1)}s ·{' '}
                          {activeSpec.scenes.length} scene
                          {activeSpec.scenes.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <p className="rounded-lg border border-border/70 bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text">
                      <span className="font-semibold text-accent">Brief: </span>
                      {currentResult.brief}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-medium text-text">
                        style: {STYLE_DEFS[activeSpec.style].label}
                      </span>
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-medium text-text">
                        palette: {activeSpec.theme.paletteName}
                      </span>
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-medium text-text">
                        mood: {activeSpec.theme.mood}
                      </span>
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-medium text-text">
                        intensity: {activeSpec.intensity}
                      </span>
                      {activeSpec.numerals === 'bn' ? (
                        <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400">
                          numerals: bn
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Remotion Player */}
                  <div className="flex items-center justify-center rounded-lg border border-border bg-surface-2 p-2 sm:p-3">
                    <div
                      style={{
                        width: '100%',
                        maxWidth:
                          activeSpec.format === '9:16'
                            ? 320
                            : activeSpec.format === '1:1'
                              ? 420
                              : 660,
                        aspectRatio: `${dims.width} / ${dims.height}`,
                      }}
                    >
                      <Player
                        key={`${playerLoadId}-${activeSpec.format}-${durationInFrames}`}
                        ref={playerRef}
                        component={VideoFromSpec}
                        inputProps={playerInputProps}
                        compositionWidth={dims.width}
                        compositionHeight={dims.height}
                        durationInFrames={durationInFrames}
                        fps={activeSpec.fps}
                        initialFrame={activePosterFrame}
                        controls
                        loop
                        clickToPlay
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats Bar */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs tabular-nums">
                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <div className="text-[11px] text-text-muted">Audit</div>
                      <div className="font-semibold text-text">
                        {currentResult.auditBefore.score} →{' '}
                        <span
                          className={
                            currentResult.auditAfter.score >= 85
                              ? 'text-emerald-400'
                              : currentResult.auditAfter.score >= 65
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }
                        >
                          {currentResult.auditAfter.score}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <div className="text-[11px] text-text-muted">
                        Requests
                      </div>
                      <div className="font-semibold text-text">
                        {currentResult.calls} call
                        {currentResult.calls === 1 ? '' : 's'}
                        {currentResult.usedRepair
                          ? ' (repair)'
                          : currentResult.usedRevise
                            ? ' (revise)'
                            : ''}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <div className="text-[11px] text-text-muted">
                        Tokens (P/O/T)
                      </div>
                      <div className="font-semibold text-text">
                        {currentResult.tokens.prompt} /{' '}
                        {currentResult.tokens.output} /{' '}
                        {currentResult.tokens.thinking}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <div className="text-[11px] text-text-muted">
                        Time · Model
                      </div>
                      <div className="truncate font-semibold text-text">
                        {(currentResult.ms / 1000).toFixed(1)}s ·{' '}
                        {formatShortModelName(currentResult.model)}
                      </div>
                    </div>
                  </div>

                  {/* Audit Issues List */}
                  <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold text-text">
                        <ShieldCheck className="h-4 w-4 text-accent" />
                        Quality Audit ({currentResult.auditAfter.issues.length}{' '}
                        remaining)
                      </div>
                      {auditCounts ? (
                        <div className="flex items-center gap-2 text-[11px] tabular-nums">
                          <span className="text-red-400">
                            {auditCounts.errors} err
                          </span>
                          <span className="text-amber-400">
                            {auditCounts.warns} warn
                          </span>
                          <span className="text-text-muted">
                            {auditCounts.infos} info
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {currentResult.auditAfter.issues.length === 0 ? (
                      <p className="mt-2 text-[11px] text-emerald-400">
                        Zero audit issues remaining.
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-44 space-y-1.5 overflow-auto">
                        {currentResult.auditAfter.issues.map((issue) => (
                          <li key={issue.id}>
                            <button
                              type="button"
                              onClick={() => handleSeekIssue(issue)}
                              className="flex w-full items-start justify-between gap-2 rounded-md border border-border/70 bg-surface-1 px-2.5 py-1.5 text-left hover:border-accent cursor-pointer"
                            >
                              <div className="min-w-0">
                                <span
                                  className={`mr-1.5 font-mono text-[10px] font-semibold uppercase ${
                                    issue.severity === 'error'
                                      ? 'text-red-400'
                                      : issue.severity === 'warn'
                                        ? 'text-amber-400'
                                        : 'text-text-muted'
                                  }`}
                                >
                                  {issue.severity}
                                </span>
                                <span className="font-mono text-[10px] text-text-muted">
                                  [{issue.code}]
                                </span>{' '}
                                <span className="text-text">{issue.message}</span>
                              </div>
                              {typeof issue.frame === 'number' ? (
                                <span className="shrink-0 font-mono text-[10px] text-text-muted tabular-nums">
                                  @{issue.frame}f
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {currentResult.warnings.length > 0 ? (
                      <div className="mt-2 border-t border-border/60 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowWarnings((v) => !v)}
                          className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text cursor-pointer"
                        >
                          {showWarnings ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          Auto-fix & normalizer notes (
                          {currentResult.warnings.length})
                        </button>
                        {showWarnings ? (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-text-secondary">
                            {currentResult.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                  <Play className="h-8 w-8 text-text-muted" />
                  <div className="max-w-sm space-y-1">
                    <p className="text-sm font-semibold text-text">
                      No generated video yet
                    </p>
                    <p className="text-xs text-text-secondary">
                      Enter a prompt on the left and click Generate, or run the
                      Test fixtures below and tap any row to preview it here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Test Fixtures Runner & Variety Report */}
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text">Test fixtures</h2>
              <p className="text-xs text-text-secondary">
                Select test fixtures to run sequentially (1.5s pause between
                runs) and score variety.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={batchRunning}
                onClick={() =>
                  setCheckedFixtureIds([...DEFAULT_CHECKED_FIXTURE_IDS])
                }
              >
                Default (1,3,4,6)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={batchRunning}
                onClick={() =>
                  setCheckedFixtureIds(DIRECTOR_TEST_FIXTURES.map((f) => f.id))
                }
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={batchRunning}
                onClick={() => setCheckedFixtureIds([])}
              >
                None
              </Button>

              {testResults.length > 0 && !batchRunning ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearTestResults}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear results
                </Button>
              ) : null}

              <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-secondary tabular-nums">
                Est. up to {checkedFixtureIds.length * 2} requests
              </span>

              {batchRunning ? (
                <Button variant="danger" size="sm" onClick={handleStopBatch}>
                  <Square className="h-3.5 w-3.5" />
                  Stop batch
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    generating ||
                    batchRunning ||
                    checkedFixtureIds.length === 0
                  }
                  onClick={handleRunSelectedFixtures}
                >
                  <Play className="h-3.5 w-3.5" />
                  Run selected ({checkedFixtureIds.length})
                </Button>
              )}
            </div>
          </div>

          {/* Quota Confirmation Banner (never window.confirm) */}
          {quotaConfirm ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-300">
                  Daily request estimate exceeds remaining quota on{' '}
                  {quotaConfirm.modelLabel}
                </div>
                <div className="text-text-secondary tabular-nums">
                  Used today: {quotaConfirm.usedToday} /{' '}
                  {quotaConfirm.dailyLimit}. Selected{' '}
                  {quotaConfirm.fixtureIds.length} fixtures may make up to{' '}
                  {quotaConfirm.estimatedMaxRequests} requests.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuotaConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    executeBatchFixtures(quotaConfirm.fixtureIds)
                  }
                >
                  Run anyway
                </Button>
              </div>
            </div>
          ) : null}

          {batchStatus ? (
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
              {batchStatus}
            </div>
          ) : null}

          {batchStopReason ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {batchStopReason}
            </div>
          ) : null}

          {/* 12 Fixture Checklist */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DIRECTOR_TEST_FIXTURES.map((fixture) => {
              const checked = checkedFixtureIds.includes(fixture.id);
              return (
                <label
                  key={fixture.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                    checked
                      ? 'border-accent/60 bg-accent/5'
                      : 'border-border bg-surface-2/60 hover:border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={batchRunning}
                    onChange={() => toggleFixtureChecked(fixture.id)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-text">
                        Test fixture #{fixture.id}
                      </span>
                      <span className="shrink-0 rounded bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums">
                        {fixture.format} · {fixture.targetSeconds}s
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-secondary">
                      {fixture.text}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Variety Report */}
          {testResults.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Variety Report ({varietyReport.total} valid run
                  {varietyReport.total === 1 ? '' : 's'})
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary">
                    Styles:{' '}
                    <strong className="text-text">
                      {varietyReport.distinctStyles}
                    </strong>
                  </span>
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary">
                    Palettes:{' '}
                    <strong className="text-text">
                      {varietyReport.distinctPalettes}
                    </strong>
                  </span>
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary">
                    Moods:{' '}
                    <strong className="text-text">
                      {varietyReport.distinctMoods}
                    </strong>
                  </span>
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary">
                    Layout seqs:{' '}
                    <strong className="text-text">
                      {varietyReport.distinctLayoutSequences}
                    </strong>
                  </span>
                  <span
                    className={`rounded-md border px-2 py-1 font-semibold ${
                      varietyReport.isLowVariety
                        ? 'border-red-500/50 bg-red-500/15 text-red-400'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    Uniqueness: {varietyReport.uniquenessPercent}%
                  </span>
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary">
                    Repair/revise:{' '}
                    <strong className="text-text">
                      {varietyReport.repairOrReviseCount}
                    </strong>{' '}
                    (avg {varietyReport.avgCalls} calls)
                  </span>
                </div>
              </div>

              {/* Results Table (scroll container prevents phone horizontal overflow) */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[780px] text-left text-xs">
                  <thead className="border-b border-border bg-surface-2 text-[11px] text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">ID</th>
                      <th className="px-3 py-2 font-medium">Style</th>
                      <th className="px-3 py-2 font-medium">Palette</th>
                      <th className="px-3 py-2 font-medium">Mood</th>
                      <th className="px-3 py-2 font-medium">Intensity</th>
                      <th className="px-3 py-2 font-medium">Layouts</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2 font-medium">Sec</th>
                      <th className="px-3 py-2 font-medium">Calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {testResults.map((entry) => {
                      if (entry.status === 'error' || !entry.result) {
                        return (
                          <tr
                            key={`err-${entry.fixtureId}`}
                            className="bg-danger/5 text-danger"
                          >
                            <td className="px-3 py-2 font-semibold tabular-nums">
                              #{entry.fixtureId}
                            </td>
                            <td colSpan={9} className="px-3 py-2">
                              Failed: {entry.errorMessage ?? 'Unknown error'}
                            </td>
                          </tr>
                        );
                      }

                      const res = entry.result;
                      const totalTok =
                        res.tokens.prompt +
                        res.tokens.output +
                        res.tokens.thinking;
                      const isActive =
                        currentResult?.spec.title === res.spec.title &&
                        currentResult?.ms === res.ms;

                      return (
                        <tr
                          key={`ok-${entry.fixtureId}-${res.ms}`}
                          onClick={() => {
                            setCurrentResult(res);
                            setPlayerLoadId((n) => n + 1);
                            setErrorState(null);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`cursor-pointer transition-colors hover:bg-surface-2 ${
                            isActive ? 'bg-accent/10' : 'bg-surface-1'
                          }`}
                        >
                          <td className="px-3 py-2 font-semibold text-text tabular-nums">
                            #{entry.fixtureId}
                          </td>
                          <td className="px-3 py-2 text-text">
                            {res.spec.style}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {res.spec.theme.paletteName}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {res.spec.theme.mood}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {res.spec.intensity}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-text">
                            {formatLayoutSequence(res.spec, true)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text">
                            {res.auditBefore.score} →{' '}
                            <span
                              className={
                                res.auditAfter.score >= 85
                                  ? 'font-semibold text-emerald-400'
                                  : res.auditAfter.score >= 65
                                    ? 'font-semibold text-amber-400'
                                    : 'font-semibold text-red-400'
                              }
                            >
                              {res.auditAfter.score}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text-secondary">
                            {totalTok}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text-secondary">
                            {(res.ms / 1000).toFixed(1)}s
                          </td>
                          <td className="px-3 py-2 tabular-nums text-text-secondary">
                            {res.calls}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        selectedModel={selectedModel}
        backupModel={backupModel}
        models={models}
        sessionUsage={sessionUsage}
        onResetSessionUsage={() =>
          setSessionUsage({
            requestsMade: 0,
            promptTokens: 0,
            outputTokens: 0,
            thoughtTokens: 0,
          })
        }
        onApiKeyUpdated={(newKey) => {
          setApiKey(newKey);
          listGeminiModels(newKey)
            .then((res) => setModels(res.models))
            .catch(() => {});
        }}
        onApiKeyRemoved={() => {
          setApiKey('');
          setModels([]);
          setSelectedModel('');
          setBackupModel('');
          clearStoredModel();
          clearStoredBackupModel();
        }}
        onModelsUpdated={(updated, nextModel) => {
          setModels(updated);
          if (nextModel) setSelectedModel(nextModel);
        }}
        onModelSelected={(m) => setSelectedModel(m)}
        onBackupModelSelected={(m) => setBackupModel(m)}
        onLocalDataDeleted={async () => {
          setAvoidHistory([]);
          saveAvoidHistory([]);
          setTestResults([]);
          saveStoredTestResults([]);
        }}
      />
    </div>
  );
}

export function DirectorLabClient() {
  return (
    <ToastProvider>
      <DirectorLabInner />
    </ToastProvider>
  );
}
