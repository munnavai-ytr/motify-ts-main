'use client';

import React, { useCallback, useState } from 'react';
import { Player } from '@remotion/player';
import { RotateCcw } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorDisplay, StatusBadge, type TestStatus } from './StatusBadge';
import type { CompiledComponentType } from '@/lib/compile';

interface PreviewTestProps {
  activeComponent: CompiledComponentType;
  isCompiled: boolean;
  compositionKey: number;
  onResetToBuiltIn: () => void;
  onRuntimeError: (errorMessage: string | null) => void;
}

export function PreviewTest({
  activeComponent,
  isCompiled,
  compositionKey,
  onResetToBuiltIn,
  onRuntimeError,
}: PreviewTestProps) {
  const [runtimeError, setRuntimeError] = useState<{
    key: number;
    message: string;
    details?: string;
  } | null>(null);

  const activeRuntimeError =
    runtimeError && runtimeError.key === compositionKey ? runtimeError : null;

  const handleBoundaryError = useCallback(
    (error: Error, componentStack: string) => {
      const details = [error.stack, componentStack].filter(Boolean).join('\n\n');
      setRuntimeError({ key: compositionKey, message: error.message, details });
      onRuntimeError(error.message);
    },
    [compositionKey, onRuntimeError]
  );

  const handlePlayerErrorFallback = useCallback(
    ({ error }: { error: Error }) => {
      setRuntimeError({
        key: compositionKey,
        message: error.message,
        details: error.stack,
      });
      onRuntimeError(error.message);
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#080C14] p-6 text-center">
          <div className="max-w-lg">
            <div className="text-sm font-semibold text-red-400">
              Composition Runtime Error
            </div>
            <p className="mt-2 font-mono text-xs text-red-200 break-words">
              {error.message}
            </p>
          </div>
        </div>
      );
    },
    [compositionKey, onRuntimeError]
  );

  const status: TestStatus = activeRuntimeError ? 'failed' : 'passed';

  return (
    <section
      id="preview"
      className="flex flex-col rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
            01. Preview
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Active:{' '}
              <strong className="font-medium text-slate-200">
                {isCompiled ? 'Compiled Scene' : 'Built-in TestComposition'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">1920x1080</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">30 fps · 5s (150 frames)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCompiled && (
            <button
              type="button"
              onClick={onResetToBuiltIn}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/80 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Use Built-in</span>
            </button>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-[#080C14]">
        <ErrorBoundary
          resetKey={compositionKey}
          onError={handleBoundaryError}
          fallback={(error) => (
            <div className="p-4">
              <ErrorDisplay
                title="Preview crashed inside ErrorBoundary"
                message={error.message}
                details={error.stack}
              />
            </div>
          )}
        >
          <div className="w-full aspect-video">
            <Player
              key={compositionKey}
              component={activeComponent}
              durationInFrames={150}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={30}
              controls
              loop
              acknowledgeRemotionLicense
              errorFallback={handlePlayerErrorFallback}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        </ErrorBoundary>
      </div>

      {activeRuntimeError && (
        <div className="mt-4">
          <ErrorDisplay
            title="Runtime error in active composition"
            message={activeRuntimeError.message}
            details={activeRuntimeError.details}
          />
        </div>
      )}
    </section>
  );
}
