import { z } from 'zod';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MUSIC_STYLE_DEFS,
  type AudioSpec,
} from './audio/types';
import { pickDefaultMusicStyleForTheme } from './audio/helpers';
import { clampBpmForStyle } from './audio/music';
import { getLayoutDefinition, LAYOUT_NAMES } from './layouts/registry';
import type { LayoutName } from './layouts/types';
import {
  MAX_KIT_SCENES,
  MAX_SCENE_DUR_SEC,
  MIN_SCENE_DUR_SEC,
  MusicStyleEnumSchema,
  PartialPaletteSchema,
  SfxModeEnumSchema,
  createStableSceneId,
  normalizeVideoSpec,
  type NormalizedSceneSpec,
  type VideoSpec,
} from './spec';
import { STYLE_DEFS } from './styles';
import type {
  CameraKind,
  IntensityName,
  LayoutVariant,
  MoodName,
  PaletteName,
  StyleName,
  TransitionKind,
} from './tokens';

const SceneRefSchema = z.union([z.string().min(1), z.number().int().min(-1)]);

const LayoutEnumSchema = z.enum([
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
]);

const VariantEnumSchema = z.enum(['a', 'b', 'c']);
const StyleEnumSchema = z.enum([
  'clean',
  'editorial',
  'bold-poster',
  'neon-tech',
  'playful-pop',
  'luxe',
  'organic-soft',
]);
const PaletteEnumSchema = z.enum([
  'ember',
  'ocean',
  'forest',
  'noir',
  'neon',
  'sunrise',
  'lavender',
  'mono',
]);
const MoodEnumSchema = z.enum(['bold', 'soft', 'tech', 'elegant', 'playful']);
const IntensityEnumSchema = z.enum(['calm', 'balanced', 'energetic']);
const TransitionEnumSchema = z.enum([
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
]);
const CameraEnumSchema = z.enum([
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'none',
]);
const FormatEnumSchema = z.enum(['9:16', '16:9', '1:1']);

const NewSceneInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  layout: LayoutEnumSchema,
  variant: VariantEnumSchema.optional(),
  dur: z.number().finite().optional(),
  bg: z.string().min(1).optional(),
  animIn: z.string().min(1).optional(),
  animOut: z.string().min(1).optional(),
  ease: z.string().min(1).optional(),
  transition: TransitionEnumSchema.optional(),
  camera: CameraEnumSchema.optional(),
  slots: z.record(z.string(), z.unknown()).optional(),
});

export const OpSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('setSlot'),
    scene: SceneRefSchema,
    slot: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('setItems'),
    scene: SceneRefSchema,
    slot: z.string().min(1),
    items: z.array(z.unknown()),
  }),
  z.object({
    type: z.literal('setLayout'),
    scene: SceneRefSchema,
    layout: LayoutEnumSchema,
  }),
  z.object({
    type: z.literal('setVariant'),
    scene: SceneRefSchema,
    variant: VariantEnumSchema,
  }),
  z.object({
    type: z.literal('setDuration'),
    scene: SceneRefSchema,
    dur: z.number().finite(),
  }),
  z.object({
    type: z.literal('addScene'),
    afterScene: SceneRefSchema.optional(),
    scene: NewSceneInputSchema,
  }),
  z.object({
    type: z.literal('removeScene'),
    scene: SceneRefSchema,
  }),
  z.object({
    type: z.literal('moveScene'),
    from: SceneRefSchema,
    to: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('duplicateScene'),
    scene: SceneRefSchema,
  }),
  z.object({
    type: z.literal('setStyle'),
    style: StyleEnumSchema,
    resetSceneOverrides: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('setPalette'),
    palette: PaletteEnumSchema,
  }),
  z.object({
    type: z.literal('setCustomColors'),
    colors: PartialPaletteSchema.partial().refine(
      (c) => Object.keys(c).length > 0,
      'At least one custom color field is required.'
    ),
  }),
  z.object({
    type: z.literal('setMood'),
    mood: MoodEnumSchema,
  }),
  z.object({
    type: z.literal('setIntensity'),
    intensity: IntensityEnumSchema,
  }),
  z.object({
    type: z.literal('setTransition'),
    scope: z.enum(['global', 'scene']),
    scene: SceneRefSchema.optional(),
    transition: TransitionEnumSchema,
  }),
  z.object({
    type: z.literal('setCamera'),
    scene: SceneRefSchema,
    camera: CameraEnumSchema,
  }),
  z.object({
    type: z.literal('setSeed'),
    seed: z.number().int().min(0).max(999999),
  }),
  z.object({
    type: z.literal('setFormat'),
    format: FormatEnumSchema,
  }),
  z.object({
    type: z.literal('setTitle'),
    title: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal('setMusic'),
    source: z.enum(['synth', 'upload', 'off']).optional(),
    style: MusicStyleEnumSchema.optional(),
    bpm: z.number().finite().min(40).max(200).optional(),
    seed: z.number().int().min(0).max(999999).optional(),
    volume: z.number().finite().min(0).max(1).optional(),
    mediaId: z.string().min(1).optional(),
    startAt: z.number().finite().min(0).optional(),
    loop: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('setMusicVolume'),
    volume: z.number().finite().min(0).max(1),
  }),
  z.object({
    type: z.literal('setSfx'),
    sfx: SfxModeEnumSchema,
  }),
  z.object({
    type: z.literal('setSfxVolume'),
    volume: z.number().finite().min(0).max(1),
  }),
  z.object({
    type: z.literal('muteAudio'),
    mute: z.boolean(),
  }),
]);

export type Op = z.infer<typeof OpSchema>;
export type SceneRef = string | number;

export function getOpsSchema() {
  return z.array(OpSchema);
}

export interface OpChangeRecord {
  sceneId: string;
  summary: string;
}

export interface ApplyOpsResult {
  spec: VideoSpec;
  changes: OpChangeRecord[];
  warnings: string[];
  errors: string[];
}

export function getDefaultSlotsForLayout(
  layout: LayoutName
): Record<string, unknown> {
  switch (layout) {
    case 'hook':
      return {
        kicker: 'Highlight',
        headline: 'Hook your viewers [[in seconds]]',
        sub: 'Concise supporting line.',
        icon: 'zap',
      };
    case 'title':
      return {
        kicker: 'Chapter',
        title: 'Clean Scene Title',
        subtitle: 'Supporting subtitle text.',
      };
    case 'feature':
      return {
        kicker: 'Feature',
        title: 'Key Capability',
        body: 'Short explanation of the core benefit.',
        icon: 'sparkles',
        highlights: ['Fast setup', 'Responsive ratios'],
      };
    case 'stat':
      return {
        kicker: 'Metric',
        value: '94%',
        label: 'Completion rate',
        delta: '+22% lift',
        icon: 'trending-up',
      };
    case 'list':
      return {
        kicker: 'Summary',
        title: 'Three Key Points',
        items: [
          { title: 'First point', detail: 'Short detail' },
          { title: 'Second point', detail: 'Short detail' },
          { title: 'Third point', detail: 'Short detail' },
        ],
      };
    case 'steps':
      return {
        heading: 'Three Simple Steps',
        items: [
          { title: 'Step one', detail: 'Choose a layout' },
          { title: 'Step two', detail: 'Fill concise slots' },
          { title: 'Step three', detail: 'Export crisp MP4' },
        ],
      };
    case 'quote':
      return {
        quote: 'Design is clarity made [[visible]] in motion.',
        author: 'Design Team',
      };
    case 'compare':
      return {
        leftTitle: 'Before',
        rightTitle: 'After',
        leftItems: ['Manual tweaks', 'Inconsistent spacing'],
        rightItems: ['Structured slots', 'Locked safe margins'],
      };
    case 'bars':
      return {
        heading: 'Performance Breakdown',
        data: [
          { label: 'Stage 1', value: 42 },
          { label: 'Stage 2', value: 68 },
          { label: 'Stage 3', value: 94 },
        ],
      };
    case 'kinetic':
      return {
        words: ['FAST', 'CRISP', 'ON BRAND'],
      };
    case 'offer':
      return {
        badge: 'Limited Offer',
        headline: 'Starter Bundle',
        price: '$29',
        originalPrice: '$59',
        details: 'Cancel anytime.',
        cta: 'Get Started',
      };
    case 'cta':
      return {
        kicker: 'Next Step',
        headline: 'Create your [[next video]]',
        sub: 'Ready in minutes.',
        buttonText: 'Start Now',
        icon: 'arrow-right',
      };
    case 'brand':
      return {
        brandName: 'Studio Brand',
        tagline: 'Crafted motion graphics',
        icon: 'sparkles',
      };
    case 'lower-third':
      return {
        tag: 'HOST',
        name: 'Speaker Name',
        role: 'Motion Designer',
        icon: 'mic',
      };
    case 'custom':
    default:
      return {
        align: 'center',
        blocks: [
          { kind: 'kicker', text: 'Section' },
          { kind: 'heading', text: 'Custom Stack Heading' },
          { kind: 'body', text: 'Concise supporting text.' },
        ],
      };
  }
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MutableSceneRaw {
  id: string;
  layout: LayoutName;
  variant?: LayoutVariant;
  dur: number;
  bg?: string;
  animIn?: string;
  animOut?: string;
  ease?: string;
  transition?: TransitionKind;
  camera?: CameraKind;
  slots: Record<string, unknown>;
}

interface MutableSpecRaw {
  title: string;
  format: VideoSpec['format'];
  fps: number;
  style: StyleName;
  seed: number;
  intensity: IntensityName;
  numerals?: VideoSpec['numerals'];
  transition?: TransitionKind;
  audio?: AudioSpec;
  theme: {
    palette: PaletteName | Record<string, string>;
    mood: MoodName;
  };
  scenes: MutableSceneRaw[];
}

function toMutableRaw(spec: VideoSpec): MutableSpecRaw {
  return {
    title: spec.title,
    format: spec.format,
    fps: spec.fps,
    style: spec.style,
    seed: spec.seed,
    intensity: spec.intensity,
    ...(spec.numerals ? { numerals: spec.numerals } : {}),
    ...(spec.transition ? { transition: spec.transition } : {}),
    ...(spec.audio ? { audio: deepClone(spec.audio) } : {}),
    theme: {
      palette:
        spec.theme.paletteName === 'custom'
          ? { ...spec.theme.palette }
          : spec.theme.paletteName,
      mood: spec.theme.mood,
    },
    scenes: spec.scenes.map((sc) => ({
      id: sc.id,
      layout: sc.layout,
      variant: sc.variant,
      dur: sc.dur,
      bg: sc.bg,
      animIn: sc.animIn,
      animOut: sc.animOut,
      ease: sc.ease,
      transition: sc.transition,
      camera: sc.camera,
      slots: deepClone(sc.slots),
    })),
  };
}

function resolveSceneIndex(
  scenes: readonly MutableSceneRaw[],
  ref: SceneRef
): number {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 0 || ref >= scenes.length) {
      return -1;
    }
    return ref;
  }
  return scenes.findIndex((sc) => sc.id === ref);
}

export function applyOps(spec: VideoSpec, rawOps: readonly unknown[]): ApplyOpsResult {
  if (!Array.isArray(rawOps)) {
    return {
      spec,
      changes: [],
      warnings: [],
      errors: ['ops must be an array.'],
    };
  }

  if (rawOps.length === 0) {
    return {
      spec,
      changes: [],
      warnings: [],
      errors: [],
    };
  }

  const parsedOps: Op[] = [];
  const validationErrors: string[] = [];

  for (let i = 0; i < rawOps.length; i++) {
    const parsed = OpSchema.safeParse(rawOps[i]);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      validationErrors.push(
        `Op #${i + 1}: ${firstIssue ? `${firstIssue.path.join('.') || 'op'} ${firstIssue.message}` : 'invalid operation'}`
      );
    } else {
      parsedOps.push(parsed.data);
    }
  }

  if (validationErrors.length > 0) {
    return {
      spec,
      changes: [],
      warnings: [],
      errors: validationErrors,
    };
  }

  const draft = toMutableRaw(spec);
  const changes: OpChangeRecord[] = [];
  const warnings: string[] = [];
  const opErrors: string[] = [];

  for (let i = 0; i < parsedOps.length; i++) {
    const op = parsedOps[i];
    switch (op.type) {
      case 'setSlot': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setSlot): scene "${String(op.scene)}" not found.`);
          break;
        }
        const target = draft.scenes[idx];
        const nextSlots = { ...target.slots };
        if (op.value === undefined || op.value === null) {
          delete nextSlots[op.slot];
          changes.push({
            sceneId: target.id,
            summary: `Removed slot "${op.slot}"`,
          });
        } else {
          nextSlots[op.slot] = deepClone(op.value);
          changes.push({
            sceneId: target.id,
            summary: `Updated "${op.slot}"`,
          });
        }
        target.slots = nextSlots;
        break;
      }

      case 'setItems': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setItems): scene "${String(op.scene)}" not found.`);
          break;
        }
        const target = draft.scenes[idx];
        target.slots = {
          ...target.slots,
          [op.slot]: deepClone(op.items),
        };
        changes.push({
          sceneId: target.id,
          summary: `Updated ${op.items.length} items in "${op.slot}"`,
        });
        break;
      }

      case 'setLayout': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setLayout): scene "${String(op.scene)}" not found.`);
          break;
        }
        const target = draft.scenes[idx];
        if (!LAYOUT_NAMES.includes(op.layout)) {
          opErrors.push(`Op #${i + 1} (setLayout): unknown layout "${op.layout}".`);
          break;
        }
        const def = getLayoutDefinition(op.layout);
        const validVariants = def?.variants ?? ['a'];
        const prevLayout = target.layout;
        target.layout = op.layout;
        if (!target.variant || !validVariants.includes(target.variant)) {
          target.variant = validVariants[0] ?? 'a';
        }
        // Populate required slots only when missing
        const defaults = getDefaultSlotsForLayout(op.layout);
        const nextSlots = { ...target.slots };
        if (def) {
          for (const slotDef of def.slots) {
            if (slotDef.required && nextSlots[slotDef.name] === undefined) {
              // Bridge headline <-> title <-> heading cleanly if present
              if (
                slotDef.name === 'title' &&
                typeof nextSlots.headline === 'string'
              ) {
                nextSlots.title = nextSlots.headline;
              } else if (
                slotDef.name === 'headline' &&
                typeof nextSlots.title === 'string'
              ) {
                nextSlots.headline = nextSlots.title;
              } else if (
                slotDef.name === 'heading' &&
                typeof nextSlots.title === 'string'
              ) {
                nextSlots.heading = nextSlots.title;
              } else if (defaults[slotDef.name] !== undefined) {
                nextSlots[slotDef.name] = deepClone(defaults[slotDef.name]);
              }
            }
          }
        }
        target.slots = nextSlots;
        changes.push({
          sceneId: target.id,
          summary: `Changed layout ${prevLayout} → ${op.layout}`,
        });
        break;
      }

      case 'setVariant': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setVariant): scene "${String(op.scene)}" not found.`);
          break;
        }
        const target = draft.scenes[idx];
        const def = getLayoutDefinition(target.layout);
        const validVariants = def?.variants ?? ['a'];
        if (!validVariants.includes(op.variant)) {
          opErrors.push(
            `Op #${i + 1} (setVariant): layout "${target.layout}" does not support variant "${op.variant}".`
          );
          break;
        }
        target.variant = op.variant;
        changes.push({
          sceneId: target.id,
          summary: `Set variant to "${op.variant}"`,
        });
        break;
      }

      case 'setDuration': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setDuration): scene "${String(op.scene)}" not found.`);
          break;
        }
        const clamped = Math.max(
          MIN_SCENE_DUR_SEC,
          Math.min(MAX_SCENE_DUR_SEC, Math.round(op.dur * 10) / 10)
        );
        if (clamped !== Math.round(op.dur * 10) / 10) {
          warnings.push(
            `Scene ${idx + 1}: clamped duration ${op.dur}s to ${clamped}s.`
          );
        }
        const target = draft.scenes[idx];
        target.dur = clamped;
        changes.push({
          sceneId: target.id,
          summary: `Set duration to ${clamped}s`,
        });
        break;
      }

      case 'addScene': {
        if (draft.scenes.length >= MAX_KIT_SCENES) {
          opErrors.push(
            `Op #${i + 1} (addScene): maximum scene count (${MAX_KIT_SCENES}) reached.`
          );
          break;
        }
        let insertIndex = draft.scenes.length;
        if (op.afterScene !== undefined) {
          if (op.afterScene === -1) {
            insertIndex = 0;
          } else {
            const refIdx = resolveSceneIndex(draft.scenes, op.afterScene);
            if (refIdx < 0) {
              opErrors.push(
                `Op #${i + 1} (addScene): afterScene "${String(op.afterScene)}" not found.`
              );
              break;
            }
            insertIndex = refIdx + 1;
          }
        }
        const newId =
          op.scene.id && !draft.scenes.some((s) => s.id === op.scene.id)
            ? op.scene.id
            : createStableSceneId(draft.scenes.map((s) => s.id));
        const def = getLayoutDefinition(op.scene.layout);
        const defaultDur = def?.defaultDurationSec ?? 3.5;
        const nextScene: MutableSceneRaw = {
          id: newId,
          layout: op.scene.layout,
          ...(op.scene.variant ? { variant: op.scene.variant } : {}),
          dur: op.scene.dur ?? defaultDur,
          ...(op.scene.bg ? { bg: op.scene.bg } : {}),
          ...(op.scene.animIn ? { animIn: op.scene.animIn } : {}),
          ...(op.scene.animOut ? { animOut: op.scene.animOut } : {}),
          ...(op.scene.ease ? { ease: op.scene.ease } : {}),
          ...(op.scene.transition ? { transition: op.scene.transition } : {}),
          ...(op.scene.camera ? { camera: op.scene.camera } : {}),
          slots:
            op.scene.slots && Object.keys(op.scene.slots).length > 0
              ? deepClone(op.scene.slots)
              : getDefaultSlotsForLayout(op.scene.layout),
        };
        draft.scenes.splice(insertIndex, 0, nextScene);
        changes.push({
          sceneId: newId,
          summary: `Added "${op.scene.layout}" scene at #${insertIndex + 1}`,
        });
        break;
      }

      case 'removeScene': {
        if (draft.scenes.length <= 1) {
          opErrors.push(
            `Op #${i + 1} (removeScene): cannot remove the only remaining scene.`
          );
          break;
        }
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (removeScene): scene "${String(op.scene)}" not found.`);
          break;
        }
        const [removed] = draft.scenes.splice(idx, 1);
        changes.push({
          sceneId: removed.id,
          summary: `Removed scene "${removed.layout}" (#${idx + 1})`,
        });
        break;
      }

      case 'moveScene': {
        const fromIdx = resolveSceneIndex(draft.scenes, op.from);
        if (fromIdx < 0) {
          opErrors.push(`Op #${i + 1} (moveScene): source "${String(op.from)}" not found.`);
          break;
        }
        if (op.to < 0 || op.to >= draft.scenes.length) {
          opErrors.push(
            `Op #${i + 1} (moveScene): target index ${op.to} out of range (0..${draft.scenes.length - 1}).`
          );
          break;
        }
        const [moved] = draft.scenes.splice(fromIdx, 1);
        draft.scenes.splice(op.to, 0, moved);
        changes.push({
          sceneId: moved.id,
          summary: `Moved scene #${fromIdx + 1} → #${op.to + 1}`,
        });
        break;
      }

      case 'duplicateScene': {
        if (draft.scenes.length >= MAX_KIT_SCENES) {
          opErrors.push(
            `Op #${i + 1} (duplicateScene): maximum scene count (${MAX_KIT_SCENES}) reached.`
          );
          break;
        }
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(
            `Op #${i + 1} (duplicateScene): scene "${String(op.scene)}" not found.`
          );
          break;
        }
        const src = draft.scenes[idx];
        const copyId = createStableSceneId(draft.scenes.map((s) => s.id));
        const copy: MutableSceneRaw = {
          ...deepClone(src),
          id: copyId,
        };
        draft.scenes.splice(idx + 1, 0, copy);
        changes.push({
          sceneId: copyId,
          summary: `Duplicated scene #${idx + 1} (${src.layout})`,
        });
        break;
      }

      case 'setStyle': {
        draft.style = op.style;
        const styleDef = STYLE_DEFS[op.style];
        if (op.resetSceneOverrides) {
          draft.theme.mood = styleDef.defaultMood;
          draft.scenes = draft.scenes.map((sc) => ({
            id: sc.id,
            layout: sc.layout,
            dur: sc.dur,
            ...(sc.bg === 'chroma' ? { bg: 'chroma' } : {}),
            slots: sc.slots,
          }));
        }
        changes.push({
          sceneId: 'global',
          summary: `Set style to "${styleDef.label}"`,
        });
        break;
      }

      case 'setPalette': {
        draft.theme.palette = op.palette;
        changes.push({
          sceneId: 'global',
          summary: `Set palette to "${op.palette}"`,
        });
        break;
      }

      case 'setCustomColors': {
        const basePalette =
          typeof draft.theme.palette === 'string'
            ? { ...spec.theme.palette }
            : { ...draft.theme.palette };
        const merged: Record<string, string> = { ...basePalette };
        for (const [key, val] of Object.entries(op.colors)) {
          if (typeof val === 'string' && val.trim().length > 0) {
            merged[key] = val.trim();
          }
        }
        draft.theme.palette = merged;
        changes.push({
          sceneId: 'global',
          summary: `Updated custom palette colors`,
        });
        break;
      }

      case 'setMood': {
        draft.theme.mood = op.mood;
        changes.push({
          sceneId: 'global',
          summary: `Set mood to "${op.mood}"`,
        });
        break;
      }

      case 'setIntensity': {
        draft.intensity = op.intensity;
        changes.push({
          sceneId: 'global',
          summary: `Set intensity to "${op.intensity}"`,
        });
        break;
      }

      case 'setTransition': {
        if (op.scope === 'global') {
          draft.transition = op.transition;
          for (const sc of draft.scenes) {
            sc.transition = op.transition;
          }
          changes.push({
            sceneId: 'global',
            summary: `Set global transition to "${op.transition}"`,
          });
        } else {
          if (op.scene === undefined) {
            opErrors.push(
              `Op #${i + 1} (setTransition): "scene" is required when scope is "scene".`
            );
            break;
          }
          const idx = resolveSceneIndex(draft.scenes, op.scene);
          if (idx < 0) {
            opErrors.push(
              `Op #${i + 1} (setTransition): scene "${String(op.scene)}" not found.`
            );
            break;
          }
          draft.scenes[idx].transition = op.transition;
          changes.push({
            sceneId: draft.scenes[idx].id,
            summary: `Set transition to "${op.transition}"`,
          });
        }
        break;
      }

      case 'setCamera': {
        const idx = resolveSceneIndex(draft.scenes, op.scene);
        if (idx < 0) {
          opErrors.push(`Op #${i + 1} (setCamera): scene "${String(op.scene)}" not found.`);
          break;
        }
        draft.scenes[idx].camera = op.camera;
        changes.push({
          sceneId: draft.scenes[idx].id,
          summary: `Set camera to "${op.camera}"`,
        });
        break;
      }

      case 'setSeed': {
        draft.seed = op.seed;
        changes.push({
          sceneId: 'global',
          summary: `Set seed to ${op.seed}`,
        });
        break;
      }

      case 'setFormat': {
        draft.format = op.format;
        changes.push({
          sceneId: 'global',
          summary: `Set format to "${op.format}"`,
        });
        break;
      }

      case 'setTitle': {
        draft.title = op.title.trim();
        changes.push({
          sceneId: 'global',
          summary: `Set title to "${draft.title}"`,
        });
        break;
      }

      case 'setMusic': {
        const currentAudio: AudioSpec = draft.audio ? { ...draft.audio } : {};
        if (op.source === 'off') {
          delete currentAudio.music;
          draft.audio = currentAudio;
          changes.push({
            sceneId: 'global',
            summary: 'Turned off background music',
          });
          break;
        }
        if (op.source === 'upload' || op.mediaId) {
          if (!op.mediaId) {
            opErrors.push(
              `Op #${i + 1} (setMusic): "mediaId" is required when source is "upload".`
            );
            break;
          }
          const prevVol =
            currentAudio.music?.volume ?? DEFAULT_MUSIC_VOLUME;
          currentAudio.music = {
            source: 'upload',
            mediaId: op.mediaId,
            volume: op.volume ?? prevVol,
            startAt: op.startAt ?? 0,
            loop: op.loop ?? true,
          };
          draft.audio = {
            ...currentAudio,
            mute: currentAudio.mute ?? false,
          };
          changes.push({
            sceneId: 'global',
            summary: 'Set uploaded background music',
          });
          break;
        }
        const styleToUse =
          op.style ??
          (currentAudio.music && currentAudio.music.source !== 'upload'
            ? currentAudio.music.style
            : pickDefaultMusicStyleForTheme(
                draft.style,
                draft.theme.mood
              ));
        const prevVol =
          currentAudio.music?.volume ?? DEFAULT_MUSIC_VOLUME;
        const resolvedBpm = clampBpmForStyle(
          styleToUse,
          op.bpm ??
            (currentAudio.music &&
            currentAudio.music.source !== 'upload' &&
            currentAudio.music.style === styleToUse
              ? currentAudio.music.bpm
              : undefined)
        );
        const resolvedSeed =
          op.seed ??
          (currentAudio.music && currentAudio.music.source !== 'upload'
            ? currentAudio.music.seed ?? draft.seed
            : draft.seed);
        currentAudio.music = {
          source: 'synth',
          style: styleToUse,
          bpm: resolvedBpm,
          seed: resolvedSeed,
          volume: op.volume ?? prevVol,
        };
        draft.audio = {
          ...currentAudio,
          mute: currentAudio.mute ?? false,
        };
        changes.push({
          sceneId: 'global',
          summary: `Set music style to "${MUSIC_STYLE_DEFS[styleToUse].label}"`,
        });
        break;
      }

      case 'setMusicVolume': {
        const clamped = Math.max(0, Math.min(1, Math.round(op.volume * 100) / 100));
        const currentAudio: AudioSpec = draft.audio ? { ...draft.audio } : {};
        if (currentAudio.music) {
          currentAudio.music = {
            ...currentAudio.music,
            volume: clamped,
          };
        } else {
          const styleToUse = pickDefaultMusicStyleForTheme(
            draft.style,
            draft.theme.mood
          );
          currentAudio.music = {
            source: 'synth',
            style: styleToUse,
            bpm: clampBpmForStyle(styleToUse),
            seed: draft.seed,
            volume: clamped,
          };
        }
        draft.audio = currentAudio;
        changes.push({
          sceneId: 'global',
          summary: `Set music volume to ${Math.round(clamped * 100)}%`,
        });
        break;
      }

      case 'setSfx': {
        const currentAudio: AudioSpec = draft.audio ? { ...draft.audio } : {};
        currentAudio.sfx = op.sfx;
        if (op.sfx !== 'off' && currentAudio.sfxVolume === undefined) {
          currentAudio.sfxVolume = DEFAULT_SFX_VOLUME;
        }
        draft.audio = currentAudio;
        changes.push({
          sceneId: 'global',
          summary: `Set sound effects to "${op.sfx}"`,
        });
        break;
      }

      case 'setSfxVolume': {
        const clamped = Math.max(0, Math.min(1, Math.round(op.volume * 100) / 100));
        const currentAudio: AudioSpec = draft.audio ? { ...draft.audio } : {};
        currentAudio.sfxVolume = clamped;
        draft.audio = currentAudio;
        changes.push({
          sceneId: 'global',
          summary: `Set sound effects volume to ${Math.round(clamped * 100)}%`,
        });
        break;
      }

      case 'muteAudio': {
        const currentAudio: AudioSpec = draft.audio ? { ...draft.audio } : {};
        currentAudio.mute = op.mute;
        draft.audio = currentAudio;
        changes.push({
          sceneId: 'global',
          summary: op.mute ? 'Muted video audio' : 'Unmuted video audio',
        });
        break;
      }
    }
  }

  // Atomic check: if any op failed, discard all partial mutations
  if (opErrors.length > 0) {
    return {
      spec,
      changes: [],
      warnings: [],
      errors: opErrors,
    };
  }

  const normalized = normalizeVideoSpec(draft);
  if (!normalized.ok) {
    return {
      spec,
      changes: [],
      warnings: [],
      errors: normalized.errors,
    };
  }

  return {
    spec: normalized.spec,
    changes,
    warnings: [...warnings, ...normalized.warnings],
    errors: [],
  };
}

/**
 * Flat OpenAPI 3.0 subset JSON Schema for the Motion Kit Ops API (Gemini-compatible).
 */
export function getOpsJsonSchema(): Record<string, unknown> {
  return {
    type: 'OBJECT',
    required: ['ops'],
    properties: {
      ops: {
        type: 'ARRAY',
        nullable: false,
        items: {
          type: 'OBJECT',
          required: ['type'],
          properties: {
            type: {
              type: 'STRING',
              nullable: false,
              enum: [
                'setSlot',
                'setItems',
                'setLayout',
                'setVariant',
                'setDuration',
                'addScene',
                'removeScene',
                'moveScene',
                'duplicateScene',
                'setStyle',
                'setPalette',
                'setCustomColors',
                'setMood',
                'setIntensity',
                'setTransition',
                'setCamera',
                'setSeed',
                'setFormat',
                'setTitle',
                'setMusic',
                'setMusicVolume',
                'setSfx',
                'setSfxVolume',
                'muteAudio',
              ],
            },
            scene: { type: 'STRING', nullable: true },
            afterScene: { type: 'STRING', nullable: true },
            from: { type: 'STRING', nullable: true },
            to: { type: 'INTEGER', nullable: true },
            slot: { type: 'STRING', nullable: true },
            value: { type: 'STRING', nullable: true },
            items: {
              type: 'ARRAY',
              nullable: true,
              items: { type: 'STRING' },
            },
            layout: {
              type: 'STRING',
              nullable: true,
              enum: LAYOUT_NAMES,
            },
            variant: {
              type: 'STRING',
              nullable: true,
              enum: ['a', 'b', 'c'],
            },
            dur: { type: 'NUMBER', nullable: true },
            style: {
              type: 'STRING',
              nullable: true,
              enum: [
                'clean',
                'editorial',
                'bold-poster',
                'neon-tech',
                'playful-pop',
                'luxe',
                'organic-soft',
                'lofi',
                'corporate',
                'upbeat-pop',
                'cinematic',
                'playful',
                'tech-pulse',
                'ambient',
              ],
            },
            resetSceneOverrides: { type: 'BOOLEAN', nullable: true },
            palette: {
              type: 'STRING',
              nullable: true,
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
            },
            colors: {
              type: 'OBJECT',
              nullable: true,
              properties: {
                bg: { type: 'STRING', nullable: true },
                surface: { type: 'STRING', nullable: true },
                text: { type: 'STRING', nullable: true },
                muted: { type: 'STRING', nullable: true },
                accent: { type: 'STRING', nullable: true },
                accent2: { type: 'STRING', nullable: true },
              },
            },
            mood: {
              type: 'STRING',
              nullable: true,
              enum: ['bold', 'soft', 'tech', 'elegant', 'playful'],
            },
            intensity: {
              type: 'STRING',
              nullable: true,
              enum: ['calm', 'balanced', 'energetic'],
            },
            scope: {
              type: 'STRING',
              nullable: true,
              enum: ['global', 'scene'],
            },
            transition: {
              type: 'STRING',
              nullable: true,
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
            },
            camera: {
              type: 'STRING',
              nullable: true,
              enum: ['push-in', 'pull-out', 'pan-left', 'pan-right', 'none'],
            },
            seed: { type: 'INTEGER', nullable: true },
            format: {
              type: 'STRING',
              nullable: true,
              enum: ['9:16', '16:9', '1:1'],
            },
            title: { type: 'STRING', nullable: true },
            source: {
              type: 'STRING',
              nullable: true,
              enum: ['synth', 'upload', 'off'],
            },
            bpm: { type: 'NUMBER', nullable: true },
            volume: { type: 'NUMBER', nullable: true },
            mediaId: { type: 'STRING', nullable: true },
            startAt: { type: 'NUMBER', nullable: true },
            loop: { type: 'BOOLEAN', nullable: true },
            sfx: {
              type: 'STRING',
              nullable: true,
              enum: ['auto', 'minimal', 'off'],
            },
            mute: { type: 'BOOLEAN', nullable: true },
          },
        },
      },
    },
  };
}

export function describeOpsForAI(): string {
  return [
    'MOTION KIT REVISION OPS:',
    '- setSlot { scene, slot, value }: edit text or icon slot on a scene.',
    '- setItems { scene, slot, items }: replace list/steps/leftItems/rightItems/highlights/words/data.',
    '- setLayout { scene, layout }, setVariant { scene, variant }, setDuration { scene, dur }.',
    '- addScene { afterScene?, scene }, removeScene { scene }, moveScene { from, to }, duplicateScene { scene }.',
    '- setStyle { style, resetSceneOverrides? }, setPalette { palette }, setCustomColors { colors }, setMood { mood }, setIntensity { intensity }.',
    '- setTransition { scope: "global"|"scene", scene?, transition }, setCamera { scene, camera }, setSeed { seed }, setFormat { format }, setTitle { title }.',
    '- setMusic { source?: "synth"|"upload"|"off", style?: lofi|corporate|upbeat-pop|cinematic|playful|tech-pulse|ambient, bpm?, seed?, volume? (0..1), mediaId?, startAt?, loop? }.',
    '- setMusicVolume { volume (0..1) }, setSfx { sfx: "auto"|"minimal"|"off" }, setSfxVolume { volume (0..1) }, muteAudio { mute: boolean }.',
  ].join('\n');
}

export function findSceneByRef(
  spec: VideoSpec,
  ref: SceneRef
): { scene: NormalizedSceneSpec; index: number } | null {
  if (typeof ref === 'number') {
    const sc = spec.scenes[ref];
    return sc ? { scene: sc, index: ref } : null;
  }
  const idx = spec.scenes.findIndex((s) => s.id === ref);
  if (idx < 0) {
    return null;
  }
  return { scene: spec.scenes[idx], index: idx };
}
