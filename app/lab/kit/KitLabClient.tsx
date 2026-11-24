'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Player, Thumbnail, type PlayerRef } from '@remotion/player';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Code2,
  Download,
  FileCode2,
  Moon,
  Play,
  Redo2,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  Sliders,
  Sun,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { exportCompositionToMp4, type ExportMp4Progress } from '@/lib/export';
import {
  CAMERA_VALUES,
  DEFAULT_MUSIC_VOLUME,
  INTENSITY_VALUES,
  KIT_FONT_CLASS_NAMES,
  MOODS,
  PALETTES,
  STYLE_DEFS,
  STYLE_NAMES,
  TRANSITION_VALUES,
  VideoFromSpec,
  applyOps,
  autoFix,
  clearAuditCache,
  clearFitTextCache,
  commitHistory,
  computeSceneTimings,
  createHistoryState,
  describeAudioSummary,
  describeKitForAI,
  ensureFonts,
  getAllLayouts,
  getContrastRatio,
  getJsonSchema,
  getLayoutDefinition,
  getOpsJsonSchema,
  getSpecDimensions,
  isAudioActive,
  isSafariBrowser,
  normalizeVideoSpec,
  pickDefaultMusicStyleForTheme,
  posterFrame,
  probeKitFontFaces,
  redoHistory,
  runAudit,
  totalFrames,
  undoHistory,
  useAudioRenderStatus,
  type AuditIssue,
  type AuditReport,
  type CameraKind,
  type FontProbeEntry,
  type IntensityName,
  type KitHistoryState,
  type LayoutName,
  type LayoutVariant,
  type MoodName,
  type MusicStyleName,
  type Op,
  type PaletteName,
  type StyleName,
  type TransitionKind,
  type VideoSpec,
} from '@/lib/kit';
import { getStoredExportMode, setStoredExportMode } from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import type { ExportMode, VideoFormat } from '@/lib/types';
import {
  KIT_TEST_FIXTURES,
  buildGallerySpec,
  type GallerySampleVariant,
} from './fixtures';
import { KitInspectorPanel } from './KitInspectorPanel';
import {
  KitAuditPanel,
  type AutoFixSummaryBanner,
  type FixtureScoreEntry,
} from './KitAuditPanel';
import { KitSoundLabSection } from './KitSoundLabSection';

const FORMAT_OPTIONS: readonly VideoFormat[] = ['9:16', '16:9', '1:1'];
const PALETTE_OPTIONS = Object.keys(PALETTES) as PaletteName[];
const MOOD_OPTIONS = Object.keys(MOODS) as MoodName[];
const STYLE_SHOWCASE_LAYOUTS: readonly LayoutName[] = [
  'hook',
  'stat',
  'quote',
  'offer',
];

function serializeSpecForJson(spec: VideoSpec): Record<string, unknown> {
  return {
    title: spec.title,
    format: spec.format,
    style: spec.style,
    intensity: spec.intensity,
    seed: spec.seed,
    ...(spec.numerals ? { numerals: spec.numerals } : {}),
    ...(spec.transition ? { transition: spec.transition } : {}),
    ...(spec.audio ? { audio: spec.audio } : {}),
    theme: {
      palette:
        spec.theme.paletteName === 'custom'
          ? spec.theme.palette
          : spec.theme.paletteName,
      mood: spec.theme.mood,
    },
    scenes: spec.scenes,
  };
}

interface GalleryCellProps {
  layout: LayoutName;
  label: string;
  format: VideoFormat;
  variant: GallerySampleVariant;
  palette: PaletteName;
  mood: MoodName;
  style?: StyleName;
  intensity?: IntensityName;
  layoutVariant?: LayoutVariant;
  seed?: number;
  fontsReadyTick: number;
  onSelectSpec: (spec: VideoSpec) => void;
}

function GalleryCell({
  layout,
  label,
  format,
  variant,
  palette,
  mood,
  style = 'clean',
  intensity = 'balanced',
  layoutVariant,
  seed = 101,
  fontsReadyTick,
  onSelectSpec,
}: GalleryCellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '220px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const spec = useMemo(
    () =>
      buildGallerySpec({
        layout,
        format,
        variant,
        palette,
        mood,
        style,
        intensity,
        layoutVariant,
        seed,
      }),
    [layout, format, variant, palette, mood, style, intensity, layoutVariant, seed]
  );

  const dims = getSpecDimensions(spec);
  const frameToDisplay = posterFrame(spec);
  const frames = totalFrames(spec);

  const aspectClass =
    format === '9:16'
      ? 'aspect-[9/16]'
      : format === '16:9'
        ? 'aspect-video'
        : 'aspect-square';

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text truncate">
          {label} · {format}
        </span>
        <button
          type="button"
          onClick={() => onSelectSpec(spec)}
          className="text-xs font-medium text-accent hover:underline whitespace-nowrap shrink-0 cursor-pointer"
        >
          Load
        </button>
      </div>
      <div
        className={`relative w-full overflow-hidden rounded-lg border border-border bg-surface-2 flex items-center justify-center ${aspectClass}`}
      >
        {visible ? (
          <Thumbnail
            key={`${layout}-${format}-${variant}-${palette}-${mood}-${style}-${layoutVariant ?? 'auto'}-${seed}-${fontsReadyTick}`}
            component={VideoFromSpec}
            inputProps={{ spec, disableAudio: true }}
            compositionWidth={dims.width}
            compositionHeight={dims.height}
            frameToDisplay={frameToDisplay}
            durationInFrames={frames}
            fps={spec.fps}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <span className="text-xs text-text-muted">Scroll to render</span>
        )}
      </div>
    </div>
  );
}

export function KitLabClient() {
  const { theme, setTheme } = useTheme();
  const isDarkTheme = theme !== 'light';
  const initialFixture = KIT_TEST_FIXTURES[0];

  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(
    initialFixture.id
  );
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(initialFixture.rawSpec, null, 2)
  );
  const [historyState, setHistoryState] = useState<KitHistoryState>(() => {
    const res = normalizeVideoSpec(initialFixture.rawSpec);
    if (res.ok) {
      return createHistoryState(res.spec, `Load ${initialFixture.label}`);
    }
    throw new Error('Initial fixture failed normalization');
  });
  const activeSpec = historyState.present.spec;

  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [leftTab, setLeftTab] = useState<'inspector' | 'json'>('inspector');
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Audit & Auto-fix state
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [fixing, setFixing] = useState<boolean>(false);
  const [scoringAll, setScoringAll] = useState<boolean>(false);
  const [autoRunAudit, setAutoRunAudit] = useState<boolean>(false);
  const [targetSecondsInput, setTargetSecondsInput] = useState<string>(
    initialFixture.targetSeconds ? String(initialFixture.targetSeconds) : ''
  );
  const [lastFixSummary, setLastFixSummary] =
    useState<AutoFixSummaryBanner | null>(null);
  const [canUndoFix, setCanUndoFix] = useState<boolean>(false);
  const [fixtureScores, setFixtureScores] = useState<FixtureScoreEntry[]>([]);

  const [fontsStatus, setFontsStatus] = useState<{
    ready: boolean;
    timedOut: boolean;
    elapsedMs: number;
    entries: FontProbeEntry[];
  }>({
    ready: false,
    timedOut: false,
    elapsedMs: 0,
    entries: [],
  });
  const [fontsReadyTick, setFontsReadyTick] = useState(0);
  const [isSafari, setIsSafari] = useState(false);

  const playerRef = useRef<PlayerRef | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);

  // Still comparison state
  const [stillState, setStillState] = useState<{
    rendering: boolean;
    url: string | null;
    frame: number;
    elapsedMs: number | null;
    error: string | null;
  }>({
    rendering: false,
    url: null,
    frame: 0,
    elapsedMs: null,
    error: null,
  });

  // MP4 Export state
  const [exportMode, setExportMode] = useState<ExportMode>(() =>
    getStoredExportMode()
  );
  const [exportState, setExportState] = useState<{
    exporting: boolean;
    progress: ExportMp4Progress | null;
    error: string | null;
    lastResult: {
      bytes: number;
      elapsedMs: number;
      codec: string;
      mode: ExportMode;
      audioLabel: string;
    } | null;
  }>({
    exporting: false,
    progress: null,
    error: null,
    lastResult: null,
  });

  // AI docs / schema drawer
  const [showAiDocs, setShowAiDocs] = useState(false);
  const [copiedDocs, setCopiedDocs] = useState(false);

  // Gallery controls
  const [galleryVariant, setGalleryVariant] =
    useState<GallerySampleVariant>('standard');
  const [galleryFilter, setGalleryFilter] = useState<LayoutName | 'all'>('all');
  const [galleryMode, setGalleryMode] = useState<'variants' | 'ratios'>('variants');

  const parsedTargetSeconds = useMemo(() => {
    const trimmed = targetSecondsInput.trim();
    if (!trimmed) {
      return undefined;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  }, [targetSecondsInput]);

  useEffect(() => {
    setIsSafari(isSafariBrowser());
    let mounted = true;
    ensureFonts({ timeoutMs: 4500, hasBengali: true }).then((res) => {
      if (!mounted) {
        return;
      }
      clearFitTextCache();
      clearAuditCache();
      setFontsStatus({
        ready: res.ready,
        timedOut: res.timedOut,
        elapsedMs: res.elapsedMs,
        entries: probeKitFontFaces(),
      });
      setFontsReadyTick((n) => n + 1);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Revoke object URL on change/unmount
  useEffect(() => {
    const currentUrl = stillState.url;
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [stillState.url]);

  // Subscribe to Remotion Player frameupdate & seeked events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const onFrame = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
    };
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
    };
  }, []);

  // Debounced auto-run audit (800ms) when enabled
  useEffect(() => {
    if (!autoRunAudit) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) {
          return;
        }
        setAuditing(true);
        try {
          const report = await runAudit(activeSpec, {
            targetSeconds: parsedTargetSeconds,
          });
          if (!cancelled) {
            setAuditReport(report);
          }
        } finally {
          if (!cancelled) {
            setAuditing(false);
          }
        }
      })();
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSpec, autoRunAudit, parsedTargetSeconds]);

  const commitNewSpec = useCallback(
    (nextSpec: VideoSpec, label: string, syncJson = true) => {
      setHistoryState((prev) => commitHistory(prev, nextSpec, label));
      setSelectedSceneIndex((idx) =>
        Math.max(0, Math.min(nextSpec.scenes.length - 1, idx))
      );
      setLastFixSummary(null);
      setCanUndoFix(false);
      if (syncJson) {
        setJsonText(JSON.stringify(serializeSpecForJson(nextSpec), null, 2));
      }
    },
    []
  );

  const handleApplyOps = useCallback(
    (ops: readonly Op[], historyLabel: string) => {
      const result = applyOps(activeSpec, ops);
      setWarnings(result.warnings);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      commitNewSpec(result.spec, historyLabel, true);
    },
    [activeSpec, commitNewSpec]
  );

  const applySpecObject = useCallback(
    (candidate: unknown, label: string, syncJson = true) => {
      const result = normalizeVideoSpec(candidate);
      setWarnings(result.warnings);
      if (result.ok) {
        setErrors([]);
        commitNewSpec(result.spec, label, syncJson);
      } else {
        setErrors(result.errors);
      }
    },
    [commitNewSpec]
  );

  const handleApplyJson = useCallback(() => {
    applySpecObject(jsonText, 'Apply JSON edits', false);
  }, [applySpecObject, jsonText]);

  const handleUndo = useCallback(() => {
    setHistoryState((prev) => {
      const res = undoHistory(prev);
      if (res.entry) {
        setJsonText(
          JSON.stringify(serializeSpecForJson(res.entry.spec), null, 2)
        );
        setSelectedSceneIndex((idx) =>
          Math.max(0, Math.min(res.entry!.spec.scenes.length - 1, idx))
        );
        setErrors([]);
        setLastFixSummary(null);
        setCanUndoFix(false);
      }
      return res.state;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryState((prev) => {
      const res = redoHistory(prev);
      if (res.entry) {
        setJsonText(
          JSON.stringify(serializeSpecForJson(res.entry.spec), null, 2)
        );
        setSelectedSceneIndex((idx) =>
          Math.max(0, Math.min(res.entry!.spec.scenes.length - 1, idx))
        );
        setErrors([]);
        setLastFixSummary(null);
        setCanUndoFix(false);
      }
      return res.state;
    });
  }, []);

  const handleSelectFixture = useCallback((fixtureId: string) => {
    const found = KIT_TEST_FIXTURES.find((f) => f.id === fixtureId);
    if (!found) {
      return;
    }
    const res = normalizeVideoSpec(found.rawSpec);
    setWarnings(res.warnings);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    setSelectedFixtureId(fixtureId);
    setSelectedSceneIndex(0);
    setJsonText(JSON.stringify(found.rawSpec, null, 2));
    setTargetSecondsInput(found.targetSeconds ? String(found.targetSeconds) : '');
    setHistoryState((prev) =>
      commitHistory(prev, res.spec, `Load ${found.label}`)
    );
    setAuditReport(null);
    setLastFixSummary(null);
    setCanUndoFix(false);
    playerRef.current?.seekTo(0);
    setCurrentFrame(0);
  }, []);

  const handleFormatChange = useCallback(
    (format: VideoFormat) => {
      handleApplyOps([{ type: 'setFormat', format }], `Format → ${format}`);
    },
    [handleApplyOps]
  );

  const handlePaletteChange = useCallback(
    (palette: PaletteName) => {
      handleApplyOps([{ type: 'setPalette', palette }], `Palette → ${palette}`);
    },
    [handleApplyOps]
  );

  const handleMoodChange = useCallback(
    (mood: MoodName) => {
      handleApplyOps([{ type: 'setMood', mood }], `Mood → ${mood}`);
    },
    [handleApplyOps]
  );

  const handleStyleChange = useCallback(
    (style: StyleName) => {
      const styleDef = STYLE_DEFS[style];
      // Clear per-scene look overrides so style recipes visually take effect across scenes
      const resetScenes = activeSpec.scenes.map((sc) => ({
        id: sc.id,
        layout: sc.layout,
        dur: sc.dur,
        ...(sc.bg === 'chroma' ? { bg: 'chroma' } : {}),
        slots: sc.slots,
      }));
      applySpecObject(
        {
          title: activeSpec.title,
          format: activeSpec.format,
          style,
          intensity: activeSpec.intensity,
          seed: activeSpec.seed,
          ...(activeSpec.numerals ? { numerals: activeSpec.numerals } : {}),
          ...(activeSpec.audio ? { audio: activeSpec.audio } : {}),
          theme: {
            palette:
              activeSpec.theme.paletteName === 'custom'
                ? activeSpec.theme.palette
                : activeSpec.theme.paletteName,
            mood: styleDef.defaultMood,
          },
          scenes: resetScenes,
        },
        `Style → ${styleDef.label}`,
        true
      );
    },
    [activeSpec, applySpecObject]
  );

  const handleIntensityChange = useCallback(
    (intensity: IntensityName) => {
      handleApplyOps(
        [{ type: 'setIntensity', intensity }],
        `Intensity → ${intensity}`
      );
    },
    [handleApplyOps]
  );

  const handleShuffleLook = useCallback(() => {
    const nextSeed = (activeSpec.seed + 137 + Math.floor(Math.random() * 899)) % 9999;
    const styleIdx = (STYLE_NAMES.indexOf(activeSpec.style) + 1) % STYLE_NAMES.length;
    const nextStyle = STYLE_NAMES[styleIdx] ?? 'clean';
    const styleDef = STYLE_DEFS[nextStyle];

    const compatiblePalettes: PaletteName[] =
      nextStyle === 'editorial'
        ? ['sunrise', 'mono', 'noir', 'ember']
        : nextStyle === 'neon-tech'
          ? ['neon', 'ocean', 'noir']
          : nextStyle === 'playful-pop'
            ? ['lavender', 'sunrise', 'neon', 'ember']
            : nextStyle === 'luxe'
              ? ['noir', 'ember', 'ocean']
              : nextStyle === 'organic-soft'
                ? ['forest', 'sunrise', 'lavender']
                : PALETTE_OPTIONS;

    const pickedPalette =
      compatiblePalettes[nextSeed % compatiblePalettes.length] ??
      styleDef.defaultPalette;
    const pickedIntensity =
      INTENSITY_VALUES[nextSeed % INTENSITY_VALUES.length] ?? 'balanced';

    const refreshedScenes = activeSpec.scenes.map((sc) => ({
      id: sc.id,
      layout: sc.layout,
      dur: sc.dur,
      ...(sc.bg === 'chroma' ? { bg: 'chroma' } : {}),
      slots: sc.slots,
    }));

    applySpecObject(
      {
        title: activeSpec.title,
        format: activeSpec.format,
        style: nextStyle,
        intensity: pickedIntensity,
        seed: nextSeed,
        ...(activeSpec.numerals ? { numerals: activeSpec.numerals } : {}),
        ...(activeSpec.audio ? { audio: activeSpec.audio } : {}),
        theme: {
          palette: pickedPalette,
          mood: styleDef.defaultMood,
        },
        scenes: refreshedScenes,
      },
      'Shuffle look',
      true
    );
  }, [activeSpec, applySpecObject]);

  const handleLoadFromGallery = useCallback(
    (spec: VideoSpec) => {
      commitNewSpec(spec, `Load gallery ${spec.scenes[0]?.layout ?? 'scene'}`, true);
      setSelectedSceneIndex(0);
      setAuditReport(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [commitNewSpec]
  );

  const dims = getSpecDimensions(activeSpec);
  const durationInFrames = totalFrames(activeSpec);
  const timings = useMemo(() => computeSceneTimings(activeSpec), [activeSpec]);
  const totalSec = (durationInFrames / activeSpec.fps).toFixed(1);
  const playerInputProps = useMemo(() => ({ spec: activeSpec }), [activeSpec]);
  const audioStatus = useAudioRenderStatus(activeSpec);
  const soundEnabled = isAudioActive(activeSpec.audio);

  const handlePreviewFromStart = useCallback(() => {
    playerRef.current?.seekTo(0);
    playerRef.current?.play();
    setCurrentFrame(0);
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    if (!activeSpec.audio) {
      const style = pickDefaultMusicStyleForTheme(
        activeSpec.style,
        activeSpec.theme.mood
      );
      handleApplyOps(
        [
          {
            type: 'setMusic',
            source: 'synth',
            style,
            seed: activeSpec.seed,
            volume: DEFAULT_MUSIC_VOLUME,
          },
          { type: 'setSfx', sfx: 'auto' },
        ],
        'Enable sound'
      );
      return;
    }
    const nextMute = !activeSpec.audio.mute;
    handleApplyOps(
      [{ type: 'muteAudio', mute: nextMute }],
      nextMute ? 'Mute audio' : 'Unmute audio'
    );
  }, [activeSpec, handleApplyOps]);

  const handleSeekToScene = useCallback(
    (sceneIdx: number) => {
      const targetTiming = timings[sceneIdx];
      if (!targetTiming) {
        return;
      }
      const target = Math.min(
        targetTiming.startFrame + Math.round(targetTiming.durationInFrames * 0.4),
        durationInFrames - 1
      );
      playerRef.current?.seekTo(target);
      setCurrentFrame(target);
    },
    [durationInFrames, timings]
  );

  const handleRunAudit = useCallback(async () => {
    setAuditing(true);
    try {
      const report = await runAudit(activeSpec, {
        targetSeconds: parsedTargetSeconds,
        previousReport: auditReport ?? undefined,
      });
      setAuditReport(report);
    } finally {
      setAuditing(false);
    }
  }, [activeSpec, auditReport, parsedTargetSeconds]);

  const handleAutoFix = useCallback(async () => {
    setFixing(true);
    try {
      const initialReport =
        auditReport ??
        (await runAudit(activeSpec, { targetSeconds: parsedTargetSeconds }));
      const res = await autoFix(activeSpec, initialReport, {
        targetSeconds: parsedTargetSeconds,
        maxPasses: 3,
      });
      setAuditReport(res.finalReport);
      if (res.ops.length > 0) {
        setHistoryState((prev) =>
          commitHistory(prev, res.spec, 'Auto-fix quality issues')
        );
        setJsonText(JSON.stringify(serializeSpecForJson(res.spec), null, 2));
        setCanUndoFix(true);
      } else {
        setCanUndoFix(false);
      }
      setLastFixSummary({
        scoreBefore: res.scoreBefore,
        scoreAfter: res.scoreAfter,
        applied: res.applied,
        remainingCount: res.remaining.length,
      });
    } finally {
      setFixing(false);
    }
  }, [activeSpec, auditReport, parsedTargetSeconds]);

  const handleIssueClick = useCallback(
    (issue: AuditIssue) => {
      if (issue.sceneIndex !== null) {
        setSelectedSceneIndex(issue.sceneIndex);
      }
      if (typeof issue.frame === 'number') {
        const clamped = Math.max(0, Math.min(durationInFrames - 1, issue.frame));
        playerRef.current?.pause();
        playerRef.current?.seekTo(clamped);
        setCurrentFrame(clamped);
      }
    },
    [durationInFrames]
  );

  const handleScoreAllFixtures = useCallback(async () => {
    setScoringAll(true);
    try {
      const entries: FixtureScoreEntry[] = [];
      for (const fixture of KIT_TEST_FIXTURES) {
        const norm = normalizeVideoSpec(fixture.rawSpec);
        if (!norm.ok) {
          continue;
        }
        const report = await runAudit(norm.spec, {
          targetSeconds: fixture.targetSeconds,
        });
        const uniqueCodes = Array.from(
          new Set(report.issues.map((iss) => iss.code))
        );
        entries.push({
          id: fixture.id,
          label: fixture.label,
          isAuditTest: Boolean(fixture.isAuditTest),
          score: report.score,
          issueCount: report.issues.length,
          durationMs: report.durationMs,
          codes: uniqueCodes,
        });
      }
      setFixtureScores(entries);
    } finally {
      setScoringAll(false);
    }
  }, []);

  const handleRenderStillCompare = useCallback(async () => {
    const targetFrame = Math.min(
      Math.max(0, currentFrame || posterFrame(activeSpec)),
      durationInFrames - 1
    );
    playerRef.current?.pause();
    playerRef.current?.seekTo(targetFrame);

    setStillState((prev) => ({
      ...prev,
      rendering: true,
      frame: targetFrame,
      error: null,
    }));

    const startedAt = performance.now();
    try {
      await ensureFonts();
      const webRenderer = await import('@remotion/web-renderer');
      const result = await webRenderer.renderStillOnWeb({
        composition: {
          id: 'kit-still-compare',
          component: VideoFromSpec,
          durationInFrames,
          fps: activeSpec.fps,
          width: dims.width,
          height: dims.height,
          defaultProps: { spec: activeSpec, disableAudio: true },
        },
        inputProps: { spec: activeSpec, disableAudio: true },
        frame: targetFrame,
        licenseKey: 'free-license',
      });
      const stillUrl = await result.url({ format: 'png' });
      const elapsedMs = Math.round(performance.now() - startedAt);
      setStillState({
        rendering: false,
        url: stillUrl,
        frame: targetFrame,
        elapsedMs,
        error: null,
      });
    } catch (err) {
      setStillState((prev) => ({
        ...prev,
        rendering: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to render still via renderStillOnWeb.',
      }));
    }
  }, [activeSpec, currentFrame, dims.height, dims.width, durationInFrames]);

  const handleExportModeChange = useCallback((nextMode: ExportMode) => {
    setExportMode(nextMode);
    setStoredExportMode(nextMode);
  }, []);

  const handleExportMp4 = useCallback(
    async (modeOverride?: ExportMode) => {
      const effectiveMode = modeOverride ?? exportMode;
      if (modeOverride) {
        setExportMode(modeOverride);
        setStoredExportMode(modeOverride);
      }

      setExportState({
        exporting: true,
        progress: null,
        error: null,
        lastResult: null,
      });
      try {
        await ensureFonts();
        const result = await exportCompositionToMp4({
          compositionId: 'motion-kit-video',
          component: VideoFromSpec,
          inputProps: { spec: activeSpec },
          durationInFrames,
          fps: activeSpec.fps,
          width: dims.width,
          height: dims.height,
          mode: effectiveMode,
          muted: !isAudioActive(activeSpec.audio),
          onProgress: (p) => {
            setExportState((prev) => ({ ...prev, progress: p }));
          },
        });
        const downloadUrl = URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = `${
          activeSpec.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'motion-kit'
        }-${activeSpec.format.replace(':', 'x')}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);

        setExportState({
          exporting: false,
          progress: null,
          error: null,
          lastResult: {
            bytes: result.blob.size,
            elapsedMs: Math.round(result.elapsedMs),
            codec: result.codec,
            mode: result.mode,
            audioLabel: describeAudioSummary(activeSpec.audio),
          },
        });
      } catch (err) {
        setExportState({
          exporting: false,
          progress: null,
          error:
            err instanceof Error ? err.message : 'Browser MP4 export failed.',
          lastResult: null,
        });
      }
    },
    [activeSpec, dims.height, dims.width, durationInFrames, exportMode]
  );

  const aiDocsPayload = useMemo(
    () =>
      `${describeKitForAI()}\n\nOPENAPI 3.0 SCHEMA:\n${JSON.stringify(getJsonSchema(), null, 2)}\n\nOPS API SCHEMA (STAGE S1-C):\n${JSON.stringify(getOpsJsonSchema(), null, 2)}`,
    []
  );

  const handleCopyAiDocs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aiDocsPayload);
      setCopiedDocs(true);
      setTimeout(() => setCopiedDocs(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }, [aiDocsPayload]);

  const allLayouts = useMemo(() => getAllLayouts(), []);
  const filteredLayouts = useMemo(
    () =>
      galleryFilter === 'all'
        ? allLayouts
        : allLayouts.filter((l) => l.name === galleryFilter),
    [allLayouts, galleryFilter]
  );

  const standardFixtures = useMemo(
    () => KIT_TEST_FIXTURES.filter((f) => !f.isAuditTest),
    []
  );
  const auditFixtures = useMemo(
    () => KIT_TEST_FIXTURES.filter((f) => Boolean(f.isAuditTest)),
    []
  );

  const selectedPaletteForSelect: PaletteName =
    activeSpec.theme.paletteName === 'custom'
      ? 'ember'
      : activeSpec.theme.paletteName;

  const textBgContrast = getContrastRatio(
    activeSpec.theme.palette.text,
    activeSpec.theme.palette.bg
  ).toFixed(1);

  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const undoLabel = historyState.past[historyState.past.length - 1]?.label ?? null;
  const redoLabel = historyState.future[0]?.label ?? null;

  return (
    <div
      className={`min-h-screen overflow-x-hidden bg-bg text-text ${KIT_FONT_CLASS_NAMES}`}
    >
      {/* Clean 3-zone Top Bar */}
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-3 sm:px-6 py-3">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <Link
              href="/lab"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Lab
            </Link>
            <span className="text-border" aria-hidden="true">
              /
            </span>
            <h1 className="truncate text-sm sm:text-base font-semibold tracking-tight text-text">
              Motion Kit Workbench
            </h1>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-text-secondary">
            <a href="#preview" className="hover:text-text whitespace-nowrap shrink-0">
              Preview
            </a>
            <a href="#audit" className="hover:text-text whitespace-nowrap shrink-0">
              Audit
            </a>
            <a href="#sound-lab" className="hover:text-text whitespace-nowrap shrink-0">
              Sound lab
            </a>
            <a href="#fonts" className="hover:text-text whitespace-nowrap shrink-0">
              Font Check
            </a>
            <a href="#styles" className="hover:text-text whitespace-nowrap shrink-0">
              Style Rows
            </a>
            <a href="#gallery" className="hover:text-text whitespace-nowrap shrink-0">
              Layout Gallery
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Export mode"
              value={exportMode}
              onChange={(e) => handleExportModeChange(e.target.value as ExportMode)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
            >
              <option value="standard">Standard</option>
              <option value="compatibility">Compatibility</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              aria-label="Toggle color theme"
            >
              {isDarkTheme ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={exportState.exporting}
              onClick={() => void handleExportMp4()}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {exportState.exporting && exportState.progress
                  ? exportState.progress.phase === 'audio'
                    ? 'Rendering audio...'
                    : `Exporting ${exportState.progress.progressPercent}%`
                  : 'Export MP4'}
              </span>
              <span className="sm:hidden">
                {exportState.exporting && exportState.progress
                  ? exportState.progress.phase === 'audio'
                    ? 'Audio...'
                    : `${exportState.progress.progressPercent}%`
                  : 'MP4'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 sm:space-y-8 px-3 sm:px-6 py-4 sm:py-6 pb-20 lg:pb-8">
        {/* Controls Toolbar */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {standardFixtures.map((fixture) => {
                  const active = selectedFixtureId === fixture.id;
                  return (
                    <button
                      key={fixture.id}
                      type="button"
                      onClick={() => handleSelectFixture(fixture.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface-2 text-text-secondary hover:text-text'
                      }`}
                    >
                      {fixture.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-text-muted whitespace-nowrap">
                  Audit broken fixtures:
                </span>
                {auditFixtures.map((fixture) => {
                  const active = selectedFixtureId === fixture.id;
                  return (
                    <button
                      key={fixture.id}
                      type="button"
                      onClick={() => handleSelectFixture(fixture.id)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-amber-500/30 bg-surface-2 text-amber-400/90 hover:border-amber-500/60'
                      }`}
                    >
                      {fixture.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canUndo}
                onClick={handleUndo}
                title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canRedo}
                onClick={handleRedo}
                title={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}
              >
                <Redo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleShuffleLook}>
                <Shuffle className="h-3.5 w-3.5" />
                Shuffle look
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 border-t border-border/60 pt-3">
            {/* Format segmented buttons */}
            <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
              {FORMAT_OPTIONS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleFormatChange(fmt)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSpec.format === fmt
                      ? 'bg-surface-1 text-text border border-border'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="whitespace-nowrap">Style</span>
              <select
                value={activeSpec.style}
                onChange={(e) => handleStyleChange(e.target.value as StyleName)}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
              >
                {STYLE_NAMES.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_DEFS[s].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="whitespace-nowrap">Intensity</span>
              <select
                value={activeSpec.intensity}
                onChange={(e) =>
                  handleIntensityChange(e.target.value as IntensityName)
                }
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
              >
                {INTENSITY_VALUES.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="whitespace-nowrap">Palette</span>
              <select
                value={selectedPaletteForSelect}
                onChange={(e) =>
                  handlePaletteChange(e.target.value as PaletteName)
                }
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
              >
                {PALETTE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="whitespace-nowrap">Mood</span>
              <select
                value={activeSpec.theme.mood}
                onChange={(e) => handleMoodChange(e.target.value as MoodName)}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-text"
              >
                {MOOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Export feedback strip if present */}
        {(exportState.error || exportState.lastResult || isSafari) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-text-secondary">
              {exportState.error ? (
                <span className="text-danger font-medium">
                  Export error: {exportState.error}
                </span>
              ) : null}
              {exportState.lastResult ? (
                <span className="text-success font-medium tabular-nums">
                  Exported {(exportState.lastResult.bytes / (1024 * 1024)).toFixed(2)} MB MP4 ({exportState.lastResult.codec}, {exportState.lastResult.mode}) in {(exportState.lastResult.elapsedMs / 1000).toFixed(1)}s · {exportState.lastResult.audioLabel}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {exportState.lastResult ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exportState.exporting}
                  onClick={() => void handleExportMp4('compatibility')}
                >
                  Re-export (compatibility mode)
                </Button>
              ) : null}
              {isSafari ? (
                <span className="text-text-muted">
                  Safari mode active: non-filter radial lighting fallback enabled.
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Main 2-column Workspace */}
        <section id="preview" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Desktop Left Column: Inspector + VideoSpec JSON + Validation + AI Docs */}
          <div className="hidden lg:flex flex-col gap-4 lg:col-span-5">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => setLeftTab('inspector')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      leftTab === 'inspector'
                        ? 'bg-surface-1 text-text border border-border'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Inspector
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab('json')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      leftTab === 'json'
                        ? 'bg-surface-1 text-text border border-border'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    VideoSpec JSON
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary tabular-nums">
                  <span>{activeSpec.scenes.length} scenes</span>
                  <span aria-hidden="true">·</span>
                  <span>{totalSec}s</span>
                  <span aria-hidden="true">·</span>
                  <span>{textBgContrast}:1</span>
                </div>
              </div>

              {leftTab === 'inspector' ? (
                <KitInspectorPanel
                  spec={activeSpec}
                  selectedSceneIndex={selectedSceneIndex}
                  onSelectScene={setSelectedSceneIndex}
                  onApplyOps={handleApplyOps}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  undoLabel={undoLabel}
                  redoLabel={redoLabel}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  auditReport={auditReport}
                  onSeekToScene={handleSeekToScene}
                  onPreviewFromStart={handlePreviewFromStart}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAiDocs((v) => !v)}
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      {showAiDocs ? 'Hide Schema' : 'AI Schema'}
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleApplyJson}>
                      <Play className="h-3.5 w-3.5" />
                      Apply JSON
                    </Button>
                  </div>

                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    spellCheck={false}
                    aria-label="VideoSpec JSON editor"
                    className="h-[460px] w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-text focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}

              {errors.length > 0 ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <div className="font-semibold">Validation Errors</div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {warnings.length > 0 ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Normalization Adjustments ({warnings.length})
                  </div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {showAiDocs ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text">
                    <Code2 className="h-4 w-4 text-accent" />
                    AI Prompt Guide & Schemas (VideoSpec + Ops API)
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleCopyAiDocs}>
                    {copiedDocs ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      'Copy Docs'
                    )}
                  </Button>
                </div>
                <pre className="max-h-[300px] overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                  {aiDocsPayload}
                </pre>
              </div>
            ) : null}
          </div>

          {/* Right Column: Live Player + Per-Scene Timeline + Audit Panel + Still Comparison */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-1 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary tabular-nums">
                  <span className="font-semibold text-text">{activeSpec.title}</span>
                  <span aria-hidden="true">·</span>
                  <span>{STYLE_DEFS[activeSpec.style].label}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {dims.width}×{dims.height}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Frame {currentFrame} / {durationInFrames}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {audioStatus.active && audioStatus.status.state === 'preparing' ? (
                    <span className="text-[11px] font-medium text-accent">
                      Preparing sound...
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleToggleSpeaker}
                    aria-label={soundEnabled ? 'Mute sound for preview and export' : 'Enable or unmute sound'}
                    title={`${describeAudioSummary(activeSpec.audio)} — click to toggle`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                      soundEnabled
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-border bg-surface-2 text-text-secondary hover:text-text'
                    }`}
                  >
                    {soundEnabled ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {soundEnabled ? 'Sound on' : activeSpec.audio?.mute ? 'Muted' : 'No sound'}
                    </span>
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={stillState.rendering}
                    onClick={handleRenderStillCompare}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Render Still Compare
                  </Button>
                </div>
              </div>

              {/* Per-scene quick timeline & look bar */}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
                {timings.map((t) => {
                  const def = getLayoutDefinition(t.scene.layout);
                  const supportedVariants = def?.variants ?? ['a'];
                  const isSelected = selectedSceneIndex === t.index;
                  return (
                    <div
                      key={t.scene.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                        isSelected
                          ? 'border-accent bg-accent/10'
                          : 'border-border/70 bg-surface-1'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSceneIndex(t.index);
                          handleSeekToScene(t.index);
                        }}
                        className="font-medium text-text hover:text-accent tabular-nums whitespace-nowrap cursor-pointer"
                      >
                        S{t.index + 1} · {t.scene.dur}s ({t.startFrame}f)
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Scene ${t.index + 1} layout`}
                          value={t.scene.layout}
                          onChange={(e) =>
                            handleApplyOps(
                              [
                                {
                                  type: 'setLayout',
                                  scene: t.scene.id,
                                  layout: e.target.value as LayoutName,
                                },
                              ],
                              `S${t.index + 1} layout → ${e.target.value}`
                            )
                          }
                          className="rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-text"
                        >
                          {allLayouts.map((l) => (
                            <option key={l.name} value={l.name}>
                              {l.name}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label={`Scene ${t.index + 1} variant`}
                          value={t.scene.variant}
                          onChange={(e) =>
                            handleApplyOps(
                              [
                                {
                                  type: 'setVariant',
                                  scene: t.scene.id,
                                  variant: e.target.value as LayoutVariant,
                                },
                              ],
                              `S${t.index + 1} variant → ${e.target.value}`
                            )
                          }
                          className="rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-text"
                        >
                          {supportedVariants.map((v) => (
                            <option key={v} value={v}>
                              var {v}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label={`Scene ${t.index + 1} transition`}
                          value={t.scene.transition}
                          onChange={(e) =>
                            handleApplyOps(
                              [
                                {
                                  type: 'setTransition',
                                  scope: 'scene',
                                  scene: t.scene.id,
                                  transition: e.target.value as TransitionKind,
                                },
                              ],
                              `S${t.index + 1} transition → ${e.target.value}`
                            )
                          }
                          className="rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-text"
                        >
                          {TRANSITION_VALUES.map((tr) => (
                            <option key={tr} value={tr}>
                              {tr}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label={`Scene ${t.index + 1} camera`}
                          value={t.scene.camera}
                          onChange={(e) =>
                            handleApplyOps(
                              [
                                {
                                  type: 'setCamera',
                                  scene: t.scene.id,
                                  camera: e.target.value as CameraKind,
                                },
                              ],
                              `S${t.index + 1} camera → ${e.target.value}`
                            )
                          }
                          className="rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-text"
                        >
                          {CAMERA_VALUES.map((cam) => (
                            <option key={cam} value={cam}>
                              {cam}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Player & Optional Still Side-by-Side */}
              <div
                className={`grid gap-4 ${
                  stillState.url ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-text-secondary">
                    Live Remotion Player
                  </div>
                  <div className="flex items-center justify-center rounded-lg border border-border bg-surface-2 p-2 sm:p-3">
                    <div
                      style={{
                        width: '100%',
                        maxWidth:
                          activeSpec.format === '9:16'
                            ? 340
                            : activeSpec.format === '1:1'
                              ? 440
                              : 680,
                        aspectRatio: `${dims.width} / ${dims.height}`,
                      }}
                    >
                      <Player
                        ref={playerRef}
                        component={VideoFromSpec}
                        inputProps={playerInputProps}
                        compositionWidth={dims.width}
                        compositionHeight={dims.height}
                        durationInFrames={durationInFrames}
                        fps={activeSpec.fps}
                        controls
                        loop
                        clickToPlay
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {stillState.url ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-text-secondary tabular-nums">
                      <span className="font-medium">
                        renderStillOnWeb PNG · Frame {stillState.frame}
                      </span>
                      {stillState.elapsedMs !== null ? (
                        <span>{stillState.elapsedMs}ms</span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-center rounded-lg border border-border bg-surface-2 p-2 sm:p-3">
                      <div
                        style={{
                          width: '100%',
                          maxWidth:
                            activeSpec.format === '9:16'
                              ? 340
                              : activeSpec.format === '1:1'
                                ? 440
                                : 680,
                          aspectRatio: `${dims.width} / ${dims.height}`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={stillState.url}
                          alt={`Exported PNG still at frame ${stillState.frame}`}
                          className="h-full w-full rounded-lg object-contain"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {stillState.error ? (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  Still render error: {stillState.error}
                </div>
              ) : null}
            </div>

            {/* Quality Audit & Auto-fix Panel */}
            <div id="audit">
              <KitAuditPanel
                report={auditReport}
                auditing={auditing}
                fixing={fixing}
                scoringAll={scoringAll}
                autoRun={autoRunAudit}
                targetSecondsInput={targetSecondsInput}
                onTargetSecondsChange={setTargetSecondsInput}
                onToggleAutoRun={() => setAutoRunAudit((v) => !v)}
                onRunAudit={() => {
                  void handleRunAudit();
                }}
                onAutoFix={() => {
                  void handleAutoFix();
                }}
                onUndoAutoFix={handleUndo}
                lastFixSummary={lastFixSummary}
                canUndoFix={canUndoFix && canUndo}
                onIssueClick={handleIssueClick}
                onScoreAllFixtures={() => {
                  void handleScoreAllFixtures();
                }}
                fixtureScores={fixtureScores}
                onLoadFixtureById={handleSelectFixture}
              />
            </div>
          </div>
        </section>

        {/* Mobile (< lg) Collapsible Bottom Sheet Toggle + Drawer for Inspector / JSON */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1/95 px-3 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileSheetOpen((v) => !v)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg cursor-pointer"
            >
              <Sliders className="h-3.5 w-3.5" />
              {mobileSheetOpen
                ? 'Close Inspector & JSON'
                : `Inspector · S${selectedSceneIndex + 1} (${activeSpec.scenes[selectedSceneIndex]?.layout ?? ''})`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  mobileSheetOpen ? 'rotate-0' : 'rotate-180'
                }`}
              />
            </button>
            {auditReport ? (
              <a
                href="#audit"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs font-bold tabular-nums text-text"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                {auditReport.score}
              </a>
            ) : null}
          </div>
        </div>

        {mobileSheetOpen ? (
          <div className="fixed inset-x-0 bottom-12 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface-1 p-3 shadow-2xl lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                <button
                  type="button"
                  onClick={() => setLeftTab('inspector')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    leftTab === 'inspector'
                      ? 'bg-surface-1 text-text border border-border'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('json')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    leftTab === 'json'
                      ? 'bg-surface-1 text-text border border-border'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  JSON
                </button>
              </div>
              <button
                type="button"
                aria-label="Close mobile sheet"
                onClick={() => setMobileSheetOpen(false)}
                className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {leftTab === 'inspector' ? (
              <KitInspectorPanel
                spec={activeSpec}
                selectedSceneIndex={selectedSceneIndex}
                onSelectScene={setSelectedSceneIndex}
                onApplyOps={handleApplyOps}
                canUndo={canUndo}
                canRedo={canRedo}
                undoLabel={undoLabel}
                redoLabel={redoLabel}
                onUndo={handleUndo}
                onRedo={handleRedo}
                auditReport={auditReport}
                onSeekToScene={handleSeekToScene}
                onPreviewFromStart={handlePreviewFromStart}
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="primary" size="sm" onClick={handleApplyJson}>
                    <Play className="h-3.5 w-3.5" />
                    Apply JSON
                  </Button>
                </div>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                  aria-label="Mobile VideoSpec JSON editor"
                  className="h-72 w-full rounded-lg border border-border bg-surface-2 p-2.5 font-mono text-xs leading-relaxed text-text"
                />
              </div>
            )}
          </div>
        ) : null}

        {/* Sound Lab Section */}
        <KitSoundLabSection
          onApplyMusicToSpec={(style: MusicStyleName, bpm: number, seed: number) => {
            handleApplyOps(
              [
                {
                  type: 'setMusic',
                  source: 'synth',
                  style,
                  bpm,
                  seed,
                  volume: activeSpec.audio?.music?.volume ?? DEFAULT_MUSIC_VOLUME,
                },
                {
                  type: 'setSfx',
                  sfx: activeSpec.audio?.sfx ?? 'auto',
                },
              ],
              `Sound Lab → ${style} (${bpm} BPM)`
            );
          }}
        />

        {/* Font Check Strip */}
        <section
          id="fonts"
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-text-secondary tabular-nums">
              <span className="text-sm font-semibold text-text">Font Check</span>
              <span aria-hidden="true">·</span>
              <span>
                {fontsStatus.ready
                  ? fontsStatus.timedOut
                    ? `Timed out after ${fontsStatus.elapsedMs}ms`
                    : `All faces verified in ${fontsStatus.elapsedMs}ms`
                  : 'Loading fonts...'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFontsStatus((prev) => ({
                  ...prev,
                  entries: probeKitFontFaces(),
                }));
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-probe
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fontsStatus.entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-text">{entry.label}</span>
                  <span className="text-text-muted tabular-nums">
                    {entry.loadedWeights.length}/{entry.expectedWeights.length} weights
                  </span>
                </div>
                <div
                  className="text-base text-text truncate"
                  style={{ fontFamily: entry.family, fontWeight: 600 }}
                >
                  {entry.sample}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Style Showcase Rows (7 styles x 4 sample scenes in 9:16) */}
        <section id="styles" className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-text">
              Style Showcase (7 Styles in 9:16)
            </h2>
            <p className="text-xs text-text-secondary">
              Same sample content rendered through each curated typography, framing, highlight, and background recipe.
            </p>
          </div>

          <div className="space-y-5">
            {STYLE_NAMES.map((styleKey, rowIdx) => {
              const def = STYLE_DEFS[styleKey];
              return (
                <div
                  key={styleKey}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2.5">
                      <h3 className="text-sm font-semibold text-text">
                        {def.label}
                      </h3>
                      <span className="text-xs text-text-secondary">
                        {def.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStyleChange(styleKey)}
                      className="text-xs font-medium text-accent hover:underline cursor-pointer"
                    >
                      Apply to workspace
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {STYLE_SHOWCASE_LAYOUTS.map((lay, colIdx) => (
                      <GalleryCell
                        key={`${styleKey}-${lay}`}
                        layout={lay}
                        label={`${def.label} · ${lay}`}
                        format="9:16"
                        variant={galleryVariant}
                        palette={def.defaultPalette}
                        mood={def.defaultMood}
                        style={styleKey}
                        seed={200 + rowIdx * 17 + colIdx * 3}
                        fontsReadyTick={fontsReadyTick}
                        onSelectSpec={handleLoadFromGallery}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Layout Gallery: 15 layouts x Variants in 9:16 OR 3 Formats */}
        <section id="gallery" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 p-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-text">
                Layout Gallery ({allLayouts.length} Layouts × Variants & Ratios)
              </h2>
              <p className="text-xs text-text-secondary">
                Inspect every layout variant (a / b / c) in 9:16 or compare across 9:16, 16:9, and 1:1.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                {(
                  [
                    { id: 'variants', label: '9:16 Variants' },
                    { id: 'ratios', label: '3 Ratios' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setGalleryMode(mode.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      galleryMode === mode.id
                        ? 'bg-surface-1 text-text border border-border'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                {(
                  [
                    { id: 'standard', label: 'Standard' },
                    { id: 'bengali', label: 'Bengali' },
                    { id: 'long', label: 'Very long text' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGalleryVariant(item.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      galleryVariant === item.id
                        ? 'bg-surface-1 text-text border border-border'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <select
                value={galleryFilter}
                onChange={(e) =>
                  setGalleryFilter(e.target.value as LayoutName | 'all')
                }
                aria-label="Filter gallery by layout"
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-text"
              >
                <option value="all">All {allLayouts.length} layouts</option>
                {allLayouts.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-6">
            {filteredLayouts.map((layoutDef) => (
              <div
                key={layoutDef.name}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1/50 p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-text">
                      {layoutDef.label}
                    </h3>
                    <span className="text-xs text-text-secondary">
                      {layoutDef.description}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-text-muted">
                    variants: {layoutDef.variants.join(' | ')}
                  </span>
                </div>

                {galleryMode === 'variants' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {layoutDef.variants.map((vKey) => (
                      <GalleryCell
                        key={`${layoutDef.name}-var-${vKey}`}
                        layout={layoutDef.name}
                        label={`${layoutDef.label} · Variant ${vKey.toUpperCase()}`}
                        format="9:16"
                        variant={galleryVariant}
                        palette={selectedPaletteForSelect}
                        mood={activeSpec.theme.mood}
                        style={activeSpec.style}
                        intensity={activeSpec.intensity}
                        layoutVariant={vKey}
                        seed={activeSpec.seed}
                        fontsReadyTick={fontsReadyTick}
                        onSelectSpec={handleLoadFromGallery}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {FORMAT_OPTIONS.map((fmt) => (
                      <GalleryCell
                        key={`${layoutDef.name}-${fmt}`}
                        layout={layoutDef.name}
                        label={layoutDef.label}
                        format={fmt}
                        variant={galleryVariant}
                        palette={selectedPaletteForSelect}
                        mood={activeSpec.theme.mood}
                        style={activeSpec.style}
                        intensity={activeSpec.intensity}
                        seed={activeSpec.seed}
                        fontsReadyTick={fontsReadyTick}
                        onSelectSpec={handleLoadFromGallery}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
