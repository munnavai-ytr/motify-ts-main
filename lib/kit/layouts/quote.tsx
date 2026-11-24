'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitBadge, KitDivider, KitStack, KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  clampMaxWidth,
  getStyleSurfaceCardProps,
  minBodyPx,
  readSlotString,
  type LayoutProps,
} from './types';

export function QuoteLayout({
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

  const quote = readSlotString(
    slots,
    'quote',
    'Great design feels effortless in motion.'
  );
  const author = readSlotString(slots, 'author', 'Design Lead');

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);

  const quoteMin = Math.round(px(u, isVertical ? 5.2 : 4.2));
  const quoteMax = Math.round(px(u, isVertical ? 7.8 : 6.6));
  const authorMin = minBodyPx(u, 3.4);
  const authorMax = Math.round(px(u, 4.0));

  // Variant B: Highlighted marker quote inside framed card + author badge
  if (variant === 'b') {
    const cardIn = computeEntranceStyle({
      preset: 'fade-up',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 16,
      ease: motion.ease,
    });
    const cardOut = computeExitStyle({
      preset: motion.animOut,
      frame,
      durationInFrames,
    });
    const cardMotion = mergeMotionStyles(cardIn, cardOut);
    const cardSurface = getStyleSurfaceCardProps(theme, true);

    const cardWidth = isVertical ? contentWidth : Math.round(contentWidth * 0.88);
    const cardPad = Math.round(px(u, isVertical ? 4.6 : 3.8));
    const cardInnerWidth = clampMaxWidth(
      cardWidth - cardPad * 2,
      contentWidth,
      'quote.b.inner'
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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: cardWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              borderRadius: Math.round(px(u, 2.2) * theme.mood.radiusScale),
              padding: cardPad,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: Math.round(px(u, 3.0)),
              ...cardSurface,
              ...cardMotion,
            }}
          >
            <KitDivider
              width={Math.round(px(u, 14))}
              thickness={Math.max(Math.round(px(u, 0.45)), Math.round(px(u, 0.8)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut="none"
              delayFrames={beat0}
            />

            <KitText
              text={quote}
              maxWidth={cardInnerWidth}
              maxHeight={Math.round(contentHeight * 0.44)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={quoteMin}
              maxSize={quoteMax}
              maxLines={isVertical ? 6 : 4}
              lineHeight={1.18}
              letterSpacing={theme.mood.tracking}
              highlightStyle="marker"
              color={theme.palette.text}
              align="left"
              animIn="highlight-sweep"
              animOut="none"
              delayFrames={beat1}
            />

            {author ? (
              <KitBadge
                text={`— ${author}`}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={authorMin}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 1.0))}
                animIn="pop"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Oversized quote mark SVG + centered editorial quote + author rule
  const markIn = computeEntranceStyle({
    preset: 'pop',
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 16,
    ease: motion.ease,
  });
  const markOut = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const markMotion = mergeMotionStyles(markIn, markOut);

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
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 3.0 : 2.2))}
            align="center"
            width={contentWidth}
          >
            <svg
              width={Math.round(px(u, 11))}
              height={Math.round(px(u, 8))}
              viewBox="0 0 110 80"
              style={markMotion}
            >
              <path
                d="M12 46 C12 24 26 10 44 6 L48 18 C36 22 30 30 30 40 L46 40 L46 72 L12 72 Z M62 46 C62 24 76 10 94 6 L98 18 C86 22 80 30 80 40 L96 40 L96 72 L62 72 Z"
                fill={hexToRgba(theme.palette.accent, 0.85)}
              />
            </svg>

            <KitText
              text={quote}
              maxWidth={Math.round(contentWidth * (isVertical ? 0.96 : 0.86))}
              maxHeight={Math.round(contentHeight * 0.46)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={quoteMin}
              maxSize={quoteMax}
              maxLines={isVertical ? 6 : 4}
              lineHeight={1.18}
              letterSpacing={theme.mood.tracking}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat1}
            />

            <KitDivider
              width={Math.round(px(u, 12))}
              thickness={Math.max(2, Math.round(px(u, 0.35)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut={motion.animOut}
              delayFrames={beat2}
            />

            {author ? (
              <KitText
                text={author}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 7))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={authorMin}
                maxSize={authorMax}
                maxLines={1}
                color={theme.palette.accent2}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
