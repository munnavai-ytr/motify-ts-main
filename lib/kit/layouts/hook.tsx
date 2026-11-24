'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import {
  KitBadge,
  KitDivider,
  KitIcon,
  KitStack,
  KitText,
} from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  clampLayoutBox,
  clampMaxWidth,
  getStyleSurfaceCardProps,
  minBodyPx,
  minTextPx,
  readSlotString,
  type LayoutProps,
} from './types';

export function HookLayout({
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
  const headline = readSlotString(slots, 'headline', 'Stop scrolling');
  const sub = readSlotString(slots, 'sub');
  const icon = readSlotString(slots, 'icon', 'zap');

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const badgeFontSize = minTextPx(u, isVertical ? 3.4 : 3.2);
  const headlineMaxSize = Math.round(px(u, isVertical ? 11.8 : 10.4));
  const headlineMinSize = Math.round(px(u, isVertical ? 6.8 : 5.2));
  const subMinSize = minBodyPx(u, 3.4);
  const subMaxSize = Math.round(px(u, isVertical ? 4.8 : 4.2));

  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  // Variant B: Split/diagonal color band behind bold left-aligned text
  if (variant === 'b') {
    const bandIn = computeEntranceStyle({
      preset: 'slide-right',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 14,
      ease: motion.ease,
    });
    const bandOut = computeExitStyle({
      preset: motion.animOut,
      frame,
      durationInFrames,
    });
    const bandMotion = mergeMotionStyles(bandIn, bandOut);
    const cardSurface = getStyleSurfaceCardProps(theme, true);
    const bandBorderW = Math.max(2, Math.round(px(u, 0.28)));
    const bandBox = clampLayoutBox(
      {
        x: 0,
        y: isVertical ? height * 0.24 : height * 0.18,
        w: width,
        h: isVertical ? height * 0.52 : height * 0.64,
      },
      width,
      height,
      'hook.b.band'
    );
    const cardPad = Math.round(px(u, isVertical ? 4.4 : 3.6));
    const cardInnerWidth = clampMaxWidth(
      contentWidth - cardPad * 2,
      contentWidth - cardPad * 2,
      'hook.b.cardInner'
    );

    return (
      <AbsoluteFill>
        {/* Diagonal color band behind content bounded within canvas */}
        <div
          style={{
            position: 'absolute',
            left: bandBox.x,
            width: bandBox.w,
            top: bandBox.y,
            height: bandBox.h,
            background: `linear-gradient(125deg, ${hexToRgba(theme.palette.accent, 0.22)}, ${hexToRgba(theme.palette.accent2, 0.12)})`,
            borderTop: `${bandBorderW}px solid ${hexToRgba(theme.palette.accent, 0.55)}`,
            borderBottom: `${bandBorderW}px solid ${hexToRgba(theme.palette.accent2, 0.35)}`,
            transform: `skewY(-4deg) ${bandMotion.transform !== 'none' ? bandMotion.transform : ''}`,
            opacity: bandMotion.opacity,
            pointerEvents: 'none',
          }}
        />

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
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: '100%',
              minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
              padding: cardPad,
              borderRadius: Math.round(px(u, 2.0) * theme.mood.radiusScale),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: Math.round(px(u, 3.0)),
              ...cardSurface,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: Math.round(px(u, 2.0)),
              }}
            >
              {kicker ? (
                <KitBadge
                  text={kicker}
                  icon={icon}
                  bgColor={theme.palette.accent}
                  textColor={theme.palette.onAccent}
                  radius={Math.round(px(u, 0.95) * theme.mood.radiusScale)}
                  fontFamily={theme.bodyFontFamily}
                  fontSize={badgeFontSize}
                  paddingX={Math.round(px(u, 2.4))}
                  paddingY={Math.round(px(u, 1.1))}
                  animIn="pop"
                  animOut={motion.animOut}
                  delayFrames={beat0}
                />
              ) : (
                <KitIcon
                  name={icon}
                  size={Math.round(px(u, 5.2))}
                  color={theme.palette.accent}
                  animIn="pop"
                  animOut={motion.animOut}
                  delayFrames={beat0}
                />
              )}
              <KitDivider
                width={Math.round(px(u, 10))}
                thickness={Math.max(Math.round(px(u, 0.38)), Math.round(px(u, 0.7)))}
                color={theme.palette.accent2}
                animOut={motion.animOut}
                delayFrames={beat1}
              />
            </div>

            <KitText
              text={headline}
              maxWidth={cardInnerWidth}
              maxHeight={Math.round(contentHeight * 0.44)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headlineMinSize}
              maxSize={headlineMaxSize}
              maxLines={isVertical ? 4 : 3}
              lineHeight={1.05}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="left"
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat1}
            />

            {sub ? (
              <KitText
                text={sub}
                maxWidth={cardInnerWidth}
                maxHeight={Math.round(contentHeight * 0.22)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subMinSize}
                maxSize={subMaxSize}
                maxLines={3}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="left"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Badge pinned top + giant masked headline center + sub pinned bottom
  if (variant === 'c') {
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
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: isVertical ? Math.round(px(u, 4)) : 0,
            paddingBottom: isVertical ? Math.round(px(u, 4)) : 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {kicker ? (
              <KitBadge
                text={kicker}
                icon={icon}
                bgColor={hexToRgba(theme.palette.accent, 0.18)}
                textColor={theme.palette.accent}
                borderColor={theme.palette.accent}
                borderWidth={theme.mood.borderWidth}
                radius={Math.round(px(u, 1.1) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={badgeFontSize}
                paddingX={Math.round(px(u, 2.6))}
                paddingY={Math.round(px(u, 1.1))}
                animIn="drop"
                animOut={motion.animOut}
                delayFrames={beat0}
              />
            ) : (
              <KitIcon
                name={icon}
                size={Math.round(px(u, 5.6))}
                color={theme.palette.accent}
                animIn="drop"
                animOut={motion.animOut}
                delayFrames={beat0}
              />
            )}
          </div>

          <KitText
            text={headline}
            maxWidth={contentWidth}
            maxHeight={Math.round(contentHeight * 0.52)}
            fontFamily={theme.titleFontFamily}
            fontWeight={theme.mood.titleWeight}
            minSize={headlineMinSize}
            maxSize={Math.round(px(u, isVertical ? 12.0 : 10.6))}
            maxLines={isVertical ? 4 : 3}
            lineHeight={1.04}
            letterSpacing={theme.mood.tracking}
            uppercase={theme.style.uppercaseHeadings}
            color={theme.palette.text}
            align="center"
            animIn="mask-up"
            animOut={motion.animOut}
            ease={motion.ease}
            delayFrames={beat1}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: Math.round(px(u, 1.8)),
              width: '100%',
            }}
          >
            <KitDivider
              width={Math.round(px(u, 18))}
              thickness={Math.max(Math.round(px(u, 0.38)), Math.round(px(u, 0.65)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut={motion.animOut}
              delayFrames={beat2}
            />
            {sub ? (
              <KitText
                text={sub}
                maxWidth={isVertical ? contentWidth : Math.round(contentWidth * 0.8)}
                maxHeight={Math.round(contentHeight * 0.2)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subMinSize}
                maxSize={subMaxSize}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="center"
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

  // Variant A (Default): Big centered/vertical-balanced text + accent bar
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
          alignItems: isVertical ? 'flex-start' : 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: isVertical ? 'flex-start' : 'center',
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 3.6 : 2.8))}
            align={isVertical ? 'flex-start' : 'center'}
            width={contentWidth}
          >
            {kicker ? (
              <KitBadge
                text={kicker}
                icon={icon}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={Math.round(px(u, 1.1) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={badgeFontSize}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 1.1))}
                animIn="pop"
                animOut={motion.animOut}
                ease={motion.ease}
                delayFrames={beat0}
              />
            ) : (
              <div
                style={{
                  width: Math.round(px(u, 9)),
                  height: Math.round(px(u, 9)),
                  borderRadius: Math.round(px(u, 1.7) * theme.mood.radiusScale),
                  backgroundColor: hexToRgba(theme.palette.accent, 0.16),
                  border: `${Math.max(1, Math.round(px(u, theme.mood.borderWidth * 0.14)))}px solid ${theme.palette.accent}`,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KitIcon
                  name={icon}
                  size={Math.round(px(u, 4.6))}
                  color={theme.palette.accent}
                  animIn="pop"
                  animOut={motion.animOut}
                  delayFrames={beat0}
                />
              </div>
            )}

            <KitText
              text={headline}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * (sub ? 0.5 : 0.66))}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headlineMinSize}
              maxSize={headlineMaxSize}
              maxLines={isVertical ? 4 : 3}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align={isVertical ? 'left' : 'center'}
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat1}
            />

            <KitDivider
              width={Math.round(px(u, isVertical ? 22 : 16))}
              thickness={Math.max(Math.round(px(u, 0.45)), Math.round(px(u, 0.85)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat2}
            />

            {sub ? (
              <KitText
                text={sub}
                maxWidth={
                  isVertical ? contentWidth : Math.round(contentWidth * 0.84)
                }
                maxHeight={Math.round(contentHeight * 0.24)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subMinSize}
                maxSize={subMaxSize}
                maxLines={3}
                lineHeight={1.32}
                letterSpacing="0em"
                color={theme.palette.muted}
                align={isVertical ? 'left' : 'center'}
                animIn="fade-up"
                animOut={motion.animOut}
                ease={motion.ease}
                delayFrames={beat3}
              />
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
