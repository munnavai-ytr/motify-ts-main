'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Film, Square } from 'lucide-react';
import type { WebRendererVideoCodec } from '@remotion/web-renderer';
import { ErrorDisplay, StatusBadge, type TestStatus } from './StatusBadge';
import type { CompiledComponentType } from '@/lib/compile';

interface ExportTestProps {
  activeComponent: CompiledComponentType;
  isCompiled: boolean;
  encodableVideoCodecs: WebRendererVideoCodec[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function ExportTest({
  activeComponent,
  isCompiled,
  encodableVideoCodecs,
}: ExportTestProps) {
  const [status, setStatus] = useState<TestStatus>('not_run');
  const [usedCodec, setUsedCodec] = useState<WebRendererVideoCodec | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [encodedFrames, setEncodedFrames] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    message: string;
    details?: string;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
      }
    };
  }, []);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleRender = async () => {
    setStatus('running');
    setErrorInfo(null);
    setProgressPercent(0);
    setEncodedFrames(0);
    setElapsedMs(0);
    setFileSizeBytes(null);

    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
      setVideoUrl(null);
    }

    const startTime = performance.now();
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startTime);
    }, 100);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const webRenderer = await import('@remotion/web-renderer');

      const codecs =
        encodableVideoCodecs.length > 0
          ? encodableVideoCodecs
          : await webRenderer.getEncodableVideoCodecs('mp4');

      const chosenCodec: WebRendererVideoCodec = codecs.includes('h264')
        ? 'h264'
        : codecs[0] ?? 'h264';

      setUsedCodec(chosenCodec);

      const { getBlob } = await webRenderer.renderMediaOnWeb({
        composition: {
          id: isCompiled ? 'compiled-scene' : 'built-in-test',
          component: activeComponent,
          durationInFrames: 150,
          fps: 30,
          width: 1920,
          height: 1080,
        },
        container: 'mp4',
        videoCodec: chosenCodec,
        licenseKey: 'free-license',
        signal: controller.signal,
        onProgress: (p) => {
          setProgressPercent(Math.round(p.progress * 100));
          setEncodedFrames(p.encodedFrames);
        },
      });

      const blob = await getBlob();
      const totalElapsed = performance.now() - startTime;
      setElapsedMs(totalElapsed);
      setProgressPercent(100);
      setFileSizeBytes(blob.size);

      const objectUrl = URL.createObjectURL(blob);
      videoUrlRef.current = objectUrl;
      setVideoUrl(objectUrl);
      setStatus('passed');
    } catch (err: unknown) {
      const totalElapsed = performance.now() - startTime;
      setElapsedMs(totalElapsed);
      const errObj = err instanceof Error ? err : new Error(String(err));
      setErrorInfo({
        message: errObj.message || 'Unknown render error',
        details: errObj.stack,
      });
      setStatus('failed');
    } finally {
      window.clearInterval(timer);
      abortControllerRef.current = null;
    }
  };

  return (
    <section
      id="export"
      className="flex flex-col rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
            02. Export MP4
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Client-side render via <code className="font-mono text-slate-300">renderMediaOnWeb()</code>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <span>
          Keep this browser tab open and visible while rendering. Browsers throttle
          timers and WebCodecs in hidden/background tabs.
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleRender()}
          disabled={status === 'running'}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Film className="h-4 w-4" />
          <span>{status === 'running' ? 'Rendering MP4...' : 'Render MP4 in browser'}</span>
        </button>

        {status === 'running' && (
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Square className="h-3.5 w-3.5" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-slate-400">Codec</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-100">
            {usedCodec ?? (encodableVideoCodecs.includes('h264') ? 'h264' : encodableVideoCodecs[0] ?? 'pending')}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Progress</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
            {progressPercent}% ({encodedFrames}/150)
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Elapsed</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
            {elapsedMs > 0 ? formatDuration(elapsedMs) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">File size</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
            {fileSizeBytes !== null ? formatBytes(fileSizeBytes) : '—'}
          </div>
        </div>
      </div>

      {status === 'running' && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-blue-500 transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      )}

      {errorInfo && (
        <div className="mt-4">
          <ErrorDisplay
            title="MP4 render failed"
            message={errorInfo.message}
            details={errorInfo.details}
          />
        </div>
      )}

      {videoUrl && (
        <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
          <video
            src={videoUrl}
            controls
            playsInline
            className="w-full aspect-video rounded-lg border border-slate-800 bg-black"
          />
          <a
            href={videoUrl}
            download={isCompiled ? 'ai-motion-scene.mp4' : 'test-composition.mp4'}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Download className="h-4 w-4" />
            <span>Download MP4</span>
          </a>
        </div>
      )}
    </section>
  );
}
