'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeDrawProgress,
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import {
  KitButton,
  KitDivider,
  KitStack,
  KitText,
} from '../elements';
import { getStyleCardShadow } from '../styles';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  clampMaxWidth,
  minBodyPx,
  minTextPx,
  readSlotString,
  type LayoutProps,
} from './types';

export function CtaLayout({
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

  const kicker = readSlotString(slots, 'kicker');
  const headline = readSlotString(slots, 'headline', 'Start creating today');
  const sub = readSlotString(slots, 'sub');
  const buttonText = readSlotString(slots, 'buttonText', 'Get Started');
  const url = readSlotString(slots, 'url');
  const icon = readSlotString(slots, 'icon', 'arrow-right');

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  const kickerMin = minTextPx(u, 3.2);
  const titleMin = Math.round(px(u, isVertical ? 6.2 : 4.8));
  const titleMax = Math.round(px(u, isVertical ? 10.8 : 9.0));
  const subMin = minBodyPx(u, 3.4);
  const subMax = Math.round(px(u, isVertical ? 4.2 : 3.8));
  const urlMin = minTextPx(u, 3.2);

  // Variant B: Bold accent color block card with high-contrast inverted button inside
  if (variant === 'b') {
    const blockIn = computeEntranceStyle({
      preset: 'pop',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 16,
      ease: motion.ease,
    });
    const blockOut = computeExitStyle({
      preset: motion.animOut,
      frame,
      durationInFrames,
    });
    const blockMotion = mergeMotionStyles(blockIn, blockOut);

    const cardWidthB = isVertical ? contentWidth : Math.round(contentWidth * 0.88);
    const cardPadB = Math.round(px(u, isVertical ? 4.8 : 4.0));
    const cardInnerWidthB = clampMaxWidth(
      cardWidthB - cardPadB * 2,
      contentWidth,
      'cta.b.inner'
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
              width: cardWidthB,
              boxSizing: 'border-box',
              minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
              backgroundColor: theme.palette.accent,
              color: theme.palette.onAccent,
              borderRadius: Math.round(px(u, 2.6) * theme.mood.radiusScale),
              padding: cardPadB,
              boxShadow: getStyleCardShadow(
                theme.style,
                theme.palette.accent2,
                theme.palette.text
              ),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, 2.8)),
              ...blockMotion,
            }}
          >
            {kicker ? (
              <KitText
                text={kicker}
                maxWidth={cardInnerWidthB}
                maxHeight={Math.round(px(u, 7))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={kickerMin}
                maxSize={Math.round(px(u, 3.8))}
                maxLines={1}
                letterSpacing="0.12em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.onAccent}
                align="center"
                animIn="fade-down"
                animOut="none"
                delayFrames={beat0}
              />
            ) : null}

            <KitText
              text={headline}
              maxWidth={cardInnerWidthB}
              maxHeight={Math.round(contentHeight * 0.38)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={Math.round(px(u, isVertical ? 10.2 : 8.4))}
              maxLines={3}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.onAccent}
              align="center"
              animIn={motion.animIn}
              animOut="none"
              delayFrames={beat1}
            />

            {sub ? (
              <KitText
                text={sub}
                maxWidth={cardInnerWidthB}
                maxHeight={Math.round(contentHeight * 0.18)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={600}
                minSize={subMin}
                maxSize={subMax}
                maxLines={2}
                lineHeight={1.32}
                color={hexToRgba(theme.palette.onAccent, 0.85)}
                align="center"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}

            <KitButton
              text={buttonText}
              icon={icon}
              bgColor={theme.palette.bg}
              textColor={theme.palette.text}
              radius={Math.round(px(u, 1.6) * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={Math.round(px(u, isVertical ? 3.8 : 3.4))}
              paddingX={Math.round(px(u, 4.6))}
              paddingY={Math.round(px(u, 2.1))}
              animIn="pop"
              animOut="none"
              ambient="pulse"
              delayFrames={beat3}
            />

            {url ? (
              <KitText
                text={url}
                maxWidth={cardInnerWidthB}
                maxHeight={Math.round(px(u, 6.5))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={urlMin}
                maxSize={Math.round(px(u, 3.5))}
                maxLines={1}
                color={theme.palette.onAccent}
                align="center"
                animIn="fade"
                animOut="none"
                delayFrames={beat3}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Directional animated SVG arrow pointing into pulsing button
  if (variant === 'c') {
    const arrowP = computeDrawProgress({
      frame: entranceFrame,
      fps,
      delayFrames: beat1,
      durationFrames: 18,
      ease: 'snappy',
    });
    const arrowW = Math.round(px(u, 10));
    const arrowH = Math.round(px(u, 10));

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
            alignItems: isVertical ? 'flex-start' : 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: contentWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isVertical ? 'flex-start' : 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, 2.8)),
            }}
          >
            <KitText
              text={headline}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.42)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={3}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align={isVertical ? 'left' : 'center'}
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat0}
            />

            {sub ? (
              <KitText
                text={sub}
                maxWidth={
                  isVertical ? contentWidth : Math.round(contentWidth * 0.78)
                }
                maxHeight={Math.round(contentHeight * 0.2)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subMin}
                maxSize={subMax}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align={isVertical ? 'left' : 'center'}
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat1}
              />
            ) : null}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: Math.round(px(u, 2.4)),
              }}
            >
              <svg width={arrowW} height={arrowH} viewBox="0 0 100 100">
                <path
                  d="M 14 20 Q 22 72 86 72 M 66 54 L 86 72 L 66 88"
                  fill="none"
                  stroke={theme.palette.accent2}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={220}
                  strokeDashoffset={(1 - arrowP) * 220}
                />
              </svg>

              <KitButton
                text={buttonText}
                icon={icon}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={Math.round(px(u, 1.6) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={Math.round(px(u, isVertical ? 3.8 : 3.4))}
                paddingX={Math.round(px(u, 4.6))}
                paddingY={Math.round(px(u, 2.1))}
                animIn="pop"
                animOut={motion.animOut}
                ambient="pulse"
                delayFrames={beat2}
              />
            </div>

            {url ? (
              <KitText
                text={url}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 6.5))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={600}
                minSize={urlMin}
                maxSize={Math.round(px(u, 3.5))}
                maxLines={1}
                color={theme.palette.accent}
                align={isVertical ? 'left' : 'center'}
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat3}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Centered headline + button (zero text-overlapping background orb!)
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
            gap={Math.round(px(u, isVertical ? 3.2 : 2.6))}
            align="center"
            width={contentWidth}
          >
            {kicker ? (
              <KitText
                text={kicker}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 7))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={kickerMin}
                maxSize={Math.round(px(u, 3.8))}
                maxLines={1}
                letterSpacing="0.1em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.accent2}
                align="center"
                animIn="fade-down"
                animOut={motion.animOut}
                delayFrames={beat0}
              />
            ) : null}

            <KitText
              text={headline}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.44)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={3}
              lineHeight={1.08}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat1}
            />

            {sub ? (
              <KitText
                text={sub}
                maxWidth={Math.round(contentWidth * (isVertical ? 0.94 : 0.76))}
                maxHeight={Math.round(contentHeight * 0.22)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subMin}
                maxSize={subMax}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}

            <div style={{ marginTop: Math.round(px(u, 0.8)) }}>
              <KitButton
                text={buttonText}
                icon={icon}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={Math.round(px(u, 1.6) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={Math.round(px(u, isVertical ? 3.8 : 3.4))}
                paddingX={Math.round(px(u, 4.6))}
                paddingY={Math.round(px(u, 2.1))}
                animIn="pop"
                animOut={motion.animOut}
                ambient="pulse"
                ease={motion.ease}
                delayFrames={beat2}
              />
            </div>

            {url ? (
              <>
                <KitDivider
                  width={Math.round(px(u, 12))}
                  thickness={Math.max(2, Math.round(px(u, 0.35)))}
                  color={theme.palette.muted}
                  animOut={motion.animOut}
                  delayFrames={beat3}
                />
                <KitText
                  text={url}
                  maxWidth={contentWidth}
                  maxHeight={Math.round(px(u, 6.5))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={600}
                  minSize={urlMin}
                  maxSize={Math.round(px(u, 3.5))}
                  maxLines={1}
                  letterSpacing="0.03em"
                  color={theme.palette.muted}
                  align="center"
                  animIn="fade-up"
                  animOut={motion.animOut}
                  delayFrames={beat3}
                />
              </>
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
