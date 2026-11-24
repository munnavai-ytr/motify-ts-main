'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Player, type CallbackListener, type PlayerRef } from '@remotion/player';
import type { WebRendererHardwareAcceleration } from '@remotion/web-renderer';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Film,
  Maximize2,
  MoreHorizontal,
  PauseCircle,
  Play,
  RefreshCw,
  Settings,
  Square,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatAttemptLabel } from '@/lib/ai/animator';
import { formatSeconds } from '@/lib/ai/plan-schema';
import { compileComponent, type CompiledComponentType } from '@/lib/compile';
import {
  exportCompositionToMp4,
  formatBitrate,
  formatExportModeLabel,
  type ExportMode,
  type ExportMp4Progress,
} from '@/lib/export';
import { getStoredExportMode, setStoredExportMode } from '@/lib/storage';
import type {
  Plan,
  VideoMessage,
  VideoSceneRecord,
  VideoSceneStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  buildAssembledTimeline,
  createAssembledComposition,
  toAssembledInputProps,
} from '@/lib/video/assemble';
import { secondsToFrames } from '@/lib/video/dimensions';
import {
  notifyVideoPlayerStarted,
  registerVideoPlayer,
} from '@/lib/video/player-coordinator';

interface VideoCardProps {
  message: VideoMessage;
  linkedPlan: Plan | null;
  compiledBySceneId: Record<string, CompiledComponentType>;
  isAnyBuildRunning: boolean;
  activeSceneStatusDetail?: string | null;
  activeWaitStartedAt?: number | null;
  hasBackupModel?: boolean;
  onOpenSettings?: () => void;
  onStopBuild: () => void;
  onResumeBuild: (videoMessageId: string) => void;
  onRebuildScene: (videoMessageId: string, sceneId: string) => void;
  onRetryFailedScenes: (videoMessageId: string) => void;
  onViewCode: (sceneName: string, code: string) => void;
  onRuntimeErrorDetected?: (videoMessageId: string, errorMessage: string) => void;
}

function useLiveNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
}

function formatMs(ms: number): string {
  return `${Math.max(0, ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function sceneStatusMeta(
  status: VideoSceneStatus,
  isOutdated: boolean
): {
  label: string;
  variant: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  spinning?: boolean;
} {
  if (isOutdated && status === 'ok') {
    return { label: 'Outdated', variant: 'warning' };
  }
  switch (status) {
    case 'pending':
      return { label: 'Pending', variant: 'default' };
    case 'writing':
      return { label: 'Writing', variant: 'accent', spinning: true };
    case 'checking':
      return { label: 'Checking', variant: 'accent', spinning: true };
    case 'repairing':
      return { label: 'Repairing', variant: 'warning', spinning: true };
    case 'ok':
      return { label: 'OK', variant: 'success' };
    case 'failed':
      return { label: 'Failed', variant: 'danger' };
    case 'outdated':
      return { label: 'Outdated', variant: 'warning' };
  }
}

function PlayerErrorBridge({
  errorMessage,
  onReport,
}: {
  errorMessage: string;
  onReport: (msg: string) => void;
}) {
  useEffect(() => {
    onReport(errorMessage);
  }, [errorMessage, onReport]);

  return null;
}

interface SceneCompileFailure {
  sceneId: string;
  sceneName: string;
  error: string;
}

interface SupersededCompileResult {
  signature: string;
  compiledBySceneId: Record<string, CompiledComponentType>;
  errors: SceneCompileFailure[];
}

const supersededCompileCache = new Map<string, SupersededCompileResult>();

function getSupersededCompileSignature(scenes: VideoSceneRecord[]): string {
  return scenes
    .map((s) => `${s.sceneId}:${s.status}:${s.code.length}:${s.specHash}`)
    .join('|');
}

function compileSupersededMessage(
  message: VideoMessage
): SupersededCompileResult {
  const signature = getSupersededCompileSignature(message.scenes);
  const cached = supersededCompileCache.get(message.id);
  if (cached && cached.signature === signature) {
    return cached;
  }

  const compiledBySceneId: Record<string, CompiledComponentType> = {};
  const errors: SceneCompileFailure[] = [];

  for (const record of message.scenes) {
    if (record.status !== 'ok' && record.status !== 'outdated') {
      continue;
    }
    if (!record.code.trim()) {
      errors.push({
        sceneId: record.sceneId,
        sceneName: record.name,
        error: 'Scene code is empty.',
      });
      continue;
    }
    const res = compileComponent(record.code);
    if (res.ok) {
      compiledBySceneId[record.sceneId] = res.component;
    } else {
      errors.push({
        sceneId: record.sceneId,
        sceneName: record.name,
        error: res.error,
      });
    }
  }

  const result: SupersededCompileResult = {
    signature,
    compiledBySceneId,
    errors,
  };
  supersededCompileCache.set(message.id, result);
  return result;
}

export function VideoCard({
  message,
  linkedPlan,
  compiledBySceneId,
  isAnyBuildRunning,
  activeSceneStatusDetail,
  activeWaitStartedAt,
  hasBackupModel = false,
  onOpenSettings,
  onStopBuild,
  onResumeBuild,
  onRebuildScene,
  onRetryFailedScenes,
  onViewCode,
  onRuntimeErrorDetected,
}: VideoCardProps) {
  const { showToast } = useToast();
  const isSuperseded = message.status === 'superseded';
  const liveNow = useLiveNow(message.status === 'building');
  const playerCoordinatorId = useId();
  const playerRef = useRef<PlayerRef | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportUrlRef = useRef<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [supersededPlayerLoaded, setSupersededPlayerLoaded] = useState(false);
  const [supersededCompileResult, setSupersededCompileResult] =
    useState<SupersededCompileResult | null>(null);
  const [supersededScenesExpanded, setSupersededScenesExpanded] =
    useState(false);
  const [expandedDebugSceneIds, setExpandedDebugSceneIds] = useState<
    Record<string, boolean>
  >({});
  const [exportMode, setExportMode] = useState<ExportMode>(() =>
    getStoredExportMode()
  );
  const [exportState, setExportState] = useState<
    | { status: 'idle' }
    | { status: 'exporting'; mode: ExportMode; progress: ExportMp4Progress }
    | {
        status: 'done';
        url: string;
        sizeBytes: number;
        codec: string;
        mode: ExportMode;
        hardwareAcceleration: WebRendererHardwareAcceleration;
        videoBitrate: number | null;
        usedFallback: boolean;
        fallbackMessage?: string;
        elapsedMs: number;
      }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const effectiveCompiledBySceneId = useMemo(
    () =>
      isSuperseded
        ? (supersededCompileResult?.compiledBySceneId ?? {})
        : compiledBySceneId,
    [isSuperseded, supersededCompileResult, compiledBySceneId]
  );

  const timelineSummary = useMemo(
    () =>
      buildAssembledTimeline({
        video: message,
        linkedPlan,
        compiledBySceneId: effectiveCompiledBySceneId,
      }),
    [message, linkedPlan, effectiveCompiledBySceneId]
  );

  const AssembledComponent = useMemo(
    () => createAssembledComposition(effectiveCompiledBySceneId),
    [effectiveCompiledBySceneId]
  );

  const inputProps = useMemo(
    () => toAssembledInputProps(timelineSummary),
    [timelineSummary]
  );

  const estimatedPlayableSummary = useMemo(() => {
    const planScenesById = new Map(
      (linkedPlan?.scenes ?? []).map((s) => [s.id, s])
    );
    const orderedRecords = linkedPlan
      ? linkedPlan.scenes
          .map((ps) => message.scenes.find((r) => r.sceneId === ps.id))
          .filter((r): r is VideoSceneRecord => Boolean(r))
      : message.scenes;

    let okCount = 0;
    let totalFrames = 0;
    for (const record of orderedRecords) {
      if (record.status !== 'ok' && record.status !== 'outdated') continue;
      okCount += 1;
      const livePlanScene = planScenesById.get(record.sceneId);
      totalFrames += livePlanScene
        ? secondsToFrames(livePlanScene.durationSeconds, message.fps)
        : Math.max(1, Math.round(3 * message.fps));
    }
    return { okCount, totalFrames };
  }, [linkedPlan, message.scenes, message.fps]);

  const isPlayerMounted = isSuperseded
    ? supersededPlayerLoaded && timelineSummary.entries.length > 0
    : timelineSummary.entries.length > 0;

  const reportPlaybackError = useCallback(
    (errMsg: string) => {
      if (isSuperseded) return;
      onRuntimeErrorDetected?.(message.id, errMsg);
    },
    [isSuperseded, message.id, onRuntimeErrorDetected]
  );

  useEffect(() => {
    if (!isPlayerMounted) return;
    const unregister = registerVideoPlayer(playerCoordinatorId, () => {
      playerRef.current?.pause();
    });
    const player = playerRef.current;
    const onPlayerError: CallbackListener<'error'> = (event) => {
      const msg =
        event.detail.error instanceof Error
          ? event.detail.error.message
          : String(event.detail.error);
      reportPlaybackError(msg);
    };
    const onPlayerPlay: CallbackListener<'play'> = () => {
      notifyVideoPlayerStarted(playerCoordinatorId);
    };
    player?.addEventListener('error', onPlayerError);
    player?.addEventListener('play', onPlayerPlay);
    return () => {
      player?.removeEventListener('error', onPlayerError);
      player?.removeEventListener('play', onPlayerPlay);
      unregister();
    };
  }, [
    isPlayerMounted,
    playerCoordinatorId,
    reportPlaybackError,
    timelineSummary.entries.length,
  ]);

  useEffect(() => {
    if (!isSuperseded || !supersededPlayerLoaded) return;
    const target = playerContainerRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting) {
          setSupersededPlayerLoaded(false);
        }
      },
      { root: null, rootMargin: '400px 0px' }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [isSuperseded, supersededPlayerLoaded]);

  const renderPlayerErrorFallback = useCallback(
    ({ error }: { error: Error }) => (
      <div className="flex h-full w-full items-center justify-center bg-surface-2 p-4 text-center">
        <PlayerErrorBridge
          errorMessage={error.message || 'Playback runtime error'}
          onReport={reportPlaybackError}
        />
        <div className="max-w-xs space-y-1">
          <p className="text-xs font-semibold text-danger">
            Scene runtime error
          </p>
          <p className="font-mono text-[11px] text-text-secondary break-words">
            {error.message}
          </p>
        </div>
      </div>
    ),
    [reportPlaybackError]
  );

  const handleTapToLoadVideo = () => {
    const compiled = compileSupersededMessage(message);
    setSupersededCompileResult(compiled);
    setSupersededPlayerLoaded(true);
  };

  const totalTokens = message.scenes.reduce((sum, s) => sum + s.tokens, 0);
  const totalPromptTokens = message.scenes.reduce(
    (sum, s) => sum + (s.promptTokens ?? 0),
    0
  );
  const totalOutputTokens = message.scenes.reduce(
    (sum, s) => sum + (s.outputTokens ?? 0),
    0
  );
  const totalThoughtTokens = message.scenes.reduce(
    (sum, s) => sum + (s.thoughtTokens ?? 0),
    0
  );
  const outdatedSet = new Set(timelineSummary.outdatedSceneIds);

  const handleCopyDebugInfo = async () => {
    setMenuOpen(false);
    const answeringModels = Array.from(
      new Set(
        message.scenes
          .map((s) => s.modelName)
          .filter((m): m is string => Boolean(m))
      )
    );
    const payload = {
      videoMessageId: message.id,
      version: message.version,
      planMessageId: message.planMessageId,
      planVersion: message.planVersion,
      status: message.status,
      pauseReason: message.pauseReason,
      pauseMessage: message.pauseMessage,
      modelName: message.modelName,
      answeringModels:
        answeringModels.length > 0 ? answeringModels : [message.modelName],
      format: message.format,
      width: message.width,
      height: message.height,
      fps: message.fps,
      startedAt: new Date(message.startedAt).toISOString(),
      finishedAt: message.finishedAt
        ? new Date(message.finishedAt).toISOString()
        : null,
      tokenUsage: {
        totalTokens,
        promptTokens: totalPromptTokens,
        outputTokens: totalOutputTokens,
        thoughtTokens: totalThoughtTokens,
      },
      scenes: message.scenes.map((s) => ({
        sceneId: s.sceneId,
        name: s.name,
        status: s.status,
        statusNote: s.statusNote,
        modelName: s.modelName ?? message.modelName,
        specHash: s.specHash,
        tokens: s.tokens,
        promptTokens: s.promptTokens ?? 0,
        outputTokens: s.outputTokens ?? 0,
        thoughtTokens: s.thoughtTokens ?? 0,
        elapsedMs: s.elapsedMs,
        error: s.error,
        attempts: s.attempts,
        rawOutputs: s.rawOutputs,
        code: s.code,
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      showToast('Debug info copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'danger');
    }
  };

  const handleSelectExportMode = (nextMode: ExportMode) => {
    setExportMode(nextMode);
    setStoredExportMode(nextMode);
  };

  const handleExportMp4 = async (modeOverride?: ExportMode) => {
    if (exportState.status === 'exporting') {
      return;
    }

    const activeMode: ExportMode = modeOverride ?? exportMode;
    if (modeOverride) {
      setExportMode(modeOverride);
    }
    setStoredExportMode(activeMode);

    let exportSummary = timelineSummary;
    let exportComponent = AssembledComponent;
    let exportProps = inputProps;

    if (isSuperseded) {
      const compiled = compileSupersededMessage(message);
      setSupersededCompileResult(compiled);
      exportSummary = buildAssembledTimeline({
        video: message,
        linkedPlan,
        compiledBySceneId: compiled.compiledBySceneId,
      });
      if (exportSummary.entries.length === 0 || exportSummary.totalFrames <= 0) {
        setExportState({
          status: 'error',
          message:
            compiled.errors[0]?.error ||
            'No playable scenes could be compiled for MP4 export.',
        });
        return;
      }
      exportComponent = createAssembledComposition(compiled.compiledBySceneId);
      exportProps = toAssembledInputProps(exportSummary);
    } else if (
      exportSummary.entries.length === 0 ||
      exportSummary.totalFrames <= 0
    ) {
      return;
    }

    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }

    const controller = new AbortController();
    exportAbortRef.current = controller;

    setExportState({
      status: 'exporting',
      mode: activeMode,
      progress: {
        progressPercent: 0,
        encodedFrames: 0,
        totalFrames: exportSummary.totalFrames,
        elapsedMs: 0,
        mode: activeMode,
      },
    });

    try {
      const result = await exportCompositionToMp4({
        compositionId: `motionai-v${message.version}`,
        component: exportComponent,
        inputProps: exportProps,
        durationInFrames: exportSummary.totalFrames,
        fps: message.fps,
        width: message.width,
        height: message.height,
        mode: activeMode,
        signal: controller.signal,
        onProgress: (progress) => {
          setExportState({ status: 'exporting', mode: activeMode, progress });
        },
      });

      const objectUrl = URL.createObjectURL(result.blob);
      exportUrlRef.current = objectUrl;
      setExportState({
        status: 'done',
        url: objectUrl,
        sizeBytes: result.blob.size,
        codec: result.codec,
        mode: result.mode,
        hardwareAcceleration: result.hardwareAcceleration,
        videoBitrate: result.videoBitrate,
        usedFallback: result.usedFallback,
        fallbackMessage: result.fallbackMessage,
        elapsedMs: result.elapsedMs,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setExportState({ status: 'idle' });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setExportState({
        status: 'error',
        message: msg || 'MP4 export failed.',
      });
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
    }
  };

  const handleFullscreen = () => {
    setMenuOpen(false);
    playerRef.current?.requestFullscreen();
  };

  if (message.status === 'building') {
    const doneCount = message.scenes.filter((s) => s.status === 'ok').length;
    const elapsedBuildMs = Math.max(0, liveNow - message.startedAt);
    const waitElapsedMs = Math.max(
      0,
      liveNow - (activeWaitStartedAt ?? message.startedAt)
    );
    const showSlowHint = waitElapsedMs >= 25_000;
    const activeScene = message.scenes.find(
      (s) =>
        s.status === 'writing' ||
        s.status === 'checking' ||
        s.status === 'repairing'
    );
    const fallbackStatusLine = activeScene
      ? activeScene.status === 'checking'
        ? `Checking ${activeScene.name}...`
        : activeScene.status === 'repairing'
          ? `Repairing ${activeScene.name}...`
          : `Writing ${activeScene.name}...`
      : 'Preparing build...';

    return (
      <article
        aria-label={`Building video version ${message.version}`}
        className="rounded-[16px] border border-border bg-surface-1 p-4 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm font-semibold tracking-tight text-text">
              Building video v{message.version}
            </span>
            <span className="font-mono text-[11px] text-text-muted tabular-nums">
              ({doneCount}/{message.scenes.length})
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="font-mono text-xs text-text-muted tabular-nums">
              {formatMs(elapsedBuildMs)}
            </span>
            {totalTokens > 0 && (
              <span className="font-mono text-[11px] text-text-muted tabular-nums">
                · {totalTokens.toLocaleString()} tok
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={onStopBuild}>
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </Button>
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-surface-2/60 px-3 py-2 text-xs space-y-1">
          <p className="text-text-secondary break-words">
            {activeSceneStatusDetail || fallbackStatusLine}
          </p>
          {showSlowHint && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-warning">
                Still waiting for Google. You can stop and retry, or switch model in Settings.
              </span>
              <Button variant="ghost" size="sm" onClick={onStopBuild}>
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </Button>
            </div>
          )}
        </div>

        <ol className="space-y-2">
          {message.scenes.map((scene, idx) => {
            const meta = sceneStatusMeta(scene.status, false);
            const isActive =
              scene.status === 'writing' ||
              scene.status === 'checking' ||
              scene.status === 'repairing';

            return (
              <li
                key={scene.sceneId}
                className={cn(
                  'rounded-[12px] border px-3 py-2.5 text-xs transition-colors',
                  isActive
                    ? 'border-accent/40 bg-accent/6'
                    : 'border-border bg-surface-2/50'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="font-mono text-[11px] text-text-muted tabular-nums">
                      {idx + 1}.
                    </span>
                    <span dir="auto" className="truncate font-medium text-text">
                      {scene.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {scene.elapsedMs > 0 && (
                      <span className="font-mono text-[11px] text-text-muted tabular-nums">
                        {formatMs(scene.elapsedMs)}
                      </span>
                    )}
                    {scene.tokens > 0 && (
                      <span className="font-mono text-[11px] text-text-muted tabular-nums">
                        {scene.tokens.toLocaleString()} tok
                      </span>
                    )}
                    <Badge variant={meta.variant}>
                      {meta.spinning && <Spinner size="sm" className="h-3 w-3" />}
                      <span>{meta.label}</span>
                    </Badge>
                  </div>
                </div>

                {scene.statusNote && (
                  <p className="mt-1.5 text-[11px] font-medium text-warning">
                    {scene.statusNote}
                  </p>
                )}

                {isActive && activeSceneStatusDetail && (
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {activeSceneStatusDetail}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </article>
    );
  }

  const playableCount = timelineSummary.entries.length;
  const okSceneCount = estimatedPlayableSummary.okCount;
  const headerDurationFrames =
    playableCount > 0
      ? timelineSummary.totalFrames
      : estimatedPlayableSummary.totalFrames;
  const canShowExport = isSuperseded ? okSceneCount > 0 : playableCount > 0;
  const failedCount = message.scenes.filter((s) => s.status === 'failed').length;
  const pendingCount = message.scenes.filter((s) => s.status === 'pending').length;
  const buildElapsedMs =
    message.finishedAt !== undefined
      ? Math.max(0, message.finishedAt - message.startedAt)
      : message.scenes.reduce((sum, s) => sum + s.elapsedMs, 0);

  const playerAspectClass =
    message.format === '9:16'
      ? 'aspect-[9/16] max-h-[60dvh] md:max-h-[420px] w-auto mx-auto'
      : message.format === '1:1'
        ? 'aspect-square max-h-[60dvh] md:max-h-[340px] w-auto mx-auto'
        : 'aspect-video w-full';

  const statusBadge = isSuperseded
    ? { label: 'Earlier version', variant: 'default' as const }
    : message.status === 'ready'
      ? { label: 'Ready', variant: 'success' as const }
      : message.status === 'paused'
        ? { label: 'Paused', variant: 'warning' as const }
        : message.status === 'partial'
          ? { label: 'Partial', variant: 'warning' as const }
          : { label: 'Failed', variant: 'danger' as const };

  const firstStoredError = message.scenes.find((s) => s.error)?.error;
  const hasModelNotFoundFailure =
    !hasBackupModel &&
    Boolean(onOpenSettings) &&
    message.scenes.some(
      (s) =>
        s.status === 'failed' &&
        (s.errorKind === 'model_not_found' ||
          Boolean(s.error?.includes('not found for this key')))
    );
  const supersededErrors = supersededCompileResult?.errors ?? [];
  const scenesListOpen = isSuperseded ? supersededScenesExpanded : true;

  return (
    <article
      aria-label={
        isSuperseded
          ? `Video version ${message.version} (earlier version)`
          : `Video version ${message.version}`
      }
      className={cn(
        'rounded-[16px] border p-4 space-y-3.5',
        isSuperseded
          ? 'border-border/60 bg-surface-1/70'
          : 'border-border bg-surface-1'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
              Video v{message.version}
            </span>
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            <Badge variant="default">{message.format}</Badge>
            {headerDurationFrames > 0 && (
              <Badge variant={isSuperseded ? 'default' : 'accent'}>
                {formatSeconds(headerDurationFrames / message.fps)}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-text-muted tabular-nums">
            Plan v{message.planVersion} · {formatMs(buildElapsedMs)} ·{' '}
            {totalTokens.toLocaleString()} tokens
          </p>
        </div>

        <div className="relative flex shrink-0 items-center gap-1.5" ref={menuRef}>
          {!isSuperseded && message.status === 'paused' && (
            <Button
              variant="primary"
              size="sm"
              disabled={isAnyBuildRunning}
              onClick={() => onResumeBuild(message.id)}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Resume</span>
            </Button>
          )}

          {canShowExport && (
            <Button
              variant="secondary"
              size="sm"
              disabled={
                exportState.status === 'exporting' ||
                (!isSuperseded && isAnyBuildRunning)
              }
              loading={exportState.status === 'exporting'}
              onClick={() => void handleExportMp4()}
            >
              <Film className="h-3.5 w-3.5" />
              <span>
                {exportState.status === 'exporting' ? 'Exporting' : 'Export MP4'}
              </span>
            </Button>
          )}

          <button
            type="button"
            aria-label="More video actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-2 text-text-secondary hover:bg-surface-1 hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-20 min-w-[180px] rounded-[12px] border border-border bg-surface-1 p-1.5 shadow-lg"
            >
              {isPlayerMounted && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleFullscreen}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-text hover:bg-surface-2 cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-text-secondary" />
                  <span>Full screen</span>
                </button>
              )}
              {!isSuperseded && message.status === 'paused' && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={isAnyBuildRunning}
                  onClick={() => {
                    setMenuOpen(false);
                    onResumeBuild(message.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 text-text-secondary" />
                  <span>Resume</span>
                </button>
              )}
              {!isSuperseded && failedCount > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={isAnyBuildRunning}
                  onClick={() => {
                    setMenuOpen(false);
                    onRetryFailedScenes(message.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-text-secondary" />
                  <span>Retry failed</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleCopyDebugInfo()}
                className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-text hover:bg-surface-2 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5 text-text-secondary" />
                <span>Copy debug info</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isSuperseded ? (
        <div ref={playerContainerRef} className="space-y-2">
          <div
            className={cn(
              'overflow-hidden rounded-[12px] border border-border/70',
              isPlayerMounted ? 'bg-black' : 'bg-surface-2/70',
              playerAspectClass
            )}
          >
            {okSceneCount === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
                <AlertCircle className="h-5 w-5 text-warning" />
                <p className="text-xs font-semibold text-text">
                  No playable scenes in this earlier version
                </p>
                <p className="max-w-xs font-mono text-[11px] text-text-secondary break-words line-clamp-4">
                  {firstStoredError ||
                    'No scenes completed successfully in this build.'}
                </p>
              </div>
            ) : !supersededPlayerLoaded ? (
              <button
                type="button"
                onClick={handleTapToLoadVideo}
                className="flex h-full w-full flex-col items-center justify-center gap-2.5 p-4 text-center transition-colors hover:bg-surface-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1 text-text shadow-sm">
                  <Play className="h-5 w-5 fill-current ml-0.5" />
                </span>
                <span className="text-xs font-semibold text-text">
                  Tap to load video
                </span>
                <span className="font-mono text-[11px] text-text-muted tabular-nums">
                  {okSceneCount} {okSceneCount === 1 ? 'scene' : 'scenes'} ·{' '}
                  {formatSeconds(headerDurationFrames / message.fps)} ·{' '}
                  {message.width}×{message.height}
                </span>
              </button>
            ) : playableCount === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center overflow-y-auto">
                <AlertCircle className="h-5 w-5 shrink-0 text-danger" />
                <p className="text-xs font-semibold text-danger">
                  Could not compile this earlier version
                </p>
                <div className="max-w-sm space-y-1 text-left">
                  {supersededErrors.length > 0 ? (
                    supersededErrors.map((err) => (
                      <p
                        key={err.sceneId}
                        className="font-mono text-[11px] text-text-secondary break-words"
                      >
                        <strong className="text-text">{err.sceneName}:</strong>{' '}
                        {err.error}
                      </p>
                    ))
                  ) : (
                    <p className="font-mono text-[11px] text-text-secondary">
                      No scenes could be compiled for playback.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <ErrorBoundary
                resetKey={`${message.id}-${timelineSummary.totalFrames}-${playableCount}`}
                fallback={(error) => (
                  <div className="flex h-full w-full items-center justify-center bg-surface-2 p-4 text-center">
                    <p className="font-mono text-xs text-danger break-words">
                      {error.message}
                    </p>
                  </div>
                )}
              >
                <Player
                  ref={playerRef}
                  component={AssembledComponent}
                  inputProps={inputProps}
                  durationInFrames={Math.max(1, timelineSummary.totalFrames)}
                  compositionWidth={message.width}
                  compositionHeight={message.height}
                  fps={message.fps}
                  controls
                  loop
                  noSuspense
                  acknowledgeRemotionLicense
                  errorFallback={renderPlayerErrorFallback}
                  style={{ width: '100%', height: '100%' }}
                />
              </ErrorBoundary>
            )}
          </div>

          {isPlayerMounted && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-text-muted tabular-nums">
                {playableCount} of {message.scenes.length} scenes ·{' '}
                {message.width}×{message.height} · {message.fps} fps
              </span>
              <Button variant="ghost" size="sm" onClick={handleFullscreen}>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Full screen</span>
              </Button>
            </div>
          )}

          {supersededPlayerLoaded &&
            playableCount > 0 &&
            supersededErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-[12px] border border-warning/35 bg-warning/10 p-3 text-xs space-y-1"
              >
                <p className="font-medium text-text">
                  {supersededErrors.length}{' '}
                  {supersededErrors.length === 1 ? 'scene' : 'scenes'} failed to
                  compile in this earlier version:
                </p>
                {supersededErrors.map((err) => (
                  <p
                    key={err.sceneId}
                    className="font-mono text-[11px] text-text-secondary break-words"
                  >
                    <strong className="text-text">{err.sceneName}:</strong>{' '}
                    {err.error}
                  </p>
                ))}
              </div>
            )}
        </div>
      ) : (
        playableCount > 0 && (
          <div className="space-y-2">
            <div
              className={cn(
                'overflow-hidden rounded-[12px] border border-border bg-black',
                playerAspectClass
              )}
            >
              <ErrorBoundary
                resetKey={`${message.id}-${timelineSummary.totalFrames}-${playableCount}`}
                onError={(err) =>
                  onRuntimeErrorDetected?.(message.id, err.message)
                }
                fallback={(error) => (
                  <div className="flex h-full w-full items-center justify-center bg-surface-2 p-4 text-center">
                    <p className="font-mono text-xs text-danger break-words">
                      {error.message}
                    </p>
                  </div>
                )}
              >
                <Player
                  ref={playerRef}
                  component={AssembledComponent}
                  inputProps={inputProps}
                  durationInFrames={Math.max(1, timelineSummary.totalFrames)}
                  compositionWidth={message.width}
                  compositionHeight={message.height}
                  fps={message.fps}
                  controls
                  loop
                  noSuspense
                  acknowledgeRemotionLicense
                  errorFallback={renderPlayerErrorFallback}
                  style={{ width: '100%', height: '100%' }}
                />
              </ErrorBoundary>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-text-muted tabular-nums">
                {playableCount} of {message.scenes.length} scenes · {message.width}×
                {message.height} · {message.fps} fps
              </span>
              <Button variant="ghost" size="sm" onClick={handleFullscreen}>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Full screen</span>
              </Button>
            </div>
          </div>
        )
      )}

      {!isSuperseded && message.status === 'paused' && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] border border-warning/35 bg-warning/10 p-3 text-xs text-text"
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {message.pauseReason === 'google_busy'
                ? message.pauseMessage ||
                  `Paused with ${pendingCount} pending ${pendingCount === 1 ? 'scene' : 'scenes'}. Resume when ready, or choose another model in Settings.`
                : `Build stopped — ${pendingCount} unbuilt ${pendingCount === 1 ? 'scene' : 'scenes'} kept pending. Click Resume to continue.`}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={isAnyBuildRunning}
            onClick={() => onResumeBuild(message.id)}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Resume</span>
          </Button>
        </div>
      )}

      {!isSuperseded &&
        (message.status === 'partial' || message.status === 'failed') && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] border border-warning/35 bg-warning/10 p-3 text-xs text-text"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                {message.status === 'partial'
                  ? `${failedCount} ${failedCount === 1 ? 'scene' : 'scenes'} could not be built. Working scenes are playable.`
                  : 'No scenes could be built. Check the scene errors below and retry.'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {hasModelNotFoundFailure && onOpenSettings && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenSettings}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Set a backup model</span>
                </Button>
              )}
              {failedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isAnyBuildRunning}
                  onClick={() => onRetryFailedScenes(message.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry failed</span>
                </Button>
              )}
            </div>
          </div>
        )}

      {!isSuperseded && outdatedSet.size > 0 && (
        <div className="rounded-[12px] border border-border bg-surface-2/60 px-3 py-2 text-xs text-text-secondary">
          {outdatedSet.size} {outdatedSet.size === 1 ? 'scene was' : 'scenes were'}{' '}
          updated in the plan. Click <strong className="text-text">Update video</strong>{' '}
          on the plan card to rebuild only what changed.
        </div>
      )}

      {canShowExport && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border/70 bg-surface-2/40 px-3 py-2 text-xs">
          <span className="text-[11px] font-medium text-text-secondary">
            Export mode
          </span>
          <div
            role="group"
            aria-label="MP4 export mode"
            className="inline-flex rounded-[8px] border border-border bg-surface-1 p-0.5"
          >
            {(['standard', 'compatibility'] as const).map((modeOption) => {
              const selected = exportMode === modeOption;
              return (
                <button
                  key={modeOption}
                  type="button"
                  disabled={exportState.status === 'exporting'}
                  aria-pressed={selected}
                  onClick={() => handleSelectExportMode(modeOption)}
                  className={cn(
                    'min-h-[28px] rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50',
                    selected
                      ? 'bg-accent text-accent-fg'
                      : 'text-text-secondary hover:text-text'
                  )}
                >
                  {formatExportModeLabel(modeOption)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {exportState.status !== 'idle' && (
        <div className="rounded-[12px] border border-border bg-surface-2/70 p-3 space-y-2">
          {exportState.status === 'exporting' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-text">
                  Exporting MP4 ·{' '}
                  {formatExportModeLabel(
                    exportState.progress.mode ?? exportState.mode
                  )}
                  {exportState.progress.codec
                    ? ` (${exportState.progress.codec})`
                    : ''}{' '}
                  ({exportState.progress.progressPercent}%)
                </span>
                <span className="font-mono text-[11px] text-text-secondary tabular-nums">
                  {exportState.progress.encodedFrames}/
                  {exportState.progress.totalFrames} frames ·{' '}
                  {formatMs(exportState.progress.elapsedMs)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-1">
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${exportState.progress.progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-text-muted">
                  Keep this browser tab open while exporting.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => exportAbortRef.current?.abort()}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          {exportState.status === 'done' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5 text-xs text-text">
                  <div className="font-medium">MP4 ready</div>
                  <div className="font-mono text-[11px] text-text-secondary tabular-nums">
                    {formatExportModeLabel(exportState.mode)} · {exportState.codec} ·{' '}
                    {formatBitrate(exportState.videoBitrate)} ·{' '}
                    {formatBytes(exportState.sizeBytes)} ·{' '}
                    {formatMs(exportState.elapsedMs)}
                  </div>
                </div>
                <a
                  href={exportState.url}
                  download={`motionai-v${message.version}.mp4`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download MP4</span>
                </a>
              </div>

              {exportState.fallbackMessage && (
                <p className="rounded-[8px] border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-[11px] text-text-secondary break-words">
                  {exportState.fallbackMessage}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                <span className="text-[11px] text-text-muted">
                  Seeing glitches? Re-export in compatibility mode.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isSuperseded && isAnyBuildRunning}
                  onClick={() => void handleExportMp4('compatibility')}
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Re-export (compatibility mode)</span>
                </Button>
              </div>
            </div>
          )}

          {exportState.status === 'error' && (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 font-mono text-xs text-danger break-words">
                Export failed: {exportState.message}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExportMp4()}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border/70 pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-text-secondary">
            Scenes ({message.scenes.length})
          </h4>
          {isSuperseded && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={scenesListOpen}
              onClick={() => setSupersededScenesExpanded((prev) => !prev)}
            >
              <span>{scenesListOpen ? 'Hide scenes' : 'Scenes'}</span>
              {scenesListOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        {scenesListOpen && (
          <ol className="space-y-2">
            {message.scenes.map((record: VideoSceneRecord, idx: number) => {
              const isOutdated = !isSuperseded && outdatedSet.has(record.sceneId);
              const meta = sceneStatusMeta(record.status, isOutdated);
              const attemptLabel = formatAttemptLabel(record.attempts);
              const showSceneDebug = Boolean(expandedDebugSceneIds[record.sceneId]);
              const hasTokenBreakdown =
                record.promptTokens !== undefined ||
                record.outputTokens !== undefined ||
                record.thoughtTokens !== undefined;

              return (
                <li
                  key={record.sceneId}
                  className="rounded-[12px] border border-border bg-surface-2/50 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="font-mono text-[11px] font-semibold text-text-muted tabular-nums">
                        {idx + 1}.
                      </span>
                      <span dir="auto" className="truncate text-xs font-medium text-text">
                        {record.name}
                      </span>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {attemptLabel && (
                        <span className="text-[11px] text-text-muted">
                          {attemptLabel}
                        </span>
                      )}
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                  </div>

                  {record.status === 'pending' && record.statusNote && (
                    <p className="text-[11px] text-text-secondary">
                      {record.statusNote}
                    </p>
                  )}

                  {record.status === 'failed' && record.error && (
                    <p className="rounded-[8px] border border-danger/30 bg-danger/8 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-danger break-words">
                      {record.error}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-text-muted tabular-nums">
                        {formatMs(record.elapsedMs)} · {record.tokens.toLocaleString()}{' '}
                        tok
                      </span>
                      {(hasTokenBreakdown || record.attempts.length > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebugSceneIds((prev) => ({
                              ...prev,
                              [record.sceneId]: !prev[record.sceneId],
                            }))
                          }
                          className="inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-surface-1 hover:text-text cursor-pointer"
                        >
                          <span>Debug</span>
                          {showSceneDebug ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {record.code && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewCode(record.name, record.code)}
                        >
                          View code
                        </Button>
                      )}
                      {record.status === 'failed' &&
                        !hasBackupModel &&
                        onOpenSettings &&
                        (record.errorKind === 'model_not_found' ||
                          Boolean(
                            record.error?.includes('not found for this key')
                          )) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={onOpenSettings}
                          >
                            <Settings className="h-3 w-3" />
                            <span>Set a backup model</span>
                          </Button>
                        )}
                      {!isSuperseded && (
                        <Button
                          variant={record.status === 'failed' ? 'secondary' : 'ghost'}
                          size="sm"
                          disabled={isAnyBuildRunning}
                          onClick={() => onRebuildScene(message.id, record.sceneId)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>
                            {record.status === 'failed' ? 'Retry' : 'Rebuild scene'}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {showSceneDebug && (
                    <div className="rounded-[8px] border border-border bg-surface-1 px-2.5 py-2 font-mono text-[11px] text-text-secondary space-y-1">
                      {record.modelName && (
                        <div>
                          Model: {record.modelName.replace(/^models\//, '')}
                        </div>
                      )}
                      {hasTokenBreakdown && (
                        <div className="tabular-nums">
                          Prompt: {(record.promptTokens ?? 0).toLocaleString()} ·
                          Output: {(record.outputTokens ?? 0).toLocaleString()} ·
                          Thinking: {(record.thoughtTokens ?? 0).toLocaleString()}
                        </div>
                      )}
                      {record.attempts.length > 0 && (
                        <div>
                          Attempts:{' '}
                          {record.attempts
                            .map(
                              (a, i) =>
                                `#${i + 1} ${a.outcome}${a.modelName ? ` (${a.modelName.replace(/^models\//, '')})` : ''}`
                            )
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </article>
  );
}
