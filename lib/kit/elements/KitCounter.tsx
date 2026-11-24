'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { fitText } from '../fit';
import { formatLocalizedDigits } from '../tokens';
import { kitAttrs, useKitSceneContext } from './context';

export interface KitCounterProps {
  from?: number;
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  bengaliDigits?: boolean;
  fontFamily: string;
  fontSize: number;
  minSize?: number;
  maxWidth?: number;
  maxHeight?: number;
  fontWeight?: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ease?: EasePreset;
  delayFrames?: number;
  countDurationFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitCounter({
  from = 0,
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
  bengaliDigits = false,
  fontFamily,
  fontSize,
  minSize = 24,
  maxWidth,
  maxHeight,
  fontWeight = 800,
  color,
  align = 'center',
  animIn = 'fade-up',
  animOut = 'fade',
  ease = 'cinematic',
  delayFrames = 2,
  countDurationFrames = 34,
  exitFrames = 10,
  style,
}: KitCounterProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();
  const entranceFrame = frame + ctx.preRollFrames;

  const progress = computeProgress({
    frame: entranceFrame,
    fps,
    delayFrames,
    durationFrames: Math.min(
      countDurationFrames,
      Math.max(12, durationInFrames - delayFrames - exitFrames - 2)
    ),
    ease,
  });

  const entrance = computeEntranceStyle({
    preset: animIn,
    frame: entranceFrame,
    fps,
    delayFrames,
    durationFrames: 14,
    ease,
  });

  const exit = computeExitStyle({
    preset: animOut,
    frame,
    durationInFrames,
    exitFrames,
  });

  const motionStyle = mergeMotionStyles(entrance, exit);

  const sceneCtx = useKitSceneContext();
  const useBengaliDigits =
    sceneCtx.numerals === 'bn'
      ? true
      : sceneCtx.numerals === 'latn'
        ? false
        : bengaliDigits;

  const currentVal = from + (to - from) * progress;
  const formattedNumber =
    decimals > 0
      ? currentVal.toFixed(decimals)
      : Math.round(currentVal).toLocaleString('en-US');

  const combined = `${prefix}${formattedNumber}${suffix}`;
  const localized = formatLocalizedDigits(combined, useBengaliDigits);

  // Measure target final string so fontSize stays constant and never overflows ring/container
  let resolvedFontSize = fontSize;
  if (maxWidth !== undefined && maxWidth > 0) {
    const finalNumber =
      decimals > 0 ? to.toFixed(decimals) : Math.round(to).toLocaleString('en-US');
    const maxSample = formatLocalizedDigits(
      `${prefix}${finalNumber}${suffix}`,
      useBengaliDigits
    );
    const fitRes = fitText({
      text: maxSample,
      maxWidth,
      maxHeight: maxHeight ?? Math.round(fontSize * 1.4),
      fontFamily,
      fontWeight,
      minSize: Math.min(minSize, fontSize),
      maxSize: fontSize,
      maxLines: 1,
      lineHeight: 1.04,
      letterSpacingEm: -0.03,
      balanceLines: false,
    });
    resolvedFontSize = fitRes.fontSize;
  }

  return (
    <div
      {...kitAttrs('counter', { sceneIndex: ctx.sceneIndex, zone: 'content' })}
      style={{
        fontFamily,
        fontSize: resolvedFontSize,
        fontWeight,
        color,
        lineHeight: 1.02,
        letterSpacing: '-0.03em',
        fontVariantNumeric: 'tabular-nums',
        textAlign: align,
        whiteSpace: 'nowrap',
        ...motionStyle,
        ...style,
      }}
    >
      {localized}
    </div>
  );
}
