'use client';

import {
  buildThinkingConfig,
  normalizeBareModelKey,
  type GeminiContent,
} from '@/lib/ai/gemini-client';
import { GeminiRequestError } from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';
import { extractJsonFromText } from '@/lib/ai/plan-schema';
import {
  getStoredApiKey,
  getStoredBackupModel,
  getStoredModel,
} from '@/lib/storage';
import type { VideoFormat } from '@/lib/types';
import { runAudit, type AuditIssue, type AuditReport } from '../audit/audit';
import { autoFix } from '../audit/autofix';
import { getLayoutDefinition } from '../layouts/registry';
import {
  applyDefaultAudioForNewSpec,
  getJsonSchema,
  normalizeVideoSpec,
  type VideoSpec,
} from '../spec';
import {
  buildDirectorRepairPrompt,
  buildDirectorRevisePrompt,
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  type AvoidLookCombination,
} from './prompt';

export type GenerateStatusPhase =
  | 'writing'
  | 'repairing'
  | 'checking'
  | 'fixing'
  | 'revising'
  | 'done';

export interface GenerateStatusEvent {
  phase: GenerateStatusPhase;
  message: string;
  detail?: string;
}

export interface GenerateSpecOptions {
  prompt: string;
  format: VideoFormat;
  targetSeconds?: number;
  avoid?: AvoidLookCombination[];
  apiKey?: string;
  modelName?: string;
  backupModelName?: string;
  seed?: number;
  signal?: AbortSignal;
  onStatus?: (status: GenerateStatusEvent) => void;
}

export interface GenerateSpecResult {
  spec: VideoSpec;
  brief: string;
  auditBefore: AuditReport;
  auditAfter: AuditReport;
  calls: number;
  usedRepair: boolean;
  usedRevise: boolean;
  tokens: {
    prompt: number;
    output: number;
    thinking: number;
  };
  ms: number;
  model: string;
  warnings: string[];
}

function getDirectorResponseSchema(): Record<string, unknown> {
  const base = getJsonSchema();
  const baseProps = (base.properties ?? {}) as Record<string, unknown>;
  const baseRequired = Array.isArray(base.required)
    ? (base.required as string[])
    : ['title', 'format', 'theme', 'scenes'];

  return {
    ...base,
    required: Array.from(new Set(['brief', ...baseRequired])),
    properties: {
      brief: {
        type: 'STRING',
        nullable: false,
      },
      ...baseProps,
    },
  };
}

function clampBriefWords(raw: unknown, fallbackTitle: string): string {
  const text =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim().replace(/\s+/g, ' ')
      : `Motion graphics sequence for ${fallbackTitle}.`;
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 36) {
    return words.join(' ');
  }
  return `${words.slice(0, 36).join(' ')}…`;
}

function validateRequiredSlots(spec: VideoSpec): string[] {
  const errors: string[] = [];
  for (let i = 0; i < spec.scenes.length; i++) {
    const scene = spec.scenes[i];
    const def = getLayoutDefinition(scene.layout);
    if (!def) continue;
    for (const slot of def.slots) {
      if (!slot.required) continue;
      const val = scene.slots[slot.name];
      if (slot.type === 'string') {
        if (typeof val !== 'string' || val.trim().length === 0) {
          errors.push(
            `Scene ${i + 1} (${scene.layout}): missing required slot "${slot.name}".`
          );
        }
      } else if (
        slot.type === 'string[]' ||
        slot.type === 'items[]' ||
        slot.type === 'data[]' ||
        slot.type === 'blocks[]'
      ) {
        if (!Array.isArray(val) || val.length === 0) {
          errors.push(
            `Scene ${i + 1} (${scene.layout}): required array slot "${slot.name}" must be non-empty.`
          );
        }
      }
    }
  }
  return errors;
}

function parseAndValidateSpec(
  rawText: string,
  forcedSeed?: number
):
  | {
      ok: true;
      spec: VideoSpec;
      brief: string;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    } {
  let parsed: unknown;
  try {
    parsed = extractJsonFromText(rawText);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failed'}`,
      ],
      warnings: [],
    };
  }

  const normalized = normalizeVideoSpec(parsed);
  if (!normalized.ok) {
    return {
      ok: false,
      errors: normalized.errors,
      warnings: normalized.warnings,
    };
  }

  const slotErrors = validateRequiredSlots(normalized.spec);
  if (slotErrors.length > 0) {
    return {
      ok: false,
      errors: slotErrors,
      warnings: normalized.warnings,
    };
  }

  const rawRecord =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const brief = clampBriefWords(rawRecord.brief, normalized.spec.title);
  const spec: VideoSpec =
    typeof forcedSeed === 'number' && Number.isFinite(forcedSeed)
      ? {
          ...normalized.spec,
          seed: Math.abs(Math.round(forcedSeed)) % 1000000,
        }
      : normalized.spec;

  return {
    ok: true,
    spec,
    brief,
    warnings: normalized.warnings,
  };
}

function countErrorIssues(issues: readonly AuditIssue[]): number {
  return issues.filter((i) => i.severity === 'error').length;
}

function isBetterAuditResult(
  candidate: AuditReport,
  incumbent: AuditReport
): boolean {
  const candErrors = countErrorIssues(candidate.issues);
  const incErrors = countErrorIssues(incumbent.issues);
  if (candErrors !== incErrors) {
    return candErrors < incErrors;
  }
  return candidate.score > incumbent.score;
}

function serializeSpecForRevise(spec: VideoSpec): string {
  return JSON.stringify(
    {
      title: spec.title,
      format: spec.format,
      style: spec.style,
      intensity: spec.intensity,
      seed: spec.seed,
      ...(spec.numerals ? { numerals: spec.numerals } : {}),
      ...(spec.transition ? { transition: spec.transition } : {}),
      ...(spec.audio ? { audio: spec.audio } : {}),
      theme: {
        palette:
          spec.theme.paletteName === 'custom'
            ? spec.theme.palette
            : spec.theme.paletteName,
        mood: spec.theme.mood,
      },
      scenes: spec.scenes,
    },
    null,
    2
  );
}

export async function generateSpec(
  options: GenerateSpecOptions
): Promise<GenerateSpecResult> {
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const promptText = options.prompt.trim();
  if (!promptText) {
    throw new Error('Please enter a video prompt.');
  }

  const apiKey = (options.apiKey ?? getStoredApiKey()).trim();
  if (!apiKey) {
    throw new GeminiRequestError({
      kind: 'auth',
      message: 'Gemini API key is not configured.',
      userAction:
        'Add your Gemini API key in Settings to generate Motion Kit videos.',
      explanation: 'No Gemini API key was found in local storage or options.',
      rawDetails: 'Missing GEMINI API key before generateSpec request.',
      retryable: false,
    });
  }

  const primaryModel = (options.modelName ?? getStoredModel()).trim();
  if (!primaryModel) {
    throw new GeminiRequestError({
      kind: 'model_not_found',
      message: 'No Gemini model is selected.',
      userAction: 'Select a primary Gemini model in Settings.',
      explanation: 'No Gemini model name was selected in Settings.',
      rawDetails: 'Missing Gemini model name before generateSpec request.',
      retryable: false,
    });
  }

  const backupModel = (options.backupModelName ?? getStoredBackupModel()).trim();
  const startedAt = performance.now();

  const systemInstruction = buildDirectorSystemPrompt();
  const responseSchema = getDirectorResponseSchema();
  const userMessage = buildDirectorUserPrompt({
    prompt: promptText,
    format: options.format,
    targetSeconds: options.targetSeconds,
    avoid: options.avoid,
    seedHint: options.seed,
  });

  const sameBackupModel =
    !backupModel ||
    normalizeBareModelKey(backupModel) === normalizeBareModelKey(primaryModel);
  const explicitThinkingConfig = sameBackupModel
    ? buildThinkingConfig(primaryModel)
    : undefined;

  let calls = 0;
  let usedRepair = false;
  let usedRevise = false;
  let answeringModel = primaryModel;
  const tokens = {
    prompt: 0,
    output: 0,
    thinking: 0,
  };

  const accumulateUsage = (usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    thoughtsTokenCount?: number;
  }) => {
    if (!usage) return;
    tokens.prompt += usage.promptTokenCount ?? 0;
    tokens.output += usage.candidatesTokenCount ?? 0;
    tokens.thinking += usage.thoughtsTokenCount ?? 0;
  };

  const invokeGemini = async (
    contents: GeminiContent[],
    temperature: number,
    phase: GenerateStatusPhase
  ) => {
    calls += 1;
    const res = await callGeminiWithPolicy({
      apiKey,
      modelName: primaryModel,
      backupModelName: backupModel || undefined,
      systemInstruction,
      contents,
      temperature,
      maxOutputTokens: 4000,
      thinkingConfigMode: 'auto_low',
      ...(explicitThinkingConfig ? { thinkingConfig: explicitThinkingConfig } : {}),
      responseMimeType: 'application/json',
      responseSchema,
      signal: options.signal,
      onStatus: (ev) => {
        if (ev.type === 'waiting' || ev.type === 'fallback') {
          options.onStatus?.({
            phase,
            message:
              phase === 'writing'
                ? 'writing the design'
                : phase === 'repairing'
                  ? 'repairing JSON'
                  : 'fixing',
            detail: ev.message,
          });
        }
      },
    });
    answeringModel = res.answeringModel;
    accumulateUsage(res.usageMetadata);
    return res;
  };

  options.onStatus?.({
    phase: 'writing',
    message: 'writing the design',
  });

  const firstRes = await invokeGemini(
    [{ role: 'user', parts: [{ text: userMessage }] }],
    0.9,
    'writing'
  );

  let validated = parseAndValidateSpec(firstRes.text, options.seed);

  if (!validated.ok) {
    usedRepair = true;
    options.onStatus?.({
      phase: 'repairing',
      message: 'repairing JSON',
      detail: validated.errors[0],
    });

    const repairPrompt = buildDirectorRepairPrompt({
      originalRequest: userMessage,
      previousOutput: firstRes.text,
      errors: validated.errors,
    });

    const repairRes = await invokeGemini(
      [{ role: 'user', parts: [{ text: repairPrompt }] }],
      0.35,
      'repairing'
    );

    const repaired = parseAndValidateSpec(repairRes.text, options.seed);
    if (!repaired.ok) {
      throw new Error(
        `AI output failed validation after repair (${repaired.errors.join('; ')})`
      );
    }
    validated = repaired;
  }

  validated = {
    ...validated,
    spec: applyDefaultAudioForNewSpec(validated.spec, promptText),
  };

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  options.onStatus?.({
    phase: 'checking',
    message: 'checking quality',
  });

  const auditBefore = await runAudit(validated.spec, {
    targetSeconds: options.targetSeconds,
  });

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  options.onStatus?.({
    phase: 'fixing',
    message: 'fixing',
  });

  const fix1 = await autoFix(validated.spec, auditBefore, {
    targetSeconds: options.targetSeconds,
    maxPasses: 3,
  });

  let bestSpec = fix1.spec;
  let bestBrief = validated.brief;
  let bestAudit = fix1.finalReport;
  let bestWarnings = [...validated.warnings, ...fix1.applied];

  const remainingErrors = bestAudit.issues.filter(
    (issue) => issue.severity === 'error'
  );

  if (remainingErrors.length > 0 && calls < 2) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    usedRevise = true;
    options.onStatus?.({
      phase: 'revising',
      message: 'fixing',
      detail: `Revising ${remainingErrors.length} remaining error${remainingErrors.length === 1 ? '' : 's'} with AI`,
    });

    const revisePrompt = buildDirectorRevisePrompt({
      originalRequest: userMessage,
      currentSpecJson: serializeSpecForRevise(bestSpec),
      brief: bestBrief,
      issues: bestAudit.issues.slice(0, 12).map((iss) => ({
        severity: iss.severity,
        code: iss.code,
        sceneIndex: iss.sceneIndex,
        message: iss.message,
        detail: iss.detail,
      })),
    });

    try {
      const reviseRes = await invokeGemini(
        [{ role: 'user', parts: [{ text: revisePrompt }] }],
        0.5,
        'revising'
      );
      const revised = parseAndValidateSpec(reviseRes.text, bestSpec.seed);
      if (revised.ok) {
        const reviseAudit = await runAudit(revised.spec, {
          targetSeconds: options.targetSeconds,
        });
        const fix2 = await autoFix(revised.spec, reviseAudit, {
          targetSeconds: options.targetSeconds,
          maxPasses: 3,
        });

        if (isBetterAuditResult(fix2.finalReport, bestAudit)) {
          bestSpec = fix2.spec;
          bestBrief = revised.brief || bestBrief;
          bestAudit = fix2.finalReport;
          bestWarnings = [...revised.warnings, ...fix2.applied];
        }
      }
    } catch (reviseErr) {
      if (
        reviseErr instanceof DOMException &&
        reviseErr.name === 'AbortError'
      ) {
        throw reviseErr;
      }
      bestWarnings = [
        ...bestWarnings,
        `AI revise attempt skipped: ${reviseErr instanceof Error ? reviseErr.message : 'unknown error'}`,
      ];
    }
  }

  bestSpec = applyDefaultAudioForNewSpec(bestSpec, promptText);

  options.onStatus?.({
    phase: 'done',
    message: 'done',
  });

  return {
    spec: bestSpec,
    brief: bestBrief,
    auditBefore,
    auditAfter: bestAudit,
    calls,
    usedRepair,
    usedRevise,
    tokens,
    ms: Math.round(performance.now() - startedAt),
    model: answeringModel,
    warnings: bestWarnings,
  };
}
