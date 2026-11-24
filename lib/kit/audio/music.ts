import {
  createDeterministicNoiseBuffer,
  createPrng,
  createReverbImpulseResponse,
  hashSeed,
  midiToFreq,
  scaleNotes,
} from './dsp';
import {
  MUSIC_STYLE_DEFS,
  type BeatGrid,
  type MusicStyleDef,
  type MusicStyleName,
} from './types';

export function clampBpmForStyle(
  style: MusicStyleName,
  bpm?: number
): number {
  const def = MUSIC_STYLE_DEFS[style];
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    return def.defaultBpm;
  }
  return Math.max(50, Math.min(190, Math.round(bpm)));
}

export function getBeatGrid(bpm: number, durationSec: number = 60): BeatGrid {
  const safeBpm = Math.max(40, Math.min(200, Number.isFinite(bpm) ? bpm : 116));
  const beatSec = 60 / safeBpm;
  const barSec = beatSec * 4;
  const totalSec = Math.max(0.5, durationSec);

  const beats: number[] = [];
  for (let t = 0; t <= totalSec + 1e-4; t += beatSec) {
    beats.push(Number(t.toFixed(4)));
  }

  const bars: number[] = [];
  for (let t = 0; t <= totalSec + 1e-4; t += barSec) {
    bars.push(Number(t.toFixed(4)));
  }

  return {
    bpm: safeBpm,
    beatSec,
    barSec,
    beats,
    bars,
  };
}

// ---------- Drum kit synthesizers ----------

function triggerKick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  gainAmount: number,
  punchFreq: number = 140
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(punchFreq, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.085);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.24);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(gainAmount, time + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.001, time + 0.23);
  amp.gain.linearRampToValueAtTime(0, time + 0.25);

  osc.connect(amp);
  amp.connect(dest);
  osc.start(time);
  osc.stop(time + 0.27);
}

function triggerSnare(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  gainAmount: number,
  noiseBuf: AudioBuffer,
  dusty: boolean
): void {
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(195, time);
  body.frequency.exponentialRampToValueAtTime(105, time + 0.09);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, time);
  bodyGain.gain.linearRampToValueAtTime(gainAmount * 0.55, time + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
  bodyGain.gain.linearRampToValueAtTime(0, time + 0.12);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = dusty ? 'lowpass' : 'bandpass';
  filter.frequency.setValueAtTime(dusty ? 2600 : 1900, time);
  if (!dusty) {
    filter.Q.setValueAtTime(0.9, time);
  }

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, time);
  noiseGain.gain.linearRampToValueAtTime(gainAmount * 0.65, time + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
  noiseGain.gain.linearRampToValueAtTime(0, time + 0.18);

  body.connect(bodyGain);
  bodyGain.connect(dest);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(dest);

  body.start(time);
  body.stop(time + 0.14);
  noise.start(time);
  noise.stop(time + 0.19);
}

function triggerClap(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  gainAmount: number,
  noiseBuf: AudioBuffer
): void {
  const microOffsets = [0, 0.011, 0.022];
  for (let i = 0; i < microOffsets.length; i++) {
    const t = time + microOffsets[i];
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1550, t);
    bp.Q.setValueAtTime(1.4, t);

    const isTail = i === microOffsets.length - 1;
    const dur = isTail ? 0.15 : 0.035;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(
      gainAmount * (isTail ? 0.52 : 0.36),
      t + 0.002
    );
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur - 0.005);
    amp.gain.linearRampToValueAtTime(0, t + dur);

    src.connect(bp);
    bp.connect(amp);
    amp.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}

function triggerHat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  gainAmount: number,
  noiseBuf: AudioBuffer,
  open: boolean,
  cutoffHz: number = 6800
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(cutoffHz, time);

  const dur = open ? 0.19 : 0.048;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(gainAmount, time + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.001, time + dur - 0.005);
  amp.gain.linearRampToValueAtTime(0, time + dur);

  src.connect(hp);
  hp.connect(amp);
  amp.connect(dest);
  src.start(time);
  src.stop(time + dur + 0.01);
}

// ---------- Melodic voice synthesizers ----------

function triggerBassNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  durSec: number,
  freq: number,
  gainAmount: number,
  style: MusicStyleName
): void {
  const osc = ctx.createOscillator();
  osc.type =
    style === 'tech-pulse' || style === 'upbeat-pop' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(freq, time);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq, time);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.setValueAtTime(style === 'tech-pulse' ? 3.2 : 1.4, time);
  lp.frequency.setValueAtTime(style === 'lofi' ? 320 : 620, time);
  lp.frequency.exponentialRampToValueAtTime(220, time + Math.min(durSec, 0.35));

  const amp = ctx.createGain();
  const safeDur = Math.max(0.08, durSec);
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(gainAmount, time + 0.01);
  amp.gain.exponentialRampToValueAtTime(gainAmount * 0.48, time + safeDur * 0.5);
  amp.gain.linearRampToValueAtTime(0, time + safeDur);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.55, time);

  osc.connect(lp);
  lp.connect(amp);
  sub.connect(subGain);
  subGain.connect(amp);
  amp.connect(dest);

  osc.start(time);
  osc.stop(time + safeDur + 0.02);
  sub.start(time);
  sub.stop(time + safeDur + 0.02);
}

function triggerPadChord(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  durSec: number,
  freqs: readonly number[],
  gainAmount: number,
  warmCutoffHz: number
): void {
  const safeDur = Math.max(0.4, durSec);
  const perVoice = gainAmount / Math.max(1, freqs.length);

  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.setValueAtTime(f, time);
    oscA.detune.setValueAtTime(-6, time);

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(f, time);
    oscB.detune.setValueAtTime(6, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(warmCutoffHz, time);

    const amp = ctx.createGain();
    const atk = Math.min(0.45, safeDur * 0.25);
    const rel = Math.min(0.45, safeDur * 0.28);
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(perVoice, time + atk);
    amp.gain.setValueAtTime(perVoice * 0.88, Math.max(time + atk, time + safeDur - rel));
    amp.gain.linearRampToValueAtTime(0, time + safeDur);

    oscA.connect(lp);
    oscB.connect(lp);
    lp.connect(amp);
    amp.connect(dest);

    oscA.start(time);
    oscA.stop(time + safeDur + 0.03);
    oscB.start(time);
    oscB.stop(time + safeDur + 0.03);
  }
}

/**
 * Simple FM/Additive pluck voice for keys, marimba, arpeggio, or bell melodies.
 */
function triggerKeysVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  durSec: number,
  freq: number,
  gainAmount: number,
  style: MusicStyleName
): void {
  const safeDur = Math.max(0.08, durSec);
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();

  const ratio =
    style === 'playful' ? 4 : style === 'ambient' ? 3 : style === 'lofi' ? 2 : 2;
  const modIndex =
    style === 'tech-pulse'
      ? freq * 1.4
      : style === 'playful'
        ? freq * 1.1
        : style === 'lofi'
          ? freq * 0.45
          : freq * 0.8;

  carrier.type = style === 'corporate' ? 'triangle' : 'sine';
  carrier.frequency.setValueAtTime(freq, time);
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * ratio, time);

  modGain.gain.setValueAtTime(modIndex, time);
  modGain.gain.exponentialRampToValueAtTime(
    Math.max(1, modIndex * 0.08),
    time + Math.min(0.18, safeDur * 0.6)
  );

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(
    style === 'lofi' ? 1600 : style === 'ambient' ? 2600 : 4200,
    time
  );

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(gainAmount, time + 0.006);
  amp.gain.exponentialRampToValueAtTime(
    Math.max(0.0005, gainAmount * 0.08),
    time + safeDur * 0.85
  );
  amp.gain.linearRampToValueAtTime(0, time + safeDur);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(lp);
  lp.connect(amp);
  amp.connect(dest);

  mod.start(time);
  mod.stop(time + safeDur + 0.02);
  carrier.start(time);
  carrier.stop(time + safeDur + 0.02);
}

// ---------- Chord helpers ----------

function buildChordTriad(
  scale: readonly number[],
  degree: number
): number[] {
  const len = scale.length;
  const pick = (offset: number) => {
    const idx = degree + offset;
    const octaveShift = Math.floor(idx / len) * 12;
    const modIdx = ((idx % len) + len) % len;
    return scale[modIdx] + octaveShift;
  };
  return [pick(0), pick(2), pick(4), pick(6)];
}

function getSectionEnvelope(
  barIndex: number,
  totalBars: number
): { phase: 'intro' | 'groove' | 'build' | 'outro'; drumScale: number; densityScale: number } {
  if (totalBars <= 2) {
    return { phase: 'groove', drumScale: 0.9, densityScale: 0.9 };
  }
  if (barIndex === 0) {
    return { phase: 'intro', drumScale: 0.35, densityScale: 0.55 };
  }
  if (barIndex === totalBars - 1) {
    return { phase: 'outro', drumScale: 0.45, densityScale: 0.65 };
  }
  if (totalBars >= 6 && barIndex === totalBars - 2) {
    return { phase: 'build', drumScale: 1.05, densityScale: 1.15 };
  }
  return { phase: 'groove', drumScale: 1.0, densityScale: 1.0 };
}

export interface ScheduleMusicParams {
  style: MusicStyleName;
  bpm?: number;
  seed?: number;
  durationSec: number;
  volume?: number;
}

/**
 * Schedules a complete deterministic musical arrangement into an OfflineAudioContext
 * (or AudioContext) connected to `dest`, fading out cleanly in the last 1.2s.
 */
export function scheduleGenerativeMusic(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: ScheduleMusicParams
): { bpm: number; seed: number; styleDef: MusicStyleDef } {
  const styleDef = MUSIC_STYLE_DEFS[params.style] ?? MUSIC_STYLE_DEFS.corporate;
  const bpm = clampBpmForStyle(params.style, params.bpm);
  const seed = hashSeed(params.seed ?? 101);
  const rand = createPrng(seed);
  const dur = Math.max(0.5, params.durationSec);
  const vol = Math.max(0, Math.min(1, params.volume ?? 0.35));

  if (vol <= 0.0001) {
    return { bpm, seed, styleDef };
  }

  // Dedicated bus for this music arrangement with overall intro/outro fade
  const musicOut = ctx.createGain();
  const dryBus = ctx.createGain();
  const reverbSend = ctx.createGain();
  const drumBus = ctx.createGain();
  const melodicBus = ctx.createGain();

  const convolver = ctx.createConvolver();
  convolver.buffer = createReverbImpulseResponse(
    ctx,
    styleDef.reverbDecaySec,
    2.1,
    seed,
    params.style === 'lofi' ? 2600 : 4800
  );

  // Fade in first 0.25s, always fade out in last 1.2s (or half duration if shorter)
  const fadeInSec = Math.min(0.25, dur * 0.2);
  const fadeOutSec = Math.min(1.2, dur * 0.45);
  const fadeOutStart = Math.max(fadeInSec, dur - fadeOutSec);

  musicOut.gain.setValueAtTime(0, 0);
  musicOut.gain.linearRampToValueAtTime(vol, fadeInSec);
  musicOut.gain.setValueAtTime(vol, fadeOutStart);
  musicOut.gain.linearRampToValueAtTime(0, dur);

  dryBus.gain.setValueAtTime(1 - styleDef.reverbWet * 0.4, 0);
  reverbSend.gain.setValueAtTime(styleDef.reverbWet, 0);
  drumBus.gain.setValueAtTime(0.85, 0);
  melodicBus.gain.setValueAtTime(0.9, 0);

  drumBus.connect(dryBus);
  drumBus.connect(reverbSend);
  melodicBus.connect(dryBus);
  melodicBus.connect(reverbSend);
  reverbSend.connect(convolver);
  convolver.connect(musicOut);
  dryBus.connect(musicOut);
  musicOut.connect(dest);

  // Pick deterministic key & progression from seed
  const rootMidi =
    styleDef.rootMidiPool[Math.floor(rand() * styleDef.rootMidiPool.length)] ??
    styleDef.rootMidiPool[0];
  const scale = scaleNotes(rootMidi, styleDef.scaleIntervals, 3);
  const progression =
    styleDef.progressions[Math.floor(rand() * styleDef.progressions.length)] ??
    styleDef.progressions[0];

  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const stepSec = beatSec / 4; // 16th-note grid
  const totalBars = Math.max(1, Math.ceil(dur / barSec));

  const sharedNoiseBuf = createDeterministicNoiseBuffer(ctx, 0.3, seed + 17, 1, 'white');
  const swingAmt = styleDef.swing;

  const arpPatternBase = [0, 2, 1, 3, 2, 0, 3, 1];
  const motifShift = Math.floor(rand() * 4);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barSec;
    if (barStart >= dur - 0.15) break;

    const section = getSectionEnvelope(bar, totalBars);
    const degree = progression[bar % progression.length] ?? 0;
    const chordMidis = buildChordTriad(scale, degree);
    const chordFreqs = chordMidis.map(midiToFreq);
    const bassMidi = chordMidis[0] - 12;
    const bassFreq = midiToFreq(bassMidi);

    const remainingBarDur = Math.min(barSec, dur - barStart);
    if (remainingBarDur > 0.25) {
      const padCutoff =
        params.style === 'lofi'
          ? 1250
          : params.style === 'ambient'
            ? 2400
            : params.style === 'cinematic'
              ? 1850
              : 2200;
      const padLevel =
        params.style === 'ambient'
          ? 0.42
          : params.style === 'cinematic'
            ? 0.36
            : params.style === 'lofi'
              ? 0.28
              : 0.22;
      triggerPadChord(
        ctx,
        melodicBus,
        barStart,
        remainingBarDur,
        chordFreqs.slice(0, 3),
        padLevel * (section.phase === 'intro' ? 0.72 : 1),
        padCutoff
      );
    }

    for (let step = 0; step < 16; step++) {
      // Apply swing on off-beat 16ths/8ths
      const isOffBeat = step % 2 === 1;
      const swingOffset = isOffBeat ? swingAmt * stepSec * 0.48 : 0;
      const t = barStart + step * stepSec + swingOffset;
      if (t >= dur - 0.12) break;

      // ---- Drums ----
      const dScale = styleDef.drumIntensity * section.drumScale;
      if (dScale > 0.08) {
        const beatInBar = step % 4 === 0;
        const isBackbeat = step === 4 || step === 12;

        // Kick patterns per style
        let playKick = false;
        if (params.style === 'tech-pulse' || params.style === 'upbeat-pop') {
          playKick = beatInBar || (section.phase === 'build' && step === 14);
        } else if (params.style === 'cinematic') {
          playKick = step === 0 || (section.phase === 'build' && (step === 6 || step === 12));
        } else if (params.style === 'ambient') {
          playKick = step === 0 && section.phase !== 'intro';
        } else {
          // lofi / corporate / playful syncopated kick
          playKick = step === 0 || step === 10 || (step === 6 && rand() < 0.45);
        }

        if (playKick && section.phase !== 'intro') {
          triggerKick(
            ctx,
            drumBus,
            t,
            0.46 * Math.min(1, dScale),
            params.style === 'lofi' ? 115 : 145
          );
        }

        // Snare / Clap
        if (isBackbeat && section.phase !== 'intro' && params.style !== 'ambient') {
          if (params.style === 'upbeat-pop' || params.style === 'corporate') {
            triggerClap(ctx, drumBus, t, 0.28 * dScale, sharedNoiseBuf);
          } else {
            triggerSnare(
              ctx,
              drumBus,
              t,
              0.3 * dScale,
              sharedNoiseBuf,
              params.style === 'lofi'
            );
          }
        }

        // Extra snare fill in build bar
        if (section.phase === 'build' && (step === 14 || step === 15)) {
          triggerSnare(ctx, drumBus, t, 0.24 * dScale, sharedNoiseBuf, false);
        }

        // Hi-hats
        let playHat = false;
        let openHat = false;
        if (params.style === 'tech-pulse') {
          playHat = step % 2 === 0 || step % 4 === 3;
          openHat = step === 14;
        } else if (params.style === 'upbeat-pop' || params.style === 'playful') {
          playHat = step % 2 === 0;
          openHat = step === 10;
        } else if (params.style === 'lofi') {
          playHat = step % 2 === 0 && rand() < 0.82;
        } else if (params.style === 'corporate') {
          playHat = step % 2 === 0;
        }

        if (playHat && params.style !== 'ambient') {
          triggerHat(
            ctx,
            drumBus,
            t,
            (openHat ? 0.14 : 0.1) * dScale,
            sharedNoiseBuf,
            openHat,
            params.style === 'lofi' ? 4800 : 7200
          );
        }
      }

      // ---- Bassline ----
      let playBass = false;
      let bassDur = stepSec * 3.5;
      if (params.style === 'tech-pulse') {
        playBass = step % 2 === 0;
        bassDur = stepSec * 1.6;
      } else if (params.style === 'upbeat-pop' || params.style === 'playful') {
        playBass = step === 0 || step === 3 || step === 6 || step === 8 || step === 12;
        bassDur = stepSec * 2.4;
      } else {
        playBass = step === 0 || step === 8;
        bassDur = beatSec * 1.75;
      }

      if (playBass && section.phase !== 'intro') {
        const fifthBoost = step === 12 ? 1.498 : 1;
        triggerBassNote(
          ctx,
          melodicBus,
          t,
          Math.min(bassDur, dur - t - 0.02),
          bassFreq * fifthBoost,
          0.34,
          params.style
        );
      }

      // ---- Keys / Arp / Shimmer Chimes ----
      let playKey = false;
      let keyDur = stepSec * 3;
      if (params.style === 'tech-pulse') {
        playKey = step % 2 === 0;
        keyDur = stepSec * 1.6;
      } else if (params.style === 'corporate' || params.style === 'playful') {
        playKey = step % 4 === 0 || step === 6 || step === 14;
        keyDur = stepSec * 2.6;
      } else if (params.style === 'lofi') {
        playKey = step === 0 || step === 6 || (step === 10 && rand() < 0.6);
        keyDur = stepSec * 4.5;
      } else if (params.style === 'ambient') {
        playKey = step === 0 || (step === 8 && rand() < 0.65);
        keyDur = beatSec * 2.2;
      } else if (params.style === 'cinematic') {
        playKey = step % 4 === 0;
        keyDur = beatSec * 1.4;
      } else if (params.style === 'upbeat-pop') {
        playKey = step === 0 || step === 3 || step === 6 || step === 8 || step === 11;
        keyDur = stepSec * 2.4;
      }

      if (playKey) {
        const idx =
          (arpPatternBase[(step + motifShift) % arpPatternBase.length] ?? 0) %
          chordMidis.length;
        const keyMidi = chordMidis[idx] + (params.style === 'ambient' ? 12 : 0);
        const keyGain =
          params.style === 'ambient'
            ? 0.14
            : section.phase === 'intro'
              ? 0.16
              : 0.22;
        triggerKeysVoice(
          ctx,
          melodicBus,
          t,
          Math.min(keyDur, dur - t - 0.02),
          midiToFreq(keyMidi),
          keyGain * section.densityScale,
          params.style
        );
      }
    }
  }

  // Final resolve hit / gentle chime on last beat if duration >= 2.5s
  if (dur >= 2.5) {
    const resolveTime = Math.max(0.2, dur - 1.35);
    const resolveChord = buildChordTriad(scale, progression[0] ?? 0);
    for (let i = 0; i < 3; i++) {
      triggerKeysVoice(
        ctx,
        melodicBus,
        resolveTime + i * 0.03,
        Math.min(1.2, dur - resolveTime - i * 0.03),
        midiToFreq(resolveChord[i] + 12),
        0.16,
        params.style === 'ambient' || params.style === 'cinematic'
          ? 'ambient'
          : 'corporate'
      );
    }
  }

  return { bpm, seed, styleDef };
}
