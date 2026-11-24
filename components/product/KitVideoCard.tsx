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
import {
  Download,
  Film,
  Maximize2,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { updateKitVideoSpecInPlace } from '@/lib/db';
import {
  exportCompositionToMp4,
  formatBitrate,
  formatExportModeLabel,
  type ExportMp4Progress,
} from '@/lib/export';
import {
  DEFAULT_MUSIC_VOLUME,
  VideoFromSpec,
  applyOps,
  describeAudioSummary,
  ensureFonts,
  getSpecDimensions,
  isAudioActive,
  pickDefaultMusicStyleForTheme,
  posterFrame,
  totalFrames,
  useAudioRenderStatus,
  type VideoSpec,
} from '@/lib/kit';
import { formatBytes } from '@/lib/media/process';
import { getStoredExportMode, setStoredExportMode } from '@/lib/storage';
import type { ExportMode, KitVideoMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  notifyVideoPlayerStarted,
  registerVideoPlayer,
} from '@/lib/video/player-coordinator';

interface KitVideoCardProps {
  message: KitVideoMessage;
}

type ExportState =
  | { status: 'idle' }
  | { status: 'exporting'; mode: ExportMode; progress: ExportMp4Progress }
  | {
      status: 'done';
      url: string;
      sizeBytes: number;
      codec: string;
      mode: ExportMode;
      videoBitrate: number | null;
      elapsedMs: number;
      audioLabel: string;
      fallbackMessage?: string;
    }
  | { status: 'error'; message: string };

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function KitVideoCard({ message }: KitVideoCardProps) {
  const playerId = useId();
  const playerRef = useRef<PlayerRef | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportUrlRef = useRef<string | null>(null);

  const [localSpec, setLocalSpec] = useState<VideoSpec>(message.spec);
  const [exportMode, setExportMode] = useState<ExportMode>(() =>
    getStoredExportMode()
  );
  const [exportState, setExportState] = useState<ExportState>({
    status: 'idle',
  });

  useEffect(() => {
    setLocalSpec(message.spec);
  }, [message.id, message.spec]);

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
    };
  }, []);

  const dims = getSpecDimensions(localSpec);
  const durationInFrames = totalFrames(localSpec);
  const initialFrame = posterFrame(localSpec);
  const inputProps = useMemo(() => ({ spec: localSpec }), [localSpec]);
  const audioStatus = useAudioRenderStatus(localSpec);
  const soundEnabled = isAudioActive(localSpec.audio);
  const audioSummary = describeAudioSummary(localSpec.audio);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const unregister = registerVideoPlayer(playerId, () => {
      playerRef.current?.pause();
    });
    const onPlay: CallbackListener<'play'> = () => {
      notifyVideoPlayerStarted(playerId);
    };
    player.addEventListener('play', onPlay);
    return () => {
      player.removeEventListener('play', onPlay);
      unregister();
    };
  }, [playerId]);

  const handleToggleSpeaker = useCallback(async () => {
    let nextSpec: VideoSpec;
    if (!localSpec.audio) {
      const style = pickDefaultMusicStyleForTheme(
        localSpec.style,
        localSpec.theme.mood
      );
      nextSpec = applyOps(localSpec, [
        {
          type: 'setMusic',
          source: 'synth',
          style,
          seed: localSpec.seed,
          volume: DEFAULT_MUSIC_VOLUME,
        },
        { type: 'setSfx', sfx: 'auto' },
      ]).spec;
    } else {
      const nextMute = !localSpec.audio.mute;
      nextSpec = applyOps(localSpec, [
        { type: 'muteAudio', mute: nextMute },
      ]).spec;
    }
    setLocalSpec(nextSpec);
    try {
      await updateKitVideoSpecInPlace({
        messageId: message.id,
        spec: nextSpec,
      });
    } catch {
      // Keep optimistic local toggle if storage fails
    }
  }, [localSpec, message.id]);

  const handleSelectExportMode = (nextMode: ExportMode) => {
    setExportMode(nextMode);
    setStoredExportMode(nextMode);
  };

  const handleExportMp4 = async (modeOverride?: ExportMode) => {
    if (exportState.status === 'exporting') return;
    const activeMode: ExportMode = modeOverride ?? exportMode;
    if (modeOverride) {
      setExportMode(modeOverride);
    }
    setStoredExportMode(activeMode);

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
        phase: isAudioActive(localSpec.audio) ? 'audio' : 'encoding',
        progressPercent: 0,
        encodedFrames: 0,
        totalFrames: durationInFrames,
        elapsedMs: 0,
        mode: activeMode,
      },
    });

    try {
      await ensureFonts({ timeoutMs: 4500, hasBengali: true });
      const result = await exportCompositionToMp4({
        compositionId: `motion-kit-v${message.version}`,
        component: VideoFromSpec,
        inputProps: { spec: localSpec },
        spec: localSpec,
        durationInFrames,
        fps: localSpec.fps,
        width: dims.width,
        height: dims.height,
        mode: activeMode,
        muted: !isAudioActive(localSpec.audio),
        signal: controller.signal,
        onProgress: (progress) => {
          setExportState({
            status: 'exporting',
            mode: activeMode,
            progress,
          });
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
        videoBitrate: result.videoBitrate,
        elapsedMs: result.elapsedMs,
        audioLabel: describeAudioSummary(localSpec.audio),
        fallbackMessage: result.fallbackMessage,
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

  const aspectClass =
    localSpec.format === '9:16'
      ? 'aspect-[9/16] max-h-[60dvh] md:max-h-[420px] w-auto mx-auto'
      : localSpec.format === '1:1'
        ? 'aspect-square max-h-[60dvh] md:max-h-[340px] w-auto mx-auto'
        : 'aspect-video w-full';

  return (
    <article
      aria-label={`Motion Kit video version ${message.version}`}
      className="rounded-[16px] border border-border bg-surface-1 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
              Video v{message.version}
            </span>
            <Badge variant="default">{localSpec.format}</Badge>
            <Badge variant="accent">
              {(durationInFrames / localSpec.fps).toFixed(1)}s
            </Badge>
          </div>
          <p className="truncate text-xs font-medium text-text">
            {localSpec.title}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleToggleSpeaker()}
            aria-label={
              soundEnabled
                ? 'Mute sound for preview and export'
                : 'Unmute or enable sound'
            }
            title={`${audioSummary} — tap to toggle`}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-2.5 text-xs font-medium transition-colors cursor-pointer',
              soundEnabled
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border bg-surface-2 text-text-secondary hover:text-text'
            )}
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {soundEnabled ? 'Sound' : localSpec.audio?.mute ? 'Muted' : 'Silent'}
            </span>
          </button>

          <Button
            variant="secondary"
            size="sm"
            disabled={exportState.status === 'exporting'}
            loading={exportState.status === 'exporting'}
            onClick={() => void handleExportMp4()}
          >
            <Film className="h-3.5 w-3.5" />
            <span>
              {exportState.status === 'exporting'
                ? exportState.progress.phase === 'audio'
                  ? 'Rendering audio...'
                  : 'Exporting'
                : 'Export MP4'}
            </span>
          </Button>
        </div>
      </div>

      {audioStatus.active && audioStatus.status.state === 'preparing' ? (
        <div className="text-[11px] font-medium text-accent">
          Preparing sound...
        </div>
      ) : null}

      <div
        className={cn(
          'overflow-hidden rounded-[12px] border border-border bg-black',
          aspectClass
        )}
      >
        <ErrorBoundary
          resetKey={`${message.id}-${durationInFrames}-${soundEnabled ? 'on' : 'off'}`}
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
            component={VideoFromSpec}
            inputProps={inputProps}
            durationInFrames={Math.max(1, durationInFrames)}
            compositionWidth={dims.width}
            compositionHeight={dims.height}
            fps={localSpec.fps}
            initialFrame={initialFrame}
            controls
            loop
            noSuspense
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
          />
        </ErrorBoundary>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted tabular-nums">
          {localSpec.scenes.length} scenes · {dims.width}×{dims.height} ·{' '}
          {audioSummary}
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

      {exportState.status !== 'idle' && (
        <div className="rounded-[12px] border border-border bg-surface-2/70 p-3 space-y-2">
          {exportState.status === 'exporting' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-text">
                  {exportState.progress.phase === 'audio'
                    ? 'Rendering audio...'
                    : `Exporting MP4 · ${formatExportModeLabel(exportState.mode)} (${exportState.progress.progressPercent}%)`}
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
              <div className="flex items-center justify-between gap-2">
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
                    {formatMs(exportState.elapsedMs)} · {exportState.audioLabel}
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
    </article>
  );
}
