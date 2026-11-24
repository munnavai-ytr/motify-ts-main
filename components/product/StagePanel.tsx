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
import { Film, Maximize2, Square } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatSeconds } from '@/lib/ai/plan-schema';
import type { CompiledComponentType } from '@/lib/compile';
import type { FormatPreference, Plan, Project, VideoMessage } from '@/lib/types';
import {
  buildAssembledTimeline,
  createAssembledComposition,
  toAssembledInputProps,
} from '@/lib/video/assemble';
import {
  notifyVideoPlayerStarted,
  registerVideoPlayer,
} from '@/lib/video/player-coordinator';

interface StagePanelProps {
  project: Project | null;
  formatPreference?: FormatPreference;
  latestVideo: VideoMessage | null;
  linkedPlan: Plan | null;
  compiledBySceneId: Record<string, CompiledComponentType>;
  activeVideoStatusDetail?: string | null;
  activeVideoWaitStartedAt?: number | null;
  onStopBuild?: () => void;
  onRuntimeErrorDetected?: (videoMessageId: string, errorMessage: string) => void;
}

function StageErrorBridge({
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

export function StagePanel({
  project,
  formatPreference,
  latestVideo,
  linkedPlan,
  compiledBySceneId,
  activeVideoStatusDetail,
  activeVideoWaitStartedAt,
  onStopBuild,
  onRuntimeErrorDetected,
}: StagePanelProps) {
  const playerRef = useRef<PlayerRef | null>(null);
  const playerCoordinatorId = useId();
  const isBuilding = Boolean(latestVideo && latestVideo.status === 'building');
  const [liveNow, setLiveNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isBuilding) return;
    const id = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 100);
    return () => window.clearInterval(id);
  }, [isBuilding]);

  const explicitPref =
    formatPreference && formatPreference !== 'auto'
      ? formatPreference
      : undefined;
  const stageFormat =
    explicitPref ??
    latestVideo?.format ??
    (formatPreference === 'auto' ? undefined : project?.format);
  const aspectClass =
    stageFormat === '9:16'
      ? 'aspect-[9/16] max-h-[72vh] w-auto'
      : stageFormat === '1:1'
        ? 'aspect-square max-h-[68vh] w-auto'
        : 'aspect-video w-full max-w-4xl';

  const timelineSummary = useMemo(() => {
    if (!latestVideo) return null;
    return buildAssembledTimeline({
      video: latestVideo,
      linkedPlan,
      compiledBySceneId,
    });
  }, [latestVideo, linkedPlan, compiledBySceneId]);

  const AssembledComponent = useMemo(
    () => createAssembledComposition(compiledBySceneId),
    [compiledBySceneId]
  );

  const inputProps = useMemo(
    () => (timelineSummary ? toAssembledInputProps(timelineSummary) : null),
    [timelineSummary]
  );

  const isPlayable =
    Boolean(latestVideo) &&
    latestVideo?.status !== 'building' &&
    Boolean(timelineSummary && timelineSummary.entries.length > 0 && inputProps);

  const reportError = useCallback(
    (errMsg: string) => {
      if (latestVideo) {
        onRuntimeErrorDetected?.(latestVideo.id, errMsg);
      }
    },
    [latestVideo, onRuntimeErrorDetected]
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isPlayable) return;
    const unregister = registerVideoPlayer(playerCoordinatorId, () => {
      playerRef.current?.pause();
    });
    const onPlayerError: CallbackListener<'error'> = (event) => {
      const msg =
        event.detail.error instanceof Error
          ? event.detail.error.message
          : String(event.detail.error);
      reportError(msg);
    };
    const onPlayerPlay: CallbackListener<'play'> = () => {
      notifyVideoPlayerStarted(playerCoordinatorId);
    };
    player.addEventListener('error', onPlayerError);
    player.addEventListener('play', onPlayerPlay);
    return () => {
      player.removeEventListener('error', onPlayerError);
      player.removeEventListener('play', onPlayerPlay);
      unregister();
    };
  }, [isPlayable, playerCoordinatorId, reportError]);

  const renderErrorFallback = useCallback(
    ({ error }: { error: Error }) => (
      <div className="flex h-full w-full items-center justify-center bg-surface-2 p-6 text-center">
        <StageErrorBridge
          errorMessage={error.message || 'Stage runtime error'}
          onReport={reportError}
        />
        <div className="max-w-sm space-y-1.5">
          <p className="text-sm font-semibold text-danger">
            Scene runtime error
          </p>
          <p className="font-mono text-xs text-text-secondary break-words">
            {error.message}
          </p>
        </div>
      </div>
    ),
    [reportError]
  );

  return (
    <section
      aria-label="Stage"
      className="flex h-full min-w-0 flex-1 flex-col bg-bg"
    >
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-medium text-text">Stage</span>
          {(stageFormat || formatPreference === 'auto') && (
            <span className="rounded-[6px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary tabular-nums">
              {stageFormat ?? 'Auto'}
            </span>
          )}
          {latestVideo && timelineSummary && isPlayable && (
            <span className="font-mono text-xs text-text-muted tabular-nums">
              v{latestVideo.version} ·{' '}
              {formatSeconds(timelineSummary.totalFrames / latestVideo.fps)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isPlayable && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => playerRef.current?.requestFullscreen()}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Full screen</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-[16px] border border-border bg-surface-1 ${aspectClass}`}
          style={{ minWidth: stageFormat === '9:16' ? '260px' : undefined }}
        >
          {latestVideo && latestVideo.status === 'building' ? (
            <div className="flex max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
              <Spinner size="md" />
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-text">
                  Building video v{latestVideo.version}
                </p>
                <p className="font-mono text-xs text-text-secondary tabular-nums">
                  {latestVideo.scenes.filter((s) => s.status === 'ok').length} of{' '}
                  {latestVideo.scenes.length} scenes ready ·{' '}
                  {`${Math.max(0, (liveNow - latestVideo.startedAt) / 1000).toFixed(1)}s`}
                </p>
                <p className="text-xs text-text-secondary break-words">
                  {activeVideoStatusDetail ||
                    (() => {
                      const activeScene = latestVideo.scenes.find(
                        (s) =>
                          s.status === 'writing' ||
                          s.status === 'checking' ||
                          s.status === 'repairing'
                      );
                      if (!activeScene) return 'Preparing build...';
                      return activeScene.status === 'checking'
                        ? `Checking ${activeScene.name}...`
                        : activeScene.status === 'repairing'
                          ? `Repairing ${activeScene.name}...`
                          : `Writing ${activeScene.name}...`;
                    })()}
                </p>
                {liveNow - (activeVideoWaitStartedAt ?? latestVideo.startedAt) >=
                  25_000 && (
                  <p className="text-[11px] text-warning pt-1">
                    Still waiting for Google. You can stop and retry, or switch model in Settings.
                  </p>
                )}
                {onStopBuild && (
                  <div className="pt-1">
                    <Button variant="secondary" size="sm" onClick={onStopBuild}>
                      <Square className="h-3 w-3 fill-current" />
                      <span>Stop</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : isPlayable && latestVideo && timelineSummary && inputProps ? (
            <ErrorBoundary
              resetKey={`${latestVideo.id}-${timelineSummary.totalFrames}-${timelineSummary.entries.length}`}
              onError={(err) => reportError(err.message)}
              fallback={(error) => (
                <div className="flex h-full w-full items-center justify-center bg-surface-2 p-6 text-center">
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
                compositionWidth={latestVideo.width}
                compositionHeight={latestVideo.height}
                fps={latestVideo.fps}
                controls
                loop
                noSuspense
                acknowledgeRemotionLicense
                errorFallback={renderErrorFallback}
                style={{ width: '100%', height: '100%' }}
              />
            </ErrorBoundary>
          ) : (
            <EmptyState
              icon={<Film className="h-5 w-5" />}
              title="Your video will appear here"
              description="Start a conversation to create your video."
            />
          )}
        </div>
      </div>
    </section>
  );
}
