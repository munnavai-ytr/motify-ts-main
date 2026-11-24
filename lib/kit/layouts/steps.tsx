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
import { KitStack, KitText, useKitSceneContext } from '../elements';
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

interface ParsedStepItem {
  title: string;
  detail?: string;
}

function readStepItems(slots: Record<string, unknown>): ParsedStepItem[] {
  const raw = slots.items;
  if (!Array.isArray(raw)) {
    return [
      { title: 'Pick your style', detail: 'Choose palette and pacing' },
      { title: 'Add key points', detail: 'Fill short structured slots' },
      { title: 'Export MP4', detail: 'Ready for any format' },
    ];
  }
  const out: ParsedStepItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ title: entry.trim() });
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      const detail = typeof rec.detail === 'string' ? rec.detail.trim() : undefined;
      if (title) {
        out.push({ title, detail });
      }
    }
    if (out.length >= 5) {
      break;
    }
  }
  return out.length > 0
    ? out
    : [{ title: 'Step one' }, { title: 'Step two' }, { title: 'Step three' }];
}

export function StepsLayout({
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

  const heading = readSlotString(slots, 'heading', 'How it works');
  const items = readStepItems(slots);
  const sceneCtx = useKitSceneContext();
  const useBn =
    sceneCtx.numerals === 'bn'
      ? true
      : sceneCtx.numerals === 'latn'
        ? false
        : containsBengali(`${heading} ${items.map((i) => i.title).join(' ')}`);

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const cardSurface = getStyleSurfaceCardProps(theme, false);

  const headingMin = Math.round(px(u, isVertical ? 5.6 : 4.2));
  const headingMax = Math.round(px(u, isVertical ? 8.2 : 6.4));
  const itemTitleMin = minBodyPx(u, 3.4);
  const itemTitleMax = Math.round(px(u, isVertical ? 4.2 : 3.6));
  const itemDetailMin = minTextPx(u, 3.2);

  // Variant B: Stacked cards with oversized accent step numbers
  if (variant === 'b') {
    const gap = Math.round(
      px(u, isVertical ? (items.length >= 4 ? 2.0 : 2.6) : items.length >= 4 ? 0.9 : 1.2)
    );
    const padY = Math.round(
      px(u, isVertical ? (items.length >= 4 ? 1.8 : 2.4) : items.length >= 4 ? 0.85 : 1.0)
    );
    const padX = Math.round(px(u, 2.6));
    const stepTextMaxW = clampMaxWidth(
      contentWidth - padX * 2 - Math.round(px(u, 11)),
      contentWidth,
      'steps.b.text'
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
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 2.8 : 1.5))}
            align="flex-start"
            width={contentWidth}
          >
            <KitText
              text={heading}
              maxWidth={contentWidth}
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
              animOut={motion.animOut}
              delayFrames={0}
            />

            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap,
              }}
            >
              {items.map((item, idx) => {
                const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 0);
                const rowIn = computeEntranceStyle({
                  preset: 'fade-up',
                  frame: entranceFrame,
                  fps,
                  delayFrames: delay,
                  durationFrames: 14,
                  ease: motion.ease,
                });
                const rowMotion = mergeMotionStyles(rowIn, exit);
                const stepNum = formatLocalizedDigits(`0${idx + 1}`, useBn);

                return (
                  <div
                    key={`${item.title}-${idx}`}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: Math.round(px(u, 1.6) * theme.mood.radiusScale),
                      paddingLeft: padX,
                      paddingRight: padX,
                      paddingTop: padY,
                      paddingBottom: padY,
                      display: 'flex',
                      alignItems: 'center',
                      gap: Math.round(px(u, 2.4)),
                      ...cardSurface,
                      ...rowMotion,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: theme.titleFontFamily,
                        fontSize: Math.round(px(u, isVertical ? 6.6 : 5.2)),
                        fontWeight: 800,
                        lineHeight: 0.95,
                        color: theme.palette.accent,
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {stepNum}
                    </span>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: Math.round(px(u, 0.3)),
                      }}
                    >
                      <KitText
                        text={item.title}
                        maxWidth={stepTextMaxW}
                        maxHeight={Math.round(px(u, 7.6))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={700}
                        minSize={itemTitleMin}
                        maxSize={itemTitleMax}
                        maxLines={2}
                        lineHeight={1.18}
                        color={theme.palette.text}
                        animIn="none"
                        animOut="none"
                      />
                      {item.detail ? (
                        <KitText
                          text={item.detail}
                          maxWidth={stepTextMaxW}
                          maxHeight={Math.round(px(u, 5.4))}
                          fontFamily={theme.bodyFontFamily}
                          fontWeight={theme.mood.bodyWeight}
                          minSize={itemDetailMin}
                          maxSize={Math.round(px(u, 3.4))}
                          maxLines={1}
                          color={theme.palette.muted}
                          animIn="none"
                          animOut="none"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </KitStack>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Vertical drawing connector + numbered nodes
  const lineP = computeDrawProgress({
    frame: entranceFrame,
    fps,
    delayFrames: 4,
    durationFrames: 24,
    ease: 'cinematic',
  });
  const nodeSize = Math.round(px(u, isVertical ? 6.0 : 5.0));
  const rowGap = Math.round(
    px(u, isVertical ? (items.length >= 4 ? 2.2 : 3.0) : items.length >= 4 ? 0.95 : 1.3)
  );
  const trackW = Math.max(2, Math.round(px(u, 0.4)));
  const nodeBorder = Math.max(2, Math.round(px(u, 0.3)));
  const cardPadX = Math.round(px(u, 2.4));
  const itemGapX = Math.round(px(u, 2.2));
  const stepTextMaxW = clampMaxWidth(
    contentWidth - nodeSize - itemGapX - cardPadX * 2,
    contentWidth,
    'steps.a.text'
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
        <KitStack
          direction="column"
          gap={Math.round(px(u, isVertical ? 3.0 : 1.6))}
          align="flex-start"
          width={contentWidth}
        >
          <KitText
            text={heading}
            maxWidth={contentWidth}
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
            animOut={motion.animOut}
            delayFrames={0}
          />

          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: rowGap,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: Math.round(nodeSize / 2) - Math.round(trackW / 2),
                top: Math.round(nodeSize / 2),
                bottom: Math.round(nodeSize / 2),
                width: trackW,
                background: `linear-gradient(180deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                transform: `scaleY(${lineP.toFixed(4)})`,
                transformOrigin: 'top center',
              }}
            />

            {items.map((item, idx) => {
              const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 0);
              const rowIn = computeEntranceStyle({
                preset: 'slide-left',
                frame: entranceFrame,
                fps,
                delayFrames: delay,
                durationFrames: 14,
                ease: motion.ease,
              });
              const rowMotion = mergeMotionStyles(rowIn, exit);
              const stepNum = formatLocalizedDigits(String(idx + 1), useBn);

              return (
                <div
                  key={`${item.title}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: itemGapX,
                    ...rowMotion,
                  }}
                >
                  <div
                    style={{
                      width: nodeSize,
                      height: nodeSize,
                      boxSizing: 'border-box',
                      borderRadius: '9999px',
                      backgroundColor: theme.palette.accent,
                      color: theme.palette.onAccent,
                      border: `${nodeBorder}px solid ${theme.palette.bg}`,
                      boxShadow: `0 0 0 ${nodeBorder}px ${hexToRgba(theme.palette.accent, 0.35)}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: theme.titleFontFamily,
                      fontWeight: 800,
                      fontSize: Math.round(px(u, 3.2)),
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {stepNum}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      boxSizing: 'border-box',
                      borderRadius: Math.round(px(u, 1.4) * theme.mood.radiusScale),
                      paddingLeft: cardPadX,
                      paddingRight: cardPadX,
                      paddingTop: Math.round(
                        px(u, isVertical ? 1.9 : items.length >= 4 ? 0.85 : 1.0)
                      ),
                      paddingBottom: Math.round(
                        px(u, isVertical ? 1.9 : items.length >= 4 ? 0.85 : 1.0)
                      ),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: Math.round(px(u, 0.3)),
                      ...cardSurface,
                    }}
                  >
                    <KitText
                      text={item.title}
                      maxWidth={stepTextMaxW}
                      maxHeight={Math.round(px(u, 7.6))}
                      fontFamily={theme.bodyFontFamily}
                      fontWeight={700}
                      minSize={itemTitleMin}
                      maxSize={itemTitleMax}
                      maxLines={2}
                      lineHeight={1.18}
                      color={theme.palette.text}
                      animIn="none"
                      animOut="none"
                    />
                    {item.detail ? (
                      <KitText
                        text={item.detail}
                        maxWidth={stepTextMaxW}
                        maxHeight={Math.round(px(u, 5.2))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={theme.mood.bodyWeight}
                        minSize={itemDetailMin}
                        maxSize={Math.round(px(u, 3.4))}
                        maxLines={1}
                        color={theme.palette.muted}
                        animIn="none"
                        animOut="none"
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </KitStack>
      </div>
    </AbsoluteFill>
  );
}
