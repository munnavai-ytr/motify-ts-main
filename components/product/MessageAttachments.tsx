'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Film, Music, Pause, Play } from 'lucide-react';
import { useBlobObjectUrl } from '@/hooks/use-media-url';
import { getMediaRecordsByIds } from '@/lib/db';
import { formatBytes, formatDurationCompact } from '@/lib/media/process';
import type { AttachmentRef, MediaRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MessageAttachmentsProps {
  attachments: AttachmentRef[];
  cachedMediaById?: Record<string, MediaRecord>;
  onOpenLightbox: (record: MediaRecord) => void;
}

function ImageTile({
  att,
  record,
  onOpen,
}: {
  att: AttachmentRef;
  record?: MediaRecord;
  onOpen: (rec: MediaRecord) => void;
}) {
  const thumbUrl = useBlobObjectUrl(record?.thumbBlob ?? record?.blob);

  return (
    <button
      type="button"
      disabled={!record}
      onClick={() => record && onOpen(record)}
      aria-label={`View image ${att.name}`}
      className="group relative h-24 w-24 overflow-hidden rounded-[10px] border border-black/15 bg-black/20 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer disabled:cursor-default"
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt={att.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/70 px-1 truncate">
          {att.name}
        </div>
      )}
    </button>
  );
}

function VideoTile({
  att,
  record,
  onOpen,
}: {
  att: AttachmentRef;
  record?: MediaRecord;
  onOpen: (rec: MediaRecord) => void;
}) {
  const thumbUrl = useBlobObjectUrl(record?.thumbBlob);

  return (
    <button
      type="button"
      disabled={!record}
      onClick={() => record && onOpen(record)}
      aria-label={`Play video ${att.name}`}
      className="group relative h-24 w-32 overflow-hidden rounded-[10px] border border-black/15 bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer disabled:cursor-default"
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt={att.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Film className="h-5 w-5 text-white/70" />
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/35 transition-colors">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
      </span>
      {att.duration !== undefined && (
        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
          {formatDurationCompact(att.duration)}
        </span>
      )}
    </button>
  );
}

function InlineAudioPlayer({
  att,
  record,
}: {
  att: AttachmentRef;
  record?: MediaRecord;
}) {
  const audioUrl = useBlobObjectUrl(record?.blob);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(att.duration ?? record?.duration ?? 0);

  const peaks = useMemo(() => {
    const raw = record?.waveformPeaks;
    if (!raw || raw.length === 0) {
      return Array.from({ length: 28 }, (_, i) => 0.25 + ((i * 37) % 60) / 100);
    }
    return raw.filter((_, idx) => idx % 2 === 0).slice(0, 32);
  }, [record?.waveformPeaks]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (el.paused) {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="flex w-full min-w-[210px] max-w-[290px] items-center gap-2.5 rounded-[12px] bg-black/20 px-2.5 py-2 text-accent-fg">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      <button
        type="button"
        disabled={!audioUrl}
        onClick={() => void togglePlay()}
        aria-label={playing ? `Pause ${att.name}` : `Play ${att.name}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer disabled:opacity-50"
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex min-w-0 items-center gap-1 truncate font-medium">
            <Music className="h-3 w-3 shrink-0 opacity-80" />
            <span className="truncate">{att.name}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] opacity-85 tabular-nums">
            {formatDurationCompact(playing ? currentTime : duration)}
          </span>
        </div>

        <div className="relative flex h-4 items-center gap-[2px]">
          {peaks.map((peak, idx) => {
            const filled = idx / peaks.length <= progress;
            return (
              <span
                key={idx}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  filled ? 'bg-white' : 'bg-white/35'
                )}
                style={{ height: `${Math.max(20, Math.round(peak * 100))}%` }}
              />
            );
          })}
          <input
            type="range"
            min={0}
            max={Math.max(0.1, duration)}
            step={0.05}
            value={currentTime}
            aria-label={`Seek ${att.name}`}
            onChange={(e) => {
              const next = Number(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) {
                audioRef.current.currentTime = next;
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  );
}

export function MessageAttachments({
  attachments,
  cachedMediaById = {},
  onOpenLightbox,
}: MessageAttachmentsProps) {
  const [loadedMap, setLoadedMap] = useState<Record<string, MediaRecord>>({});

  const missingIds = useMemo(
    () =>
      attachments
        .map((a) => a.mediaId)
        .filter((id) => !cachedMediaById[id] && !loadedMap[id]),
    [attachments, cachedMediaById, loadedMap]
  );

  useEffect(() => {
    if (missingIds.length === 0) return;
    let active = true;
    void getMediaRecordsByIds(missingIds)
      .then((records) => {
        if (!active || records.length === 0) return;
        setLoadedMap((prev) => {
          const next = { ...prev };
          for (const r of records) {
            next[r.id] = r;
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [missingIds]);

  const mediaItems = attachments.filter(
    (a) => a.kind === 'image' || a.kind === 'video'
  );
  const audioItems = attachments.filter((a) => a.kind === 'audio');
  const fileItems = attachments.filter(
    (a) => a.kind === 'text' || a.kind === 'pdf'
  );

  return (
    <div className="flex flex-col items-end gap-2">
      {mediaItems.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {mediaItems.map((att) => {
            const rec = cachedMediaById[att.mediaId] ?? loadedMap[att.mediaId];
            return att.kind === 'image' ? (
              <ImageTile
                key={att.mediaId}
                att={att}
                record={rec}
                onOpen={onOpenLightbox}
              />
            ) : (
              <VideoTile
                key={att.mediaId}
                att={att}
                record={rec}
                onOpen={onOpenLightbox}
              />
            );
          })}
        </div>
      )}

      {audioItems.map((att) => (
        <InlineAudioPlayer
          key={att.mediaId}
          att={att}
          record={cachedMediaById[att.mediaId] ?? loadedMap[att.mediaId]}
        />
      ))}

      {fileItems.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {fileItems.map((att) => {
            const rec = cachedMediaById[att.mediaId] ?? loadedMap[att.mediaId];
            return (
              <button
                key={att.mediaId}
                type="button"
                disabled={!rec}
                onClick={() => rec && onOpenLightbox(rec)}
                className="inline-flex max-w-[240px] items-center gap-2 rounded-[10px] bg-black/20 px-2.5 py-1.5 text-left text-xs text-accent-fg hover:bg-black/30 transition-colors cursor-pointer disabled:cursor-default"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-85" />
                <span className="truncate font-medium">{att.name}</span>
                <span className="shrink-0 font-mono text-[10px] opacity-80 tabular-nums">
                  {formatBytes(att.size)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
