import {
  createDeterministicNoiseBuffer,
  createPrng,
  hashSeed,
} from './dsp';
import { SFX_PRESET_DEFS, type SfxName, type SfxParams } from './types';

function clampTime(ctx: BaseAudioContext, timeSec: number): number {
  return Math.max(0.002, Math.max(ctx.currentTime, timeSec));
}

function getSfxSeed(name: SfxName, timeSec: number, params?: SfxParams): number {
  if (typeof params?.seed === 'number' && Number.isFinite(params.seed)) {
    return hashSeed(params.seed);
  }
  return hashSeed(`${name}:${Math.round(timeSec * 1000)}`);
}

/**
 * Filtered-noise sweep; supports direction ('up' | 'down') and short/long duration.
 */
export function synthWhoosh(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.14, Math.min(1.2, params.durationSec ?? 0.34));
  const dir = params.direction ?? 'up';
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.5, Math.min(2, params.pitchScale ?? 1));
  const seed = getSfxSeed('whoosh', t0, params);

  const noiseBuf = createDeterministicNoiseBuffer(ctx, dur + 0.05, seed, 1, 'pink');
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.setValueAtTime(2.4, t0);
  const startFreq = (dir === 'up' ? 240 : 2800) * pitch;
  const midFreq = (dir === 'up' ? 2600 : 1200) * pitch;
  const endFreq = (dir === 'up' ? 620 : 220) * pitch;
  bandpass.frequency.setValueAtTime(startFreq, t0);
  bandpass.frequency.exponentialRampToValueAtTime(midFreq, t0 + dur * 0.48);
  bandpass.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);

  // Subtle air sine body
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(dir === 'up' ? 110 * pitch : 320 * pitch, t0);
  body.frequency.exponentialRampToValueAtTime(
    dir === 'up' ? 310 * pitch : 95 * pitch,
    t0 + dur
  );

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, t0);
  bodyGain.gain.linearRampToValueAtTime(0.14 * intensity, t0 + dur * 0.35);
  bodyGain.gain.linearRampToValueAtTime(0, t0 + dur);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.68 * intensity, t0 + dur * 0.42);
  amp.gain.linearRampToValueAtTime(0.0001, t0 + dur - 0.008);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);

  src.connect(bandpass);
  bandpass.connect(amp);
  body.connect(bodyGain);
  bodyGain.connect(amp);
  amp.connect(dest);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
  body.start(t0);
  body.stop(t0 + dur + 0.02);

  return dur;
}

/**
 * Warm low-cut airy swoosh for wipe transitions.
 */
export function synthSoftSwoosh(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.16, Math.min(1.0, params.durationSec ?? 0.36));
  const dir = params.direction ?? 'up';
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const seed = getSfxSeed('soft-swoosh', t0, params);

  const src = ctx.createBufferSource();
  src.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.04, seed, 1, 'pink');

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(340, t0);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.setValueAtTime(1.1, t0);
  lp.frequency.setValueAtTime(dir === 'up' ? 750 : 2400, t0);
  lp.frequency.exponentialRampToValueAtTime(dir === 'up' ? 2400 : 1200, t0 + dur * 0.5);
  lp.frequency.exponentialRampToValueAtTime(650, t0 + dur);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.42 * intensity, t0 + dur * 0.38);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(amp);
  amp.connect(dest);

  src.start(t0);
  src.stop(t0 + dur + 0.02);

  return dur;
}

/**
 * Crisp pitched bubble pop.
 */
export function synthPop(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.08, Math.min(0.32, params.durationSec ?? 0.14));
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.5, Math.min(2, params.pitchScale ?? 1));

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(240 * pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(760 * pitch, t0 + 0.032);
  osc.frequency.exponentialRampToValueAtTime(380 * pitch, t0 + dur);

  const harmonic = ctx.createOscillator();
  harmonic.type = 'triangle';
  harmonic.frequency.setValueAtTime(520 * pitch, t0);
  harmonic.frequency.exponentialRampToValueAtTime(1180 * pitch, t0 + 0.035);

  const harmGain = ctx.createGain();
  harmGain.gain.setValueAtTime(0, t0);
  harmGain.gain.linearRampToValueAtTime(0.18 * intensity, t0 + 0.004);
  harmGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.62 * intensity, t0 + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0008, t0 + dur - 0.006);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(amp);
  harmonic.connect(harmGain);
  harmGain.connect(amp);
  amp.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
  harmonic.start(t0);
  harmonic.stop(t0 + 0.07);

  return dur;
}

/**
 * Tight UI click (short filtered noise impulse + woody transient).
 */
export function synthClick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = 0.06;
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.8, params.pitchScale ?? 1));
  const seed = getSfxSeed('click', t0, params);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1650 * pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(420 * pitch, t0 + 0.025);

  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, 0.05, seed, 1, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2900 * pitch, t0);
  bp.Q.setValueAtTime(1.8, t0);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0, t0);
  nGain.gain.linearRampToValueAtTime(0.26 * intensity, t0 + 0.002);
  nGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.025);
  nGain.gain.linearRampToValueAtTime(0, t0 + 0.032);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.55 * intensity, t0 + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.048);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(amp);
  noise.connect(bp);
  bp.connect(nGain);
  nGain.connect(amp);
  amp.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
  noise.start(t0);
  noise.stop(t0 + 0.04);

  return dur;
}

/**
 * Clean mechanical tick for counters and typing animations.
 */
export function synthTick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = 0.045;
  const intensity = Math.max(0.15, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.8, params.pitchScale ?? 1));
  const seed = getSfxSeed('tick', t0, params);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2400 * pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(980 * pitch, t0 + 0.018);

  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, 0.03, seed, 1, 'white');
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(3400 * pitch, t0);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0, t0);
  nGain.gain.linearRampToValueAtTime(0.16 * intensity, t0 + 0.002);
  nGain.gain.linearRampToValueAtTime(0, t0 + 0.02);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(0.4 * intensity, t0 + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.036);
  amp.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(amp);
  noise.connect(hp);
  hp.connect(nGain);
  nGain.connect(amp);
  amp.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
  noise.start(t0);
  noise.stop(t0 + 0.025);

  return dur;
}

/**
 * Rising noise sweep + dual oscillator upward tension swell.
 */
export function synthRiser(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.45, Math.min(2.6, params.durationSec ?? 1.15));
  const intensity = Math.max(0.2, Math.min(1.3, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));
  const seed = getSfxSeed('riser', t0, params);

  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.05, seed, 1, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(3.2, t0);
  bp.frequency.setValueAtTime(240 * pitch, t0);
  bp.frequency.exponentialRampToValueAtTime(4200 * pitch, t0 + dur * 0.94);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(110 * pitch, t0);
  osc1.frequency.exponentialRampToValueAtTime(440 * pitch, t0 + dur * 0.95);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(165 * pitch, t0);
  osc2.frequency.exponentialRampToValueAtTime(660 * pitch, t0 + dur * 0.95);

  const oscLp = ctx.createBiquadFilter();
  oscLp.type = 'lowpass';
  oscLp.frequency.setValueAtTime(400 * pitch, t0);
  oscLp.frequency.exponentialRampToValueAtTime(3600 * pitch, t0 + dur * 0.95);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, t0);
  oscGain.gain.linearRampToValueAtTime(0.06 * intensity, t0 + dur * 0.25);
  oscGain.gain.exponentialRampToValueAtTime(0.26 * intensity, t0 + dur * 0.94);
  oscGain.gain.linearRampToValueAtTime(0, t0 + dur);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, t0);
  noiseGain.gain.linearRampToValueAtTime(0.08 * intensity, t0 + dur * 0.2);
  noiseGain.gain.exponentialRampToValueAtTime(0.45 * intensity, t0 + dur * 0.94);
  noiseGain.gain.linearRampToValueAtTime(0, t0 + dur);

  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(dest);

  osc1.connect(oscLp);
  osc2.connect(oscLp);
  oscLp.connect(oscGain);
  oscGain.connect(dest);

  noise.start(t0);
  noise.stop(t0 + dur + 0.02);
  osc1.start(t0);
  osc1.stop(t0 + dur + 0.02);
  osc2.start(t0);
  osc2.stop(t0 + dur + 0.02);

  return dur;
}

/**
 * Low sine sub drop + filtered noise transient burst for heavy hits/slams.
 */
export function synthImpact(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.25, Math.min(1.0, params.durationSec ?? 0.45));
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));
  const seed = getSfxSeed('impact', t0, params);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(150 * pitch, t0);
  sub.frequency.exponentialRampToValueAtTime(42 * pitch, t0 + 0.16);
  sub.frequency.exponentialRampToValueAtTime(30 * pitch, t0 + dur);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, t0);
  subGain.gain.linearRampToValueAtTime(0.75 * intensity, t0 + 0.004);
  subGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur - 0.015);
  subGain.gain.linearRampToValueAtTime(0, t0 + dur);

  const burst = ctx.createBufferSource();
  burst.buffer = createDeterministicNoiseBuffer(ctx, 0.22, seed, 1, 'pink');

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400 * pitch, t0);
  lp.frequency.exponentialRampToValueAtTime(220, t0 + 0.18);

  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0, t0);
  burstGain.gain.linearRampToValueAtTime(0.55 * intensity, t0 + 0.003);
  burstGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.17);
  burstGain.gain.linearRampToValueAtTime(0, t0 + 0.19);

  sub.connect(subGain);
  subGain.connect(dest);
  burst.connect(lp);
  lp.connect(burstGain);
  burstGain.connect(dest);

  sub.start(t0);
  sub.stop(t0 + dur + 0.02);
  burst.start(t0);
  burst.stop(t0 + 0.21);

  return dur;
}

/**
 * Stacked shimmering bell partials with staggered onset.
 */
export function synthSparkle(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.35, Math.min(1.2, params.durationSec ?? 0.65));
  const intensity = Math.max(0.2, Math.min(1.3, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));
  const seed = getSfxSeed('sparkle', t0, params);
  const rand = createPrng(seed);

  const baseFreqs = [1318.5, 1760, 2093, 2637, 3136]; // E6, A6, C7, E7, G7
  for (let i = 0; i < baseFreqs.length; i++) {
    const start = t0 + i * 0.042 + rand() * 0.012;
    const partialDur = Math.max(0.22, dur - i * 0.04);
    const freq = baseFreqs[i] * pitch;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, start);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.004, start);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, start);
    g1.gain.linearRampToValueAtTime(0.16 * intensity, start + 0.005);
    g1.gain.exponentialRampToValueAtTime(0.0006, start + partialDur - 0.01);
    g1.gain.linearRampToValueAtTime(0, start + partialDur);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, start);
    g2.gain.linearRampToValueAtTime(0.06 * intensity, start + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0005, start + partialDur * 0.55);
    g2.gain.linearRampToValueAtTime(0, start + partialDur * 0.6);

    osc1.connect(g1);
    g1.connect(dest);
    osc2.connect(g2);
    g2.connect(dest);

    osc1.start(start);
    osc1.stop(start + partialDur + 0.02);
    osc2.start(start);
    osc2.stop(start + partialDur * 0.65);
  }

  return dur;
}

/**
 * Warm resonant major-add9 bell chord for final CTA resolve.
 */
export function synthChime(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.45, Math.min(1.6, params.durationSec ?? 0.85));
  const intensity = Math.max(0.2, Math.min(1.3, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));

  // C5, G5, B5, D6 gentle staggered open chord
  const notes = [523.25, 783.99, 987.77, 1174.66];
  for (let i = 0; i < notes.length; i++) {
    const start = t0 + i * 0.022;
    const noteDur = dur - i * 0.02;
    const f = notes[i] * pitch;

    const fund = ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(f, start);

    const over = ctx.createOscillator();
    over.type = 'triangle';
    over.frequency.setValueAtTime(f * 2, start);

    const gFund = ctx.createGain();
    gFund.gain.setValueAtTime(0, start);
    gFund.gain.linearRampToValueAtTime(0.18 * intensity, start + 0.006);
    gFund.gain.exponentialRampToValueAtTime(0.0006, start + noteDur - 0.015);
    gFund.gain.linearRampToValueAtTime(0, start + noteDur);

    const gOver = ctx.createGain();
    gOver.gain.setValueAtTime(0, start);
    gOver.gain.linearRampToValueAtTime(0.05 * intensity, start + 0.004);
    gOver.gain.exponentialRampToValueAtTime(0.0005, start + noteDur * 0.42);
    gOver.gain.linearRampToValueAtTime(0, start + noteDur * 0.45);

    fund.connect(gFund);
    gFund.connect(dest);
    over.connect(gOver);
    gOver.connect(dest);

    fund.start(start);
    fund.stop(start + noteDur + 0.02);
    over.start(start);
    over.stop(start + noteDur * 0.5);
  }

  return dur;
}

/**
 * Bright focused single bell ding.
 */
export function synthDing(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.25, Math.min(1.0, params.durationSec ?? 0.52));
  const intensity = Math.max(0.2, Math.min(1.3, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));
  const f = 1046.5 * pitch; // C6

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, t0);

  const partial = ctx.createOscillator();
  partial.type = 'sine';
  partial.frequency.setValueAtTime(f * 2.756, t0); // classic bell inharmonic ratio

  const gMain = ctx.createGain();
  gMain.gain.setValueAtTime(0, t0);
  gMain.gain.linearRampToValueAtTime(0.36 * intensity, t0 + 0.004);
  gMain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur - 0.01);
  gMain.gain.linearRampToValueAtTime(0, t0 + dur);

  const gPartial = ctx.createGain();
  gPartial.gain.setValueAtTime(0, t0);
  gPartial.gain.linearRampToValueAtTime(0.11 * intensity, t0 + 0.003);
  gPartial.gain.exponentialRampToValueAtTime(0.0006, t0 + dur * 0.35);
  gPartial.gain.linearRampToValueAtTime(0, t0 + dur * 0.38);

  osc.connect(gMain);
  gMain.connect(dest);
  partial.connect(gPartial);
  gPartial.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  partial.start(t0);
  partial.stop(t0 + dur * 0.42);

  return dur;
}

/**
 * Smooth pitched tone glide + whisper breeze for slide entrances.
 */
export function synthSlide(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const dur = Math.max(0.14, Math.min(0.7, params.durationSec ?? 0.28));
  const dir = params.direction ?? 'up';
  const intensity = Math.max(0.2, Math.min(1.3, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));
  const seed = getSfxSeed('slide', t0, params);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime((dir === 'up' ? 280 : 620) * pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(
    (dir === 'up' ? 660 : 250) * pitch,
    t0 + dur * 0.85
  );

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800 * pitch, t0);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, t0);
  oscGain.gain.linearRampToValueAtTime(0.28 * intensity, t0 + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur - 0.01);
  oscGain.gain.linearRampToValueAtTime(0, t0 + dur);

  const air = ctx.createBufferSource();
  air.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.03, seed, 1, 'pink');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400 * pitch, t0);
  bp.Q.setValueAtTime(1.5, t0);

  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0, t0);
  airGain.gain.linearRampToValueAtTime(0.16 * intensity, t0 + dur * 0.35);
  airGain.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(lp);
  lp.connect(oscGain);
  oscGain.connect(dest);

  air.connect(bp);
  bp.connect(airGain);
  airGain.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  air.start(t0);
  air.stop(t0 + dur + 0.02);

  return dur;
}

/**
 * Tactile two-stage UI button press (down click + release pop).
 */
export function synthButtonPress(
  ctx: BaseAudioContext,
  dest: AudioNode,
  timeSec: number,
  params: SfxParams = {}
): number {
  const t0 = clampTime(ctx, timeSec);
  const intensity = Math.max(0.2, Math.min(1.4, params.intensity ?? 1));
  const pitch = Math.max(0.6, Math.min(1.6, params.pitchScale ?? 1));

  synthClick(ctx, dest, t0, {
    intensity: intensity * 0.85,
    pitchScale: pitch * 0.9,
    seed: getSfxSeed('button-press', t0, params),
  });
  synthPop(ctx, dest, t0 + 0.055, {
    durationSec: 0.085,
    intensity: intensity * 0.72,
    pitchScale: pitch * 1.15,
    seed: getSfxSeed('button-press', t0 + 0.055, params),
  });

  return 0.14;
}

export function scheduleSfx(
  ctx: BaseAudioContext,
  dest: AudioNode,
  name: SfxName,
  timeSec: number,
  params?: SfxParams
): number {
  switch (name) {
    case 'whoosh':
      return synthWhoosh(ctx, dest, timeSec, params);
    case 'soft-swoosh':
      return synthSoftSwoosh(ctx, dest, timeSec, params);
    case 'pop':
      return synthPop(ctx, dest, timeSec, params);
    case 'click':
      return synthClick(ctx, dest, timeSec, params);
    case 'tick':
      return synthTick(ctx, dest, timeSec, params);
    case 'riser':
      return synthRiser(ctx, dest, timeSec, params);
    case 'impact':
      return synthImpact(ctx, dest, timeSec, params);
    case 'sparkle':
      return synthSparkle(ctx, dest, timeSec, params);
    case 'chime':
      return synthChime(ctx, dest, timeSec, params);
    case 'ding':
      return synthDing(ctx, dest, timeSec, params);
    case 'slide':
      return synthSlide(ctx, dest, timeSec, params);
    case 'button-press':
      return synthButtonPress(ctx, dest, timeSec, params);
    default: {
      const def = SFX_PRESET_DEFS.pop;
      return synthPop(ctx, dest, timeSec, {
        durationSec: def.defaultDurationSec,
        ...params,
      });
    }
  }
}
