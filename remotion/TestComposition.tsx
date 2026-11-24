'use client';

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const TestComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.9 },
  });

  const subtitleSpring = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  const shapeScale = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 12, stiffness: 90 },
  });

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const titleTranslateY = interpolate(titleSpring, [0, 1], [48, 0]);

  const subtitleOpacity = interpolate(frame, [18, 38], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subtitleTranslateY = interpolate(subtitleSpring, [0, 1], [28, 0]);

  const rotation = interpolate(frame, [0, durationInFrames], [0, 180]);
  const dashOffset = interpolate(frame, [0, 90], [320, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const progressWidth = interpolate(frame, [0, durationInFrames - 1], [0, 480], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0B1120',
        color: '#F8FAFC',
        fontFamily: SYSTEM_FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 72,
          maxWidth: 1520,
          width: '100%',
        }}
      >
        {/* Animated SVG shape */}
        <div
          style={{
            width: 320,
            height: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${shapeScale})`,
            flexShrink: 0,
          }}
        >
          <svg width="320" height="320" viewBox="0 0 320 320">
            <rect
              x="28"
              y="28"
              width="264"
              height="264"
              rx="48"
              fill="#111C33"
              stroke="#1E3A5F"
              strokeWidth="4"
            />
            <g transform={`translate(160 160) rotate(${rotation})`}>
              <polygon
                points="0,-96 84,48 -84,48"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="8"
                strokeLinejoin="round"
                strokeDasharray="320"
                strokeDashoffset={dashOffset}
              />
              <circle
                cx="0"
                cy="0"
                r="34"
                fill="#2563EB"
                stroke="#93C5FD"
                strokeWidth="5"
              />
            </g>
          </svg>
        </div>

        {/* Title & Subtitle */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 3,
              color: '#60A5FA',
              marginBottom: 20,
              opacity: titleOpacity,
            }}
          >
            PHASE 0 FEASIBILITY TEST
          </div>

          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.08,
              color: '#F8FAFC',
              opacity: titleOpacity,
              transform: `translateY(${titleTranslateY}px)`,
              marginBottom: 28,
            }}
          >
            Browser Motion Engine
          </div>

          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              lineHeight: 1.4,
              color: '#94A3B8',
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleTranslateY}px)`,
              marginBottom: 40,
            }}
          >
            Deterministic React frames compiled and encoded via WebCodecs.
          </div>

          <div
            style={{
              width: 480,
              height: 8,
              backgroundColor: '#1E293B',
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div
              style={{
                width: progressWidth,
                height: 8,
                backgroundColor: '#3B82F6',
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default TestComposition;
