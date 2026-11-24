'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VideoSpec } from '../spec';
import { isAudioActive } from './helpers';
import {
  computeAudioCacheKey,
  getAudioTrackStatus,
  subscribeAudioStatus,
} from './render';
import type { AudioRenderStatus } from './types';

export function useAudioRenderStatus(
  spec: VideoSpec | null | undefined
): {
  active: boolean;
  cacheKey: string | null;
  status: AudioRenderStatus;
} {
  const active = Boolean(spec && isAudioActive(spec.audio));
  const cacheKey = useMemo(
    () => (spec && active ? computeAudioCacheKey(spec) : null),
    [spec, active]
  );

  const [statusByKey, setStatusByKey] = useState<{
    key: string | null;
    status: AudioRenderStatus;
  }>(() => ({
    key: cacheKey,
    status: cacheKey ? getAudioTrackStatus(cacheKey) : { state: 'idle' },
  }));

  useEffect(() => {
    if (!cacheKey) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setStatusByKey({ key: cacheKey, status: getAudioTrackStatus(cacheKey) });
    });
    const unsubscribe = subscribeAudioStatus(cacheKey, (nextStatus) => {
      if (!mounted) return;
      setStatusByKey({ key: cacheKey, status: nextStatus });
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [cacheKey]);

  const currentStatus: AudioRenderStatus = !cacheKey
    ? { state: 'idle' }
    : statusByKey.key === cacheKey
      ? statusByKey.status
      : getAudioTrackStatus(cacheKey);

  return {
    active,
    cacheKey,
    status: currentStatus,
  };
}
