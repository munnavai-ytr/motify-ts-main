'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Player, type CallbackListener, type PlayerRef } from '@remotion/player';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { CompiledComponentType } from '@/lib/compile';
import type { SceneProps } from '@/lib/video/dimensions';

export interface SceneProbeRequest {
  component: CompiledComponentType;
  props: SceneProps;
  width: number;
  height: number;
  fps: number;
  signal?: AbortSignal;
}

export type SceneProbeResult = { ok: true } | { ok: false; error: string };

export interface SceneRuntimeProbeHandle {
  probeScene: (request: SceneProbeRequest) => Promise<SceneProbeResult>;
}

interface ActiveProbe {
  id: number;
  request: SceneProbeRequest;
  resolve: (result: SceneProbeResult) => void;
  reject: (reason?: unknown) => void;
}

function ProbeErrorReporter({
  message,
  onReport,
}: {
  message: string;
  onReport: (msg: string) => void;
}) {
  useEffect(() => {
    onReport(message);
  }, [message, onReport]);

  return null;
}

/**
 * Offscreen mounted Remotion <Player> host that verifies a compiled scene
 * renders cleanly across first, middle, and last frames without throwing.
 */
export const SceneRuntimeProbe = forwardRef<SceneRuntimeProbeHandle>(
  function SceneRuntimeProbe(_props, ref) {
    const [activeProbe, setActiveProbe] = useState<ActiveProbe | null>(null);
    const activeProbeRef = useRef<ActiveProbe | null>(null);
    const settledIdRef = useRef<number | null>(null);
    const nextIdRef = useRef(1);
    const playerRef = useRef<PlayerRef | null>(null);

    const finishProbe = useCallback(
      (probeId: number, outcome: SceneProbeResult) => {
        const current = activeProbeRef.current;
        if (!current || current.id !== probeId) return;
        if (settledIdRef.current === probeId) return;
        settledIdRef.current = probeId;
        activeProbeRef.current = null;
        setActiveProbe(null);
        current.resolve(outcome);
      },
      []
    );

    const handleProbeFailure = useCallback(
      (message: string) => {
        const current = activeProbeRef.current;
        if (!current) return;
        finishProbe(current.id, {
          ok: false,
          error: message || 'Scene threw an error while rendering.',
        });
      },
      [finishProbe]
    );

    const probeScene = useCallback(
      (request: SceneProbeRequest): Promise<SceneProbeResult> => {
        if (request.signal?.aborted) {
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        }

        // Cancel any lingering previous probe cleanly
        if (activeProbeRef.current) {
          const prev = activeProbeRef.current;
          activeProbeRef.current = null;
          settledIdRef.current = prev.id;
          prev.resolve({ ok: false, error: 'Superseded by another probe.' });
        }

        return new Promise<SceneProbeResult>((resolve, reject) => {
          const id = nextIdRef.current++;
          const probe: ActiveProbe = { id, request, resolve, reject };
          activeProbeRef.current = probe;
          setActiveProbe(probe);
        });
      },
      []
    );

    useImperativeHandle(ref, () => ({ probeScene }), [probeScene]);

    useEffect(() => {
      if (!activeProbe) return;

      const probeId = activeProbe.id;
      const { signal, props } = activeProbe.request;
      const totalFrames = Math.max(1, props.durationInFrames);
      const midFrame = Math.floor((totalFrames - 1) / 2);
      const lastFrame = Math.max(0, totalFrames - 1);

      let cancelled = false;
      const timers: number[] = [];
      let rafId = 0;

      const onAbort = () => {
        if (cancelled) return;
        cancelled = true;
        if (
          activeProbeRef.current?.id === probeId &&
          settledIdRef.current !== probeId
        ) {
          settledIdRef.current = probeId;
          const current = activeProbeRef.current;
          activeProbeRef.current = null;
          setActiveProbe(null);
          current.reject(new DOMException('Aborted', 'AbortError'));
        }
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      const player = playerRef.current;
      const onPlayerError: CallbackListener<'error'> = (event) => {
        if (cancelled) return;
        const msg =
          event.detail.error instanceof Error
            ? event.detail.error.message
            : String(event.detail.error);
        finishProbe(probeId, {
          ok: false,
          error: msg || 'Remotion player reported an error.',
        });
      };

      player?.addEventListener('error', onPlayerError);

      // Step through first (frame 0), middle, and last frame so frame-dependent math
      // (such as divide-by-zero or non-monotonic interpolate ranges) is exercised.
      rafId = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const t1 = window.setTimeout(() => {
          if (cancelled) return;
          try {
            playerRef.current?.seekTo(midFrame);
          } catch (err: unknown) {
            finishProbe(probeId, {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          const t2 = window.setTimeout(() => {
            if (cancelled) return;
            try {
              playerRef.current?.seekTo(lastFrame);
            } catch (err: unknown) {
              finishProbe(probeId, {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
              return;
            }

            const t3 = window.setTimeout(() => {
              if (cancelled) return;
              finishProbe(probeId, { ok: true });
            }, 65);
            timers.push(t3);
          }, 65);
          timers.push(t2);
        }, 65);
        timers.push(t1);
      });

      const watchdog = window.setTimeout(() => {
        if (!cancelled) {
          finishProbe(probeId, { ok: true });
        }
      }, 3500);
      timers.push(watchdog);

      return () => {
        cancelled = true;
        signal?.removeEventListener('abort', onAbort);
        player?.removeEventListener('error', onPlayerError);
        if (rafId) window.cancelAnimationFrame(rafId);
        for (const id of timers) {
          window.clearTimeout(id);
        }
      };
    }, [activeProbe, finishProbe]);

    const probeFallback = useCallback(
      ({ error }: { error: Error }) => (
        <ProbeErrorReporter
          message={error.message || 'Scene runtime error'}
          onReport={handleProbeFailure}
        />
      ),
      [handleProbeFailure]
    );

    if (!activeProbe) {
      return null;
    }

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-[180px] w-[320px] overflow-hidden opacity-0"
      >
        <ErrorBoundary
          resetKey={activeProbe.id}
          fallback={(error) => (
            <ProbeErrorReporter
              message={error.message || 'Scene crashed during render'}
              onReport={handleProbeFailure}
            />
          )}
        >
          <Player
            key={activeProbe.id}
            ref={playerRef}
            component={activeProbe.request.component}
            inputProps={activeProbe.request.props}
            durationInFrames={Math.max(1, activeProbe.request.props.durationInFrames)}
            compositionWidth={activeProbe.request.width}
            compositionHeight={activeProbe.request.height}
            fps={activeProbe.request.fps}
            initialFrame={0}
            noSuspense
            acknowledgeRemotionLicense
            errorFallback={probeFallback}
            style={{ width: '100%', height: '100%' }}
          />
        </ErrorBoundary>
      </div>
    );
  }
);
