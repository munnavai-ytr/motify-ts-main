import { getMediaRecord } from '@/lib/db';
import { computeSceneTimings, totalFrames, type VideoSpec } from '../spec';
import {
  conditionUploadedAudioBuffer,
  createSoftLimiterCurve,
  encodeAudioBufferToWav,
  hashSeed,
} from './dsp';
import { describeAudioSummary, isAudioActive } from './helpers';
import { clampBpmForStyle, scheduleGenerativeMusic } from './music';
import { planSfx } from './planner';
import { scheduleSfx } from './synth';
import {
  AUDIO_SAMPLE_RATE,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  SFX_PRESET_DEFS,
  UPLOADED_MUSIC_MAX_DURATION_SEC,
  UPLOADED_MUSIC_MONO_THRESHOLD_SEC,
  type AudioRenderStatus,
  type MusicStyleName,
  type PlannedSfxEvent,
  type RenderedAudioTrack,
  type SfxName,
  type SfxParams,
} from './types';

export { describeAudioSummary, isAudioActive };

const MAX_CACHE_ENTRIES = 14;
const trackCache = new Map<string, RenderedAudioTrack>();
const inFlightCache = new Map<string, Promise<RenderedAudioTrack>>();
const statusMap = new Map<string, AudioRenderStatus>();
const statusListeners = new Map<string, Set<(status: AudioRenderStatus) => void>>();

function emitStatus(cacheKey: string, status: AudioRenderStatus): void {
  statusMap.set(cacheKey, status);
  const listeners = statusListeners.get(cacheKey);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(status);
  }
}

export function getAudioTrackStatus(cacheKey: string): AudioRenderStatus {
  return statusMap.get(cacheKey) ?? { state: 'idle' };
}

export function subscribeAudioStatus(
  cacheKey: string,
  listener: (status: AudioRenderStatus) => void
): () => void {
  let set = statusListeners.get(cacheKey);
  if (!set) {
    set = new Set();
    statusListeners.set(cacheKey, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      statusListeners.delete(cacheKey);
    }
  };
}

export function computeAudioCacheKey(spec: VideoSpec): string {
  const fps = spec.fps || 30;
  const frames = totalFrames(spec);
  const timings = computeSceneTimings(spec);
  const timingSignature = timings.map((t) => ({
    id: t.scene.id,
    layout: t.scene.layout,
    startFrame: t.startFrame,
    durationInFrames: t.durationInFrames,
    transition: t.scene.transition,
    animIn: t.scene.animIn,
    bg: t.scene.bg,
    hasButton: Boolean(
      t.scene.slots.buttonText || t.scene.slots.cta
    ),
    hasHeadline: Boolean(
      t.scene.slots.headline ||
        t.scene.slots.title ||
        t.scene.slots.heading ||
        t.scene.slots.quote
    ),
  }));

  const payload = JSON.stringify({
    v: 1,
    fps,
    frames,
    intensity: spec.intensity,
    seed: spec.seed,
    audio: spec.audio ?? null,
    timings: timingSignature,
  });

  return `audio_${hashSeed(payload).toString(36)}_${frames}`;
}

function buildMasterStage(ctx: BaseAudioContext): {
  musicBus: GainNode;
  sfxBus: GainNode;
} {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.95, 0);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-14, 0);
  compressor.knee.setValueAtTime(10, 0);
  compressor.ratio.setValueAtTime(3.0, 0);
  compressor.attack.setValueAtTime(0.008, 0);
  compressor.release.setValueAtTime(0.14, 0);

  const softLimiter = ctx.createWaveShaper();
  softLimiter.curve = createSoftLimiterCurve(0.891); // ~ -1.0 dBFS ceiling
  softLimiter.oversample = '2x';

  const musicBus = ctx.createGain();
  // Nominal scaling keeps music cleanly ~14 dB below SFX peaks at default volumes
  musicBus.gain.setValueAtTime(0.56, 0);

  const sfxBus = ctx.createGain();
  sfxBus.gain.setValueAtTime(1.0, 0);

  musicBus.connect(masterGain);
  sfxBus.connect(masterGain);
  masterGain.connect(compressor);
  compressor.connect(softLimiter);
  softLimiter.connect(ctx.destination);

  return { musicBus, sfxBus };
}

function setTrackCache(key: string, value: RenderedAudioTrack): void {
  if (trackCache.has(key)) {
    trackCache.delete(key);
  }
  trackCache.set(key, value);
  while (trackCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = trackCache.keys().next().value;
    if (!oldestKey) break;
    const evicted = trackCache.get(oldestKey);
    trackCache.delete(oldestKey);
    if (evicted?.url && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(evicted.url);
      } catch {
        // Ignore revoke failure
      }
    }
  }
}

function getOfflineAudioContextCtor(): typeof OfflineAudioContext {
  if (typeof window === 'undefined') {
    throw new Error('OfflineAudioContext requires a browser environment.');
  }
  const ctor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!ctor) {
    throw new Error('Web Audio OfflineAudioContext is not supported in this browser.');
  }
  return ctor;
}

export async function renderAudioTrack(spec: VideoSpec): Promise<RenderedAudioTrack> {
  const cacheKey = computeAudioCacheKey(spec);
  const existing = trackCache.get(cacheKey);
  if (existing) {
    // Refresh LRU order
    trackCache.delete(cacheKey);
    trackCache.set(cacheKey, existing);
    emitStatus(cacheKey, { state: 'ready', renderMs: existing.renderMs });
    return existing;
  }

  const inflight = inFlightCache.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const runPromise = (async (): Promise<RenderedAudioTrack> => {
    const startedAt = performance.now();
    emitStatus(cacheKey, { state: 'preparing' });

    try {
      const fps = spec.fps || 30;
      const frames = totalFrames(spec);
      const durationSec = Math.max(0.2, Math.min(300, frames / fps));
      const OfflineCtx = getOfflineAudioContextCtor();
      const totalSamples = Math.max(1, Math.ceil(durationSec * AUDIO_SAMPLE_RATE));
      const ctx = new OfflineCtx(2, totalSamples, AUDIO_SAMPLE_RATE);

      const { musicBus, sfxBus } = buildMasterStage(ctx);
      const audio = spec.audio;
      let hasMusic = false;
      let plannedSfx: PlannedSfxEvent[] = [];

      if (audio && !audio.mute) {
        // 1. Music (synth or uploaded)
        if (audio.music) {
          const musicVol = Math.max(
            0,
            Math.min(1, audio.music.volume ?? DEFAULT_MUSIC_VOLUME)
          );
          if (musicVol > 0.001) {
            if (audio.music.source === 'upload') {
              try {
                const record = await getMediaRecord(audio.music.mediaId);
                if (record?.blob) {
                  const arr = await record.blob.arrayBuffer();
                  const decoded = await ctx.decodeAudioData(arr.slice(0));
                  const conditioned = conditionUploadedAudioBuffer(ctx, decoded, {
                    startAtSec: audio.music.startAt ?? 0,
                    targetDurationSec: durationSec,
                    loop: audio.music.loop !== false,
                    monoThresholdSec: UPLOADED_MUSIC_MONO_THRESHOLD_SEC,
                    maxDurationSec: UPLOADED_MUSIC_MAX_DURATION_SEC,
                  });

                  const src = ctx.createBufferSource();
                  src.buffer = conditioned;

                  const uploadGain = ctx.createGain();
                  const playDur = Math.min(
                    durationSec,
                    conditioned.length / conditioned.sampleRate
                  );
                  const fadeIn = Math.min(0.5, playDur * 0.25);
                  const fadeOut = Math.min(1.2, playDur * 0.4);
                  const fadeOutStart = Math.max(fadeIn, playDur - fadeOut);

                  uploadGain.gain.setValueAtTime(0, 0);
                  uploadGain.gain.linearRampToValueAtTime(musicVol, fadeIn);
                  uploadGain.gain.setValueAtTime(musicVol, fadeOutStart);
                  uploadGain.gain.linearRampToValueAtTime(0, playDur);

                  src.connect(uploadGain);
                  uploadGain.connect(musicBus);
                  src.start(0);
                  src.stop(Math.min(durationSec, playDur + 0.02));
                  hasMusic = true;
                }
              } catch {
                // Gracefully degrade when media store is missing or audio fails to decode
              }
            } else {
              scheduleGenerativeMusic(ctx, musicBus, {
                style: audio.music.style,
                bpm: audio.music.bpm,
                seed: audio.music.seed ?? spec.seed,
                durationSec,
                volume: musicVol,
              });
              hasMusic = true;
            }
          }
        }

        // 2. Planned SFX
        const sfxVol = Math.max(
          0,
          Math.min(1, audio.sfxVolume ?? DEFAULT_SFX_VOLUME)
        );
        sfxBus.gain.setValueAtTime(sfxVol, 0);
        plannedSfx = planSfx(spec);
        for (const ev of plannedSfx) {
          scheduleSfx(ctx, sfxBus, ev.name, ev.timeSec, ev.params);
        }
      }

      const rendered = await ctx.startRendering();

      if (rendered.numberOfChannels === 0 || rendered.length === 0) {
        throw new Error('AudioRender: empty buffer — check node connections');
      }

      const ch0 = rendered.getChannelData(0);
      const firstNonZeroSamples: number[] = [];
      let peakAmplitude = 0;

      for (let i = 0; i < ch0.length; i++) {
        const sample = ch0[i];
        const abs = Math.abs(sample);
        if (abs > peakAmplitude) {
          peakAmplitude = abs;
        }
        if (sample !== 0 && firstNonZeroSamples.length < 10) {
          firstNonZeroSamples.push(Number(sample.toFixed(6)));
        }
      }

      for (let ch = 1; ch < rendered.numberOfChannels; ch++) {
        const chData = rendered.getChannelData(ch);
        for (let i = 0; i < chData.length; i++) {
          const abs = Math.abs(chData[i]);
          if (abs > peakAmplitude) {
            peakAmplitude = abs;
          }
        }
      }

      if (firstNonZeroSamples.length === 0 || peakAmplitude === 0) {
        throw new Error('AudioRender: empty buffer — check node connections');
      }

      console.warn('[AudioRender] Buffer verified', {
        cacheKey,
        firstNonZeroSamples,
        peakAmplitude: Number(peakAmplitude.toFixed(6)),
        channels: rendered.numberOfChannels,
        sampleRate: rendered.sampleRate,
        durationSec,
      });

      const wav = encodeAudioBufferToWav(rendered);
      if (wav.size <= 44) {
        throw new Error('AudioRender: empty WAV output — check PCM encoding');
      }

      const url = URL.createObjectURL(wav);
      if (!url) {
        throw new Error('AudioRender: failed to create object URL for WAV track');
      }

      const renderMs = Math.max(1, Math.round(performance.now() - startedAt));

      const result: RenderedAudioTrack = {
        wav,
        url,
        durationSec,
        renderMs,
        cacheKey,
        sampleRate: AUDIO_SAMPLE_RATE,
        hasMusic,
        sfxCount: plannedSfx.length,
        plannedSfx,
      };

      setTrackCache(cacheKey, result);
      emitStatus(cacheKey, { state: 'ready', renderMs });
      return result;
    } catch (err) {
      emitStatus(cacheKey, {
        state: 'error',
        error: err instanceof Error ? err.message : 'Audio render failed',
      });
      throw err;
    } finally {
      inFlightCache.delete(cacheKey);
    }
  })();

  inFlightCache.set(cacheKey, runPromise);
  return runPromise;
}

/**
 * Sound Lab: synthesize a standalone SFX clip for immediate preview playback.
 */
export async function renderSfxPreview(
  name: SfxName,
  params: SfxParams = {}
): Promise<{ wav: Blob; url: string; durationSec: number; renderMs: number }> {
  const startedAt = performance.now();
  const OfflineCtx = getOfflineAudioContextCtor();
  const def = SFX_PRESET_DEFS[name];
  const baseDur = params.durationSec ?? def.defaultDurationSec;
  const durationSec = Math.max(0.25, baseDur + 0.14);
  const totalSamples = Math.ceil(durationSec * AUDIO_SAMPLE_RATE);
  const ctx = new OfflineCtx(2, totalSamples, AUDIO_SAMPLE_RATE);

  const { sfxBus } = buildMasterStage(ctx);
  sfxBus.gain.setValueAtTime(0.92, 0);
  scheduleSfx(ctx, sfxBus, name, 0.015, params);

  const rendered = await ctx.startRendering();
  const wav = encodeAudioBufferToWav(rendered);
  const url = URL.createObjectURL(wav);
  const renderMs = Math.max(1, Math.round(performance.now() - startedAt));

  return { wav, url, durationSec, renderMs };
}

/**
 * Sound Lab: synthesize a 10s (configurable) preview for a music style.
 */
export async function renderMusicPreview(
  style: MusicStyleName,
  bpm?: number,
  seed: number = 101,
  durationSec: number = 10
): Promise<{
  wav: Blob;
  url: string;
  durationSec: number;
  bpm: number;
  renderMs: number;
}> {
  const startedAt = performance.now();
  const OfflineCtx = getOfflineAudioContextCtor();
  const safeDur = Math.max(2, Math.min(30, durationSec));
  const resolvedBpm = clampBpmForStyle(style, bpm);
  const totalSamples = Math.ceil(safeDur * AUDIO_SAMPLE_RATE);
  const ctx = new OfflineCtx(2, totalSamples, AUDIO_SAMPLE_RATE);

  const { musicBus } = buildMasterStage(ctx);
  // Boost bus inside standalone Sound Lab preview so users hear full-level music comfortably
  musicBus.gain.setValueAtTime(0.95, 0);
  scheduleGenerativeMusic(ctx, musicBus, {
    style,
    bpm: resolvedBpm,
    seed,
    durationSec: safeDur,
    volume: 0.72,
  });

  const rendered = await ctx.startRendering();
  const wav = encodeAudioBufferToWav(rendered);
  const url = URL.createObjectURL(wav);
  const renderMs = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    wav,
    url,
    durationSec: safeDur,
    bpm: resolvedBpm,
    renderMs,
  };
}
