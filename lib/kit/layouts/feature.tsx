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
  clampMaxWidth,
  getStyleSurfaceCardProps,
  minBodyPx,
  minTextPx,
  readSlotString,
  readSlotStringArray,
  type LayoutProps,
} from './types';

export function FeatureLayout({
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
  const isLandscape = format === '16:9';
  const isVertical = format === '9:16';

  const kicker = readSlotString(slots, 'kicker', 'Feature');
  const title = readSlotString(slots, 'title', 'Built for speed');
  const body = readSlotString(slots, 'body');
  const icon = readSlotString(slots, 'icon', 'layers');
  const highlights = readSlotStringArray(slots, 'highlights', 3);

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);

  const cardEntrance = computeEntranceStyle({
    preset: 'fade-up',
    frame: entranceFrame,
    fps,
    delayFrames: beat1,
    durationFrames: 18,
    ease: motion.ease,
  });
  const cardExit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const cardMotion = mergeMotionStyles(cardEntrance, cardExit);

  const cardRadius = Math.round(px(u, 1.85) * theme.mood.radiusScale);
  const badgeRadius = Math.round(px(u, 0.95) * theme.mood.radiusScale);
  const chipRadius = Math.round(px(u, 1.3) * theme.mood.radiusScale);
  const cardSurface = getStyleSurfaceCardProps(theme, false);

  const kickerFontSize = minTextPx(u, 3.2);
  const titleMin = Math.round(px(u, isVertical ? 5.8 : 4.6));
  const titleMax = Math.round(px(u, isVertical ? 8.6 : 6.8));
  const bodyMin = minBodyPx(u, 3.4);
  const bodyMax = Math.round(px(u, isVertical ? 4.2 : 3.8));
  const chipMin = minTextPx(u, 3.2);
  const chipMax = Math.round(px(u, 3.6));

  // Variant B: Big hero icon emblem above, copy center, 3 horizontal chips below
  if (variant === 'b') {
    const heroSize = Math.round(px(u, isVertical ? 14 : 11));
    const chipGap = Math.round(px(u, 1.5));
    const chipPadX = Math.round(px(u, 2.2));
    const chipIconW = Math.round(px(u, 3.0)) + Math.round(px(u, 1.2));
    const rowChipCount = Math.max(1, highlights.length);
    const chipBoxW = isVertical
      ? contentWidth
      : Math.floor((contentWidth - chipGap * (rowChipCount - 1)) / rowChipCount);
    const chipTextMaxW = clampMaxWidth(
      chipBoxW - chipPadX * 2 - chipIconW,
      chipBoxW - chipPadX * 2 - chipIconW,
      'feature.b.chipText'
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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: contentWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.62) : undefined,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Math.round(px(u, isVertical ? 3.0 : 2.2)),
            }}
          >
            <div
              style={{
                width: heroSize,
                height: heroSize,
                borderRadius: Math.round(px(u, 2.2) * theme.mood.radiusScale),
                background: `linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: cardSurface.boxShadow,
                ...cardMotion,
              }}
            >
              <KitIcon
                name={icon}
                size={Math.round(heroSize * 0.52)}
                color={theme.palette.onAccent}
                animIn="pop"
                animOut="none"
                ambient="float"
                delayFrames={beat0}
              />
            </div>

            <KitStack
              direction="column"
              gap={Math.round(px(u, 1.8))}
              align="center"
              width={contentWidth}
            >
              <KitBadge
                text={kicker}
                bgColor={hexToRgba(theme.palette.accent, 0.16)}
                textColor={theme.palette.accent}
                borderColor={hexToRgba(theme.palette.accent, 0.45)}
                borderWidth={theme.mood.borderWidth}
                radius={badgeRadius}
                fontFamily={theme.bodyFontFamily}
                fontSize={kickerFontSize}
                paddingX={Math.round(px(u, 2.2))}
                paddingY={Math.round(px(u, 0.9))}
                animIn="pop"
                animOut={motion.animOut}
                delayFrames={beat0}
              />

              <KitText
                text={title}
                maxWidth={contentWidth}
                maxHeight={Math.round(contentHeight * 0.28)}
                fontFamily={theme.titleFontFamily}
                fontWeight={theme.mood.titleWeight}
                minSize={titleMin}
                maxSize={titleMax}
                maxLines={2}
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

              {body ? (
                <KitText
                  text={body}
                  maxWidth={Math.round(contentWidth * (isVertical ? 0.95 : 0.78))}
                  maxHeight={Math.round(contentHeight * 0.22)}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={theme.mood.bodyWeight}
                  minSize={bodyMin}
                  maxSize={bodyMax}
                  maxLines={3}
                  lineHeight={1.34}
                  color={theme.palette.muted}
                  align="center"
                  animIn="fade-up"
                  animOut={motion.animOut}
                  delayFrames={beat2}
                />
              ) : null}
            </KitStack>

            {highlights.length > 0 ? (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: isVertical ? 'column' : 'row',
                  flexWrap: isVertical ? 'nowrap' : 'wrap',
                  justifyContent: 'center',
                  gap: Math.round(px(u, 1.5)),
                }}
              >
                {highlights.map((item, idx) => {
                  const chipDelay = resolveBeatDelay(
                    idx + 2,
                    fps,
                    motion.intensity,
                    0
                  );
                  const chipIn = computeEntranceStyle({
                    preset: 'pop',
                    frame: entranceFrame,
                    fps,
                    delayFrames: chipDelay,
                    durationFrames: 12,
                    ease: motion.ease,
                  });
                  const chipMotion = mergeMotionStyles(chipIn, cardExit);
                  return (
                    <div
                      key={`${item}-${idx}`}
                      style={{
                        flex: isVertical ? undefined : `1 1 ${Math.max(24, Math.floor(92 / rowChipCount))}%`,
                        boxSizing: 'border-box',
                        borderRadius: chipRadius,
                        paddingLeft: chipPadX,
                        paddingRight: chipPadX,
                        paddingTop: Math.round(px(u, 1.5)),
                        paddingBottom: Math.round(px(u, 1.5)),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isVertical ? 'flex-start' : 'center',
                        gap: Math.round(px(u, 1.2)),
                        ...cardSurface,
                        ...chipMotion,
                      }}
                    >
                      <KitIcon
                        name="check-circle"
                        size={Math.round(px(u, 3.0))}
                        color={theme.palette.accent2}
                      />
                      <KitText
                        text={item}
                        maxWidth={chipTextMaxW}
                        maxHeight={Math.round(px(u, 7.5))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={600}
                        minSize={chipMin}
                        maxSize={chipMax}
                        maxLines={2}
                        lineHeight={1.2}
                        color={theme.palette.text}
                        animIn="none"
                        animOut="none"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Numbered spotlight card with animated bullet ticks
  if (variant === 'c') {
    const spotlightIdx = `0${(sceneIndex % 9) + 1}`;
    const cardWidth = isLandscape ? Math.round(contentWidth * 0.88) : contentWidth;
    const cardPad = Math.round(px(u, isVertical ? 4.2 : 3.4));
    const cardInnerWidth = clampMaxWidth(
      cardWidth - cardPad * 2,
      cardWidth - cardPad * 2,
      'feature.c.cardInner'
    );
    const hairlineW = Math.max(1, Math.round(px(u, 0.15)));

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
              minHeight: isVertical ? Math.round(contentHeight * 0.62) : undefined,
              borderRadius: cardRadius,
              padding: cardPad,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: Math.round(px(u, 2.4)),
              ...getStyleSurfaceCardProps(theme, true),
              ...cardMotion,
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
              <KitBadge
                text={kicker}
                icon={icon}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={badgeRadius}
                fontFamily={theme.bodyFontFamily}
                fontSize={kickerFontSize}
                paddingX={Math.round(px(u, 2.2))}
                paddingY={Math.round(px(u, 0.95))}
                animIn="pop"
                animOut="none"
                delayFrames={beat0}
              />
              <span
                style={{
                  fontFamily: theme.titleFontFamily,
                  fontSize: Math.round(px(u, 5.8)),
                  fontWeight: 800,
                  color: hexToRgba(theme.palette.accent2, 0.72),
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                #{spotlightIdx}
              </span>
            </div>

            <KitText
              text={title}
              maxWidth={cardInnerWidth}
              maxHeight={Math.round(contentHeight * 0.3)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={3}
              lineHeight={1.08}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="left"
              animIn={motion.animIn}
              animOut="none"
              ease={motion.ease}
              delayFrames={beat1}
            />

            {body ? (
              <KitText
                text={body}
                maxWidth={cardInnerWidth}
                maxHeight={Math.round(contentHeight * 0.2)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={bodyMin}
                maxSize={bodyMax}
                maxLines={3}
                lineHeight={1.34}
                color={theme.palette.muted}
                align="left"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}

            {highlights.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: Math.round(px(u, 1.4)),
                  paddingTop: Math.round(px(u, 1.4)),
                  borderTop: `${hairlineW}px solid ${hexToRgba(theme.palette.text, 0.14)}`,
                }}
              >
                {highlights.map((item, idx) => {
                  const tickDelay = resolveBeatDelay(
                    idx + 2,
                    fps,
                    motion.intensity,
                    0
                  );
                  const rowIn = computeEntranceStyle({
                    preset: 'slide-left',
                    frame: entranceFrame,
                    fps,
                    delayFrames: tickDelay,
                    durationFrames: 12,
                    ease: motion.ease,
                  });
                  return (
                    <div
                      key={`${item}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: Math.round(px(u, 1.6)),
                        ...rowIn,
                      }}
                    >
                      <KitIcon
                        name="check"
                        size={Math.round(px(u, 3.0))}
                        color={theme.palette.accent}
                        strokeWidth={3}
                      />
                      <KitText
                        text={item}
                        maxWidth={Math.max(0, cardInnerWidth - Math.round(px(u, 4.6)))}
                        maxHeight={Math.round(px(u, 7))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={600}
                        minSize={chipMin}
                        maxSize={chipMax}
                        maxLines={2}
                        lineHeight={1.25}
                        color={theme.palette.text}
                        animIn="none"
                        animOut="none"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Text + showcase card side-by-side (16:9) or stacked (9:16 / 1:1)
  const textColumnWidth = isLandscape
    ? Math.round(contentWidth * 0.54)
    : contentWidth;
  const showcaseWidth = isLandscape
    ? Math.round(contentWidth * 0.41)
    : contentWidth;
  const showcasePad = Math.round(px(u, isVertical ? 3.6 : 3.0));
  const showcaseHighlightMaxW = clampMaxWidth(
    showcaseWidth - showcasePad * 2 - Math.round(px(u, 4.3)),
    showcaseWidth - showcasePad * 2 - Math.round(px(u, 4.3)),
    'feature.a.showcaseHighlight'
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
          flexDirection: isLandscape ? 'row' : 'column',
          alignItems: isLandscape ? 'center' : 'stretch',
          justifyContent: isLandscape ? 'space-between' : 'center',
          gap: Math.round(px(u, isLandscape ? 4 : 3.6)),
        }}
      >
        <KitStack
          direction="column"
          gap={Math.round(px(u, 2.2))}
          align="flex-start"
          width={textColumnWidth}
        >
          <KitBadge
            text={kicker}
            icon={icon}
            bgColor={hexToRgba(theme.palette.accent, 0.16)}
            textColor={theme.palette.accent}
            borderColor={hexToRgba(theme.palette.accent, 0.45)}
            borderWidth={theme.mood.borderWidth}
            radius={badgeRadius}
            fontFamily={theme.bodyFontFamily}
            fontSize={kickerFontSize}
            paddingX={Math.round(px(u, 2.2))}
            paddingY={Math.round(px(u, 0.95))}
            animIn="pop"
            animOut={motion.animOut}
            ease={motion.ease}
            delayFrames={beat0}
          />

          <KitText
            text={title}
            maxWidth={textColumnWidth}
            maxHeight={Math.round(contentHeight * (isLandscape ? 0.4 : 0.3))}
            fontFamily={theme.titleFontFamily}
            fontWeight={theme.mood.titleWeight}
            minSize={titleMin}
            maxSize={titleMax}
            maxLines={3}
            lineHeight={1.08}
            letterSpacing={theme.mood.tracking}
            uppercase={theme.style.uppercaseHeadings}
            color={theme.palette.text}
            align="left"
            animIn={motion.animIn}
            animOut={motion.animOut}
            ease={motion.ease}
            delayFrames={beat1}
          />

          <KitDivider
            width={Math.round(px(u, 14))}
            thickness={Math.max(Math.round(px(u, 0.38)), Math.round(px(u, 0.6)))}
            color={theme.palette.accent}
            secondaryColor={theme.palette.accent2}
            animOut={motion.animOut}
            ease={motion.ease}
            delayFrames={beat1 + 3}
          />

          {body ? (
            <KitText
              text={body}
              maxWidth={textColumnWidth}
              maxHeight={Math.round(contentHeight * 0.24)}
              fontFamily={theme.bodyFontFamily}
              fontWeight={theme.mood.bodyWeight}
              minSize={bodyMin}
              maxSize={bodyMax}
              maxLines={3}
              lineHeight={1.34}
              letterSpacing="0em"
              color={theme.palette.muted}
              align="left"
              animIn="fade-up"
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={beat2}
            />
          ) : null}
        </KitStack>

        <div
          style={{
            width: showcaseWidth,
            borderRadius: cardRadius,
            padding: showcasePad,
            display: 'flex',
            flexDirection: 'column',
            gap: Math.round(px(u, 2.2)),
            ...cardSurface,
            ...cardMotion,
          }}
        >
          <div
            style={{
              width: Math.round(px(u, 8.6)),
              height: Math.round(px(u, 8.6)),
              borderRadius: chipRadius,
              backgroundColor: theme.palette.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <KitIcon
              name={icon}
              size={Math.round(px(u, 4.6))}
              color={theme.palette.onAccent}
              animIn="pop"
              animOut={motion.animOut}
              ambient="float"
              delayFrames={beat2}
            />
          </div>

          {highlights.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: Math.round(px(u, 1.5)),
              }}
            >
              {highlights.map((item, idx) => {
                const delay = resolveBeatDelay(idx + 2, fps, motion.intensity, 0);
                const rowIn = computeEntranceStyle({
                  preset: 'fade-up',
                  frame: entranceFrame,
                  fps,
                  delayFrames: delay,
                  durationFrames: 12,
                  ease: motion.ease,
                });
                const rowMotion = mergeMotionStyles(rowIn, cardExit);
                return (
                  <div
                    key={`${item}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: Math.round(px(u, 1.5)),
                      ...rowMotion,
                    }}
                  >
                    <KitIcon
                      name="check-circle"
                      size={Math.round(px(u, 2.8))}
                      color={theme.palette.accent2}
                    />
                    <KitText
                      text={item}
                      maxWidth={showcaseHighlightMaxW}
                      maxHeight={Math.round(px(u, 7.6))}
                      fontFamily={theme.bodyFontFamily}
                      fontWeight={600}
                      minSize={chipMin}
                      maxSize={chipMax}
                      maxLines={2}
                      lineHeight={1.24}
                      letterSpacing="0em"
                      color={theme.palette.text}
                      animIn="none"
                      animOut="none"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
}
