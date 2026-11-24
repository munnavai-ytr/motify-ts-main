'use client';

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEmphasisStyle,
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  type AnimAmbientPreset,
  type AnimInPreset,
  type AnimOutPreset,
  type EasePreset,
} from '../anim';
import { getStyleCardBorder, getStyleCardShadow } from '../styles';
import { stripHighlightMarkers } from '../text-craft';
import { kitAttrs, useKitSceneContext } from './context';
import { KitIcon } from './KitIcon';

export interface KitButtonProps {
  text: string;
  icon?: string;
  bgColor: string;
  textColor: string;
  radius?: number;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  paddingX?: number;
  paddingY?: number;
  boxShadow?: string;
  animIn?: AnimInPreset;
  animOut?: AnimOutPreset;
  ambient?: AnimAmbientPreset;
  ease?: EasePreset;
  delayFrames?: number;
  exitFrames?: number;
  style?: React.CSSProperties;
}

export function KitButton({
  text,
  icon = 'arrow-right',
  bgColor,
  textColor,
  radius = 9999,
  fontFamily,
  fontSize,
  fontWeight = 700,
  paddingX = 34,
  paddingY = 18,
  boxShadow,
  animIn = 'pop',
  animOut = 'fade',
  ambient = 'pulse',
  ease = 'snappy',
  delayFrames = 10,
  exitFrames = 10,
  style,
}: KitButtonProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useKitSceneContext();
  const entranceFrame = frame + ctx.preRollFrames;

  const entrance = computeEntranceStyle({
    preset: animIn,
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

  const effectiveAmbient =
    ctx.style.emphasis !== 'none' && ambient === 'pulse'
      ? ctx.style.emphasis
      : ambient;

  const emphasis = computeEmphasisStyle({
    preset: effectiveAmbient,
    frame,
    fps,
  });

  const motionStyle = mergeMotionStyles(entrance, exit, {
    transform: emphasis.transform,
  });

  const resolvedShadow =
    boxShadow ??
    getStyleCardShadow(
      ctx.style,
      ctx.palette.accent,
      ctx.palette.text,
      emphasis.glowIntensity
    );
  const resolvedBorder = getStyleCardBorder(
    ctx.style,
    ctx.palette.accent2,
    ctx.palette.text,
    false
  );

  const cleanText = stripHighlightMarkers(text);

  return (
    <div
      {...kitAttrs('button', { sceneIndex: ctx.sceneIndex, zone: 'content' })}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.max(10, Math.round(fontSize * 0.45)),
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: radius,
        border: resolvedBorder,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY,
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight: 1.1,
        letterSpacing: '-0.01em',
        boxShadow: resolvedShadow,
        maxWidth: '100%',
        whiteSpace: 'nowrap',
        ...motionStyle,
        ...style,
      }}
    >
      {emphasis.shineProgress !== null ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-30%',
            bottom: '-30%',
            left: `${(-45 + emphasis.shineProgress * 190).toFixed(1)}%`,
            width: '32%',
            background:
              'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0) 100%)',
            transform: 'rotate(18deg)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <span style={{ position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cleanText}
      </span>
      {icon ? (
        <KitIcon
          name={icon}
          size={Math.round(fontSize * 1.05)}
          color={textColor}
          strokeWidth={2.5}
        />
      ) : null}
    </div>
  );
}
