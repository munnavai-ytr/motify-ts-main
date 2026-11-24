'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeExitStyle,
  computeProgress,
  resolveBeatDelay,
} from '../anim';
import { KitStack, KitText, kitAttrs, useKitSceneContext } from '../elements';
import {
  SAFE_AREAS,
  containsBengali,
  formatLocalizedDigits,
  hexToRgba,
  px,
  sizingUnit,
} from '../tokens';
import {
  clampMaxWidth,
  getStyleSurfaceCardProps,
  minBodyPx,
  minTextPx,
  readSlotString,
  type LayoutProps,
} from './types';

interface ParsedBarDatum {
  label: string;
  value: number;
}

function readBarData(slots: Record<string, unknown>): ParsedBarDatum[] {
  const raw = slots.data;
  if (!Array.isArray(raw)) {
    return [
      { label: 'Q1', value: 42 },
      { label: 'Q2', value: 68 },
      { label: 'Q3', value: 84 },
      { label: 'Q4', value: 96 },
    ];
  }
  const out: ParsedBarDatum[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      const label = typeof rec.label === 'string' ? rec.label.trim() : '';
      const rawVal = rec.value;
      const value =
        typeof rawVal === 'number' && Number.isFinite(rawVal)
          ? Math.max(0, rawVal)
          : typeof rawVal === 'string' && Number.isFinite(Number(rawVal))
            ? Math.max(0, Number(rawVal))
            : 0;
      if (label) {
        out.push({ label, value });
      }
    }
    if (out.length >= 6) {
      break;
    }
  }
  return out.length > 0
    ? out
    : [
        { label: 'A', value: 45 },
        { label: 'B', value: 78 },
        { label: 'C', value: 94 },
      ];
}

export function BarsLayout({
  slots,
  theme,
  format,
  width,
  height,
  motion,
  sceneIndex,
}: LayoutProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const safe = SAFE_AREAS[format];
  const u = sizingUnit(width, height);
  const contentWidth = width - safe.left - safe.right;
  const contentHeight = height - safe.top - safe.bottom;
  const isVertical = format === '9:16';

  const heading = readSlotString(slots, 'heading', 'Key Metrics');
  const data = readBarData(slots);
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const sceneCtx = useKitSceneContext();
  const useBn =
    sceneCtx.numerals === 'bn'
      ? true
      : sceneCtx.numerals === 'latn'
        ? false
        : containsBengali(`${heading} ${data.map((d) => d.label).join(' ')}`);

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const cardSurface = getStyleSurfaceCardProps(theme, false);

  const headingMin = Math.round(px(u, isVertical ? 5.4 : 4.2));
  const headingMax = Math.round(px(u, isVertical ? 7.8 : 6.2));
  const labelSize = minTextPx(u, 3.2);
  const valSize = minBodyPx(u, 3.4);

  // Variant B: Horizontal animated bars
  if (variant === 'b') {
    const gap = Math.round(
      px(u, isVertical ? (data.length >= 5 ? 1.8 : 2.5) : 1.1)
    );
    const cardPadB = Math.round(px(u, isVertical ? 3.8 : 2.8));
    const cardInnerWidthB = clampMaxWidth(
      contentWidth - cardPadB * 2,
      contentWidth,
      'bars.b.inner'
    );
    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            top: safe.top,
            left: safe.left,
            right: safe.right,
            bottom: safe.bottom,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: contentWidth,
              boxSizing: 'border-box',
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              borderRadius: Math.round(px(u, 2.2) * theme.mood.radiusScale),
              padding: cardPadB,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: Math.round(px(u, 2.4)),
              ...cardSurface,
              opacity: exit.opacity,
              transform: exit.transform,
            }}
          >
            <KitText
              text={heading}
              maxWidth={cardInnerWidthB}
              maxHeight={Math.round(contentHeight * 0.2)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headingMin}
              maxSize={headingMax}
              maxLines={2}
              lineHeight={1.08}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              animIn={motion.animIn}
              animOut="none"
              delayFrames={0}
            />

            <div
              {...kitAttrs('shape', { sceneIndex, zone: 'content' })}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap,
              }}
            >
              {data.map((d, idx) => {
                const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 0);
                const p = computeProgress({
                  frame: entranceFrame,
                  fps,
                  delayFrames: delay,
                  durationFrames: 22,
                  ease: 'cinematic',
                });
                const ratio = d.value / maxVal;
                const fillPct = Math.max(4, ratio * 100 * p);
                const shownNum = formatLocalizedDigits(
                  String(Math.round(d.value * p)),
                  useBn
                );
                const isPeak = d.value === maxVal;

                return (
                  <div
                    key={`${d.label}-${idx}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: Math.round(px(u, 0.7)),
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: theme.bodyFontFamily,
                          fontSize: labelSize,
                          fontWeight: 600,
                          color: theme.palette.text,
                        }}
                      >
                        {d.label}
                      </span>
                      <span
                        style={{
                          fontFamily: theme.titleFontFamily,
                          fontSize: valSize,
                          fontWeight: 800,
                          color: isPeak
                            ? theme.palette.accent2
                            : theme.palette.accent,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {shownNum}
                      </span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: Math.round(px(u, isVertical ? 3.2 : 2.6)),
                        borderRadius: Math.round(px(u, 0.8) * theme.mood.radiusScale),
                        backgroundColor: hexToRgba(theme.palette.text, 0.1),
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${fillPct.toFixed(1)}%`,
                          height: '100%',
                          borderRadius: Math.round(px(u, 0.8) * theme.mood.radiusScale),
                          background: isPeak
                            ? `linear-gradient(90deg, ${theme.palette.accent}, ${theme.palette.accent2})`
                            : theme.palette.accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Vertical animated bars with count-up labels
  const maxBarH = Math.round(contentHeight * (isVertical ? 0.36 : 0.42));
  const cardPadA = Math.round(px(u, isVertical ? 3.8 : 3.0));
  const cardInnerWidthA = clampMaxWidth(
    contentWidth - cardPadA * 2,
    contentWidth,
    'bars.a.inner'
  );
  const minBarH = Math.max(4, Math.round(px(u, 1.0)));
  const topBarRadius = Math.round(px(u, 1.0) * theme.mood.radiusScale);
  const botBarRadius = Math.round(px(u, 0.4));

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: safe.top,
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            boxSizing: 'border-box',
            minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
            borderRadius: Math.round(px(u, 2.2) * theme.mood.radiusScale),
            padding: cardPadA,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: Math.round(px(u, 2.8)),
            ...cardSurface,
            opacity: exit.opacity,
            transform: exit.transform,
          }}
        >
          <KitStack direction="column" gap={Math.round(px(u, 1.0))} width="100%">
            <KitText
              text={heading}
              maxWidth={cardInnerWidthA}
              maxHeight={Math.round(contentHeight * 0.2)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headingMin}
              maxSize={headingMax}
              maxLines={2}
              lineHeight={1.08}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              animIn={motion.animIn}
              animOut="none"
              delayFrames={0}
            />
          </KitStack>

          <div
            {...kitAttrs('shape', { sceneIndex, zone: 'content' })}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: Math.round(px(u, 1.8)),
            }}
          >
            {data.map((d, idx) => {
              const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 0);
              const p = computeProgress({
                frame: entranceFrame,
                fps,
                delayFrames: delay,
                durationFrames: 22,
                ease: 'cinematic',
              });
              const ratio = d.value / maxVal;
              const barH = Math.max(minBarH, Math.round(maxBarH * ratio * p));
              const shownNum = formatLocalizedDigits(
                String(Math.round(d.value * p)),
                useBn
              );
              const isPeak = d.value === maxVal;

              return (
                <div
                  key={`${d.label}-${idx}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.2)),
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.titleFontFamily,
                      fontSize: valSize,
                      fontWeight: 800,
                      color: isPeak
                        ? theme.palette.accent2
                        : theme.palette.text,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {shownNum}
                  </span>

                  <div
                    style={{
                      width: '100%',
                      height: maxBarH,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '78%',
                        height: barH,
                        borderRadius: `${topBarRadius}px ${topBarRadius}px ${botBarRadius}px ${botBarRadius}px`,
                        background: isPeak
                          ? `linear-gradient(180deg, ${theme.palette.accent2}, ${theme.palette.accent})`
                          : theme.palette.accent,
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontFamily: theme.bodyFontFamily,
                      fontSize: labelSize,
                      fontWeight: 600,
                      color: theme.palette.muted,
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
