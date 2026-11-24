import {
  isAbortError,
  isTransientBusyError,
  type GeminiContent,
  type GeminiRetryInfo,
  type GeminiStatusEvent,
} from '@/lib/ai/gemini-client';
import {
  GeminiRequestError,
  type GeminiErrorKind,
} from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';
import {
  buildAnimatorRepairPrompt,
  buildAnimatorScenePrompt,
  buildAnimatorSystemPrompt,
} from '@/lib/ai/prompts/animator';
import { compileComponent, type CompiledComponentType } from '@/lib/compile';
import type {
  GeminiUsageMetadata,
  PlanScene,
  PlanStyle,
  SceneAttempt,
  VideoFormat,
} from '@/lib/types';
import {
  buildSceneTheme,
  secondsToFrames,
  type SceneProps,
} from '@/lib/video/dimensions';

export const MAX_ANIMATOR_ATTEMPTS = 3;
const ANIMATOR_MAX_OUTPUT_TOKENS = 6000;
const ANIMATOR_MAX_TRANSIENT_ATTEMPTS = 3;
const ANIMATOR_RETRY_DELAYS_MS = [3000, 8000];
const ANIMATOR_RETRY_AFTER_CAP_MS = 60_000;

export const RETRYING_ON_BACKUP_MODEL_NOTE = 'retrying on backup model';

const END_OF_BUILD_RETRY_ERROR_KINDS = new Set<GeminiErrorKind>([
  'overloaded',
  'timeout',
  'timeout_budget',
  'quota_minute',
  'quota_day',
  'model_not_found',
]);

export function isEndOfBuildRetryEligible(
  errorKind: GeminiErrorKind | undefined
): boolean {
  return (
    errorKind !== undefined && END_OF_BUILD_RETRY_ERROR_KINDS.has(errorKind)
  );
}

export type SceneProbeFn = (params: {
  component: CompiledComponentType;
  props: SceneProps;
  width: number;
  height: number;
  fps: number;
  signal?: AbortSignal;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

export type SceneBuildStage = 'writing' | 'checking' | 'repairing';

export interface BuildSingleSceneInput {
  apiKey: string;
  modelName: string;
  backupModelName?: string;
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  style: PlanStyle;
  scene: PlanScene;
  sceneIndex: number;
  totalScenes: number;
  otherScenes: Array<{ name: string; motion: string }>;
  probeScene: SceneProbeFn;
  signal?: AbortSignal;
  initialRepairContext?: {
    previousCode: string;
    errorMessage: string;
  };
  onStageChange?: (stage: SceneBuildStage) => void;
  onStatus?: (event: GeminiStatusEvent | null) => void;
  onRetry?: (info: GeminiRetryInfo | null) => void;
  onUsage?: (usage: {
    modelName: string;
    requestsMade: number;
    promptTokens: number;
    outputTokens: number;
    thoughtTokens: number;
  }) => void;
}

export type BuildSingleSceneResult =
  | {
      ok: true;
      code: string;
      component: CompiledComponentType;
      modelName: string;
      attempts: SceneAttempt[];
      rawOutputs: string[];
      tokens: number;
      promptTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      elapsedMs: number;
    }
  | {
      ok: false;
      internal?: boolean;
      transientBusy?: boolean;
      errorKind?: GeminiErrorKind;
      userAction?: string;
      modelName: string;
      error: string;
      code: string;
      attempts: SceneAttempt[];
      rawOutputs: string[];
      tokens: number;
      promptTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      elapsedMs: number;
    };

export function formatAttemptLabel(attempts: SceneAttempt[]): string | null {
  if (attempts.length === 0) return null;
  const last = attempts[attempts.length - 1];
  if (last.outcome === 'ok') {
    if (attempts.length === 1) return '1st try';
    if (attempts.length === 2) return 'repaired once';
    return `repaired ${attempts.length - 1}x`;
  }
  return `${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'}`;
}

export async function buildSingleScene(
  input: BuildSingleSceneInput
): Promise<BuildSingleSceneResult> {
  const startedAt = Date.now();
  const durationInFrames = secondsToFrames(input.scene.durationSeconds, input.fps);
  const theme = buildSceneTheme(input.style);
  const sceneProps: SceneProps = {
    texts: input.scene.onScreenText,
    theme,
    durationInFrames,
  };

  const systemInstruction = buildAnimatorSystemPrompt();
  const initialUserPrompt = input.initialRepairContext
    ? buildAnimatorRepairPrompt({
        previousCode: input.initialRepairContext.previousCode,
        errorMessage: input.initialRepairContext.errorMessage,
        wasTruncated: false,
        durationInFrames,
        textsCount: input.scene.onScreenText.length,
      })
    : buildAnimatorScenePrompt({
        format: input.format,
        width: input.width,
        height: input.height,
        fps: input.fps,
        style: input.style,
        scene: input.scene,
        sceneIndex: input.sceneIndex,
        totalScenes: input.totalScenes,
        otherScenes: input.otherScenes,
        durationInFrames,
      });

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [{ text: initialUserPrompt }],
    },
  ];

  const attempts: SceneAttempt[] = [];
  const rawOutputs: string[] = [];
  let totalSceneTokens = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalThoughtTokens = 0;
  let latestCode = input.initialRepairContext?.previousCode ?? '';
  let lastError = 'Scene failed to build.';
  let previousFailureError: string | null =
    input.initialRepairContext?.errorMessage ?? null;
  let answeringModel = input.modelName;

  const reportAttemptUsage = (info: {
    modelName: string;
    usage?: GeminiUsageMetadata;
  }) => {
    answeringModel = info.modelName;
    const prompt = info.usage?.promptTokenCount ?? 0;
    const output = info.usage?.candidatesTokenCount ?? 0;
    const thought = info.usage?.thoughtsTokenCount ?? 0;
    const total = info.usage?.totalTokenCount ?? prompt + output + thought;

    totalPromptTokens += prompt;
    totalOutputTokens += output;
    totalThoughtTokens += thought;
    totalSceneTokens += total;

    input.onUsage?.({
      modelName: info.modelName,
      requestsMade: 1,
      promptTokens: prompt,
      outputTokens: output,
      thoughtTokens: thought,
    });
  };

  const tokenTotals = () => ({
    tokens: totalSceneTokens,
    promptTokens: totalPromptTokens,
    outputTokens: totalOutputTokens,
    thoughtTokens: totalThoughtTokens,
  });

  for (let attemptNum = 1; attemptNum <= MAX_ANIMATOR_ATTEMPTS; attemptNum++) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    input.onRetry?.(null);
    input.onStatus?.(null);
    input.onStageChange?.(
      attemptNum === 1 && !input.initialRepairContext ? 'writing' : 'repairing'
    );

    let rawText = '';
    let finishReason: string | undefined;

    try {
      const response = await callGeminiWithPolicy({
        apiKey: input.apiKey,
        modelName: input.modelName,
        backupModelName: input.backupModelName,
        systemInstruction,
        contents,
        temperature: attemptNum === 1 && !input.initialRepairContext ? 0.3 : 0.2,
        maxOutputTokens: ANIMATOR_MAX_OUTPUT_TOKENS,
        thinkingConfigMode: 'auto_low',
        responseMimeType: 'text/plain',
        maxTransientAttemptsPerModel: ANIMATOR_MAX_TRANSIENT_ATTEMPTS,
        retryDelaysMs: ANIMATOR_RETRY_DELAYS_MS,
        retryAfterCapMs: ANIMATOR_RETRY_AFTER_CAP_MS,
        signal: input.signal,
        onStatus: (ev) => input.onStatus?.(ev),
        onRetry: input.onRetry,
        onAttempt: reportAttemptUsage,
      });

      rawText = response.text;
      finishReason = response.finishReason;
      answeringModel = response.answeringModel;
      rawOutputs.push(rawText);
    } catch (err: unknown) {
      if (isAbortError(err) || input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const transientBusy = isTransientBusyError(err);
      const errorKind =
        err instanceof GeminiRequestError ? err.kind : 'unknown';
      const userAction =
        err instanceof GeminiRequestError ? err.userAction : undefined;
      const apiMessage =
        err instanceof GeminiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);

      if (!transientBusy) {
        attempts.push({
          outcome: 'api_error',
          error: apiMessage,
          modelName: answeringModel,
        });
      }

      // API errors never trigger a repair prompt.
      return {
        ok: false,
        transientBusy,
        errorKind,
        userAction,
        modelName: answeringModel,
        error: apiMessage,
        code: latestCode,
        attempts,
        rawOutputs,
        ...tokenTotals(),
        elapsedMs: Date.now() - startedAt,
      };
    }

    if (finishReason === 'MAX_TOKENS') {
      lastError = `Output was truncated at the ${ANIMATOR_MAX_OUTPUT_TOKENS}-token limit (finishReason: MAX_TOKENS).`;
      attempts.push({
        outcome: 'truncated',
        error: lastError,
        modelName: answeringModel,
      });
      latestCode = rawText;

      if (
        previousFailureError !== null &&
        lastError.trim() === previousFailureError.trim()
      ) {
        return {
          ok: false,
          modelName: answeringModel,
          error: lastError,
          code: latestCode,
          attempts,
          rawOutputs,
          ...tokenTotals(),
          elapsedMs: Date.now() - startedAt,
        };
      }
      previousFailureError = lastError;

      if (attemptNum < MAX_ANIMATOR_ATTEMPTS) {
        const repairPrompt = buildAnimatorRepairPrompt({
          previousCode: rawText,
          errorMessage: lastError,
          wasTruncated: true,
          durationInFrames,
          textsCount: input.scene.onScreenText.length,
        });
        contents.push({ role: 'model', parts: [{ text: rawText }] });
        contents.push({ role: 'user', parts: [{ text: repairPrompt }] });
        continue;
      }

      return {
        ok: false,
        modelName: answeringModel,
        error: lastError,
        code: latestCode,
        attempts,
        rawOutputs,
        ...tokenTotals(),
        elapsedMs: Date.now() - startedAt,
      };
    }

    const compiled = compileComponent(rawText);
    latestCode = compiled.sanitizedCode || rawText;

    if (!compiled.ok) {
      // Internal compiler failures never trigger repair and never count as an AI attempt.
      if (compiled.internal) {
        return {
          ok: false,
          internal: true,
          modelName: answeringModel,
          error: compiled.error,
          code: latestCode,
          attempts,
          rawOutputs,
          ...tokenTotals(),
          elapsedMs: Date.now() - startedAt,
        };
      }

      lastError = compiled.error;
      attempts.push({
        outcome: 'compile_error',
        error: compiled.error,
        modelName: answeringModel,
      });

      if (
        previousFailureError !== null &&
        lastError.trim() === previousFailureError.trim()
      ) {
        return {
          ok: false,
          modelName: answeringModel,
          error: lastError,
          code: latestCode,
          attempts,
          rawOutputs,
          ...tokenTotals(),
          elapsedMs: Date.now() - startedAt,
        };
      }
      previousFailureError = lastError;

      if (attemptNum < MAX_ANIMATOR_ATTEMPTS) {
        const repairPrompt = buildAnimatorRepairPrompt({
          previousCode: compiled.sanitizedCode || rawText,
          errorMessage: compiled.error,
          line: compiled.line,
          codeSnippet: compiled.codeSnippet,
          wasTruncated: false,
          durationInFrames,
          textsCount: input.scene.onScreenText.length,
        });
        contents.push({ role: 'model', parts: [{ text: rawText }] });
        contents.push({ role: 'user', parts: [{ text: repairPrompt }] });
        continue;
      }

      return {
        ok: false,
        modelName: answeringModel,
        error: compiled.error,
        code: latestCode,
        attempts,
        rawOutputs,
        ...tokenTotals(),
        elapsedMs: Date.now() - startedAt,
      };
    }

    input.onStageChange?.('checking');
    input.onStatus?.(null);

    const probeResult = await input.probeScene({
      component: compiled.component,
      props: sceneProps,
      width: input.width,
      height: input.height,
      fps: input.fps,
      signal: input.signal,
    });

    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (!probeResult.ok) {
      lastError = `Runtime check failed: ${probeResult.error}`;
      attempts.push({
        outcome: 'runtime_error',
        error: lastError,
        modelName: answeringModel,
      });

      if (
        previousFailureError !== null &&
        lastError.trim() === previousFailureError.trim()
      ) {
        return {
          ok: false,
          modelName: answeringModel,
          error: lastError,
          code: compiled.sanitizedCode,
          attempts,
          rawOutputs,
          ...tokenTotals(),
          elapsedMs: Date.now() - startedAt,
        };
      }
      previousFailureError = lastError;

      if (attemptNum < MAX_ANIMATOR_ATTEMPTS) {
        const repairPrompt = buildAnimatorRepairPrompt({
          previousCode: compiled.sanitizedCode,
          errorMessage: probeResult.error,
          wasTruncated: false,
          durationInFrames,
          textsCount: input.scene.onScreenText.length,
        });
        contents.push({ role: 'model', parts: [{ text: rawText }] });
        contents.push({ role: 'user', parts: [{ text: repairPrompt }] });
        continue;
      }

      return {
        ok: false,
        modelName: answeringModel,
        error: lastError,
        code: compiled.sanitizedCode,
        attempts,
        rawOutputs,
        ...tokenTotals(),
        elapsedMs: Date.now() - startedAt,
      };
    }

    attempts.push({ outcome: 'ok', modelName: answeringModel });
    return {
      ok: true,
      code: compiled.sanitizedCode,
      component: compiled.component,
      modelName: answeringModel,
      attempts,
      rawOutputs,
      ...tokenTotals(),
      elapsedMs: Date.now() - startedAt,
    };
  }

  return {
    ok: false,
    modelName: answeringModel,
    error: lastError,
    code: latestCode,
    attempts,
    rawOutputs,
    ...tokenTotals(),
    elapsedMs: Date.now() - startedAt,
  };
}
