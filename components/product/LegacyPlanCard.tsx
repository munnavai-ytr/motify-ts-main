'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { Plan, PlanMessage, PlanPalette } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface LegacyPlanCardProps {
  message: PlanMessage;
  hideMessage?: boolean;
}

const PALETTE_KEYS: ReadonlyArray<{
  key: keyof PlanPalette;
  label: string;
}> = [
  { key: 'background', label: 'BG' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentAlt', label: 'Alt' },
];

const FONT_LABELS: Record<Plan['style']['font'], string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
};

function formatDur(sec: number): string {
  const rounded = Math.round(sec * 10) / 10;
  return `${rounded}s`;
}

export function LegacyPlanCard({
  message,
  hideMessage = false,
}: LegacyPlanCardProps) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const { plan } = message;
  const totalSeconds = plan.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

  const handleCopyDebugInfo = async () => {
    if (!message.debugInfo) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(message.debugInfo, null, 2)
      );
      showToast('Debug info copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'danger');
    }
  };

  return (
    <div className="space-y-2.5">
      {!hideMessage && message.message && (
        <div className="flex justify-start">
          <div
            dir="auto"
            className="max-w-[92%] rounded-[16px] rounded-bl-[4px] border border-border/70 bg-surface-2/80 px-4 py-2.5 text-sm leading-relaxed text-text whitespace-pre-wrap break-words"
          >
            {message.message}
          </div>
        </div>
      )}

      <article
        aria-label={`Legacy plan version ${message.version}`}
        className="rounded-[16px] border border-border/70 bg-surface-1/80 p-4 space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
                v{message.version}
              </span>
              <Badge variant="default">Legacy plan</Badge>
            </div>
            <h3
              dir="auto"
              className="text-sm font-semibold tracking-tight text-text break-words"
            >
              {plan.title}
            </h3>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="default">{message.format}</Badge>
            <Badge variant="default">{formatDur(totalSeconds)}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" aria-label="Color palette">
              {PALETTE_KEYS.map(({ key, label }) => {
                const hex = plan.style.palette[key];
                return (
                  <span
                    key={key}
                    title={`${label}: ${hex}`}
                    className="h-4 w-4 rounded-[5px] border border-black/20 dark:border-white/20"
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
            <span className="text-xs text-text-muted tabular-nums">
              · {plan.scenes.length}{' '}
              {plan.scenes.length === 1 ? 'scene' : 'scenes'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
          >
            <span>{expanded ? 'Hide scenes' : 'Show scenes'}</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span dir="auto" className="font-medium text-text-secondary">
                {plan.style.mood}
              </span>
              <span className="font-mono text-[11px] text-text-muted">
                {FONT_LABELS[plan.style.font]} font
              </span>
            </div>

            <ol className="space-y-2">
              {plan.scenes.map((scene, idx) => (
                <li
                  key={scene.id}
                  className="rounded-[12px] border border-border/60 bg-surface-2/45 p-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="font-mono text-[11px] font-semibold text-text-muted tabular-nums">
                        {idx + 1}.
                      </span>
                      <span
                        dir="auto"
                        className="text-xs font-semibold text-text truncate"
                      >
                        {scene.name}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-text-muted tabular-nums">
                      {formatDur(scene.durationSeconds)}
                    </span>
                  </div>
                  <p
                    dir="auto"
                    className="text-xs leading-relaxed text-text-secondary line-clamp-2"
                  >
                    {scene.visualIdea}
                  </p>
                </li>
              ))}
            </ol>

            {message.debugInfo && (
              <div className="flex justify-end border-t border-border/60 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopyDebugInfo()}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy debug info</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
