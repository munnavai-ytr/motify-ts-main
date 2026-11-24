import type { SceneProbeFn } from '@/lib/ai/animator';
import { isAbortError } from '@/lib/ai/gemini-client';
import { compileComponent } from '@/lib/compile';
import type { SceneProps } from '@/lib/video/dimensions';

export const SELF_TEST_SCENE_SOURCE = `
import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

interface SceneProps {
  texts: string[];
  theme: {
    background: string;
    surface: string;
    text: string;
    accent: string;
    accentAlt: string;
    fontFamily: string;
  };
  durationInFrames: number;
}

const Scene: React.FC<SceneProps> = ({ texts, theme, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, durationInFrames);
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const shift = interpolate(frame, [0, total], [0, 12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        fontFamily: theme.fontFamily,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          padding: 24,
          borderRadius: 12,
          backgroundColor: theme.surface,
          opacity: enter,
          transform: \`translate3d(0px, \${shift}px, 0px)\`,
        }}
      >
        {texts[0] ?? 'Self test'}
      </div>
    </AbsoluteFill>
  );
};

export default Scene;
`.trim();

export type PipelineSelfTestResult =
  | { ok: true }
  | { ok: false; stage: 'compile' | 'probe'; error: string; source: string };

let cachedSelfTestResult: PipelineSelfTestResult | null = null;
let inFlightSelfTest: Promise<PipelineSelfTestResult> | null = null;

/**
 * Runs a real minimal Remotion scene through the exact same sanitize, static
 * check, compile, and runtime probe pipeline used for AI-generated scenes.
 * Executes lazily once per page load and caches the outcome for the session.
 */
export async function ensurePipelineSelfTest(params: {
  probeScene: SceneProbeFn;
  signal?: AbortSignal;
}): Promise<PipelineSelfTestResult> {
  if (cachedSelfTestResult) {
    return cachedSelfTestResult;
  }

  if (inFlightSelfTest) {
    return inFlightSelfTest;
  }

  const run = (async (): Promise<PipelineSelfTestResult> => {
    const compiled = compileComponent(SELF_TEST_SCENE_SOURCE);
    if (!compiled.ok) {
      const failure: PipelineSelfTestResult = {
        ok: false,
        stage: 'compile',
        error: compiled.error,
        source: SELF_TEST_SCENE_SOURCE,
      };
      cachedSelfTestResult = failure;
      return failure;
    }

    const props: SceneProps = {
      texts: ['Self test'],
      theme: {
        background: '#0B0F17',
        surface: '#161E2E',
        text: '#F3F6FC',
        accent: '#6D5EF8',
        accentAlt: '#38BDF8',
        fontFamily: 'system-ui, sans-serif',
      },
      durationInFrames: 30,
    };

    const probeOutcome = await params.probeScene({
      component: compiled.component,
      props,
      width: 1920,
      height: 1080,
      fps: 30,
      signal: params.signal,
    });

    if (!probeOutcome.ok) {
      const failure: PipelineSelfTestResult = {
        ok: false,
        stage: 'probe',
        error: probeOutcome.error,
        source: SELF_TEST_SCENE_SOURCE,
      };
      cachedSelfTestResult = failure;
      return failure;
    }

    const success: PipelineSelfTestResult = { ok: true };
    cachedSelfTestResult = success;
    return success;
  })();

  inFlightSelfTest = run;

  try {
    return await run;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    const failure: PipelineSelfTestResult = {
      ok: false,
      stage: 'probe',
      error: msg,
      source: SELF_TEST_SCENE_SOURCE,
    };
    cachedSelfTestResult = failure;
    return failure;
  } finally {
    inFlightSelfTest = null;
  }
}
