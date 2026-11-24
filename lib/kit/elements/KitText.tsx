'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeAmbientStyle,
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  revealTypedText,
  type AnimAmbientPreset,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { fitText } from '../fit';
import {
  applyCaseTransform,
  mapLinesToHighlightedRuns,
  stripHighlightMarkers,
  type HighlightSegment,
} from '../text-craft';
import { hexToRgba, type HighlightStyle } from '../tokens';
import { kitAttrs, useKitSceneContext } from './context';

export interface KitTextProps {
  text: string;
  maxWidth: number;
  maxHeight: number;
  fontFamily: string;
  fontWeight: number;
  minSize: number;
  maxSize: number;
  maxLines?: number;
  lineHeight?: number;
  letterSpacing?: string;
  letterSpacingEm?: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  textShadow?: string;
  highlightStyle?: HighlightStyle;
  highlightColor?: string;
  highlightTextColor?: string;
  balanceLines?: boolean;
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ambient?: AnimAmbientPreset;
  ease?: EasePreset;
  delayFrames?: number;
  animDurationFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitText({
  text,
  maxWidth,
  maxHeight,
  fontFamily,
  fontWeight,
  minSize,
  maxSize,
  maxLines = 4,
  lineHeight = 1.14,
  letterSpacing = '-0.02em',
  letterSpacingEm = 0,
  color,
  align = 'left',
  uppercase = false,
  textShadow,
  highlightStyle,
  highlightColor,
  highlightTextColor,
  balanceLines = true,
  animIn = 'fade-up',
  animOut = 'fade',
  ambient = 'none',
  ease = 'smooth',
  delayFrames = 0,
  animDurationFrames = 16,
  exitFrames = 10,
  style,
}: KitTextProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();

  const entranceFrame = frame + ctx.preRollFrames;
  const resolvedHighlightStyle = highlightStyle ?? ctx.style.highlightStyle;
  const accent = highlightColor ?? ctx.palette.accent;
  const accent2 = ctx.palette.accent2;
  const onAccent = highlightTextColor ?? ctx.palette.onAccent;

  const transformedSource = applyCaseTransform(text, uppercase);
  const fitted = fitText({
    text: transformedSource,
    maxWidth,
    maxHeight,
    fontFamily,
    fontWeight,
    minSize,
    maxSize,
    maxLines,
    lineHeight,
    letterSpacingEm,
    balanceLines,
  });

  // For mask-up, individual lines handle the clipped slide-up so container stays opacity 1
  const containerEntrance =
    animIn === 'mask-up'
      ? { opacity: 1, transform: 'none' }
      : computeEntranceStyle({
          preset: animIn,
          frame: entranceFrame,
          fps,
          delayFrames,
          durationFrames: animDurationFrames,
          ease,
          distancePx: Math.max(18, Math.round(fitted.fontSize * 0.5)),
        });

  const exit = computeExitStyle({
    preset: animOut,
    frame,
    durationInFrames,
    exitFrames,
    distancePx: Math.max(14, Math.round(fitted.fontSize * 0.35)),
  });

  const ambientStyle = computeAmbientStyle({
    preset: ambient,
    frame,
    fps,
    amplitudePx: 4,
  });

  const motionStyle = mergeMotionStyles(containerEntrance, exit, ambientStyle);
  const hasBrackets = transformedSource.includes('[[');
  const lineRuns: HighlightSegment[][] = hasBrackets
    ? mapLinesToHighlightedRuns(transformedSource, fitted.lines)
    : fitted.lines.map((line) => [{ text: line, highlighted: false }]);

  const renderHighlightedSegment = (
    seg: HighlightSegment,
    key: string
  ): React.ReactNode => {
    if (!seg.highlighted) {
      return <React.Fragment key={key}>{seg.text}</React.Fragment>;
    }
    switch (resolvedHighlightStyle) {
      case 'box':
        return (
          <span
            key={key}
            style={{
              backgroundColor: accent,
              color: onAccent,
              padding: '0.02em 0.22em',
              borderRadius: Math.max(4, Math.round(fitted.fontSize * 0.14)),
              boxDecorationBreak: 'clone',
            }}
          >
            {seg.text}
          </span>
        );
      case 'marker':
        return (
          <span
            key={key}
            style={{
              backgroundColor: hexToRgba(accent2, 0.32),
              color,
              padding: '0.01em 0.16em',
              borderRadius: Math.max(4, Math.round(fitted.fontSize * 0.12)),
              boxDecorationBreak: 'clone',
            }}
          >
            {seg.text}
          </span>
        );
      case 'underline':
        return (
          <span
            key={key}
            style={{
              borderBottom: `${Math.max(3, Math.round(fitted.fontSize * 0.085))}px solid ${accent}`,
              paddingBottom: '0.04em',
            }}
          >
            {seg.text}
          </span>
        );
      case 'color':
      default:
        return (
          <span key={key} style={{ color: accent }}>
            {seg.text}
          </span>
        );
    }
  };

  const renderContent = (): React.ReactNode => {
    if (animIn === 'type') {
      const typeDuration = Math.min(
        Math.max(14, Math.round(fitted.displayText.length * 0.85)),
        Math.max(18, durationInFrames - delayFrames - exitFrames - 4)
      );
      const progress = computeProgress({
        frame: entranceFrame,
        fps,
        delayFrames,
        durationFrames: typeDuration,
        ease: 'smooth',
      });
      return revealTypedText(stripHighlightMarkers(fitted.displayText), progress);
    }

    if (animIn === 'words') {
      const plainWords = fitted.displayText.split(/(\s+)/);
      let wordIdx = 0;
      return plainWords.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <React.Fragment key={`ws-${i}`}>{part}</React.Fragment>;
        }
        const currentIdx = wordIdx++;
        const wordDelay = delayFrames + currentIdx * 3;
        const wordProgress = computeProgress({
          frame: entranceFrame,
          fps,
          delayFrames: wordDelay,
          durationFrames: 11,
          ease,
        });
        const yOffset = (1 - wordProgress) * 16;
        return (
          <span
            key={`w-${i}`}
            style={{
              display: 'inline-block',
              opacity: wordProgress,
              transform: `translateY(${yOffset.toFixed(2)}px)`,
            }}
          >
            {part}
          </span>
        );
      });
    }

    if (animIn === 'mask-up') {
      return lineRuns.map((segs, lineIdx) => {
        const lineProgress = computeProgress({
          frame: entranceFrame,
          fps,
          delayFrames: delayFrames + lineIdx * 3,
          durationFrames: Math.max(12, animDurationFrames),
          ease: ease === 'smooth' ? 'cinematic' : ease,
        });
        const yPct = (1 - lineProgress) * 108;
        return (
          <div
            key={`ml-${lineIdx}`}
            style={{
              overflow: 'hidden',
              display: 'block',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${yPct.toFixed(2)}%)`,
                opacity: Math.min(1, lineProgress * 3.5),
              }}
            >
              {segs.map((seg, sIdx) =>
                renderHighlightedSegment(seg, `ms-${lineIdx}-${sIdx}`)
              )}
            </span>
          </div>
        );
      });
    }

    if (animIn === 'highlight-sweep') {
      const sweepP = computeProgress({
        frame: entranceFrame,
        fps,
        delayFrames: delayFrames + 4,
        durationFrames: Math.max(14, animDurationFrames + 4),
        ease: 'snappy',
      });
      const sweepRight = Math.max(0, (1 - sweepP) * 100);
      return (
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-0.12em',
              right: '-0.12em',
              bottom: '0.06em',
              height: '0.38em',
              backgroundColor: hexToRgba(accent2, 0.34),
              borderRadius: Math.max(3, Math.round(fitted.fontSize * 0.08)),
              clipPath: `inset(0% ${sweepRight.toFixed(2)}% 0% 0%)`,
              zIndex: 0,
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>
            {lineRuns.map((segs, lineIdx) => (
              <React.Fragment key={`hs-l-${lineIdx}`}>
                {lineIdx > 0 ? '\n' : null}
                {segs.map((seg, sIdx) =>
                  renderHighlightedSegment(seg, `hs-${lineIdx}-${sIdx}`)
                )}
              </React.Fragment>
            ))}
          </span>
        </span>
      );
    }

    if (!hasBrackets) {
      return fitted.displayText;
    }

    return lineRuns.map((segs, lineIdx) => (
      <React.Fragment key={`l-${lineIdx}`}>
        {lineIdx > 0 ? '\n' : null}
        {segs.map((seg, sIdx) =>
          renderHighlightedSegment(seg, `s-${lineIdx}-${sIdx}`)
        )}
      </React.Fragment>
    ));
  };

  return (
    <div
      {...kitAttrs('text', { sceneIndex: ctx.sceneIndex, zone: 'content' })}
      data-kit-truncated={fitted.truncated ? 'true' : undefined}
      style={{
        width: '100%',
        maxWidth,
        color,
        fontFamily,
        fontWeight,
        fontSize: fitted.fontSize,
        lineHeight: fitted.lineHeight,
        letterSpacing,
        textAlign: align,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: animIn === 'mask-up' ? 'visible' : 'hidden',
        ...(textShadow ? { textShadow } : {}),
        ...motionStyle,
        ...style,
      }}
    >
      {renderContent()}
    </div>
  );
}
