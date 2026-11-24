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
import { KitIcon, KitStack, KitText, useKitSceneContext } from '../elements';
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

interface ParsedListItem {
  title: string;
  detail?: string;
  icon?: string;
}

function readListItems(slots: Record<string, unknown>): ParsedListItem[] {
  const raw = slots.items;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ParsedListItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ title: entry.trim() });
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      const detail = typeof rec.detail === 'string' ? rec.detail.trim() : undefined;
      const icon = typeof rec.icon === 'string' ? rec.icon.trim() : undefined;
      if (title) {
        out.push({ title, detail, icon });
      }
    }
    if (out.length >= 5) {
      break;
    }
  }
  return out;
}

export function ListLayout({
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
  const title = readSlotString(slots, 'title', 'Key Highlights');
  const items = readListItems(slots);
  const effectiveItems =
    items.length > 0
      ? items
      : [{ title: 'Fast setup' }, { title: 'Clean motion' }, { title: 'Sharp export' }];

  const sceneCtx = useKitSceneContext();
  const useBengaliNums =
    sceneCtx.numerals === 'bn'
      ? true
      : sceneCtx.numerals === 'latn'
        ? false
        : containsBengali(`${title} ${effectiveItems.map((i) => i.title).join(' ')}`);

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const cardSurface = getStyleSurfaceCardProps(theme, false);

  const kickerMin = minTextPx(u, 3.2);
  const headingMin = Math.round(px(u, isVertical ? 5.6 : 4.2));
  const headingMax = Math.round(px(u, isVertical ? 7.8 : 6.0));
  const itemTitleMin = minBodyPx(u, 3.4);
  const itemTitleMax = Math.round(px(u, isVertical ? 4.1 : 3.6));
  const itemDetailMin = minTextPx(u, 3.2);
  const itemDetailMax = Math.round(px(u, isVertical ? 3.5 : 3.3));

  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });

  // Variant B: Two-column grid of mini cards (adapts cleanly across 9:16, 16:9, 1:1)
  if (variant === 'b') {
    const colGap = Math.round(px(u, 2.0));
    const cardWidth = Math.floor((contentWidth - colGap) / 2);
    const cardPad = Math.round(
      px(u, isVertical ? 2.8 : effectiveItems.length >= 4 ? 1.6 : 2.0)
    );
    const gridRadius = Math.round(px(u, 1.5) * theme.mood.radiusScale);
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
            gap={Math.round(px(u, isVertical ? 2.8 : 1.8))}
            align="flex-start"
            width={contentWidth}
          >
            {kicker ? (
              <KitText
                text={kicker}
                maxWidth={contentWidth}
                maxHeight={Math.round(px(u, 6.5))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={700}
                minSize={kickerMin}
                maxSize={Math.round(px(u, 3.6))}
                maxLines={1}
                letterSpacing="0.1em"
                uppercase={theme.style.uppercaseKickers}
                color={theme.palette.accent}
                animIn="fade-down"
                animOut={motion.animOut}
                delayFrames={0}
              />
            ) : null}

            <KitText
              text={title}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.2)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headingMin}
              maxSize={headingMax}
              maxLines={2}
              lineHeight={1.1}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={2}
            />

            <div
              style={{
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: colGap,
              }}
            >
              {effectiveItems.map((item, idx) => {
                const isOddLast =
                  effectiveItems.length % 2 === 1 &&
                  idx === effectiveItems.length - 1;
                const w = isOddLast ? contentWidth : cardWidth;
                const cardInnerW = clampMaxWidth(
                  w - cardPad * 2,
                  w - cardPad * 2,
                  'list.b.cardInner'
                );
                const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 0);
                const cellIn = computeEntranceStyle({
                  preset: 'pop',
                  frame: entranceFrame,
                  fps,
                  delayFrames: delay,
                  durationFrames: 14,
                  ease: motion.ease,
                });
                const cellMotion = mergeMotionStyles(cellIn, exit);
                const numLabel = formatLocalizedDigits(
                  `0${idx + 1}`,
                  useBengaliNums
                );
                return (
                  <div
                    key={`${item.title}-${idx}`}
                    style={{
                      width: w,
                      borderRadius: gridRadius,
                      padding: cardPad,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: Math.round(px(u, 1.2)),
                      ...cardSurface,
                      ...cellMotion,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: theme.titleFontFamily,
                          fontWeight: 800,
                          fontSize: Math.round(px(u, 3.6)),
                          color: theme.palette.accent,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {numLabel}
                      </span>
                      {item.icon ? (
                        <KitIcon
                          name={item.icon}
                          size={Math.round(px(u, 3.2))}
                          color={theme.palette.accent2}
                        />
                      ) : null}
                    </div>
                    <KitText
                      text={item.title}
                      maxWidth={cardInnerW}
                      maxHeight={Math.round(px(u, 10))}
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
                  </div>
                );
              })}
            </div>
          </KitStack>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Vertical timeline line + glowing accent nodes
  if (variant === 'c') {
    const lineP = computeDrawProgress({
      frame: entranceFrame,
      fps,
      delayFrames: 4,
      durationFrames: 24,
      ease: 'cinematic',
    });
    const nodeSize = Math.round(px(u, 4.8));
    const itemGap = Math.round(
      px(u, isVertical ? 2.6 : effectiveItems.length >= 4 ? 1.1 : 1.5)
    );
    const trackWidth = Math.max(2, Math.round(px(u, 0.38)));
    const nodeBorder = Math.max(2, Math.round(px(u, 0.28)));
    const rowGapX = Math.round(px(u, 2.2));
    const cardPadX = Math.round(px(u, 2.4));
    const cardPadY = Math.round(
      px(u, isVertical ? 1.8 : effectiveItems.length >= 4 ? 0.85 : 1.1)
    );
    const timelineTextMaxW = clampMaxWidth(
      contentWidth - nodeSize - rowGapX - cardPadX * 2,
      contentWidth - nodeSize - rowGapX - cardPadX * 2,
      'list.c.textMax'
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
            gap={Math.round(px(u, isVertical ? 2.8 : 1.6))}
            align="flex-start"
            width={contentWidth}
          >
            <KitText
              text={title}
              maxWidth={contentWidth}
              maxHeight={Math.round(contentHeight * 0.2)}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={headingMin}
              maxSize={headingMax}
              maxLines={2}
              lineHeight={1.1}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              animIn={motion.animIn}
              animOut={motion.animOut}
              ease={motion.ease}
              delayFrames={0}
            />

            <div
              style={{
                position: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: itemGap,
              }}
            >
              {/* Connecting vertical track */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: Math.round(nodeSize / 2 - trackWidth / 2),
                  top: Math.round(nodeSize / 2),
                  bottom: Math.round(nodeSize / 2),
                  width: trackWidth,
                  backgroundColor: hexToRgba(theme.palette.accent, 0.36),
                  transform: `scaleY(${lineP.toFixed(4)})`,
                  transformOrigin: 'top center',
                }}
              />

              {effectiveItems.map((item, idx) => {
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
                return (
                  <div
                    key={`${item.title}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: rowGapX,
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
                        boxShadow: `0 0 0 ${nodeBorder}px ${hexToRgba(theme.palette.accent, 0.4)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: theme.titleFontFamily,
                        fontWeight: 800,
                        fontSize: Math.round(px(u, 2.6)),
                        flexShrink: 0,
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: Math.round(px(u, 1.3) * theme.mood.radiusScale),
                        paddingLeft: cardPadX,
                        paddingRight: cardPadX,
                        paddingTop: cardPadY,
                        paddingBottom: cardPadY,
                        ...cardSurface,
                      }}
                    >
                      <KitText
                        text={item.title}
                        maxWidth={timelineTextMaxW}
                        maxHeight={Math.round(px(u, 8.2))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={700}
                        minSize={itemTitleMin}
                        maxSize={itemTitleMax}
                        maxLines={2}
                        lineHeight={1.2}
                        color={theme.palette.text}
                        animIn="none"
                        animOut="none"
                      />
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

  // Variant A (Default): Stacked pill rows with numbers & >= 3.2u floor
  const rowGap = Math.round(
    px(u, isVertical ? (effectiveItems.length >= 4 ? 2.0 : 2.6) : effectiveItems.length >= 4 ? 0.9 : 1.2)
  );
  const rowPadY = Math.round(
    px(u, isVertical ? (effectiveItems.length >= 4 ? 1.9 : 2.4) : effectiveItems.length >= 4 ? 0.8 : 1.0)
  );
  const rowPadX = Math.round(px(u, 2.4));
  const rowRadius = Math.round(px(u, 1.3) * theme.mood.radiusScale);
  const rowBadgeRadius = Math.round(px(u, 0.95) * theme.mood.radiusScale);
  const rowTextMaxW = clampMaxWidth(
    contentWidth - rowPadX * 2 - Math.round(px(u, 7.6)),
    contentWidth - rowPadX * 2 - Math.round(px(u, 7.6)),
    'list.a.rowText'
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
          gap={Math.round(px(u, isVertical ? 2.6 : 1.6))}
          align="flex-start"
          width={contentWidth}
        >
          {kicker ? (
            <KitText
              text={kicker}
              maxWidth={contentWidth}
              maxHeight={Math.round(px(u, 6))}
              fontFamily={theme.bodyFontFamily}
              fontWeight={700}
              minSize={kickerMin}
              maxSize={Math.round(px(u, 3.6))}
              maxLines={1}
              letterSpacing="0.1em"
              uppercase={theme.style.uppercaseKickers}
              color={theme.palette.accent}
              animIn="fade-down"
              animOut={motion.animOut}
              delayFrames={0}
            />
          ) : null}

          <KitText
            text={title}
            maxWidth={contentWidth}
            maxHeight={Math.round(contentHeight * 0.2)}
            fontFamily={theme.titleFontFamily}
            fontWeight={theme.mood.titleWeight}
            minSize={headingMin}
            maxSize={headingMax}
            maxLines={2}
            lineHeight={1.1}
            letterSpacing={theme.mood.tracking}
            uppercase={theme.style.uppercaseHeadings}
            color={theme.palette.text}
            animIn={motion.animIn}
            animOut={motion.animOut}
            ease={motion.ease}
            delayFrames={2}
          />

          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: rowGap,
            }}
          >
            {effectiveItems.map((item, idx) => {
              const delay = resolveBeatDelay(idx + 1, fps, motion.intensity, 2);
              const rowIn = computeEntranceStyle({
                preset: 'slide-left',
                frame: entranceFrame,
                fps,
                delayFrames: delay,
                durationFrames: 14,
                ease: motion.ease,
              });
              const rowMotion = mergeMotionStyles(rowIn, exit);
              const numLabel = formatLocalizedDigits(
                `0${idx + 1}`,
                useBengaliNums
              );

              return (
                <div
                  key={`${item.title}-${idx}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 2.0)),
                    borderRadius: rowRadius,
                    paddingLeft: rowPadX,
                    paddingRight: rowPadX,
                    paddingTop: rowPadY,
                    paddingBottom: rowPadY,
                    ...cardSurface,
                    ...rowMotion,
                  }}
                >
                    <div
                      style={{
                        width: Math.round(px(u, 5.4)),
                        height: Math.round(px(u, 5.4)),
                        borderRadius: rowBadgeRadius,
                        backgroundColor: theme.palette.accent,
                        color: theme.palette.onAccent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: theme.titleFontFamily,
                        fontWeight: 800,
                        fontSize: Math.round(px(u, 3.2)),
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon ? (
                        <KitIcon
                          name={item.icon}
                          size={Math.round(px(u, 3.0))}
                          color={theme.palette.onAccent}
                        />
                      ) : (
                        numLabel
                      )}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: Math.round(px(u, 0.35)),
                      }}
                    >
                      <KitText
                        text={item.title}
                        maxWidth={rowTextMaxW}
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
                          maxWidth={rowTextMaxW}
                        maxHeight={Math.round(px(u, 5.2))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={theme.mood.bodyWeight}
                        minSize={itemDetailMin}
                        maxSize={itemDetailMax}
                        maxLines={1}
                        lineHeight={1.2}
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
