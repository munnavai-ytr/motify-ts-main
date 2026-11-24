import type { MoodName, StyleName } from '../tokens';
import { clampBpmForStyle } from './music';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MUSIC_STYLE_NAMES,
  type AudioSpec,
  type MusicStyleName,
} from './types';

export function snapDurationsToBeatGrid(
  durations: readonly number[],
  bpm: number,
  minDur: number = 1.5,
  maxDur: number = 15
): number[] {
  if (durations.length === 0 || !Number.isFinite(bpm) || bpm <= 0) {
    return [...durations];
  }

  const beatSec = 60 / Math.max(40, Math.min(200, bpm));
  const rawTotal = durations.reduce((sum, d) => sum + d, 0);

  const candidates = durations.map((dur) => {
    const nearestBeat = Math.round(dur / beatSec) * beatSec;
    const clampedToBounds = Math.max(minDur, Math.min(maxDur, nearestBeat));
    const delta = clampedToBounds - dur;
    // Clamp per-scene shift to at most ±0.3s
    const limitedDelta = Math.max(-0.3, Math.min(0.3, delta));
    const snapped = Math.round((dur + limitedDelta) * 1000) / 1000;
    return {
      raw: dur,
      snapped: Math.max(minDur, Math.min(maxDur, snapped)),
    };
  });

  // Ensure total duration stays within ±1.0s of original total
  const snappedTotal = candidates.reduce((sum, c) => sum + c.snapped, 0);
  const totalDelta = snappedTotal - rawTotal;

  if (Math.abs(totalDelta) <= 1.0) {
    return candidates.map((c) => c.snapped);
  }

  // Proportionally scale deltas back toward raw durations until |totalDelta| <= 0.95s
  const scaleFactor = 0.95 / Math.max(1e-4, Math.abs(totalDelta));
  return candidates.map((c) => {
    const delta = c.snapped - c.raw;
    const adjusted = Math.round((c.raw + delta * scaleFactor) * 1000) / 1000;
    return Math.max(minDur, Math.min(maxDur, adjusted));
  });
}

export function pickDefaultMusicStyleForTheme(
  style: StyleName,
  mood: MoodName
): MusicStyleName {
  switch (style) {
    case 'luxe':
      return mood === 'soft' ? 'ambient' : 'cinematic';
    case 'playful-pop':
      return 'playful';
    case 'neon-tech':
      return 'tech-pulse';
    case 'editorial':
      return mood === 'soft' ? 'ambient' : 'lofi';
    case 'bold-poster':
      return 'upbeat-pop';
    case 'organic-soft':
      return 'ambient';
    case 'clean':
    default:
      break;
  }

  switch (mood) {
    case 'elegant':
      return 'cinematic';
    case 'playful':
      return 'playful';
    case 'tech':
      return 'tech-pulse';
    case 'soft':
      return 'lofi';
    case 'bold':
      return 'upbeat-pop';
    default:
      return 'corporate';
  }
}

export function hasNoSoundIntent(promptText?: string): boolean {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return (
    /\bno sound\b/.test(lower) ||
    /\bno audio\b/.test(lower) ||
    /\bwithout audio\b/.test(lower) ||
    /\bwithout sound\b/.test(lower) ||
    /\bsilent\b/.test(lower) ||
    /\bmuted\b/.test(lower)
  );
}

export function hasNoMusicIntent(promptText?: string): boolean {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return (
    /\bno music\b/.test(lower) ||
    /\bwithout music\b/.test(lower) ||
    /\bno background music\b/.test(lower) ||
    /\bsfx only\b/.test(lower)
  );
}

export function resolveMusicBpmFromAudio(audio?: AudioSpec): number | null {
  if (!audio || audio.mute || !audio.music) {
    return null;
  }
  if (audio.music.source === 'upload') {
    return null;
  }
  const style = MUSIC_STYLE_NAMES.includes(audio.music.style)
    ? audio.music.style
    : 'corporate';
  return clampBpmForStyle(style, audio.music.bpm);
}

export function isAudioActive(audio?: AudioSpec): boolean {
  if (!audio || audio.mute) {
    return false;
  }
  const hasMusic = Boolean(
    audio.music && (audio.music.volume ?? DEFAULT_MUSIC_VOLUME) > 0.001
  );
  const sfxMode = audio.sfx ?? 'off';
  const hasSfx =
    sfxMode !== 'off' && (audio.sfxVolume ?? DEFAULT_SFX_VOLUME) > 0.001;
  return hasMusic || hasSfx;
}

export function describeAudioSummary(audio?: AudioSpec): string {
  if (!audio) {
    return 'Audio: none';
  }
  if (audio.mute) {
    return 'Audio: muted';
  }
  const hasMusic = Boolean(
    audio.music && (audio.music.volume ?? DEFAULT_MUSIC_VOLUME) > 0.001
  );
  const sfxMode = audio.sfx ?? 'off';
  const hasSfx =
    sfxMode !== 'off' && (audio.sfxVolume ?? DEFAULT_SFX_VOLUME) > 0.001;

  if (hasMusic && hasSfx) {
    return 'Audio: music + effects';
  }
  if (hasMusic) {
    return 'Audio: music only';
  }
  if (hasSfx) {
    return 'Audio: effects only';
  }
  return 'Audio: none';
}
