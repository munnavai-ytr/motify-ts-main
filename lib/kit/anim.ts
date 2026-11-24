import type React from 'react';
import { Easing, interpolate, spring } from 'remotion';
import {
  containsBengali,
  type CameraKind,
  type IntensityName,
  type TransitionKind,
} from './tokens';

export type AnimInPreset =
  | 'fade'
  | 'fade-up'
  | 'fade-down'
  | 'slide-left'
  | 'slide-right'
  | 'pop'
  | 'zoom'
  | 'wipe'
  | 'type'
  | 'words'
  | 'mask-up'
  | 'slam'
  | 'drop'
  | 'rotate-in'
  | 'highlight-sweep'
  | 'draw'
  | 'none';

export type AnimOutPreset = 'fade' | 'slide' | 'zoom' | 'none';

export type AnimAmbientPreset =
  | 'float'
  | 'pulse'
  | 'drift'
  | 'shake'
  | 'shine'
  | 'glow-breathe'
  | 'none';

export type EasePreset = 'smooth' | 'snappy' | 'bounce' | 'cinematic';

export type StaggerMode = number | 'auto-stagger';

export function getEasingFunction(ease: EasePreset): (t: number) => number {
  switch (ease) {
    case 'snappy':
      return Easing.bezier(0.16, 1, 0.3, 1);
    case 'bounce':
      return Easing.bezier(0.34, 1.56, 0.64, 1);
    case 'cinematic':
      return Easing.bezier(0.22, 1, 0.36, 1);
    case 'smooth':
    default:
      return Easing.bezier(0.25, 0.85, 0.35, 1);
  }
}

export function computeBeatFrames(fps: number): number {
  return Math.max(4, Math.round(fps / 3));
}

export function resolveBeatDelay(
  beatStepIndex: number,
  fps: number,
  intensity: IntensityName = 'balanced',
  baseFrames: number = 0
): number {
  const beat = computeBeatFrames(fps);
  const stepFraction =
    intensity === 'energetic' ? 0.38 : intensity === 'calm' ? 0.72 : 0.5;
  return Math.max(
    0,
    Math.round(baseFrames + beatStepIndex * beat * stepFraction)
  );
}

export function resolveStaggerDelay(
  index: number,
  stagger: StaggerMode = 'auto-stagger',
  baseDelayFrames: number = 0,
  stepFrames: number = 5
): number {
  const step = stagger === 'auto-stagger' ? stepFrames : Math.max(0, stagger);
  return Math.max(0, Math.round(baseDelayFrames + index * step));
}

export function computeProgress(params: {
  frame: number;
  fps: number;
  delayFrames?: number;
  durationFrames?: number;
  ease?: EasePreset;
  useSpring?: boolean;
}): number {
  const {
    frame,
    fps,
    delayFrames = 0,
    durationFrames = 16,
    ease = 'smooth',
    useSpring = false,
  } = params;

  const localFrame = frame - delayFrames;
  if (localFrame <= 0) {
    return 0;
  }

  if (useSpring || ease === 'bounce') {
    return spring({
      frame: localFrame,
      fps,
      config:
        ease === 'bounce'
          ? { damping: 11, stiffness: 185, mass: 0.78 }
          : { damping: 15, stiffness: 170, mass: 0.85 },
      durationInFrames: Math.max(12, durationFrames + 6),
    });
  }

  return interpolate(localFrame, [0, Math.max(1, durationFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: getEasingFunction(ease),
  });
}

export interface MotionStyleResult {
  opacity: number;
  transform: string;
  clipPath?: string;
}

export function computeEntranceStyle(params: {
  preset: AnimInPreset;
  frame: number;
  fps: number;
  delayFrames?: number;
  durationFrames?: number;
  ease?: EasePreset;
  distancePx?: number;
}): MotionStyleResult {
  const {
    preset,
    frame,
    fps,
    delayFrames = 0,
    durationFrames = 16,
    ease = 'smooth',
    distancePx = 44,
  } = params;

  if (preset === 'none') {
    return { opacity: 1, transform: 'none' };
  }

  if (preset === 'type' || preset === 'words') {
    const p = computeProgress({
      frame,
      fps,
      delayFrames,
      durationFrames: 8,
      ease: 'smooth',
    });
    return {
      opacity: p,
      transform: 'none',
    };
  }

  const isSpringPreset =
    preset === 'pop' || preset === 'slam' || preset === 'drop';
  const p = computeProgress({
    frame,
    fps,
    delayFrames,
    durationFrames:
      preset === 'slam'
        ? Math.max(8, Math.round(durationFrames * 0.7))
        : durationFrames,
    ease: preset === 'drop' ? 'bounce' : ease,
    useSpring: isSpringPreset,
  });

  switch (preset) {
    case 'fade':
      return {
        opacity: p,
        transform: 'none',
      };
    case 'fade-up':
      return {
        opacity: Math.min(1, p * 1.15),
        transform: `translateY(${((1 - p) * distancePx).toFixed(2)}px)`,
      };
    case 'fade-down':
      return {
        opacity: Math.min(1, p * 1.15),
        transform: `translateY(${((p - 1) * distancePx).toFixed(2)}px)`,
      };
    case 'slide-left':
      return {
        opacity: Math.min(1, p * 1.25),
        transform: `translateX(${((1 - p) * distancePx * 1.4).toFixed(2)}px)`,
      };
    case 'slide-right':
      return {
        opacity: Math.min(1, p * 1.25),
        transform: `translateX(${((p - 1) * distancePx * 1.4).toFixed(2)}px)`,
      };
    case 'pop':
      return {
        opacity: Math.min(1, p * 2.2),
        transform: `scale(${(0.74 + 0.26 * p).toFixed(4)})`,
      };
    case 'zoom':
      return {
        opacity: Math.min(1, p * 1.2),
        transform: `scale(${(1.14 - 0.14 * p).toFixed(4)})`,
      };
    case 'wipe': {
      const rightInset = Math.max(0, (1 - p) * 100);
      return {
        opacity: Math.min(1, p * 2.5),
        transform: 'none',
        clipPath: `inset(0% ${rightInset.toFixed(2)}% 0% 0%)`,
      };
    }
    case 'mask-up': {
      const bottomInset = Math.max(0, (1 - p) * 100);
      return {
        opacity: Math.min(1, p * 3),
        transform: `translateY(${((1 - p) * 18).toFixed(2)}px)`,
        clipPath: `inset(0% 0% ${bottomInset.toFixed(2)}% 0%)`,
      };
    }
    case 'slam': {
      const s = 1.38 - 0.38 * p;
      return {
        opacity: Math.min(1, p * 3.5),
        transform: `scale(${s.toFixed(4)})`,
      };
    }
    case 'drop': {
      const y = (p - 1) * distancePx * 1.6;
      return {
        opacity: Math.min(1, p * 2.4),
        transform: `translateY(${y.toFixed(2)}px)`,
      };
    }
    case 'rotate-in': {
      const deg = (1 - p) * -5.5;
      const scale = 0.9 + 0.1 * p;
      const ty = (1 - p) * 18;
      return {
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${ty.toFixed(2)}px) rotate(${deg.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      };
    }
    case 'highlight-sweep': {
      return {
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${((1 - p) * 12).toFixed(2)}px)`,
      };
    }
    case 'draw': {
      const rightInset = Math.max(0, (1 - p) * 100);
      return {
        opacity: Math.min(1, p * 2.2),
        transform: 'none',
        clipPath: `inset(0% ${rightInset.toFixed(2)}% 0% 0%)`,
      };
    }
    default:
      return { opacity: p, transform: 'none' };
  }
}

export function computeDrawProgress(params: {
  frame: number;
  fps: number;
  delayFrames?: number;
  durationFrames?: number;
  ease?: EasePreset;
}): number {
  return computeProgress({
    frame: params.frame,
    fps: params.fps,
    delayFrames: params.delayFrames ?? 2,
    durationFrames: params.durationFrames ?? 22,
    ease: params.ease ?? 'cinematic',
  });
}

export function computeExitStyle(params: {
  preset: AnimOutPreset;
  frame: number;
  durationInFrames: number;
  exitFrames?: number;
  distancePx?: number;
}): MotionStyleResult {
  const {
    preset,
    frame,
    durationInFrames,
    exitFrames = 10,
    distancePx = 32,
  } = params;

  if (preset === 'none' || durationInFrames <= exitFrames + 4) {
    return { opacity: 1, transform: 'none' };
  }

  const startExit = durationInFrames - exitFrames;
  if (frame <= startExit) {
    return { opacity: 1, transform: 'none' };
  }

  const p = interpolate(frame, [startExit, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });

  switch (preset) {
    case 'slide':
      return {
        opacity: 1 - p,
        transform: `translateY(${(-p * distancePx).toFixed(2)}px)`,
      };
    case 'zoom':
      return {
        opacity: 1 - p,
        transform: `scale(${(1 - p * 0.08).toFixed(4)})`,
      };
    case 'fade':
    default:
      return {
        opacity: 1 - p,
        transform: 'none',
      };
  }
}

export interface EmphasisStyleResult {
  transform: string;
  shineProgress: number | null;
  glowIntensity: number;
}

export function computeEmphasisStyle(params: {
  preset: AnimAmbientPreset;
  frame: number;
  fps: number;
  amplitudePx?: number;
  seedOffset?: number;
}): EmphasisStyleResult {
  const {
    preset,
    frame,
    fps,
    amplitudePx = 8,
    seedOffset = 0,
  } = params;

  if (preset === 'none') {
    return { transform: 'none', shineProgress: null, glowIntensity: 0 };
  }

  const safeFps = Math.max(1, fps);
  const t = frame / safeFps + seedOffset;

  switch (preset) {
    case 'float': {
      const y = Math.sin(t * 1.9) * amplitudePx;
      return {
        transform: `translateY(${y.toFixed(2)}px)`,
        shineProgress: null,
        glowIntensity: 0,
      };
    }
    case 'pulse': {
      const s = 1 + Math.sin(t * 2.5) * 0.025;
      return {
        transform: `scale(${s.toFixed(4)})`,
        shineProgress: null,
        glowIntensity: 0,
      };
    }
    case 'drift': {
      const x = Math.sin(t * 1.1) * amplitudePx;
      const y = Math.cos(t * 0.9) * (amplitudePx * 0.7);
      return {
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
        shineProgress: null,
        glowIntensity: 0,
      };
    }
    case 'shake': {
      // Rhythmic micro shake accent on beat peaks
      const cycle = ((frame + Math.round(seedOffset * 10)) % (safeFps * 2)) / safeFps;
      if (cycle > 0.28) {
        return { transform: 'none', shineProgress: null, glowIntensity: 0 };
      }
      const decay = 1 - cycle / 0.28;
      const angle = Math.sin(cycle * 42) * 1.8 * decay;
      const dx = Math.sin(cycle * 48) * 3.5 * decay;
      return {
        transform: `translateX(${dx.toFixed(2)}px) rotate(${angle.toFixed(2)}deg)`,
        shineProgress: null,
        glowIntensity: 0,
      };
    }
    case 'shine': {
      const periodFrames = Math.max(24, Math.round(safeFps * 2.2));
      const local = (frame % periodFrames) / periodFrames;
      const sweep = local < 0.48 ? local / 0.48 : null;
      return {
        transform: 'none',
        shineProgress: sweep,
        glowIntensity: 0,
      };
    }
    case 'glow-breathe': {
      const wave = (Math.sin(t * 2.6) + 1) * 0.5;
      return {
        transform: `scale(${(1 + wave * 0.012).toFixed(4)})`,
        shineProgress: null,
        glowIntensity: 0.14 + wave * 0.24,
      };
    }
    default:
      return { transform: 'none', shineProgress: null, glowIntensity: 0 };
  }
}

export function computeAmbientStyle(params: {
  preset: AnimAmbientPreset;
  frame: number;
  fps: number;
  amplitudePx?: number;
  seedOffset?: number;
}): { transform: string } {
  const res = computeEmphasisStyle(params);
  return { transform: res.transform };
}

export interface CameraMotionState {
  transform: string;
  progress: number;
  panXRatio: number;
  scaleOffset: number;
}

export function computeCameraState(params: {
  camera: CameraKind;
  frame: number;
  durationInFrames: number;
  intensity?: IntensityName;
  width: number;
}): CameraMotionState {
  const { camera, frame, durationInFrames, intensity = 'balanced', width } =
    params;

  if (camera === 'none' || durationInFrames <= 1) {
    return { transform: 'none', progress: 0, panXRatio: 0, scaleOffset: 0 };
  }

  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  const zoomAmp =
    intensity === 'energetic' ? 0.095 : intensity === 'calm' ? 0.045 : 0.068;
  const panAmpRatio =
    intensity === 'energetic' ? 0.024 : intensity === 'calm' ? 0.012 : 0.018;

  switch (camera) {
    case 'push-in': {
      const s = 1 + zoomAmp * progress;
      return {
        transform: `scale(${s.toFixed(4)})`,
        progress,
        panXRatio: 0,
        scaleOffset: s - 1,
      };
    }
    case 'pull-out': {
      const s = 1 + zoomAmp * (1 - progress);
      return {
        transform: `scale(${s.toFixed(4)})`,
        progress,
        panXRatio: 0,
        scaleOffset: s - 1,
      };
    }
    case 'pan-left': {
      const panRatio = panAmpRatio * (1 - 2 * progress);
      const tx = panRatio * width;
      const s = 1 + zoomAmp * 0.65;
      return {
        transform: `scale(${s.toFixed(4)}) translateX(${tx.toFixed(2)}px)`,
        progress,
        panXRatio: panRatio,
        scaleOffset: s - 1,
      };
    }
    case 'pan-right': {
      const panRatio = panAmpRatio * (-1 + 2 * progress);
      const tx = panRatio * width;
      const s = 1 + zoomAmp * 0.65;
      return {
        transform: `scale(${s.toFixed(4)}) translateX(${tx.toFixed(2)}px)`,
        progress,
        panXRatio: panRatio,
        scaleOffset: s - 1,
      };
    }
    default:
      return { transform: 'none', progress, panXRatio: 0, scaleOffset: 0 };
  }
}

export function computeParallaxTransform(params: {
  cameraState: CameraMotionState;
  depth: number;
  width: number;
}): string {
  const { cameraState, depth, width } = params;
  const clampedDepth = Math.max(0, Math.min(1, depth));
  if (cameraState.panXRatio === 0 && cameraState.scaleOffset === 0) {
    return 'none';
  }
  // Subtle inverse/lag shift relative to camera container so depth layers separate visually
  const lagFactor = (clampedDepth - 0.5) * 0.8;
  const tx = cameraState.panXRatio * width * lagFactor;
  const scale = 1 + cameraState.scaleOffset * (clampedDepth * 0.35);
  return `translateX(${tx.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

export interface IncomingTransitionState {
  containerStyle: React.CSSProperties;
  colorBlockOverlay: {
    active: boolean;
    clipPath: string;
    color: string;
  } | null;
}

export function computeIncomingTransition(params: {
  transition: TransitionKind;
  frame: number;
  overlapInFrames: number;
  width: number;
  height: number;
  accentColor: string;
}): IncomingTransitionState {
  const { transition, frame, overlapInFrames, width, height, accentColor } =
    params;

  if (transition === 'cut' || overlapInFrames <= 0 || frame >= overlapInFrames) {
    return {
      containerStyle: {},
      colorBlockOverlay: null,
    };
  }

  const p = interpolate(frame, [0, overlapInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  switch (transition) {
    case 'fade':
      return {
        containerStyle: { opacity: p },
        colorBlockOverlay: null,
      };
    case 'push-left': {
      const tx = (1 - p) * width;
      return {
        containerStyle: { transform: `translateX(${tx.toFixed(2)}px)` },
        colorBlockOverlay: null,
      };
    }
    case 'push-right': {
      const tx = -(1 - p) * width;
      return {
        containerStyle: { transform: `translateX(${tx.toFixed(2)}px)` },
        colorBlockOverlay: null,
      };
    }
    case 'push-up': {
      const ty = (1 - p) * height;
      return {
        containerStyle: { transform: `translateY(${ty.toFixed(2)}px)` },
        colorBlockOverlay: null,
      };
    }
    case 'wipe-left': {
      const leftInset = Math.max(0, (1 - p) * 100);
      return {
        containerStyle: {
          clipPath: `inset(0% 0% 0% ${leftInset.toFixed(2)}%)`,
        },
        colorBlockOverlay: null,
      };
    }
    case 'wipe-up': {
      const topInset = Math.max(0, (1 - p) * 100);
      return {
        containerStyle: {
          clipPath: `inset(${topInset.toFixed(2)}% 0% 0% 0%)`,
        },
        colorBlockOverlay: null,
      };
    }
    case 'circle-reveal': {
      const radiusPct = p * 115;
      return {
        containerStyle: {
          clipPath: `circle(${radiusPct.toFixed(2)}% at 50% 50%)`,
        },
        colorBlockOverlay: null,
      };
    }
    case 'zoom-through': {
      const s = 0.86 + 0.14 * p;
      return {
        containerStyle: {
          opacity: Math.min(1, p * 1.35),
          transform: `scale(${s.toFixed(4)})`,
        },
        colorBlockOverlay: null,
      };
    }
    case 'color-block': {
      // Phase 1 (0..0.48): accent block sweeps in from right; Phase 2 (0.48..1): block exits left revealing new scene
      const showNewScene = p >= 0.45;
      const inPct = p < 0.5 ? Math.max(0, (1 - p * 2) * 100) : 0;
      const outPct = p >= 0.5 ? Math.min(100, (p - 0.5) * 2 * 100) : 0;
      return {
        containerStyle: {
          opacity: showNewScene ? 1 : 0,
        },
        colorBlockOverlay: {
          active: true,
          clipPath: `inset(0% ${outPct.toFixed(2)}% 0% ${inPct.toFixed(2)}%)`,
          color: accentColor,
        },
      };
    }
    default:
      return { containerStyle: { opacity: p }, colorBlockOverlay: null };
  }
}

export function combineTransforms(...transforms: Array<string | undefined>): string {
  const active = transforms.filter(
    (t): t is string => Boolean(t && t !== 'none')
  );
  return active.length > 0 ? active.join(' ') : 'none';
}

export function mergeMotionStyles(
  entrance: MotionStyleResult,
  exit: MotionStyleResult,
  ambient?: { transform: string }
): React.CSSProperties {
  return {
    opacity: Math.max(0, Math.min(1, entrance.opacity * exit.opacity)),
    transform: combineTransforms(
      entrance.transform,
      exit.transform,
      ambient?.transform
    ),
    ...(entrance.clipPath ? { clipPath: entrance.clipPath } : {}),
  };
}

export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return Array.from(text);
}

/**
 * Reveals typed text cleanly.
 * For Bengali script, reveals word-by-word so conjunct clusters (যুক্তবর্ণ)
 * and vowel matras never break mid-character during typing.
 */
export function revealTypedText(text: string, progress: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped >= 1) {
    return text;
  }
  if (clamped <= 0) {
    return '';
  }

  if (containsBengali(text)) {
    const tokens = text.split(/(\s+)/);
    const wordIndices: number[] = [];
    tokens.forEach((tok, idx) => {
      if (tok.trim().length > 0) {
        wordIndices.push(idx);
      }
    });
    if (wordIndices.length === 0) {
      return text;
    }
    const visibleWords = Math.max(
      1,
      Math.round(clamped * wordIndices.length)
    );
    const cutoffTokenIdx =
      wordIndices[Math.min(visibleWords - 1, wordIndices.length - 1)] ?? 0;
    return tokens.slice(0, cutoffTokenIdx + 1).join('');
  }

  const graphemes = splitGraphemes(text);
  const count = Math.max(1, Math.round(clamped * graphemes.length));
  return graphemes.slice(0, count).join('');
}
