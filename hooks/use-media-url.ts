'use client';

import { useEffect, useState } from 'react';

export function useBlobObjectUrl(blob: Blob | null | undefined): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    const objectUrl = URL.createObjectURL(blob);
    queueMicrotask(() => {
      if (!cancelled) {
        setEntry({ blob, url: objectUrl });
      }
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return blob && entry?.blob === blob ? entry.url : null;
}
