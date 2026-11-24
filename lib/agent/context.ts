import { formatBytes, formatDurationCompact } from '@/lib/media/process';
import type { GeminiContentPart } from '@/lib/ai/gemini-client';
import type { AttachmentRef, MediaRecord } from '@/lib/types';

/**
 * Gemini REST API inlineData guidance (ai.google.dev/gemini-api/docs):
 * - Total JSON request payload size limit for inline data (`generateContent`)
 *   is 20 MB across models (newer documentation also notes up to 100 MB total
 *   for selected 2.5+/3.x inline/PDF workflows; we stay strictly under the
 *   universal 20 MB REST ceiling so base64 JSON payloads do not fail HTTP 413/400).
 */
export const GEMINI_DOC_INLINE_LIMIT_MB = 20;
export const GEMINI_UPDATED_DOC_INLINE_LIMIT_MB = 100;
export const GEMINI_MAX_INLINE_BASE64_BYTES = 19 * 1024 * 1024;

export function formatAttachmentSummaryForHistory(att: AttachmentRef): string {
  switch (att.kind) {
    case 'image': {
      const dims =
        att.width && att.height ? ` ${att.width}x${att.height}` : '';
      return `[image: ${att.name}${dims}]`;
    }
    case 'video': {
      const dur =
        typeof att.duration === 'number'
          ? ` ${formatDurationCompact(att.duration)}`
          : '';
      return `[video: ${att.name}${dur}]`;
    }
    case 'audio': {
      const dur =
        typeof att.duration === 'number'
          ? ` ${formatDurationCompact(att.duration)}`
          : '';
      return `[audio: ${att.name}${dur}]`;
    }
    case 'pdf':
      return `[pdf: ${att.name} ${formatBytes(att.size)}]`;
    case 'text':
      return `[file: ${att.name} ${formatBytes(att.size)}]`;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Could not encode file as base64.'));
        return;
      }
      resolve(res.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read media blob.'));
    reader.readAsDataURL(blob);
  });
}

interface CandidateEncodedItem {
  record: MediaRecord;
  label: string;
  parts: GeminiContentPart[];
  estimatedBase64Bytes: number;
}

export async function buildMultimodalTurnParts(params: {
  mediaRecords: MediaRecord[];
  maxInlineBytes?: number;
  onStepNote?: (label: string, subNote?: string) => void;
}): Promise<{
  parts: GeminiContentPart[];
  summaryLines: string[];
  skippedNotes: string[];
}> {
  const budget = params.maxInlineBytes ?? GEMINI_MAX_INLINE_BASE64_BYTES;
  const { mediaRecords } = params;
  if (mediaRecords.length === 0) {
    return { parts: [], summaryLines: [], skippedNotes: [] };
  }

  const candidates: CandidateEncodedItem[] = [];
  const textParts: GeminiContentPart[] = [];
  const summaryLines: string[] = [];

  for (let i = 0; i < mediaRecords.length; i++) {
    const rec = mediaRecords[i];
    const ref: AttachmentRef = {
      mediaId: rec.id,
      kind: rec.kind,
      name: rec.name,
      mime: rec.mime,
      size: rec.size,
      width: rec.width,
      height: rec.height,
      duration: rec.duration,
    };
    summaryLines.push(`- ${formatAttachmentSummaryForHistory(ref)}`);

    if (rec.kind === 'image') {
      params.onStepNote?.(`Looking at ${rec.name}`);
      const sourceBlob = rec.aiBlob ?? rec.blob;
      const base64 = await blobToBase64(sourceBlob);
      const mimeType = rec.aiBlob ? 'image/jpeg' : rec.mime || 'image/jpeg';
      candidates.push({
        record: rec,
        label: `[Attached image: ${rec.name}${rec.width && rec.height ? ` (${rec.width}x${rec.height})` : ''}]`,
        parts: [{ inlineData: { mimeType, data: base64 } }],
        estimatedBase64Bytes: base64.length,
      });
    } else if (rec.kind === 'video') {
      params.onStepNote?.(`Sampling frames from ${rec.name}`);
      const frameBlobs =
        rec.frames && rec.frames.length > 0
          ? rec.frames
          : rec.thumbBlob
            ? [rec.thumbBlob]
            : [];
      const encodedParts: GeminiContentPart[] = [];
      let totalB64 = 0;
      for (const frame of frameBlobs) {
        const base64 = await blobToBase64(frame);
        totalB64 += base64.length;
        encodedParts.push({
          inlineData: { mimeType: 'image/jpeg', data: base64 },
        });
      }
      if (encodedParts.length > 0) {
        const durLabel =
          typeof rec.duration === 'number'
            ? `, ${formatDurationCompact(rec.duration)}`
            : '';
        candidates.push({
          record: rec,
          label: `[Attached video: ${rec.name}${durLabel}, ${encodedParts.length} representative frames]`,
          parts: encodedParts,
          estimatedBase64Bytes: totalB64,
        });
      }
    } else if (rec.kind === 'audio') {
      params.onStepNote?.(`Preparing audio ${rec.name}`);
      const base64 = await blobToBase64(rec.blob);
      const durLabel =
        typeof rec.duration === 'number'
          ? ` (${formatDurationCompact(rec.duration)})`
          : '';
      candidates.push({
        record: rec,
        label: `[Attached audio: ${rec.name}${durLabel}]`,
        parts: [{ inlineData: { mimeType: rec.mime || 'audio/mpeg', data: base64 } }],
        estimatedBase64Bytes: base64.length,
      });
    } else if (rec.kind === 'pdf') {
      params.onStepNote?.(`Preparing PDF ${rec.name}`);
      const base64 = await blobToBase64(rec.blob);
      candidates.push({
        record: rec,
        label: `[Attached PDF: ${rec.name} (${formatBytes(rec.size)})]`,
        parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }],
        estimatedBase64Bytes: base64.length,
      });
    } else if (rec.kind === 'text') {
      params.onStepNote?.(`Reading ${rec.name}`);
      const excerpt = rec.textContent ?? (await rec.blob.text().catch(() => ''));
      textParts.push({
        text: `[Attached document: ${rec.name} (${formatBytes(rec.size)})]\n${excerpt}`,
      });
    }
  }

  // Enforce inline payload ceiling: drop largest binary attachments first when over budget
  let runningBytes = candidates.reduce(
    (sum, item) => sum + item.estimatedBase64Bytes,
    0
  );
  const droppedIndices = new Set<number>();
  const skippedNotes: string[] = [];

  if (runningBytes > budget) {
    const sortedBySizeDesc = candidates
      .map((item, idx) => ({ idx, bytes: item.estimatedBase64Bytes }))
      .sort((a, b) => b.bytes - a.bytes);

    for (const entry of sortedBySizeDesc) {
      if (runningBytes <= budget) break;
      droppedIndices.add(entry.idx);
      runningBytes -= entry.bytes;
      const skippedName = candidates[entry.idx].record.name;
      const note = `Skipped ${skippedName}: too large for the AI to read`;
      skippedNotes.push(note);
      params.onStepNote?.('Checking attachments', note);
    }
  }

  const finalParts: GeminiContentPart[] = [...textParts];
  for (let i = 0; i < candidates.length; i++) {
    if (droppedIndices.has(i)) continue;
    finalParts.push({ text: candidates[i].label }, ...candidates[i].parts);
  }

  if (skippedNotes.length > 0) {
    finalParts.push({
      text: `Note: Some attached files were omitted due to API request size limits:\n${skippedNotes.join('\n')}`,
    });
  }

  return { parts: finalParts, summaryLines, skippedNotes };
}
