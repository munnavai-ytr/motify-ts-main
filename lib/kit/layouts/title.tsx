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

export function TitleLayout({
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

  const kicker = readSlotString(slots, 'kicker');
  const title = readSlotString(slots, 'title', 'Untitled story');
  const subtitle = readSlotString(slots, 'subtitle');
  const tag = readSlotString(slots, 'tag');

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  const kickerMin = minTextPx(u, 3.2);
  const titleMin = Math.round(px(u, isVertical ? 6.6 : 5.0));
  const titleMax = Math.round(px(u, isVertical ? 11.4 : 9.8));
  const subtitleMin = minBodyPx(u, 3.4);
  const subtitleMax = Math.round(px(u, isVertical ? 4.4 : 3.8));

  // Variant B: Left-aligned editorial with oversized muted index number + vertical accent rule
  if (variant === 'b') {
    const barP = computeDrawProgress({
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 18,
      ease: 'cinematic',
    });
    const idxLabel = `0${(sceneIndex % 9) + 1}`;
    const exit = computeExitStyle({
      preset: motion.animOut,
      frame,
      durationInFrames,
    });

    const ruleWidth = Math.max(Math.round(px(u, 0.5)), Math.round(px(u, 0.9)));
    const ruleGap = Math.round(px(u, 3.2));
    const rightColWidth = clampMaxWidth(
      contentWidth - ruleWidth - ruleGap,
      contentWidth,
      'title.b.col'
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
              position: 'relative',
              width: contentWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
              display: 'flex',
              alignItems: 'stretch',
              gap: ruleGap,
              paddingTop: Math.round(px(u, 2)),
              paddingBottom: Math.round(px(u, 2)),
              opacity: exit.opacity,
              transform: exit.transform,
              boxSizing: 'border-box',
            }}
          >
            {/* Vertical editorial rule */}
            <div
              style={{
                width: ruleWidth,
                borderRadius: 999,
                background: `linear-gradient(180deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                transform: `scaleY(${barP.toFixed(4)})`,
                transformOrigin: 'top center',
                flexShrink: 0,
              }}
            />

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: Math.round(px(u, 2.8)),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: Math.round(px(u, 2)),
                }}
              >
                {kicker ? (
                  <KitText
                    text={kicker}
                    maxWidth={clampMaxWidth(
                      Math.round(rightColWidth * 0.72),
                      rightColWidth,
                      'title.b.kicker'
                    )}
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={700}
                    minSize={kickerMin}
                    maxSize={Math.round(px(u, 3.8))}
                    maxLines={1}
                    letterSpacing="0.1em"
                    uppercase={theme.style.uppercaseKickers}
                    color={theme.palette.accent}
                    align="left"
                    animIn="fade-up"
                    animOut="none"
                    delayFrames={beat0}
                  />
                ) : (
                  <span />
                )}
                <span
                  style={{
                    fontFamily: theme.titleFontFamily,
                    fontSize: Math.round(px(u, isVertical ? 11.5 : 9.2)),
                    fontWeight: 800,
                    lineHeight: 0.9,
                    color: hexToRgba(theme.palette.accent, 0.24),
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {idxLabel}
                </span>
              </div>

              <KitText
                text={title}
                maxWidth={rightColWidth}
                maxHeight={Math.round(contentHeight * 0.46)}
                fontFamily={theme.titleFontFamily}
                fontWeight={theme.mood.titleWeight}
                minSize={titleMin}
                maxSize={titleMax}
                maxLines={isVertical ? 4 : 3}
                lineHeight={1.06}
                letterSpacing={theme.mood.tracking}
                uppercase={theme.style.uppercaseHeadings}
                color={theme.palette.text}
                align="left"
                animIn={motion.animIn}
                animOut="none"
                ease={motion.ease}
                delayFrames={beat1}
              />

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: Math.round(px(u, 2.0)),
                }}
              >
                {subtitle ? (
                  <KitText
                    text={subtitle}
                    maxWidth={rightColWidth}
                    maxHeight={Math.round(contentHeight * 0.22)}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={theme.mood.bodyWeight}
                    minSize={subtitleMin}
                    maxSize={subtitleMax}
                    maxLines={3}
                    lineHeight={1.34}
                    color={theme.palette.muted}
                    align="left"
                    animIn="fade-up"
                    animOut="none"
                    delayFrames={beat2}
                  />
                ) : null}

                {tag ? (
                  <KitBadge
                    text={tag}
                    bgColor={theme.palette.accent}
                    textColor={theme.palette.onAccent}
                    radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                    fontFamily={theme.bodyFontFamily}
                    fontSize={minTextPx(u, 3.2)}
                    paddingX={Math.round(px(u, 2.4))}
                    paddingY={Math.round(px(u, 1.0))}
                    animIn="pop"
                    animOut="none"
                    delayFrames={beat3}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Boxed framed headline with animated corner brackets
  if (variant === 'c') {
    const bracketP = computeDrawProgress({
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 18,
      ease: 'snappy',
    });
    const boxIn = computeEntranceStyle({
      preset: 'fade-up',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 16,
      ease: motion.ease,
    });
    const boxOut = computeExitStyle({
      preset: motion.animOut,
      frame,
      durationInFrames,
    });
    const boxMotion = mergeMotionStyles(boxIn, boxOut);
    const cardSurface = getStyleSurfaceCardProps(theme, true);
    const cardWidth = isVertical ? contentWidth : Math.round(contentWidth * 0.88);
    const cardPad = Math.round(px(u, isVertical ? 5.2 : 4.2));
    const cardInnerWidth = clampMaxWidth(
      cardWidth - cardPad * 2,
      contentWidth,
      'title.c.inner'
    );
    const bracketArm = Math.round(px(u, 4.5));
    const bracketStroke = Math.max(2, Math.round(px(u, 0.38)));
    const bracketInset = Math.round(px(u, 0.9));
    const topLeftBracketBox = clampLayoutBox(
      {
        x: Math.round((contentWidth - cardWidth) / 2) + safe.left + bracketInset,
        y: safe.top + bracketInset,
        w: bracketArm,
        h: bracketArm,
      },
      width,
      height,
      'title.c.topLeftBracket'
    );
    void topLeftBracketBox;

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
              position: 'relative',
              width: cardWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              padding: cardPad,
              borderRadius: Math.round(px(u, 2.0) * theme.mood.radiusScale),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, 2.8)),
              ...cardSurface,
              ...boxMotion,
            }}
          >
            {/* Corner brackets safely inset inside frame bounds */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: bracketInset,
                left: bracketInset,
                width: bracketArm,
                height: bracketArm,
                borderTop: `${bracketStroke}px solid ${theme.palette.accent}`,
                borderLeft: `${bracketStroke}px solid ${theme.palette.accent}`,
                transform: `scale(${bracketP.toFixed(3)})`,
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: bracketInset,
                right: bracketInset,
                width: bracketArm,
                height: bracketArm,
                borderBottom: `${bracketStroke}px solid ${theme.palette.accent2}`,
                borderRight: `${bracketStroke}px solid ${theme.palette.accent2}`,
                transform: `scale(${bracketP.toFixed(3)})`,
                transformOrigin: 'bottom right',
                pointerEvents: 'none',
              }}
            />

            {kicker ? (
              <KitText
                text={kicker}
                maxWidth={cardInnerWidth}
                maxHeight={Math.round(px(u, 7))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={kickerMin}
                maxSize={Math.round(px(u, 3.8))}
                maxLines={1}
                letterSpacing="0.12em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.accent}
                align="center"
                animIn="fade-down"
                animOut="none"
                delayFrames={beat0}
              />
            ) : null}

            <KitText
              text={title}
              maxWidth={cardInnerWidth}
              maxHeight={Math.round(contentHeight * 0.44)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={Math.round(px(u, isVertical ? 10.4 : 8.8))}
              maxLines={isVertical ? 4 : 3}
              lineHeight={1.08}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut="none"
              ease={motion.ease}
              delayFrames={beat1}
            />

            <KitDivider
              width={Math.round(px(u, 16))}
              thickness={Math.max(Math.round(px(u, 0.35)), Math.round(px(u, 0.6)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut="none"
              delayFrames={beat2}
            />

            {subtitle ? (
              <KitText
                text={subtitle}
                maxWidth={cardInnerWidth}
                maxHeight={Math.round(contentHeight * 0.2)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subtitleMin}
                maxSize={subtitleMax}
                maxLines={3}
                lineHeight={1.34}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}

            {tag ? (
              <KitBadge
                text={tag}
                bgColor={hexToRgba(theme.palette.accent, 0.16)}
                textColor={theme.palette.accent}
                borderColor={hexToRgba(theme.palette.accent, 0.5)}
                borderWidth={theme.mood.borderWidth}
                radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={minTextPx(u, 3.2)}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 1.0))}
                animIn="pop"
                animOut="none"
                delayFrames={beat3}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Centered classic with crisp divider below title (never overlapping text!)
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
            minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 3.2 : 2.5))}
            align="center"
            width={contentWidth}
          >
            {kicker ? (
              <KitText
                text={kicker}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 8))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={kickerMin}
                maxSize={Math.round(px(u, 3.8))}
                maxLines={1}
                letterSpacing="0.12em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.accent}
                align="center"
                animIn="fade-down"
                animOut={motion.animOut}
                ease={motion.ease}
                delayFrames={beat0}
              />
            ) : null}

            <KitText
              text={title}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.5)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={isVertical ? 4 : 3}
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

            <KitDivider
              width={Math.round(px(u, 18))}
              thickness={Math.max(Math.round(px(u, 0.35)), Math.round(px(u, 0.65)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat2}
            />

            {subtitle ? (
              <KitText
                text={subtitle}
                maxWidth={Math.round(contentWidth * (isVertical ? 0.96 : 0.8))}
                maxHeight={Math.round(contentHeight * 0.24)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={subtitleMin}
                maxSize={subtitleMax}
                maxLines={3}
                lineHeight={1.34}
                letterSpacing="0em"
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut={motion.animOut}
                ease={motion.ease}
                delayFrames={beat2}
              />
            ) : null}

            {tag ? (
              <div style={{ marginTop: Math.round(px(u, 0.8)) }}>
                <KitBadge
                  text={tag}
                  bgColor={hexToRgba(theme.palette.surface, 0.96)}
                  textColor={theme.palette.text}
                  borderColor={hexToRgba(theme.palette.accent, 0.45)}
                  borderWidth={theme.mood.borderWidth}
                  radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                  fontFamily={theme.bodyFontFamily}
                  fontSize={minTextPx(u, 3.2)}
                  paddingX={Math.round(px(u, 2.5))}
                  paddingY={Math.round(px(u, 1.1))}
                  animIn="fade-up"
                  animOut={motion.animOut}
                  ease={motion.ease}
                  delayFrames={beat3}
                />
              </div>
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
