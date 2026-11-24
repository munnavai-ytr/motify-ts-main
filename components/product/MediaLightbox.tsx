'use client';

import React, { useEffect } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { useBlobObjectUrl } from '@/hooks/use-media-url';
import { formatBytes } from '@/lib/media/process';
import type { MediaRecord } from '@/lib/types';

interface MediaLightboxProps {
  record: MediaRecord | null;
  onClose: () => void;
}

export function MediaLightbox({ record, onClose }: MediaLightboxProps) {
  const objectUrl = useBlobObjectUrl(record?.blob);

  useEffect(() => {
    if (!record) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [record, onClose]);

  if (!record) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${record.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm text-white"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-white/70" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{record.name}</p>
            <p className="font-mono text-[11px] text-white/60 tabular-nums">
              {formatBytes(record.size)}
              {record.width && record.height
                ? ` · ${record.width}×${record.height}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {objectUrl && (
            <a
              href={objectUrl}
              download={record.name}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
      >
        {record.kind === 'image' && objectUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl}
            alt={record.name}
            className="max-h-full max-w-full rounded-[12px] object-contain shadow-2xl"
          />
        )}

        {record.kind === 'video' && objectUrl && (
          <video
            src={objectUrl}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-[12px] bg-black shadow-2xl"
          />
        )}

        {record.kind === 'text' && (
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[14px] border border-white/15 bg-neutral-950 p-5 text-left">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-neutral-100">
              {record.textContent ?? ''}
            </pre>
          </div>
        )}

        {record.kind === 'pdf' && objectUrl && (
          <iframe
            src={objectUrl}
            title={record.name}
            className="h-full w-full max-w-4xl rounded-[12px] border border-white/15 bg-white"
          />
        )}
      </div>
    </div>
  );
}
