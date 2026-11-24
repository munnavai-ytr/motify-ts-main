'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Film,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  formatSeconds,
  getTotalDuration,
  HEX_COLOR_REGEX,
  validatePlanTotalDuration,
} from '@/lib/ai/plan-schema';
import type {
  Plan,
  PlanMessage,
  PlanPalette,
  PlanScene,
  VideoMessage,
  VideoType,
} from '@/lib/types';
import { computeSceneSpecHash } from '@/lib/video/dimensions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface PlanCardProps {
  message: PlanMessage;
  projectType: VideoType;
  linkedVideo?: VideoMessage | null;
  isBuildingVideo?: boolean;
  onUpdatePlan: (messageId: string, updatedPlan: Plan) => Promise<void>;
  onBuildVideo: (messageId: string) => Promise<void>;
  onReopenPlan: (messageId: string) => Promise<void>;
  onOpenSceneEditor: (messageId: string, scene: PlanScene) => void;
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

function createNewScene(index: number): PlanScene {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `scene_${crypto.randomUUID().slice(0, 8)}`
      : `scene_${Date.now().toString(36)}`;
  return {
    id,
    name: `Scene ${index + 1}`,
    durationSeconds: 3,
    purpose: 'Supporting beat',
    onScreenText: ['New scene headline'],
    visualIdea: 'Clean geometric frame with focal typography',
    motion: 'Crisp slide-in with eased opacity fade',
  };
}

export function PlanCard({
  message,
  projectType,
  linkedVideo = null,
  isBuildingVideo = false,
  onUpdatePlan,
  onBuildVideo,
  onReopenPlan,
  onOpenSceneEditor,
}: PlanCardProps) {
  const { showToast } = useToast();
  const [editingColorKey, setEditingColorKey] = useState<keyof PlanPalette | null>(
    null
  );
  const [hexDraft, setHexDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [supersededExpanded, setSupersededExpanded] = useState(false);

  const isSuperseded = message.status === 'superseded';

  const { plan } = message;
  const isDraft = message.status === 'draft';
  const isApproved = message.status === 'approved';
  const totalDuration = getTotalDuration(plan.scenes);
  const durationValidation = validatePlanTotalDuration(plan, projectType);

  const scenesWithRanges = plan.scenes.reduce<
    Array<{ scene: PlanScene; start: number; end: number; rangeLabel: string }>
  >((acc, scene) => {
    const start = acc.length === 0 ? 0 : acc[acc.length - 1].end;
    const end = Math.round((start + scene.durationSeconds) * 10) / 10;
    acc.push({
      scene,
      start,
      end,
      rangeLabel: `${formatSeconds(start).replace(/s$/, '')}–${formatSeconds(end)}`,
    });
    return acc;
  }, []);

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

  if (isSuperseded) {
    return (
      <div className="space-y-2.5">
        {message.message && (
          <div className="flex justify-start">
            <div
              dir="auto"
              className="max-w-[92%] rounded-[16px] rounded-bl-[4px] border border-border/60 bg-surface-2/75 px-4 py-2.5 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap break-words"
            >
              {message.message}
            </div>
          </div>
        )}

        <article
          aria-label={`Plan version ${message.version} (earlier version)`}
          className="rounded-[16px] border border-border/60 bg-surface-1/70 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
                  v{message.version}
                </span>
                <Badge variant="default">Earlier version</Badge>
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
              <Badge variant={durationValidation.valid ? 'default' : 'danger'}>
                {formatSeconds(totalDuration)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div
                className="flex items-center gap-1"
                aria-label="Color palette"
              >
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
              aria-expanded={supersededExpanded}
              onClick={() => setSupersededExpanded((prev) => !prev)}
            >
              <span>{supersededExpanded ? 'Hide plan' : 'Show plan'}</span>
              {supersededExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {supersededExpanded && (
            <div className="space-y-3 border-t border-border/60 pt-3">
              {message.assumptions.length > 0 && (
                <div className="rounded-[12px] border border-border/60 bg-surface-2/40 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] font-medium text-text-muted">
                    Assumptions
                  </p>
                  <ul className="space-y-0.5 text-xs text-text-secondary">
                    {message.assumptions.map((item, idx) => (
                      <li key={idx} dir="auto" className="leading-snug">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span dir="auto" className="font-medium text-text-secondary">
                    {plan.style.mood}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted">
                    {FONT_LABELS[plan.style.font]} font
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {PALETTE_KEYS.map(({ key, label }) => {
                    const hex = plan.style.palette[key];
                    return (
                      <div
                        key={key}
                        title={`${label}: ${hex}`}
                        className="flex min-h-[32px] items-center gap-1.5 rounded-[10px] border border-border/70 bg-surface-1/80 px-2 py-1 text-[11px]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-black/20 dark:border-white/20"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="text-text-secondary">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-text-secondary">
                  Scenes ({plan.scenes.length})
                </h4>
                <ol className="space-y-2">
                  {scenesWithRanges.map(({ scene, rangeLabel }, idx) => (
                    <li
                      key={scene.id}
                      className="rounded-[12px] border border-border/60 bg-surface-2/45 p-3 space-y-1.5"
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
                          {rangeLabel}
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
              </div>

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

  const hasLinkedBuild =
    linkedVideo !== null &&
    linkedVideo.planMessageId === message.id &&
    linkedVideo.status !== 'superseded';

  const needsVideoUpdate = hasLinkedBuild
    ? plan.scenes.some((scene) => {
        const built = linkedVideo.scenes.find((s) => s.sceneId === scene.id);
        if (!built) return true;
        if (built.status !== 'ok') return true;
        return computeSceneSpecHash(scene) !== built.specHash;
      })
    : false;

  const handleOpenColorPicker = (key: keyof PlanPalette) => {
    if (!isDraft) return;
    if (editingColorKey === key) {
      setEditingColorKey(null);
      return;
    }
    setEditingColorKey(key);
    setHexDraft(plan.style.palette[key].toUpperCase());
  };

  const handleSaveColor = async () => {
    if (!editingColorKey) return;
    const trimmed = hexDraft.trim();
    if (!HEX_COLOR_REGEX.test(trimmed)) return;
    const updated: Plan = {
      ...plan,
      style: {
        ...plan.style,
        palette: {
          ...plan.style.palette,
          [editingColorKey]: trimmed.toUpperCase(),
        },
      },
    };
    setSavingStatus(true);
    try {
      await onUpdatePlan(message.id, updated);
      setEditingColorKey(null);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleMoveScene = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= plan.scenes.length) return;
    const nextScenes = [...plan.scenes];
    const [moved] = nextScenes.splice(index, 1);
    nextScenes.splice(targetIndex, 0, moved);
    await onUpdatePlan(message.id, { ...plan, scenes: nextScenes });
  };

  const handleDeleteScene = async (index: number) => {
    if (plan.scenes.length <= 1) return;
    const nextScenes = plan.scenes.filter((_, idx) => idx !== index);
    await onUpdatePlan(message.id, { ...plan, scenes: nextScenes });
  };

  const handleAddScene = async () => {
    if (plan.scenes.length >= 8) return;
    const newScene = createNewScene(plan.scenes.length);
    const updatedPlan: Plan = {
      ...plan,
      scenes: [...plan.scenes, newScene],
    };
    await onUpdatePlan(message.id, updatedPlan);
    onOpenSceneEditor(message.id, newScene);
  };

  const hexDraftValid = HEX_COLOR_REGEX.test(hexDraft.trim());

  return (
    <div className="space-y-2.5">
      {message.message && (
        <div className="flex justify-start">
          <div
            dir="auto"
            className="max-w-[92%] rounded-[16px] rounded-bl-[4px] border border-border bg-surface-2 px-4 py-2.5 text-sm leading-relaxed text-text whitespace-pre-wrap break-words"
          >
            {message.message}
          </div>
        </div>
      )}

      <article
        aria-label={`Plan version ${message.version}`}
        className="rounded-[16px] border border-border bg-surface-1 p-4 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-medium text-text-muted tabular-nums">
                v{message.version}
              </span>
              {isApproved && (
                <Badge variant="success">
                  <Check className="h-3 w-3" />
                  <span>Approved</span>
                </Badge>
              )}
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
            <Badge variant={durationValidation.valid ? 'accent' : 'danger'}>
              {formatSeconds(totalDuration)}
            </Badge>
          </div>
        </div>

        {message.assumptions.length > 0 && (
          <div className="rounded-[12px] border border-border bg-surface-2/50 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-medium text-text-muted">
              Assumptions
            </p>
            <ul className="space-y-0.5 text-xs text-text-secondary">
              {message.assumptions.map((item, idx) => (
                <li key={idx} dir="auto" className="leading-snug">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span dir="auto" className="font-medium text-text-secondary">
              {plan.style.mood}
            </span>
            <span className="font-mono text-[11px] text-text-muted">
              {FONT_LABELS[plan.style.font]} font
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PALETTE_KEYS.map(({ key, label }) => {
              const hex = plan.style.palette[key];
              const isSelected = editingColorKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!isDraft}
                  onClick={() => handleOpenColorPicker(key)}
                  title={isDraft ? `Edit ${label} (${hex})` : `${label}: ${hex}`}
                  className={cn(
                    'flex min-h-[36px] items-center gap-1.5 rounded-[10px] border px-2 py-1 text-[11px] transition-colors',
                    isDraft
                      ? 'cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      : 'cursor-default opacity-90',
                    isSelected
                      ? 'border-accent bg-surface-2'
                      : 'border-border bg-surface-1'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-[5px] border border-black/20 dark:border-white/20"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-text-secondary">{label}</span>
                </button>
              );
            })}
          </div>

          {isDraft && editingColorKey && (
            <div className="rounded-[12px] border border-border bg-surface-2 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label={`Pick color for ${editingColorKey}`}
                  value={hexDraftValid ? hexDraft.trim() : '#000000'}
                  onChange={(e) => setHexDraft(e.target.value.toUpperCase())}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-[8px] border border-border bg-surface-1 p-0.5"
                />
                <input
                  type="text"
                  aria-label={`Hex code for ${editingColorKey}`}
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  maxLength={7}
                  placeholder="#6D5EF8"
                  className="min-h-[36px] w-28 rounded-[10px] border border-border bg-surface-1 px-2.5 font-mono text-xs uppercase text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingColorKey(null)}
                    disabled={savingStatus}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!hexDraftValid || savingStatus}
                    loading={savingStatus}
                    onClick={() => void handleSaveColor()}
                  >
                    Apply
                  </Button>
                </div>
              </div>
              {!hexDraftValid && (
                <p className="text-[11px] text-danger">
                  Enter a valid 6-digit hex color (e.g. #6D5EF8).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-secondary">
              Scenes ({plan.scenes.length})
            </h4>
            {isDraft && (
              <Button
                variant="ghost"
                size="sm"
                disabled={plan.scenes.length >= 8}
                onClick={() => void handleAddScene()}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add scene</span>
              </Button>
            )}
          </div>

          <ol className="space-y-2">
            {scenesWithRanges.map(({ scene, rangeLabel }, idx) => (
              <li
                key={scene.id}
                className="rounded-[12px] border border-border bg-surface-2/60 p-3 space-y-2"
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
                    {rangeLabel}
                  </span>
                </div>

                <p
                  dir="auto"
                  className="text-xs leading-relaxed text-text-secondary line-clamp-2"
                >
                  {scene.visualIdea}
                </p>

                {isDraft && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => onOpenSceneEditor(message.id, scene)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-text-secondary hover:bg-surface-1 hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${scene.name} up`}
                        disabled={idx === 0}
                        onClick={() => void handleMoveScene(idx, -1)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-1 hover:text-text disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${scene.name} down`}
                        disabled={idx === plan.scenes.length - 1}
                        onClick={() => void handleMoveScene(idx, 1)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-1 hover:text-text disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          plan.scenes.length <= 1
                            ? 'Cannot delete the only scene'
                            : `Delete ${scene.name}`
                        }
                        disabled={plan.scenes.length <= 1}
                        onClick={() => void handleDeleteScene(idx)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        {!durationValidation.valid && durationValidation.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[12px] border border-danger/35 bg-danger/10 p-3 text-xs text-text"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>{durationValidation.error}</span>
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(!hasLinkedBuild || needsVideoUpdate) && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    !durationValidation.valid || savingStatus || isBuildingVideo
                  }
                  loading={savingStatus}
                  onClick={async () => {
                    setSavingStatus(true);
                    try {
                      await onBuildVideo(message.id);
                    } finally {
                      setSavingStatus(false);
                    }
                  }}
                >
                  {hasLinkedBuild ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  <span>{hasLinkedBuild ? 'Update video' : 'Build video'}</span>
                </Button>
              )}

              {!isDraft && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={savingStatus || isBuildingVideo}
                  onClick={async () => {
                    setSavingStatus(true);
                    try {
                      await onReopenPlan(message.id);
                    } finally {
                      setSavingStatus(false);
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Button>
              )}
            </div>

            {message.debugInfo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCopyDebugInfo()}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy debug info</span>
              </Button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
