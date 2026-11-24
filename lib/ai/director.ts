import {
  isAbortError,
  type GeminiContent,
  type GeminiContentPart,
  type GeminiRetryInfo,
  type GeminiStatusEvent,
} from '@/lib/ai/gemini-client';
import {
  GeminiRequestError,
  type GeminiErrorKind,
} from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';
import {
  DirectorOutputSchema,
  DURATION_LIMITS,
  extractJsonFromText,
  formatSeconds,
  formatZodErrors,
  GEMINI_DIRECTOR_RESPONSE_SCHEMA,
  getTotalDuration,
  normalizeDirectorPayload,
  roundDuration,
  validatePlanTotalDuration,
  type DirectorOutput,
  type RawPlanAudio,
} from '@/lib/ai/plan-schema';
import {
  buildDirectorContextMessage,
  buildDirectorRepairPrompt,
  buildDirectorSystemPrompt,
} from '@/lib/ai/prompts/director';
import { updateProject } from '@/lib/db';
import { applyOps } from '@/lib/kit/ops';
import type { AudioSpec } from '@/lib/kit/audio/types';
import { hashTitleToSeed, type VideoSpec } from '@/lib/kit/spec';
import type {
  ChatMessage,
  DebugInfo,
  FormatPreference,
  GeminiUsageMetadata,
  Plan,
  PlanScene,
  Project,
  VideoFormat,
  VideoType,
} from '@/lib/types';

export interface DirectorTurnInput {
  apiKey: string;
  modelName: string;
  backupModelName?: string;
  projectId?: string;
  format: FormatPreference;
  projectType: VideoType;
  recentMessages: ChatMessage[];
  currentPlan: Plan | null;
  currentSpec?: VideoSpec | null;
  hasExistingVideo?: boolean;
  userPrompt: string;
  currentTurnParts?: GeminiContentPart[];
  currentAttachmentSummaryLines?: string[];
  signal?: AbortSignal;
  onPhase?: (phase: 'design' | 'check' | 'repair', detail?: string) => void;
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

export type DirectorTurnResult =
  | {
      ok: true;
      output: DirectorOutput;
      debugInfo: DebugInfo;
      updatedFormat?: VideoFormat;
      updatedProject?: Project;
      updatedSpec?: VideoSpec;
    }
  | {
      ok: false;
      summary: string;
      userAction?: string;
      errorKind?: GeminiErrorKind;
      details: string;
      retryable: boolean;
      debugInfo: DebugInfo;
    };

function generateSceneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `scene_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function reconcileSceneIds(
  scenes: PlanScene[],
  previousPlan: Plan | null
): PlanScene[] {
  const validExistingIds = new Set(
    (previousPlan?.scenes ?? []).map((scene) => scene.id)
  );
  const seen = new Set<string>();

  return scenes.map((scene) => {
    const trimmedId = scene.id.trim();
    const shouldKeep =
      trimmedId.length > 0 &&
      trimmedId.toLowerCase() !== 'new' &&
      validExistingIds.has(trimmedId) &&
      !seen.has(trimmedId);

    let nextId = shouldKeep ? trimmedId : generateSceneId();
    while (seen.has(nextId)) {
      nextId = generateSceneId();
    }
    seen.add(nextId);

    return {
      ...scene,
      id: nextId,
      durationSeconds: roundDuration(scene.durationSeconds),
    };
  });
}

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

function normalizeDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)));
}

function extractTargetDurationFromText(text: string): number | null {
  const normalized = normalizeDigits(text)
    // Ignore relative delta phrases like "by 2 seconds"
    .replace(
      /\b(?:by|plus|minus)\s+\d+(?:\.\d+)?\s*(?:seconds?|secs?|s(?![a-zA-Z]))/gi,
      ' '
    )
    // Ignore single-scene duration edits like "scene 2 to 3s"
    .replace(
      /(?:scene|সিন)\s*\d+\s*(?:to|at|for|=|:)?\s*\d+(?:\.\d+)?\s*(?:seconds?|secs?|s(?![a-zA-Z])|সেকেন্ড(?:ের)?)/gi,
      ' '
    );

  const regex =
    /(\d+(?:\.\d+)?)\s*(?:-|\s)*(?:seconds?|secs?|s(?![a-zA-Z])|সেকেন্ড(?:ের)?)/gi;

  let lastMatch: number | null = null;
  for (const match of normalized.matchAll(regex)) {
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > 0) {
      lastMatch = roundDuration(num);
    }
  }
  return lastMatch;
}

function detectTargetDurationSeconds(
  userPrompt: string,
  recentMessages: ChatMessage[]
): number | null {
  const fromCurrent = extractTargetDurationFromText(userPrompt);
  if (fromCurrent !== null) {
    return fromCurrent;
  }

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.type === 'user_text') {
      const fromHistory = extractTargetDurationFromText(msg.content);
      if (fromHistory !== null) {
        return fromHistory;
      }
    }
  }

  return null;
}

function mapRawPlanAudio(
  rawAudio: RawPlanAudio | null | undefined,
  planTitle: string,
  scenes: PlanScene[],
  projectType: VideoType,
  userPrompt: string
): AudioSpec | undefined {
  if (rawAudio === null || rawAudio === undefined) {
    return undefined;
  }

  const isLowerThird = projectType === 'Lower third';
  const hasChromaScene = scenes.some((s) =>
    /\bchroma\b|green\s*screen|blue\s*screen/i.test(
      `${s.name} ${s.purpose} ${s.visualIdea} ${s.motion}`
    )
  );
  const hasChromaPrompt = /\bchroma\b|green\s*screen|blue\s*screen/i.test(
    userPrompt
  );
  const defaultMute = isLowerThird || hasChromaScene || hasChromaPrompt;

  return {
    ...(rawAudio.musicStyle
      ? {
          music: {
            style: rawAudio.musicStyle,
            seed: hashTitleToSeed(planTitle),
          },
        }
      : {}),
    sfx: rawAudio.sfx ?? 'auto',
    mute: rawAudio.mute ?? defaultMute,
  };
}

function validateDirectorOutput(
  rawText: string,
  projectType: VideoType,
  targetDurationSeconds: number | null,
  userPrompt: string,
  options?: {
    hasCurrentPlan?: boolean;
    hasExistingVideo?: boolean;
    currentSpec?: VideoSpec | null;
  }
):
  | { valid: true; output: DirectorOutput }
  | { valid: false; errors: string[] } {
  let parsedJson: unknown;
  try {
    parsedJson = extractJsonFromText(rawText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON output.';
    return { valid: false, errors: [`JSON parse error: ${msg}`] };
  }

  const normalizedJson = normalizeDirectorPayload(parsedJson);
  const zodResult = DirectorOutputSchema.safeParse(normalizedJson);
  if (!zodResult.success) {
    return {
      valid: false,
      errors: formatZodErrors(zodResult.error.issues),
    };
  }

  const parsedOutput = zodResult.data;
  if (parsedOutput.kind === 'edit') {
    if (!options?.hasExistingVideo && !options?.hasCurrentPlan) {
      return {
        valid: false,
        errors: [
          'Cannot use kind "edit" when no existing video or plan exists yet; return kind "plan" instead.',
        ],
      };
    }
    if (options?.currentSpec) {
      const check = applyOps(options.currentSpec, parsedOutput.ops);
      if (check.errors.length > 0) {
        return {
          valid: false,
          errors: check.errors,
        };
      }
    }
    return { valid: true, output: parsedOutput };
  }

  if (parsedOutput.kind === 'plan') {
    const durationCheck = validatePlanTotalDuration(
      parsedOutput.plan,
      projectType
    );
    if (!durationCheck.valid && durationCheck.error) {
      return {
        valid: false,
        errors: [durationCheck.error],
      };
    }

    if (targetDurationSeconds !== null) {
      const limits = DURATION_LIMITS[projectType];
      if (
        targetDurationSeconds >= limits.min &&
        targetDurationSeconds <= limits.max
      ) {
        const total = getTotalDuration(parsedOutput.plan.scenes);
        if (Math.abs(total - targetDurationSeconds) > 1) {
          return {
            valid: false,
            errors: [
              `Total is ${formatSeconds(total)} but the user asked for ${formatSeconds(targetDurationSeconds)} (+/-1s)`,
            ],
          };
        }
      }
    }

    const mappedAudio = mapRawPlanAudio(
      parsedOutput.plan.audio,
      parsedOutput.plan.title,
      parsedOutput.plan.scenes,
      projectType,
      userPrompt
    );
    const plan: Plan = {
      title: parsedOutput.plan.title,
      ...(parsedOutput.plan.format ? { format: parsedOutput.plan.format } : {}),
      style: parsedOutput.plan.style,
      scenes: parsedOutput.plan.scenes,
      ...(mappedAudio ? { audio: mappedAudio } : {}),
    };
    return {
      valid: true,
      output: {
        kind: 'plan',
        message: parsedOutput.message,
        assumptions: parsedOutput.assumptions,
        plan,
      },
    };
  }

  return { valid: true, output: parsedOutput };
}

async function applyPlanFormatUpdate(
  input: DirectorTurnInput,
  output: DirectorOutput
): Promise<{
  updatedFormat?: VideoFormat;
  updatedProject?: Project;
  updatedSpec?: VideoSpec;
}> {
  if (
    output.kind !== 'plan' ||
    !output.plan.format ||
    output.plan.format === input.format
  ) {
    return {};
  }

  const nextFormat = output.plan.format;
  let updatedSpec: VideoSpec | undefined;
  if (input.currentSpec) {
    const applied = applyOps(input.currentSpec, [
      { type: 'setFormat', format: nextFormat },
    ]);
    if (applied.errors.length === 0) {
      updatedSpec = applied.spec;
    }
  }

  let updatedProject: Project | undefined;
  if (input.projectId && typeof window !== 'undefined') {
    updatedProject = await updateProject(input.projectId, {
      format: nextFormat,
    });
  }

  return {
    updatedFormat: nextFormat,
    ...(updatedProject ? { updatedProject } : {}),
    ...(updatedSpec ? { updatedSpec } : {}),
  };
}

function addUsage(
  a: GeminiUsageMetadata | undefined,
  b: GeminiUsageMetadata | undefined
): GeminiUsageMetadata | undefined {
  if (!a && !b) return undefined;
  const thoughtsTokenCount =
    (a?.thoughtsTokenCount ?? 0) + (b?.thoughtsTokenCount ?? 0);
  return {
    promptTokenCount: (a?.promptTokenCount ?? 0) + (b?.promptTokenCount ?? 0),
    candidatesTokenCount:
      (a?.candidatesTokenCount ?? 0) + (b?.candidatesTokenCount ?? 0),
    ...(thoughtsTokenCount > 0 ? { thoughtsTokenCount } : {}),
    totalTokenCount: (a?.totalTokenCount ?? 0) + (b?.totalTokenCount ?? 0),
  };
}

function truncateOutputPreview(raw: string, maxChars = 1500): string {
  const trimmed = raw.trim();
  if (!trimmed) return '(empty)';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n... [truncated, ${trimmed.length} chars total]`;
}

export async function runDirectorTurn(
  input: DirectorTurnInput
): Promise<DirectorTurnResult> {
  const targetDurationSeconds = detectTargetDurationSeconds(
    input.userPrompt,
    input.recentMessages
  );
  const systemInstruction = buildDirectorSystemPrompt();
  const contextText = buildDirectorContextMessage({
    format: input.format,
    projectType: input.projectType,
    recentMessages: input.recentMessages,
    currentPlan: input.currentPlan,
    currentSpec: input.currentSpec,
    hasExistingVideo: input.hasExistingVideo,
    userPrompt: input.userPrompt,
    currentAttachmentSummaryLines: input.currentAttachmentSummaryLines,
    targetDurationSeconds,
  });

  const baseDebugContext: DebugInfo['requestContext'] = {
    format: input.format,
    type: input.projectType,
    recentMessageCount: input.recentMessages
      .filter((m) => m.type !== 'error')
      .slice(-10).length,
    hasCurrentPlan: Boolean(input.currentPlan),
    userPromptChars: input.userPrompt.length,
  };

  let totalUsage: GeminiUsageMetadata | undefined;
  let usedStructuredSchema = false;
  let rawModelOutput = '';
  let answeringModel = input.modelName;
  let usedBackupModel = false;

  const reportAttempt = (info: {
    modelName: string;
    usage?: GeminiUsageMetadata;
  }) => {
    answeringModel = info.modelName;
    input.onUsage?.({
      modelName: info.modelName,
      requestsMade: 1,
      promptTokens: info.usage?.promptTokenCount ?? 0,
      outputTokens: info.usage?.candidatesTokenCount ?? 0,
      thoughtTokens: info.usage?.thoughtsTokenCount ?? 0,
    });
  };

  const userParts: GeminiContentPart[] = [
    { text: contextText },
    ...(input.currentTurnParts ?? []),
  ];

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: userParts,
    },
  ];

  try {
    input.onPhase?.('design');
    const firstCall = await callGeminiWithPolicy({
      apiKey: input.apiKey,
      modelName: input.modelName,
      backupModelName: input.backupModelName,
      systemInstruction,
      contents,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_DIRECTOR_RESPONSE_SCHEMA,
      signal: input.signal,
      onStatus: (ev) => input.onStatus?.(ev),
      onRetry: input.onRetry,
      onAttempt: reportAttempt,
    });

    usedStructuredSchema = firstCall.usedStructuredSchema;
    rawModelOutput = firstCall.text;
    answeringModel = firstCall.answeringModel;
    usedBackupModel = firstCall.usedBackup;
    totalUsage = addUsage(totalUsage, firstCall.usageMetadata);

    input.onPhase?.('check');
    const firstValidation = validateDirectorOutput(
      firstCall.text,
      input.projectType,
      targetDurationSeconds,
      input.userPrompt,
      {
        hasCurrentPlan: Boolean(input.currentPlan),
        hasExistingVideo: Boolean(input.hasExistingVideo),
        currentSpec: input.currentSpec,
      }
    );

    if (firstValidation.valid) {
      const normalizedOutput: DirectorOutput =
        firstValidation.output.kind === 'plan'
          ? {
              ...firstValidation.output,
              plan: {
                ...firstValidation.output.plan,
                scenes: reconcileSceneIds(
                  firstValidation.output.plan.scenes,
                  input.currentPlan
                ),
              },
            }
          : firstValidation.output;

      const formatChange = await applyPlanFormatUpdate(input, normalizedOutput);

      return {
        ok: true,
        output: normalizedOutput,
        ...formatChange,
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: false,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput,
          usageMetadata: totalUsage,
        },
      };
    }

    // One automatic repair call if JSON or schema/duration validation failed
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    input.onRetry?.(null);
    input.onStatus?.(null);
    const errCount = firstValidation.errors.length;
    input.onPhase?.(
      'repair',
      `Fixing ${errCount} ${errCount === 1 ? 'issue' : 'issues'}`
    );

    const repairPrompt = buildDirectorRepairPrompt({
      projectType: input.projectType,
      invalidOutput: firstCall.text,
      validationErrors: firstValidation.errors,
    });

    const repairCall = await callGeminiWithPolicy({
      apiKey: input.apiKey,
      modelName: input.modelName,
      backupModelName: input.backupModelName,
      systemInstruction,
      contents: [
        ...contents,
        { role: 'model', parts: [{ text: firstCall.text }] },
        { role: 'user', parts: [{ text: repairPrompt }] },
      ],
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_DIRECTOR_RESPONSE_SCHEMA,
      signal: input.signal,
      onStatus: (ev) => input.onStatus?.(ev),
      onRetry: input.onRetry,
      onAttempt: reportAttempt,
    });

    usedStructuredSchema =
      usedStructuredSchema && repairCall.usedStructuredSchema;
    answeringModel = repairCall.answeringModel;
    usedBackupModel = usedBackupModel || repairCall.usedBackup;
    totalUsage = addUsage(totalUsage, repairCall.usageMetadata);

    input.onPhase?.('check');
    const repairValidation = validateDirectorOutput(
      repairCall.text,
      input.projectType,
      targetDurationSeconds,
      input.userPrompt,
      {
        hasCurrentPlan: Boolean(input.currentPlan),
        hasExistingVideo: Boolean(input.hasExistingVideo),
        currentSpec: input.currentSpec,
      }
    );

    if (repairValidation.valid) {
      const normalizedOutput: DirectorOutput =
        repairValidation.output.kind === 'plan'
          ? {
              ...repairValidation.output,
              plan: {
                ...repairValidation.output.plan,
                scenes: reconcileSceneIds(
                  repairValidation.output.plan.scenes,
                  input.currentPlan
                ),
              },
            }
          : repairValidation.output;

      const formatChange = await applyPlanFormatUpdate(input, normalizedOutput);

      return {
        ok: true,
        output: normalizedOutput,
        ...formatChange,
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: true,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput,
          repairModelOutput: repairCall.text,
          validationErrors: firstValidation.errors,
          usageMetadata: totalUsage,
        },
      };
    }

    return {
      ok: false,
      summary: 'The AI returned an invalid plan format after a repair attempt.',
      userAction: 'Try rephrasing your request or click Retry.',
      details: [
        'Initial validation errors:',
        ...firstValidation.errors.map((e) => `• ${e}`),
        '',
        'Repair validation errors:',
        ...repairValidation.errors.map((e) => `• ${e}`),
        '',
        'Raw model output (first 1500 chars):',
        truncateOutputPreview(firstCall.text, 1500),
        '',
        'Repair model output (first 1500 chars):',
        truncateOutputPreview(repairCall.text, 1500),
      ].join('\n'),
      retryable: true,
      debugInfo: {
        modelName: answeringModel,
        requestedModelName: input.modelName,
        usedBackupModel,
        usedStructuredSchema,
        repaired: true,
        timestamp: new Date().toISOString(),
        requestContext: baseDebugContext,
        rawModelOutput,
        repairModelOutput: repairCall.text,
        validationErrors: [
          ...firstValidation.errors,
          ...repairValidation.errors,
        ],
        usageMetadata: totalUsage,
      },
    };
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }

    if (err instanceof GeminiRequestError) {
      return {
        ok: false,
        summary: err.message,
        userAction: err.userAction,
        errorKind: err.kind,
        details: `${err.explanation}\n\n${err.rawDetails}`,
        retryable: err.retryable || err.kind === 'timeout_budget',
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: false,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput: rawModelOutput || undefined,
          validationErrors: [err.explanation],
          usageMetadata: totalUsage,
        },
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: 'Unexpected error while calling Gemini.',
      userAction: 'Try again or check Details for more information.',
      errorKind: 'unknown',
      details: message,
      retryable: true,
      debugInfo: {
        modelName: answeringModel,
        requestedModelName: input.modelName,
        usedBackupModel,
        usedStructuredSchema,
        repaired: false,
        timestamp: new Date().toISOString(),
        requestContext: baseDebugContext,
        rawModelOutput: rawModelOutput || undefined,
        validationErrors: [message],
        usageMetadata: totalUsage,
      },
    };
  }
}
