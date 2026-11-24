import {
  buildThinkingConfig,
  callGeminiGenerateContent,
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_MAX_TRANSIENT_ATTEMPTS,
  DEFAULT_TOTAL_BUDGET_MS,
  formatShortModelName,
  isAbortError,
  normalizeBareModelKey,
  type GeminiContent,
  type GeminiGenerateResult,
  type GeminiRetryInfo,
  type GeminiStatusEvent,
  type GeminiTransport,
} from '@/lib/ai/gemini-client';
import { GeminiRequestError, type GeminiErrorKind } from '@/lib/ai/gemini-errors';
import type { GeminiUsageMetadata } from '@/lib/types';

const FALLBACK_ELIGIBLE_KINDS = new Set<GeminiErrorKind>([
  'overloaded',
  'timeout',
  'quota_minute',
  'quota_day',
  'model_not_found',
]);

export interface GeminiPolicyParams {
  apiKey: string;
  modelName: string;
  backupModelName?: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfigMode?: 'none' | 'auto_low';
  thinkingConfig?: Record<string, unknown>;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
  maxTransientAttemptsPerModel?: number;
  retryDelaysMs?: number[];
  retryAfterCapMs?: number;
  attemptTimeoutMs?: number;
  totalBudgetMs?: number;
  timeScale?: number;
  transport?: GeminiTransport;
  signal?: AbortSignal;
  onStatus?: (event: GeminiStatusEvent) => void;
  onRetry?: (info: GeminiRetryInfo) => void;
  onAttempt?: (info: {
    modelName: string;
    usage?: GeminiUsageMetadata;
    ok?: boolean;
  }) => void;
}

export interface GeminiPolicyResult extends GeminiGenerateResult {
  answeringModel: string;
  requestedModel: string;
  usedBackup: boolean;
  attemptedModels: string[];
}

function shouldFallbackToBackup(
  err: GeminiRequestError,
  primaryModel: string,
  backupModel: string
): boolean {
  if (!backupModel) return false;
  if (normalizeBareModelKey(primaryModel) === normalizeBareModelKey(backupModel)) {
    return false;
  }
  return FALLBACK_ELIGIBLE_KINDS.has(err.kind);
}

function describeFallbackReason(kind: GeminiErrorKind): string {
  switch (kind) {
    case 'overloaded':
      return 'overloaded';
    case 'timeout':
      return 'timed out';
    case 'quota_minute':
      return 'rate limited';
    case 'quota_day':
      return 'daily quota reached';
    case 'model_not_found':
      return 'model not found';
    default:
      return kind;
  }
}

export async function callGeminiWithPolicy(
  params: GeminiPolicyParams
): Promise<GeminiPolicyResult> {
  if (params.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const primaryModel = params.modelName.trim();
  const backupModel = params.backupModelName?.trim() ?? '';

  const timeScale =
    typeof params.timeScale === 'number' &&
    Number.isFinite(params.timeScale) &&
    params.timeScale > 0
      ? params.timeScale
      : 1;

  const totalBudgetMs = params.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const scaledTotalBudgetMs = Math.max(20, Math.round(totalBudgetMs * timeScale));
  const deadlineMs = Date.now() + scaledTotalBudgetMs;

  const maxAttemptsPerModel = Math.min(
    DEFAULT_MAX_TRANSIENT_ATTEMPTS,
    Math.max(1, params.maxTransientAttemptsPerModel ?? DEFAULT_MAX_TRANSIENT_ATTEMPTS)
  );

  const attemptTimeoutMs = params.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const attemptedModels: string[] = [];

  const resolveThinkingConfig = (
    model: string
  ): Record<string, unknown> | undefined => {
    if (params.thinkingConfig) {
      return params.thinkingConfig;
    }
    if (params.thinkingConfigMode === 'auto_low') {
      return buildThinkingConfig(model);
    }
    return undefined;
  };

  attemptedModels.push(primaryModel);

  try {
    const primaryRes = await callGeminiGenerateContent({
      apiKey: params.apiKey,
      modelName: primaryModel,
      systemInstruction: params.systemInstruction,
      contents: params.contents,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      thinkingConfig: resolveThinkingConfig(primaryModel),
      responseMimeType: params.responseMimeType,
      responseSchema: params.responseSchema,
      maxTransientAttempts: maxAttemptsPerModel,
      retryDelaysMs: params.retryDelaysMs,
      retryAfterCapMs: params.retryAfterCapMs,
      attemptTimeoutMs,
      totalBudgetMs,
      deadlineMs,
      timeScale,
      isBackupAttempt: false,
      transport: params.transport,
      signal: params.signal,
      onStatus: params.onStatus,
      onRetry: params.onRetry,
      onAttempt: (usage, ok) =>
        params.onAttempt?.({
          modelName: primaryModel,
          usage,
          ok,
        }),
    });

    return {
      ...primaryRes,
      answeringModel: primaryRes.modelName,
      requestedModel: primaryModel,
      usedBackup: false,
      attemptedModels,
    };
  } catch (err: unknown) {
    if (isAbortError(err) || params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (
      err instanceof GeminiRequestError &&
      shouldFallbackToBackup(err, primaryModel, backupModel) &&
      Date.now() < deadlineMs
    ) {
      const shortPrimary = formatShortModelName(primaryModel);
      const shortBackup = formatShortModelName(backupModel);

      params.onStatus?.({
        type: 'fallback',
        fromModel: shortPrimary,
        toModel: shortBackup,
        reasonKind: err.kind,
        message: `Switched to backup model ${shortBackup} (${describeFallbackReason(err.kind)} on ${shortPrimary})`,
      });

      attemptedModels.push(backupModel);

      const backupRes = await callGeminiGenerateContent({
        apiKey: params.apiKey,
        modelName: backupModel,
        systemInstruction: params.systemInstruction,
        contents: params.contents,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        thinkingConfig: resolveThinkingConfig(backupModel),
        responseMimeType: params.responseMimeType,
        responseSchema: params.responseSchema,
        maxTransientAttempts: maxAttemptsPerModel,
        retryDelaysMs: params.retryDelaysMs,
        retryAfterCapMs: params.retryAfterCapMs,
        attemptTimeoutMs,
        totalBudgetMs,
        deadlineMs,
        timeScale,
        isBackupAttempt: true,
        transport: params.transport,
        signal: params.signal,
        onStatus: params.onStatus,
        onRetry: params.onRetry,
        onAttempt: (usage, ok) =>
          params.onAttempt?.({
            modelName: backupModel,
            usage,
            ok,
          }),
      });

      return {
        ...backupRes,
        answeringModel: backupRes.modelName,
        requestedModel: primaryModel,
        usedBackup: true,
        attemptedModels,
      };
    }

    throw err;
  }
}
