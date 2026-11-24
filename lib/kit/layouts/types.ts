import type React from 'react';
import type { VideoFormat } from '@/lib/types';
import type { AnimInPreset, AnimOutPreset, EasePreset } from '../anim';
import type { DecorZoneRect, ResolvedKitTheme } from '../elements';
import { getStyleCardBorder, getStyleCardShadow } from '../styles';
import {
  hexToRgba,
  px,
  type BgKind,
  type CameraKind,
  type IntensityName,
  type LayoutVariant,
  type TransitionKind,
} from '../tokens';

export type LayoutName =
  | 'hook'
  | 'title'
  | 'feature'
  | 'stat'
  | 'list'
  | 'offer'
  | 'cta'
  | 'brand'
  | 'lower-third'
  | 'steps'
  | 'quote'
  | 'compare'
  | 'bars'
  | 'kinetic'
  | 'custom';

export interface SceneMotionConfig {
  animIn: AnimInPreset;
  animOut: AnimOutPreset;
  ease: EasePreset;
  bg: BgKind;
  variant: LayoutVariant;
  camera: CameraKind;
  transition: TransitionKind;
  intensity: IntensityName;
  seed: number;
  preRollFrames: number;
}

export interface LayoutProps {
  slots: Record<string, unknown>;
  theme: ResolvedKitTheme;
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  motion: SceneMotionConfig;
  sceneIndex: number;
}

export interface SlotSchemaDescriptor {
  name: string;
  required: boolean;
  type:
    | 'string'
    | 'number'
    | 'icon'
    | 'string[]'
    | 'items[]'
    | 'blocks[]'
    | 'data[]';
  maxChars?: number;
  maxItems?: number;
  description: string;
}

export interface LayoutDefinition {
  name: LayoutName;
  label: string;
  description: string;
  variants: readonly LayoutVariant[];
  defaultDurationSec: number;
  slots: readonly SlotSchemaDescriptor[];
  component: React.ComponentType<LayoutProps>;
}

export function readSlotString(
  slots: Record<string, unknown>,
  key: string,
  fallback: string = ''
): string {
  const val = slots[key];
  if (typeof val === 'string') {
    return val.trim();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  return fallback;
}

export function readSlotStringArray(
  slots: Record<string, unknown>,
  key: string,
  maxItems: number = 6
): string[] {
  const val = slots[key];
  if (!Array.isArray(val)) {
    return [];
  }
  const out: string[] = [];
  for (const item of val) {
    if (typeof item === 'string' && item.trim().length > 0) {
      out.push(item.trim());
    }
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

export function minTextPx(u: number, mult: number = 3.2): number {
  return Math.round(px(u, Math.max(3.2, mult)));
}

export function minBodyPx(u: number, mult: number = 3.4): number {
  return Math.round(px(u, Math.max(3.4, mult)));
}

export function getStyleSurfaceCardProps(
  theme: ResolvedKitTheme,
  emphasized: boolean = false
): React.CSSProperties {
  return {
    boxSizing: 'border-box',
    backgroundColor: hexToRgba(theme.palette.surface, theme.mood.surfaceAlpha),
    border: getStyleCardBorder(
      theme.style,
      theme.palette.accent,
      theme.palette.text,
      emphasized
    ),
    boxShadow: getStyleCardShadow(
      theme.style,
      theme.palette.accent,
      theme.palette.text
    ),
  };
}

export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampLayoutBox(
  box: LayoutBox,
  canvasWidth: number,
  canvasHeight: number,
  contextLabel?: string
): LayoutBox {
  let { x, y, w, h } = box;
  const outOfBounds =
    x < 0 ||
    y < 0 ||
    w < 0 ||
    h < 0 ||
    x + w > canvasWidth ||
    y + h > canvasHeight;

  if (outOfBounds && contextLabel) {
    console.warn(`Layout out of bounds: ${contextLabel}`, {
      x,
      y,
      w,
      h,
      canvasWidth,
      canvasHeight,
    });
  }

  w = Math.max(0, Math.min(w, canvasWidth));
  h = Math.max(0, Math.min(h, canvasHeight));
  x = Math.max(0, Math.min(x, canvasWidth - w));
  y = Math.max(0, Math.min(y, canvasHeight - h));

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function clampMaxWidth(
  desiredWidth: number,
  availableWidth: number,
  contextLabel?: string
): number {
  const safeAvail = Math.max(0, Math.round(availableWidth));
  const safeDesired = Math.max(0, Math.round(desiredWidth));
  if (safeDesired > safeAvail && contextLabel) {
    console.warn(`Layout out of bounds: ${contextLabel}`, {
      desiredWidth: safeDesired,
      availableWidth: safeAvail,
    });
  }
  return Math.min(safeDesired, safeAvail);
}

/**
 * Computes conservative central text/content bounding rect so Scene Decor pieces
 * avoid crossing over headlines or cards.
 */
export function buildCentralAvoidZone(
  safe: { top: number; right: number; bottom: number; left: number },
  width: number,
  height: number,
  heightRatio: number = 0.62
): DecorZoneRect[] {
  const safeW = width - safe.left - safe.right;
  const safeH = height - safe.top - safe.bottom;
  const zH = Math.round(safeH * heightRatio);
  const zY = safe.top + Math.round((safeH - zH) * 0.5);
  return [
    {
      x: safe.left,
      y: zY,
      w: safeW,
      h: zH,
    },
  ];
}
