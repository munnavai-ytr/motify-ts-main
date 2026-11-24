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
import { AlertCircle, Copy, Download, Film, Maximize2, Play } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { compileComponent, type CompiledComponentType } from '@/lib/compile';
import {
  exportCompositionToMp4,
  type ExportMode,
  type ExportMp4Progress,
} from '@/lib/export';
import { getStoredExportMode, setStoredExportMode } from '@/lib/storage';
import type { LegacyVideoMessage, Plan, VideoSceneRecord } from '@/lib/types';
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

interface LegacyVideoCardProps {
  message: LegacyVideoMessage;
  linkedPlan: Plan | null;
  autoLoad?: boolean;
}

interface CompiledCacheEntry {
  signature: string;
  compiledBySceneId: Record<string, CompiledComponentType>;
}

const legacyCompileCache = new Map<string, CompiledCacheEntry>();

function compileLegacyScenes(message: LegacyVideoMessage): Record<string, CompiledComponentType> {
  const sig = message.scenes
    .map((s) => `${s.sceneId}:${s.status}:${s.code.length}:${s.specHash}`)
    .join('|');
  const cached = legacyCompileCache.get(message.id);
  if (cached && cached.signature === sig) {
    return cached.compiledBySceneId;
  }

  const compiledBySceneId: Record<string, CompiledComponentType> = {};
  for (const record of message.scenes) {
    if (record.status !== 'ok' && record.status !== 'outdated') continue;
    if (!record.code.trim()) continue;
    const res = compileComponent(record.code);
    if (res.ok) {
      compiledBySceneId[record.sceneId] = res.component;
    }
  }
  legacyCompileCache.set(message.id, { signature: sig, compiledBySceneId });
  return compiledBySceneId;
}

function formatDur(sec: number): string {
  return `${Math.round(sec * 10) / 10}s`;
}

export function LegacyVideoCard({
  message,
  linkedPlan,
  autoLoad = false,
}: LegacyVideoCardProps) {
  const { showToast } = useToast();
  const playerId = useId();
  const playerRef = useRef<PlayerRef | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportUrlRef = useRef<string | null>(null);

  const [loaded, setLoaded] = useState(autoLoad);
  const [exportMode, setExportMode] = useState<ExportMode>(() =>
    getStoredExportMode()
  );
  const [exportState, setExportState] = useState<
    | { status: 'idle' }
    | { status: 'exporting'; progress: ExportMp4Progress }
    | { status: 'done'; url: string; sizeBytes: number }
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

  const compiledBySceneId = useMemo(
    () => (loaded ? compileLegacyScenes(message) : {}),
    [loaded, message]
  );

  const timelineSummary = useMemo(
    () =>
      buildAssembledTimeline({
        video: message,
        linkedPlan,
        compiledBySceneId,
      }),
    [message, linkedPlan, compiledBySceneId]
  );

  const AssembledComponent = useMemo(
    () => createAssembledComposition(compiledBySceneId),
    [compiledBySceneId]
  );

  const inputProps = useMemo(
    () => toAssembledInputProps(timelineSummary),
    [timelineSummary]
  );

  const estimatedSummary = useMemo(() => {
    const planScenesById = new Map(
      (linkedPlan?.scenes ?? []).map((s) => [s.id, s])
    );
    const ordered: VideoSceneRecord[] = linkedPlan
      ? linkedPlan.scenes
          .map((ps) => message.scenes.find((r) => r.sceneId === ps.id))
          .filter((r): r is VideoSceneRecord => Boolean(r))
      : message.scenes;

    let okCount = 0;
    let totalFrames = 0;
    for (const r of ordered) {
      if (r.status !== 'ok' && r.status !== 'outdated') continue;
      okCount += 1;
      const ps = planScenesById.get(r.sceneId);
      totalFrames += ps
        ? secondsToFrames(ps.durationSeconds, message.fps)
        : Math.max(1, Math.round(3 * message.fps));
    }
    return { okCount, totalFrames };
  }, [linkedPlan, message.scenes, message.fps]);

  const isPlayerMounted = loaded && timelineSummary.entries.length > 0;

  useEffect(() => {
    if (!isPlayerMounted) return;
    const unregister = registerVideoPlayer(playerId, () => {
      playerRef.current?.pause();
    });
    const player = playerRef.current;
    const onPlay: CallbackListener<'play'> = () => {
      notifyVideoPlayerStarted(playerId);
    };
    player?.addEventListener('play', onPlay);
    return () => {
      player?.removeEventListener('play', onPlay);
      unregister();
    };
  }, [isPlayerMounted, playerId]);

  const handleCopyDebugInfo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            legacyVideoMessageId: message.id,
            version: message.version,
            format: message.format,
            modelName: message.modelName,
            scenesCount: message.scenes.length,
          },
          null,
          2
        )
      );
      showToast('Debug info copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'danger');
    }
  }, [message, showToast]);

  const handleExportMp4 = async () => {
    if (exportState.status === 'exporting') return;
    const compiled = compileLegacyScenes(message);
    const summary = buildAssembledTimeline({
      video: message,
      linkedPlan,
      compiledBySceneId: compiled,
    });
    if (summary.entries.length === 0 || summary.totalFrames <= 0) {
      setExportState({
        status: 'error',
        message: 'No playable scenes in this legacy video.',
      });
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
      progress: {
        progressPercent: 0,
        encodedFrames: 0,
        totalFrames: summary.totalFrames,
        elapsedMs: 0,
        mode: exportMode,
      },
    });

    try {
      const comp = createAssembledComposition(compiled);
      const props = toAssembledInputProps(summary);
      const result = await exportCompositionToMp4({
        compositionId: `legacy-v${message.version}`,
        component: comp,
        inputProps: props,
        durationInFrames: summary.totalFrames,
        fps: message.fps,
        width: message.width,
        height: message.height,
        mode: exportMode,
        signal: controller.signal,
        onProgress: (progress) => {
          setExportState({ status: 'exporting', progress });
        },
      });
      const url = URL.createObjectURL(result.blob);
      exportUrlRef.current = url;
      setExportState({ status: 'done', url, sizeBytes: result.blob.size });
    } catch (err) {
      if (controller.signal.aborted) {
        setExportState({ status: 'idle' });
        return;
      }
      setExportState({
        status: 'error',
        message: err instanceof Error ? err.message : 'MP4 export failed.',
      });
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
    }
  };

  const aspectClass =
    message.format === '9:16'
      ? 'aspect-[9/16] max-h-[60dvh] md:max-h-[420px] w-auto mx-auto'
      : message.format === '1:1'
        ? 'aspect-square max-h-[60dvh] md:max-h-[340px] w-auto mx-auto'
        : 'aspect-video w-full';

  return (
    <article
      aria-label={`Legacy video version ${message.version}`}
      className="rounded-[16px] border border-border/70 bg-surface-1/80 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
            Video v{message.version}
          </span>
          <Badge variant="default">Legacy</Badge>
          <Badge variant="default">{message.format}</Badge>
          {estimatedSummary.totalFrames > 0 && (
            <Badge variant="default">
              {formatDur(estimatedSummary.totalFrames / message.fps)}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {estimatedSummary.okCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              loading={exportState.status === 'exporting'}
              disabled={exportState.status === 'exporting'}
              onClick={() => void handleExportMp4()}
            >
              <Film className="h-3.5 w-3.5" />
              <span>
                {exportState.status === 'exporting' ? 'Exporting' : 'Export MP4'}
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopyDebugInfo()}
            aria-label="Copy legacy debug info"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-[12px] border border-border/70',
          isPlayerMounted ? 'bg-black' : 'bg-surface-2/70',
          aspectClass
        )}
      >
        {estimatedSummary.okCount === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
            <AlertCircle className="h-5 w-5 text-warning" />
            <p className="text-xs font-semibold text-text">
              No playable scenes in this legacy video
            </p>
          </div>
        ) : !loaded ? (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="flex h-full w-full flex-col items-center justify-center gap-2.5 p-4 text-center transition-colors hover:bg-surface-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1 text-text shadow-sm">
              <Play className="h-5 w-5 fill-current ml-0.5" />
            </span>
            <span className="text-xs font-semibold text-text">
              Tap to load legacy video
            </span>
            <span className="font-mono text-[11px] text-text-muted tabular-nums">
              {estimatedSummary.okCount}{' '}
              {estimatedSummary.okCount === 1 ? 'scene' : 'scenes'} ·{' '}
              {formatDur(estimatedSummary.totalFrames / message.fps)} ·{' '}
              {message.width}×{message.height}
            </span>
          </button>
        ) : timelineSummary.entries.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
            <AlertCircle className="h-5 w-5 text-danger" />
            <p className="text-xs font-semibold text-danger">
              Could not compile legacy video scenes
            </p>
          </div>
        ) : (
          <ErrorBoundary
            resetKey={`${message.id}-${timelineSummary.totalFrames}`}
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
              style={{ width: '100%', height: '100%' }}
            />
          </ErrorBoundary>
        )}
      </div>

      {isPlayerMounted && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted tabular-nums">
            {timelineSummary.entries.length} of {message.scenes.length} scenes ·{' '}
            {message.width}×{message.height} · {message.fps} fps
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => playerRef.current?.requestFullscreen()}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Full screen</span>
          </Button>
        </div>
      )}

      {exportState.status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-surface-2/60 px-3 py-2 text-xs">
          <span className="text-text-secondary">
            MP4 ready ({Math.round(exportState.sizeBytes / 1024)} KB)
          </span>
          <a
            href={exportState.url}
            download={`legacy-video-v${message.version}.mp4`}
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download MP4</span>
          </a>
        </div>
      )}

      {exportState.status === 'error' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{exportState.message}</span>
          <button
            type="button"
            onClick={() => {
              const nextMode: ExportMode =
                exportMode === 'standard' ? 'compatibility' : 'standard';
              setExportMode(nextMode);
              setStoredExportMode(nextMode);
            }}
            className="underline cursor-pointer"
          >
            Switch to {exportMode === 'standard' ? 'Compatibility' : 'Standard'} mode
          </button>
        </div>
      )}
    </article>
  );
}
