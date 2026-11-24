'use client';

import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, ListFilter, Send, Square, Trash2 } from 'lucide-react';
import {
  GeminiRequestError,
  generateWithGemini,
  isAbortError,
  listGeminiModels,
  maskApiKey,
  type GeminiModel,
} from '@/lib/gemini';
import { ErrorDisplay, StatusBadge, type TestStatus } from './StatusBadge';

export const GEMINI_KEY_STORAGE = 'phase0_gemini_api_key';

interface AiTestProps {
  apiKey: string;
  onApiKeyChange: (newKey: string) => void;
  selectedModel: string;
  onSelectedModelChange: (modelName: string) => void;
}

export function AiTest({
  apiKey,
  onApiKeyChange,
  selectedModel,
  onSelectedModelChange,
}: AiTestProps) {
  const [keyInput, setKeyInput] = useState('');
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [totalModelCount, setTotalModelCount] = useState<number | null>(null);
  const [modelsElapsedMs, setModelsElapsedMs] = useState<number | null>(null);

  const [status, setStatus] = useState<TestStatus>('not_run');
  const [loadingModels, setLoadingModels] = useState(false);
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [activeElapsedMs, setActiveElapsedMs] = useState(0);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const [promptResponse, setPromptResponse] = useState<{
    text: string;
    elapsedMs: number;
    modelName: string;
    finishReason?: string;
  } | null>(null);

  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isWorking = loadingModels || sendingPrompt;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(GEMINI_KEY_STORAGE);
      if (saved) {
        onApiKeyChange(saved);
      }
    } catch {
      // localStorage blocked or unavailable
    }
  }, [onApiKeyChange]);

  useEffect(() => {
    if (!isWorking) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setActiveElapsedMs(Math.max(0, Date.now() - started));
    }, 100);
    return () => window.clearInterval(id);
  }, [isWorking]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleStopActive = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingModels(false);
    setSendingPrompt(false);
    setActiveElapsedMs(0);
    setStatusLine(null);
    setStatus('not_run');
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    try {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
    } catch {
      // Ignore storage quota/security errors
    }
    onApiKeyChange(trimmed);
    setKeyInput('');
    setErrorState(null);
  };

  const handleClearKey = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch {
      // Ignore
    }
    onApiKeyChange('');
    setKeyInput('');
    setModels([]);
    setTotalModelCount(null);
    setModelsElapsedMs(null);
    onSelectedModelChange('');
    setPromptResponse(null);
    setErrorState(null);
    setStatus('not_run');
  };

  const formatGeminiError = (err: unknown, contextLabel: string) => {
    if (err instanceof GeminiRequestError) {
      const title = `${contextLabel}: ${err.kind}${err.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}`;
      return {
        title,
        message: `${err.message} ${err.userAction}`.trim(),
        details: `${err.explanation}\n\nRaw details:\n${err.rawDetails}`,
      };
    }
    const errObj = err instanceof Error ? err : new Error(String(err));
    return {
      title: `${contextLabel}: Unexpected Error`,
      message: errObj.message,
      details: errObj.stack,
    };
  };

  const handleLoadModels = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingModels(true);
    setActiveElapsedMs(0);
    setStatusLine('Loading models from Google...');
    setStatus('running');
    setErrorState(null);

    try {
      const result = await listGeminiModels(apiKey, {
        signal: controller.signal,
      });
      const generateCapable = result.models.filter((m) =>
        m.supportedGenerationMethods.includes('generateContent')
      );
      setTotalModelCount(result.models.length);
      setModels(generateCapable);
      setModelsElapsedMs(result.elapsedMs);

      if (generateCapable.length === 0) {
        onSelectedModelChange('');
        setErrorState({
          title: 'No generateContent models found',
          message: `The API returned ${result.models.length} models, but none list "generateContent" in supportedGenerationMethods.`,
        });
        setStatus('failed');
      } else {
        const stillExists = generateCapable.some((m) => m.name === selectedModel);
        if (!stillExists) {
          onSelectedModelChange(generateCapable[0].name);
        }
        setStatus(promptResponse ? 'passed' : 'not_run');
      }
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        setStatus('not_run');
        return;
      }
      setErrorState(formatGeminiError(err, 'Load models'));
      setStatus('failed');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoadingModels(false);
      setActiveElapsedMs(0);
      setStatusLine(null);
    }
  };

  const handleSendTestPrompt = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setSendingPrompt(true);
    setActiveElapsedMs(0);
    setStatusLine(`Calling ${selectedModel.replace(/^models\//, '')}...`);
    setStatus('running');
    setErrorState(null);
    setPromptResponse(null);

    try {
      const result = await generateWithGemini({
        apiKey,
        modelName: selectedModel,
        prompt: 'Reply with one short sentence confirming you are working.',
        signal: controller.signal,
        onStatus: (ev) => {
          if (!controller.signal.aborted) {
            setStatusLine(ev.message);
          }
        },
      });
      setPromptResponse({
        text: result.text,
        elapsedMs: result.elapsedMs,
        modelName: result.answeringModel,
        finishReason: result.finishReason,
      });
      setStatus('passed');
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        setStatus('not_run');
        return;
      }
      setErrorState(formatGeminiError(err, 'Test prompt'));
      setStatus('failed');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSendingPrompt(false);
      setActiveElapsedMs(0);
      setStatusLine(null);
    }
  };

  return (
    <section
      id="gemini"
      className="flex flex-col rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
            03. Gemini Connection
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Direct browser REST calls to{' '}
            <code className="font-mono text-slate-300">generativelanguage.googleapis.com</code>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* API Key form */}
      <form onSubmit={handleSaveKey} className="mt-4 space-y-2.5">
        <label
          htmlFor="gemini-api-key"
          className="block text-xs font-medium text-slate-300"
        >
          Gemini API Key (stored in localStorage only)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="gemini-api-key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={apiKey ? 'Enter new key to replace saved key' : 'Paste Gemini API key'}
            autoComplete="off"
            className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-[#080C14] px-3.5 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2 shrink-0">
            <button
              type="submit"
              disabled={!keyInput.trim()}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap"
            >
              <KeyRound className="h-4 w-4" />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={handleClearKey}
              disabled={!apiKey && !keyInput}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear</span>
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Saved key:{' '}
          <span className="font-mono text-slate-200">
            {apiKey ? maskApiKey(apiKey) : 'None saved'}
          </span>
        </div>
      </form>

      {/* Load models + Model selector */}
      <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleLoadModels()}
            disabled={!apiKey || isWorking}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ListFilter className="h-4 w-4" />
            <span>{loadingModels ? 'Loading models...' : 'Load my models'}</span>
          </button>

          {totalModelCount !== null && (
            <span className="text-xs text-slate-400 tabular-nums">
              {models.length} generateContent models ({totalModelCount} total) in{' '}
              {modelsElapsedMs} ms
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="gemini-model-select"
            className="block text-xs font-medium text-slate-300"
          >
            Available Models
          </label>
          <select
            id="gemini-model-select"
            value={selectedModel}
            onChange={(e) => onSelectedModelChange(e.target.value)}
            disabled={models.length === 0}
            className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-700 bg-[#080C14] px-3 py-2 font-mono text-xs sm:text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {models.length === 0 ? (
              <option value="">Load models with your API key first</option>
            ) : (
              models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName} ({m.name.replace(/^models\//, '')})
                </option>
              ))
            )}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleSendTestPrompt()}
          disabled={!apiKey || !selectedModel || isWorking}
          className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Send className="h-4 w-4" />
          <span>{sendingPrompt ? 'Sending...' : 'Send test prompt'}</span>
        </button>

        {isWorking && (
          <div className="rounded-lg border border-slate-700 bg-[#080C14] px-3 py-2 text-xs space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-200">{statusLine || 'Working...'}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-400 tabular-nums">
                  {(activeElapsedMs / 1000).toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={handleStopActive}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            </div>
            {activeElapsedMs >= 25_000 && (
              <p className="text-[11px] text-amber-300">
                Still waiting for Google. You can stop and retry, or switch model in Settings.
              </p>
            )}
          </div>
        )}
      </div>

      {promptResponse && (
        <div className="mt-4 rounded-lg border border-emerald-800/60 bg-emerald-950/25 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-300">
            <span className="font-medium">
              Response from{' '}
              <code className="font-mono">
                {promptResponse.modelName.replace(/^models\//, '')}
              </code>
            </span>
            <span className="font-mono tabular-nums">
              {promptResponse.elapsedMs} ms
              {promptResponse.finishReason ? ` · ${promptResponse.finishReason}` : ''}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-100 break-words">
            {promptResponse.text}
          </p>
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

