'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeDrawProgress,
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitIcon, KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  clampMaxWidth,
  getStyleSurfaceCardProps,
  minBodyPx,
  readSlotString,
  readSlotStringArray,
  type LayoutProps,
} from './types';

export function CompareLayout({
  slots,
  theme,
  format,
  width,
  height,
  motion,
}: LayoutProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const safe = SAFE_AREAS[format];
  const u = sizingUnit(width, height);
  const contentWidth = width - safe.left - safe.right;
  const contentHeight = height - safe.top - safe.bottom;
  const isVertical = format === '9:16';

  const leftTitle = readSlotString(slots, 'leftTitle', 'Before');
  const rightTitle = readSlotString(slots, 'rightTitle', 'After');
  const leftItemsRaw = readSlotStringArray(slots, 'leftItems', 4);
  const rightItemsRaw = readSlotStringArray(slots, 'rightItems', 4);

  const leftItems =
    leftItemsRaw.length > 0 ? leftItemsRaw : ['Manual layout', 'Slow edits'];
  const rightItems =
    rightItemsRaw.length > 0 ? rightItemsRaw : ['Auto-fit type', 'Instant MP4'];

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);

  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });

  const colSurface = getStyleSurfaceCardProps(theme, false);
  const highlightSurface = getStyleSurfaceCardProps(theme, true);

  const colTitleMin = Math.round(px(u, isVertical ? 4.4 : 4.0));
  const colTitleMax = Math.round(px(u, isVertical ? 5.6 : 5.0));
  const itemMin = minBodyPx(u, 3.4);
  const itemMax = Math.round(px(u, 3.8));

  // Variant B: Before / After reveal wipe panel
  if (variant === 'b') {
    const wipeP = computeProgress({
      frame: entranceFrame,
      fps,
      delayFrames: 4,
      durationFrames: 26,
      ease: 'snappy',
    });
    const splitPct = Math.round(52 * wipeP);
    const clipRight = Math.max(0, 100 - wipeP * 100);
    const colGapB = Math.round(px(u, 2.2));
    const colPadB = Math.round(px(u, isVertical ? 3.2 : 2.8));
    const colOuterWB = isVertical
      ? contentWidth
      : Math.round((contentWidth - colGapB) / 2);
    const colInnerWB = clampMaxWidth(
      colOuterWB - colPadB * 2,
      contentWidth,
      'compare.b.inner'
    );
    const itemTextMaxWB = clampMaxWidth(
      colInnerWB - Math.round(px(u, 4.4)),
      colInnerWB,
      'compare.b.item'
    );
    const accentBorderB = Math.max(2, Math.round(px(u, 0.25)));
    const wipeBarW = Math.max(2, Math.round(px(u, 0.4)));

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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: contentWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.62) : Math.round(contentHeight * 0.72),
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'row',
              alignItems: 'stretch',
              gap: colGapB,
              opacity: exit.opacity,
              transform: exit.transform,
            }}
          >
            {/* Before card */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                borderRadius: Math.round(px(u, 1.8) * theme.mood.radiusScale),
                padding: colPadB,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: Math.round(px(u, 1.8)),
                ...colSurface,
              }}
            >
              <KitText
                text={leftTitle}
                maxWidth={colInnerWB}
                maxHeight={Math.round(px(u, 8))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={colTitleMin}
                maxSize={colTitleMax}
                maxLines={1}
                color={theme.palette.muted}
                animIn="fade"
                animOut="none"
              />
              {leftItems.map((txt, idx) => (
                <div
                  key={`cl-b-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.4)),
                  }}
                >
                  <KitIcon
                    name="clock"
                    size={Math.round(px(u, 2.8))}
                    color={theme.palette.muted}
                  />
                  <KitText
                    text={txt}
                    maxWidth={itemTextMaxWB}
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={500}
                    minSize={itemMin}
                    maxSize={itemMax}
                    maxLines={2}
                    color={theme.palette.muted}
                    animIn="none"
                    animOut="none"
                  />
                </div>
              ))}
            </div>

            {/* After card wiped open cleanly */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                position: 'relative',
                borderRadius: Math.round(px(u, 1.8) * theme.mood.radiusScale),
                padding: colPadB,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: Math.round(px(u, 1.8)),
                clipPath: `inset(0% ${clipRight.toFixed(1)}% 0% 0%)`,
                ...highlightSurface,
                border: `${accentBorderB}px solid ${theme.palette.accent}`,
              }}
            >
              <KitText
                text={rightTitle}
                maxWidth={colInnerWB}
                maxHeight={Math.round(px(u, 8))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={colTitleMin}
                maxSize={colTitleMax}
                maxLines={1}
                color={theme.palette.accent}
                animIn="none"
                animOut="none"
              />
              {rightItems.map((txt, idx) => (
                <div
                  key={`cr-b-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.4)),
                  }}
                >
                  <KitIcon
                    name="check-circle"
                    size={Math.round(px(u, 2.8))}
                    color={theme.palette.accent2}
                  />
                  <KitText
                    text={txt}
                    maxWidth={itemTextMaxWB}
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={700}
                    minSize={itemMin}
                    maxSize={itemMax}
                    maxLines={2}
                    color={theme.palette.text}
                    animIn="none"
                    animOut="none"
                  />
                </div>
              ))}
              {splitPct > 0 && wipeP < 0.99 ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: `${clipRight.toFixed(1)}%`,
                    width: wipeBarW,
                    backgroundColor: theme.palette.accent2,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Two columns separated by animated drawing divider
  const dividerP = computeDrawProgress({
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 18,
    ease: 'cinematic',
  });
  const colIn = computeEntranceStyle({
    preset: 'fade-up',
    frame: entranceFrame,
    fps,
    delayFrames: beat1,
    durationFrames: 14,
    ease: motion.ease,
  });
  const colMotion = mergeMotionStyles(colIn, exit);
  const dividerThickness = Math.max(2, Math.round(px(u, 0.4)));
  const colPadA = Math.round(px(u, isVertical ? 3.2 : 2.8));
  const colGapA = Math.round(px(u, 2.2));
  const colWidth = isVertical
    ? contentWidth
    : Math.round((contentWidth - colGapA * 2 - dividerThickness) / 2);
  const colInnerWA = clampMaxWidth(
    colWidth - colPadA * 2,
    contentWidth,
    'compare.a.inner'
  );
  const dotSizeA = Math.max(Math.round(px(u, 0.6)), Math.round(px(u, 0.8)));
  const itemTextMaxWA = clampMaxWidth(
    colInnerWA - Math.round(px(u, 4.4)),
    colInnerWA,
    'compare.a.item'
  );
  const rightBorderW = Math.max(2, Math.round(px(u, 0.22)));

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
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.62) : undefined,
            display: 'flex',
            flexDirection: isVertical ? 'column' : 'row',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            gap: colGapA,
            ...colMotion,
          }}
        >
          {/* Left Column */}
          <div
            style={{
              width: colWidth,
              boxSizing: 'border-box',
              borderRadius: Math.round(px(u, 1.8) * theme.mood.radiusScale),
              padding: colPadA,
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(px(u, 1.6)),
              ...colSurface,
            }}
          >
            <KitText
              text={leftTitle}
              maxWidth={colInnerWA}
              maxHeight={Math.round(px(u, 8))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={colTitleMin}
              maxSize={colTitleMax}
              maxLines={1}
              color={theme.palette.muted}
              animIn="none"
              animOut="none"
            />
            {leftItems.map((txt, idx) => (
              <div
                key={`cl-a-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: Math.round(px(u, 1.4)),
                }}
              >
                <span
                  style={{
                    width: dotSizeA,
                    height: dotSizeA,
                    borderRadius: 9999,
                    backgroundColor: theme.palette.muted,
                    flexShrink: 0,
                  }}
                />
                <KitText
                  text={txt}
                  maxWidth={itemTextMaxWA}
                  maxHeight={Math.round(px(u, 7))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={500}
                  minSize={itemMin}
                  maxSize={itemMax}
                  maxLines={2}
                  color={theme.palette.muted}
                  animIn="none"
                  animOut="none"
                />
              </div>
            ))}
          </div>

          {/* Drawing Divider */}
          <div
            style={{
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: isVertical ? '100%' : dividerThickness,
                height: isVertical ? dividerThickness : '100%',
                minHeight: isVertical ? dividerThickness : Math.round(px(u, 22)),
                background: `linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                borderRadius: 999,
                transform: isVertical
                  ? `scaleX(${dividerP.toFixed(3)})`
                  : `scaleY(${dividerP.toFixed(3)})`,
                transformOrigin: 'center center',
              }}
            />
          </div>

          {/* Right Column */}
          <div
            style={{
              width: colWidth,
              boxSizing: 'border-box',
              borderRadius: Math.round(px(u, 1.8) * theme.mood.radiusScale),
              padding: colPadA,
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(px(u, 1.6)),
              ...highlightSurface,
              border: `${rightBorderW}px solid ${hexToRgba(theme.palette.accent, 0.7)}`,
            }}
          >
            <KitText
              text={rightTitle}
              maxWidth={colInnerWA}
              maxHeight={Math.round(px(u, 8))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={colTitleMin}
              maxSize={colTitleMax}
              maxLines={1}
              color={theme.palette.accent}
              animIn="none"
              animOut="none"
            />
            {rightItems.map((txt, idx) => (
              <div
                key={`cr-a-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: Math.round(px(u, 1.4)),
                }}
              >
                <KitIcon
                  name="check-circle"
                  size={Math.round(px(u, 2.8))}
                  color={theme.palette.accent2}
                />
                <KitText
                  text={txt}
                  maxWidth={itemTextMaxWA}
                  maxHeight={Math.round(px(u, 7))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={700}
                  minSize={itemMin}
                  maxSize={itemMax}
                  maxLines={2}
                  color={theme.palette.text}
                  animIn="none"
                  animOut="none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
