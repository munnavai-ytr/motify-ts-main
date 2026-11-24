/**
 * Deterministic DSP utilities, PRNG, impulse reverb builder, limiter curve,
 * uploaded buffer conditioning, and 16-bit PCM WAV encoding.
 */

export function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return (Math.abs(Math.floor(input)) || 1) >>> 0;
  }
  const str = String(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

export function createPrng(seed: number | string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function scaleNotes(
  rootMidi: number,
  intervals: readonly number[],
  octaves: number = 2
): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const iv of intervals) {
      out.push(rootMidi + oct * 12 + iv);
    }
  }
  return out;
}

export function createDeterministicNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  seed: number | string,
  channels: number = 1,
  color: 'white' | 'pink' = 'white'
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.max(1, Math.ceil(durationSec * sampleRate));
  const buf = ctx.createBuffer(channels, frameCount, sampleRate);
  const rand = createPrng(seed);

  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch);
    if (color === 'white') {
      for (let i = 0; i < frameCount; i++) {
        data[i] = rand() * 2 - 1;
      }
    } else {
      // Paul Kellet's refined pink-noise filter approximation
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < frameCount; i++) {
        const white = rand() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = Math.max(-1, Math.min(1, pink * 0.11));
      }
    }
  }
  return buf;
}

export function createReverbImpulseResponse(
  ctx: BaseAudioContext,
  durationSec: number,
  decay: number,
  seed: number | string,
  dampingCutoffHz: number = 4800
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(256, Math.ceil(durationSec * sampleRate));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const rand = createPrng(hashSeed(`${seed}:reverb`));

  // Gentle 1-pole lowpass damping coef
  const rc = 1 / (2 * Math.PI * Math.max(400, dampingCutoffHz));
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Short 4ms pre-fade-in avoids harsh click in convolver onset
      const onset = Math.min(1, i / Math.max(1, sampleRate * 0.004));
      const env = onset * Math.pow(1 - t, Math.max(0.5, decay));
      const raw = (rand() * 2 - 1) * env;
      lp = lp + alpha * (raw - lp);
      data[i] = lp;
    }
  }
  return impulse;
}

/**
 * Generates a symmetric smooth soft-limiter waveshaper curve peaking around -1 dBFS (~0.891).
 */
export function createSoftLimiterCurve(
  ceilingLinear: number = 0.891,
  samples: number = 2048
): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
  const curve = new Float32Array(buffer);
  const knee = ceilingLinear * 0.72;
  const head = ceilingLinear - knee;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const absX = Math.abs(x);
    if (absX <= knee) {
      curve[i] = x;
    } else {
      const over = absX - knee;
      const compressed = knee + head * Math.tanh(over / Math.max(1e-4, head));
      curve[i] = Math.sign(x) * Math.min(ceilingLinear, compressed);
    }
  }
  return curve;
}

/**
 * Conditions a decoded uploaded AudioBuffer:
 * - trims from `startAtSec`
 * - caps total duration at `maxDurationSec` (5 minutes)
 * - loops seamlessly if `loop === true` to `targetDurationSec`
 * - downmixes to mono when resulting audio exceeds `monoThresholdSec` (3 minutes)
 */
export function conditionUploadedAudioBuffer(
  ctx: BaseAudioContext,
  decoded: AudioBuffer,
  options: {
    startAtSec: number;
    targetDurationSec: number;
    loop: boolean;
    monoThresholdSec: number;
    maxDurationSec: number;
  }
): AudioBuffer {
  const sampleRate = decoded.sampleRate;
  const startSample = Math.max(
    0,
    Math.min(
      decoded.length - 1,
      Math.floor(Math.max(0, options.startAtSec) * sampleRate)
    )
  );
  const availableSamples = Math.max(1, decoded.length - startSample);
  const effectiveDurationSec = Math.min(
    options.maxDurationSec,
    Math.max(0.1, options.targetDurationSec)
  );
  const desiredSamples = Math.max(1, Math.ceil(effectiveDurationSec * sampleRate));
  const finalSamples = options.loop
    ? desiredSamples
    : Math.min(desiredSamples, availableSamples);

  const isLongMono = effectiveDurationSec > options.monoThresholdSec;
  const outChannels = isLongMono ? 1 : Math.min(2, Math.max(1, decoded.numberOfChannels));
  const out = ctx.createBuffer(outChannels, finalSamples, sampleRate);

  const srcL = decoded.getChannelData(0);
  const srcR = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : srcL;

  // Crossfade length for looped wraps (15ms) so loops never click
  const loopCrossfadeSamples = Math.min(
    Math.floor(sampleRate * 0.015),
    Math.floor(availableSamples / 4)
  );

  if (isLongMono) {
    const dst = out.getChannelData(0);
    for (let i = 0; i < finalSamples; i++) {
      const offset = options.loop ? i % availableSamples : i;
      const srcIdx = startSample + offset;
      let sample = 0.5 * (srcL[srcIdx] + srcR[srcIdx]);
      if (
        options.loop &&
        loopCrossfadeSamples > 0 &&
        i >= availableSamples &&
        offset < loopCrossfadeSamples
      ) {
        const tailIdx =
          startSample + availableSamples - loopCrossfadeSamples + offset;
        const tailSample = 0.5 * (srcL[tailIdx] + srcR[tailIdx]);
        const mix = offset / loopCrossfadeSamples;
        sample = tailSample * (1 - mix) + sample * mix;
      }
      dst[i] = sample;
    }
  } else {
    for (let ch = 0; ch < outChannels; ch++) {
      const dst = out.getChannelData(ch);
      const src = decoded.getChannelData(Math.min(ch, decoded.numberOfChannels - 1));
      for (let i = 0; i < finalSamples; i++) {
        const offset = options.loop ? i % availableSamples : i;
        let sample = src[startSample + offset];
        if (
          options.loop &&
          loopCrossfadeSamples > 0 &&
          i >= availableSamples &&
          offset < loopCrossfadeSamples
        ) {
          const tailIdx =
            startSample + availableSamples - loopCrossfadeSamples + offset;
          const tailSample = src[tailIdx];
          const mix = offset / loopCrossfadeSamples;
          sample = tailSample * (1 - mix) + sample * mix;
        }
        dst[i] = sample;
      }
    }
  }

  return out;
}

/**
 * Encodes a stereo (or mono, interleaved to stereo) AudioBuffer as 16-bit PCM WAV.
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 2;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const totalSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // IEEE PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? Math.round(l * 0x8000) : Math.round(l * 0x7fff), true);
    view.setInt16(
      offset + 2,
      r < 0 ? Math.round(r * 0x8000) : Math.round(r * 0x7fff),
      true
    );
    offset += 4;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
