import { z } from 'zod';
import type { VideoFormat } from '@/lib/types';
import { getDimensionsForFormat, VIDEO_FPS } from '@/lib/video/dimensions';
import {
  splitGraphemes,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from './anim';
import { isKnownKitIcon } from './elements';
import { getLayoutDefinition, LAYOUT_NAMES } from './layouts/registry';
import type { LayoutName } from './layouts/types';
import { getStyleDef, STYLE_NAMES } from './styles';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MUSIC_STYLE_NAMES,
  SFX_MODES,
  type AudioMusicSpec,
  type AudioSpec,
  type MusicStyleName,
  type SfxMode,
} from './audio/types';
import {
  hasNoMusicIntent,
  hasNoSoundIntent,
  pickDefaultMusicStyleForTheme,
  resolveMusicBpmFromAudio,
  snapDurationsToBeatGrid,
} from './audio/helpers';
import { clampBpmForStyle } from './audio/music';
import {
  MOODS,
  PALETTES,
  ensureContrast,
  type BgKind,
  type CameraKind,
  type IntensityName,
  type KitPalette,
  type LayoutVariant,
  type MoodName,
  type NumeralSystem,
  type PaletteName,
  type PartialKitPalette,
  type StyleName,
  type TransitionKind,
} from './tokens';

export const DEFAULT_KIT_FPS = VIDEO_FPS;
export const TRANSITION_OVERLAP_FRAMES = 14;
export const MAX_KIT_SCENES = 12;
export const MIN_SCENE_DUR_SEC = 1.5;
export const MAX_SCENE_DUR_SEC = 15;

export const ANIM_IN_VALUES: readonly AnimInPreset[] = [
  'fade',
  'fade-up',
  'fade-down',
  'slide-left',
  'slide-right',
  'pop',
  'zoom',
  'wipe',
  'type',
  'words',
  'mask-up',
  'slam',
  'drop',
  'rotate-in',
  'highlight-sweep',
  'draw',
  'none',
];

export const ANIM_OUT_VALUES: readonly AnimOutPreset[] = [
  'fade',
  'slide',
  'zoom',
  'none',
];

export const EASE_VALUES: readonly EasePreset[] = [
  'smooth',
  'snappy',
  'bounce',
  'cinematic',
];

export const BG_KIND_VALUES: readonly BgKind[] = [
  'solid',
  'linear',
  'radial',
  'grid',
  'dots',
  'shapes',
  'chroma',
  'mesh-glow',
  'aurora',
  'stripes',
  'dots-grid',
  'rings',
  'color-blocks',
  'waves',
  'confetti',
  'sparkles',
  'lines-sweep',
  'paper',
];

export const TRANSITION_VALUES: readonly TransitionKind[] = [
  'fade',
  'push-left',
  'push-right',
  'push-up',
  'wipe-left',
  'wipe-up',
  'circle-reveal',
  'zoom-through',
  'color-block',
  'cut',
];

export const CAMERA_VALUES: readonly CameraKind[] = [
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'none',
];

export const INTENSITY_VALUES: readonly IntensityName[] = [
  'calm',
  'balanced',
  'energetic',
];

export const VARIANT_VALUES: readonly LayoutVariant[] = ['a', 'b', 'c'];

const FORMAT_VALUES: readonly VideoFormat[] = ['9:16', '16:9', '1:1'];

const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];
const MOOD_NAMES = Object.keys(MOODS) as MoodName[];

export const PartialPaletteSchema = z.object({
  bg: z.string().min(4),
  surface: z.string().min(4).optional(),
  text: z.string().min(4).optional(),
  muted: z.string().min(4).optional(),
  accent: z.string().min(4),
  accent2: z.string().min(4).optional(),
  onAccent: z.string().min(4).optional(),
  onAccent2: z.string().min(4).optional(),
});

export const ThemeSpecSchema = z.object({
  palette: z.union([
    z.enum(['ember', 'ocean', 'forest', 'noir', 'neon', 'sunrise', 'lavender', 'mono']),
    PartialPaletteSchema,
  ]),
  mood: z.enum(['bold', 'soft', 'tech', 'elegant', 'playful']),
});

export const SceneSpecSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  layout: z.enum([
    'hook',
    'title',
    'feature',
    'stat',
    'list',
    'steps',
    'quote',
    'compare',
    'bars',
    'kinetic',
    'offer',
    'cta',
    'brand',
    'lower-third',
    'custom',
  ]),
  variant: z.enum(['a', 'b', 'c']).optional(),
  dur: z.number().finite().min(MIN_SCENE_DUR_SEC).max(MAX_SCENE_DUR_SEC),
  bg: z
    .enum([
      'solid',
      'linear',
      'radial',
      'grid',
      'dots',
      'shapes',
      'chroma',
      'mesh-glow',
      'aurora',
      'stripes',
      'dots-grid',
      'rings',
      'color-blocks',
      'waves',
      'confetti',
      'sparkles',
      'lines-sweep',
      'paper',
    ])
    .optional(),
  animIn: z
    .enum([
      'fade',
      'fade-up',
      'fade-down',
      'slide-left',
      'slide-right',
      'pop',
      'zoom',
      'wipe',
      'type',
      'words',
      'mask-up',
      'slam',
      'drop',
      'rotate-in',
      'highlight-sweep',
      'draw',
      'none',
    ])
    .optional(),
  animOut: z.enum(['fade', 'slide', 'zoom', 'none']).optional(),
  ease: z.enum(['smooth', 'snappy', 'bounce', 'cinematic']).optional(),
  transition: z
    .enum([
      'fade',
      'push-left',
      'push-right',
      'push-up',
      'wipe-left',
      'wipe-up',
      'circle-reveal',
      'zoom-through',
      'color-block',
      'cut',
    ])
    .optional(),
  camera: z.enum(['push-in', 'pull-out', 'pan-left', 'pan-right', 'none']).optional(),
  slots: z.record(z.string(), z.unknown()),
});

export const MusicStyleEnumSchema = z.enum([
  'lofi',
  'corporate',
  'upbeat-pop',
  'cinematic',
  'playful',
  'tech-pulse',
  'ambient',
]);

export const SfxModeEnumSchema = z.enum(['auto', 'minimal', 'off']);

export const GeneratedMusicSpecSchema = z.object({
  source: z.literal('synth').optional(),
  style: MusicStyleEnumSchema,
  bpm: z.number().finite().min(40).max(200).optional(),
  seed: z.number().int().min(0).max(999999).optional(),
  volume: z.number().finite().min(0).max(1).optional(),
});

export const UploadedMusicSpecSchema = z.object({
  source: z.literal('upload'),
  mediaId: z.string().min(1),
  volume: z.number().finite().min(0).max(1).optional(),
  startAt: z.number().finite().min(0).optional(),
  loop: z.boolean().optional(),
});

export const AudioSpecSchema = z.object({
  music: z.union([GeneratedMusicSpecSchema, UploadedMusicSpecSchema]).optional(),
  sfx: SfxModeEnumSchema.optional(),
  sfxVolume: z.number().finite().min(0).max(1).optional(),
  mute: z.boolean().optional(),
});

export const VideoSpecSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  format: z.enum(['9:16', '16:9', '1:1']),
  fps: z.number().int().min(24).max(60).optional(),
  style: z
    .enum([
      'clean',
      'editorial',
      'bold-poster',
      'neon-tech',
      'playful-pop',
      'luxe',
      'organic-soft',
    ])
    .optional(),
  seed: z.number().int().min(0).max(999999).optional(),
  intensity: z.enum(['calm', 'balanced', 'energetic']).optional(),
  numerals: z.enum(['latn', 'bn']).optional(),
  transition: z
    .enum([
      'fade',
      'push-left',
      'push-right',
      'push-up',
      'wipe-left',
      'wipe-up',
      'circle-reveal',
      'zoom-through',
      'color-block',
      'cut',
    ])
    .optional(),
  audio: AudioSpecSchema.optional(),
  theme: ThemeSpecSchema,
  scenes: z.array(SceneSpecSchema).min(1).max(MAX_KIT_SCENES),
});

export interface NormalizedThemeSpec {
  paletteName: PaletteName | 'custom';
  palette: KitPalette;
  mood: MoodName;
}

export interface NormalizedSceneSpec {
  id: string;
  layout: LayoutName;
  variant: LayoutVariant;
  dur: number;
  bg: BgKind;
  animIn: AnimInPreset;
  animOut: AnimOutPreset;
  ease: EasePreset;
  transition: TransitionKind;
  camera: CameraKind;
  slots: Record<string, unknown>;
}

export interface VideoSpec {
  title: string;
  format: VideoFormat;
  fps: number;
  style: StyleName;
  seed: number;
  intensity: IntensityName;
  numerals?: NumeralSystem;
  transition?: TransitionKind;
  audio?: AudioSpec;
  theme: NormalizedThemeSpec;
  scenes: NormalizedSceneSpec[];
}

export type NormalizeVideoSpecResult =
  | { ok: true; spec: VideoSpec; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createStableSceneId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let maxNum = 0;
  for (const id of used) {
    const match = id.match(/^scene-(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  let candidateNum = Math.max(1, maxNum + 1);
  while (used.has(`scene-${candidateNum}`)) {
    candidateNum++;
  }
  return `scene-${candidateNum}`;
}

export function hashTitleToSeed(title: string): number {
  let hash = 2166136261;
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100000;
}

function clampGraphemes(text: string, maxChars: number): { value: string; trimmed: boolean } {
  const clean = text.trim();
  const graphemes = splitGraphemes(clean);
  if (graphemes.length <= maxChars) {
    return { value: clean, trimmed: false };
  }
  const cut = graphemes.slice(0, Math.max(1, maxChars - 1)).join('').trimEnd();
  return { value: `${cut}…`, trimmed: true };
}

function normalizeSlots(
  layoutName: LayoutName,
  rawSlots: Record<string, unknown>,
  sceneLabel: string,
  warnings: string[]
): Record<string, unknown> {
  const def = getLayoutDefinition(layoutName);
  const next: Record<string, unknown> = { ...rawSlots };

  // Check any icon string across slots
  if (typeof next.icon === 'string' && next.icon.trim().length > 0) {
    const iconName = next.icon.trim();
    if (!isKnownKitIcon(iconName)) {
      warnings.push(
        `${sceneLabel}: unknown icon "${iconName}" replaced with "sparkles".`
      );
      next.icon = 'sparkles';
    } else {
      next.icon = iconName;
    }
  }

  if (Array.isArray(next.items)) {
    next.items = next.items.slice(0, 5).map((item) => {
      if (isRecord(item)) {
        const copy: Record<string, unknown> = { ...item };
        if (typeof copy.icon === 'string' && copy.icon.trim().length > 0) {
          if (!isKnownKitIcon(copy.icon.trim())) {
            warnings.push(
              `${sceneLabel}: unknown item icon "${copy.icon}" replaced with "sparkles".`
            );
            copy.icon = 'sparkles';
          }
        }
        if (typeof copy.title === 'string') {
          const clamped = clampGraphemes(copy.title, 70);
          if (clamped.trimmed) {
            warnings.push(`${sceneLabel}: trimmed overlong list item title.`);
          }
          copy.title = clamped.value;
        }
        if (typeof copy.detail === 'string') {
          const clamped = clampGraphemes(copy.detail, 90);
          if (clamped.trimmed) {
            warnings.push(`${sceneLabel}: trimmed overlong list item detail.`);
          }
          copy.detail = clamped.value;
        }
        return copy;
      }
      if (typeof item === 'string') {
        const clamped = clampGraphemes(item, 70);
        if (clamped.trimmed) {
          warnings.push(`${sceneLabel}: trimmed overlong list item.`);
        }
        return clamped.value;
      }
      return item;
    });
  }

  if (Array.isArray(next.data)) {
    next.data = next.data.slice(0, 6).map((entry) => {
      if (isRecord(entry)) {
        const copy: Record<string, unknown> = { ...entry };
        if (typeof copy.label === 'string') {
          const clamped = clampGraphemes(copy.label, 28);
          if (clamped.trimmed) {
            warnings.push(`${sceneLabel}: trimmed overlong bar label.`);
          }
          copy.label = clamped.value;
        }
        if (typeof copy.value === 'string' && Number.isFinite(Number(copy.value))) {
          copy.value = Math.max(0, Number(copy.value));
        } else if (typeof copy.value === 'number' && Number.isFinite(copy.value)) {
          copy.value = Math.max(0, copy.value);
        }
        return copy;
      }
      return entry;
    });
  }

  if (Array.isArray(next.blocks)) {
    next.blocks = next.blocks.slice(0, 5).map((blk) => {
      if (isRecord(blk)) {
        const copy: Record<string, unknown> = { ...blk };
        if (typeof copy.icon === 'string' && copy.icon.trim().length > 0) {
          if (!isKnownKitIcon(copy.icon.trim())) {
            warnings.push(
              `${sceneLabel}: unknown block icon "${copy.icon}" replaced with "sparkles".`
            );
            copy.icon = 'sparkles';
          }
        }
        if (typeof copy.text === 'string') {
          const clamped = clampGraphemes(copy.text, 120);
          if (clamped.trimmed) {
            warnings.push(`${sceneLabel}: trimmed overlong custom block text.`);
          }
          copy.text = clamped.value;
        }
        return copy;
      }
      return blk;
    });
  }

  if (def) {
    for (const slotDef of def.slots) {
      if (slotDef.type === 'string' && slotDef.maxChars) {
        const val = next[slotDef.name];
        if (typeof val === 'string') {
          const limit = Math.max(slotDef.maxChars, Math.round(slotDef.maxChars * 1.4));
          const clamped = clampGraphemes(val, limit);
          if (clamped.trimmed) {
            warnings.push(
              `${sceneLabel}: trimmed "${slotDef.name}" to ${limit} characters.`
            );
            next[slotDef.name] = clamped.value;
          }
        }
      }
      if (slotDef.type === 'string[]' && Array.isArray(next[slotDef.name])) {
        const rawArr = next[slotDef.name] as unknown[];
        const maxItems = slotDef.maxItems ?? 6;
        if (rawArr.length > maxItems) {
          warnings.push(
            `${sceneLabel}: capped "${slotDef.name}" at ${maxItems} items.`
          );
        }
        next[slotDef.name] = rawArr.slice(0, maxItems).map((entry) => {
          if (typeof entry === 'string' && slotDef.maxChars) {
            const limit = Math.max(slotDef.maxChars, Math.round(slotDef.maxChars * 1.4));
            const clamped = clampGraphemes(entry, limit);
            if (clamped.trimmed) {
              warnings.push(
                `${sceneLabel}: trimmed "${slotDef.name}" entry to ${limit} characters.`
              );
            }
            return clamped.value;
          }
          return entry;
        });
      }
    }
  }

  return next;
}

export function normalizeVideoSpec(raw: unknown): NormalizeVideoSpecResult {
  const warnings: string[] = [];

  let parsedInput: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsedInput = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        errors: [
          `Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
        ],
        warnings,
      };
    }
  }

  if (!isRecord(parsedInput)) {
    return {
      ok: false,
      errors: ['VideoSpec must be a JSON object.'],
      warnings,
    };
  }

  const rawFormat = parsedInput.format;
  const format: VideoFormat = FORMAT_VALUES.includes(rawFormat as VideoFormat)
    ? (rawFormat as VideoFormat)
    : '9:16';
  if (rawFormat !== format) {
    warnings.push(
      `Unknown or missing format (${String(rawFormat)}); defaulted to "${format}".`
    );
  }

  const rawTitle =
    typeof parsedInput.title === 'string' && parsedInput.title.trim().length > 0
      ? parsedInput.title.trim().slice(0, 100)
      : 'Untitled Motion Video';

  const rawFps = parsedInput.fps;
  const fps =
    typeof rawFps === 'number' && Number.isFinite(rawFps) && rawFps >= 24 && rawFps <= 60
      ? Math.round(rawFps)
      : DEFAULT_KIT_FPS;

  // S1-B top-level visual style, seed, intensity, transition
  const rawStyle = parsedInput.style;
  const styleName: StyleName =
    typeof rawStyle === 'string' && STYLE_NAMES.includes(rawStyle as StyleName)
      ? (rawStyle as StyleName)
      : 'clean';
  if (rawStyle !== undefined && rawStyle !== styleName) {
    warnings.push(
      `Unknown style "${String(rawStyle)}" replaced with "${styleName}".`
    );
  }
  const styleDef = getStyleDef(styleName);

  const rawSeed = parsedInput.seed;
  const seed =
    typeof rawSeed === 'number' && Number.isFinite(rawSeed)
      ? Math.abs(Math.round(rawSeed)) % 1000000
      : hashTitleToSeed(rawTitle);

  const rawIntensity = parsedInput.intensity;
  const intensity: IntensityName =
    typeof rawIntensity === 'string' &&
    INTENSITY_VALUES.includes(rawIntensity as IntensityName)
      ? (rawIntensity as IntensityName)
      : 'balanced';
  if (rawIntensity !== undefined && rawIntensity !== intensity) {
    warnings.push(
      `Unknown intensity "${String(rawIntensity)}" replaced with "${intensity}".`
    );
  }

  const rawGlobalTransition = parsedInput.transition;
  const globalTransition: TransitionKind | undefined =
    typeof rawGlobalTransition === 'string' &&
    TRANSITION_VALUES.includes(rawGlobalTransition as TransitionKind)
      ? (rawGlobalTransition as TransitionKind)
      : undefined;
  if (rawGlobalTransition !== undefined && globalTransition === undefined) {
    warnings.push(
      `Unknown top-level transition "${String(rawGlobalTransition)}" ignored.`
    );
  }

  const rawNumerals = parsedInput.numerals;
  const numerals: NumeralSystem | undefined =
    rawNumerals === 'bn' || rawNumerals === 'latn' ? rawNumerals : undefined;
  if (rawNumerals !== undefined && numerals === undefined) {
    warnings.push(
      `Unknown numerals "${String(rawNumerals)}" ignored (expected "latn" or "bn").`
    );
  }

  // Theme normalization
  const rawTheme = isRecord(parsedInput.theme) ? parsedInput.theme : {};
  const rawMood = rawTheme.mood;
  const moodName: MoodName = MOOD_NAMES.includes(rawMood as MoodName)
    ? (rawMood as MoodName)
    : styleDef.defaultMood;
  if (rawMood !== undefined && rawMood !== moodName) {
    warnings.push(
      `Unknown mood "${String(rawMood)}" replaced with "${moodName}".`
    );
  }
  const moodToken = MOODS[moodName];

  let paletteName: PaletteName | 'custom' = styleDef.defaultPalette;
  let paletteCandidate: KitPalette | PartialKitPalette =
    PALETTES[styleDef.defaultPalette];

  if (
    isRecord(rawTheme.customPalette) &&
    typeof rawTheme.customPalette.bg === 'string' &&
    typeof rawTheme.customPalette.accent === 'string'
  ) {
    paletteName = 'custom';
    paletteCandidate = rawTheme.customPalette as unknown as PartialKitPalette;
  } else if (typeof rawTheme.palette === 'string') {
    if (PALETTE_NAMES.includes(rawTheme.palette as PaletteName)) {
      paletteName = rawTheme.palette as PaletteName;
      paletteCandidate = PALETTES[paletteName];
    } else {
      warnings.push(
        `Unknown palette "${rawTheme.palette}" replaced with "${paletteName}".`
      );
    }
  } else if (isRecord(rawTheme.palette)) {
    if (
      typeof rawTheme.palette.bg === 'string' &&
      typeof rawTheme.palette.accent === 'string'
    ) {
      paletteName = 'custom';
      paletteCandidate = rawTheme.palette as unknown as PartialKitPalette;
    } else {
      warnings.push(`Incomplete custom palette object; defaulted to "${paletteName}".`);
    }
  } else if (rawTheme.palette !== undefined) {
    warnings.push(`Invalid theme.palette; defaulted to "${paletteName}".`);
  }

  const contrastResult = ensureContrast(paletteCandidate);
  warnings.push(...contrastResult.warnings);

  // Scenes normalization
  if (!Array.isArray(parsedInput.scenes) || parsedInput.scenes.length === 0) {
    return {
      ok: false,
      errors: ['scenes must be a non-empty array with at least 1 scene.'],
      warnings,
    };
  }

  let rawScenes = parsedInput.scenes;
  if (rawScenes.length > MAX_KIT_SCENES) {
    warnings.push(
      `Received ${rawScenes.length} scenes; capped at ${MAX_KIT_SCENES}.`
    );
    rawScenes = rawScenes.slice(0, MAX_KIT_SCENES);
  }

  const usedSceneIds = new Set<string>();
  for (const rawScene of rawScenes) {
    if (
      isRecord(rawScene) &&
      typeof rawScene.id === 'string' &&
      rawScene.id.trim().length > 0
    ) {
      usedSceneIds.add(rawScene.id.trim().slice(0, 64));
    }
  }

  const assignedSceneIds = new Set<string>();
  const normalizedScenes: NormalizedSceneSpec[] = [];

  for (let i = 0; i < rawScenes.length; i++) {
    const rawScene = rawScenes[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (!isRecord(rawScene)) {
      warnings.push(`${sceneLabel}: non-object scene entry skipped.`);
      continue;
    }

    const rawLayout = rawScene.layout;
    let layout: LayoutName = 'title';
    if (
      typeof rawLayout === 'string' &&
      LAYOUT_NAMES.includes(rawLayout as LayoutName)
    ) {
      layout = rawLayout as LayoutName;
    } else {
      warnings.push(
        `${sceneLabel}: unknown layout "${String(rawLayout)}" replaced with "title".`
      );
    }

    const def = getLayoutDefinition(layout);
    const availableVariants: readonly LayoutVariant[] = def?.variants ?? ['a'];

    let variant: LayoutVariant;
    if (
      typeof rawScene.variant === 'string' &&
      VARIANT_VALUES.includes(rawScene.variant as LayoutVariant)
    ) {
      const requested = rawScene.variant as LayoutVariant;
      if (availableVariants.includes(requested)) {
        variant = requested;
      } else {
        variant = availableVariants[availableVariants.length - 1] ?? 'a';
        warnings.push(
          `${sceneLabel}: layout "${layout}" does not support variant "${requested}"; used "${variant}".`
        );
      }
    } else {
      if (rawScene.variant !== undefined) {
        warnings.push(
          `${sceneLabel}: invalid variant "${String(rawScene.variant)}" replaced.`
        );
      }
      const idx = Math.abs(seed + i) % availableVariants.length;
      variant = availableVariants[idx] ?? 'a';
      const prevScene = normalizedScenes[normalizedScenes.length - 1];
      if (
        prevScene &&
        prevScene.layout === layout &&
        availableVariants.length > 1 &&
        prevScene.variant === variant
      ) {
        variant =
          availableVariants[(idx + 1) % availableVariants.length] ?? variant;
      }
    }

    const defaultDur =
      def?.defaultDurationSec ?? styleDef.cutDurationSec[intensity];

    let dur = defaultDur;
    if (typeof rawScene.dur === 'number' && Number.isFinite(rawScene.dur)) {
      if (rawScene.dur < MIN_SCENE_DUR_SEC) {
        warnings.push(
          `${sceneLabel}: dur ${rawScene.dur}s clamped up to ${MIN_SCENE_DUR_SEC}s.`
        );
        dur = MIN_SCENE_DUR_SEC;
      } else if (rawScene.dur > MAX_SCENE_DUR_SEC) {
        warnings.push(
          `${sceneLabel}: dur ${rawScene.dur}s clamped down to ${MAX_SCENE_DUR_SEC}s.`
        );
        dur = MAX_SCENE_DUR_SEC;
      } else {
        dur = Math.round(rawScene.dur * 10) / 10;
      }
    } else if (rawScene.dur !== undefined) {
      warnings.push(
        `${sceneLabel}: invalid dur replaced with ${defaultDur}s.`
      );
    }

    const defaultBgForScene =
      styleName === 'clean' && rawStyle === undefined
        ? i === 0
          ? moodToken.defaultBg
          : (styleDef.bgRecipes[Math.abs(seed + i) % styleDef.bgRecipes.length] ??
              moodToken.defaultBg)
        : (styleDef.bgRecipes[Math.abs(seed + i) % styleDef.bgRecipes.length] ??
            moodToken.defaultBg);

    const bg: BgKind =
      typeof rawScene.bg === 'string' &&
      BG_KIND_VALUES.includes(rawScene.bg as BgKind)
        ? (rawScene.bg as BgKind)
        : defaultBgForScene;

    if (rawScene.bg !== undefined && rawScene.bg !== bg) {
      warnings.push(
        `${sceneLabel}: unknown bg "${String(rawScene.bg)}" replaced with "${bg}".`
      );
    }

    const defaultAnimInForScene =
      styleName !== 'clean'
        ? (styleDef.headlineEntrances[
            Math.abs(seed + i) % styleDef.headlineEntrances.length
          ] ?? moodToken.defaultAnimIn)
        : moodToken.defaultAnimIn;

    const animIn: AnimInPreset =
      typeof rawScene.animIn === 'string' &&
      ANIM_IN_VALUES.includes(rawScene.animIn as AnimInPreset)
        ? (rawScene.animIn as AnimInPreset)
        : defaultAnimInForScene;

    const animOut: AnimOutPreset =
      typeof rawScene.animOut === 'string' &&
      ANIM_OUT_VALUES.includes(rawScene.animOut as AnimOutPreset)
        ? (rawScene.animOut as AnimOutPreset)
        : moodToken.defaultAnimOut;

    const ease: EasePreset =
      typeof rawScene.ease === 'string' &&
      EASE_VALUES.includes(rawScene.ease as EasePreset)
        ? (rawScene.ease as EasePreset)
        : moodToken.defaultEase;

    const defaultTransition =
      globalTransition ??
      styleDef.transitions[Math.abs(seed + i) % styleDef.transitions.length] ??
      'fade';

    const transition: TransitionKind =
      typeof rawScene.transition === 'string' &&
      TRANSITION_VALUES.includes(rawScene.transition as TransitionKind)
        ? (rawScene.transition as TransitionKind)
        : defaultTransition;

    if (rawScene.transition !== undefined && rawScene.transition !== transition) {
      warnings.push(
        `${sceneLabel}: unknown transition "${String(rawScene.transition)}" replaced with "${transition}".`
      );
    }

    const defaultCamera: CameraKind =
      layout === 'lower-third' || bg === 'chroma'
        ? 'none'
        : (styleDef.cameras[Math.abs(seed + i) % styleDef.cameras.length] ?? 'none');

    const camera: CameraKind =
      typeof rawScene.camera === 'string' &&
      CAMERA_VALUES.includes(rawScene.camera as CameraKind)
        ? (rawScene.camera as CameraKind)
        : defaultCamera;

    if (rawScene.camera !== undefined && rawScene.camera !== camera) {
      warnings.push(
        `${sceneLabel}: unknown camera "${String(rawScene.camera)}" replaced with "${camera}".`
      );
    }

    const rawSlots = isRecord(rawScene.slots) ? rawScene.slots : {};
    const mappedSlots =
      layout === 'title' &&
      typeof rawSlots.title !== 'string' &&
      (typeof rawSlots.headline === 'string' || typeof rawSlots.name === 'string')
        ? {
            ...rawSlots,
            title:
              (typeof rawSlots.headline === 'string' && rawSlots.headline) ||
              (typeof rawSlots.name === 'string' && rawSlots.name) ||
              'Untitled Scene',
          }
        : rawSlots;

    const slots = normalizeSlots(layout, mappedSlots, sceneLabel, warnings);

    const rawId =
      typeof rawScene.id === 'string' && rawScene.id.trim().length > 0
        ? rawScene.id.trim().slice(0, 64)
        : '';
    let id = rawId;
    if (!id || assignedSceneIds.has(id)) {
      const preferred = `scene-${i + 1}`;
      if (!usedSceneIds.has(preferred) && !assignedSceneIds.has(preferred)) {
        id = preferred;
      } else {
        const union = new Set([...usedSceneIds, ...assignedSceneIds]);
        id = createStableSceneId(union);
      }
    }
    assignedSceneIds.add(id);

    normalizedScenes.push({
      id,
      layout,
      variant,
      dur,
      bg,
      animIn,
      animOut,
      ease,
      transition,
      camera,
      slots,
    });
  }

  if (normalizedScenes.length === 0) {
    return {
      ok: false,
      errors: ['No valid scenes remained after normalization.'],
      warnings,
    };
  }

  const normalizedAudio = normalizeAudioField(
    parsedInput.audio,
    styleName,
    moodName,
    seed,
    warnings
  );

  const isLowerThirdProject =
    normalizedScenes.length > 0 &&
    normalizedScenes.every((sc) => sc.layout === 'lower-third');
  const isChromaProject = normalizedScenes.some((sc) => sc.bg === 'chroma');

  const resolvedAudio: AudioSpec | undefined =
    normalizedAudio ??
    (!isLowerThirdProject && !isChromaProject
      ? {
          music: {
            style: 'corporate',
            seed: 0,
          },
          sfx: 'auto',
          mute: false,
        }
      : undefined);

  return {
    ok: true,
    spec: {
      title: rawTitle,
      format,
      fps,
      style: styleName,
      seed,
      intensity,
      ...(numerals ? { numerals } : {}),
      ...(globalTransition ? { transition: globalTransition } : {}),
      ...(resolvedAudio ? { audio: resolvedAudio } : {}),
      theme: {
        paletteName,
        palette: contrastResult.palette,
        mood: moodName,
      },
      scenes: normalizedScenes,
    },
    warnings,
  };
}

function clampUnitVolume(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Math.round(val * 100) / 100));
}

function normalizeAudioField(
  rawAudio: unknown,
  style: StyleName,
  mood: MoodName,
  specSeed: number,
  warnings: string[]
): AudioSpec | undefined {
  if (rawAudio === undefined || rawAudio === null) {
    return undefined;
  }
  if (!isRecord(rawAudio)) {
    warnings.push('Invalid "audio" field ignored.');
    return undefined;
  }

  let music: AudioMusicSpec | undefined;
  if (rawAudio.music !== undefined && rawAudio.music !== null) {
    if (!isRecord(rawAudio.music)) {
      warnings.push('Invalid "audio.music" object ignored.');
    } else if (rawAudio.music.source === 'upload') {
      const mediaId =
        typeof rawAudio.music.mediaId === 'string'
          ? rawAudio.music.mediaId.trim()
          : '';
      if (mediaId.length > 0) {
        music = {
          source: 'upload',
          mediaId,
          volume: clampUnitVolume(rawAudio.music.volume, DEFAULT_MUSIC_VOLUME),
          startAt:
            typeof rawAudio.music.startAt === 'number' &&
            Number.isFinite(rawAudio.music.startAt) &&
            rawAudio.music.startAt >= 0
              ? Math.round(rawAudio.music.startAt * 10) / 10
              : 0,
          loop: rawAudio.music.loop !== false,
        };
      } else {
        warnings.push('Uploaded music entry missing valid mediaId; ignored.');
      }
    } else {
      const fallbackStyle = pickDefaultMusicStyleForTheme(style, mood);
      const rawStyle = rawAudio.music.style;
      const resolvedStyle: MusicStyleName =
        typeof rawStyle === 'string' &&
        MUSIC_STYLE_NAMES.includes(rawStyle as MusicStyleName)
          ? (rawStyle as MusicStyleName)
          : fallbackStyle;
      if (rawStyle !== undefined && rawStyle !== resolvedStyle) {
        warnings.push(
          `Unknown music style "${String(rawStyle)}" replaced with "${resolvedStyle}".`
        );
      }
      const bpm = clampBpmForStyle(
        resolvedStyle,
        typeof rawAudio.music.bpm === 'number' ? rawAudio.music.bpm : undefined
      );
      const musicSeed =
        typeof rawAudio.music.seed === 'number' &&
        Number.isFinite(rawAudio.music.seed)
          ? Math.abs(Math.round(rawAudio.music.seed)) % 1000000
          : specSeed;
      music = {
        source: 'synth',
        style: resolvedStyle,
        bpm,
        seed: musicSeed,
        volume: clampUnitVolume(rawAudio.music.volume, DEFAULT_MUSIC_VOLUME),
      };
    }
  }

  let sfx: SfxMode | undefined;
  if (rawAudio.sfx !== undefined && rawAudio.sfx !== null) {
    if (
      typeof rawAudio.sfx === 'string' &&
      SFX_MODES.includes(rawAudio.sfx as SfxMode)
    ) {
      sfx = rawAudio.sfx as SfxMode;
    } else {
      warnings.push(`Unknown audio.sfx mode "${String(rawAudio.sfx)}" set to "off".`);
      sfx = 'off';
    }
  }

  const sfxVolume =
    rawAudio.sfxVolume !== undefined && rawAudio.sfxVolume !== null
      ? clampUnitVolume(rawAudio.sfxVolume, DEFAULT_SFX_VOLUME)
      : sfx && sfx !== 'off'
        ? DEFAULT_SFX_VOLUME
        : undefined;

  const mute = rawAudio.mute === true ? true : rawAudio.mute === false ? false : undefined;

  if (!music && !sfx && sfxVolume === undefined && mute === undefined) {
    return undefined;
  }

  return {
    ...(music ? { music } : {}),
    ...(sfx ? { sfx } : {}),
    ...(sfxVolume !== undefined ? { sfxVolume } : {}),
    ...(mute !== undefined ? { mute } : {}),
  };
}

/**
 * Applies default audio for newly created/directed videos:
 * - Lower-thirds and chroma-background scenes get NO audio.
 * - Prompt requests for "no sound" / "no audio" / "silent" get NO audio.
 * - Prompt requests for "no music" get SFX auto without music.
 * - Everything else gets mood-matched synth music + SFX "auto".
 */
export function applyDefaultAudioForNewSpec(
  spec: VideoSpec,
  userPrompt?: string
): VideoSpec {
  const isAllLowerThird =
    spec.scenes.length > 0 &&
    spec.scenes.every((sc) => sc.layout === 'lower-third');
  const hasChroma = spec.scenes.some((sc) => sc.bg === 'chroma');

  if (isAllLowerThird || hasChroma || hasNoSoundIntent(userPrompt)) {
    const next: VideoSpec = { ...spec };
    delete next.audio;
    return next;
  }

  // Respect if spec already explicitly has audio defined
  if (spec.audio) {
    if (hasNoMusicIntent(userPrompt) && spec.audio.music) {
      return {
        ...spec,
        audio: {
          sfx: spec.audio.sfx ?? 'auto',
          sfxVolume: spec.audio.sfxVolume ?? DEFAULT_SFX_VOLUME,
          mute: spec.audio.mute ?? false,
        },
      };
    }
    return spec;
  }

  if (hasNoMusicIntent(userPrompt)) {
    return {
      ...spec,
      audio: {
        sfx: 'auto',
        sfxVolume: DEFAULT_SFX_VOLUME,
        mute: false,
      },
    };
  }

  const musicStyle = pickDefaultMusicStyleForTheme(spec.style, spec.theme.mood);
  return {
    ...spec,
    audio: {
      music: {
        source: 'synth',
        style: musicStyle,
        bpm: clampBpmForStyle(musicStyle),
        seed: spec.seed,
        volume: DEFAULT_MUSIC_VOLUME,
      },
      sfx: 'auto',
      sfxVolume: DEFAULT_SFX_VOLUME,
      mute: false,
    },
  };
}

export interface SceneTiming {
  scene: NormalizedSceneSpec;
  index: number;
  startFrame: number;
  durationInFrames: number;
  endFrame: number;
  overlapInFrames: number;
  overlapOutFrames: number;
}

export function computeSceneTimings(spec: VideoSpec): SceneTiming[] {
  const fps = spec.fps || DEFAULT_KIT_FPS;
  const styleDef = getStyleDef(spec.style);
  const desiredOverlap = Math.max(12, Math.min(20, styleDef.transitionFrames));
  const timings: SceneTiming[] = [];
  let cursor = 0;

  const musicBpm = resolveMusicBpmFromAudio(spec.audio);
  const effectiveDurs = musicBpm
    ? snapDurationsToBeatGrid(
        spec.scenes.map((sc) => sc.dur),
        musicBpm,
        MIN_SCENE_DUR_SEC,
        MAX_SCENE_DUR_SEC
      )
    : spec.scenes.map((sc) => sc.dur);

  for (let i = 0; i < spec.scenes.length; i++) {
    const scene = spec.scenes[i];
    const effectiveDur = effectiveDurs[i] ?? scene.dur;
    const durationInFrames = Math.max(15, Math.round(effectiveDur * fps));
    const prevTiming = timings[i - 1];

    let overlapInFrames = 0;
    if (
      prevTiming &&
      scene.transition !== 'cut' &&
      scene.bg !== 'chroma' &&
      prevTiming.scene.bg !== 'chroma'
    ) {
      const maxAllowed = Math.floor(
        Math.min(prevTiming.durationInFrames, durationInFrames) / 2.4
      );
      const effectiveOverlap = Math.min(desiredOverlap, maxAllowed);
      if (effectiveOverlap >= 8) {
        overlapInFrames = effectiveOverlap;
        cursor -= overlapInFrames;
        prevTiming.overlapOutFrames = overlapInFrames;
      }
    }

    const startFrame = Math.max(0, cursor);
    const endFrame = startFrame + durationInFrames;

    timings.push({
      scene,
      index: i,
      startFrame,
      durationInFrames,
      endFrame,
      overlapInFrames,
      overlapOutFrames: 0,
    });

    cursor = endFrame;
  }

  return timings;
}

export function totalFrames(spec: VideoSpec): number {
  const timings = computeSceneTimings(spec);
  if (timings.length === 0) {
    return 1;
  }
  return Math.max(1, timings[timings.length - 1]?.endFrame ?? 1);
}

export function getSpecDimensions(spec: Pick<VideoSpec, 'format'>): {
  width: number;
  height: number;
} {
  return getDimensionsForFormat(spec.format);
}

/**
 * Flat OpenAPI 3.0 subset schema compatible with Gemini structured responseSchema.
 * Avoids $defs, $ref, oneOf, anyOf, and additionalProperties-heavy unions.
 */
export function getJsonSchema(): Record<string, unknown> {
  return {
    type: 'OBJECT',
    required: ['title', 'format', 'theme', 'scenes'],
    properties: {
      title: { type: 'STRING', nullable: false },
      format: {
        type: 'STRING',
        enum: ['9:16', '16:9', '1:1'],
        nullable: false,
      },
      style: {
        type: 'STRING',
        enum: [
          'clean',
          'editorial',
          'bold-poster',
          'neon-tech',
          'playful-pop',
          'luxe',
          'organic-soft',
        ],
        nullable: true,
      },
      intensity: {
        type: 'STRING',
        enum: ['calm', 'balanced', 'energetic'],
        nullable: true,
      },
      numerals: {
        type: 'STRING',
        enum: ['latn', 'bn'],
        nullable: true,
      },
      seed: { type: 'INTEGER', nullable: true },
      transition: {
        type: 'STRING',
        enum: [
          'fade',
          'push-left',
          'push-right',
          'push-up',
          'wipe-left',
          'wipe-up',
          'circle-reveal',
          'zoom-through',
          'color-block',
          'cut',
        ],
        nullable: true,
      },
      audio: {
        type: 'OBJECT',
        nullable: true,
        properties: {
          music: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              source: {
                type: 'STRING',
                enum: ['synth', 'upload'],
                nullable: true,
              },
              style: {
                type: 'STRING',
                enum: [
                  'lofi',
                  'corporate',
                  'upbeat-pop',
                  'cinematic',
                  'playful',
                  'tech-pulse',
                  'ambient',
                ],
                nullable: true,
              },
              bpm: { type: 'NUMBER', nullable: true },
              seed: { type: 'INTEGER', nullable: true },
              volume: { type: 'NUMBER', nullable: true },
              mediaId: { type: 'STRING', nullable: true },
              startAt: { type: 'NUMBER', nullable: true },
              loop: { type: 'BOOLEAN', nullable: true },
            },
          },
          sfx: {
            type: 'STRING',
            enum: ['auto', 'minimal', 'off'],
            nullable: true,
          },
          sfxVolume: { type: 'NUMBER', nullable: true },
          mute: { type: 'BOOLEAN', nullable: true },
        },
      },
      theme: {
        type: 'OBJECT',
        nullable: false,
        required: ['palette', 'mood'],
        properties: {
          palette: {
            type: 'STRING',
            enum: [
              'ember',
              'ocean',
              'forest',
              'noir',
              'neon',
              'sunrise',
              'lavender',
              'mono',
            ],
            nullable: false,
          },
          mood: {
            type: 'STRING',
            enum: ['bold', 'soft', 'tech', 'elegant', 'playful'],
            nullable: false,
          },
          customPalette: {
            type: 'OBJECT',
            nullable: true,
            required: ['bg', 'accent'],
            properties: {
              bg: { type: 'STRING', nullable: false },
              surface: { type: 'STRING', nullable: true },
              text: { type: 'STRING', nullable: true },
              muted: { type: 'STRING', nullable: true },
              accent: { type: 'STRING', nullable: false },
              accent2: { type: 'STRING', nullable: true },
            },
          },
        },
      },
      scenes: {
        type: 'ARRAY',
        nullable: false,
        items: {
          type: 'OBJECT',
          required: ['layout', 'dur', 'slots'],
          properties: {
            id: { type: 'STRING', nullable: true },
            layout: {
              type: 'STRING',
              enum: [
                'hook',
                'title',
                'feature',
                'stat',
                'list',
                'steps',
                'quote',
                'compare',
                'bars',
                'kinetic',
                'offer',
                'cta',
                'brand',
                'lower-third',
                'custom',
              ],
              nullable: false,
            },
            variant: {
              type: 'STRING',
              enum: ['a', 'b', 'c'],
              nullable: true,
            },
            dur: { type: 'NUMBER', nullable: false },
            bg: {
              type: 'STRING',
              enum: [
                'solid',
                'linear',
                'radial',
                'grid',
                'dots',
                'shapes',
                'chroma',
                'mesh-glow',
                'aurora',
                'stripes',
                'dots-grid',
                'rings',
                'color-blocks',
                'waves',
                'confetti',
                'sparkles',
                'lines-sweep',
                'paper',
              ],
              nullable: true,
            },
            animIn: {
              type: 'STRING',
              enum: [
                'fade',
                'fade-up',
                'fade-down',
                'slide-left',
                'slide-right',
                'pop',
                'zoom',
                'wipe',
                'type',
                'words',
                'mask-up',
                'slam',
                'drop',
                'rotate-in',
                'highlight-sweep',
                'draw',
                'none',
              ],
              nullable: true,
            },
            animOut: {
              type: 'STRING',
              enum: ['fade', 'slide', 'zoom', 'none'],
              nullable: true,
            },
            ease: {
              type: 'STRING',
              enum: ['smooth', 'snappy', 'bounce', 'cinematic'],
              nullable: true,
            },
            transition: {
              type: 'STRING',
              enum: [
                'fade',
                'push-left',
                'push-right',
                'push-up',
                'wipe-left',
                'wipe-up',
                'circle-reveal',
                'zoom-through',
                'color-block',
                'cut',
              ],
              nullable: true,
            },
            camera: {
              type: 'STRING',
              enum: ['push-in', 'pull-out', 'pan-left', 'pan-right', 'none'],
              nullable: true,
            },
            slots: {
              type: 'OBJECT',
              nullable: false,
              properties: {
                kicker: { type: 'STRING', nullable: true },
                headline: { type: 'STRING', nullable: true },
                heading: { type: 'STRING', nullable: true },
                title: { type: 'STRING', nullable: true },
                subtitle: { type: 'STRING', nullable: true },
                sub: { type: 'STRING', nullable: true },
                body: { type: 'STRING', nullable: true },
                tag: { type: 'STRING', nullable: true },
                icon: { type: 'STRING', nullable: true },
                value: { type: 'STRING', nullable: true },
                unit: { type: 'STRING', nullable: true },
                label: { type: 'STRING', nullable: true },
                delta: { type: 'STRING', nullable: true },
                quote: { type: 'STRING', nullable: true },
                author: { type: 'STRING', nullable: true },
                leftTitle: { type: 'STRING', nullable: true },
                rightTitle: { type: 'STRING', nullable: true },
                leftItems: {
                  type: 'ARRAY',
                  nullable: true,
                  items: { type: 'STRING' },
                },
                rightItems: {
                  type: 'ARRAY',
                  nullable: true,
                  items: { type: 'STRING' },
                },
                words: {
                  type: 'ARRAY',
                  nullable: true,
                  items: { type: 'STRING' },
                },
                badge: { type: 'STRING', nullable: true },
                price: { type: 'STRING', nullable: true },
                originalPrice: { type: 'STRING', nullable: true },
                details: { type: 'STRING', nullable: true },
                code: { type: 'STRING', nullable: true },
                cta: { type: 'STRING', nullable: true },
                buttonText: { type: 'STRING', nullable: true },
                url: { type: 'STRING', nullable: true },
                brandName: { type: 'STRING', nullable: true },
                tagline: { type: 'STRING', nullable: true },
                name: { type: 'STRING', nullable: true },
                role: { type: 'STRING', nullable: true },
                org: { type: 'STRING', nullable: true },
                align: { type: 'STRING', nullable: true },
                highlights: {
                  type: 'ARRAY',
                  nullable: true,
                  items: { type: 'STRING' },
                },
                items: {
                  type: 'ARRAY',
                  nullable: true,
                  items: {
                    type: 'OBJECT',
                    required: ['title'],
                    properties: {
                      title: { type: 'STRING', nullable: false },
                      detail: { type: 'STRING', nullable: true },
                      icon: { type: 'STRING', nullable: true },
                    },
                  },
                },
                data: {
                  type: 'ARRAY',
                  nullable: true,
                  items: {
                    type: 'OBJECT',
                    required: ['label', 'value'],
                    properties: {
                      label: { type: 'STRING', nullable: false },
                      value: { type: 'NUMBER', nullable: false },
                    },
                  },
                },
                blocks: {
                  type: 'ARRAY',
                  nullable: true,
                  items: {
                    type: 'OBJECT',
                    required: ['kind'],
                    properties: {
                      kind: {
                        type: 'STRING',
                        enum: [
                          'kicker',
                          'heading',
                          'body',
                          'stat',
                          'badge',
                          'cta',
                          'divider',
                        ],
                        nullable: false,
                      },
                      text: { type: 'STRING', nullable: true },
                      sub: { type: 'STRING', nullable: true },
                      icon: { type: 'STRING', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
