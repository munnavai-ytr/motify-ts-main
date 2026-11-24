'use client';

import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import type { CompiledComponentType } from '@/lib/compile';
import type { Plan, VideoMessage, VideoSceneRecord } from '@/lib/types';
import {
  buildSceneTheme,
  computeSceneSpecHash,
  secondsToFrames,
  type SceneProps,
} from '@/lib/video/dimensions';

export interface AssembledSceneEntry {
  sceneId: string;
  name: string;
  component: CompiledComponentType;
  props: SceneProps;
}

export interface AssembledTimelineItem {
  sceneId: string;
  props: SceneProps;
}

export interface AssembledCompositionInputProps extends Record<string, unknown> {
  backgroundColor: string;
  timeline: AssembledTimelineItem[];
}

/**
 * Builds a deterministic root Remotion composition closing over the compiled
 * scene components while receiving strictly JSON-serializable `inputProps`
 * (texts, theme, durationInFrames). Editing plan copy, colors, font, or
 * duration updates the rendered video immediately without recompilation.
 */
export function createAssembledComposition(
  compiledBySceneId: Record<string, CompiledComponentType>
): React.FC<AssembledCompositionInputProps> {
  const AssembledVideoComposition: React.FC<AssembledCompositionInputProps> = ({
    backgroundColor,
    timeline,
  }) => {
    const positioned = timeline.reduce<
      Array<{ item: AssembledTimelineItem; from: number; end: number }>
    >((acc, item) => {
      const from = acc.length === 0 ? 0 : acc[acc.length - 1].end;
      const end = from + item.props.durationInFrames;
      acc.push({ item, from, end });
      return acc;
    }, []);

    return (
      <AbsoluteFill style={{ backgroundColor }}>
        {positioned.map(({ item, from }) => {
          const SceneComponent = compiledBySceneId[item.sceneId];
          if (!SceneComponent) {
            return null;
          }
          return (
            <Sequence
              key={item.sceneId}
              from={from}
              durationInFrames={item.props.durationInFrames}
            >
              <SceneComponent {...item.props} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  };

  AssembledVideoComposition.displayName = 'AssembledVideoComposition';
  return AssembledVideoComposition;
}

export interface TimelineBuildSummary {
  backgroundColor: string;
  entries: AssembledSceneEntry[];
  totalFrames: number;
  failedScenes: VideoSceneRecord[];
  outdatedSceneIds: string[];
}

export function toAssembledInputProps(
  summary: TimelineBuildSummary
): AssembledCompositionInputProps {
  return {
    backgroundColor: summary.backgroundColor,
    timeline: summary.entries.map((entry) => ({
      sceneId: entry.sceneId,
      props: entry.props,
    })),
  };
}

/**
 * Deterministically builds the playable timeline from compiled OK scenes,
 * binding live texts, theme, and duration from the matching Plan when present
 * so text/color/font/duration edits update instantly via props without rebuild.
 */
export function buildAssembledTimeline(params: {
  video: VideoMessage;
  linkedPlan: Plan | null;
  compiledBySceneId: Record<string, CompiledComponentType>;
}): TimelineBuildSummary {
  const { video, linkedPlan, compiledBySceneId } = params;

  const theme = linkedPlan
    ? buildSceneTheme(linkedPlan.style)
    : {
        background: '#0B0F17',
        surface: '#161E2E',
        text: '#F3F6FC',
        accent: '#6D5EF8',
        accentAlt: '#38BDF8',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", "Noto Sans Bengali", sans-serif',
      };

  const planScenesById = new Map(
    (linkedPlan?.scenes ?? []).map((s) => [s.id, s])
  );

  // Preserve Plan scene order when a linkedPlan exists so scene reordering/edits reflect cleanly,
  // falling back to video.scenes order if no linked plan is passed.
  const orderedRecords: VideoSceneRecord[] = linkedPlan
    ? linkedPlan.scenes
        .map((planScene) =>
          video.scenes.find((record) => record.sceneId === planScene.id)
        )
        .filter((record): record is VideoSceneRecord => Boolean(record))
    : video.scenes;

  const entries: AssembledSceneEntry[] = [];
  const failedScenes: VideoSceneRecord[] = [];
  const outdatedSceneIds: string[] = [];
  let totalFrames = 0;

  for (const record of orderedRecords) {
    const livePlanScene = planScenesById.get(record.sceneId);
    if (
      livePlanScene &&
      computeSceneSpecHash(livePlanScene) !== record.specHash
    ) {
      outdatedSceneIds.push(record.sceneId);
    }

    if (record.status === 'failed') {
      failedScenes.push(record);
      continue;
    }

    if (record.status !== 'ok' && record.status !== 'outdated') {
      continue;
    }

    const compiled = compiledBySceneId[record.sceneId];
    if (!compiled) {
      continue;
    }

    const durationInFrames = livePlanScene
      ? secondsToFrames(livePlanScene.durationSeconds, video.fps)
      : Math.max(1, Math.round(3 * video.fps));

    const texts = livePlanScene ? livePlanScene.onScreenText : [];

    entries.push({
      sceneId: record.sceneId,
      name: livePlanScene ? livePlanScene.name : record.name,
      component: compiled,
      props: {
        texts,
        theme,
        durationInFrames,
      },
    });
    totalFrames += durationInFrames;
  }

  return {
    backgroundColor: theme.background,
    entries,
    totalFrames,
    failedScenes,
    outdatedSceneIds,
  };
}
