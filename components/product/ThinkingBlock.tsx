'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers,
  Loader2,
  MessageSquare,
  Paperclip,
  Pause,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { computeRunElapsedMs } from '@/lib/agent/runs';
import type { AgentDebugInfo, AgentRun, DebugInfo, RunStepId } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  run: AgentRun | null;
  isActive: boolean;
  fallbackDebugInfo?: AgentDebugInfo | DebugInfo;
  fallbackAssumptions?: string[];
  fallbackElapsedMs?: number;
}

const STEP_ICONS: Record<RunStepId, React.ComponentType<{ className?: string }>> = {
  understand: MessageSquare,
  attachments: Paperclip,
  design: Wand2,
  apply: Layers,
  check: ShieldCheck,
  save: Save,
};

function formatTokenShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatStepDuration(startedAt?: number, finishedAt?: number): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = Math.max(0, finishedAt - startedAt);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function sanitizeDebugPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDebugPayload);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (
        lower.includes('apikey') ||
        lower === 'api_key' ||
        lower === 'x-goog-api-key' ||
        lower === 'authorization'
      ) {
        continue;
      }
      out[k] = sanitizeDebugPayload(v);
    }
    return out;
  }
  return value;
}

export function ThinkingBlock({
  run,
  isActive,
  fallbackDebugInfo,
  fallbackAssumptions,
  fallbackElapsedMs,
}: ThinkingBlockProps) {
  const reducedMotion = useReducedMotion();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [liveNow, setLiveNow] = useState<number>(() => Date.now());
  const [copiedDebug, setCopiedDebug] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLiveNow(Date.now());
      }
    });
    const id = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isActive]);

  const elapsedMs = run
    ? computeRunElapsedMs(run, isActive ? liveNow : run.finishedAt ?? liveNow)
    : fallbackElapsedMs ?? 0;

  const totalSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const liveSecondsText =
    elapsedMs < 1000
      ? `${(elapsedMs / 1000).toFixed(1)} s`
      : `${Math.round(elapsedMs / 1000)} s`;

  const visibleSteps = (run?.steps ?? []).filter((s) => s.status !== 'skipped');
  const activeStep =
    visibleSteps.find((s) => s.status === 'running') ??
    visibleSteps.find((s) => s.status === 'paused' || s.status === 'failed') ??
    null;

  const activeLabel = activeStep?.label ?? 'Reading your request';
  const activeBusyLabel = !isActive
    ? activeLabel
    : elapsedMs >= 60_000
      ? "Google's model is slow right now. Consider switching to a faster model in Settings."
      : elapsedMs >= 40_000
        ? 'This is taking longer than usual. You can Stop and retry.'
        : elapsedMs >= 20_000
          ? "Still waiting for Google's model..."
          : activeLabel;

  const usageRequests =
    run?.usage.requests ??
    (fallbackDebugInfo && 'requests' in fallbackDebugInfo
      ? fallbackDebugInfo.requests
      : fallbackDebugInfo
        ? 1
        : 0);

  const totalTokens = run
    ? run.usage.promptTokens + run.usage.outputTokens + run.usage.thoughtTokens
    : fallbackDebugInfo && 'tokens' in fallbackDebugInfo
      ? fallbackDebugInfo.tokens.prompt +
        fallbackDebugInfo.tokens.output +
        fallbackDebugInfo.tokens.thinking
      : fallbackDebugInfo &&
          'usageMetadata' in fallbackDebugInfo &&
          fallbackDebugInfo.usageMetadata
        ? fallbackDebugInfo.usageMetadata.totalTokenCount
        : 0;

  const modelNameRaw =
    run?.modelName ??
    (fallbackDebugInfo ? fallbackDebugInfo.modelName : undefined);
  const shortModelName = modelNameRaw
    ? modelNameRaw.replace(/^models\//i, '')
    : null;

  const brief = run?.artifacts.brief;
  const assumptions =
    (run?.artifacts.assumptions && run.artifacts.assumptions.length > 0
      ? run.artifacts.assumptions
      : fallbackAssumptions) ?? [];

  const hasDesignNotes = Boolean(brief) || assumptions.length > 0;
  const runNotes = run?.subNotes ?? [];
  const skippedNotes = run?.skippedAttachments ?? [];

  if (!run && !fallbackDebugInfo && !hasDesignNotes) {
    return null;
  }

  const summaryLine = (() => {
    const parts: string[] = [];
    if (elapsedMs > 0 || run) {
      parts.push(`Thought for ${totalSeconds} s`);
    } else {
      parts.push('Thought details');
    }
    if (usageRequests > 0) {
      parts.push(
        `${usageRequests} ${usageRequests === 1 ? 'request' : 'requests'}`
      );
    }
    if (totalTokens > 0) {
      parts.push(`${formatTokenShort(totalTokens)} tokens`);
    }
    return parts.join(' - ');
  })();

  const handleCopyDebugInfo = async () => {
    const rawPayload = run
      ? {
          runId: run.id,
          status: run.status,
          action: run.action,
          model: shortModelName,
          usedBackupModel: run.usedBackupModel,
          elapsedMs,
          usage: run.usage,
          steps: run.steps.map((s) => ({
            id: s.id,
            label: s.label,
            status: s.status,
            durationMs:
              s.startedAt && s.finishedAt ? s.finishedAt - s.startedAt : undefined,
            detail: s.detail,
            subNotes: s.subNotes,
          })),
          subNotes: run.subNotes,
          skippedAttachments: run.skippedAttachments,
          brief: run.artifacts.brief,
          assumptions: run.artifacts.assumptions,
          rawRouterOutput: run.artifacts.rawRouterOutput,
        }
      : fallbackDebugInfo;

    const clean = sanitizeDebugPayload(rawPayload);
    try {
      await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
      setCopiedDebug(true);
      showToast('Debug info copied', 'success');
      window.setTimeout(() => setCopiedDebug(false), 1800);
    } catch {
      showToast('Could not copy debug info', 'danger');
    }
  };

  return (
    <div className="mb-2 w-full">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="group inline-flex min-h-[28px] max-w-full items-center gap-1.5 rounded-[8px] px-1 py-0.5 text-left text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {isActive ? (
          <motion.span
            animate={
              reducedMotion
                ? undefined
                : { opacity: [0.55, 1, 0.55], scale: [0.92, 1.06, 0.92] }
            }
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex shrink-0 text-accent"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </motion.span>
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-text-muted/80" />
        )}

        <span
          className={cn(
            'font-medium',
            isActive && elapsedMs >= 20_000
              ? elapsedMs >= 40_000
                ? 'leading-snug text-warning'
                : 'leading-snug text-text-secondary'
              : 'truncate'
          )}
        >
          {isActive ? activeBusyLabel : summaryLine}
        </span>

        {isActive && (
          <span className="shrink-0 font-mono text-[11px] text-text-muted tabular-nums">
            · {liveSecondsText}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
      </button>

      {isActive && !expanded && (runNotes.length > 0 || skippedNotes.length > 0) && (
        <div className="mt-1 space-y-0.5 pl-5 text-[11px] text-text-muted">
          {(runNotes.length > 0 ? runNotes : skippedNotes)
            .slice(-2)
            .map((note, idx) => (
              <p key={idx} className="truncate">
                {note}
              </p>
            ))}
        </div>
      )}

      {expanded && (
        <div className="mt-1.5 ml-1.5 border-l border-border/80 pl-3.5 py-1 space-y-2.5 text-xs">
          {visibleSteps.length > 0 && (
            <ul className="space-y-1.5">
              {visibleSteps.map((step) => {
                const StepIcon = STEP_ICONS[step.id] ?? Sparkles;
                const dur = formatStepDuration(step.startedAt, step.finishedAt);
                const stepNotes = step.subNotes ?? [];

                return (
                  <li key={step.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          'flex min-w-0 items-center gap-2',
                          step.status === 'pending'
                            ? 'text-text-muted/70'
                            : step.status === 'failed'
                              ? 'text-danger'
                              : 'text-text-secondary'
                        )}
                      >
                        <StepIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{step.label}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {dur && step.status === 'done' && (
                          <span className="font-mono text-[11px] text-text-muted tabular-nums">
                            {dur}
                          </span>
                        )}
                        {step.status === 'done' && (
                          <Check className="h-3.5 w-3.5 text-success" />
                        )}
                        {step.status === 'running' && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        )}
                        {step.status === 'paused' && (
                          <Pause className="h-3.5 w-3.5 text-warning" />
                        )}
                        {step.status === 'failed' && (
                          <XCircle className="h-3.5 w-3.5 text-danger" />
                        )}
                      </div>
                    </div>

                    {stepNotes.length > 0 && (
                      <div className="space-y-0.5 pl-5.5 text-[11px] text-text-muted">
                        {stepNotes.map((sub, sIdx) => (
                          <p key={sIdx} className="break-words">
                            {sub}
                          </p>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {visibleSteps.length === 0 && runNotes.length > 0 && (
            <div className="space-y-0.5 text-[11px] text-text-muted">
              {runNotes.map((note, idx) => (
                <p key={idx}>{note}</p>
              ))}
            </div>
          )}

          {skippedNotes.length > 0 && (
            <div className="space-y-0.5 text-[11px] text-warning">
              {skippedNotes.map((note, idx) => (
                <p key={idx}>{note}</p>
              ))}
            </div>
          )}

          {hasDesignNotes && (
            <div className="space-y-1 border-t border-border/60 pt-2">
              <p className="text-[11px] font-medium text-text-secondary">
                Design notes
              </p>
              {brief && (
                <p dir="auto" className="text-xs leading-relaxed text-text-muted">
                  {brief}
                </p>
              )}
              {assumptions.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-text-muted">
                  {assumptions.map((item, idx) => (
                    <li key={idx} dir="auto">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-text-muted">
            <div className="flex flex-wrap items-center gap-2 font-mono">
              {shortModelName && <span>Model: {shortModelName}</span>}
              {run?.usedBackupModel && (
                <span className="text-warning">(backup)</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleCopyDebugInfo()}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {copiedDebug ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedDebug ? 'Copied' : 'Copy debug info'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
