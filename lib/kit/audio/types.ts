export const MUSIC_STYLE_NAMES = [
  'lofi',
  'corporate',
  'upbeat-pop',
  'cinematic',
  'playful',
  'tech-pulse',
  'ambient',
] as const;

export type MusicStyleName = (typeof MUSIC_STYLE_NAMES)[number];

export const SFX_NAMES = [
  'whoosh',
  'soft-swoosh',
  'pop',
  'click',
  'tick',
  'riser',
  'impact',
  'sparkle',
  'chime',
  'ding',
  'slide',
  'button-press',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export const SFX_MODES = ['auto', 'minimal', 'off'] as const;

export type SfxMode = (typeof SFX_MODES)[number];

export interface GeneratedMusicSpec {
  source?: 'synth';
  style: MusicStyleName;
  bpm?: number;
  seed?: number;
  volume?: number;
}

export interface UploadedMusicSpec {
  source: 'upload';
  mediaId: string;
  volume?: number;
  startAt?: number;
  loop?: boolean;
}

export type AudioMusicSpec = GeneratedMusicSpec | UploadedMusicSpec;

export interface AudioSpec {
  music?: AudioMusicSpec;
  sfx?: SfxMode;
  sfxVolume?: number;
  mute?: boolean;
}

export interface SfxParams {
  durationSec?: number;
  direction?: 'up' | 'down';
  pitchScale?: number;
  intensity?: number;
  seed?: number;
}

export interface PlannedSfxEvent {
  timeSec: number;
  name: SfxName;
  params?: SfxParams;
  reason: string;
}

export interface MusicStyleDef {
  name: MusicStyleName;
  label: string;
  description: string;
  tempoRange: readonly [number, number];
  defaultBpm: number;
  scaleIntervals: readonly number[];
  rootMidiPool: readonly number[];
  progressions: ReadonlyArray<readonly number[]>;
  swing: number;
  reverbWet: number;
  reverbDecaySec: number;
  drumIntensity: number;
}

export interface SfxPresetDef {
  name: SfxName;
  label: string;
  description: string;
  defaultDurationSec: number;
}

export interface BeatGrid {
  bpm: number;
  beatSec: number;
  barSec: number;
  beats: number[];
  bars: number[];
}

export interface RenderedAudioTrack {
  wav: Blob;
  url: string;
  durationSec: number;
  renderMs: number;
  cacheKey: string;
  sampleRate: number;
  hasMusic: boolean;
  sfxCount: number;
  plannedSfx: PlannedSfxEvent[];
}

export interface AudioRenderStatus {
  state: 'idle' | 'preparing' | 'ready' | 'error';
  renderMs?: number;
  error?: string;
}

export const DEFAULT_MUSIC_VOLUME = 0.35;
export const DEFAULT_SFX_VOLUME = 0.85;
export const AUDIO_SAMPLE_RATE = 44100;
export const UPLOADED_MUSIC_MONO_THRESHOLD_SEC = 180;
export const UPLOADED_MUSIC_MAX_DURATION_SEC = 300;

export const MUSIC_STYLE_DEFS: Record<MusicStyleName, MusicStyleDef> = {
  lofi: {
    name: 'lofi',
    label: 'Lo-Fi Chill',
    description: 'Warm dusty Rhodes chords, mellow swing drums, relaxed tape vibe',
    tempoRange: [72, 90],
    defaultBpm: 80,
    scaleIntervals: [0, 2, 3, 5, 7, 10], // Minor pentatonic / Dorian color
    rootMidiPool: [53, 55, 57, 60], // F3, G3, A3, C4
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 5, 4],
      [2, 5, 0, 3],
    ],
    swing: 0.24,
    reverbWet: 0.24,
    reverbDecaySec: 1.5,
    drumIntensity: 0.65,
  },
  corporate: {
    name: 'corporate',
    label: 'Corporate Clean',
    description: 'Optimistic muted guitar-like plucks, steady pulse, clear air',
    tempoRange: [106, 124],
    defaultBpm: 116,
    scaleIntervals: [0, 2, 4, 7, 9, 11], // Major + 7th
    rootMidiPool: [60, 62, 65, 67], // C4, D4, F4, G4
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 4],
      [5, 3, 0, 4],
    ],
    swing: 0.04,
    reverbWet: 0.2,
    reverbDecaySec: 1.3,
    drumIntensity: 0.72,
  },
  'upbeat-pop': {
    name: 'upbeat-pop',
    label: 'Upbeat Pop',
    description: 'Bright bouncy synth chords, snappy claps, driving bassline',
    tempoRange: [116, 132],
    defaultBpm: 124,
    scaleIntervals: [0, 2, 4, 5, 7, 9, 11], // Ionian major
    rootMidiPool: [58, 60, 63, 65],
    progressions: [
      [0, 4, 5, 3],
      [3, 4, 0, 5],
      [0, 2, 3, 4],
    ],
    swing: 0.08,
    reverbWet: 0.18,
    reverbDecaySec: 1.2,
    drumIntensity: 0.92,
  },
  cinematic: {
    name: 'cinematic',
    label: 'Cinematic Rise',
    description: 'Lush wide strings pad, deep sub anchors, dramatic pulse',
    tempoRange: [76, 98],
    defaultBpm: 88,
    scaleIntervals: [0, 2, 3, 5, 7, 8, 10], // Natural minor
    rootMidiPool: [48, 50, 52, 55],
    progressions: [
      [0, 5, 2, 6],
      [0, 3, 5, 4],
      [5, 6, 0, 0],
    ],
    swing: 0.0,
    reverbWet: 0.38,
    reverbDecaySec: 2.3,
    drumIntensity: 0.58,
  },
  playful: {
    name: 'playful',
    label: 'Playful Bounce',
    description: 'Marimba-bright FM plucks, bouncy bass, crisp snappy hats',
    tempoRange: [108, 128],
    defaultBpm: 118,
    scaleIntervals: [0, 2, 4, 7, 9], // Major pentatonic
    rootMidiPool: [60, 62, 64, 67],
    progressions: [
      [0, 3, 4, 0],
      [0, 1, 3, 4],
      [0, 4, 3, 4],
    ],
    swing: 0.18,
    reverbWet: 0.16,
    reverbDecaySec: 1.0,
    drumIntensity: 0.78,
  },
  'tech-pulse': {
    name: 'tech-pulse',
    label: 'Tech Pulse',
    description: 'Precision 16th-note FM arp, tight electronic kick, sleek sub',
    tempoRange: [118, 134],
    defaultBpm: 126,
    scaleIntervals: [0, 2, 3, 5, 7, 9, 10], // Dorian
    rootMidiPool: [50, 52, 55, 57],
    progressions: [
      [0, 0, 5, 6],
      [0, 2, 5, 4],
      [0, 3, 5, 6],
    ],
    swing: 0.0,
    reverbWet: 0.22,
    reverbDecaySec: 1.35,
    drumIntensity: 0.9,
  },
  ambient: {
    name: 'ambient',
    label: 'Ambient Drift',
    description: 'Evolving airy pads, soft shimmer chimes, minimal pulse',
    tempoRange: [64, 84],
    defaultBpm: 72,
    scaleIntervals: [0, 2, 4, 6, 7, 9, 11], // Lydian
    rootMidiPool: [55, 57, 60, 62],
    progressions: [
      [0, 4, 3, 0],
      [0, 2, 4, 1],
      [3, 0, 4, 0],
    ],
    swing: 0.0,
    reverbWet: 0.44,
    reverbDecaySec: 2.6,
    drumIntensity: 0.18,
  },
};

export const SFX_PRESET_DEFS: Record<SfxName, SfxPresetDef> = {
  whoosh: {
    name: 'whoosh',
    label: 'Whoosh',
    description: 'Filtered noise sweep for fast push transitions',
    defaultDurationSec: 0.34,
  },
  'soft-swoosh': {
    name: 'soft-swoosh',
    label: 'Soft Swoosh',
    description: 'Warm airy breeze sweep for wipes and reveals',
    defaultDurationSec: 0.36,
  },
  pop: {
    name: 'pop',
    label: 'Pop',
    description: 'Crisp pitched bubble pop for cards and circles',
    defaultDurationSec: 0.14,
  },
  click: {
    name: 'click',
    label: 'Click',
    description: 'Tight mechanical UI click',
    defaultDurationSec: 0.06,
  },
  tick: {
    name: 'tick',
    label: 'Tick',
    description: 'Clean counter and typewriter tick',
    defaultDurationSec: 0.045,
  },
  riser: {
    name: 'riser',
    label: 'Riser',
    description: 'Building noise and pitch swell into climax scenes',
    defaultDurationSec: 1.15,
  },
  impact: {
    name: 'impact',
    label: 'Impact',
    description: 'Sub sine drop and punchy burst for slams and blocks',
    defaultDurationSec: 0.45,
  },
  sparkle: {
    name: 'sparkle',
    label: 'Sparkle',
    description: 'Cascading bell partials shimmer',
    defaultDurationSec: 0.65,
  },
  chime: {
    name: 'chime',
    label: 'Chime',
    description: 'Warm resonant chord chime for CTA resolve',
    defaultDurationSec: 0.85,
  },
  ding: {
    name: 'ding',
    label: 'Ding',
    description: 'Bright focused bell ding for highlights',
    defaultDurationSec: 0.52,
  },
  slide: {
    name: 'slide',
    label: 'Slide',
    description: 'Smooth upward tone glide for motion entrances',
    defaultDurationSec: 0.28,
  },
  'button-press': {
    name: 'button-press',
    label: 'Button Press',
    description: 'Tactile double-stage button click + release pop',
    defaultDurationSec: 0.12,
  },
};
