'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeAmbientStyle,
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  type AnimAmbientPreset,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { hexToRgba } from '../tokens';
import { kitAttrs, useKitSceneContext, type KitZone } from './context';

export type KitShapeKind = 'circle' | 'rect' | 'pill' | 'ring' | 'orb';

export interface KitShapeProps {
  kind: KitShapeKind;
  width: number;
  height: number;
  color: string;
  secondaryColor?: string;
  borderRadius?: number;
  strokeWidth?: number;
  opacity?: number;
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ambient?: AnimAmbientPreset;
  ease?: EasePreset;
  delayFrames?: number;
  exitFrames?: number;
  zone?: KitZone;
  avoid?: boolean;
  style?: React.CSSProperties;
}

export function KitShape({
  kind,
  width,
  height,
  color,
  secondaryColor,
  borderRadius = 16,
  strokeWidth = 3,
  opacity = 1,
  animIn = 'fade',
  animOut = 'fade',
  ambient = 'none',
  ease = 'smooth',
  delayFrames = 0,
  exitFrames = 10,
  zone = 'content',
  avoid = false,
  style,
}: KitShapeProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();
  const entranceFrame = frame + ctx.preRollFrames;

  const entrance = computeEntranceStyle({
    preset: animIn,
    frame: entranceFrame,
    fps,
    delayFrames,
    durationFrames: 18,
    ease,
  });

  const exit = computeExitStyle({
    preset: animOut,
    frame,
    durationInFrames,
    exitFrames,
  });

  const ambientStyle = computeAmbientStyle({
    preset: ambient,
    frame,
    fps,
    amplitudePx: 10,
  });

  const motionStyle = mergeMotionStyles(entrance, exit, ambientStyle);

  let visualStyle: React.CSSProperties;

  if (kind === 'circle') {
    visualStyle = {
      borderRadius: '9999px',
      background: secondaryColor
        ? `linear-gradient(135deg, ${color}, ${secondaryColor})`
        : color,
    };
  } else if (kind === 'pill') {
    visualStyle = {
      borderRadius: '9999px',
      background: secondaryColor
        ? `linear-gradient(135deg, ${color}, ${secondaryColor})`
        : color,
    };
  } else if (kind === 'ring') {
    visualStyle = {
      borderRadius: '9999px',
      border: `${strokeWidth}px solid ${color}`,
      backgroundColor: 'transparent',
    };
  } else if (kind === 'orb') {
    visualStyle = {
      borderRadius: '9999px',
      background: `radial-gradient(circle at 50% 50%, ${hexToRgba(color, 0.42)} 0%, ${hexToRgba(color, 0.14)} 45%, ${hexToRgba(color, 0)} 74%)`,
    };
  } else {
    visualStyle = {
      borderRadius,
      background: secondaryColor
        ? `linear-gradient(135deg, ${color}, ${secondaryColor})`
        : color,
    };
  }

  return (
    <div
      {...kitAttrs('shape', { sceneIndex: ctx.sceneIndex, zone, avoid })}
      style={{
        width,
        height,
        flexShrink: 0,
        ...visualStyle,
        ...motionStyle,
        opacity: entrance.opacity * exit.opacity * opacity,
        ...style,
      }}
    />
  );
}
