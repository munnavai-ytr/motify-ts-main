'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import {
  KitBadge,
  KitCounter,
  KitDivider,
  KitIcon,
  KitStack,
  KitText,
} from '../elements';
import {
  SAFE_AREAS,
  containsBengali,
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

function parseNumericMetric(raw: unknown): {
  valid: boolean;
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
} {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const str = String(raw);
    const dec = str.includes('.') ? str.split('.')[1]?.length ?? 0 : 0;
    return { valid: true, value: raw, decimals: dec, prefix: '', suffix: '' };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const match = trimmed.match(/^([^\d.-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
    if (match) {
      const numeric = Number(match[2].replace(/,/g, ''));
      if (Number.isFinite(numeric)) {
        const dec = match[2].includes('.')
          ? match[2].split('.')[1]?.length ?? 0
          : 0;
        return {
          valid: true,
          value: numeric,
          decimals: Math.min(2, dec),
          prefix: match[1] ?? '',
          suffix: match[3] ?? '',
        };
      }
    }
  }
  return { valid: false, value: 0, decimals: 0, prefix: '', suffix: '' };
}

export function StatLayout({
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
  const isLandscape = format === '16:9';

  const kicker = readSlotString(slots, 'kicker');
  const label = readSlotString(slots, 'label', 'Performance growth');
  const delta = readSlotString(slots, 'delta');
  const unit = readSlotString(slots, 'unit');
  const icon = readSlotString(slots, 'icon', 'trending-up');

  const parsed = parseNumericMetric(slots.value);
  const hasBengaliCopy = containsBengali(`${kicker} ${label} ${delta} ${unit}`);
  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;

  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  const panelIn = computeEntranceStyle({
    preset: 'fade-up',
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 16,
    ease: motion.ease,
  });
  const panelOut = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const panelMotion = mergeMotionStyles(panelIn, panelOut);
  const cardSurface = getStyleSurfaceCardProps(theme, true);

  const kickerMin = minTextPx(u, 3.2);
  const labelMin = minBodyPx(u, 3.4);
  const labelMax = Math.round(px(u, isVertical ? 4.4 : 4.0));
  const deltaSize = minTextPx(u, 3.2);

  // Variant B: Mega number filling screen width + label tucked cleanly below
  if (variant === 'b') {
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
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.round(px(u, isVertical ? 3.2 : 2.2)),
              ...panelMotion,
            }}
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
                letterSpacing="0.12em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.accent}
                align="center"
                animIn="fade-down"
                animOut="none"
                delayFrames={beat0}
              />
            ) : null}

            {parsed.valid ? (
              <KitCounter
                to={parsed.value}
                decimals={parsed.decimals}
                prefix={parsed.prefix}
                suffix={unit ? `${parsed.suffix}${unit}` : parsed.suffix}
                bengaliDigits={hasBengaliCopy}
                fontFamily={theme.titleFontFamily}
                fontSize={Math.round(px(u, isVertical ? 18.0 : 16.5))}
                minSize={Math.round(px(u, 7.0))}
                maxWidth={contentWidth}
                maxHeight={Math.round(contentHeight * 0.42)}
                fontWeight={800}
                color={theme.palette.accent2}
                animIn="slam"
                animOut="none"
                ease={motion.ease}
                delayFrames={beat1}
              />
            ) : (
              <KitText
                text={readSlotString(slots, 'value', '99%')}
                maxWidth={contentWidth}
                maxHeight={Math.round(contentHeight * 0.42)}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={Math.round(px(u, 6.4))}
                maxSize={Math.round(px(u, 16.5))}
                maxLines={1}
                color={theme.palette.accent2}
                align="center"
                animIn="slam"
                animOut="none"
                delayFrames={beat1}
              />
            )}

            <KitDivider
              width={Math.round(px(u, 20))}
              thickness={Math.max(Math.round(px(u, 0.35)), Math.round(px(u, 0.7)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut="none"
              delayFrames={beat2}
            />

            <KitText
              text={label}
              maxWidth={Math.round(contentWidth * 0.9)}
              maxHeight={Math.round(contentHeight * 0.24)}
              fontFamily={theme.bodyFontFamily}
              fontWeight={600}
              minSize={labelMin}
              maxSize={labelMax}
              maxLines={2}
              lineHeight={1.25}
              color={theme.palette.text}
              align="center"
              animIn="fade-up"
              animOut="none"
              delayFrames={beat2}
            />

            {delta ? (
              <KitBadge
                text={delta}
                icon={icon}
                bgColor={theme.palette.accent}
                textColor={theme.palette.onAccent}
                radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={deltaSize}
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

  // Variant C: Split hero stat + delta pill card
  if (variant === 'c') {
    const cardWidthC = isLandscape ? Math.round(contentWidth * 0.9) : contentWidth;
    const cardPadC = Math.round(px(u, isVertical ? 4.4 : 3.8));
    const cardInnerWidthC = clampMaxWidth(
      cardWidthC - cardPadC * 2,
      contentWidth,
      'stat.c.inner'
    );
    const colGapC = Math.round(px(u, 3.2));
    const leftColWidthC = isLandscape
      ? clampMaxWidth(Math.round((cardInnerWidthC - colGapC) * 0.48), cardInnerWidthC, 'stat.c.left')
      : cardInnerWidthC;
    const rightColPadC = isLandscape ? colGapC : 0;
    const rightColWidthC = isLandscape
      ? clampMaxWidth(
          Math.round((cardInnerWidthC - colGapC) * 0.48) - rightColPadC,
          cardInnerWidthC,
          'stat.c.right'
        )
      : cardInnerWidthC;
    const splitBorderW = Math.max(1, Math.round(px(u, 0.15)));

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
              width: cardWidthC,
              minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
              borderRadius: Math.round(px(u, 2.4) * theme.mood.radiusScale),
              padding: cardPadC,
              display: 'flex',
              flexDirection: isLandscape ? 'row' : 'column',
              alignItems: isLandscape ? 'center' : 'flex-start',
              justifyContent: 'space-between',
              gap: colGapC,
              ...cardSurface,
              ...panelMotion,
            }}
          >
            <div
              style={{
                flex: isLandscape ? '1 1 48%' : undefined,
                minWidth: 0,
                width: isLandscape ? undefined : '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: Math.round(px(u, 1.8)),
              }}
            >
              {kicker ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.2)),
                  }}
                >
                  <KitIcon
                    name={icon}
                    size={Math.round(px(u, 3.4))}
                    color={theme.palette.accent}
                  />
                  <KitText
                    text={kicker}
                    maxWidth={clampMaxWidth(
                      leftColWidthC - Math.round(px(u, 4.8)),
                      leftColWidthC,
                      'stat.c.kicker'
                    )}
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={700}
                    minSize={kickerMin}
                    maxSize={Math.round(px(u, 3.6))}
                    maxLines={1}
                    letterSpacing="0.08em"
                    uppercase={theme.style.uppercaseKickers}
                    color={theme.palette.accent}
                    align="left"
                    animIn="fade"
                    animOut="none"
                  />
                </div>
              ) : null}

              {parsed.valid ? (
                <KitCounter
                  to={parsed.value}
                  decimals={parsed.decimals}
                  prefix={parsed.prefix}
                  suffix={unit ? `${parsed.suffix}${unit}` : parsed.suffix}
                  bengaliDigits={hasBengaliCopy}
                  fontFamily={theme.titleFontFamily}
                  fontSize={Math.round(px(u, isVertical ? 14.2 : 12.2))}
                  minSize={Math.round(px(u, 6.0))}
                  maxWidth={leftColWidthC}
                  fontWeight={800}
                  color={theme.palette.text}
                  align="left"
                  animIn="fade-up"
                  animOut="none"
                  ease={motion.ease}
                  delayFrames={beat1}
                />
              ) : (
                <KitText
                  text={readSlotString(slots, 'value', '99%')}
                  maxWidth={leftColWidthC}
                  maxHeight={Math.round(px(u, 20))}
                  fontFamily={theme.titleFontFamily}
                  fontWeight={800}
                  minSize={Math.round(px(u, 6.0))}
                  maxSize={Math.round(px(u, 13.5))}
                  maxLines={1}
                  color={theme.palette.text}
                  align="left"
                  animIn={motion.animIn}
                  animOut="none"
                />
              )}
            </div>

            <div
              style={{
                flex: isLandscape ? '1 1 46%' : undefined,
                minWidth: 0,
                boxSizing: 'border-box',
                width: isLandscape ? undefined : '100%',
                borderTop: isLandscape
                  ? 'none'
                  : `${splitBorderW}px solid ${hexToRgba(theme.palette.text, 0.14)}`,
                borderLeft: isLandscape
                  ? `${splitBorderW}px solid ${hexToRgba(theme.palette.text, 0.14)}`
                  : 'none',
                paddingTop: isLandscape ? 0 : Math.round(px(u, 2.6)),
                paddingLeft: rightColPadC,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: Math.round(px(u, 2.0)),
              }}
            >
              <KitText
                text={label}
                maxWidth={rightColWidthC}
                maxHeight={Math.round(contentHeight * 0.25)}
                fontFamily={theme.bodyFontFamily}
                fontWeight={600}
                minSize={labelMin}
                maxSize={labelMax}
                maxLines={3}
                lineHeight={1.28}
                color={theme.palette.muted}
                align="left"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />

              {delta ? (
                <KitBadge
                  text={delta}
                  icon={icon}
                  bgColor={theme.palette.accent2}
                  textColor={theme.palette.onAccent2}
                  radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                  fontFamily={theme.bodyFontFamily}
                  fontSize={deltaSize}
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
      </AbsoluteFill>
    );
  }

  // Variant A (Default): SVG Circular Progress Ring AROUND Counter (counter strictly fitted inside inner diameter!)
  const cardWidthA = isVertical ? contentWidth : Math.round(contentWidth * 0.86);
  const cardPadA = Math.round(px(u, isVertical ? 4.4 : 3.6));
  const cardInnerWidthA = clampMaxWidth(
    cardWidthA - cardPadA * 2,
    contentWidth,
    'stat.a.inner'
  );
  const ringDiameter = Math.min(
    Math.round(px(u, isVertical ? 44 : 36)),
    cardInnerWidthA,
    Math.round(contentHeight * 0.52)
  );
  const strokeW = Math.max(Math.round(px(u, 0.9)), Math.round(px(u, 1.4)));
  const radius = (ringDiameter - strokeW) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringProgress = computeProgress({
    frame: entranceFrame,
    fps,
    delayFrames: beat1,
    durationFrames: 30,
    ease: 'cinematic',
  });
  const targetSweep = parsed.valid && parsed.value <= 100 && parsed.value >= 10
    ? parsed.value / 100
    : 0.82;
  const dashOffset = circumference * (1 - targetSweep * ringProgress);
  const innerCounterBoxWidth = Math.max(
    Math.round(px(u, 12)),
    Math.round(ringDiameter - strokeW * 2 - px(u, 4.4))
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
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: cardWidthA,
            minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
            borderRadius: Math.round(px(u, 2.4) * theme.mood.radiusScale),
            padding: cardPadA,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            ...cardSurface,
            ...panelMotion,
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 2.6 : 1.8))}
            align="center"
            width="100%"
          >
            {kicker ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: Math.round(px(u, 1.2)),
                }}
              >
                <KitIcon
                  name={icon}
                  size={Math.round(px(u, 3.2))}
                  color={theme.palette.accent}
                />
                <KitText
                  text={kicker}
                  maxWidth={clampMaxWidth(
                    cardInnerWidthA - Math.round(px(u, 4.6)),
                    cardInnerWidthA,
                    'stat.a.kicker'
                  )}
                  maxHeight={Math.round(px(u, 7))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={700}
                  minSize={kickerMin}
                  maxSize={Math.round(px(u, 3.6))}
                  maxLines={1}
                  letterSpacing="0.08em"
                  uppercase={theme.style.uppercaseKickers}
                  color={theme.palette.accent}
                  align="center"
                  animIn="fade"
                  animOut="none"
                />
              </div>
            ) : null}

            {/* Ring drawn strictly outside the inner counter box */}
            <div
              style={{
                position: 'relative',
                width: ringDiameter,
                height: ringDiameter,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width={ringDiameter}
                height={ringDiameter}
                viewBox={`0 0 ${ringDiameter} ${ringDiameter}`}
                style={{ position: 'absolute', inset: 0 }}
              >
                <circle
                  cx={ringDiameter / 2}
                  cy={ringDiameter / 2}
                  r={radius}
                  fill="none"
                  stroke={hexToRgba(theme.palette.text, 0.12)}
                  strokeWidth={strokeW}
                />
                <circle
                  cx={ringDiameter / 2}
                  cy={ringDiameter / 2}
                  r={radius}
                  fill="none"
                  stroke={theme.palette.accent}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${ringDiameter / 2} ${ringDiameter / 2})`}
                />
              </svg>

              <div
                style={{
                  width: innerCounterBoxWidth,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {parsed.valid ? (
                  <KitCounter
                    to={parsed.value}
                    decimals={parsed.decimals}
                    prefix={parsed.prefix}
                    suffix={unit ? `${parsed.suffix}${unit}` : parsed.suffix}
                    bengaliDigits={hasBengaliCopy}
                    fontFamily={theme.titleFontFamily}
                    fontSize={Math.round(px(u, isVertical ? 11.2 : 9.8))}
                    minSize={Math.round(px(u, 3.6))}
                    maxWidth={innerCounterBoxWidth}
                    maxHeight={Math.round(innerCounterBoxWidth * 0.65)}
                    fontWeight={800}
                    color={theme.palette.text}
                    animIn="fade-up"
                    animOut="none"
                    ease={motion.ease}
                    delayFrames={beat1}
                  />
                ) : (
                  <KitText
                    text={readSlotString(slots, 'value', '99%')}
                    maxWidth={innerCounterBoxWidth}
                    maxHeight={Math.round(innerCounterBoxWidth * 0.65)}
                    fontFamily={theme.titleFontFamily}
                    fontWeight={800}
                    minSize={Math.round(px(u, 3.6))}
                    maxSize={Math.round(px(u, 10.8))}
                    maxLines={1}
                    color={theme.palette.text}
                    align="center"
                    animIn={motion.animIn}
                    animOut="none"
                  />
                )}
              </div>
            </div>

            <KitDivider
              width={Math.round(px(u, 14))}
              thickness={Math.max(Math.round(px(u, 0.3)), Math.round(px(u, 0.55)))}
              color={theme.palette.accent}
              secondaryColor={theme.palette.accent2}
              animOut="none"
              delayFrames={beat2}
            />

            <KitText
              text={label}
              maxWidth={cardInnerWidthA}
              maxHeight={Math.round(contentHeight * 0.22)}
              fontFamily={theme.bodyFontFamily}
              fontWeight={600}
              minSize={labelMin}
              maxSize={labelMax}
              maxLines={2}
              lineHeight={1.26}
              letterSpacing="0em"
              color={theme.palette.muted}
              align="center"
              animIn="fade-up"
              animOut="none"
              delayFrames={beat2}
            />

            {delta ? (
              <KitBadge
                text={delta}
                icon={icon}
                bgColor={theme.palette.accent2}
                textColor={theme.palette.onAccent2}
                radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                fontFamily={theme.bodyFontFamily}
                fontSize={deltaSize}
                paddingX={Math.round(px(u, 2.4))}
                paddingY={Math.round(px(u, 1.0))}
                animIn="pop"
                animOut="none"
                delayFrames={beat3}
              />
            ) : null}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
