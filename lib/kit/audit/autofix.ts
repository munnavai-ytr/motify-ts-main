'use client';

import { splitGraphemes } from '../anim';
import { getLayoutDefinition } from '../layouts/registry';
import type { LayoutName } from '../layouts/types';
import { applyOps, getDefaultSlotsForLayout, type Op } from '../ops';
import {
  MAX_SCENE_DUR_SEC,
  MIN_SCENE_DUR_SEC,
  TRANSITION_VALUES,
  computeSceneTimings,
  totalFrames,
  type NormalizedSceneSpec,
  type VideoSpec,
} from '../spec';
import { STYLE_DEFS } from '../styles';
import {
  getContrastRatio,
  isLightColor,
  mixHex,
  pickBestOnColor,
  type LayoutVariant,
  type TransitionKind,
} from '../tokens';
import { runAudit, type AuditIssue, type AuditReport } from './audit';

export interface AutoFixOptions {
  targetSeconds?: number;
  maxPasses?: number;
}

export interface AutoFixResult {
  spec: VideoSpec;
  ops: Op[];
  applied: string[];
  remaining: AuditIssue[];
  scoreBefore: number;
  scoreAfter: number;
  finalReport: AuditReport;
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  const clean = text.trim();
  const graphemes = splitGraphemes(clean);
  if (graphemes.length <= maxChars) {
    return clean;
  }
  const targetLen = Math.max(1, maxChars - 1);
  const sliced = graphemes.slice(0, targetLen).join('');
  const lastSpace = sliced.lastIndexOf(' ');
  const cut =
    lastSpace >= Math.floor(targetLen * 0.55)
      ? sliced.slice(0, lastSpace).trimEnd()
      : sliced.trimEnd();
  return `${cut || sliced}…`;
}

function liftContrastColor(
  fgHex: string,
  bgHex: string,
  surfaceHex: string,
  minRatio: number = 4.5
): string {
  const check = (hex: string) =>
    Math.min(getContrastRatio(hex, bgHex), getContrastRatio(hex, surfaceHex));

  if (check(fgHex) >= minRatio) {
    return fgHex;
  }

  const target = isLightColor(bgHex) ? '#0D0E12' : '#FFFFFF';
  for (let step = 1; step <= 20; step++) {
    const cand = mixHex(fgHex, target, step / 20);
    if (check(cand) >= minRatio) {
      return cand;
    }
  }
  return target;
}

function isCustomBlockLayoutDirty(scene: NormalizedSceneSpec): boolean {
  if (scene.layout !== 'custom' || !Array.isArray(scene.slots.blocks)) {
    return false;
  }
  for (const item of scene.slots.blocks) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      if (rec.fontSize !== undefined || rec.offsetY !== undefined) {
        return true;
      }
    }
  }
  return false;
}

function cleanCustomBlocksForScene(
  scene: NormalizedSceneSpec,
  fallbackTitle: string
): Array<Record<string, unknown>> {
  const raw = Array.isArray(scene.slots.blocks) ? scene.slots.blocks : [];
  const cleaned: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = { ...(item as Record<string, unknown>) };
      delete rec.fontSize;
      delete rec.offsetY;
      if (typeof rec.text === 'string') {
        const trimmed = rec.text.trim();
        if (!trimmed && rec.kind !== 'divider') {
          continue;
        }
        const cap = rec.kind === 'heading' ? 56 : 80;
        rec.text = truncateAtWordBoundary(trimmed, cap);
      }
      cleaned.push(rec);
    }
    if (cleaned.length >= 5) {
      break;
    }
  }
  if (cleaned.length === 0) {
    return [
      { kind: 'kicker', text: 'Overview' },
      { kind: 'heading', text: truncateAtWordBoundary(fallbackTitle, 56) },
      { kind: 'body', text: 'Structured scene content.' },
    ];
  }
  return cleaned;
}

function trimOverlongSceneSlots(
  scene: NormalizedSceneSpec
): Array<{ op: Op; label: string }> {
  const out: Array<{ op: Op; label: string }> = [];
  const def = getLayoutDefinition(scene.layout);
  if (!def) {
    return out;
  }

  for (const slotDef of def.slots) {
    const val = scene.slots[slotDef.name];
    if (slotDef.type === 'string' && slotDef.maxChars && typeof val === 'string') {
      const len = splitGraphemes(val.trim()).length;
      if (len > slotDef.maxChars) {
        const trimmed = truncateAtWordBoundary(val, slotDef.maxChars);
        out.push({
          op: {
            type: 'setSlot',
            scene: scene.id,
            slot: slotDef.name,
            value: trimmed,
          },
          label: `Trimmed "${slotDef.name}" at word boundary (${len} → ${splitGraphemes(trimmed).length} chars)`,
        });
      }
    }

    if (
      slotDef.type === 'string[]' &&
      slotDef.maxChars &&
      Array.isArray(val)
    ) {
      let changed = false;
      const maxItems = slotDef.maxItems ?? val.length;
      const nextArr = val.slice(0, maxItems).map((entry) => {
        if (typeof entry === 'string') {
          const gLen = splitGraphemes(entry.trim()).length;
          if (gLen > slotDef.maxChars!) {
            changed = true;
            return truncateAtWordBoundary(entry, slotDef.maxChars!);
          }
        }
        return entry;
      });
      if (val.length > maxItems) {
        changed = true;
      }
      if (changed) {
        out.push({
          op: {
            type: 'setItems',
            scene: scene.id,
            slot: slotDef.name,
            items: nextArr,
          },
          label: `Trimmed "${slotDef.name}" items to slot limits`,
        });
      }
    }

    if (slotDef.type === 'items[]' && Array.isArray(val)) {
      let changed = false;
      const maxItems = slotDef.maxItems ?? val.length;
      const maxChars = slotDef.maxChars ?? 55;
      const nextItems = val.slice(0, maxItems).map((entry) => {
        if (typeof entry === 'string') {
          if (splitGraphemes(entry.trim()).length > maxChars) {
            changed = true;
            return truncateAtWordBoundary(entry, maxChars);
          }
          return entry;
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const copy = { ...(entry as Record<string, unknown>) };
          if (
            typeof copy.title === 'string' &&
            splitGraphemes(copy.title.trim()).length > maxChars
          ) {
            changed = true;
            copy.title = truncateAtWordBoundary(copy.title, maxChars);
          }
          if (
            typeof copy.detail === 'string' &&
            splitGraphemes(copy.detail.trim()).length > maxChars
          ) {
            changed = true;
            copy.detail = truncateAtWordBoundary(copy.detail, maxChars);
          }
          return copy;
        }
        return entry;
      });
      if (val.length > maxItems) {
        changed = true;
      }
      if (changed) {
        out.push({
          op: {
            type: 'setItems',
            scene: scene.id,
            slot: slotDef.name,
            items: nextItems,
          },
          label: `Shortened "${slotDef.name}" items cleanly`,
        });
      }
    }
  }

  return out;
}

const OPTIONAL_DROP_ORDER = [
  'body',
  'sub',
  'subtitle',
  'details',
  'kicker',
] as const;

export async function autoFix(
  spec: VideoSpec,
  initialReport: AuditReport,
  opts: AutoFixOptions = {}
): Promise<AutoFixResult> {
  const maxPasses = Math.max(1, Math.min(3, opts.maxPasses ?? 3));
  const targetSeconds = opts.targetSeconds ?? initialReport.targetSeconds;
  const scoreBefore = initialReport.score;

  let currentSpec = spec;
  let currentReport = initialReport;
  const allOps: Op[] = [];
  const allApplied: string[] = [];
  const triedVariants = new Map<string, Set<LayoutVariant>>();

  for (let pass = 0; pass < maxPasses; pass++) {
    if (currentReport.issues.length === 0) {
      break;
    }

    const passOps: Op[] = [];
    const passApplied: string[] = [];
    const touchedSceneIds = new Set<string>();
    let globalPaletteChanged = false;

    const issuesByScene = new Map<number, AuditIssue[]>();
    const globalIssues: AuditIssue[] = [];
    for (const issue of currentReport.issues) {
      if (issue.sceneIndex === null) {
        globalIssues.push(issue);
      } else {
        const list = issuesByScene.get(issue.sceneIndex) ?? [];
        list.push(issue);
        issuesByScene.set(issue.sceneIndex, list);
      }
    }

    // 1) LOW_CONTRAST across any scene -> lift theme palette colors to >= 4.5:1
    const hasContrastIssue = currentReport.issues.some(
      (iss) => iss.code === 'LOW_CONTRAST'
    );
    if (hasContrastIssue) {
      const p = currentSpec.theme.palette;
      const nextText = liftContrastColor(p.text, p.bg, p.surface, 4.5);
      const nextMuted = liftContrastColor(p.muted, p.bg, p.surface, 4.5);
      const nextAccent = liftContrastColor(p.accent, p.bg, p.surface, 4.5);
      const nextAccent2 = liftContrastColor(p.accent2, p.bg, p.surface, 4.5);
      const nextOnAccent = pickBestOnColor(nextAccent);
      const nextOnAccent2 = pickBestOnColor(nextAccent2);

      if (
        nextText !== p.text ||
        nextMuted !== p.muted ||
        nextAccent !== p.accent ||
        nextAccent2 !== p.accent2 ||
        nextOnAccent !== p.onAccent ||
        nextOnAccent2 !== p.onAccent2
      ) {
        passOps.push({
          type: 'setCustomColors',
          colors: {
            bg: p.bg,
            surface: p.surface,
            text: nextText,
            muted: nextMuted,
            accent: nextAccent,
            accent2: nextAccent2,
            onAccent: nextOnAccent,
            onAccent2: nextOnAccent2,
          },
        });
        passApplied.push(
          'Adjusted palette contrast (text/muted/accent >= 4.5:1 against bg & surface)'
        );
        globalPaletteChanged = true;
      }
    }

    // 2) Per-scene layout/overflow/overlap/coverage/empty fixes
    for (const [sceneIdx, sIssues] of issuesByScene.entries()) {
      const scene = currentSpec.scenes[sceneIdx];
      if (!scene) continue;
      const codes = new Set(sIssues.map((iss) => iss.code));

      // EMPTY_ENTRY
      if (codes.has('EMPTY_ENTRY')) {
        if (scene.layout === 'custom') {
          passOps.push({
            type: 'setItems',
            scene: scene.id,
            slot: 'blocks',
            items: cleanCustomBlocksForScene(scene, currentSpec.title),
          });
          passApplied.push(
            `Scene ${sceneIdx + 1}: populated empty custom blocks`
          );
          touchedSceneIds.add(scene.id);
        } else {
          const defaults = getDefaultSlotsForLayout(scene.layout);
          const def = getLayoutDefinition(scene.layout);
          for (const slotDef of def?.slots ?? []) {
            if (slotDef.required && defaults[slotDef.name] !== undefined) {
              const curVal = scene.slots[slotDef.name];
              if (
                typeof curVal !== 'string' ||
                curVal.trim().length === 0
              ) {
                passOps.push({
                  type: 'setSlot',
                  scene: scene.id,
                  slot: slotDef.name,
                  value: defaults[slotDef.name],
                });
              }
            }
          }
          passApplied.push(
            `Scene ${sceneIdx + 1}: filled required slots for visible entry`
          );
          touchedSceneIds.add(scene.id);
        }
      }

      // Custom blocks dirty geometry / tiny text / overlap / safe-area / low-coverage
      const hasGeomIssue =
        codes.has('TEXT_OVERFLOW') ||
        codes.has('TEXT_OVERLAP') ||
        codes.has('OUT_OF_SAFE_AREA') ||
        codes.has('TEXT_TOO_SMALL') ||
        codes.has('LOW_COVERAGE');

      if (hasGeomIssue && isCustomBlockLayoutDirty(scene)) {
        passOps.push({
          type: 'setItems',
          scene: scene.id,
          slot: 'blocks',
          items: cleanCustomBlocksForScene(scene, currentSpec.title),
        });
        passApplied.push(
          `Scene ${sceneIdx + 1}: removed manual fontSize/offsetY overrides in custom blocks`
        );
        touchedSceneIds.add(scene.id);
      } else if (hasGeomIssue) {
        // First try word-boundary trims on any overlong strings/items
        const trimActions = trimOverlongSceneSlots(scene);
        if (trimActions.length > 0) {
          for (const act of trimActions) {
            passOps.push(act.op);
            passApplied.push(`Scene ${sceneIdx + 1}: ${act.label}`);
          }
          touchedSceneIds.add(scene.id);
        }

        // Try rotating layout variants first
        const def = getLayoutDefinition(scene.layout);
        const variants = def?.variants ?? ['a'];
        const tried = triedVariants.get(scene.id) ?? new Set([scene.variant]);
        tried.add(scene.variant);
        triedVariants.set(scene.id, tried);

        const nextVariant = variants.find((v) => !tried.has(v));
        if (nextVariant) {
          tried.add(nextVariant);
          passOps.push({
            type: 'setVariant',
            scene: scene.id,
            variant: nextVariant,
          });
          passApplied.push(
            `Scene ${sceneIdx + 1}: switched variant ${scene.variant} → ${nextVariant}`
          );
          touchedSceneIds.add(scene.id);
        } else if (
          trimActions.length === 0 &&
          (codes.has('TEXT_OVERFLOW') ||
            codes.has('TEXT_OVERLAP') ||
            codes.has('OUT_OF_SAFE_AREA'))
        ) {
          // Drop lowest-priority optional slot in order: body, sub, subtitle, details, kicker
          let dropped = false;
          for (const optKey of OPTIONAL_DROP_ORDER) {
            const val = scene.slots[optKey];
            if (typeof val === 'string' && val.trim().length > 0) {
              passOps.push({
                type: 'setSlot',
                scene: scene.id,
                slot: optKey,
                value: null,
              });
              passApplied.push(
                `Scene ${sceneIdx + 1}: dropped optional slot "${optKey}" to relieve overflow`
              );
              touchedSceneIds.add(scene.id);
              dropped = true;
              break;
            }
          }
          if (!dropped && scene.layout === 'custom') {
            passOps.push({
              type: 'setLayout',
              scene: scene.id,
              layout: 'title',
            });
            passApplied.push(
              `Scene ${sceneIdx + 1}: switched custom scene to clean "title" layout`
            );
            touchedSceneIds.add(scene.id);
          }
        }
      }
    }

    // 3) REPEAT issues (adjacent identical layout+variant or 3 transitions in a row)
    const plannedScenes = currentSpec.scenes.map((sc) => {
      let layout = sc.layout;
      let variant = sc.variant;
      for (const op of passOps) {
        if (op.type === 'setLayout' && op.scene === sc.id) {
          layout = op.layout;
          const lDef = getLayoutDefinition(layout);
          variant = lDef?.variants[0] ?? 'a';
        } else if (op.type === 'setVariant' && op.scene === sc.id) {
          variant = op.variant;
        }
      }
      return { id: sc.id, layout, variant };
    });

    const diversePool: readonly LayoutName[] = [
      'feature',
      'hook',
      'stat',
      'quote',
      'cta',
    ];

    for (let i = 1; i < plannedScenes.length; i++) {
      const prev = plannedScenes[i - 1];
      const curr = plannedScenes[i];
      if (prev.layout === curr.layout && prev.variant === curr.variant) {
        const def = getLayoutDefinition(curr.layout);
        const altVariant = def?.variants.find((v) => v !== prev.variant);
        if (altVariant) {
          curr.variant = altVariant;
          passOps.push({
            type: 'setVariant',
            scene: curr.id,
            variant: altVariant,
          });
          passApplied.push(
            `Scene ${i + 1}: varied ${curr.layout} variant (→ ${altVariant})`
          );
          touchedSceneIds.add(curr.id);
        } else {
          const nextLayout =
            diversePool.find((l) => l !== prev.layout) ?? 'feature';
          const nextDef = getLayoutDefinition(nextLayout);
          const nextVar = nextDef?.variants[0] ?? 'a';
          curr.layout = nextLayout;
          curr.variant = nextVar;
          passOps.push({
            type: 'setLayout',
            scene: curr.id,
            layout: nextLayout,
          });
          passApplied.push(
            `Scene ${i + 1}: varied repeated "${prev.layout}" → "${nextLayout}"`
          );
          touchedSceneIds.add(curr.id);
        }
      }
    }

    const styleTransitions = STYLE_DEFS[currentSpec.style].transitions;
    const trPool: readonly TransitionKind[] =
      styleTransitions.length >= 2 ? styleTransitions : TRANSITION_VALUES;

    const plannedTransitions = currentSpec.scenes.map((s) => s.transition);
    for (let i = 2; i < plannedTransitions.length; i++) {
      if (
        plannedTransitions[i - 2] === plannedTransitions[i - 1] &&
        plannedTransitions[i - 1] === plannedTransitions[i]
      ) {
        const sc = currentSpec.scenes[i];
        const nextTr =
          trPool.find(
            (tr) => tr !== plannedTransitions[i] && tr !== plannedTransitions[i + 1]
          ) ??
          TRANSITION_VALUES.find((tr) => tr !== plannedTransitions[i]) ??
          'push-left';
        plannedTransitions[i] = nextTr;
        passOps.push({
          type: 'setTransition',
          scope: 'scene',
          scene: sc.id,
          transition: nextTr,
        });
        passApplied.push(
          `Scene ${i + 1}: broke 3-in-a-row "${sc.transition}" transition → "${nextTr}"`
        );
        touchedSceneIds.add(sc.id);
      }
    }

    // 4) DURATION_MISMATCH
    const hasDurationMismatch = globalIssues.some(
      (iss) => iss.code === 'DURATION_MISMATCH'
    );
    if (
      hasDurationMismatch &&
      targetSeconds !== undefined &&
      Number.isFinite(targetSeconds) &&
      targetSeconds > 0
    ) {
      const timings = computeSceneTimings(currentSpec);
      const fps = currentSpec.fps || 30;
      const overlapSec =
        timings.reduce((sum, t) => sum + t.overlapInFrames, 0) / fps;
      const desiredSceneSum = Math.max(
        MIN_SCENE_DUR_SEC * currentSpec.scenes.length,
        targetSeconds + overlapSec
      );
      const currSceneSum = currentSpec.scenes.reduce((s, sc) => s + sc.dur, 0);
      const ratio = currSceneSum > 0 ? desiredSceneSum / currSceneSum : 1;

      const scaled = currentSpec.scenes.map((sc) =>
        Math.max(
          MIN_SCENE_DUR_SEC,
          Math.min(MAX_SCENE_DUR_SEC, Math.round(sc.dur * ratio * 10) / 10)
        )
      );

      // Adjust remainder across scenes cleanly in 0.1s steps
      let residual =
        Math.round((desiredSceneSum - scaled.reduce((a, b) => a + b, 0)) * 10) /
        10;
      for (
        let guard = 0;
        Math.abs(residual) >= 0.09 && guard < 40;
        guard++
      ) {
        const step = residual > 0 ? 0.1 : -0.1;
        let moved = false;
        for (let idx = 0; idx < scaled.length; idx++) {
          const candidate = Math.round((scaled[idx] + step) * 10) / 10;
          if (
            candidate >= MIN_SCENE_DUR_SEC &&
            candidate <= MAX_SCENE_DUR_SEC
          ) {
            scaled[idx] = candidate;
            residual = Math.round((residual - step) * 10) / 10;
            moved = true;
            if (Math.abs(residual) < 0.09) break;
          }
        }
        if (!moved) break;
      }

      for (let idx = 0; idx < currentSpec.scenes.length; idx++) {
        const sc = currentSpec.scenes[idx];
        if (Math.abs(scaled[idx] - sc.dur) >= 0.05) {
          passOps.push({
            type: 'setDuration',
            scene: sc.id,
            dur: scaled[idx],
          });
          touchedSceneIds.add(sc.id);
        }
      }
      passApplied.push(
        `Scaled scene durations toward ${targetSeconds.toFixed(1)}s target`
      );
    }

    // 5) RHYTHM (> 5 scenes all within 0.3s -> apply +/-0.4s wave preserving total sum)
    const hasRhythmIssue = globalIssues.some((iss) => iss.code === 'RHYTHM');
    if (hasRhythmIssue && currentSpec.scenes.length > 5) {
      // Base on current/planned durations after any scaling above
      const baseDurs = currentSpec.scenes.map((sc) => {
        const durOp = [...passOps]
          .reverse()
          .find(
            (op) => op.type === 'setDuration' && op.scene === sc.id
          ) as Extract<Op, { type: 'setDuration' }> | undefined;
        return durOp ? durOp.dur : sc.dur;
      });

      const nextDurs = [...baseDurs];
      for (let i = 0; i + 1 < nextDurs.length; i += 2) {
        const a = nextDurs[i];
        const b = nextDurs[i + 1];
        const canShiftDown = Math.max(0, a - MIN_SCENE_DUR_SEC);
        const canShiftUp = Math.max(0, MAX_SCENE_DUR_SEC - b);
        const shift = Math.min(0.4, canShiftDown, canShiftUp);
        if (shift >= 0.2) {
          nextDurs[i] = Math.round((a - shift) * 10) / 10;
          nextDurs[i + 1] = Math.round((b + shift) * 10) / 10;
        }
      }

      for (let idx = 0; idx < currentSpec.scenes.length; idx++) {
        const sc = currentSpec.scenes[idx];
        if (Math.abs(nextDurs[idx] - sc.dur) >= 0.05) {
          passOps.push({
            type: 'setDuration',
            scene: sc.id,
            dur: nextDurs[idx],
          });
          touchedSceneIds.add(sc.id);
        }
      }
      passApplied.push(
        `Varied scene pacing (±0.4s wave preserving total length)`
      );
    }

    if (passOps.length === 0) {
      break;
    }

    const appliedRes = applyOps(currentSpec, passOps);
    if (appliedRes.errors.length > 0) {
      break;
    }

    const specChanged =
      JSON.stringify(appliedRes.spec) !== JSON.stringify(currentSpec);
    if (!specChanged) {
      break;
    }

    currentSpec = appliedRes.spec;
    allOps.push(...passOps);
    allApplied.push(...passApplied);

    const changedIndices = globalPaletteChanged
      ? currentSpec.scenes.map((_, idx) => idx)
      : currentSpec.scenes
          .map((sc, idx) => (touchedSceneIds.has(sc.id) ? idx : -1))
          .filter((idx) => idx >= 0);

    currentReport = await runAudit(currentSpec, {
      targetSeconds,
      changedSceneIndices: changedIndices,
      previousReport: currentReport,
    });
  }

  // Keep totalFrames referenced for consumers inspecting duration
  void totalFrames;

  return {
    spec: currentSpec,
    ops: allOps,
    applied: allApplied,
    remaining: currentReport.issues,
    scoreBefore,
    scoreAfter: currentReport.score,
    finalReport: currentReport,
  };
}
