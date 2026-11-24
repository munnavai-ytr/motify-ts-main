'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeExitStyle,
  computeProgress,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { useKitSceneContext } from './context';

export interface KitDividerProps {
  width: number;
  thickness?: number;
  color: string;
  secondaryColor?: string;
  radius?: number;
  animOut?: AnimOutPreset;
  ease?: EasePreset;
  delayFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitDivider({
  width,
  thickness = 4,
  color,
  secondaryColor,
  radius = 999,
  animOut = 'fade',
  ease = 'snappy',
  delayFrames = 4,
  exitFrames = 10,
  style,
}: KitDividerProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();
  const entranceFrame = frame + ctx.preRollFrames;

  const progress = computeProgress({
    frame: entranceFrame,
    fps,
    delayFrames,
    durationFrames: 16,
    ease,
  });

  const exit = computeExitStyle({
    preset: animOut,
    frame,
    durationInFrames,
    exitFrames,
  });

  const insetRight = Math.max(0, (1 - progress) * 100);

  return (
    <div
      style={{
        width,
        height: thickness,
        borderRadius: radius,
        background: secondaryColor
          ? `linear-gradient(90deg, ${color}, ${secondaryColor})`
          : color,
        clipPath: `inset(0% ${insetRight.toFixed(2)}% 0% 0%)`,
        opacity: Math.min(1, progress * 2) * exit.opacity,
        transform: exit.transform,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
