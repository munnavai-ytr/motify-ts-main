import { createDbId } from '@/lib/db';
import type { MediaKind, MediaRecord } from '@/lib/types';

export const MAX_ATTACHMENTS_PER_MESSAGE = 8;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_EXCERPT_CHARS = 40_000;

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'avif',
  'bmp',
  'svg',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json']);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function formatDurationCompact(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function classifyAttachmentFile(file: File): {
  kind: MediaKind;
  mime: string;
  limitBytes: number;
} | null {
  const mime = (file.type || '').toLowerCase();
  const ext = getExtension(file.name);

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    return {
      kind: 'image',
      mime: mime || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'),
      limitBytes: MAX_IMAGE_BYTES,
    };
  }
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return {
      kind: 'video',
      mime: mime || (ext === 'webm' ? 'video/webm' : 'video/mp4'),
      limitBytes: MAX_VIDEO_BYTES,
    };
  }
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
    return {
      kind: 'audio',
      mime: mime || (ext === 'wav' ? 'audio/wav' : 'audio/mpeg'),
      limitBytes: MAX_AUDIO_BYTES,
    };
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return {
      kind: 'pdf',
      mime: 'application/pdf',
      limitBytes: MAX_FILE_BYTES,
    };
  }
  if (
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/csv' ||
    mime === 'application/json' ||
    mime === 'text/json' ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    const resolvedMime =
      mime ||
      (ext === 'json'
        ? 'application/json'
        : ext === 'csv'
          ? 'text/csv'
          : ext === 'md'
            ? 'text/markdown'
            : 'text/plain');
    return {
      kind: 'text',
      mime: resolvedMime,
      limitBytes: MAX_FILE_BYTES,
    };
  }
  return null;
}

export async function checkStorageHeadroom(neededBytes: number): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return { ok: true };
  }
  try {
    const est = await navigator.storage.estimate();
    if (typeof est.quota === 'number' && typeof est.usage === 'number') {
      const available = est.quota - est.usage;
      const safetyFloor = 16 * 1024 * 1024;
      if (available < neededBytes + safetyFloor) {
        return {
          ok: false,
          reason: `Not enough browser storage left (${formatBytes(Math.max(0, available))} free). Clear old projects in Settings and try again.`,
        };
      }
    }
  } catch {
    return { ok: true };
  }
  return { ok: true };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image frame.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function computeFitDimensions(
  srcWidth: number,
  srcHeight: number,
  maxLongSide: number
): { width: number; height: number } {
  const safeW = Math.max(1, srcWidth);
  const safeH = Math.max(1, srcHeight);
  const longSide = Math.max(safeW, safeH);
  if (longSide <= maxLongSide) {
    return { width: safeW, height: safeH };
  }
  const scale = maxLongSide / longSide;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function drawBitmapScaled(
  source: ImageBitmap | HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number,
  maxLongSide: number
): HTMLCanvasElement {
  const { width, height } = computeFitDimensions(srcW, srcH, maxLongSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function processImageFile(
  file: File,
  mime: string,
  onProgress: (p: number) => void
): Promise<Partial<MediaRecord>> {
  onProgress(0.25);

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      onProgress(0.5);

      const thumbCanvas = drawBitmapScaled(bitmap, width, height, 256);
      const thumbBlob = await canvasToJpegBlob(thumbCanvas, 0.8);
      onProgress(0.75);

      const aiCanvas = drawBitmapScaled(bitmap, width, height, 1568);
      const aiBlob = await canvasToJpegBlob(aiCanvas, 0.85);
      onProgress(0.95);

      return { width, height, thumbBlob, aiBlob };
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode ${mime} image.`));
      el.src = url;
    });
    const width = img.naturalWidth || 1;
    const height = img.naturalHeight || 1;
    const thumbBlob = await canvasToJpegBlob(
      drawBitmapScaled(img, width, height, 256),
      0.8
    );
    const aiBlob = await canvasToJpegBlob(
      drawBitmapScaled(img, width, height, 1568),
      0.85
    );
    onProgress(0.95);
    return { width, height, thumbBlob, aiBlob };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function seekVideoToTime(
  video: HTMLVideoElement,
  timeSeconds: number
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 4000);
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', done, { once: true });
    try {
      video.currentTime = Math.max(0, timeSeconds);
    } catch {
      done();
    }
  });
}

async function processVideoFile(
  file: File,
  onProgress: (p: number) => void
): Promise<Partial<MediaRecord>> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Could not read video metadata.'));
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out reading video metadata.'));
      }, 15_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    onProgress(0.35);

    const thumbTime = duration > 0 ? Math.min(duration * 0.1, 2) : 0;
    await seekVideoToTime(video, thumbTime);
    const thumbBlob = await canvasToJpegBlob(
      drawBitmapScaled(video, width, height, 320),
      0.8
    );
    onProgress(0.5);

    const sampleFractions = [0.1, 0.37, 0.64, 0.9];
    const frames: Blob[] = [];
    for (let i = 0; i < sampleFractions.length; i++) {
      const targetTime =
        duration > 0 ? Math.max(0, duration * sampleFractions[i]) : 0;
      await seekVideoToTime(video, targetTime);
      const frameBlob = await canvasToJpegBlob(
        drawBitmapScaled(video, width, height, 768),
        0.82
      );
      frames.push(frameBlob);
      onProgress(0.55 + ((i + 1) / sampleFractions.length) * 0.4);
    }

    return { width, height, duration, thumbBlob, frames };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function processAudioFile(
  file: File,
  onProgress: (p: number) => void
): Promise<Partial<MediaRecord>> {
  onProgress(0.25);
  const buffer = await file.arrayBuffer();
  onProgress(0.5);

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtx) {
    throw new Error('Audio playback decoding is not supported in this browser.');
  }

  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    onProgress(0.8);

    const channelData = decoded.getChannelData(0);
    const binCount = 64;
    const step = Math.max(1, Math.floor(channelData.length / binCount));
    const peaks: number[] = [];

    for (let i = 0; i < binCount; i++) {
      const start = i * step;
      const end = Math.min(channelData.length, start + step);
      let maxVal = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > maxVal) maxVal = abs;
      }
      peaks.push(Number(Math.min(1, maxVal).toFixed(3)));
    }

    onProgress(0.95);
    return {
      duration: decoded.duration,
      waveformPeaks: peaks,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function processTextFile(
  file: File,
  onProgress: (p: number) => void
): Promise<Partial<MediaRecord>> {
  onProgress(0.35);
  const raw = await file.text();
  onProgress(0.8);
  const textContent =
    raw.length > MAX_TEXT_EXCERPT_CHARS
      ? `${raw.slice(0, MAX_TEXT_EXCERPT_CHARS)}\n\n[Truncated after ${MAX_TEXT_EXCERPT_CHARS.toLocaleString()} characters]`
      : raw;
  onProgress(0.95);
  return { textContent };
}

export async function processAttachmentFile(
  file: File,
  id: string = createDbId(),
  onProgress: (progress: number) => void = () => {}
): Promise<Omit<MediaRecord, 'projectId'>> {
  const classified = classifyAttachmentFile(file);
  if (!classified) {
    throw new Error(
      `Unsupported file "${file.name}". Allowed: photos, videos, audio, PDF, TXT, MD, CSV, or JSON.`
    );
  }

  if (file.size > classified.limitBytes) {
    throw new Error(
      `"${file.name}" (${formatBytes(file.size)}) exceeds the ${formatBytes(classified.limitBytes)} limit for ${classified.kind} files.`
    );
  }

  const headroom = await checkStorageHeadroom(file.size * 2);
  if (!headroom.ok) {
    throw new Error(headroom.reason || 'Not enough browser storage left.');
  }

  onProgress(0.1);
  let extra: Partial<MediaRecord> = {};

  switch (classified.kind) {
    case 'image':
      extra = await processImageFile(file, classified.mime, onProgress);
      break;
    case 'video':
      extra = await processVideoFile(file, onProgress);
      break;
    case 'audio':
      extra = await processAudioFile(file, onProgress);
      break;
    case 'text':
      extra = await processTextFile(file, onProgress);
      break;
    case 'pdf':
      onProgress(0.9);
      break;
  }

  onProgress(1);

  return {
    id,
    kind: classified.kind,
    name: file.name || 'attachment',
    mime: classified.mime,
    size: file.size,
    createdAt: Date.now(),
    blob: file,
    ...extra,
  };
}
