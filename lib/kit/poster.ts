import { computeSceneTimings, DEFAULT_KIT_FPS, type VideoSpec } from './spec';

/**
 * Picks a representative, non-blank frame ~35% into the first scene
 * (at least 0.8s in when scene duration allows) so still previews and
 * gallery thumbnails show fully settled motion graphics.
 */
export function posterFrame(spec: VideoSpec): number {
  const fps = spec.fps || DEFAULT_KIT_FPS;
  const timings = computeSceneTimings(spec);
  const first = timings[0];
  if (!first) {
    return 0;
  }

  const targetOffset = Math.max(
    Math.round(0.8 * fps),
    Math.round(first.durationInFrames * 0.35)
  );
  const safeMax = Math.max(0, first.durationInFrames - 6);
  return first.startFrame + Math.min(targetOffset, safeMax);
}
