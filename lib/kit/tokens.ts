import type { VideoFormat } from '@/lib/types';

export type PaletteName =
  | 'ember'
  | 'ocean'
  | 'forest'
  | 'noir'
  | 'neon'
  | 'sunrise'
  | 'lavender'
  | 'mono';

export type MoodName = 'bold' | 'soft' | 'tech' | 'elegant' | 'playful';

export type StyleName =
  | 'clean'
  | 'editorial'
  | 'bold-poster'
  | 'neon-tech'
  | 'playful-pop'
  | 'luxe'
  | 'organic-soft';

export type IntensityName = 'calm' | 'balanced' | 'energetic';

export type NumeralSystem = 'latn' | 'bn';

export type LayoutVariant = 'a' | 'b' | 'c';

export type TransitionKind =
  | 'fade'
  | 'push-left'
  | 'push-right'
  | 'push-up'
  | 'wipe-left'
  | 'wipe-up'
  | 'circle-reveal'
  | 'zoom-through'
  | 'color-block'
  | 'cut';

export type CameraKind =
  | 'push-in'
  | 'pull-out'
  | 'pan-left'
  | 'pan-right'
  | 'none';

export type FontRole = 'display' | 'tech' | 'serif' | 'friendly';

export type BgKind =
  | 'solid'
  | 'linear'
  | 'radial'
  | 'grid'
  | 'dots'
  | 'shapes'
  | 'chroma'
  | 'mesh-glow'
  | 'aurora'
  | 'stripes'
  | 'dots-grid'
  | 'rings'
  | 'color-blocks'
  | 'waves'
  | 'confetti'
  | 'sparkles'
  | 'lines-sweep'
  | 'paper';

export type DecorKind =
  | 'corner-brackets'
  | 'frame-draw'
  | 'hairline-rule'
  | 'index-number'
  | 'squiggle'
  | 'sparkle-cluster'
  | 'diamond'
  | 'blob'
  | 'arrow'
  | 'ring'
  | 'dot-cluster';

export type HighlightStyle = 'marker' | 'underline' | 'box' | 'color';

export interface KitPalette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  onAccent: string;
  onAccent2: string;
}

export interface PartialKitPalette {
  bg: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent: string;
  accent2?: string;
  onAccent?: string;
  onAccent2?: string;
}

export interface MoodToken {
  name: MoodName;
  titleWeight: number;
  bodyWeight: number;
  tracking: string;
  radiusScale: number;
  borderWidth: number;
  surfaceAlpha: number;
  defaultAnimIn:
    | 'fade'
    | 'fade-up'
    | 'fade-down'
    | 'slide-left'
    | 'slide-right'
    | 'pop'
    | 'zoom'
    | 'wipe';
  defaultAnimOut: 'fade' | 'slide' | 'zoom' | 'none';
  defaultEase: 'smooth' | 'snappy' | 'bounce' | 'cinematic';
  defaultBg: BgKind;
  titleFontRole: FontRole;
  bodyFontRole: FontRole;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const PALETTES: Record<PaletteName, KitPalette> = {
  ember: {
    bg: '#0E0B10',
    surface: '#19141E',
    text: '#F8F4EE',
    muted: '#B6ACBD',
    accent: '#FF5A36',
    accent2: '#FFB84D',
    onAccent: '#0E0B10',
    onAccent2: '#0E0B10',
  },
  ocean: {
    bg: '#071422',
    surface: '#10243A',
    text: '#EFF6FF',
    muted: '#9AB4D0',
    accent: '#22D3EE',
    accent2: '#60A5FA',
    onAccent: '#071422',
    onAccent2: '#071422',
  },
  forest: {
    bg: '#081611',
    surface: '#112820',
    text: '#F0F9F4',
    muted: '#9DBCB0',
    accent: '#34D399',
    accent2: '#A3E635',
    onAccent: '#081611',
    onAccent2: '#081611',
  },
  noir: {
    bg: '#09090B',
    surface: '#16161B',
    text: '#FAFAFA',
    muted: '#A1A1AA',
    accent: '#F59E0B',
    accent2: '#E4E4E7',
    onAccent: '#09090B',
    onAccent2: '#09090B',
  },
  neon: {
    bg: '#0B0718',
    surface: '#161030',
    text: '#F7F6FF',
    muted: '#B0A6D6',
    accent: '#00E5FF',
    accent2: '#A3FF12',
    onAccent: '#0B0718',
    onAccent2: '#0B0718',
  },
  sunrise: {
    bg: '#FFF8F1',
    surface: '#FFECE0',
    text: '#1D120D',
    muted: '#6E5549',
    accent: '#EA580C',
    accent2: '#D97706',
    onAccent: '#FFFFFF',
    onAccent2: '#0F0A07',
  },
  lavender: {
    bg: '#F6F4FF',
    surface: '#EAE5FF',
    text: '#1B1436',
    muted: '#5D5285',
    accent: '#6D28D9',
    accent2: '#DB2777',
    onAccent: '#FFFFFF',
    onAccent2: '#FFFFFF',
  },
  mono: {
    bg: '#FAFAFA',
    surface: '#ECECEF',
    text: '#111113',
    muted: '#5A5A66',
    accent: '#18181B',
    accent2: '#52525B',
    onAccent: '#FFFFFF',
    onAccent2: '#FFFFFF',
  },
};

export const MOODS: Record<MoodName, MoodToken> = {
  bold: {
    name: 'bold',
    titleWeight: 800,
    bodyWeight: 500,
    tracking: '-0.025em',
    radiusScale: 1.0,
    borderWidth: 2,
    surfaceAlpha: 0.94,
    defaultAnimIn: 'pop',
    defaultAnimOut: 'fade',
    defaultEase: 'snappy',
    defaultBg: 'linear',
    titleFontRole: 'display',
    bodyFontRole: 'display',
  },
  soft: {
    name: 'soft',
    titleWeight: 700,
    bodyWeight: 400,
    tracking: '-0.015em',
    radiusScale: 1.6,
    borderWidth: 1,
    surfaceAlpha: 0.9,
    defaultAnimIn: 'fade-up',
    defaultAnimOut: 'fade',
    defaultEase: 'smooth',
    defaultBg: 'radial',
    titleFontRole: 'friendly',
    bodyFontRole: 'friendly',
  },
  tech: {
    name: 'tech',
    titleWeight: 700,
    bodyWeight: 500,
    tracking: '-0.02em',
    radiusScale: 0.65,
    borderWidth: 1.5,
    surfaceAlpha: 0.92,
    defaultAnimIn: 'wipe',
    defaultAnimOut: 'slide',
    defaultEase: 'snappy',
    defaultBg: 'grid',
    titleFontRole: 'tech',
    bodyFontRole: 'display',
  },
  elegant: {
    name: 'elegant',
    titleWeight: 700,
    bodyWeight: 400,
    tracking: '-0.01em',
    radiusScale: 0.4,
    borderWidth: 1,
    surfaceAlpha: 0.92,
    defaultAnimIn: 'fade',
    defaultAnimOut: 'fade',
    defaultEase: 'cinematic',
    defaultBg: 'linear',
    titleFontRole: 'serif',
    bodyFontRole: 'display',
  },
  playful: {
    name: 'playful',
    titleWeight: 800,
    bodyWeight: 600,
    tracking: '-0.015em',
    radiusScale: 1.9,
    borderWidth: 2,
    surfaceAlpha: 0.95,
    defaultAnimIn: 'pop',
    defaultAnimOut: 'zoom',
    defaultEase: 'bounce',
    defaultBg: 'shapes',
    titleFontRole: 'friendly',
    bodyFontRole: 'friendly',
  },
};

export const SAFE_AREAS: Record<VideoFormat, SafeAreaInsets> = {
  '9:16': { top: 180, right: 72, bottom: 260, left: 72 },
  '16:9': { top: 72, right: 96, bottom: 84, left: 96 },
  '1:1': { top: 76, right: 76, bottom: 76, left: 76 },
};

export function sizingUnit(width: number, height: number): number {
  return Math.min(width, height) / 100;
}

export function px(u: number, mult: number): number {
  return Math.round(u * mult * 10) / 10;
}

const HEX_SHORT_RE = /^#([0-9a-f]{3})$/i;
const HEX_FULL_RE = /^#([0-9a-f]{6})$/i;

export function normalizeHex(input: string, fallback: string = '#FFFFFF'): string {
  const trimmed = input.trim();
  if (HEX_FULL_RE.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const shortMatch = trimmed.match(HEX_SHORT_RE);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function parseRgb(hex: string): [number, number, number] {
  const norm = normalizeHex(hex, '#000000');
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  return [r, g, b];
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseRgb(hex);
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

function linearChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseRgb(hex);
  return (
    0.2126 * linearChannel(r) +
    0.7152 * linearChannel(g) +
    0.0722 * linearChannel(b)
  );
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isLightColor(hex: string): boolean {
  return getRelativeLuminance(hex) > 0.35;
}

export function pickBestOnColor(bgHex: string): string {
  const dark = '#0B0F17';
  const light = '#FFFFFF';
  return getContrastRatio(bgHex, dark) >= getContrastRatio(bgHex, light)
    ? dark
    : light;
}

export function mixHex(hexA: string, hexB: string, ratioB: number): string {
  const [r1, g1, b1] = parseRgb(hexA);
  const [r2, g2, b2] = parseRgb(hexB);
  const t = Math.max(0, Math.min(1, ratioB));
  const r = Math.round(r1 * (1 - t) + r2 * t);
  const g = Math.round(g1 * (1 - t) + g2 * t);
  const b = Math.round(b1 * (1 - t) + b2 * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function ensureContrast(
  input: KitPalette | PartialKitPalette
): { palette: KitPalette; warnings: string[] } {
  const warnings: string[] = [];
  const bg = normalizeHex(input.bg, '#0E0B10');
  const bgIsLight = isLightColor(bg);

  const defaultSurface = bgIsLight
    ? mixHex(bg, '#000000', 0.06)
    : mixHex(bg, '#FFFFFF', 0.07);
  const surface = normalizeHex(input.surface ?? defaultSurface, defaultSurface);

  let text = normalizeHex(
    input.text ?? (bgIsLight ? '#111116' : '#F7F7FA'),
    bgIsLight ? '#111116' : '#F7F7FA'
  );

  const textVsBg = getContrastRatio(text, bg);
  const textVsSurface = getContrastRatio(text, surface);

  if (textVsBg < 4.5 || textVsSurface < 4.5) {
    const candidateLight = '#FFFFFF';
    const candidateDark = '#0D0E12';
    const minLight = Math.min(
      getContrastRatio(candidateLight, bg),
      getContrastRatio(candidateLight, surface)
    );
    const minDark = Math.min(
      getContrastRatio(candidateDark, bg),
      getContrastRatio(candidateDark, surface)
    );
    const replacement = minLight >= minDark ? candidateLight : candidateDark;
    if (replacement !== text) {
      warnings.push(
        `Adjusted palette.text (${text} -> ${replacement}) to maintain >= 4.5:1 contrast.`
      );
      text = replacement;
    }
  }

  let muted = normalizeHex(
    input.muted ?? mixHex(text, bg, 0.32),
    mixHex(text, bg, 0.32)
  );
  if (
    getContrastRatio(muted, bg) < 3.4 ||
    getContrastRatio(muted, surface) < 3.4
  ) {
    const lifted = mixHex(muted, text, 0.45);
    if (
      getContrastRatio(lifted, bg) >= 3.4 &&
      getContrastRatio(lifted, surface) >= 3.4
    ) {
      muted = lifted;
    } else {
      muted = mixHex(text, bg, 0.2);
    }
    warnings.push('Lifted palette.muted for legible secondary contrast.');
  }

  const accent = normalizeHex(input.accent, '#FF5A36');
  const accent2 = normalizeHex(input.accent2 ?? accent, accent);
  const onAccent = input.onAccent
    ? getContrastRatio(normalizeHex(input.onAccent, '#FFFFFF'), accent) >= 4.5
      ? normalizeHex(input.onAccent, '#FFFFFF')
      : pickBestOnColor(accent)
    : pickBestOnColor(accent);

  const onAccent2 = input.onAccent2
    ? getContrastRatio(normalizeHex(input.onAccent2, '#FFFFFF'), accent2) >= 4.5
      ? normalizeHex(input.onAccent2, '#FFFFFF')
      : pickBestOnColor(accent2)
    : pickBestOnColor(accent2);

  return {
    palette: {
      bg,
      surface,
      text,
      muted,
      accent,
      accent2,
      onAccent,
      onAccent2,
    },
    warnings,
  };
}

const BENGALI_CHAR_RE = /[\u0980-\u09FF]/;
const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function containsBengali(text: string): boolean {
  return BENGALI_CHAR_RE.test(text);
}

export function formatLocalizedDigits(
  value: string,
  useBengali: boolean = false
): string {
  if (!useBengali) {
    return value;
  }
  return value.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  return (
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua)
  );
}
