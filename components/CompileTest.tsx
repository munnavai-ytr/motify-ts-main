'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Code2, RotateCcw, Sparkles, Square } from 'lucide-react';
import {
  compileComponent,
  type CompiledComponentType,
} from '@/lib/compile';
import {
  GeminiRequestError,
  REMOTION_SYSTEM_INSTRUCTION,
  generateWithGemini,
  isAbortError,
} from '@/lib/gemini';
import { ErrorDisplay, StatusBadge, type TestStatus } from './StatusBadge';

const TALLY_STORAGE_KEY = 'phase0_ai_code_tally';

interface CodeTally {
  attempts: number;
  compiledOk: number;
  failed: number;
  lastError: string | null;
}

const EMPTY_TALLY: CodeTally = {
  attempts: 0,
  compiledOk: 0,
  failed: 0,
  lastError: null,
};

interface CompileTestProps {
  apiKey: string;
  selectedModel: string;
  runtimeError: string | null;
  onCompiledSuccess: (component: CompiledComponentType) => void;
}

export function CompileTest({
  apiKey,
  selectedModel,
  runtimeError,
  onCompiledSuccess,
}: CompileTestProps) {
  const [sourceCode, setSourceCode] = useState<string>('');
  const [promptInput, setPromptInput] = useState<string>('');
  const [status, setStatus] = useState<TestStatus>('not_run');
  const [generating, setGenerating] = useState(false);
  const [genElapsedMs, setGenElapsedMs] = useState(0);
  const [genStatusLine, setGenStatusLine] = useState<string | null>(null);
  const [lastGenMs, setLastGenMs] = useState<number | null>(null);
  const [compileInfo, setCompileInfo] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  const [tally, setTally] = useState<CodeTally>(EMPTY_TALLY);
  const genAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setGenElapsedMs(Math.max(0, Date.now() - started));
    }, 100);
    return () => window.clearInterval(id);
  }, [generating]);

  useEffect(() => {
    return () => {
      genAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = window.localStorage.getItem(TALLY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<CodeTally>;
          setTally({
            attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
            compiledOk:
              typeof parsed.compiledOk === 'number' ? parsed.compiledOk : 0,
            failed: typeof parsed.failed === 'number' ? parsed.failed : 0,
            lastError:
              typeof parsed.lastError === 'string' ? parsed.lastError : null,
          });
        }
      } catch {
        // Ignore malformed storage
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persistTally = (next: CodeTally) => {
    setTally(next);
    try {
      window.localStorage.setItem(TALLY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failure
    }
  };

  const runCompilePipeline = (
    rawSource: string,
    recordTally: boolean,
    currentTally: CodeTally
  ): boolean => {
    setErrorState(null);
    setCompileInfo(null);

    const result = compileComponent(rawSource);

    if (!result.ok) {
      setStatus('failed');
      setErrorState({
        title: 'Compile / evaluation failed',
        message: result.error,
        details: result.codeSnippet ?? result.transpiledCode,
      });

      if (recordTally) {
        persistTally({
          attempts: currentTally.attempts + 1,
          compiledOk: currentTally.compiledOk,
          failed: currentTally.failed + 1,
          lastError: result.error,
        });
      }
      return false;
    }

    onCompiledSuccess(result.component);
    setStatus('passed');
    setCompileInfo(
      `Compiled ${result.sanitizedCode.split('\n').length} lines cleanly. Active in Preview (Card 01) and Export (Card 02).`
    );

    if (recordTally) {
      persistTally({
        attempts: currentTally.attempts + 1,
        compiledOk: currentTally.compiledOk + 1,
        failed: currentTally.failed,
        lastError: null,
      });
    }
    return true;
  };

  const handleManualCompile = () => {
    runCompilePipeline(sourceCode, false, tally);
  };

  const handleStopGenerating = () => {
    genAbortRef.current?.abort();
    genAbortRef.current = null;
    setGenerating(false);
    setGenElapsedMs(0);
    setGenStatusLine(null);
    setStatus('not_run');
  };

  const handleAskGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    const description = promptInput.trim();
    if (!description) return;

    if (!apiKey || !selectedModel) {
      setStatus('failed');
      setErrorState({
        title: 'Gemini not configured',
        message: !apiKey
          ? 'Save your Gemini API key in Card 03 first.'
          : 'Load and select a Gemini model in Card 03 first.',
      });
      return;
    }

    const controller = new AbortController();
    genAbortRef.current = controller;
    setGenerating(true);
    setGenElapsedMs(0);
    setGenStatusLine(`Generating with ${selectedModel.replace(/^models\//, '')}...`);
    setStatus('running');
    setErrorState(null);
    setCompileInfo(null);

    try {
      const response = await generateWithGemini({
        apiKey,
        modelName: selectedModel,
        prompt: description,
        systemInstruction: REMOTION_SYSTEM_INSTRUCTION,
        signal: controller.signal,
        onStatus: (ev) => {
          if (!controller.signal.aborted) {
            setGenStatusLine(ev.message);
          }
        },
      });

      setLastGenMs(response.elapsedMs);
      setSourceCode(response.text);
      runCompilePipeline(response.text, true, tally);
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        setStatus('not_run');
        return;
      }

      const errMsg =
        err instanceof GeminiRequestError
          ? `${err.message} ${err.userAction}`.trim()
          : err instanceof Error
            ? err.message
            : String(err);

      const details =
        err instanceof GeminiRequestError
          ? `${err.explanation}\n\n${err.rawDetails}`
          : err instanceof Error
            ? err.stack
            : undefined;

      setStatus('failed');
      setErrorState({
        title:
          err instanceof GeminiRequestError
            ? `Gemini error (${err.kind})`
            : 'Gemini generation failed',
        message: errMsg,
        details,
      });

      persistTally({
        attempts: tally.attempts + 1,
        compiledOk: tally.compiledOk,
        failed: tally.failed + 1,
        lastError: errMsg,
      });
    } finally {
      if (genAbortRef.current === controller) {
        genAbortRef.current = null;
      }
      setGenerating(false);
      setGenElapsedMs(0);
      setGenStatusLine(null);
    }
  };

  const handleResetTally = () => {
    persistTally(EMPTY_TALLY);
  };

  const effectiveStatus: TestStatus =
    runtimeError && status === 'passed' ? 'failed' : status;

  return (
    <section
      id="compile"
      className="flex flex-col rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
            04. AI Code Loop
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Gemini TSX generation → Sanitize → Sucrase transpile → Isolated compile → Preview & Export
          </p>
        </div>
        <StatusBadge status={effectiveStatus} />
      </div>

      {/* Part B: Gemini writes the code */}
      <form onSubmit={handleAskGemini} className="mt-5 space-y-2.5">
        <label
          htmlFor="animation-description"
          className="block text-xs font-medium text-slate-300"
        >
          Part B · Describe the animation
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="animation-description"
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="e.g. Kinetic typography intro with an orbiting geometric ring"
            className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-[#080C14] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!promptInput.trim() || generating}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Sparkles className="h-4 w-4" />
            <span>{generating ? 'Generating...' : 'Ask Gemini to write it'}</span>
          </button>
        </div>
        {generating && (
          <div className="rounded-lg border border-slate-700 bg-[#080C14] px-3 py-2 text-xs space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-200">{genStatusLine || 'Generating...'}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-400 tabular-nums">
                  {(genElapsedMs / 1000).toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            </div>
            {genElapsedMs >= 25_000 && (
              <p className="text-[11px] text-amber-300">
                Still waiting for Google. You can stop and retry, or switch model in Settings.
              </p>
            )}
          </div>
        )}
        {lastGenMs !== null && (
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Last Gemini generation: {lastGenMs} ms
          </div>
        )}
      </form>

      {/* Running tally */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#080C14] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-slate-400">
            Attempts:{' '}
            <strong className="font-mono text-slate-100 tabular-nums">
              {tally.attempts}
            </strong>
          </span>
          <span className="text-slate-400">
            Compiled OK:{' '}
            <strong className="font-mono text-emerald-400 tabular-nums">
              {tally.compiledOk}
            </strong>
          </span>
          <span className="text-slate-400">
            Failed:{' '}
            <strong className="font-mono text-red-400 tabular-nums">
              {tally.failed}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetTally}
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {tally.lastError && (
        <div className="mt-2.5 text-xs text-red-300 font-mono break-words">
          Last recorded error: {tally.lastError}
        </div>
      )}

      {/* Part A: Manual compile */}
      <div className="mt-5 space-y-2.5 border-t border-slate-800 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="tsx-source"
            className="text-xs font-medium text-slate-300"
          >
            Part A · TSX Component Source (Remotion Scene)
          </label>
          <span className="font-mono text-[11px] text-slate-500">
            react + remotion only
          </span>
        </div>

        <textarea
          id="tsx-source"
          value={sourceCode}
          onChange={(e) => setSourceCode(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={`import React from 'react';\nimport { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion';\n\nexport default function Scene() {\n  const frame = useCurrentFrame();\n  const { fps } = useVideoConfig();\n  const scale = spring({ frame, fps });\n  return (\n    <AbsoluteFill style={{ backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }}>\n      <div style={{ color: '#F8FAFC', fontSize: 72, fontFamily: 'system-ui, sans-serif', transform: \`scale(\${scale})\` }}>\n        Hello Remotion\n      </div>\n    </AbsoluteFill>\n  );\n}`}
          className="w-full rounded-lg border border-slate-700 bg-[#080C14] p-3 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <button
          type="button"
          onClick={handleManualCompile}
          disabled={!sourceCode.trim() || generating}
          className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Code2 className="h-4 w-4" />
          <span>Compile and preview</span>
        </button>
      </div>

      {compileInfo && !runtimeError && (
        <div className="mt-4 rounded-lg border border-emerald-800/60 bg-emerald-950/25 p-3 text-xs text-emerald-200">
          {compileInfo}
        </div>
      )}

      {runtimeError && (
        <div className="mt-4">
          <ErrorDisplay
            title="Runtime error during preview render"
            message={runtimeError}
          />
        </div>
      )}

      {errorState && (
        <div className="mt-4">
          <ErrorDisplay
            title={errorState.title}
            message={errorState.message}
            details={errorState.details}
          />
        </div>
      )}
    </section>
  );
}
