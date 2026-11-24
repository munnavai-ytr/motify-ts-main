'use client';

import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { hexToRgba, mixHex, type BgKind, type KitPalette } from '../tokens';
import { kitAttrs, useKitSceneContext } from './context';

export interface KitBackgroundProps {
  kind: BgKind;
  palette: KitPalette;
  seed?: string;
  parallaxTransform?: string;
}

interface FloatingShapeSpec {
  id: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  isRing: boolean;
  useAccent2: boolean;
  speedX: number;
  speedY: number;
  phase: number;
  opacity: number;
}

function buildDeterministicShapes(seed: string): FloatingShapeSpec[] {
  const count = 8;
  const shapes: FloatingShapeSpec[] = [];
  for (let i = 0; i < count; i++) {
    shapes.push({
      id: `${seed}-${i}`,
      xPct: 8 + random(`${seed}-x-${i}`) * 84,
      yPct: 8 + random(`${seed}-y-${i}`) * 84,
      sizePct: 6 + random(`${seed}-sz-${i}`) * 14,
      isRing: random(`${seed}-ring-${i}`) > 0.55,
      useAccent2: random(`${seed}-clr-${i}`) > 0.5,
      speedX: (random(`${seed}-sx-${i}`) - 0.5) * 1.4,
      speedY: (random(`${seed}-sy-${i}`) - 0.5) * 1.4,
      phase: random(`${seed}-ph-${i}`) * Math.PI * 2,
      opacity: 0.08 + random(`${seed}-op-${i}`) * 0.1,
    });
  }
  return shapes;
}

export function KitBackground({
  kind,
  palette,
  seed = 'kit-bg',
  parallaxTransform,
}: KitBackgroundProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const safeFps = Math.max(1, fps);
  const t = frame / safeFps;
  const minDim = Math.min(width, height);

  const ctx = useKitSceneContext();
  const bgAttrs = kitAttrs('bg', { sceneIndex: ctx.sceneIndex, zone: 'decor' });

  const layerWrapStyle: React.CSSProperties =
    parallaxTransform && parallaxTransform !== 'none'
      ? { transform: parallaxTransform, transformOrigin: 'center center' }
      : {};

  if (kind === 'chroma') {
    return (
      <AbsoluteFill
        {...bgAttrs}
        style={{
          backgroundColor: '#00FF00',
        }}
      />
    );
  }

  if (kind === 'solid') {
    return (
      <AbsoluteFill
        {...bgAttrs}
        style={{
          backgroundColor: palette.bg,
        }}
      />
    );
  }

  if (kind === 'linear') {
    return (
      <AbsoluteFill
        {...bgAttrs}
        style={{
          background: `linear-gradient(155deg, ${palette.bg} 0%, ${palette.surface} 100%)`,
        }}
      />
    );
  }

  if (kind === 'radial') {
    return (
      <AbsoluteFill
        {...bgAttrs}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${palette.surface} 0%, ${palette.bg} 78%)`,
        }}
      />
    );
  }

  if (kind === 'paper') {
    const flecks = Array.from({ length: 24 }, (_, i) => ({
      x: random(`${seed}-px-${i}`) * width,
      y: random(`${seed}-py-${i}`) * height,
      r: 1 + random(`${seed}-pr-${i}`) * 2.2,
      a: 0.04 + random(`${seed}-pa-${i}`) * 0.06,
    }));
    const tint = mixHex(palette.bg, palette.surface, 0.45);
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 50%, ${tint} 0%, ${palette.bg} 82%)`,
            ...layerWrapStyle,
          }}
        />
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          {flecks.map((f, i) => (
            <circle
              key={`paper-${i}`}
              cx={f.x}
              cy={f.y}
              r={f.r}
              fill={hexToRgba(palette.text, f.a)}
            />
          ))}
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'mesh-glow') {
    const orbs = [
      {
        cx: width * (0.2 + 0.06 * Math.sin(t * 0.7)),
        cy: height * (0.22 + 0.05 * Math.cos(t * 0.6)),
        size: minDim * 0.95,
        color: palette.accent,
        alpha: 0.24,
      },
      {
        cx: width * (0.82 + 0.05 * Math.cos(t * 0.65)),
        cy: height * (0.76 + 0.06 * Math.sin(t * 0.55)),
        size: minDim * 0.9,
        color: palette.accent2,
        alpha: 0.2,
      },
      {
        cx: width * (0.5 + 0.04 * Math.sin(t * 0.5 + 1.2)),
        cy: height * 0.5,
        size: minDim * 0.85,
        color: palette.surface,
        alpha: 0.45,
      },
    ];
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <AbsoluteFill style={layerWrapStyle}>
          {orbs.map((orb, idx) => (
            <div
              key={`mesh-${idx}`}
              style={{
                position: 'absolute',
                left: orb.cx - orb.size / 2,
                top: orb.cy - orb.size / 2,
                width: orb.size,
                height: orb.size,
                borderRadius: '9999px',
                background: `radial-gradient(circle at 50% 50%, ${hexToRgba(orb.color, orb.alpha)} 0%, ${hexToRgba(orb.color, 0)} 72%)`,
              }}
            />
          ))}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'aurora') {
    const shift1 = Math.sin(t * 0.7) * (width * 0.06);
    const shift2 = Math.cos(t * 0.6) * (width * 0.07);
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <AbsoluteFill style={layerWrapStyle}>
          <div
            style={{
              position: 'absolute',
              left: -width * 0.2,
              top: height * 0.08,
              width: width * 1.4,
              height: height * 0.42,
              borderRadius: '9999px',
              background: `linear-gradient(120deg, ${hexToRgba(palette.accent, 0)} 10%, ${hexToRgba(palette.accent, 0.24)} 50%, ${hexToRgba(palette.accent2, 0)} 90%)`,
              transform: `translateX(${shift1.toFixed(1)}px) rotate(-14deg)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: -width * 0.25,
              bottom: height * 0.08,
              width: width * 1.5,
              height: height * 0.44,
              borderRadius: '9999px',
              background: `linear-gradient(120deg, ${hexToRgba(palette.accent2, 0)} 10%, ${hexToRgba(palette.accent2, 0.2)} 50%, ${hexToRgba(palette.accent, 0)} 90%)`,
              transform: `translateX(${shift2.toFixed(1)}px) rotate(12deg)`,
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'stripes') {
    const stripeCount = 7;
    const bandW = width / 4;
    const travel = (t * 28) % (bandW * 2);
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <AbsoluteFill
          style={{
            transform: `rotate(-18deg) scale(1.4) ${parallaxTransform && parallaxTransform !== 'none' ? parallaxTransform : ''}`,
          }}
        >
          {Array.from({ length: stripeCount }, (_, i) => (
            <div
              key={`stripe-${i}`}
              style={{
                position: 'absolute',
                left: i * bandW * 0.9 - width * 0.3 + travel * 0.35,
                top: -height * 0.2,
                width: bandW * 0.42,
                height: height * 1.4,
                backgroundColor:
                  i % 2 === 0
                    ? hexToRgba(palette.surface, 0.65)
                    : hexToRgba(palette.accent, 0.08),
              }}
            />
          ))}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'color-blocks') {
    const offset = Math.sin(t * 0.8) * 14;
    const tilt = random(`${seed}-cb`) > 0.5 ? 1 : -1;
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <AbsoluteFill style={layerWrapStyle}>
          <div
            style={{
              position: 'absolute',
              right: -width * 0.14,
              top: -height * 0.08,
              width: width * 0.68,
              height: height * 0.46,
              backgroundColor: hexToRgba(palette.accent, 0.18),
              transform: `translateY(${offset.toFixed(1)}px) rotate(${tilt * 7}deg)`,
              borderRadius: Math.round(minDim * 0.04),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: -width * 0.18,
              bottom: -height * 0.1,
              width: width * 0.72,
              height: height * 0.42,
              backgroundColor: hexToRgba(palette.accent2, 0.14),
              transform: `translateY(${(-offset).toFixed(1)}px) rotate(${tilt * -6}deg)`,
              borderRadius: Math.round(minDim * 0.04),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: width * 0.08,
              top: height * 0.14,
              width: width * 0.84,
              height: height * 0.72,
              border: `2px solid ${hexToRgba(palette.text, 0.06)}`,
              borderRadius: Math.round(minDim * 0.025),
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'rings') {
    const cx = width * (0.28 + random(`${seed}-rcx`) * 0.44);
    const cy = height * (0.28 + random(`${seed}-rcy`) * 0.44);
    const ringCount = 6;
    const baseRadius = minDim * 0.16;
    const stepRadius = minDim * 0.13;
    const pulse = 1 + Math.sin(t * 1.4) * 0.03;

    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          {Array.from({ length: ringCount }, (_, i) => (
            <circle
              key={`ring-${i}`}
              cx={cx}
              cy={cy}
              r={(baseRadius + i * stepRadius) * pulse}
              fill="none"
              stroke={
                i % 2 === 0
                  ? hexToRgba(palette.accent, 0.18 - i * 0.02)
                  : hexToRgba(palette.accent2, 0.14 - i * 0.015)
              }
              strokeWidth={Math.max(1.5, minDim * 0.003)}
            />
          ))}
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'waves') {
    const waveOffset1 = Math.sin(t * 1.1) * 18;
    const waveOffset2 = Math.cos(t * 0.9) * 22;
    const w = width;
    const h = height;
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          <path
            d={`M -40 ${h * 0.72 + waveOffset1} Q ${w * 0.25} ${h * 0.62 - waveOffset1} ${w * 0.52} ${h * 0.72 + waveOffset1} T ${w + 40} ${h * 0.68 - waveOffset1} L ${w + 40} ${h + 40} L -40 ${h + 40} Z`}
            fill={hexToRgba(palette.surface, 0.85)}
          />
          <path
            d={`M -40 ${h * 0.8 + waveOffset2} Q ${w * 0.3} ${h * 0.88 - waveOffset2} ${w * 0.6} ${h * 0.78 + waveOffset2} T ${w + 40} ${h * 0.82 - waveOffset2} L ${w + 40} ${h + 40} L -40 ${h + 40} Z`}
            fill={hexToRgba(palette.accent, 0.14)}
          />
          <path
            d={`M -40 ${h * 0.16 - waveOffset1} Q ${w * 0.35} ${h * 0.08 + waveOffset1} ${w * 0.7} ${h * 0.18 - waveOffset1} T ${w + 40} ${h * 0.14 + waveOffset1} L ${w + 40} -40 L -40 -40 Z`}
            fill={hexToRgba(palette.accent2, 0.1)}
          />
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'lines-sweep') {
    const lineCount = 8;
    const sweep = ((t * 0.18) % 1) * width * 0.3;
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const xBase = (i / Math.max(1, lineCount - 1)) * width * 1.1 - width * 0.15;
            const x1 = xBase + sweep;
            const x2 = x1 + width * 0.26;
            const strokeColor =
              i % 3 === 0
                ? hexToRgba(palette.accent, 0.22)
                : hexToRgba(palette.text, 0.08);
            return (
              <line
                key={`ls-${i}`}
                x1={x1}
                y1={0}
                x2={x2}
                y2={height}
                stroke={strokeColor}
                strokeWidth={i % 3 === 0 ? 3 : 1.5}
              />
            );
          })}
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'confetti') {
    const count = 20;
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          {Array.from({ length: count }, (_, i) => {
            const bx = random(`${seed}-cfx-${i}`) * width;
            const by = random(`${seed}-cfy-${i}`) * height;
            const sz = minDim * (0.014 + random(`${seed}-cfs-${i}`) * 0.018);
            const rot = random(`${seed}-cfr-${i}`) * 360 + t * 28 * (i % 2 === 0 ? 1 : -1);
            const dy = ((t * (18 + i * 2) + by) % (height + 80)) - 40;
            const color =
              i % 3 === 0
                ? hexToRgba(palette.accent, 0.28)
                : i % 3 === 1
                  ? hexToRgba(palette.accent2, 0.28)
                  : hexToRgba(palette.text, 0.14);
            if (i % 2 === 0) {
              return (
                <rect
                  key={`cf-${i}`}
                  x={bx - sz / 2}
                  y={dy - sz * 0.35}
                  width={sz * 1.4}
                  height={sz * 0.65}
                  rx={sz * 0.2}
                  fill={color}
                  transform={`rotate(${rot.toFixed(1)} ${bx.toFixed(1)} ${dy.toFixed(1)})`}
                />
              );
            }
            return (
              <circle
                key={`cf-${i}`}
                cx={bx}
                cy={dy}
                r={sz * 0.45}
                fill={color}
              />
            );
          })}
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'sparkles') {
    const count = 18;
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          {Array.from({ length: count }, (_, i) => {
            const cx = random(`${seed}-spx-${i}`) * width;
            const cy = random(`${seed}-spy-${i}`) * height;
            const baseR = minDim * (0.012 + random(`${seed}-spr-${i}`) * 0.018);
            const phase = random(`${seed}-spp-${i}`) * Math.PI * 2;
            const pulse = 0.65 + 0.35 * Math.sin(t * 2.2 + phase);
            const r = baseR * pulse;
            const ir = r * 0.26;
            const d = `M ${cx} ${cy - r} L ${cx + ir} ${cy - ir} L ${cx + r} ${cy} L ${cx + ir} ${cy + ir} L ${cx} ${cy + r} L ${cx - ir} ${cy + ir} L ${cx - r} ${cy} L ${cx - ir} ${cy - ir} Z`;
            const color =
              i % 2 === 0
                ? hexToRgba(palette.accent, 0.26 * pulse)
                : hexToRgba(palette.accent2, 0.24 * pulse);
            return <path key={`sp-${i}`} d={d} fill={color} />;
          })}
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'dots-grid') {
    const cols = 6;
    const rows = 8;
    const dx = width / (cols + 1);
    const dy = height / (rows + 1);
    const r = Math.max(2.5, Math.round(minDim * 0.005));
    const offset = Math.sin(t * 0.8) * 5;
    const points: Array<{ x: number; y: number; key: string; accent: boolean }> = [];
    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= cols; col++) {
        points.push({
          x: col * dx,
          y: row * dy,
          key: `${row}-${col}`,
          accent: (row + col) % 3 === 0,
        });
      }
    }
    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          <g transform={`translate(0, ${offset.toFixed(2)})`}>
            {points.map((pt) => (
              <circle
                key={`dg-${pt.key}`}
                cx={pt.x}
                cy={pt.y}
                r={r}
                fill={
                  pt.accent
                    ? hexToRgba(palette.accent, 0.26)
                    : hexToRgba(palette.text, 0.12)
                }
              />
            ))}
          </g>
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'grid') {
    const step = Math.max(88, Math.round(minDim / 9));
    const driftY = ((t * 14) % step).toFixed(2);
    const lineColor = hexToRgba(palette.text, 0.075);

    const verticalLines: number[] = [];
    for (let x = 0; x <= width; x += step) {
      verticalLines.push(x);
    }
    const horizontalLines: number[] = [];
    for (let y = -step; y <= height + step; y += step) {
      horizontalLines.push(y);
    }

    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          {verticalLines.map((x) => (
            <line
              key={`vx-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke={lineColor}
              strokeWidth={1.5}
            />
          ))}
          <g transform={`translate(0, ${driftY})`}>
            {horizontalLines.map((y) => (
              <line
                key={`hy-${y}`}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke={lineColor}
                strokeWidth={1.5}
              />
            ))}
          </g>
        </svg>
      </AbsoluteFill>
    );
  }

  if (kind === 'dots') {
    const cols = 7;
    const rows = 8;
    const stepX = width / cols;
    const stepY = height / rows;
    const dotRadius = Math.max(2.5, Math.round(minDim * 0.0045));
    const dotColor = hexToRgba(palette.accent, 0.18);
    const offset = Math.sin(t * 0.7) * 6;

    const points: Array<{ x: number; y: number; key: string }> = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        points.push({
          x: c * stepX,
          y: r * stepY,
          key: `${r}-${c}`,
        });
      }
    }

    return (
      <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, ...layerWrapStyle }}
        >
          <g transform={`translate(${offset.toFixed(2)}, ${offset.toFixed(2)})`}>
            {points.map((pt) => (
              <circle
                key={pt.key}
                cx={pt.x}
                cy={pt.y}
                r={dotRadius}
                fill={dotColor}
              />
            ))}
          </g>
        </svg>
      </AbsoluteFill>
    );
  }

  // 'shapes' background: deterministic floating geometry
  const shapes = buildDeterministicShapes(seed);

  return (
    <AbsoluteFill {...bgAttrs} style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={layerWrapStyle}>
        {shapes.map((s) => {
          const sizePx = Math.round((s.sizePct / 100) * minDim);
          const baseX = (s.xPct / 100) * width - sizePx / 2;
          const baseY = (s.yPct / 100) * height - sizePx / 2;
          const dx = Math.sin(t * 0.9 + s.phase) * s.speedX * 26;
          const dy = Math.cos(t * 0.8 + s.phase) * s.speedY * 26;
          const color = s.useAccent2 ? palette.accent2 : palette.accent;

          return (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: baseX,
                top: baseY,
                width: sizePx,
                height: sizePx,
                borderRadius: '9999px',
                backgroundColor: s.isRing
                  ? 'transparent'
                  : hexToRgba(color, s.opacity),
                border: s.isRing
                  ? `${Math.max(2, Math.round(sizePx * 0.04))}px solid ${hexToRgba(color, s.opacity * 1.4)}`
                  : 'none',
                transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
              }}
            />
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
