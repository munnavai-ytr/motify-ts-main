'use client';

import React from 'react';
import {
  AlertCircle,
  FileText,
  Film,
  Music,
  X,
} from 'lucide-react';
import { useBlobObjectUrl } from '@/hooks/use-media-url';
import { formatBytes, formatDurationCompact } from '@/lib/media/process';
import type { PendingAttachment } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AttachmentTrayProps {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0.05, Math.min(1, progress));
  const offset = circumference * (1 - pct);

  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      className="-rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="13"
        cy="13"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-white/25"
      />
      <circle
        cx="13"
        cy="13"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-accent transition-[stroke-dashoffset] duration-150"
      />
    </svg>
  );
}

function TrayChip({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const previewBlob = item.record?.thumbBlob ?? (item.kind === 'image' ? item.file : null);
  const thumbUrl = useBlobObjectUrl(previewBlob);

  const isProcessing = item.status === 'processing';
  const isError = item.status === 'error';

  return (
    <div
      title={item.error ?? item.name}
      className={cn(
        'relative flex shrink-0 items-center gap-2 rounded-[12px] border px-2 py-1.5 pr-7 text-xs transition-colors',
        isError
          ? 'border-danger/50 bg-danger/10 text-danger'
          : 'border-border bg-surface-1 text-text'
      )}
    >
      {item.kind === 'image' || item.kind === 'video' ? (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-surface-2 flex items-center justify-center">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : item.kind === 'video' ? (
            <Film className="h-4 w-4 text-text-muted" />
          ) : null}

          {item.kind === 'video' && item.record?.duration !== undefined && !isProcessing && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[9px] font-mono text-white tabular-nums">
              {formatDurationCompact(item.record.duration)}
            </span>
          )}

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <ProgressRing progress={item.progress} />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-2 text-text-secondary">
          {isProcessing ? (
            <ProgressRing progress={item.progress} />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-danger" />
          ) : item.kind === 'audio' ? (
            <Music className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </div>
      )}

      <div className="min-w-0 max-w-[140px] space-y-0.5">
        <p className="truncate text-xs font-medium leading-tight">{item.name}</p>
        {isError ? (
          <p className="truncate text-[10px] text-danger">
            {item.error || 'Failed'}
          </p>
        ) : item.kind === 'audio' && item.record?.waveformPeaks ? (
          <div className="flex items-center gap-1.5">
            <div className="flex h-3 items-center gap-[1.5px]" aria-hidden="true">
              {item.record.waveformPeaks
                .filter((_, idx) => idx % 4 === 0)
                .slice(0, 12)
                .map((peak, idx) => (
                  <span
                    key={idx}
                    className="w-[2px] rounded-full bg-accent/80"
                    style={{ height: `${Math.max(20, Math.round(peak * 100))}%` }}
                  />
                ))}
            </div>
            <span className="font-mono text-[10px] text-text-muted tabular-nums">
              {formatDurationCompact(item.record.duration)}
            </span>
          </div>
        ) : (
          <p className="font-mono text-[10px] text-text-muted tabular-nums">
            {isProcessing
              ? `${Math.round(item.progress * 100)}%`
              : formatBytes(item.size)}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.name}`}
        className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function AttachmentTray({ items, onRemove }: AttachmentTrayProps) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-border/70 px-2.5 pt-2.5 pb-2 space-y-1.5">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {items.map((item) => (
          <TrayChip key={item.id} item={item} onRemove={onRemove} />
        ))}
      </div>
      <p className="text-[11px] text-text-muted">
        Only upload content you have the right to use.
      </p>
    </div>
  );
}
