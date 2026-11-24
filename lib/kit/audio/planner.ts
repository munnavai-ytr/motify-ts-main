import { resolveBeatDelay, type AnimInPreset } from '../anim';
import { computeSceneTimings, type NormalizedSceneSpec, type VideoSpec } from '../spec';
import type { TransitionKind } from '../tokens';
import type { PlannedSfxEvent, SfxMode, SfxName } from './types';

interface CandidateSfxEvent extends PlannedSfxEvent {
  priority: number;
}

function pickTransitionSfx(transition: TransitionKind): {
  name: SfxName;
  durationSec?: number;
  direction?: 'up' | 'down';
  intensity?: number;
} | null {
  switch (transition) {
    case 'push-left':
    case 'push-right':
    case 'push-up':
      return { name: 'whoosh', durationSec: 0.34, direction: 'up', intensity: 0.9 };
    case 'zoom-through':
      return { name: 'whoosh', durationSec: 0.42, direction: 'up', intensity: 1.0 };
    case 'wipe-left':
    case 'wipe-up':
      return { name: 'soft-swoosh', durationSec: 0.36, direction: 'up', intensity: 0.88 };
    case 'circle-reveal':
      return { name: 'pop', durationSec: 0.16, intensity: 0.95 };
    case 'color-block':
      return { name: 'impact', durationSec: 0.42, intensity: 0.92 };
    case 'fade':
      return { name: 'soft-swoosh', durationSec: 0.32, direction: 'down', intensity: 0.45 };
    case 'cut':
    default:
      return null;
  }
}

function sceneHasHeadlineText(scene: NormalizedSceneSpec): boolean {
  const s = scene.slots;
  return (
    (typeof s.headline === 'string' && s.headline.trim().length > 0) ||
    (typeof s.title === 'string' && s.title.trim().length > 0) ||
    (typeof s.heading === 'string' && s.heading.trim().length > 0) ||
    (typeof s.quote === 'string' && s.quote.trim().length > 0) ||
    (Array.isArray(s.words) && s.words.length > 0)
  );
}

function sceneHasButtonCta(scene: NormalizedSceneSpec): boolean {
  const s = scene.slots;
  if (scene.layout === 'cta') {
    return typeof s.buttonText === 'string' || typeof s.cta === 'string';
  }
  if (scene.layout === 'offer') {
    return typeof s.cta === 'string' && s.cta.trim().length > 0;
  }
  if (scene.layout === 'custom' && Array.isArray(s.blocks)) {
    return s.blocks.some(
      (blk) =>
        typeof blk === 'object' &&
        blk !== null &&
        (blk as { kind?: unknown }).kind === 'cta'
    );
  }
  return false;
}

function mapAnimInToHeadlineSfx(animIn: AnimInPreset): SfxName | 'ticks' | null {
  switch (animIn) {
    case 'slam':
    case 'drop':
      return 'impact';
    case 'pop':
    case 'zoom':
    case 'rotate-in':
      return 'pop';
    case 'type':
    case 'words':
      return 'ticks';
    case 'slide-left':
    case 'slide-right':
    case 'wipe':
    case 'draw':
      return 'slide';
    default:
      return null;
  }
}

export function isSilentLayoutSpec(spec: Pick<VideoSpec, 'scenes'>): boolean {
  if (spec.scenes.length === 0) return false;
  const allLowerThird = spec.scenes.every((sc) => sc.layout === 'lower-third');
  const hasChroma = spec.scenes.some((sc) => sc.bg === 'chroma');
  return allLowerThird || hasChroma;
}

/**
 * Derives deterministic sound-effect cues from scene timings, transitions,
 * headline entrances, counter beats, CTA buttons, and final climax.
 * Enforces >= 120ms spacing and <= 3 effects in any 1-second window.
 */
export function planSfx(spec: VideoSpec): PlannedSfxEvent[] {
  const audio = spec.audio;
  if (!audio || audio.mute) {
    return [];
  }
  const mode: SfxMode = audio.sfx ?? 'off';
  if (mode === 'off') {
    return [];
  }

  const fps = spec.fps || 30;
  const timings = computeSceneTimings(spec);
  if (timings.length === 0) {
    return [];
  }
  const totalSec = (timings[timings.length - 1]?.endFrame ?? 0) / fps;
  if (totalSec <= 0.3) {
    return [];
  }

  const candidates: CandidateSfxEvent[] = [];

  if (mode === 'minimal') {
    for (let i = 1; i < timings.length; i++) {
      const timing = timings[i];
      if (timing.scene.transition === 'cut') continue;
      const boundarySec = timing.startFrame / fps;
      candidates.push({
        timeSec: Math.max(0.02, boundarySec),
        name: 'whoosh',
        params: { durationSec: 0.34, direction: 'up', intensity: 0.85 },
        reason: `Scene ${i + 1} transition`,
        priority: 90,
      });
    }
    const lastTiming = timings[timings.length - 1];
    if (lastTiming && lastTiming.scene.layout !== 'lower-third') {
      const chimeTime = Math.max(0.08, lastTiming.startFrame / fps + 0.16);
      candidates.push({
        timeSec: chimeTime,
        name: 'chime',
        params: { durationSec: 0.8, intensity: 0.85 },
        reason: 'Final call to action chime',
        priority: 95,
      });
    }
    return enforceSfxRateLimits(candidates, totalSec);
  }

  // mode === 'auto'
  const lastIndex = timings.length - 1;

  for (let i = 0; i < timings.length; i++) {
    const timing = timings[i];
    const scene = timing.scene;
    const sceneStartSec = timing.startFrame / fps;
    const sceneDurSec = timing.durationInFrames / fps;
    const preRollFrames = i === 0 ? 8 : 0;

    if (scene.layout === 'lower-third' || scene.bg === 'chroma') {
      continue;
    }

    // 1. Transition at scene boundary (i > 0)
    if (i > 0) {
      const transSfx = pickTransitionSfx(scene.transition);
      if (transSfx) {
        candidates.push({
          timeSec: Math.max(0.01, sceneStartSec),
          name: transSfx.name,
          params: {
            durationSec: transSfx.durationSec,
            direction: transSfx.direction,
            intensity: transSfx.intensity,
            seed: spec.seed + i * 31,
          },
          reason: `Transition (${scene.transition}) into scene ${i + 1}`,
          priority: 92,
        });
      }
    }

    // 2. Rising riser right before final scene (when multi-scene and enough room)
    if (i === lastIndex && timings.length >= 2 && sceneStartSec >= 1.4) {
      const riserDur = Math.min(1.15, Math.max(0.65, sceneStartSec * 0.45));
      candidates.push({
        timeSec: Math.max(0.05, sceneStartSec - riserDur),
        name: 'riser',
        params: {
          durationSec: riserDur,
          intensity: 0.8,
          seed: spec.seed + 701,
        },
        reason: 'Pre-finale riser',
        priority: 85,
      });
    }

    // 3. First headline entrance matched to animIn
    const headlineBeatFrames = Math.max(
      0,
      resolveBeatDelay(1, fps, spec.intensity, 0) - preRollFrames
    );
    const headlineTime =
      sceneStartSec + headlineBeatFrames / fps + (i > 0 ? 0.08 : 0.04);

    if (sceneHasHeadlineText(scene)) {
      const headlineCue = mapAnimInToHeadlineSfx(scene.animIn);
      if (headlineCue === 'ticks') {
        const tickCount = 3;
        for (let tIdx = 0; tIdx < tickCount; tIdx++) {
          const tickTime = headlineTime + tIdx * 0.14;
          if (tickTime < sceneStartSec + sceneDurSec - 0.35) {
            candidates.push({
              timeSec: tickTime,
              name: 'tick',
              params: {
                pitchScale: 1 + tIdx * 0.06,
                intensity: 0.65,
                seed: spec.seed + i * 19 + tIdx,
              },
              reason: `Headline type/words tick (${scene.id})`,
              priority: 52 - tIdx,
            });
          }
        }
      } else if (headlineCue) {
        candidates.push({
          timeSec: headlineTime,
          name: headlineCue,
          params: {
            intensity: headlineCue === 'impact' ? 0.85 : 0.78,
            seed: spec.seed + i * 23,
          },
          reason: `Headline "${scene.animIn}" entrance (${scene.id})`,
          priority: 78,
        });
      }
    }

    // 4. Stat counter ticks while counter animates
    if (scene.layout === 'stat') {
      const counterStartSec = sceneStartSec + Math.max(0.14, headlineBeatFrames / fps);
      const countWindowSec = Math.min(1.0, Math.max(0.45, sceneDurSec * 0.42));
      const stepSec = 0.16;
      const steps = Math.min(4, Math.max(2, Math.floor(countWindowSec / stepSec)));
      for (let cIdx = 0; cIdx < steps; cIdx++) {
        const tickTime = counterStartSec + cIdx * stepSec;
        if (tickTime < sceneStartSec + sceneDurSec - 0.35) {
          candidates.push({
            timeSec: tickTime,
            name: 'tick',
            params: {
              pitchScale: 0.96 + cIdx * 0.08,
              intensity: 0.62,
              seed: spec.seed + i * 41 + cIdx,
            },
            reason: `Stat counter tick (${scene.id})`,
            priority: 64 - cIdx,
          });
        }
      }
      const dingTime = counterStartSec + steps * stepSec;
      if (dingTime < sceneStartSec + sceneDurSec - 0.3) {
        candidates.push({
          timeSec: dingTime,
          name: 'ding',
          params: { intensity: 0.68, seed: spec.seed + i * 47 },
          reason: `Stat counter settle (${scene.id})`,
          priority: 72,
        });
      }
    }

    // 5. Button entrance click / pop on CTA or Offer
    if (sceneHasButtonCta(scene)) {
      const btnFrames = Math.max(
        6,
        resolveBeatDelay(3, fps, spec.intensity, 0) - preRollFrames
      );
      const btnTime = sceneStartSec + Math.min(sceneDurSec * 0.55, btnFrames / fps);
      candidates.push({
        timeSec: btnTime,
        name: scene.layout === 'cta' ? 'button-press' : 'pop',
        params: { intensity: 0.85, seed: spec.seed + i * 53 },
        reason: `Button entrance (${scene.id})`,
        priority: 82,
      });
    }

    // 6. Final CTA / closing chime
    if (i === lastIndex) {
      const isCtaLike =
        scene.layout === 'cta' ||
        scene.layout === 'brand' ||
        scene.layout === 'offer';
      const chimeTime =
        sceneStartSec + (isCtaLike ? Math.min(0.45, sceneDurSec * 0.25) : 0.22);
      candidates.push({
        timeSec: chimeTime,
        name: 'chime',
        params: {
          durationSec: 0.85,
          intensity: 0.88,
          seed: spec.seed + 997,
        },
        reason: 'Final scene chime',
        priority: 96,
      });
    }
  }

  return enforceSfxRateLimits(candidates, totalSec);
}

/**
 * Sorts candidates chronologically and filters them so:
 * 1) No two sounds occur within < 120ms (keeping higher priority event on collision)
 * 2) At most 3 effects occur within any 1.0-second sliding window
 */
function enforceSfxRateLimits(
  rawEvents: CandidateSfxEvent[],
  totalSec: number
): PlannedSfxEvent[] {
  const cutoff = Math.max(0.2, totalSec - 0.14);
  const clamped = rawEvents
    .filter((ev) => Number.isFinite(ev.timeSec) && ev.timeSec >= 0 && ev.timeSec <= cutoff)
    .map((ev) => ({
      ...ev,
      timeSec: Math.round(ev.timeSec * 1000) / 1000,
    }));

  // Resolve highest priority first so important transitions/chimes never get bumped by ticks
  const byPriority = [...clamped].sort(
    (a, b) => b.priority - a.priority || a.timeSec - b.timeSec
  );

  const accepted: CandidateSfxEvent[] = [];

  for (const ev of byPriority) {
    // Rule 1: >= 120ms apart from every already-accepted event
    const tooClose = accepted.some(
      (existing) => Math.abs(existing.timeSec - ev.timeSec) < 0.12
    );
    if (tooClose) continue;

    // Rule 2: at most 3 effects in any 1.0s sliding window
    const nextWithCandidate = [...accepted, ev].sort(
      (a, b) => a.timeSec - b.timeSec
    );
    let violatesWindow = false;
    for (let left = 0; left < nextWithCandidate.length; left++) {
      const windowEnd = nextWithCandidate[left].timeSec + 1.0;
      let count = 0;
      for (
        let right = left;
        right < nextWithCandidate.length && nextWithCandidate[right].timeSec < windowEnd;
        right++
      ) {
        count++;
      }
      if (count > 3) {
        violatesWindow = true;
        break;
      }
    }

    if (!violatesWindow) {
      accepted.push(ev);
    }
  }

  return accepted
    .sort((a, b) => a.timeSec - b.timeSec)
    .map(({ priority: _priority, ...rest }) => rest);
}
