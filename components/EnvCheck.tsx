'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  CanRenderMediaOnWebResult,
  WebRendererAudioCodec,
  WebRendererVideoCodec,
} from '@remotion/web-renderer';
import { ErrorDisplay, StatusBadge, type TestStatus } from './StatusBadge';

export interface EnvironmentInfo {
  browserLabel: string;
  userAgent: string;
  hasVideoEncoder: boolean;
  encodableVideoCodecs: WebRendererVideoCodec[];
  encodableAudioCodecs: WebRendererAudioCodec[];
  canRenderResult: CanRenderMediaOnWebResult | null;
  fallbackCanRenderResult: CanRenderMediaOnWebResult | null;
  effectiveCodec: WebRendererVideoCodec | null;
}

interface EnvCheckProps {
  onEnvironmentReady: (info: EnvironmentInfo) => void;
}

function detectBrowserLabel(ua: string): string {
  if (!ua) return 'Unknown browser';

  const edg = ua.match(/Edg\/([\d.]+)/);
  if (edg) return `Microsoft Edge ${edg[1]}`;

  const opr = ua.match(/OPR\/([\d.]+)/);
  if (opr) return `Opera ${opr[1]}`;

  const firefox = ua.match(/Firefox\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox[1]}`;

  const chrome = ua.match(/Chrome\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome[1]}`;

  const safariVersion = ua.match(/Version\/([\d.]+).*Safari\//);
  if (safariVersion) return `Safari ${safariVersion[1]}`;

  return 'Unrecognized browser';
}

export function EnvCheck({ onEnvironmentReady }: EnvCheckProps) {
  const [status, setStatus] = useState<TestStatus>('running');
  const [envInfo, setEnvInfo] = useState<EnvironmentInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const performDetection = useCallback(async (): Promise<EnvironmentInfo> => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const browserLabel = detectBrowserLabel(ua);
    const hasVideoEncoder = typeof VideoEncoder !== 'undefined';

    const webRenderer = await import('@remotion/web-renderer');

    const [encodableVideoCodecs, encodableAudioCodecs, canRenderResult] =
      await Promise.all([
        webRenderer.getEncodableVideoCodecs('mp4'),
        webRenderer.getEncodableAudioCodecs('mp4'),
        webRenderer.canRenderMediaOnWeb({
          container: 'mp4',
          width: 1920,
          height: 1080,
        }),
      ]);

    let fallbackCanRenderResult: CanRenderMediaOnWebResult | null = null;
    const preferredCodec: WebRendererVideoCodec | null =
      encodableVideoCodecs.includes('h264')
        ? 'h264'
        : encodableVideoCodecs[0] ?? null;

    if (!canRenderResult.canRender && preferredCodec && preferredCodec !== 'h264') {
      fallbackCanRenderResult = await webRenderer.canRenderMediaOnWeb({
        container: 'mp4',
        videoCodec: preferredCodec,
        width: 1920,
        height: 1080,
      });
    }

    return {
      browserLabel,
      userAgent: ua,
      hasVideoEncoder,
      encodableVideoCodecs,
      encodableAudioCodecs,
      canRenderResult,
      fallbackCanRenderResult,
      effectiveCodec: preferredCodec,
    };
  }, []);

  const applyEnvInfo = useCallback(
    (info: EnvironmentInfo) => {
      setEnvInfo(info);
      onEnvironmentReady(info);
      const canRenderAny =
        Boolean(info.canRenderResult?.canRender) ||
        Boolean(info.fallbackCanRenderResult?.canRender);
      setStatus(info.hasVideoEncoder && canRenderAny ? 'passed' : 'failed');
    },
    [onEnvironmentReady]
  );

  const handleRecheck = async () => {
    setStatus('running');
    setErrorMsg(null);
    try {
      const info = await performDetection();
      applyEnvInfo(info);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
      setStatus('failed');
    }
  };

  useEffect(() => {
    let active = true;
    performDetection()
      .then((info) => {
        if (!active) return;
        applyEnvInfo(info);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setErrorMsg(message);
        setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [performDetection, applyEnvInfo]);

  const activeCanRender =
    envInfo?.fallbackCanRenderResult ?? envInfo?.canRenderResult ?? null;

  return (
    <section
      id="environment"
      className="rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
            00. Environment Check
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Live browser capability check via WebCodecs and{' '}
            <code className="font-mono text-slate-300">@remotion/web-renderer</code>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleRecheck()}
            disabled={status === 'running'}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/80 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`}
            />
            <span>Re-check</span>
          </button>
          <StatusBadge status={status} />
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4">
          <ErrorDisplay
            title="Environment detection failed"
            message={errorMsg}
          />
        </div>
      )}

      {envInfo && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">Browser</div>
            <div className="mt-1 text-sm font-semibold text-slate-100 tabular-nums">
              {envInfo.browserLabel}
            </div>
            <div
              className="mt-1 truncate font-mono text-[11px] text-slate-500"
              title={envInfo.userAgent}
            >
              {envInfo.userAgent}
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">
              WebCodecs (VideoEncoder)
            </div>
            <div
              className={`mt-1 text-sm font-semibold ${
                envInfo.hasVideoEncoder ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {envInfo.hasVideoEncoder ? 'Available' : 'Unavailable'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              canRenderMediaOnWeb:{' '}
              <span
                className={
                  activeCanRender?.canRender
                    ? 'font-medium text-emerald-400'
                    : 'font-medium text-red-400'
                }
              >
                {activeCanRender?.canRender ? 'true' : 'false'}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">
              Encodable Video Codecs (MP4)
            </div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-100">
              {envInfo.encodableVideoCodecs.length > 0
                ? envInfo.encodableVideoCodecs.join(', ')
                : 'None'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Resolved:{' '}
              <span className="font-mono text-slate-300">
                {activeCanRender?.resolvedVideoCodec ?? 'none'}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">
              Encodable Audio Codecs (MP4)
            </div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-100">
              {envInfo.encodableAudioCodecs.length > 0
                ? envInfo.encodableAudioCodecs.join(', ')
                : 'None'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Resolved:{' '}
              <span className="font-mono text-slate-300">
                {activeCanRender?.resolvedAudioCodec ?? 'none'}
              </span>
            </div>
          </div>
        </div>
      )}

      {envInfo?.canRenderResult && envInfo.canRenderResult.issues.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="text-xs font-medium text-slate-300">
            canRenderMediaOnWeb() reported issues
          </div>
          <ul className="mt-2 space-y-1.5">
            {envInfo.canRenderResult.issues.map((issue, idx) => (
              <li
                key={`${issue.type}-${idx}`}
                className={`rounded-md border px-3 py-2 font-mono text-xs ${
                  issue.severity === 'error'
                    ? 'border-red-800/70 bg-red-950/35 text-red-200'
                    : 'border-amber-800/70 bg-amber-950/35 text-amber-200'
                }`}
              >
                [{issue.severity}] {issue.type}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
