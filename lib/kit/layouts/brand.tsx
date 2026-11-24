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
  KitBadge,
  KitDivider,
  KitIcon,
  KitStack,
  KitText,
} from '../elements';
import { getStyleCardShadow } from '../styles';
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

export function BrandLayout({
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

  const brandName = readSlotString(slots, 'brandName', 'Brand');
  const tagline = readSlotString(slots, 'tagline');
  const badge = readSlotString(slots, 'badge');
  const url = readSlotString(slots, 'url');
  const icon = readSlotString(slots, 'icon', 'sparkles');

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  const emblemSize = Math.round(px(u, isVertical ? 16 : 13.5));

  const emblemIn = computeEntranceStyle({
    preset: 'pop',
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 16,
    ease: motion.ease,
  });
  const emblemOut = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const emblemMotion = mergeMotionStyles(emblemIn, emblemOut);
  const cardSurface = getStyleSurfaceCardProps(theme, true);

  const nameMin = Math.round(px(u, isVertical ? 6.4 : 5.0));
  const nameMax = Math.round(px(u, isVertical ? 10.6 : 9.0));
  const taglineMin = minBodyPx(u, 3.4);
  const taglineMax = Math.round(px(u, 4.2));
  const smallMin = minTextPx(u, 3.2);

  // Variant B: Giant muted watermark wordmark behind + foreground name & tagline
  if (variant === 'b') {
    const wmIn = computeEntranceStyle({
      preset: 'zoom',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 22,
      ease: 'cinematic',
    });
    const wmMotion = mergeMotionStyles(wmIn, emblemOut);
    const wmBox = clampLayoutBox(
      {
        x: 0,
        y: isVertical ? safe.top : safe.top * 0.65,
        w: width,
        h: Math.round(px(u, isVertical ? 24 : 20)),
      },
      width,
      height,
      'brand.b.watermark'
    );
    const cardWidth = isVertical ? contentWidth : Math.round(contentWidth * 0.86);
    const cardPad = Math.round(px(u, isVertical ? 4.4 : 3.6));
    const cardInnerWidth = clampMaxWidth(
      cardWidth - cardPad * 2,
      cardWidth - cardPad * 2,
      'brand.b.cardInner'
    );

    return (
      <AbsoluteFill>
        {/* Low-opacity watermark bounded cleanly within canvas edges */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: wmBox.y,
            left: wmBox.x,
            width: wmBox.w,
            paddingLeft: Math.round(safe.left * 0.4),
            paddingRight: Math.round(safe.right * 0.4),
            boxSizing: 'border-box',
            textAlign: 'center',
            fontFamily: theme.titleFontFamily,
            fontWeight: 800,
            fontSize: Math.round(px(u, isVertical ? 22 : 18)),
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            color: hexToRgba(theme.palette.accent, 0.09),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            pointerEvents: 'none',
            ...wmMotion,
          }}
        >
          {brandName}
        </div>

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
              width: cardWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              borderRadius: Math.round(px(u, 2.0) * theme.mood.radiusScale),
              padding: cardPad,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, 2.4)),
              ...cardSurface,
            }}
          >
            <div
              style={{
                width: Math.round(emblemSize * 0.85),
                height: Math.round(emblemSize * 0.85),
                borderRadius: Math.round(px(u, 1.7) * theme.mood.radiusScale),
                background: `linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...emblemMotion,
              }}
            >
              <KitIcon
                name={icon}
                size={Math.round(emblemSize * 0.45)}
                color={theme.palette.onAccent}
              />
            </div>

            <KitText
              text={brandName}
              maxWidth={cardInnerWidth}
              maxHeight={Math.round(contentHeight * 0.28)}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={nameMin}
              maxSize={nameMax}
              maxLines={2}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut={motion.animOut}
              delayFrames={beat1}
            />

            {tagline ? (
              <KitText
                text={tagline}
                maxWidth={Math.round(cardInnerWidth * 0.92)}
                maxHeight={Math.round(contentHeight * 0.18)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={taglineMin}
                maxSize={taglineMax}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}

            {url ? (
              <KitBadge
                text={url}
                bgColor={hexToRgba(theme.palette.accent, 0.16)}
                textColor={theme.palette.accent}
                borderColor={hexToRgba(theme.palette.accent, 0.4)}
                borderWidth={theme.mood.borderWidth}
                radius={Math.round(px(u, 0.95) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={smallMin}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 0.9))}
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

  // Variant C: Framed crest + horizontal rules flanking icon
  if (variant === 'c') {
    const ruleP = computeDrawProgress({
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 18,
      ease: 'cinematic',
    });
    const ruleThickness = Math.max(2, Math.round(px(u, 0.28)));
    const containerW = isVertical ? contentWidth : Math.round(contentWidth * 0.88);
    const badgeRadius = Math.round(px(u, 0.95) * theme.mood.radiusScale);

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
              width: containerW,
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, 2.8)),
            }}
          >
            {/* Flanking rules + crest */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: Math.round(px(u, 2.4)),
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: ruleThickness,
                  backgroundColor: theme.palette.accent,
                  transform: `scaleX(${ruleP.toFixed(3)})`,
                  transformOrigin: 'right center',
                }}
              />
              <div
                style={{
                  width: emblemSize,
                  height: emblemSize,
                  borderRadius: '9999px',
                  border: `${ruleThickness}px solid ${theme.palette.accent}`,
                  backgroundColor: theme.palette.surface,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  ...emblemMotion,
                }}
              >
                <KitIcon
                  name={icon}
                  size={Math.round(emblemSize * 0.48)}
                  color={theme.palette.accent}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  height: ruleThickness,
                  backgroundColor: theme.palette.accent,
                  transform: `scaleX(${ruleP.toFixed(3)})`,
                  transformOrigin: 'left center',
                }}
              />
            </div>

            <KitText
              text={brandName}
              maxWidth={containerW}
              maxHeight={Math.round(contentHeight * 0.28)}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={nameMin}
              maxSize={nameMax}
              maxLines={2}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut={motion.animOut}
              delayFrames={beat1}
            />

            {tagline ? (
              <KitText
                text={tagline}
                maxWidth={Math.round(containerW * 0.9)}
                maxHeight={Math.round(contentHeight * 0.18)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={taglineMin}
                maxSize={taglineMax}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: Math.round(px(u, 1.6)),
              }}
            >
              {badge ? (
                <KitBadge
                  text={badge}
                  bgColor={theme.palette.accent}
                  textColor={theme.palette.onAccent}
                  radius={badgeRadius}
                  fontFamily={theme.bodyFontFamily}
                  fontSize={smallMin}
                  paddingX={Math.round(px(u, 2.4))}
                  paddingY={Math.round(px(u, 0.9))}
                  animIn="pop"
                  animOut={motion.animOut}
                  delayFrames={beat3}
                />
              ) : null}
              {url ? (
                <KitBadge
                  text={url}
                  bgColor={theme.palette.surface}
                  textColor={theme.palette.text}
                  borderColor={hexToRgba(theme.palette.text, 0.2)}
                  borderWidth={Math.max(1, Math.round(px(u, 0.15)))}
                  radius={badgeRadius}
                  fontFamily={theme.bodyFontFamily}
                  fontSize={smallMin}
                  paddingX={Math.round(px(u, 2.4))}
                  paddingY={Math.round(px(u, 0.9))}
                  animIn="fade-up"
                  animOut={motion.animOut}
                  delayFrames={beat3}
                />
              ) : null}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Emblem + wordmark reveal (without center text-crossing ring)
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
            gap={Math.round(px(u, isVertical ? 3.0 : 2.4))}
            align="center"
            width={contentWidth}
          >
            <div
              style={{
                width: emblemSize,
                height: emblemSize,
                borderRadius: Math.round(px(u, 2.0) * theme.mood.radiusScale),
                background: `linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: getStyleCardShadow(
                  theme.style,
                  theme.palette.accent,
                  theme.palette.text
                ),
                ...emblemMotion,
              }}
            >
              <KitIcon
                name={icon}
                size={Math.round(emblemSize * 0.52)}
                color={theme.palette.onAccent}
                strokeWidth={2.3}
              />
            </div>

            <KitText
              text={brandName}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.28)}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={nameMin}
              maxSize={nameMax}
              maxLines={2}
              lineHeight={1.06}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat1}
            />

            <KitDivider
              width={Math.round(px(u, 14))}
              thickness={Math.max(Math.round(px(u, 0.35)), Math.round(px(u, 0.55)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut={motion.animOut}
              delayFrames={beat2}
            />

            {tagline ? (
              <KitText
                text={tagline}
                maxWidth={Math.round(contentWidth * 0.88)}
                maxHeight={Math.round(contentHeight * 0.18)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={taglineMin}
                maxSize={taglineMax}
                maxLines={2}
                lineHeight={1.32}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat2}
              />
            ) : null}

            {badge ? (
              <KitBadge
                text={badge}
                bgColor={hexToRgba(theme.palette.surface, 0.96)}
                textColor={theme.palette.text}
                borderColor={hexToRgba(theme.palette.accent, 0.45)}
                borderWidth={theme.mood.borderWidth}
                radius={Math.round(px(u, 0.95) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={smallMin}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 1.0))}
                animIn="fade-up"
                animOut={motion.animOut}
                delayFrames={beat3}
              />
            ) : null}

            {url ? (
              <KitText
                text={url}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 6.5))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={600}
                minSize={smallMin}
                maxSize={Math.round(px(u, 3.5))}
                maxLines={1}
                color={theme.palette.accent2}
                align="center"
                animIn="fade"
                animOut={motion.animOut}
                delayFrames={beat3}
              />
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
