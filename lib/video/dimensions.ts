import type {
  PlanFont,
  PlanScene,
  PlanStyle,
  VideoFormat,
} from '@/lib/types';

export const VIDEO_FPS = 30;

export const FORMAT_DIMENSIONS: Record<
  VideoFormat,
  { width: number; height: number }
> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

export const FONT_STACKS: Record<PlanFont, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", "Noto Sans Bengali", sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif Bengali", serif',
  mono: 'ui-monospace, Menlo, Consolas, "Noto Sans Bengali", monospace',
};

export interface SceneTheme {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accentAlt: string;
  fontFamily: string;
}

export interface SceneProps {
  texts: string[];
  theme: SceneTheme;
  durationInFrames: number;
}

export function getDimensionsForFormat(format: VideoFormat): {
  width: number;
  height: number;
} {
  return FORMAT_DIMENSIONS[format];
}

export function secondsToFrames(
  durationSeconds: number,
  fps: number = VIDEO_FPS
): number {
  return Math.max(1, Math.round(durationSeconds * fps));
}

export function buildSceneTheme(style: PlanStyle): SceneTheme {
  return {
    background: style.palette.background,
    surface: style.palette.surface,
    text: style.palette.text,
    accent: style.palette.accent,
    accentAlt: style.palette.accentAlt,
    fontFamily: FONT_STACKS[style.font],
  };
}

/**
 * Deterministic hash over the 4 scene fields that require code regeneration:
 * name, purpose, visualIdea, and motion. Edits to onScreenText, colors, font,
 * or durationSeconds do NOT alter specHash and update the video via props.
 */
export function computeSceneSpecHash(
  scene: Pick<PlanScene, 'name' | 'purpose' | 'visualIdea' | 'motion'>
): string {
  const payload = JSON.stringify([
    scene.name.trim(),
    scene.purpose.trim(),
    scene.visualIdea.trim(),
    scene.motion.trim(),
  ]);

  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }

  const partA = (hashA >>> 0).toString(16).padStart(8, '0');
  const partB = (hashB >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB}`;
}
