import { clampBpmForStyle } from '@/lib/kit/audio/music';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  type AudioSpec,
} from '@/lib/kit/audio/types';
import type { Op, SceneRef } from '@/lib/kit/ops';
import { hashTitleToSeed } from '@/lib/kit/spec';
import { getStyleDef } from '@/lib/kit/styles';
import { PALETTES } from '@/lib/kit/tokens';
import type { Plan, PlanFont, PlanPalette, PlanScene, VideoFormat } from '@/lib/types';

function resolvePlanSceneIndex(scenes: readonly PlanScene[], ref: SceneRef): number {
  if (typeof ref === 'number') {
    if (ref === -1 && scenes.length > 0) return scenes.length - 1;
    return Number.isInteger(ref) && ref >= 0 && ref < scenes.length ? ref : -1;
  }
  const exactIdx = scenes.findIndex((s) => s.id === ref);
  if (exactIdx >= 0) return exactIdx;
  const numeric = Number(ref);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < scenes.length) {
    return numeric;
  }
  return -1;
}

function clampTextLine(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 60).trimEnd();
}

function toPlanPalette(palette: {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  accent2: string;
}): PlanPalette {
  return {
    background: palette.bg,
    surface: palette.surface,
    text: palette.text,
    accent: palette.accent,
    accentAlt: palette.accent2,
  };
}

function formatItemToLine(item: unknown): string | null {
  if (typeof item === 'string') {
    const line = clampTextLine(item);
    return line || null;
  }
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const detail = typeof rec.detail === 'string' ? rec.detail.trim() : '';
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    const value =
      typeof rec.value === 'string' || typeof rec.value === 'number'
        ? String(rec.value).trim()
        : '';
    if (title && detail) return clampTextLine(`${title}: ${detail}`);
    if (title) return clampTextLine(title);
    if (label && value) return clampTextLine(`${label}: ${value}`);
    if (label) return clampTextLine(label);
  }
  return null;
}

function styleToFont(styleName: string): PlanFont {
  if (styleName === 'editorial' || styleName === 'luxe') return 'serif';
  if (styleName === 'neon-tech') return 'mono';
  return 'sans';
}

export interface ApplyOpsToPlanResult {
  plan: Plan;
  appliedCount: number;
  nextFormat?: VideoFormat;
}

export function applyOpsToPlan(plan: Plan, ops: readonly Op[]): ApplyOpsToPlanResult {
  let nextPlan: Plan = {
    ...plan,
    style: {
      ...plan.style,
      palette: { ...plan.style.palette },
    },
    scenes: plan.scenes.map((sc) => ({
      ...sc,
      onScreenText: [...sc.onScreenText],
    })),
    ...(plan.audio
      ? {
          audio: {
            ...plan.audio,
            ...(plan.audio.music ? { music: { ...plan.audio.music } } : {}),
          },
        }
      : {}),
  };

  let appliedCount = 0;
  let nextFormat: VideoFormat | undefined;

  for (const op of ops) {
    switch (op.type) {
      case 'setTitle': {
        nextPlan.title = op.title.trim();
        appliedCount += 1;
        break;
      }
      case 'setFormat': {
        nextPlan.format = op.format;
        nextFormat = op.format;
        appliedCount += 1;
        break;
      }
      case 'setStyle': {
        const def = getStyleDef(op.style);
        const palette = PALETTES[def.defaultPalette];
        nextPlan.style = {
          mood: def.defaultMood,
          palette: toPlanPalette(palette),
          font: styleToFont(op.style),
        };
        appliedCount += 1;
        break;
      }
      case 'setPalette': {
        const palette = PALETTES[op.palette];
        nextPlan.style = {
          ...nextPlan.style,
          palette: toPlanPalette(palette),
        };
        appliedCount += 1;
        break;
      }
      case 'setCustomColors': {
        const current = nextPlan.style.palette;
        nextPlan.style = {
          ...nextPlan.style,
          palette: {
            background: op.colors.bg ?? current.background,
            surface: op.colors.surface ?? current.surface,
            text: op.colors.text ?? current.text,
            accent: op.colors.accent ?? current.accent,
            accentAlt: op.colors.accent2 ?? current.accentAlt,
          },
        };
        appliedCount += 1;
        break;
      }
      case 'setMood': {
        nextPlan.style = {
          ...nextPlan.style,
          mood: op.mood,
        };
        appliedCount += 1;
        break;
      }
      case 'setDuration': {
        const idx = resolvePlanSceneIndex(nextPlan.scenes, op.scene);
        if (idx >= 0) {
          const clamped = Math.round(Math.max(1.5, Math.min(15, op.dur)) * 10) / 10;
          nextPlan.scenes[idx] = {
            ...nextPlan.scenes[idx],
            durationSeconds: clamped,
          };
          appliedCount += 1;
        }
        break;
      }
      case 'setSlot': {
        const idx = resolvePlanSceneIndex(nextPlan.scenes, op.scene);
        if (idx >= 0 && typeof op.value === 'string') {
          const line = clampTextLine(op.value);
          if (line) {
            const targetScene = nextPlan.scenes[idx];
            const slotLower = op.slot.toLowerCase();
            const nextTexts = [...targetScene.onScreenText];
            if (
              slotLower.includes('sub') ||
              slotLower.includes('body') ||
              slotLower.includes('role') ||
              slotLower.includes('detail') ||
              slotLower.includes('cta') ||
              slotLower.includes('button')
            ) {
              if (nextTexts.length >= 2) {
                nextTexts[1] = line;
              } else {
                nextTexts.push(line);
              }
            } else {
              nextTexts[0] = line;
            }
            nextPlan.scenes[idx] = {
              ...targetScene,
              onScreenText: nextTexts.slice(0, 6),
            };
            appliedCount += 1;
          }
        }
        break;
      }
      case 'setItems': {
        const idx = resolvePlanSceneIndex(nextPlan.scenes, op.scene);
        if (idx >= 0) {
          const lines = op.items
            .map(formatItemToLine)
            .filter((line): line is string => Boolean(line))
            .slice(0, 6);
          if (lines.length > 0) {
            nextPlan.scenes[idx] = {
              ...nextPlan.scenes[idx],
              onScreenText: lines,
            };
            appliedCount += 1;
          }
        }
        break;
      }
      case 'setMusic': {
        const audio: AudioSpec = nextPlan.audio ? { ...nextPlan.audio } : {};
        if (op.source === 'off') {
          delete audio.music;
          nextPlan.audio = audio;
          appliedCount += 1;
          break;
        }
        if (op.source === 'upload' || op.mediaId) {
          if (op.mediaId) {
            audio.music = {
              source: 'upload',
              mediaId: op.mediaId,
              volume: op.volume ?? audio.music?.volume ?? DEFAULT_MUSIC_VOLUME,
              startAt: op.startAt ?? 0,
              loop: op.loop ?? true,
            };
            audio.mute = audio.mute ?? false;
            nextPlan.audio = audio;
            appliedCount += 1;
          }
          break;
        }
        const style =
          op.style ??
          (audio.music && audio.music.source !== 'upload'
            ? audio.music.style
            : 'corporate');
        audio.music = {
          source: 'synth',
          style,
          bpm: clampBpmForStyle(style, op.bpm),
          seed: op.seed ?? hashTitleToSeed(nextPlan.title),
          volume: op.volume ?? audio.music?.volume ?? DEFAULT_MUSIC_VOLUME,
        };
        audio.mute = audio.mute ?? false;
        nextPlan.audio = audio;
        appliedCount += 1;
        break;
      }
      case 'setMusicVolume': {
        const audio: AudioSpec = nextPlan.audio ? { ...nextPlan.audio } : {};
        if (audio.music) {
          audio.music = {
            ...audio.music,
            volume: Math.max(0, Math.min(1, Math.round(op.volume * 100) / 100)),
          };
          nextPlan.audio = audio;
          appliedCount += 1;
        }
        break;
      }
      case 'setSfx': {
        const audio: AudioSpec = nextPlan.audio ? { ...nextPlan.audio } : {};
        audio.sfx = op.sfx;
        if (op.sfx !== 'off' && audio.sfxVolume === undefined) {
          audio.sfxVolume = DEFAULT_SFX_VOLUME;
        }
        nextPlan.audio = audio;
        appliedCount += 1;
        break;
      }
      case 'setSfxVolume': {
        const audio: AudioSpec = nextPlan.audio ? { ...nextPlan.audio } : {};
        audio.sfxVolume = Math.max(0, Math.min(1, Math.round(op.volume * 100) / 100));
        nextPlan.audio = audio;
        appliedCount += 1;
        break;
      }
      case 'muteAudio': {
        const audio: AudioSpec = nextPlan.audio ? { ...nextPlan.audio } : {};
        audio.mute = op.mute;
        nextPlan.audio = audio;
        appliedCount += 1;
        break;
      }
      case 'setIntensity':
      case 'setTransition':
      case 'setCamera': {
        const targetText =
          op.type === 'setIntensity'
            ? `Intensity: ${op.intensity}`
            : op.type === 'setTransition'
              ? `Transition: ${op.transition}`
              : `Camera: ${op.camera}`;
        if ('scene' in op && op.scene !== undefined) {
          const idx = resolvePlanSceneIndex(nextPlan.scenes, op.scene);
          if (idx >= 0) {
            nextPlan.scenes[idx] = {
              ...nextPlan.scenes[idx],
              motion: `${nextPlan.scenes[idx].motion}; ${targetText}`.slice(0, 220),
            };
          }
        }
        appliedCount += 1;
        break;
      }
      default:
        break;
    }
  }

  return {
    plan: nextPlan,
    appliedCount,
    ...(nextFormat ? { nextFormat } : {}),
  };
}
