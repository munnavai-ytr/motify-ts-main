import type { AnimAmbientPreset, AnimInPreset } from './anim';
import {
  hexToRgba,
  type BgKind,
  type CameraKind,
  type DecorKind,
  type FontRole,
  type HighlightStyle,
  type IntensityName,
  type MoodName,
  type PaletteName,
  type StyleName,
  type TransitionKind,
} from './tokens';

export type BorderStyleMode = 'none' | 'hairline' | 'thick';
export type ShadowStyleMode = 'none' | 'soft' | 'hard-offset' | 'glow';

export interface StyleDef {
  name: StyleName;
  label: string;
  description: string;
  titleFontRole: FontRole;
  bodyFontRole: FontRole;
  titleWeight: number;
  bodyWeight: number;
  tracking: string;
  uppercaseHeadings: boolean;
  uppercaseKickers: boolean;
  radiusScale: number;
  borderMode: BorderStyleMode;
  borderWidth: number;
  shadowMode: ShadowStyleMode;
  highlightStyle: HighlightStyle;
  bgRecipes: readonly BgKind[];
  decorPieces: readonly DecorKind[];
  headlineEntrances: readonly AnimInPreset[];
  bodyEntrances: readonly AnimInPreset[];
  accentEntrances: readonly AnimInPreset[];
  emphasis: AnimAmbientPreset;
  transitions: readonly TransitionKind[];
  transitionFrames: number;
  cameras: readonly CameraKind[];
  defaultPalette: PaletteName;
  defaultMood: MoodName;
  cutDurationSec: Record<IntensityName, number>;
}

export const STYLE_DEFS: Record<StyleName, StyleDef> = {
  clean: {
    name: 'clean',
    label: 'Clean',
    description: 'Balanced modern motion graphics with soft depth and crisp contrast.',
    titleFontRole: 'display',
    bodyFontRole: 'display',
    titleWeight: 800,
    bodyWeight: 500,
    tracking: '-0.025em',
    uppercaseHeadings: false,
    uppercaseKickers: true,
    radiusScale: 1.0,
    borderMode: 'hairline',
    borderWidth: 1.5,
    shadowMode: 'soft',
    highlightStyle: 'underline',
    bgRecipes: ['linear', 'radial', 'mesh-glow', 'dots-grid', 'grid'],
    decorPieces: ['hairline-rule', 'corner-brackets', 'ring', 'dot-cluster'],
    headlineEntrances: ['fade-up', 'mask-up', 'pop'],
    bodyEntrances: ['fade-up', 'fade'],
    accentEntrances: ['pop', 'draw'],
    emphasis: 'pulse',
    transitions: ['fade', 'push-left', 'wipe-left', 'circle-reveal'],
    transitionFrames: 14,
    cameras: ['push-in', 'pull-out', 'none'],
    defaultPalette: 'ember',
    defaultMood: 'bold',
    cutDurationSec: { calm: 4.2, balanced: 3.0, energetic: 2.2 },
  },
  editorial: {
    name: 'editorial',
    label: 'Editorial',
    description: 'Serif magazine typography, hairline rules, index stamps, slow dissolves.',
    titleFontRole: 'serif',
    bodyFontRole: 'display',
    titleWeight: 700,
    bodyWeight: 400,
    tracking: '-0.015em',
    uppercaseHeadings: false,
    uppercaseKickers: true,
    radiusScale: 0.35,
    borderMode: 'hairline',
    borderWidth: 1,
    shadowMode: 'none',
    highlightStyle: 'underline',
    bgRecipes: ['paper', 'linear', 'radial', 'lines-sweep', 'rings'],
    decorPieces: ['hairline-rule', 'index-number', 'corner-brackets', 'frame-draw'],
    headlineEntrances: ['mask-up', 'fade', 'highlight-sweep'],
    bodyEntrances: ['fade-up', 'fade'],
    accentEntrances: ['draw', 'fade'],
    emphasis: 'none',
    transitions: ['fade', 'wipe-up', 'wipe-left', 'cut'],
    transitionFrames: 18,
    cameras: ['push-in', 'pull-out', 'none'],
    defaultPalette: 'sunrise',
    defaultMood: 'elegant',
    cutDurationSec: { calm: 4.8, balanced: 3.6, energetic: 2.6 },
  },
  'bold-poster': {
    name: 'bold-poster',
    label: 'Bold Poster',
    description: 'High-impact geometric blocks, thick borders, hard offset shadows, punchy slams.',
    titleFontRole: 'display',
    bodyFontRole: 'display',
    titleWeight: 800,
    bodyWeight: 600,
    tracking: '-0.03em',
    uppercaseHeadings: true,
    uppercaseKickers: true,
    radiusScale: 0.25,
    borderMode: 'thick',
    borderWidth: 3,
    shadowMode: 'hard-offset',
    highlightStyle: 'box',
    bgRecipes: ['color-blocks', 'stripes', 'lines-sweep', 'solid', 'shapes'],
    decorPieces: ['arrow', 'index-number', 'diamond', 'frame-draw'],
    headlineEntrances: ['slam', 'mask-up', 'rotate-in'],
    bodyEntrances: ['slide-left', 'fade-up'],
    accentEntrances: ['slam', 'pop'],
    emphasis: 'shake',
    transitions: ['push-left', 'color-block', 'push-up', 'cut'],
    transitionFrames: 12,
    cameras: ['push-in', 'pan-left', 'pan-right'],
    defaultPalette: 'ember',
    defaultMood: 'bold',
    cutDurationSec: { calm: 3.4, balanced: 2.5, energetic: 1.8 },
  },
  'neon-tech': {
    name: 'neon-tech',
    label: 'Neon Tech',
    description: 'Space Grotesk technical display, glowing edges, grids, zooms, and sweeps.',
    titleFontRole: 'tech',
    bodyFontRole: 'display',
    titleWeight: 700,
    bodyWeight: 500,
    tracking: '-0.025em',
    uppercaseHeadings: false,
    uppercaseKickers: true,
    radiusScale: 0.6,
    borderMode: 'hairline',
    borderWidth: 1.5,
    shadowMode: 'glow',
    highlightStyle: 'color',
    bgRecipes: ['grid', 'dots-grid', 'mesh-glow', 'aurora', 'rings'],
    decorPieces: ['corner-brackets', 'frame-draw', 'diamond', 'dot-cluster'],
    headlineEntrances: ['wipe', 'mask-up', 'slam'],
    bodyEntrances: ['fade-up', 'type'],
    accentEntrances: ['draw', 'pop'],
    emphasis: 'glow-breathe',
    transitions: ['zoom-through', 'wipe-left', 'push-left', 'cut'],
    transitionFrames: 14,
    cameras: ['push-in', 'pan-left', 'pull-out'],
    defaultPalette: 'neon',
    defaultMood: 'tech',
    cutDurationSec: { calm: 3.8, balanced: 2.8, energetic: 2.0 },
  },
  'playful-pop': {
    name: 'playful-pop',
    label: 'Playful Pop',
    description: 'Bouncy rounded cards, squiggles, confetti sparkles, and cheerful pops.',
    titleFontRole: 'friendly',
    bodyFontRole: 'friendly',
    titleWeight: 800,
    bodyWeight: 600,
    tracking: '-0.015em',
    uppercaseHeadings: false,
    uppercaseKickers: true,
    radiusScale: 1.85,
    borderMode: 'thick',
    borderWidth: 2.5,
    shadowMode: 'hard-offset',
    highlightStyle: 'marker',
    bgRecipes: ['confetti', 'sparkles', 'shapes', 'color-blocks', 'dots'],
    decorPieces: ['squiggle', 'sparkle-cluster', 'blob', 'dot-cluster'],
    headlineEntrances: ['pop', 'drop', 'rotate-in'],
    bodyEntrances: ['pop', 'fade-up'],
    accentEntrances: ['drop', 'pop'],
    emphasis: 'shine',
    transitions: ['circle-reveal', 'push-up', 'color-block', 'push-right'],
    transitionFrames: 14,
    cameras: ['pull-out', 'pan-right', 'push-in'],
    defaultPalette: 'lavender',
    defaultMood: 'playful',
    cutDurationSec: { calm: 3.6, balanced: 2.7, energetic: 1.9 },
  },
  luxe: {
    name: 'luxe',
    label: 'Luxe',
    description: 'High-contrast serif display, delicate gold framing, serene aurora depth.',
    titleFontRole: 'serif',
    bodyFontRole: 'display',
    titleWeight: 700,
    bodyWeight: 400,
    tracking: '0em',
    uppercaseHeadings: false,
    uppercaseKickers: true,
    radiusScale: 0.45,
    borderMode: 'hairline',
    borderWidth: 1,
    shadowMode: 'glow',
    highlightStyle: 'color',
    bgRecipes: ['aurora', 'radial', 'rings', 'mesh-glow', 'linear'],
    decorPieces: ['frame-draw', 'diamond', 'hairline-rule', 'ring'],
    headlineEntrances: ['fade', 'mask-up', 'highlight-sweep'],
    bodyEntrances: ['fade', 'fade-up'],
    accentEntrances: ['draw', 'fade'],
    emphasis: 'shine',
    transitions: ['fade', 'wipe-up', 'circle-reveal'],
    transitionFrames: 20,
    cameras: ['push-in', 'pull-out', 'none'],
    defaultPalette: 'noir',
    defaultMood: 'elegant',
    cutDurationSec: { calm: 5.0, balanced: 3.8, energetic: 2.8 },
  },
  'organic-soft': {
    name: 'organic-soft',
    label: 'Organic Soft',
    description: 'Warm tactile paper, layered flowing waves, rounded cards, gentle motion.',
    titleFontRole: 'friendly',
    bodyFontRole: 'display',
    titleWeight: 700,
    bodyWeight: 400,
    tracking: '-0.015em',
    uppercaseHeadings: false,
    uppercaseKickers: false,
    radiusScale: 1.65,
    borderMode: 'none',
    borderWidth: 1,
    shadowMode: 'soft',
    highlightStyle: 'marker',
    bgRecipes: ['waves', 'paper', 'mesh-glow', 'aurora', 'radial'],
    decorPieces: ['blob', 'ring', 'squiggle', 'dot-cluster'],
    headlineEntrances: ['mask-up', 'fade-up', 'words'],
    bodyEntrances: ['fade-up', 'fade'],
    accentEntrances: ['fade', 'pop'],
    emphasis: 'pulse',
    transitions: ['fade', 'circle-reveal', 'wipe-up', 'push-right'],
    transitionFrames: 16,
    cameras: ['pull-out', 'pan-left', 'none'],
    defaultPalette: 'forest',
    defaultMood: 'soft',
    cutDurationSec: { calm: 4.5, balanced: 3.4, energetic: 2.5 },
  },
};

export const STYLE_NAMES = Object.keys(STYLE_DEFS) as StyleName[];

export function getStyleDef(name?: string): StyleDef {
  if (name && name in STYLE_DEFS) {
    return STYLE_DEFS[name as StyleName];
  }
  return STYLE_DEFS.clean;
}

export function getStyleCardShadow(
  style: StyleDef,
  accentHex: string,
  textHex: string,
  glowBoost: number = 0
): string {
  switch (style.shadowMode) {
    case 'none':
      return 'none';
    case 'hard-offset':
      return `8px 8px 0px ${hexToRgba(accentHex, 0.85)}`;
    case 'glow': {
      const alpha = Math.min(0.55, 0.24 + glowBoost);
      return `0 16px 42px ${hexToRgba(accentHex, alpha)}, 0 6px 18px ${hexToRgba(textHex, 0.08)}`;
    }
    case 'soft':
    default:
      return '0 20px 46px rgba(0, 0, 0, 0.24)';
  }
}

export function getStyleCardBorder(
  style: StyleDef,
  accentHex: string,
  textHex: string,
  emphasized: boolean = false
): string {
  if (style.borderMode === 'none') {
    return 'none';
  }
  const color = emphasized
    ? accentHex
    : style.borderMode === 'thick'
      ? hexToRgba(textHex, 0.85)
      : hexToRgba(accentHex, 0.36);
  return `${style.borderWidth}px solid ${color}`;
}

export function describeStylesForAI(): string {
  const lines = STYLE_NAMES.map((name) => {
    const s = STYLE_DEFS[name];
    return [
      `- ${s.name} ("${s.label}"): ${s.description}`,
      `  font=${s.titleFontRole}/${s.bodyFontRole}, highlight=${s.highlightStyle}, border=${s.borderMode}, shadow=${s.shadowMode}`,
      `  defaultPalette=${s.defaultPalette}, defaultMood=${s.defaultMood}`,
      `  bgRecipes=[${s.bgRecipes.join(', ')}], transitions=[${s.transitions.join(', ')}], cameras=[${s.cameras.join(', ')}]`,
      `  cutSec(calm/bal/fast)=${s.cutDurationSec.calm}/${s.cutDurationSec.balanced}/${s.cutDurationSec.energetic}s`,
    ].join('\n');
  });
  return ['Visual Styles (top-level "style"):', ...lines].join('\n');
}

