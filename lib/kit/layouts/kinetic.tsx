'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import { clampLayoutBox, readSlotStringArray, type LayoutProps } from './types';

export function KineticLayout({
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

  const rawWords = readSlotStringArray(slots, 'words', 8);
  const words =
    rawWords.length > 0
      ? rawWords
      : ['BUILD', 'FASTER', 'MOVE', 'SMARTER'];

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });

  // Variant B: Scrolling kinetic word marquee rows
  if (variant === 'b') {
    const safeFps = Math.max(1, fps);
    const t = frame / safeFps;
    const rowWordsA = words.slice(0, Math.ceil(words.length / 2));
    const rowWordsB =
      words.slice(Math.ceil(words.length / 2)).length > 0
        ? words.slice(Math.ceil(words.length / 2))
        : rowWordsA;

    const lineA = `${rowWordsA.join('  ·  ')}  ·  ${rowWordsA.join('  ·  ')}`;
    const lineB = `${rowWordsB.join('  ·  ')}  ·  ${rowWordsB.join('  ·  ')}`;
    const rows = isVertical
      ? [
          { text: lineA, accent: false, dir: -1 },
          { text: lineB, accent: true, dir: 1 },
          { text: lineA, accent: false, dir: -1 },
          { text: lineB, accent: true, dir: 1 },
        ]
      : [
          { text: lineA, accent: false, dir: -1 },
          { text: lineB, accent: true, dir: 1 },
          { text: lineA, accent: false, dir: -1 },
        ];

    const fadeIn = computeEntranceStyle({
      preset: 'fade-up',
      frame: entranceFrame,
      fps,
      delayFrames: 0,
      durationFrames: 12,
    });
    const motionStyle = mergeMotionStyles(fadeIn, exit);
    const marqueeBox = clampLayoutBox(
      {
        x: 0,
        y: safe.top,
        w: width,
        h: contentHeight,
      },
      width,
      height,
      'kinetic.b.marquee'
    );
    const travelSpeed = px(u, 8.2);
    const travelCycle = Math.max(1, Math.round(px(u, 36)));
    const travelOffset = Math.round(px(u, 15));

    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            top: marqueeBox.y,
            height: marqueeBox.h,
            left: marqueeBox.x,
            width: marqueeBox.w,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: Math.round(px(u, isVertical ? 4.2 : 2.6)),
            overflow: 'hidden',
            ...motionStyle,
          }}
        >
          {rows.map((row, idx) => {
            const shift = ((t * travelSpeed) % travelCycle) * row.dir;
            return (
              <div
                key={`km-${idx}`}
                style={{
                  whiteSpace: 'nowrap',
                  fontFamily: theme.titleFontFamily,
                  fontWeight: 800,
                  fontSize: Math.round(px(u, isVertical ? 9.4 : 8.2)),
                  lineHeight: 1.05,
                  letterSpacing: theme.mood.tracking,
                  color: row.accent ? theme.palette.accent : theme.palette.text,
                  backgroundColor: row.accent
                    ? hexToRgba(theme.palette.accent, 0.12)
                    : 'transparent',
                  paddingTop: Math.round(px(u, 1.0)),
                  paddingBottom: Math.round(px(u, 1.0)),
                  transform: `translateX(${(shift - travelOffset).toFixed(1)}px)`,
                }}
              >
                {row.text}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Big words slam in sequentially on beat grid filling the screen
  const count = words.length;
  const maxLinesPerRow = 1;
  const wordMaxH = Math.max(
    Math.round(px(u, 8)),
    Math.floor((contentHeight * 0.78) / count)
  );
  const wordMaxSize = Math.round(
    px(u, count <= 4 ? (isVertical ? 12.0 : 10.6) : isVertical ? 9.6 : 8.0)
  );
  const wordMinSize = Math.round(px(u, isVertical ? 4.8 : 4.2));

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
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.62) : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: Math.round(px(u, count >= 6 ? 1.4 : 2.2)),
          }}
        >
          {words.map((word, idx) => {
            const delay = resolveBeatDelay(idx, fps, motion.intensity, 0);
            const isAccent = idx === count - 1 || idx % 2 === 1;
            return (
              <KitText
                key={`${word}-${idx}`}
                text={word}
                maxWidth={contentWidth}
                maxHeight={wordMaxH}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={wordMinSize}
                maxSize={wordMaxSize}
                maxLines={maxLinesPerRow}
                lineHeight={1.02}
                letterSpacing={theme.mood.tracking}
                uppercase={theme.style.uppercaseHeadings}
                color={isAccent ? theme.palette.accent : theme.palette.text}
                align="center"
                animIn={idx % 2 === 0 ? 'slam' : 'mask-up'}
                animOut={motion.animOut}
                ease="snappy"
                delayFrames={delay}
                animDurationFrames={12}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
