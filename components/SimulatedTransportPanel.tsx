'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, Play, Square } from 'lucide-react';
import type {
  GeminiTransport,
  GeminiTransportRequest,
  GeminiTransportResponse,
} from '@/lib/ai/gemini-client';
import { GeminiRequestError, isAbortError } from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';

type ScenarioId =
  | '503'
  | '429_minute'
  | '429_day'
  | 'timeout'
  | 'network'
  | 'retry_success'
  | 'fallback_backup';

interface ScenarioDef {
  id: ScenarioId;
  label: string;
  description: string;
}

const SCENARIOS: ReadonlyArray<ScenarioDef> = [
  {
    id: '503',
    label: '503 Overloaded',
    description: 'Primary returns HTTP 503 UNAVAILABLE on every attempt (no backup).',
  },
  {
    id: '429_minute',
    label: '429 Per-Minute',
    description: 'Attempt 1 returns 429 GenerateRequestsPerMinute + Retry-After: 40; attempt 2 succeeds.',
  },
  {
    id: '429_day',
    label: '429 Per-Day',
    description: 'Returns 429 GenerateRequestsPerDay; stops immediately without retry.',
  },
  {
    id: 'timeout',
    label: 'Timeout (90s scaled)',
    description: 'Transport stalls until the scaled 90s per-attempt timeout aborts it across 3 attempts.',
  },
  {
    id: 'network',
    label: 'Network Failure',
    description: 'Transport rejects with TypeError("Failed to fetch").',
  },
  {
    id: 'retry_success',
    label: 'Success After 1 Retry',
    description: 'Attempt 1 returns 503; attempt 2 succeeds with 200 OK.',
  },
  {
    id: 'fallback_backup',
    label: 'Fallback to Backup',
    description: 'Primary hits 429 Per-Day; policy switches to backup model and succeeds.',
  },
];

function makeJsonResponse(params: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}): GeminiTransportResponse {
  const headerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(params.headers ?? {})) {
    headerMap.set(k.toLowerCase(), v);
  }
  const textBody = JSON.stringify(params.body);
  return {
    ok: params.status >= 200 && params.status < 300,
    status: params.status,
    statusText: String(params.status),
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => params.body,
    text: async () => textBody,
  };
}

function makeOkGeminiBody(text: string): Record<string, unknown> {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 8,
      thoughtsTokenCount: 0,
      totalTokenCount: 20,
    },
  };
}

function createScenarioTransport(
  scenario: ScenarioId,
  onTransportEvent: (line: string) => void
): GeminiTransport {
  let calls = 0;

  return async (req: GeminiTransportRequest): Promise<GeminiTransportResponse> => {
    calls += 1;
    const shortModel = req.modelName.replace(/^models\//, '');
    onTransportEvent(`[transport #${calls}] POST ${shortModel}`);

    switch (scenario) {
      case '503':
        return makeJsonResponse({
          status: 503,
          body: {
            error: {
              code: 503,
              status: 'UNAVAILABLE',
              message: 'The model is currently overloaded. Please try again later.',
            },
          },
        });

      case '429_minute':
        if (calls === 1) {
          return makeJsonResponse({
            status: 429,
            headers: { 'Retry-After': '40' },
            body: {
              error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                message: 'Quota exceeded for GenerateRequestsPerMinute.',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [
                      {
                        quotaMetric:
                          'generativelanguage.googleapis.com/generate_requests_per_minute',
                        quotaId: 'GenerateRequestsPerMinutePerProjectPerModel',
                      },
                    ],
                  },
                ],
              },
            },
          });
        }
        return makeJsonResponse({
          status: 200,
          body: makeOkGeminiBody('Recovered after per-minute wait.'),
        });

      case '429_day':
        return makeJsonResponse({
          status: 429,
          body: {
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Daily quota exhausted for GenerateRequestsPerDay.',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [
                    {
                      quotaMetric:
                        'generativelanguage.googleapis.com/generate_requests_per_day',
                      quotaId: 'GenerateRequestsPerDayPerProjectPerModel',
                    },
                  ],
                },
              ],
            },
          },
        });

      case 'timeout':
        return new Promise<GeminiTransportResponse>((_resolve, reject) => {
          if (req.signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          req.signal.addEventListener(
            'abort',
            () => {
              onTransportEvent(`[transport #${calls}] aborted by timeout/caller signal`);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        });

      case 'network':
        throw new TypeError('Failed to fetch');

      case 'retry_success':
        if (calls === 1) {
          return makeJsonResponse({
            status: 503,
            body: {
              error: {
                code: 503,
                status: 'UNAVAILABLE',
                message: 'Temporary server overload.',
              },
            },
          });
        }
        return makeJsonResponse({
          status: 200,
          body: makeOkGeminiBody('Succeeded on attempt #2.'),
        });

      case 'fallback_backup':
        if (shortModel === 'gemini-primary-sim') {
          return makeJsonResponse({
            status: 429,
            body: {
              error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                message: 'Quota exceeded for GenerateRequestsPerDay.',
              },
            },
          });
        }
        return makeJsonResponse({
          status: 200,
          body: makeOkGeminiBody(`Backup ${shortModel} answered successfully.`),
        });
    }
  };
}

export function SimulatedTransportPanel() {
  const [timeScale, setTimeScale] = useState<number>(0.02);
  const [runningScenario, setRunningScenario] = useState<ScenarioId | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveStatus, setLiveStatus] = useState<string>('Idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<{
    ok: boolean;
    summary: string;
    details: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (runningScenario === null) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - started));
    }, 50);
    return () => window.clearInterval(id);
  }, [runningScenario]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunningScenario(null);
    setElapsedMs(0);
    setLiveStatus('Stopped by user');
  };

  const handleRunScenario = async (scenario: ScenarioId) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunningScenario(scenario);
    setElapsedMs(0);
    setLiveStatus(`Running ${scenario}...`);
    setLogs([`Starting simulated scenario "${scenario}" at ${timeScale}x timeScale`]);
    setOutcome(null);

    const transport = createScenarioTransport(scenario, appendLog);
    const backupModelName =
      scenario === 'fallback_backup' ? 'models/gemini-backup-sim' : undefined;

    try {
      const res = await callGeminiWithPolicy({
        apiKey: 'simulated-dev-key',
        modelName: 'models/gemini-primary-sim',
        backupModelName,
        contents: [{ role: 'user', parts: [{ text: 'Simulated reliability check' }] }],
        timeScale,
        transport,
        signal: controller.signal,
        onStatus: (ev) => {
          setLiveStatus(ev.message);
          appendLog(`[onStatus:${ev.type}] ${ev.message}`);
        },
        onAttempt: (info) => {
          appendLog(
            `[onAttempt] model=${info.modelName} ok=${String(info.ok)} tokens=${info.usage?.totalTokenCount ?? 0}`
          );
        },
      });

      setLiveStatus(`Completed via ${res.answeringModel}`);
      setOutcome({
        ok: true,
        summary: `OK · answeringModel=${res.answeringModel} · usedBackup=${String(res.usedBackup)}`,
        details: JSON.stringify(
          {
            answeringModel: res.answeringModel,
            requestedModel: res.requestedModel,
            usedBackup: res.usedBackup,
            attemptedModels: res.attemptedModels,
            text: res.text,
          },
          null,
          2
        ),
      });
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        appendLog('[aborted] Stopped cleanly with AbortError');
        setOutcome({
          ok: false,
          summary: 'Aborted by caller (no error card)',
          details: 'AbortError raised and swallowed cleanly.',
        });
        return;
      }

      if (err instanceof GeminiRequestError) {
        setLiveStatus(`Failed (${err.kind})`);
        setOutcome({
          ok: false,
          summary: `GeminiRequestError · kind=${err.kind} · retryable=${String(err.retryable)}`,
          details: JSON.stringify(
            {
              kind: err.kind,
              httpStatus: err.httpStatus,
              retryable: err.retryable,
              retryAfterMs: err.retryAfterMs,
              message: err.message,
              userAction: err.userAction,
              explanation: err.explanation,
            },
            null,
            2
          ),
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setOutcome({
          ok: false,
          summary: `Unexpected error: ${msg}`,
          details: msg,
        });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRunningScenario(null);
      setElapsedMs(0);
    }
  };

  return (
    <section
      id="simulated-transport"
      className="flex flex-col rounded-xl border border-amber-800/60 bg-[#111827] p-5 sm:p-6 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
              Simulated transport (dev only)
            </h2>
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Uses simulated fake HTTP responses through{' '}
            <code className="font-mono text-slate-300">callGeminiWithPolicy</code>{' '}
            (does not hit Google or write to the real usage ledger).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="sim-time-scale" className="text-slate-400">
            Time scale:
          </label>
          <select
            id="sim-time-scale"
            value={String(timeScale)}
            onChange={(e) => setTimeScale(Number(e.target.value))}
            disabled={runningScenario !== null}
            className="rounded-lg border border-slate-700 bg-[#080C14] px-2.5 py-1.5 font-mono text-xs text-slate-100"
          >
            <option value="0.01">0.01x (90s → 0.9s)</option>
            <option value="0.02">0.02x (90s → 1.8s)</option>
            <option value="0.05">0.05x (90s → 4.5s)</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((sc) => {
          const active = runningScenario === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => void handleRunScenario(sc.id)}
              disabled={runningScenario !== null}
              title={sc.description}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-left text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              <span className="truncate">{active ? `Running ${sc.label}...` : sc.label}</span>
              <Play className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-[#080C14] p-3 text-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-slate-200">{liveStatus}</span>
          <div className="flex items-center gap-2">
            {runningScenario !== null && (
              <>
                <span className="font-mono text-slate-400 tabular-nums">
                  {(elapsedMs / 1000).toFixed(2)}s
                </span>
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </div>

        {logs.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded border border-slate-800/80 bg-[#05080F] p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
            {logs.join('\n')}
          </pre>
        )}

        {outcome && (
          <div
            className={`rounded-lg border p-2.5 ${
              outcome.ok
                ? 'border-emerald-800/60 bg-emerald-950/25 text-emerald-200'
                : 'border-rose-800/60 bg-rose-950/25 text-rose-200'
            }`}
          >
            <p className="font-mono font-semibold">{outcome.summary}</p>
            <pre className="mt-1.5 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {outcome.details}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
