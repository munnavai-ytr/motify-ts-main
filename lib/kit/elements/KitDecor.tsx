'use client';

import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeDrawProgress,
  computeParallaxTransform,
  type CameraMotionState,
} from '../anim';
import type { StyleDef } from '../styles';
import {
  hexToRgba,
  px,
  sizingUnit,
  type DecorKind,
  type KitPalette,
  type SafeAreaInsets,
} from '../tokens';
import { kitAttrs, useKitSceneContext } from './context';

export interface DecorZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KitDecorProps {
  kinds: readonly DecorKind[];
  palette: KitPalette;
  styleDef: StyleDef;
  width: number;
  height: number;
  safe: SafeAreaInsets;
  seed: string;
  avoid?: readonly DecorZoneRect[];
  depth?: number;
  cameraState?: CameraMotionState;
  sceneIndex?: number;
  maxPieces?: number;
}

function rectsOverlap(a: DecorZoneRect, b: DecorZoneRect, pad = 16): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function isFreeZone(
  rect: DecorZoneRect,
  avoid: readonly DecorZoneRect[]
): boolean {
  for (const z of avoid) {
    if (rectsOverlap(rect, z, 18)) {
      return false;
    }
  }
  return true;
}

function findFreeAnchor(
  sizeW: number,
  sizeH: number,
  candidates: readonly { x: number; y: number }[],
  avoid: readonly DecorZoneRect[]
): { x: number; y: number } | null {
  for (const c of candidates) {
    const rect: DecorZoneRect = { x: c.x, y: c.y, w: sizeW, h: sizeH };
    if (isFreeZone(rect, avoid)) {
      return c;
    }
  }
  return null;
}

export function KitDecor({
  kinds,
  palette,
  styleDef,
  width,
  height,
  safe,
  seed,
  avoid = [],
  depth = 0.45,
  cameraState,
  sceneIndex = 0,
  maxPieces = 2,
}: KitDecorProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ctx = useKitSceneContext();

  if (kinds.length === 0) {
    return null;
  }

  const u = sizingUnit(width, height);
  const entranceFrame = frame + ctx.preRollFrames;
  const drawP = computeDrawProgress({
    frame: entranceFrame,
    fps,
    delayFrames: 2,
    durationFrames: 20,
    ease: 'cinematic',
  });

  const parallax =
    cameraState !== undefined
      ? computeParallaxTransform({ cameraState, depth, width })
      : 'none';

  // Pick up to maxPieces decor types deterministically from style list
  const selectedKinds: DecorKind[] = [];
  const startIdx = Math.floor(random(`${seed}-decor-idx`) * kinds.length);
  for (let i = 0; i < Math.min(maxPieces, kinds.length); i++) {
    selectedKinds.push(kinds[(startIdx + i) % kinds.length]);
  }

  const outerMarginX = Math.max(24, Math.round(safe.left * 0.48));
  const outerMarginTop = Math.max(28, Math.round(safe.top * 0.45));
  const outerMarginBottom = Math.max(28, Math.round(safe.bottom * 0.45));

  const freeAnchorsTop = [
    { x: safe.left, y: Math.max(24, safe.top - Math.round(px(u, 11))) },
    {
      x: width - safe.right - Math.round(px(u, 14)),
      y: Math.max(24, safe.top - Math.round(px(u, 11))),
    },
    { x: width * 0.42, y: Math.max(20, safe.top - Math.round(px(u, 10))) },
  ];

  const freeAnchorsBottom = [
    {
      x: width - safe.right - Math.round(px(u, 14)),
      y: height - safe.bottom + Math.round(px(u, 3.5)),
    },
    {
      x: safe.left,
      y: height - safe.bottom + Math.round(px(u, 3.5)),
    },
  ];

  const allFreeAnchors = [...freeAnchorsTop, ...freeAnchorsBottom];

  const accentStroke = hexToRgba(palette.accent, 0.55);
  const subtleStroke = hexToRgba(palette.text, 0.16);
  const strokeW = Math.max(2, Math.round(styleDef.borderWidth));

  return (
    <AbsoluteFill
      {...kitAttrs('decor', {
        sceneIndex: ctx.sceneIndex ?? sceneIndex,
        zone: 'decor',
        avoid: true,
      })}
      style={{
        pointerEvents: 'none',
        transform: parallax !== 'none' ? parallax : undefined,
      }}
    >
      {selectedKinds.map((kind, idx) => {
        if (kind === 'corner-brackets') {
          const arm = Math.round(px(u, 4.4));
          const dashLen = arm * 2;
          const dashOffset = (1 - drawP) * dashLen;
          return (
            <svg
              key={`dec-cb-${idx}`}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ position: 'absolute', inset: 0 }}
            >
              {/* Top-left bracket */}
              <path
                d={`M ${outerMarginX} ${outerMarginTop + arm} L ${outerMarginX} ${outerMarginTop} L ${outerMarginX + arm} ${outerMarginTop}`}
                fill="none"
                stroke={accentStroke}
                strokeWidth={strokeW}
                strokeDasharray={dashLen}
                strokeDashoffset={dashOffset}
              />
              {/* Bottom-right bracket */}
              <path
                d={`M ${width - outerMarginX - arm} ${height - outerMarginBottom} L ${width - outerMarginX} ${height - outerMarginBottom} L ${width - outerMarginX} ${height - outerMarginBottom - arm}`}
                fill="none"
                stroke={accentStroke}
                strokeWidth={strokeW}
                strokeDasharray={dashLen}
                strokeDashoffset={dashOffset}
              />
            </svg>
          );
        }

        if (kind === 'frame-draw') {
          const fw = width - outerMarginX * 2;
          const fh = height - outerMarginTop - outerMarginBottom;
          const perim = (fw + fh) * 2;
          return (
            <svg
              key={`dec-fd-${idx}`}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ position: 'absolute', inset: 0 }}
            >
              <rect
                x={outerMarginX}
                y={outerMarginTop}
                width={fw}
                height={fh}
                rx={Math.round(12 * styleDef.radiusScale)}
                fill="none"
                stroke={hexToRgba(palette.accent, 0.34)}
                strokeWidth={Math.max(1.5, strokeW * 0.8)}
                strokeDasharray={perim}
                strokeDashoffset={(1 - drawP) * perim}
              />
            </svg>
          );
        }

        if (kind === 'hairline-rule') {
          const yTop = Math.max(24, safe.top * 0.55);
          const yBot = height - Math.max(24, safe.bottom * 0.55);
          const lineW = width - outerMarginX * 2;
          return (
            <svg
              key={`dec-hr-${idx}`}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ position: 'absolute', inset: 0 }}
            >
              <line
                x1={outerMarginX}
                y1={yTop}
                x2={outerMarginX + lineW * drawP}
                y2={yTop}
                stroke={subtleStroke}
                strokeWidth={1.5}
              />
              <line
                x1={width - outerMarginX}
                y1={yBot}
                x2={width - outerMarginX - lineW * drawP}
                y2={yBot}
                stroke={subtleStroke}
                strokeWidth={1.5}
              />
            </svg>
          );
        }

        if (kind === 'index-number') {
          const boxW = Math.round(px(u, 11));
          const boxH = Math.round(px(u, 5.5));
          const anchor = findFreeAnchor(boxW, boxH, freeAnchorsTop, avoid);
          if (!anchor) return null;
          const label = `0${(sceneIndex % 9) + 1}`;
          return (
            <div
              key={`dec-idx-${idx}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                fontFamily: 'monospace',
                fontSize: Math.round(px(u, 3.2)),
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: hexToRgba(palette.text, 0.42),
                opacity: drawP,
              }}
            >
              {label} /
            </div>
          );
        }

        if (kind === 'squiggle') {
          const w = Math.round(px(u, 14));
          const h = Math.round(px(u, 4));
          const anchor = findFreeAnchor(w, h, allFreeAnchors, avoid);
          if (!anchor) return null;
          const pathLen = w * 1.4;
          return (
            <svg
              key={`dec-sq-${idx}`}
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              style={{ position: 'absolute', left: anchor.x, top: anchor.y }}
            >
              <path
                d={`M 4 ${h * 0.5} Q ${w * 0.25} 4 ${w * 0.5} ${h * 0.5} T ${w - 4} ${h * 0.5}`}
                fill="none"
                stroke={palette.accent2}
                strokeWidth={Math.max(3, px(u, 0.55))}
                strokeLinecap="round"
                strokeDasharray={pathLen}
                strokeDashoffset={(1 - drawP) * pathLen}
              />
            </svg>
          );
        }

        if (kind === 'sparkle-cluster') {
          const w = Math.round(px(u, 10));
          const h = Math.round(px(u, 10));
          const anchor = findFreeAnchor(w, h, allFreeAnchors, avoid);
          if (!anchor) return null;
          const pulse = 0.8 + 0.2 * Math.sin((frame / Math.max(1, fps)) * 3.2);
          return (
            <svg
              key={`dec-sp-${idx}`}
              width={w}
              height={h}
              viewBox="0 0 100 100"
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                opacity: drawP,
                transform: `scale(${pulse.toFixed(3)})`,
              }}
            >
              <path
                d="M50 8 L57 43 L92 50 L57 57 L50 92 L43 57 L8 50 L43 43 Z"
                fill={palette.accent}
              />
              <path
                d="M82 14 L85 26 L97 29 L85 32 L82 44 L79 32 L67 29 L79 26 Z"
                fill={palette.accent2}
              />
            </svg>
          );
        }

        if (kind === 'diamond') {
          const sz = Math.round(px(u, 5.2));
          const anchor = findFreeAnchor(sz, sz, allFreeAnchors, avoid);
          if (!anchor) return null;
          return (
            <div
              key={`dec-dm-${idx}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: sz,
                height: sz,
                border: `${strokeW}px solid ${accentStroke}`,
                transform: `rotate(45deg) scale(${drawP.toFixed(3)})`,
                opacity: drawP,
              }}
            />
          );
        }

        if (kind === 'blob') {
          const sz = Math.round(px(u, 13));
          const anchor = findFreeAnchor(sz, sz, freeAnchorsBottom, avoid);
          if (!anchor) return null;
          return (
            <div
              key={`dec-bl-${idx}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: sz,
                height: sz,
                borderRadius: '44% 56% 62% 38% / 48% 42% 58% 52%',
                backgroundColor: hexToRgba(palette.accent2, 0.16),
                transform: `scale(${drawP.toFixed(3)})`,
                opacity: drawP,
              }}
            />
          );
        }

        if (kind === 'arrow') {
          const w = Math.round(px(u, 11));
          const h = Math.round(px(u, 5));
          const anchor = findFreeAnchor(w, h, freeAnchorsBottom, avoid);
          if (!anchor) return null;
          return (
            <svg
              key={`dec-ar-${idx}`}
              width={w}
              height={h}
              viewBox="0 0 110 50"
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                opacity: drawP,
              }}
            >
              <path
                d="M6 25 L96 25 M76 10 L96 25 L76 40"
                fill="none"
                stroke={palette.accent}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={160}
                strokeDashoffset={(1 - drawP) * 160}
              />
            </svg>
          );
        }

        if (kind === 'ring') {
          const sz = Math.round(px(u, 9));
          const anchor = findFreeAnchor(sz, sz, allFreeAnchors, avoid);
          if (!anchor) return null;
          return (
            <div
              key={`dec-rg-${idx}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: sz,
                height: sz,
                borderRadius: '9999px',
                border: `${Math.max(2, strokeW)}px solid ${hexToRgba(palette.accent2, 0.45)}`,
                transform: `scale(${drawP.toFixed(3)})`,
                opacity: drawP,
              }}
            />
          );
        }

        if (kind === 'dot-cluster') {
          const sz = Math.round(px(u, 9));
          const anchor = findFreeAnchor(sz, sz, allFreeAnchors, avoid);
          if (!anchor) return null;
          const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8];
          return (
            <svg
              key={`dec-dc-${idx}`}
              width={sz}
              height={sz}
              viewBox="0 0 60 60"
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                opacity: drawP,
              }}
            >
              {pts.map((p) => (
                <circle
                  key={p}
                  cx={10 + (p % 3) * 20}
                  cy={10 + Math.floor(p / 3) * 20}
                  r={3.2}
                  fill={hexToRgba(palette.accent, 0.48)}
                />
              ))}
            </svg>
          );
        }

        return null;
      })}
    </AbsoluteFill>
  );
}
