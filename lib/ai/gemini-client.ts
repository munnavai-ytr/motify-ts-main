import {
  classifyFetchFailure,
  createBlockedError,
  createLinkedAbortHandle,
  createTimeoutError,
  createTruncatedError,
  GeminiRequestError,
  isAbortError,
  parseHttpErrorResponse,
  type GeminiErrorKind,
  type HttpResponseLike,
} from '@/lib/ai/gemini-errors';
import type { GeminiUsageMetadata } from '@/lib/types';
import { recordUsageLedgerEntry } from '@/lib/usage-ledger';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 120_000;
export const DEFAULT_TOTAL_BUDGET_MS = 240_000;
export const DEFAULT_MAX_TRANSIENT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [1500, 4000];
const DEFAULT_RETRY_AFTER_CAP_MS = 60_000;

const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'SPII',
  'BLOCKLIST',
]);

// Session-level cache of models whose generateContent endpoint rejected thinkingConfig (HTTP 400).
const unsupportedThinkingModels = new Set<string>();

export function normalizeBareModelKey(modelName: string): string {
  return modelName.trim().replace(/^models\//i, '').toLowerCase();
}

export function formatShortModelName(modelName: string): string {
  return modelName.trim().replace(/^models\//i, '');
}

/**
 * Returns a LOW thinkingConfig suited to the model family per official Gemini
 * API docs (https://ai.google.dev/gemini-api/docs/thinking):
 * - Gemini 3.x / Gemini 4.x: `{ thinkingLevel: 'LOW' }`
 * - Gemini 2.5 Flash-Lite: `{ thinkingBudget: 0 }` (default is off; non-zero min is 512)
 * - Gemini 2.5 Pro / 2.5 Flash: `{ thinkingBudget: 512 }` (>= 128 Pro min)
 * - Older / unknown models: `undefined`
 */
export function buildThinkingConfig(
  modelName: string
): Record<string, unknown> | undefined {
  const bare = normalizeBareModelKey(modelName);
  if (!bare || unsupportedThinkingModels.has(bare)) {
    return undefined;
  }

  if (bare.startsWith('gemini-3') || bare.startsWith('gemini-4')) {
    return { thinkingLevel: 'LOW' };
  }

  if (bare.startsWith('gemini-2.5')) {
    if (bare.includes('flash-lite')) {
      return { thinkingBudget: 0 };
    }
    return { thinkingBudget: 512 };
  }

  return undefined;
}

export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiContentPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

export interface GeminiTransportRequest {
  url: string;
  modelName: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface GeminiTransportResponse extends HttpResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

export type GeminiTransport = (
  req: GeminiTransportRequest
) => Promise<GeminiTransportResponse>;

export type GeminiStatusEvent =
  | {
      type: 'attempt';
      model: string;
      attempt: number;
      maxAttempts: number;
      isBackup: boolean;
      message: string;
    }
  | {
      type: 'waiting';
      model: string;
      nextAttempt: number;
      maxAttempts: number;
      delayMs: number;
      reasonKind: GeminiErrorKind;
      message: string;
    }
  | {
      type: 'timeout';
      model: string;
      attempt: number;
      maxAttempts: number;
      message: string;
    }
  | {
      type: 'fallback';
      fromModel: string;
      toModel: string;
      reasonKind: GeminiErrorKind;
      message: string;
    };

export interface GeminiRetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

export interface GeminiGenerateParams {
  apiKey: string;
  modelName: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: Record<string, unknown>;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
  maxTransientAttempts?: number;
  retryDelaysMs?: number[];
  retryAfterCapMs?: number;
  attemptTimeoutMs?: number;
  totalBudgetMs?: number;
  deadlineMs?: number;
  timeScale?: number;
  isBackupAttempt?: boolean;
  transport?: GeminiTransport;
  signal?: AbortSignal;
  onStatus?: (event: GeminiStatusEvent) => void;
  onRetry?: (info: GeminiRetryInfo) => void;
  onAttempt?: (usage?: GeminiUsageMetadata, ok?: boolean) => void;
}

export interface GeminiGenerateResult {
  text: string;
  modelName: string;
  finishReason?: string;
  usageMetadata?: GeminiUsageMetadata;
  usedStructuredSchema: boolean;
  elapsedMs: number;
}

export { isAbortError };

export function isTransientBusyError(err: unknown): boolean {
  if (!(err instanceof GeminiRequestError)) {
    return false;
  }
  return (
    err.kind === 'overloaded' ||
    err.kind === 'quota_minute' ||
    err.kind === 'quota_day' ||
    err.kind === 'timeout' ||
    err.kind === 'timeout_budget'
  );
}

function defaultFetchTransport(
  req: GeminiTransportRequest
): Promise<GeminiTransportResponse> {
  return fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: req.signal,
  });
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timerId);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const timerId = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function computeRetryDelayMs(
  failedAttemptIndex: number,
  retryDelaysMs: number[],
  capMs: number,
  retryAfterMs?: number
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(Math.max(0, retryAfterMs), capMs);
  }
  const idx = Math.min(
    Math.max(0, failedAttemptIndex - 1),
    Math.max(0, retryDelaysMs.length - 1)
  );
  const baseMs = retryDelaysMs[idx] ?? 4000;
  const jitterMs = Math.round(Math.random() * 350);
  return Math.min(baseMs + jitterMs, capMs);
}

function describeRetryReason(err: GeminiRequestError): string {
  switch (err.kind) {
    case 'overloaded':
      return 'Model overloaded';
    case 'quota_minute':
      return 'Rate limit reached';
    case 'timeout':
      return 'Timed out';
    case 'network':
      return 'Network error';
    case 'model_not_found':
      return 'Model temporarily unavailable (404)';
    default:
      return err.message;
  }
}

function isUnsupportedStructuredOutputError(err: GeminiRequestError): boolean {
  if (err.kind !== 'bad_request' && err.httpStatus !== 400) {
    return false;
  }
  const haystack = `${err.message} ${err.explanation} ${err.rawDetails}`.toLowerCase();
  return (
    haystack.includes('schema') ||
    haystack.includes('response_mime_type') ||
    haystack.includes('responsemimetype') ||
    haystack.includes('json mode') ||
    haystack.includes('controlled generation') ||
    haystack.includes('application/json') ||
    haystack.includes('not supported') ||
    haystack.includes('unsupported')
  );
}

function isUnsupportedThinkingConfigError(
  err: GeminiRequestError,
  hasStructuredOutput: boolean
): boolean {
  if (err.kind !== 'bad_request' && err.httpStatus !== 400) {
    return false;
  }
  const haystack = `${err.message} ${err.explanation} ${err.rawDetails}`.toLowerCase();
  if (
    haystack.includes('thinking') ||
    haystack.includes('thinking_config') ||
    haystack.includes('thinkingconfig') ||
    haystack.includes('thinking_level') ||
    haystack.includes('thinkinglevel') ||
    haystack.includes('thinking_budget') ||
    haystack.includes('thinkingbudget')
  ) {
    return true;
  }
  return (
    !hasStructuredOutput &&
    (haystack.includes('unknown name') ||
      haystack.includes('invalid value') ||
      haystack.includes('not supported') ||
      haystack.includes('unsupported'))
  );
}

interface RawGeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

async function executeSingleFetch(params: {
  trimmedKey: string;
  normalizedModel: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: Record<string, unknown>;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
  retryAfterCapMs: number;
  scaledAttemptTimeoutMs: number;
  deadlineMs: number;
  transport?: GeminiTransport;
  signal?: AbortSignal;
  onAttempt?: (usage?: GeminiUsageMetadata, ok?: boolean) => void;
}): Promise<{
  text: string;
  finishReason?: string;
  usageMetadata?: GeminiUsageMetadata;
  elapsedMs: number;
}> {
  if (params.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const remainingBudgetMs = params.deadlineMs - Date.now();
  if (remainingBudgetMs <= 0) {
    throw createTimeoutError(
      'timeout_budget',
      'Whole-call 240s budget was already exhausted before starting attempt.'
    );
  }

  const isRealHttp = !params.transport;
  const transportFn = params.transport ?? defaultFetchTransport;
  const shortModel = formatShortModelName(params.normalizedModel);

  const generationConfig: Record<string, unknown> = {};
  if (typeof params.temperature === 'number') {
    generationConfig.temperature = params.temperature;
  }
  if (typeof params.maxOutputTokens === 'number') {
    generationConfig.maxOutputTokens = params.maxOutputTokens;
  }
  if (params.thinkingConfig) {
    generationConfig.thinkingConfig = params.thinkingConfig;
  }
  if (params.responseMimeType) {
    generationConfig.responseMimeType = params.responseMimeType;
  }
  if (params.responseSchema) {
    generationConfig.responseSchema = params.responseSchema;
  }

  const body: Record<string, unknown> = {
    contents: params.contents,
  };

  if (params.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const effectiveTimeoutMs = Math.max(
    1,
    Math.min(params.scaledAttemptTimeoutMs, remainingBudgetMs)
  );
  const timeoutReason: 'timeout' | 'timeout_budget' =
    remainingBudgetMs < params.scaledAttemptTimeoutMs
      ? 'timeout_budget'
      : 'timeout';

  const linkedAbort = createLinkedAbortHandle(params.signal);
  let timeoutFired = false;
  const timerId = globalThis.setTimeout(() => {
    timeoutFired = true;
    linkedAbort.abortForTimeout();
  }, effectiveTimeoutMs);

  const start = performance.now();

  try {
    let response: GeminiTransportResponse;
    try {
      response = await transportFn({
        url: `${GEMINI_API_BASE}/${params.normalizedModel}:generateContent`,
        modelName: params.normalizedModel,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': params.trimmedKey,
        },
        body,
        signal: linkedAbort.signal,
      });
    } catch (err: unknown) {
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (timeoutFired || (isAbortError(err) && !params.signal?.aborted)) {
        params.onAttempt?.(undefined, false);
        if (isRealHttp) {
          void recordUsageLedgerEntry({
            model: shortModel,
            promptTokens: 0,
            outputTokens: 0,
            thoughtTokens: 0,
            ok: false,
          });
        }
        throw createTimeoutError(
          timeoutReason,
          `Request aborted after ${effectiveTimeoutMs}ms (${timeoutReason}).`
        );
      }

      params.onAttempt?.(undefined, false);
      throw classifyFetchFailure(err);
    }

    if (!response.ok) {
      params.onAttempt?.(undefined, false);
      if (isRealHttp) {
        void recordUsageLedgerEntry({
          model: shortModel,
          promptTokens: 0,
          outputTokens: 0,
          thoughtTokens: 0,
          ok: false,
        });
      }
      throw await parseHttpErrorResponse(response, params.retryAfterCapMs);
    }

    let data: RawGeminiResponse;
    try {
      data = (await response.json()) as RawGeminiResponse;
    } catch (err: unknown) {
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (timeoutFired || (isAbortError(err) && !params.signal?.aborted)) {
        params.onAttempt?.(undefined, false);
        if (isRealHttp) {
          void recordUsageLedgerEntry({
            model: shortModel,
            promptTokens: 0,
            outputTokens: 0,
            thoughtTokens: 0,
            ok: false,
          });
        }
        throw createTimeoutError(
          timeoutReason,
          `Response body read timed out after ${effectiveTimeoutMs}ms.`
        );
      }
      throw classifyFetchFailure(err);
    }

    const elapsedMs = Math.round(performance.now() - start);
    const promptTokenCount = data.usageMetadata?.promptTokenCount ?? 0;
    const candidatesTokenCount = data.usageMetadata?.candidatesTokenCount ?? 0;
    const thoughtsTokenCount = data.usageMetadata?.thoughtsTokenCount;

    const usageMetadata: GeminiUsageMetadata | undefined = data.usageMetadata
      ? {
          promptTokenCount,
          candidatesTokenCount,
          ...(typeof thoughtsTokenCount === 'number'
            ? { thoughtsTokenCount }
            : {}),
          totalTokenCount:
            data.usageMetadata.totalTokenCount ??
            promptTokenCount + candidatesTokenCount + (thoughtsTokenCount ?? 0),
        }
      : undefined;

    if (data.promptFeedback?.blockReason) {
      params.onAttempt?.(usageMetadata, false);
      if (isRealHttp) {
        void recordUsageLedgerEntry({
          model: shortModel,
          promptTokens: promptTokenCount,
          outputTokens: candidatesTokenCount,
          thoughtTokens: thoughtsTokenCount ?? 0,
          ok: false,
        });
      }
      throw createBlockedError({
        reason: data.promptFeedback.blockReason,
        explanation: data.promptFeedback.blockReasonMessage,
        rawDetails: JSON.stringify(data, null, 2),
      });
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim() ?? '';

    if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason) && !text) {
      params.onAttempt?.(usageMetadata, false);
      if (isRealHttp) {
        void recordUsageLedgerEntry({
          model: shortModel,
          promptTokens: promptTokenCount,
          outputTokens: candidatesTokenCount,
          thoughtTokens: thoughtsTokenCount ?? 0,
          ok: false,
        });
      }
      throw createBlockedError({
        reason: finishReason,
        rawDetails: JSON.stringify(data, null, 2),
      });
    }

    if (!text) {
      params.onAttempt?.(usageMetadata, false);
      if (isRealHttp) {
        void recordUsageLedgerEntry({
          model: shortModel,
          promptTokens: promptTokenCount,
          outputTokens: candidatesTokenCount,
          thoughtTokens: thoughtsTokenCount ?? 0,
          ok: false,
        });
      }
      if (finishReason === 'MAX_TOKENS') {
        throw createTruncatedError({
          modelName: shortModel,
          rawDetails: JSON.stringify(data, null, 2),
        });
      }
      throw new GeminiRequestError({
        kind: 'unknown',
        retryable: false,
        message: 'The model returned an empty response.',
        userAction: 'Retry the request or switch to another model in Settings.',
        explanation: `Empty response from ${params.normalizedModel} (finishReason: ${finishReason ?? 'unknown'}).`,
        rawDetails: JSON.stringify(data, null, 2),
      });
    }

    params.onAttempt?.(usageMetadata, true);
    if (isRealHttp) {
      void recordUsageLedgerEntry({
        model: shortModel,
        promptTokens: promptTokenCount,
        outputTokens: candidatesTokenCount,
        thoughtTokens: thoughtsTokenCount ?? 0,
        ok: true,
      });
    }

    return {
      text,
      finishReason,
      usageMetadata,
      elapsedMs,
    };
  } finally {
    globalThis.clearTimeout(timerId);
    linkedAbort.cleanup();
  }
}

async function executeWithTransientRetry(params: {
  trimmedKey: string;
  normalizedModel: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: Record<string, unknown>;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
  maxTransientAttempts: number;
  retryDelaysMs: number[];
  retryAfterCapMs: number;
  scaledAttemptTimeoutMs: number;
  deadlineMs: number;
  timeScale: number;
  isBackupAttempt: boolean;
  transport?: GeminiTransport;
  signal?: AbortSignal;
  onStatus?: (event: GeminiStatusEvent) => void;
  onRetry?: (info: GeminiRetryInfo) => void;
  onAttempt?: (usage?: GeminiUsageMetadata, ok?: boolean) => void;
}): Promise<{
  text: string;
  finishReason?: string;
  usageMetadata?: GeminiUsageMetadata;
  elapsedMs: number;
}> {
  const shortModel = formatShortModelName(params.normalizedModel);
  let attempt = 1;

  while (true) {
    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (Date.now() >= params.deadlineMs) {
      throw createTimeoutError(
        'timeout_budget',
        'Whole-call 240s budget exceeded.'
      );
    }

    params.onStatus?.({
      type: 'attempt',
      model: shortModel,
      attempt,
      maxAttempts: params.maxTransientAttempts,
      isBackup: params.isBackupAttempt,
      message: `Attempt ${attempt}/${params.maxTransientAttempts} on ${shortModel}`,
    });

    try {
      return await executeSingleFetch(params);
    } catch (err: unknown) {
      if (isAbortError(err) || params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const geminiErr = classifyFetchFailure(err);

      if (geminiErr.kind === 'timeout') {
        params.onStatus?.({
          type: 'timeout',
          model: shortModel,
          attempt,
          maxAttempts: params.maxTransientAttempts,
          message: `Timed out on ${shortModel} (attempt ${attempt}/${params.maxTransientAttempts})`,
        });
      }

      const effectiveMaxAttempts =
        geminiErr.kind === 'model_not_found'
          ? Math.min(2, params.maxTransientAttempts)
          : params.maxTransientAttempts;

      if (
        geminiErr.kind !== 'timeout_budget' &&
        attempt < effectiveMaxAttempts &&
        geminiErr.retryable
      ) {
        const logicalDelayMs = computeRetryDelayMs(
          attempt,
          params.retryDelaysMs,
          params.retryAfterCapMs,
          geminiErr.retryAfterMs
        );
        const scaledDelayMs = Math.max(
          10,
          Math.round(logicalDelayMs * params.timeScale)
        );
        const remainingBudgetMs = params.deadlineMs - Date.now();
        if (remainingBudgetMs <= 0 || scaledDelayMs >= remainingBudgetMs) {
          throw createTimeoutError(
            'timeout_budget',
            `Retry wait (${scaledDelayMs}ms) would exceed remaining call budget (${remainingBudgetMs}ms). Last error: ${geminiErr.rawDetails}`
          );
        }

        const nextAttempt = attempt + 1;
        const reason = describeRetryReason(geminiErr);
        const waitSeconds = Math.max(1, Math.round(logicalDelayMs / 1000));

        params.onStatus?.({
          type: 'waiting',
          model: shortModel,
          nextAttempt,
          maxAttempts: effectiveMaxAttempts,
          delayMs: logicalDelayMs,
          reasonKind: geminiErr.kind,
          message: `${reason} — waiting ${waitSeconds}s before attempt ${nextAttempt}/${effectiveMaxAttempts} on ${shortModel}`,
        });

        params.onRetry?.({
          attempt: nextAttempt,
          maxAttempts: effectiveMaxAttempts,
          delayMs: logicalDelayMs,
          reason,
        });

        await abortableSleep(scaledDelayMs, params.signal);
        attempt = nextAttempt;
        continue;
      }

      throw geminiErr;
    }
  }
}

export async function callGeminiGenerateContent(
  params: GeminiGenerateParams
): Promise<GeminiGenerateResult> {
  const trimmedKey = params.apiKey.trim();
  if (!trimmedKey) {
    throw new GeminiRequestError({
      kind: 'auth',
      retryable: false,
      message: 'Your Gemini API key is missing.',
      userAction: 'Connect a Gemini API key in Settings before sending a message.',
      explanation: 'API key is empty.',
      rawDetails: 'Missing API key',
    });
  }

  const trimmedModel = params.modelName.trim();
  if (!trimmedModel) {
    throw new GeminiRequestError({
      kind: 'model_not_found',
      retryable: false,
      message: 'No Gemini model is selected.',
      userAction: 'Select a Gemini model in Settings before sending a message.',
      explanation: 'No model selected.',
      rawDetails: 'Missing modelName',
    });
  }

  const bareModelKey = normalizeBareModelKey(trimmedModel);
  const normalizedModel = trimmedModel.startsWith('models/')
    ? trimmedModel
    : `models/${trimmedModel}`;

  const requestedStructured = Boolean(
    params.responseSchema || params.responseMimeType === 'application/json'
  );

  const effectiveThinkingConfig =
    params.thinkingConfig && !unsupportedThinkingModels.has(bareModelKey)
      ? params.thinkingConfig
      : undefined;

  const maxTransientAttempts =
    params.maxTransientAttempts ?? DEFAULT_MAX_TRANSIENT_ATTEMPTS;
  const retryDelaysMs = params.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const retryAfterCapMs = params.retryAfterCapMs ?? DEFAULT_RETRY_AFTER_CAP_MS;
  const timeScale =
    typeof params.timeScale === 'number' &&
    Number.isFinite(params.timeScale) &&
    params.timeScale > 0
      ? params.timeScale
      : 1;

  const attemptTimeoutMs = params.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const scaledAttemptTimeoutMs = Math.max(
    10,
    Math.round(attemptTimeoutMs * timeScale)
  );
  const totalBudgetMs = params.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const scaledTotalBudgetMs = Math.max(20, Math.round(totalBudgetMs * timeScale));
  const deadlineMs = params.deadlineMs ?? Date.now() + scaledTotalBudgetMs;
  const isBackupAttempt = Boolean(params.isBackupAttempt);

  try {
    const res = await executeWithTransientRetry({
      trimmedKey,
      normalizedModel,
      systemInstruction: params.systemInstruction,
      contents: params.contents,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      thinkingConfig: effectiveThinkingConfig,
      responseMimeType: params.responseMimeType,
      responseSchema: params.responseSchema,
      maxTransientAttempts,
      retryDelaysMs,
      retryAfterCapMs,
      scaledAttemptTimeoutMs,
      deadlineMs,
      timeScale,
      isBackupAttempt,
      transport: params.transport,
      signal: params.signal,
      onStatus: params.onStatus,
      onRetry: params.onRetry,
      onAttempt: params.onAttempt,
    });

    return {
      ...res,
      modelName: normalizedModel,
      usedStructuredSchema: requestedStructured && Boolean(params.responseSchema),
    };
  } catch (err: unknown) {
    if (isAbortError(err) || params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (
      effectiveThinkingConfig &&
      err instanceof GeminiRequestError &&
      isUnsupportedThinkingConfigError(err, requestedStructured)
    ) {
      unsupportedThinkingModels.add(bareModelKey);

      const resWithoutThinking = await executeWithTransientRetry({
        trimmedKey,
        normalizedModel,
        systemInstruction: params.systemInstruction,
        contents: params.contents,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        thinkingConfig: undefined,
        responseMimeType: params.responseMimeType,
        responseSchema: params.responseSchema,
        maxTransientAttempts,
        retryDelaysMs,
        retryAfterCapMs,
        scaledAttemptTimeoutMs,
        deadlineMs,
        timeScale,
        isBackupAttempt,
        transport: params.transport,
        signal: params.signal,
        onStatus: params.onStatus,
        onRetry: params.onRetry,
        onAttempt: params.onAttempt,
      });

      return {
        ...resWithoutThinking,
        modelName: normalizedModel,
        usedStructuredSchema:
          requestedStructured && Boolean(params.responseSchema),
      };
    }

    if (
      requestedStructured &&
      err instanceof GeminiRequestError &&
      isUnsupportedStructuredOutputError(err)
    ) {
      const fallbackSystemInstruction = params.systemInstruction
        ? `${params.systemInstruction}\n\nCRITICAL FALLBACK RULE: Output ONLY a single raw valid JSON object with all four keys ("kind", "message", "assumptions", "plan"). Do not wrap it in markdown code fences and do not include any text outside the JSON object.`
        : 'Output ONLY a single raw valid JSON object with no markdown fences or surrounding text.';

      const fallbackRes = await executeWithTransientRetry({
        trimmedKey,
        normalizedModel,
        systemInstruction: fallbackSystemInstruction,
        contents: params.contents,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        thinkingConfig: effectiveThinkingConfig,
        maxTransientAttempts,
        retryDelaysMs,
        retryAfterCapMs,
        scaledAttemptTimeoutMs,
        deadlineMs,
        timeScale,
        isBackupAttempt,
        transport: params.transport,
        signal: params.signal,
        onStatus: params.onStatus,
        onRetry: params.onRetry,
        onAttempt: params.onAttempt,
      });

      return {
        ...fallbackRes,
        modelName: normalizedModel,
        usedStructuredSchema: false,
      };
    }

    throw err;
  }
}
