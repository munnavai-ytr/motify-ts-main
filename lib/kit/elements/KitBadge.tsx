'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { stripHighlightMarkers } from '../text-craft';
import { kitAttrs, useKitSceneContext } from './context';
import { KitIcon } from './KitIcon';

export interface KitBadgeProps {
  text: string;
  icon?: string;
  bgColor: string;
  textColor: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  paddingX?: number;
  paddingY?: number;
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ease?: EasePreset;
  delayFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitBadge({
  text,
  icon,
  bgColor,
  textColor,
  borderColor,
  borderWidth = 1,
  radius = 9999,
  fontFamily,
  fontSize,
  fontWeight = 700,
  paddingX = 18,
  paddingY = 9,
  animIn = 'pop',
  animOut = 'fade',
  ease = 'snappy',
  delayFrames = 0,
  exitFrames = 10,
  style,
}: KitBadgeProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();
  const entranceFrame = frame + ctx.preRollFrames;

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
  const cleanText = stripHighlightMarkers(text);

  return (
    <div
      {...kitAttrs('badge', { sceneIndex: ctx.sceneIndex, zone: 'content' })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(6, Math.round(fontSize * 0.42)),
        backgroundColor: bgColor,
        color: textColor,
        border: borderColor ? `${borderWidth}px solid ${borderColor}` : 'none',
        borderRadius: radius,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY,
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight: 1.15,
        letterSpacing: '0.02em',
        maxWidth: '100%',
        whiteSpace: 'nowrap',
        ...motionStyle,
        ...style,
      }}
    >
      {icon ? (
        <KitIcon
          name={icon}
          size={Math.round(fontSize * 1.05)}
          color={textColor}
          strokeWidth={2.4}
        />
      ) : null}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cleanText}
      </span>
    </div>
  );
}
