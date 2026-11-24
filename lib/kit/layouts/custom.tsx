'use client';

import React from 'react';
import { AbsoluteFill } from 'remotion';
import { resolveBeatDelay } from '../anim';
import {
  KitBadge,
  KitButton,
  KitDivider,
  KitStack,
  KitText,
} from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import { minBodyPx, minTextPx, readSlotString, type LayoutProps } from './types';

type CustomBlockKind =
  | 'kicker'
  | 'heading'
  | 'body'
  | 'stat'
  | 'badge'
  | 'cta'
  | 'divider';

interface ParsedCustomBlock {
  kind: CustomBlockKind;
  text: string;
  sub?: string;
  icon?: string;
  fontSize?: number;
  offsetY?: number;
}

const VALID_BLOCK_KINDS = new Set<CustomBlockKind>([
  'kicker',
  'heading',
  'body',
  'stat',
  'badge',
  'cta',
  'divider',
]);

function readCustomBlocks(slots: Record<string, unknown>): ParsedCustomBlock[] {
  const raw = slots.blocks;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ParsedCustomBlock[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const rawKind = typeof rec.kind === 'string' ? rec.kind.trim() : 'body';
      const kind: CustomBlockKind = VALID_BLOCK_KINDS.has(
        rawKind as CustomBlockKind
      )
        ? (rawKind as CustomBlockKind)
        : 'body';
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      const sub = typeof rec.sub === 'string' ? rec.sub.trim() : undefined;
      const icon = typeof rec.icon === 'string' ? rec.icon.trim() : undefined;
      const fontSize =
        typeof rec.fontSize === 'number' && Number.isFinite(rec.fontSize) && rec.fontSize > 4
          ? rec.fontSize
          : undefined;
      const offsetY =
        typeof rec.offsetY === 'number' && Number.isFinite(rec.offsetY)
          ? rec.offsetY
          : undefined;
      if (kind === 'divider' || text) {
        out.push({ kind, text, sub, icon, fontSize, offsetY });
      }
    }
    if (out.length >= 5) {
      break;
    }
  }
  return out;
}

export function CustomLayout({
  slots,
  theme,
  format,
  width,
  height,
  fps,
  motion,
}: LayoutProps) {
  const safe = SAFE_AREAS[format];
  const u = sizingUnit(width, height);
  const contentWidth = width - safe.left - safe.right;
  const contentHeight = height - safe.top - safe.bottom;
  const isVertical = format === '9:16';

  const rawAlign = readSlotString(slots, 'align', 'center');
  const align: 'left' | 'center' | 'right' =
    rawAlign === 'left' || rawAlign === 'right' ? rawAlign : 'center';
  const flexAlign =
    align === 'left'
      ? 'flex-start'
      : align === 'right'
        ? 'flex-end'
        : 'center';

  const blocks = readCustomBlocks(slots);
  const hasExplicitBlocksArray = Array.isArray(slots.blocks);
  const effectiveBlocks: ParsedCustomBlock[] =
    hasExplicitBlocksArray || blocks.length > 0
      ? blocks
      : [
          {
            kind: 'heading',
            text: readSlotString(slots, 'title', 'Custom Scene'),
          },
          {
            kind: 'body',
            text: readSlotString(
              slots,
              'body',
              'Structured custom block stack'
            ),
          },
        ];

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
          alignItems: flexAlign,
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.56) : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: flexAlign,
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 2.8 : 2.2))}
            align={flexAlign}
            width={contentWidth}
          >
            {effectiveBlocks.map((block, idx) => {
              const delay = resolveBeatDelay(idx, fps, motion.intensity, 0);
              const clampedOffsetY =
                typeof block.offsetY === 'number'
                  ? Math.max(
                      -Math.round(px(u, 4)),
                      Math.min(Math.round(px(u, 4)), Math.round(block.offsetY))
                    )
                  : undefined;
              if (block.kind === 'divider') {
                return (
                  <KitDivider
                    key={`blk-div-${idx}`}
                    width={Math.round(px(u, 16))}
                    thickness={Math.max(Math.round(px(u, 0.35)), Math.round(px(u, 0.6)))}
                    color={theme.palette.accent}
                    secondaryColor={theme.palette.accent2}
                    animOut={motion.animOut}
                    delayFrames={delay}
                  />
                );
              }

              if (block.kind === 'badge') {
                return (
                  <KitBadge
                    key={`blk-badge-${idx}`}
                    text={block.text}
                    icon={block.icon}
                    bgColor={hexToRgba(theme.palette.accent, 0.18)}
                    textColor={theme.palette.accent}
                    borderColor={hexToRgba(theme.palette.accent, 0.45)}
                    borderWidth={theme.mood.borderWidth}
                    radius={Math.round(px(u, 1.0) * theme.mood.radiusScale)}
                    fontFamily={theme.bodyFontFamily}
                    fontSize={minTextPx(u, 3.2)}
                    paddingX={Math.round(px(u, 2.4))}
                    paddingY={Math.round(px(u, 1.0))}
                    animIn="pop"
                    animOut={motion.animOut}
                    delayFrames={delay}
                  />
                );
              }

              if (block.kind === 'cta') {
                return (
                  <KitButton
                    key={`blk-cta-${idx}`}
                    text={block.text}
                    icon={block.icon ?? 'arrow-right'}
                    bgColor={theme.palette.accent}
                    textColor={theme.palette.onAccent}
                    radius={Math.round(px(u, 1.4) * theme.mood.radiusScale)}
                    fontFamily={theme.bodyFontFamily}
                    fontSize={minTextPx(u, 3.4)}
                    paddingX={Math.round(px(u, 3.8))}
                    paddingY={Math.round(px(u, 1.8))}
                    animIn="pop"
                    animOut={motion.animOut}
                    delayFrames={delay}
                  />
                );
              }

              if (block.kind === 'kicker') {
                return (
                  <KitText
                    key={`blk-kicker-${idx}`}
                    text={block.text}
                    maxWidth={contentWidth}
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={700}
                    minSize={minTextPx(u, 3.2)}
                    maxSize={Math.round(px(u, 3.8))}
                    maxLines={1}
                    letterSpacing="0.1em"
                    uppercase={theme.style.uppercaseKickers}
                    color={theme.palette.accent}
                    align={align}
                    animIn="fade-down"
                    animOut={motion.animOut}
                    delayFrames={delay}
                  />
                );
              }

              if (block.kind === 'stat') {
                return (
                  <div
                    key={`blk-stat-${idx}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: flexAlign,
                      gap: Math.round(px(u, 0.8)),
                      width: '100%',
                    }}
                  >
                    <KitText
                      text={block.text}
                      maxWidth={contentWidth}
                      maxHeight={Math.round(contentHeight * 0.25)}
                      fontFamily={theme.titleFontFamily}
                      fontWeight={800}
                      minSize={Math.round(px(u, 5.4))}
                      maxSize={Math.round(px(u, 11.4))}
                      maxLines={1}
                      color={theme.palette.accent2}
                      align={align}
                      animIn="pop"
                      animOut={motion.animOut}
                      delayFrames={delay}
                    />
                    {block.sub ? (
                      <KitText
                        text={block.sub}
                        maxWidth={contentWidth}
                        maxHeight={Math.round(px(u, 7))}
                        fontFamily={theme.bodyFontFamily}
                        fontWeight={600}
                        minSize={minBodyPx(u, 3.4)}
                        maxSize={Math.round(px(u, 3.8))}
                        maxLines={1}
                        color={theme.palette.muted}
                        align={align}
                        animIn="fade-up"
                        animOut={motion.animOut}
                        delayFrames={delay + 2}
                      />
                    ) : null}
                  </div>
                );
              }

              if (block.kind === 'heading') {
                return (
                  <KitText
                    key={`blk-heading-${idx}`}
                    text={block.text}
                    maxWidth={contentWidth}
                    maxHeight={Math.round(contentHeight * 0.34)}
                    fontFamily={theme.titleFontFamily}
                    fontWeight={theme.mood.titleWeight}
                    minSize={
                      block.fontSize
                        ? block.fontSize
                        : Math.round(px(u, isVertical ? 5.6 : 4.4))
                    }
                    maxSize={
                      block.fontSize
                        ? block.fontSize
                        : Math.round(px(u, isVertical ? 9.4 : 8.2))
                    }
                    maxLines={3}
                    lineHeight={1.08}
                    letterSpacing={theme.mood.tracking}
                    uppercase={theme.style.uppercaseHeadings}
                    color={theme.palette.text}
                    align={align}
                    animIn={motion.animIn}
                    animOut={motion.animOut}
                    ease={motion.ease}
                    delayFrames={delay}
                    style={
                      clampedOffsetY !== undefined
                        ? { marginTop: clampedOffsetY }
                        : undefined
                    }
                  />
                );
              }

              return (
                <KitText
                  key={`blk-body-${idx}`}
                  text={block.text}
                  maxWidth={Math.round(contentWidth * 0.9)}
                  maxHeight={Math.round(contentHeight * 0.24)}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={theme.mood.bodyWeight}
                  minSize={
                    block.fontSize ? block.fontSize : minBodyPx(u, 3.4)
                  }
                  maxSize={
                    block.fontSize ? block.fontSize : Math.round(px(u, 4.1))
                  }
                  maxLines={3}
                  lineHeight={1.34}
                  color={theme.palette.muted}
                  align={align}
                  animIn="fade-up"
                  animOut={motion.animOut}
                  delayFrames={delay}
                  style={
                    clampedOffsetY !== undefined
                      ? { marginTop: clampedOffsetY }
                      : undefined
                  }
                />
              );
            })}
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
