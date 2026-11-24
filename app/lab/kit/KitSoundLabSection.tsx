'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Music, Play, Sparkles, Square, Volume2 } from 'lucide-react';
import {
  MUSIC_STYLE_DEFS,
  MUSIC_STYLE_NAMES,
  SFX_NAMES,
  SFX_PRESET_DEFS,
  renderMusicPreview,
  renderSfxPreview,
  type MusicStyleName,
  type SfxName,
} from '@/lib/kit';

export interface KitSoundLabSectionProps {
  onApplyMusicToSpec?: (style: MusicStyleName, bpm: number, seed: number) => void;
}

export function KitSoundLabSection({ onApplyMusicToSpec }: KitSoundLabSectionProps) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Per-item measured render latency (ms)
  const [sfxRenderMs, setSfxRenderMs] = useState<Partial<Record<SfxName, number>>>({});
  const [musicRenderMs, setMusicRenderMs] = useState<Partial<Record<MusicStyleName, number>>>({});

  // Whoosh parameters
  const [whooshDirection, setWhooshDirection] = useState<'up' | 'down'>('up');
  const [whooshLength, setWhooshLength] = useState<'short' | 'long'>('short');

  // Music style BPM & Seed state
  const [bpmByStyle, setBpmByStyle] = useState<Record<MusicStyleName, number>>(() => ({
    lofi: MUSIC_STYLE_DEFS.lofi.defaultBpm,
    corporate: MUSIC_STYLE_DEFS.corporate.defaultBpm,
    'upbeat-pop': MUSIC_STYLE_DEFS['upbeat-pop'].defaultBpm,
    cinematic: MUSIC_STYLE_DEFS.cinematic.defaultBpm,
    playful: MUSIC_STYLE_DEFS.playful.defaultBpm,
    'tech-pulse': MUSIC_STYLE_DEFS['tech-pulse'].defaultBpm,
    ambient: MUSIC_STYLE_DEFS.ambient.defaultBpm,
  }));
  const [seedByStyle, setSeedByStyle] = useState<Record<MusicStyleName, number>>({
    lofi: 101,
    corporate: 101,
    'upbeat-pop': 101,
    cinematic: 101,
    playful: 101,
    'tech-pulse': 101,
    ambient: 101,
  });

  const stopPlayback = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.onended = null;
      audioElRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, []);

  const playBlobUrl = async (id: string, url: string) => {
    stopPlayback();
    currentUrlRef.current = url;
    const audio = new Audio(url);
    audioElRef.current = audio;
    setPlayingId(id);
    audio.onended = () => {
      if (currentUrlRef.current === url) {
        URL.revokeObjectURL(url);
        currentUrlRef.current = null;
      }
      setPlayingId((prev) => (prev === id ? null : prev));
    };
    await audio.play();
  };

  const handlePlaySfx = async (name: SfxName) => {
    const itemId = `sfx:${name}`;
    if (playingId === itemId) {
      stopPlayback();
      return;
    }
    setErrorText(null);
    setRenderingId(itemId);
    try {
      const params =
        name === 'whoosh'
          ? {
              direction: whooshDirection,
              durationSec: whooshLength === 'long' ? 0.65 : 0.24,
            }
          : {};
      const res = await renderSfxPreview(name, params);
      setSfxRenderMs((prev) => ({ ...prev, [name]: res.renderMs }));
      await playBlobUrl(itemId, res.url);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Failed to play SFX.');
      stopPlayback();
    } finally {
      setRenderingId((prev) => (prev === itemId ? null : prev));
    }
  };

  const handlePlayMusic = async (style: MusicStyleName) => {
    const itemId = `music:${style}`;
    if (playingId === itemId) {
      stopPlayback();
      return;
    }
    setErrorText(null);
    setRenderingId(itemId);
    try {
      const bpm = bpmByStyle[style] ?? MUSIC_STYLE_DEFS[style].defaultBpm;
      const seed = seedByStyle[style] ?? 101;
      const res = await renderMusicPreview(style, bpm, seed, 10);
      setMusicRenderMs((prev) => ({ ...prev, [style]: res.renderMs }));
      await playBlobUrl(itemId, res.url);
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to synthesize music preview.'
      );
      stopPlayback();
    } finally {
      setRenderingId((prev) => (prev === itemId ? null : prev));
    }
  };

  return (
    <section
      id="sound-lab"
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
            <Volume2 className="h-4 w-4 text-accent" />
            Sound lab
          </h2>
          <p className="text-xs text-text-secondary">
            100% browser-synthesized Web Audio (OfflineAudioContext, 44.1 kHz stereo WAV, -1 dBFS limiter). Zero external samples.
          </p>
        </div>
        {playingId ? (
          <button
            type="button"
            onClick={stopPlayback}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-1 cursor-pointer"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop audio
          </button>
        ) : null}
      </div>

      {errorText ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {errorText}
        </div>
      ) : null}

      {/* 12 Synthesized Sound Effects */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Sound Effects ({SFX_NAMES.length})
          </h3>
          <span className="text-[11px] text-text-muted">
            Seeded PRNG noise + envelope fades on every node
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {SFX_NAMES.map((sfxName) => {
            const def = SFX_PRESET_DEFS[sfxName];
            const itemId = `sfx:${sfxName}`;
            const isPlaying = playingId === itemId;
            const isRendering = renderingId === itemId;
            const renderMs = sfxRenderMs[sfxName];

            return (
              <div
                key={sfxName}
                className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-text">
                      {def.label}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted tabular-nums">
                      {renderMs !== undefined ? `${renderMs} ms` : `${Math.round(def.defaultDurationSec * 1000)} ms`}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-text-secondary">
                    {def.description}
                  </p>
                  {sfxName === 'whoosh' ? (
                    <div className="flex items-center gap-1.5 pt-1 text-[10px]">
                      <select
                        aria-label="Whoosh direction"
                        value={whooshDirection}
                        onChange={(e) =>
                          setWhooshDirection(e.target.value as 'up' | 'down')
                        }
                        className="rounded border border-border bg-surface-1 px-1.5 py-0.5 text-text"
                      >
                        <option value="up">up</option>
                        <option value="down">down</option>
                      </select>
                      <select
                        aria-label="Whoosh length"
                        value={whooshLength}
                        onChange={(e) =>
                          setWhooshLength(e.target.value as 'short' | 'long')
                        }
                        className="rounded border border-border bg-surface-1 px-1.5 py-0.5 text-text"
                      >
                        <option value="short">short</option>
                        <option value="long">long</option>
                      </select>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={isRendering}
                  onClick={() => void handlePlaySfx(sfxName)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    isPlaying
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border bg-surface-1 text-text hover:border-accent/60'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Square className="h-3 w-3 fill-current" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-current" />
                      {isRendering ? 'Synthesizing...' : 'Play'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 7 Generative Music Styles */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text">
            <Music className="h-3.5 w-3.5 text-accent" />
            Generative Music Styles ({MUSIC_STYLE_NAMES.length}) · 10s Preview
          </h3>
          <span className="text-[11px] text-text-muted">
            Synthesized drums, bass, pads, keys/arp, swing &amp; convolution reverb
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {MUSIC_STYLE_NAMES.map((styleName) => {
            const def = MUSIC_STYLE_DEFS[styleName];
            const itemId = `music:${styleName}`;
            const isPlaying = playingId === itemId;
            const isRendering = renderingId === itemId;
            const renderMs = musicRenderMs[styleName];
            const bpm = bpmByStyle[styleName] ?? def.defaultBpm;
            const seed = seedByStyle[styleName] ?? 101;

            return (
              <div
                key={styleName}
                className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-text">
                      {def.label}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted tabular-nums">
                      {def.tempoRange[0]}–{def.tempoRange[1]} BPM
                      {renderMs !== undefined ? ` · rendered ${renderMs} ms` : ''}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-text-secondary">
                    {def.description}
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex flex-col gap-1 text-[10px] text-text-secondary">
                      <span>BPM</span>
                      <input
                        type="number"
                        min={def.tempoRange[0]}
                        max={def.tempoRange[1]}
                        step={1}
                        value={bpm}
                        onChange={(e) => {
                          const val = Number(e.target.value) || def.defaultBpm;
                          setBpmByStyle((prev) => ({
                            ...prev,
                            [styleName]: val,
                          }));
                        }}
                        className="rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text tabular-nums"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-text-secondary">
                      <span>Seed</span>
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        step={1}
                        value={seed}
                        onChange={(e) => {
                          const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                          setSeedByStyle((prev) => ({
                            ...prev,
                            [styleName]: val,
                          }));
                        }}
                        className="rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text tabular-nums"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isRendering}
                    onClick={() => void handlePlayMusic(styleName)}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      isPlaying
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border bg-surface-1 text-text hover:border-accent/60'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="h-3 w-3 fill-current" />
                        Stop 10s
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        {isRendering ? 'Rendering...' : 'Play 10s'}
                      </>
                    )}
                  </button>

                  {onApplyMusicToSpec ? (
                    <button
                      type="button"
                      onClick={() => onApplyMusicToSpec(styleName, bpm, seed)}
                      className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:border-accent/60 cursor-pointer whitespace-nowrap"
                    >
                      Use
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
