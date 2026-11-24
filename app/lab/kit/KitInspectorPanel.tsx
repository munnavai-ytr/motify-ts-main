'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Music,
  Palette,
  Play,
  Plus,
  Redo2,
  Shuffle,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createDbId, listAudioMedia, putMediaRecord } from '@/lib/db';
import {
  CAMERA_VALUES,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  KIT_ICON_NAMES,
  MAX_KIT_SCENES,
  MAX_SCENE_DUR_SEC,
  MIN_SCENE_DUR_SEC,
  MUSIC_STYLE_DEFS,
  MUSIC_STYLE_NAMES,
  TRANSITION_VALUES,
  getAllLayouts,
  getLayoutDefinition,
  getKitIconComponent,
  pickDefaultMusicStyleForTheme,
  splitGraphemes,
  type AuditReport,
  type CameraKind,
  type LayoutName,
  type LayoutVariant,
  type MusicStyleName,
  type Op,
  type SfxMode,
  type TransitionKind,
  type VideoSpec,
} from '@/lib/kit';
import { formatDurationCompact, processAttachmentFile } from '@/lib/media/process';
import type { MediaRecord } from '@/lib/types';

export interface KitInspectorPanelProps {
  spec: VideoSpec;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
  onApplyOps: (ops: readonly Op[], historyLabel: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  auditReport: AuditReport | null;
  onSeekToScene?: (sceneIndex: number) => void;
  onPreviewFromStart?: () => void;
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 90) {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  }
  if (score >= 70) {
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  }
  return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
}

export function KitInspectorPanel({
  spec,
  selectedSceneIndex,
  onSelectScene,
  onApplyOps,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  auditReport,
  onSeekToScene,
  onPreviewFromStart,
}: KitInspectorPanelProps) {
  const [addLayout, setAddLayout] = useState<LayoutName>('feature');
  const [openIconSlot, setOpenIconSlot] = useState<string | null>(null);
  const [showCustomColors, setShowCustomColors] = useState(false);
  const [audioUploads, setAudioUploads] = useState<MediaRecord[]>([]);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshUploadedAudio = async () => {
    try {
      const list = await listAudioMedia();
      setAudioUploads(list);
    } catch {
      // Ignore IndexedDB unavailable in non-browser contexts
    }
  };

  useEffect(() => {
    void refreshUploadedAudio();
  }, []);

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploadingAudio(true);
    try {
      const processed = await processAttachmentFile(file, createDbId());
      if (processed.kind !== 'audio') {
        setUploadError('Please select an audio file (MP3, WAV, M4A, OGG, AAC).');
        return;
      }
      const saved = await putMediaRecord({
        ...processed,
        projectId: 'kit-audio-library',
      });
      await refreshUploadedAudio();
      onApplyOps(
        [
          {
            type: 'setMusic',
            source: 'upload',
            mediaId: saved.id,
            volume: spec.audio?.music?.volume ?? DEFAULT_MUSIC_VOLUME,
            startAt: 0,
            loop: true,
          },
        ],
        `Use uploaded music: ${saved.name}`
      );
      setShowUploadPicker(false);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Could not process audio file.'
      );
    } finally {
      setUploadingAudio(false);
    }
  };

  const safeIndex = Math.max(
    0,
    Math.min(spec.scenes.length - 1, selectedSceneIndex)
  );
  const scene = spec.scenes[safeIndex];
  const allLayouts = useMemo(() => getAllLayouts(), []);
  const layoutDef = scene ? getLayoutDefinition(scene.layout) : undefined;

  if (!scene) {
    return null;
  }

  const supportedVariants = layoutDef?.variants ?? ['a'];
  const audioSpec = spec.audio;
  const isMuted = Boolean(audioSpec?.mute);
  const musicSpec = audioSpec?.music;
  const isMusicOn = Boolean(musicSpec);
  const isUploadedMusic = musicSpec?.source === 'upload';
  const activeMusicStyle: MusicStyleName =
    musicSpec && musicSpec.source !== 'upload'
      ? musicSpec.style
      : pickDefaultMusicStyleForTheme(spec.style, spec.theme.mood);
  const musicVolume = musicSpec?.volume ?? DEFAULT_MUSIC_VOLUME;
  const musicSeed =
    musicSpec && musicSpec.source !== 'upload'
      ? (musicSpec.seed ?? spec.seed)
      : spec.seed;
  const sfxMode: SfxMode = audioSpec?.sfx ?? 'off';
  const sfxVolume = audioSpec?.sfxVolume ?? DEFAULT_SFX_VOLUME;
  const uploadedTrackRecord = isUploadedMusic
    ? audioUploads.find((item) => item.id === musicSpec.mediaId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* History Undo / Redo Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <Sliders className="h-3.5 w-3.5 text-accent" />
          <span>Inspector</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canUndo}
            onClick={onUndo}
            title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canRedo}
            onClick={onRedo}
            title={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}
          >
            <Redo2 className="h-3.5 w-3.5" />
            Redo
          </Button>
        </div>
      </div>

      {/* Video Title & Custom Palette Swatches */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text-secondary">
            Video Title
          </span>
          <input
            type="text"
            value={spec.title}
            maxLength={100}
            onChange={(e) => {
              const nextTitle = e.target.value;
              if (nextTitle.trim().length > 0) {
                onApplyOps(
                  [{ type: 'setTitle', title: nextTitle }],
                  'Rename video title'
                );
              }
            }}
            className="w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => setShowCustomColors((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-secondary hover:text-text cursor-pointer"
          >
            <Palette className="h-3.5 w-3.5 text-accent" />
            {showCustomColors ? 'Hide theme colors' : 'Customize theme colors'}
          </button>
          <span className="text-[10px] font-mono text-text-muted">
            {spec.theme.paletteName}
          </span>
        </div>

        {showCustomColors ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {(
              [
                ['bg', 'BG'],
                ['surface', 'Surface'],
                ['text', 'Text'],
                ['muted', 'Muted'],
                ['accent', 'Accent'],
                ['accent2', 'Accent 2'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded border border-border bg-surface-1 px-2 py-1"
              >
                <span className="text-[11px] text-text-secondary">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-text-muted">
                    {spec.theme.palette[key]}
                  </span>
                  <input
                    type="color"
                    value={spec.theme.palette[key]}
                    onChange={(e) =>
                      onApplyOps(
                        [
                          {
                            type: 'setCustomColors',
                            colors: { [key]: e.target.value },
                          },
                        ],
                        `Update ${label} color`
                      )
                    }
                    className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </div>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {/* Sound Card */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-text">
            {isMuted ? (
              <VolumeX className="h-3.5 w-3.5 text-text-muted" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-accent" />
            )}
            <span>Sound</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onApplyOps(
                  [{ type: 'muteAudio', mute: !isMuted }],
                  isMuted ? 'Unmute audio' : 'Mute audio'
                )
              }
              aria-pressed={isMuted}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                isMuted
                  ? 'border-warning/40 bg-warning/10 text-warning'
                  : 'border-border bg-surface-1 text-text-secondary hover:text-text'
              }`}
            >
              {isMuted ? (
                <>
                  <VolumeX className="h-3 w-3" />
                  Muted
                </>
              ) : (
                <>
                  <Volume2 className="h-3 w-3" />
                  Mute
                </>
              )}
            </button>

            {onPreviewFromStart ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onPreviewFromStart}
                title="Play video + sound from the beginning"
              >
                <Play className="h-3 w-3" />
                Preview
              </Button>
            ) : null}
          </div>
        </div>

        {/* Music on/off & Upload button */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-surface-1 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Music className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-medium text-text">
              Background Music
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isMusicOn) {
                  onApplyOps(
                    [{ type: 'setMusic', source: 'off' }],
                    'Turn off background music'
                  );
                } else {
                  const defaultStyle = pickDefaultMusicStyleForTheme(
                    spec.style,
                    spec.theme.mood
                  );
                  onApplyOps(
                    [
                      {
                        type: 'setMusic',
                        source: 'synth',
                        style: defaultStyle,
                        volume: DEFAULT_MUSIC_VOLUME,
                        seed: spec.seed,
                      },
                    ],
                    `Enable ${MUSIC_STYLE_DEFS[defaultStyle].label} music`
                  );
                }
              }}
              aria-pressed={isMusicOn}
              className={`rounded border px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                isMusicOn
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-surface-2 text-text-secondary hover:text-text'
              }`}
            >
              {isMusicOn ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={() => {
                void refreshUploadedAudio();
                setShowUploadPicker((v) => !v);
              }}
              className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text cursor-pointer"
            >
              <Upload className="h-3 w-3" />
              Upload music
            </button>
          </div>
        </div>

        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleUploadAudioFile}
          className="sr-only"
          aria-label="Upload background music audio file"
        />

        {showUploadPicker ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-text-secondary">
                Uploaded Audio ({audioUploads.length})
              </span>
              <Button
                variant="secondary"
                size="sm"
                loading={uploadingAudio}
                onClick={() => audioFileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
                Choose file
              </Button>
            </div>
            {uploadError ? (
              <p className="text-[11px] text-danger">{uploadError}</p>
            ) : null}
            {audioUploads.length === 0 ? (
              <p className="text-[11px] text-text-muted">
                No uploaded audio files yet. Choose an MP3, WAV, M4A, or OGG file (ensure you hold rights).
              </p>
            ) : (
              <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                {audioUploads.map((rec) => {
                  const isSelected =
                    isUploadedMusic && musicSpec.mediaId === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => {
                        onApplyOps(
                          [
                            {
                              type: 'setMusic',
                              source: 'upload',
                              mediaId: rec.id,
                              volume: musicVolume,
                              startAt: 0,
                              loop: true,
                            },
                          ],
                          `Use uploaded audio: ${rec.name}`
                        );
                        setShowUploadPicker(false);
                      }}
                      className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-left text-[11px] cursor-pointer ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-text'
                          : 'border-border/60 bg-surface-2 text-text-secondary hover:text-text'
                      }`}
                    >
                      <span className="truncate font-medium">{rec.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-text-muted tabular-nums">
                        {formatDurationCompact(rec.duration)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {isMusicOn ? (
          <div className="flex flex-col gap-2">
            {isUploadedMusic ? (
              <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-surface-1 p-2">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium text-text">
                    Track: {uploadedTrackRecord?.name ?? musicSpec.mediaId}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onApplyOps(
                        [
                          {
                            type: 'setMusic',
                            source: 'synth',
                            style: activeMusicStyle,
                            volume: musicVolume,
                            seed: spec.seed,
                          },
                        ],
                        'Switch back to generated synth music'
                      )
                    }
                    className="shrink-0 text-[11px] font-medium text-accent hover:underline cursor-pointer"
                  >
                    Use synth instead
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 text-text-secondary">
                    <span>Start (s)</span>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      step={0.5}
                      value={musicSpec.startAt ?? 0}
                      onChange={(e) => {
                        const startAt = Math.max(
                          0,
                          Number(e.target.value) || 0
                        );
                        onApplyOps(
                          [
                            {
                              type: 'setMusic',
                              source: 'upload',
                              mediaId: musicSpec.mediaId,
                              volume: musicVolume,
                              startAt,
                              loop: musicSpec.loop !== false,
                            },
                          ],
                          `Music start → ${startAt}s`
                        );
                      }}
                      className="w-16 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-text tabular-nums"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={musicSpec.loop !== false}
                      onChange={(e) =>
                        onApplyOps(
                          [
                            {
                              type: 'setMusic',
                              source: 'upload',
                              mediaId: musicSpec.mediaId,
                              volume: musicVolume,
                              startAt: musicSpec.startAt ?? 0,
                              loop: e.target.checked,
                            },
                          ],
                          e.target.checked ? 'Loop music on' : 'Loop music off'
                        )
                      }
                      className="accent-accent"
                    />
                    <span>Loop</span>
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-text-secondary">
                      Music Style
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextSeed =
                          (musicSeed +
                            137 +
                            Math.floor(Math.random() * 899)) %
                          9999;
                        onApplyOps(
                          [
                            {
                              type: 'setMusic',
                              source: 'synth',
                              style: activeMusicStyle,
                              bpm: musicSpec?.bpm,
                              seed: nextSeed,
                              volume: musicVolume,
                            },
                          ],
                          'New music variation'
                        );
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline cursor-pointer"
                    >
                      <Shuffle className="h-3 w-3" />
                      New variation
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-0.5">
                    {MUSIC_STYLE_NAMES.map((styleName) => {
                      const def = MUSIC_STYLE_DEFS[styleName];
                      const selected = activeMusicStyle === styleName;
                      return (
                        <button
                          key={styleName}
                          type="button"
                          onClick={() =>
                            onApplyOps(
                              [
                                {
                                  type: 'setMusic',
                                  source: 'synth',
                                  style: styleName,
                                  seed: musicSeed,
                                  volume: musicVolume,
                                },
                              ],
                              `Music style → ${def.label}`
                            )
                          }
                          className={`flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                            selected
                              ? 'border-accent bg-accent/10'
                              : 'border-border/60 bg-surface-1 hover:border-border'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-text">
                              {def.label}
                            </span>
                            <span className="font-mono text-[10px] text-text-muted tabular-nums">
                              {def.defaultBpm} BPM
                            </span>
                          </div>
                          <span className="text-[10px] leading-snug text-text-secondary">
                            {def.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Music Volume Slider */}
            <label className="flex flex-col gap-1 pt-0.5">
              <div className="flex items-center justify-between text-[11px] text-text-secondary tabular-nums">
                <span>Music Volume</span>
                <span>{Math.round(musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(musicVolume * 100)}
                onChange={(e) =>
                  onApplyOps(
                    [
                      {
                        type: 'setMusicVolume',
                        volume: Number(e.target.value) / 100,
                      },
                    ],
                    `Music volume → ${e.target.value}%`
                  )
                }
                className="w-full accent-accent cursor-pointer"
              />
            </label>
          </div>
        ) : null}

        {/* SFX Mode & Volume */}
        <div className="flex flex-col gap-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
              <Sparkles className="h-3 w-3 text-accent" />
              Sound Effects
            </span>
            <div className="flex items-center gap-1 rounded bg-surface-1 p-0.5 border border-border/70">
              {(['auto', 'minimal', 'off'] as const).map((mode) => {
                const active = sfxMode === mode;
                const label =
                  mode === 'auto'
                    ? 'Auto'
                    : mode === 'minimal'
                      ? 'Minimal'
                      : 'Off';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      onApplyOps(
                        [{ type: 'setSfx', sfx: mode }],
                        `SFX → ${label}`
                      )
                    }
                    className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors ${
                      active
                        ? 'bg-accent text-accent-fg'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {sfxMode !== 'off' ? (
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-text-secondary tabular-nums">
                <span>SFX Volume</span>
                <span>{Math.round(sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(sfxVolume * 100)}
                onChange={(e) =>
                  onApplyOps(
                    [
                      {
                        type: 'setSfxVolume',
                        volume: Number(e.target.value) / 100,
                      },
                    ],
                    `SFX volume → ${e.target.value}%`
                  )
                }
                className="w-full accent-accent cursor-pointer"
              />
            </label>
          ) : null}
        </div>
      </div>

      {/* Scene List (select, reorder, duplicate, delete, add) */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-text">
            Scenes ({spec.scenes.length}/{MAX_KIT_SCENES})
          </span>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="New scene layout"
              value={addLayout}
              onChange={(e) => setAddLayout(e.target.value as LayoutName)}
              className="rounded border border-border bg-surface-1 px-1.5 py-1 text-[11px] text-text"
            >
              {allLayouts.map((l) => (
                <option key={l.name} value={l.name}>
                  + {l.label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              disabled={spec.scenes.length >= MAX_KIT_SCENES}
              onClick={() => {
                onApplyOps(
                  [
                    {
                      type: 'addScene',
                      afterScene: scene.id,
                      scene: { layout: addLayout },
                    },
                  ],
                  `Add ${addLayout} scene`
                );
                onSelectScene(Math.min(spec.scenes.length, safeIndex + 1));
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
          {spec.scenes.map((sc, idx) => {
            const selected = idx === safeIndex;
            const summary = auditReport?.sceneScores[idx];
            return (
              <div
                key={sc.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-border/70 bg-surface-1 hover:border-border'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectScene(idx);
                    onSeekToScene?.(idx);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                >
                  <span className="font-mono text-[11px] font-semibold text-text-muted tabular-nums">
                    S{idx + 1}
                  </span>
                  <span className="truncate font-medium text-text">
                    {sc.layout}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {sc.variant.toUpperCase()} · {sc.dur}s
                  </span>
                  {summary ? (
                    <span
                      className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${getScoreBadgeClasses(
                        summary.score
                      )}`}
                    >
                      {summary.score}
                    </span>
                  ) : null}
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Move scene ${idx + 1} up`}
                    disabled={idx === 0}
                    onClick={() => {
                      onApplyOps(
                        [{ type: 'moveScene', from: sc.id, to: idx - 1 }],
                        `Move S${idx + 1} up`
                      );
                      onSelectScene(idx - 1);
                    }}
                    className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-text disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move scene ${idx + 1} down`}
                    disabled={idx === spec.scenes.length - 1}
                    onClick={() => {
                      onApplyOps(
                        [{ type: 'moveScene', from: sc.id, to: idx + 1 }],
                        `Move S${idx + 1} down`
                      );
                      onSelectScene(idx + 1);
                    }}
                    className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-text disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate scene ${idx + 1}`}
                    disabled={spec.scenes.length >= MAX_KIT_SCENES}
                    onClick={() => {
                      onApplyOps(
                        [{ type: 'duplicateScene', scene: sc.id }],
                        `Duplicate S${idx + 1}`
                      );
                      onSelectScene(idx + 1);
                    }}
                    className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-text disabled:opacity-30 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete scene ${idx + 1}`}
                    disabled={spec.scenes.length <= 1}
                    onClick={() => {
                      onApplyOps(
                        [{ type: 'removeScene', scene: sc.id }],
                        `Delete S${idx + 1}`
                      );
                      onSelectScene(Math.max(0, idx - 1));
                    }}
                    className="rounded p-1 text-text-secondary hover:bg-danger/15 hover:text-danger disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Scene Controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-text">
            Scene {safeIndex + 1} Settings
          </span>
          <span className="font-mono text-[10px] text-text-muted">
            id: {scene.id}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">Layout</span>
            <select
              value={scene.layout}
              onChange={(e) =>
                onApplyOps(
                  [
                    {
                      type: 'setLayout',
                      scene: scene.id,
                      layout: e.target.value as LayoutName,
                    },
                  ],
                  `S${safeIndex + 1} layout → ${e.target.value}`
                )
              }
              className="rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-text"
            >
              {allLayouts.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">Variant</span>
            <div className="flex items-center gap-1 rounded border border-border bg-surface-1 p-0.5">
              {supportedVariants.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    onApplyOps(
                      [
                        {
                          type: 'setVariant',
                          scene: scene.id,
                          variant: v as LayoutVariant,
                        },
                      ],
                      `S${safeIndex + 1} variant → ${v}`
                    )
                  }
                  className={`flex-1 rounded py-1 text-[11px] font-semibold uppercase cursor-pointer ${
                    scene.variant === v
                      ? 'bg-accent text-accent-fg'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Duration Slider */}
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary">Duration</span>
            <span className="font-mono font-semibold text-text tabular-nums">
              {scene.dur.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={MIN_SCENE_DUR_SEC}
            max={MAX_SCENE_DUR_SEC}
            step={0.1}
            value={scene.dur}
            onChange={(e) =>
              onApplyOps(
                [
                  {
                    type: 'setDuration',
                    scene: scene.id,
                    dur: Number(e.target.value),
                  },
                ],
                `S${safeIndex + 1} duration → ${Number(e.target.value).toFixed(1)}s`
              )
            }
            className="w-full accent-accent cursor-pointer"
          />
        </label>

        {/* Transition & Camera */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">Transition</span>
            <select
              value={scene.transition}
              onChange={(e) =>
                onApplyOps(
                  [
                    {
                      type: 'setTransition',
                      scope: 'scene',
                      scene: scene.id,
                      transition: e.target.value as TransitionKind,
                    },
                  ],
                  `S${safeIndex + 1} transition → ${e.target.value}`
                )
              }
              className="rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-text"
            >
              {TRANSITION_VALUES.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">Camera</span>
            <select
              value={scene.camera}
              onChange={(e) =>
                onApplyOps(
                  [
                    {
                      type: 'setCamera',
                      scene: scene.id,
                      camera: e.target.value as CameraKind,
                    },
                  ],
                  `S${safeIndex + 1} camera → ${e.target.value}`
                )
              }
              className="rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-text"
            >
              {CAMERA_VALUES.map((cam) => (
                <option key={cam} value={cam}>
                  {cam}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Auto-generated Slot Fields from Layout Definition */}
        {layoutDef ? (
          <div className="flex flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <div className="text-[11px] font-semibold text-text">
              Content Slots ({layoutDef.label})
            </div>

            {layoutDef.slots.map((slotDef) => {
              const rawVal = scene.slots[slotDef.name];

              if (slotDef.type === 'string') {
                const strVal = typeof rawVal === 'string' ? rawVal : '';
                const gLen = splitGraphemes(strVal.trim()).length;
                const over =
                  slotDef.maxChars !== undefined && gLen > slotDef.maxChars;
                return (
                  <label key={slotDef.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-text-secondary">
                        {slotDef.name}
                        {slotDef.required ? ' *' : ''}
                      </span>
                      {slotDef.maxChars ? (
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            over ? 'text-amber-400 font-semibold' : 'text-text-muted'
                          }`}
                        >
                          {gLen}/{slotDef.maxChars}
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      value={strVal}
                      placeholder={slotDef.description}
                      onChange={(e) =>
                        onApplyOps(
                          [
                            {
                              type: 'setSlot',
                              scene: scene.id,
                              slot: slotDef.name,
                              value: e.target.value,
                            },
                          ],
                          `S${safeIndex + 1} ${slotDef.name}`
                        )
                      }
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </label>
                );
              }

              if (slotDef.type === 'number') {
                const numVal = typeof rawVal === 'number' ? rawVal : 0;
                return (
                  <label key={slotDef.name} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-text-secondary">
                      {slotDef.name}
                      {slotDef.required ? ' *' : ''}
                    </span>
                    <input
                      type="number"
                      value={numVal}
                      onChange={(e) =>
                        onApplyOps(
                          [
                            {
                              type: 'setSlot',
                              scene: scene.id,
                              slot: slotDef.name,
                              value: Number(e.target.value),
                            },
                          ],
                          `S${safeIndex + 1} ${slotDef.name}`
                        )
                      }
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-text"
                    />
                  </label>
                );
              }

              if (slotDef.type === 'icon') {
                const iconVal = typeof rawVal === 'string' ? rawVal : 'sparkles';
                const ActiveIcon = getKitIconComponent(iconVal);
                const isOpen = openIconSlot === `${scene.id}:${slotDef.name}`;
                return (
                  <div key={slotDef.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-text-secondary">
                        {slotDef.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenIconSlot(
                            isOpen ? null : `${scene.id}:${slotDef.name}`
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium text-text hover:border-accent cursor-pointer"
                      >
                        <ActiveIcon className="h-3.5 w-3.5 text-accent" />
                        <span>{iconVal}</span>
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="grid grid-cols-6 gap-1 rounded border border-border bg-surface-1 p-1.5 max-h-36 overflow-y-auto">
                        {KIT_ICON_NAMES.map((name) => {
                          const IconComp = getKitIconComponent(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              title={name}
                              onClick={() => {
                                onApplyOps(
                                  [
                                    {
                                      type: 'setSlot',
                                      scene: scene.id,
                                      slot: slotDef.name,
                                      value: name,
                                    },
                                  ],
                                  `S${safeIndex + 1} icon → ${name}`
                                );
                                setOpenIconSlot(null);
                              }}
                              className={`flex items-center justify-center rounded p-1.5 cursor-pointer ${
                                iconVal === name
                                  ? 'bg-accent text-accent-fg'
                                  : 'text-text-secondary hover:bg-surface-2 hover:text-text'
                              }`}
                            >
                              <IconComp className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (slotDef.type === 'string[]') {
                const arr = Array.isArray(rawVal)
                  ? rawVal.map((v) => String(v))
                  : [];
                const maxItems = slotDef.maxItems ?? 6;
                return (
                  <div key={slotDef.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-text-secondary">
                        {slotDef.name} ({arr.length}/{maxItems})
                      </span>
                      <button
                        type="button"
                        disabled={arr.length >= maxItems}
                        onClick={() =>
                          onApplyOps(
                            [
                              {
                                type: 'setItems',
                                scene: scene.id,
                                slot: slotDef.name,
                                items: [...arr, 'New item'],
                              },
                            ],
                            `S${safeIndex + 1} add ${slotDef.name}`
                          )
                        }
                        className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40 cursor-pointer"
                      >
                        + Item
                      </button>
                    </div>
                    {arr.map((entry, entryIdx) => (
                      <div key={entryIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={entry}
                          onChange={(e) => {
                            const next = [...arr];
                            next[entryIdx] = e.target.value;
                            onApplyOps(
                              [
                                {
                                  type: 'setItems',
                                  scene: scene.id,
                                  slot: slotDef.name,
                                  items: next,
                                },
                              ],
                              `S${safeIndex + 1} edit ${slotDef.name}`
                            );
                          }}
                          className="min-w-0 flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${slotDef.name} #${entryIdx + 1}`}
                          onClick={() => {
                            const next = arr.filter((_, j) => j !== entryIdx);
                            onApplyOps(
                              [
                                {
                                  type: 'setItems',
                                  scene: scene.id,
                                  slot: slotDef.name,
                                  items: next,
                                },
                              ],
                              `S${safeIndex + 1} remove ${slotDef.name}`
                            );
                          }}
                          className="rounded p-1 text-text-muted hover:text-danger cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              }

              if (slotDef.type === 'items[]') {
                const items = Array.isArray(rawVal) ? rawVal : [];
                const maxItems = slotDef.maxItems ?? 5;
                return (
                  <div key={slotDef.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-text-secondary">
                        {slotDef.name} ({items.length}/{maxItems})
                      </span>
                      <button
                        type="button"
                        disabled={items.length >= maxItems}
                        onClick={() =>
                          onApplyOps(
                            [
                              {
                                type: 'setItems',
                                scene: scene.id,
                                slot: slotDef.name,
                                items: [
                                  ...items,
                                  { title: 'New item', detail: 'Short detail' },
                                ],
                              },
                            ],
                            `S${safeIndex + 1} add list item`
                          )
                        }
                        className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40 cursor-pointer"
                      >
                        + Row
                      </button>
                    </div>
                    {items.map((rawItem, idx) => {
                      const obj =
                        typeof rawItem === 'string'
                          ? { title: rawItem, detail: '' }
                          : (rawItem as Record<string, unknown>);
                      const titleVal =
                        typeof obj.title === 'string' ? obj.title : '';
                      const detailVal =
                        typeof obj.detail === 'string' ? obj.detail : '';
                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-1 rounded border border-border/70 bg-surface-1 p-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={titleVal}
                              placeholder="Title"
                              onChange={(e) => {
                                const next = items.map((it, j) =>
                                  j === idx
                                    ? {
                                        ...(typeof it === 'object' && it
                                          ? (it as Record<string, unknown>)
                                          : {}),
                                        title: e.target.value,
                                      }
                                    : it
                                );
                                onApplyOps(
                                  [
                                    {
                                      type: 'setItems',
                                      scene: scene.id,
                                      slot: slotDef.name,
                                      items: next,
                                    },
                                  ],
                                  `S${safeIndex + 1} edit item`
                                );
                              }}
                              className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text"
                            />
                            <button
                              type="button"
                              aria-label={`Remove item ${idx + 1}`}
                              onClick={() =>
                                onApplyOps(
                                  [
                                    {
                                      type: 'setItems',
                                      scene: scene.id,
                                      slot: slotDef.name,
                                      items: items.filter((_, j) => j !== idx),
                                    },
                                  ],
                                  `S${safeIndex + 1} remove item`
                                )
                              }
                              className="rounded p-1 text-text-muted hover:text-danger cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={detailVal}
                            placeholder="Optional detail"
                            onChange={(e) => {
                              const next = items.map((it, j) =>
                                j === idx
                                  ? {
                                      ...(typeof it === 'object' && it
                                        ? (it as Record<string, unknown>)
                                        : { title: titleVal }),
                                      detail: e.target.value,
                                    }
                                  : it
                              );
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: next,
                                  },
                                ],
                                `S${safeIndex + 1} edit item detail`
                              );
                            }}
                            className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-secondary"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              if (slotDef.type === 'data[]') {
                const dataArr = Array.isArray(rawVal) ? rawVal : [];
                const maxItems = slotDef.maxItems ?? 6;
                return (
                  <div key={slotDef.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-text-secondary">
                        {slotDef.name} ({dataArr.length}/{maxItems})
                      </span>
                      <button
                        type="button"
                        disabled={dataArr.length >= maxItems}
                        onClick={() =>
                          onApplyOps(
                            [
                              {
                                type: 'setItems',
                                scene: scene.id,
                                slot: slotDef.name,
                                items: [
                                  ...dataArr,
                                  { label: `Bar ${dataArr.length + 1}`, value: 50 },
                                ],
                              },
                            ],
                            `S${safeIndex + 1} add chart bar`
                          )
                        }
                        className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40 cursor-pointer"
                      >
                        + Bar
                      </button>
                    </div>
                    {dataArr.map((rawDatum, idx) => {
                      const d = (rawDatum ?? {}) as Record<string, unknown>;
                      const labelVal = typeof d.label === 'string' ? d.label : '';
                      const numVal = typeof d.value === 'number' ? d.value : 0;
                      return (
                        <div key={idx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={labelVal}
                            onChange={(e) => {
                              const next = dataArr.map((it, j) =>
                                j === idx ? { ...d, label: e.target.value } : it
                              );
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: next,
                                  },
                                ],
                                `S${safeIndex + 1} edit bar label`
                              );
                            }}
                            className="min-w-0 flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text"
                          />
                          <input
                            type="number"
                            value={numVal}
                            onChange={(e) => {
                              const next = dataArr.map((it, j) =>
                                j === idx
                                  ? { ...d, value: Number(e.target.value) }
                                  : it
                              );
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: next,
                                  },
                                ],
                                `S${safeIndex + 1} edit bar value`
                              );
                            }}
                            className="w-16 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: dataArr.filter((_, j) => j !== idx),
                                  },
                                ],
                                `S${safeIndex + 1} remove bar`
                              )
                            }
                            className="rounded p-1 text-text-muted hover:text-danger cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              if (slotDef.type === 'blocks[]') {
                const blocksArr = Array.isArray(rawVal) ? rawVal : [];
                const maxItems = slotDef.maxItems ?? 5;
                return (
                  <div key={slotDef.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-text-secondary">
                        {slotDef.name} ({blocksArr.length}/{maxItems})
                      </span>
                      <button
                        type="button"
                        disabled={blocksArr.length >= maxItems}
                        onClick={() =>
                          onApplyOps(
                            [
                              {
                                type: 'setItems',
                                scene: scene.id,
                                slot: slotDef.name,
                                items: [
                                  ...blocksArr,
                                  { kind: 'body', text: 'New custom block' },
                                ],
                              },
                            ],
                            `S${safeIndex + 1} add custom block`
                          )
                        }
                        className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40 cursor-pointer"
                      >
                        + Block
                      </button>
                    </div>
                    {blocksArr.map((rawBlk, idx) => {
                      const blk = (rawBlk ?? {}) as Record<string, unknown>;
                      const kindVal =
                        typeof blk.kind === 'string' ? blk.kind : 'body';
                      const textVal =
                        typeof blk.text === 'string' ? blk.text : '';
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 rounded border border-border/70 bg-surface-1 p-1.5"
                        >
                          <select
                            value={kindVal}
                            onChange={(e) => {
                              const next = blocksArr.map((it, j) =>
                                j === idx ? { ...blk, kind: e.target.value } : it
                              );
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: next,
                                  },
                                ],
                                `S${safeIndex + 1} block kind`
                              );
                            }}
                            className="rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-text"
                          >
                            {[
                              'kicker',
                              'heading',
                              'body',
                              'stat',
                              'badge',
                              'cta',
                              'divider',
                            ].map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={textVal}
                            placeholder="Block text"
                            onChange={(e) => {
                              const next = blocksArr.map((it, j) =>
                                j === idx ? { ...blk, text: e.target.value } : it
                              );
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: next,
                                  },
                                ],
                                `S${safeIndex + 1} block text`
                              );
                            }}
                            className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onApplyOps(
                                [
                                  {
                                    type: 'setItems',
                                    scene: scene.id,
                                    slot: slotDef.name,
                                    items: blocksArr.filter((_, j) => j !== idx),
                                  },
                                ],
                                `S${safeIndex + 1} remove block`
                              )
                            }
                            className="rounded p-1 text-text-muted hover:text-danger cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return null;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
