import type React from 'react';
import type {
  WebRendererHardwareAcceleration,
  WebRendererVideoCodec,
} from '@remotion/web-renderer';
import type { ExportMode } from '@/lib/types';
import { isAudioActive } from '@/lib/kit/audio/helpers';
import { renderAudioTrack } from '@/lib/kit/audio/render';
import { ensureFonts } from '@/lib/kit/fonts';
import type { VideoSpec } from '@/lib/kit/spec';
import { containsBengali } from '@/lib/kit/tokens';

export type { ExportMode };

export interface ExportMp4Progress {
  phase?: 'audio' | 'encoding';
  progressPercent: number;
  encodedFrames: number;
  totalFrames: number;
  elapsedMs: number;
  codec?: WebRendererVideoCodec;
  mode?: ExportMode;
}

export interface ExportMp4Result {
  blob: Blob;
  codec: WebRendererVideoCodec;
  mode: ExportMode;
  hardwareAcceleration: WebRendererHardwareAcceleration;
  videoBitrate: number | null;
  usedFallback: boolean;
  fallbackMessage?: string;
  elapsedMs: number;
  encodedFrames: number;
}

const REFERENCE_1080P_PIXELS = 1920 * 1080;
const COMPATIBILITY_1080P_BITRATE_BPS = 8_000_000;
const MIN_COMPATIBILITY_BITRATE_BPS = 2_000_000;
const MAX_COMPATIBILITY_BITRATE_BPS = 16_000_000;

const CODEC_PREFERENCE_ORDER: ReadonlyArray<WebRendererVideoCodec> = [
  'h264',
  'h265',
  'av1',
  'vp9',
  'vp8',
];

export function computeCompatibilityVideoBitrate(
  width: number,
  height: number
): number {
  const safePixels = Math.max(1, width * height);
  const scaled =
    (COMPATIBILITY_1080P_BITRATE_BPS * safePixels) / REFERENCE_1080P_PIXELS;
  const roundedTo100k = Math.round(scaled / 100_000) * 100_000;
  return Math.min(
    MAX_COMPATIBILITY_BITRATE_BPS,
    Math.max(MIN_COMPATIBILITY_BITRATE_BPS, roundedTo100k)
  );
}

export function formatBitrate(bps: number | null | undefined): string {
  if (typeof bps !== 'number' || !Number.isFinite(bps) || bps <= 0) {
    return 'Auto';
  }
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

export function formatExportModeLabel(mode: ExportMode): string {
  return mode === 'compatibility' ? 'Compatibility' : 'Standard';
}

interface ExportCandidate {
  codec: WebRendererVideoCodec;
  hardwareAcceleration: WebRendererHardwareAcceleration;
  videoBitrate?: number;
  effectiveMode: ExportMode;
}

function isAbortLikeError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error) {
    return (
      err.name === 'AbortError' ||
      err.message.toLowerCase().includes('cancelled')
    );
  }
  return false;
}

function isEncoderOrCodecFailure(
  err: unknown,
  latestEncodedFrames: number
): boolean {
  if (latestEncodedFrames === 0) {
    return true;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('codec') ||
    msg.includes('encoder') ||
    msg.includes('videoencoder') ||
    msg.includes('hardware') ||
    msg.includes('software') ||
    msg.includes('bitrate') ||
    msg.includes('not supported') ||
    msg.includes('unsupported') ||
    msg.includes('configure')
  );
}

function extractVideoSpecFromProps(
  inputProps: Record<string, unknown>
): VideoSpec | null {
  const candidate = inputProps.spec;
  if (
    candidate &&
    typeof candidate === 'object' &&
    'scenes' in candidate &&
    Array.isArray((candidate as { scenes?: unknown }).scenes)
  ) {
    return candidate as VideoSpec;
  }
  return null;
}

export async function exportCompositionToMp4<
  Props extends Record<string, unknown>,
>(params: {
  compositionId: string;
  component: React.ComponentType<Props>;
  inputProps: Props;
  spec?: VideoSpec;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  mode?: ExportMode;
  muted?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExportMp4Progress) => void;
}): Promise<ExportMp4Result> {
  const startTime = performance.now();
  const requestedMode: ExportMode = params.mode ?? 'standard';
  const webRenderer = await import('@remotion/web-renderer');

  if (params.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  let effectiveMuted = Boolean(params.muted);
  let effectiveInputProps: Props = params.inputProps;
  const targetSpec = params.spec ?? extractVideoSpecFromProps(params.inputProps);

  if (targetSpec && !effectiveMuted && isAudioActive(targetSpec.audio)) {
    params.onProgress?.({
      phase: 'audio',
      progressPercent: 0,
      encodedFrames: 0,
      totalFrames: params.durationInFrames,
      elapsedMs: performance.now() - startTime,
      mode: requestedMode,
    });

    try {
      if (typeof document !== 'undefined') {
        await ensureFonts({
          timeoutMs: 4500,
          hasBengali: containsBengali(JSON.stringify(targetSpec.scenes)),
        });
      }
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const renderedAudio = await renderAudioTrack(targetSpec);
      if (
        !renderedAudio?.url ||
        !renderedAudio.wav ||
        renderedAudio.wav.size <= 44
      ) {
        throw new Error('Rendered audio WAV buffer is empty.');
      }
      effectiveInputProps = {
        ...params.inputProps,
        audioUrl: renderedAudio.url,
      } as Props;
    } catch (audioErr: unknown) {
      if (isAbortLikeError(audioErr, params.signal)) {
        throw audioErr;
      }
      console.error(
        '[ExportMP4] Audio pre-render failed or produced silence; continuing with muted audio:',
        audioErr
      );
      effectiveMuted = true;
      effectiveInputProps = {
        ...params.inputProps,
        audioUrl: undefined,
      } as Props;
    }
  } else if (targetSpec && !isAudioActive(targetSpec.audio)) {
    effectiveMuted = true;
  }

  const baseCanRender = await webRenderer.canRenderMediaOnWeb({
    container: 'mp4',
    width: params.width,
    height: params.height,
  });

  const nonCodecIssues = baseCanRender.issues.filter(
    (issue) =>
      issue.severity === 'error' &&
      issue.type !== 'video-codec-unsupported' &&
      issue.type !== 'container-codec-mismatch'
  );
  if (nonCodecIssues.length > 0) {
    const reasons = nonCodecIssues
      .map((issue) => issue.message)
      .filter(Boolean)
      .join(' ');
    throw new Error(
      reasons ||
        'This browser cannot export MP4 video (WebCodecs support or codec unavailable).'
    );
  }

  const encodableCodecs = await webRenderer.getEncodableVideoCodecs('mp4');
  if (encodableCodecs.length === 0) {
    throw new Error('No encodable MP4 video codec was detected in this browser.');
  }

  const orderedCodecs: WebRendererVideoCodec[] = [
    ...CODEC_PREFERENCE_ORDER.filter((c) => encodableCodecs.includes(c)),
    ...encodableCodecs.filter((c) => !CODEC_PREFERENCE_ORDER.includes(c)),
  ];

  const compatBitrate = computeCompatibilityVideoBitrate(
    params.width,
    params.height
  );

  const candidates: ExportCandidate[] = [];
  if (requestedMode === 'compatibility') {
    for (const codec of orderedCodecs) {
      candidates.push({
        codec,
        hardwareAcceleration: 'prefer-software',
        videoBitrate: compatBitrate,
        effectiveMode: 'compatibility',
      });
    }
    for (const codec of orderedCodecs) {
      candidates.push({
        codec,
        hardwareAcceleration: 'no-preference',
        videoBitrate: compatBitrate,
        effectiveMode: 'compatibility',
      });
    }
    for (const codec of orderedCodecs) {
      candidates.push({
        codec,
        hardwareAcceleration: 'no-preference',
        videoBitrate: undefined,
        effectiveMode: 'standard',
      });
    }
  } else {
    for (const codec of orderedCodecs) {
      candidates.push({
        codec,
        hardwareAcceleration: 'no-preference',
        videoBitrate: undefined,
        effectiveMode: 'standard',
      });
    }
    for (const codec of orderedCodecs) {
      candidates.push({
        codec,
        hardwareAcceleration: 'prefer-software',
        videoBitrate: compatBitrate,
        effectiveMode: 'compatibility',
      });
    }
  }

  const primaryCandidate = candidates[0];
  let firstFailureReason: string | undefined;
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const canRenderCandidate = await webRenderer.canRenderMediaOnWeb({
      container: 'mp4',
      videoCodec: candidate.codec,
      width: params.width,
      height: params.height,
      ...(candidate.videoBitrate !== undefined
        ? { videoBitrate: candidate.videoBitrate }
        : {}),
    });

    if (!canRenderCandidate.canRender) {
      const reason = canRenderCandidate.issues
        .map((issue) => issue.message)
        .filter(Boolean)
        .join(' ');
      if (!firstFailureReason && reason) {
        firstFailureReason = reason;
      }
      continue;
    }

    let latestEncodedFrames = 0;
    try {
      const { getBlob } = await webRenderer.renderMediaOnWeb({
        composition: {
          id: params.compositionId,
          component: params.component,
          durationInFrames: params.durationInFrames,
          fps: params.fps,
          width: params.width,
          height: params.height,
          defaultProps: effectiveInputProps,
        },
        inputProps: effectiveInputProps,
        container: 'mp4',
        videoCodec: candidate.codec,
        hardwareAcceleration: candidate.hardwareAcceleration,
        ...(candidate.videoBitrate !== undefined
          ? { videoBitrate: candidate.videoBitrate }
          : {}),
        ...(effectiveMuted ? { muted: true } : {}),
        licenseKey: 'free-license',
        signal: params.signal,
        onProgress: (p) => {
          latestEncodedFrames = p.encodedFrames;
          params.onProgress?.({
            phase: 'encoding',
            progressPercent: Math.min(
              100,
              Math.max(0, Math.round(p.progress * 100))
            ),
            encodedFrames: p.encodedFrames,
            totalFrames: params.durationInFrames,
            elapsedMs: performance.now() - startTime,
            codec: candidate.codec,
            mode: candidate.effectiveMode,
          });
        },
      });

      const blob = await getBlob();
      const elapsedMs = performance.now() - startTime;
      const usedFallback = i > 0;
      const fallbackMessage = usedFallback
        ? `${primaryCandidate.codec} (${formatExportModeLabel(requestedMode)}) was not supported here; exported with ${candidate.codec} (${formatExportModeLabel(candidate.effectiveMode)}, ${candidate.hardwareAcceleration}, ${formatBitrate(candidate.videoBitrate)}).${firstFailureReason ? ` Reason: ${firstFailureReason}` : ''}`
        : undefined;

      return {
        blob,
        codec: candidate.codec,
        mode: candidate.effectiveMode,
        hardwareAcceleration: candidate.hardwareAcceleration,
        videoBitrate: candidate.videoBitrate ?? null,
        usedFallback,
        fallbackMessage,
        elapsedMs,
        encodedFrames: latestEncodedFrames || params.durationInFrames,
      };
    } catch (err: unknown) {
      if (isAbortLikeError(err, params.signal)) {
        throw err;
      }
      lastError = err;
      const reason = err instanceof Error ? err.message : String(err);
      if (!firstFailureReason && reason) {
        firstFailureReason = reason;
      }
      if (!isEncoderOrCodecFailure(err, latestEncodedFrames)) {
        throw err;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(
    firstFailureReason ||
      'No supported MP4 encoder configuration succeeded in this browser.'
  );
}
