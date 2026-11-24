'use client';

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Thumbnail } from '@remotion/player';
import { splitGraphemes } from '../anim';
import { ensureFonts } from '../fonts';
import { VideoFromSpec, type VideoFromSpecProps } from '../render';
import {
  computeSceneTimings,
  getSpecDimensions,
  totalFrames,
  type NormalizedSceneSpec,
  type VideoSpec,
} from '../spec';
import {
  SAFE_AREAS,
  containsBengali,
  getContrastRatio,
  mixHex,
  normalizeHex,
  sizingUnit,
} from '../tokens';

export type AuditSeverity = 'error' | 'warn' | 'info';

export type AuditIssueCode =
  | 'TEXT_OVERFLOW'
  | 'OUT_OF_SAFE_AREA'
  | 'TEXT_OVERLAP'
  | 'TEXT_TOO_SMALL'
  | 'LOW_CONTRAST'
  | 'LOW_COVERAGE'
  | 'EMPTY_ENTRY'
  | 'TOO_MANY_NODES'
  | 'RHYTHM'
  | 'REPEAT'
  | 'DURATION_MISMATCH'
  | 'MISSING_GLYPH';

export interface AuditIssue {
  id: string;
  code: AuditIssueCode;
  severity: AuditSeverity;
  sceneIndex: number | null;
  sceneId?: string;
  frame?: number;
  selector?: string;
  message: string;
  detail?: string;
  metric?: number;
}

export interface SceneAuditSummary {
  sceneIndex: number;
  sceneId: string;
  score: number;
  entryFrame: number;
  holdFrame: number;
  issueCount: number;
  coverageRatio: number;
  nodeCount: number;
}

export interface AuditReport {
  score: number;
  sceneScores: SceneAuditSummary[];
  issues: AuditIssue[];
  durationMs: number;
  targetSeconds?: number;
  actualSeconds: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface RunAuditOptions {
  targetSeconds?: number;
  changedSceneIndices?: number[];
  previousReport?: AuditReport;
}

interface CachedSceneResult {
  issues: AuditIssue[];
  coverageRatio: number;
  nodeCount: number;
}

const SCENE_AUDIT_CACHE = new Map<string, CachedSceneResult>();
const MAX_SCENE_CACHE_SIZE = 120;

export function clearAuditCache(): void {
  SCENE_AUDIT_CACHE.clear();
}

function hashStringFNV1a(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

export function computeSceneCacheKey(
  spec: VideoSpec,
  scene: NormalizedSceneSpec,
  sceneIndex: number
): string {
  return hashStringFNV1a(
    JSON.stringify({
      scene,
      sceneIndexIsFirst: sceneIndex === 0,
      format: spec.format,
      fps: spec.fps,
      style: spec.style,
      intensity: spec.intensity,
      seed: spec.seed,
      theme: spec.theme,
    })
  );
}

const SEVERITY_WEIGHT: Record<AuditSeverity, number> = {
  error: 12,
  warn: 5,
  info: 1,
};

const PER_CODE_CAP: Record<AuditSeverity, number> = {
  error: 24,
  warn: 15,
  info: 5,
};

export function computeAuditScore(issues: readonly AuditIssue[]): number {
  const codeTotals = new Map<AuditIssueCode, number>();
  for (const issue of issues) {
    const prev = codeTotals.get(issue.code) ?? 0;
    const weight = SEVERITY_WEIGHT[issue.severity];
    const cap = PER_CODE_CAP[issue.severity];
    codeTotals.set(issue.code, Math.min(cap, prev + weight));
  }
  let totalPenalty = 0;
  for (const val of codeTotals.values()) {
    totalPenalty += val;
  }
  return Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseCssColor(raw: string): RgbaColor | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1]))));
    const g = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2]))));
    const b = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3]))));
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? Number(rgbMatch[4].slice(0, -1)) / 100
        : Number(rgbMatch[4]);
      if (!Number.isFinite(a)) a = 1;
    }
    return { r, g, b, a: Math.max(0, Math.min(1, a)) };
  }

  if (trimmed.startsWith('#')) {
    const hex = normalizeHex(trimmed, '');
    if (hex.length === 7) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
        a: 1,
      };
    }
  }
  return null;
}

function rgbaToHex(c: RgbaColor): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r)))
    .toString(16)
    .padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(c.g)))
    .toString(16)
    .padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(c.b)))
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const alpha = fg.a;
  if (alpha >= 0.999) {
    return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  }
  if (alpha <= 0.001) {
    return bg;
  }
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

function extractGradientStops(bgImage: string): RgbaColor[] {
  if (!bgImage || bgImage === 'none') {
    return [];
  }
  const matches = bgImage.match(/rgba?\([^)]+\)/gi);
  if (!matches) {
    return [];
  }
  const stops: RgbaColor[] = [];
  for (const m of matches) {
    const parsed = parseCssColor(m);
    if (parsed && parsed.a > 0.01) {
      stops.push(parsed);
    }
  }
  return stops;
}

interface NormalizedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function toSceneRect(
  elRect: DOMRect,
  refRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number
): NormalizedRect {
  const scaleX = refRect.width > 0 ? refRect.width / canvasWidth : 1;
  const scaleY = refRect.height > 0 ? refRect.height / canvasHeight : 1;
  const left = (elRect.left - refRect.left) / scaleX;
  const top = (elRect.top - refRect.top) / scaleY;
  const right = (elRect.right - refRect.left) / scaleX;
  const bottom = (elRect.bottom - refRect.top) / scaleY;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function rectsOverlapArea(a: NormalizedRect, b: NormalizedRect): {
  ix: number;
  iy: number;
  areaRatio: number;
} {
  const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const minArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return {
    ix,
    iy,
    areaRatio: (ix * iy) / minArea,
  };
}

function findSceneElements(
  host: HTMLElement,
  sceneIndex: number
): {
  sceneRoot: HTMLElement | null;
  cameraLayer: HTMLElement | null;
  contentNodes: HTMLElement[];
  textTargets: HTMLElement[];
  visibleContentEls: HTMLElement[];
} {
  const tagged = Array.from(
    host.querySelectorAll<HTMLElement>(`[data-kit-scene="${sceneIndex}"]`)
  );
  if (tagged.length === 0) {
    return {
      sceneRoot: null,
      cameraLayer: null,
      contentNodes: [],
      textTargets: [],
      visibleContentEls: [],
    };
  }

  const bgEl =
    tagged.find((el) => el.getAttribute('data-kit') === 'bg') ?? null;
  const sceneRoot = bgEl?.parentElement ?? tagged[0].parentElement ?? null;

  let cameraLayer: HTMLElement | null = null;
  if (sceneRoot) {
    const children = Array.from(sceneRoot.children) as HTMLElement[];
    cameraLayer =
      children.find(
        (child) =>
          !child.hasAttribute('data-kit') &&
          child.querySelector('[data-kit-zone="content"]') !== null
      ) ??
      children.find(
        (child) =>
          !child.hasAttribute('data-kit') &&
          child.innerText.trim().length > 0
      ) ??
      null;
  }

  const contentNodes = tagged.filter(
    (el) => el.getAttribute('data-kit-zone') === 'content'
  );

  // Also detect unwrapped kinetic marquee text leaves when no tagged content primitives exist
  const extraTextLeaves: HTMLElement[] = [];
  if (cameraLayer && contentNodes.length === 0) {
    const allDescendants = Array.from(
      cameraLayer.querySelectorAll<HTMLElement>('div, span')
    );
    for (const d of allDescendants) {
      if (
        d.children.length === 0 &&
        d.textContent &&
        d.textContent.trim().length > 0
      ) {
        extraTextLeaves.push(d);
      }
    }
  }

  const textTargets = [
    ...contentNodes.filter((el) => {
      const kind = el.getAttribute('data-kit');
      return (
        kind === 'text' ||
        kind === 'badge' ||
        kind === 'button' ||
        kind === 'counter'
      );
    }),
    ...extraTextLeaves,
  ];

  const visibleContentEls = [...contentNodes, ...extraTextLeaves].filter(
    (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      if (Number(style.opacity) <= 0.04) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    }
  );

  return {
    sceneRoot,
    cameraLayer,
    contentNodes,
    textTargets,
    visibleContentEls,
  };
}

function resolveWorstCaseBackgroundHexes(
  el: HTMLElement,
  sceneRoot: HTMLElement | null,
  elClientRect: DOMRect,
  fallbackBgHex: string
): string[] {
  const chain: HTMLElement[] = [];
  let cursor: HTMLElement | null = el;
  while (cursor) {
    chain.push(cursor);
    if (cursor === sceneRoot) {
      break;
    }
    cursor = cursor.parentElement;
  }
  chain.reverse(); // outer -> inner

  const baseParsed = parseCssColor(fallbackBgHex) ?? { r: 14, g: 11, b: 16, a: 1 };
  let candidates: RgbaColor[] = [baseParsed];

  // Include KitBackground layers behind element if overlapping center
  if (sceneRoot) {
    const bgEl = sceneRoot.querySelector<HTMLElement>('[data-kit="bg"]');
    if (bgEl) {
      const cx = (elClientRect.left + elClientRect.right) / 2;
      const cy = (elClientRect.top + elClientRect.bottom) / 2;
      const bgStyle = window.getComputedStyle(bgEl);
      const bgCol = parseCssColor(bgStyle.backgroundColor);
      if (bgCol && bgCol.a > 0.01) {
        candidates = candidates.map((c) => compositeOver(bgCol, c));
      }
      const bgStops = extractGradientStops(bgStyle.backgroundImage);
      if (bgStops.length > 0) {
        const next: RgbaColor[] = [];
        for (const base of candidates) {
          for (const stop of bgStops) {
            next.push(compositeOver(stop, base));
          }
        }
        candidates = next.slice(0, 8);
      }

      // Check overlapping non-SVG overlay blocks inside KitBackground (e.g. mesh-glow, color-blocks, aurora)
      const bgKids = Array.from(bgEl.querySelectorAll<HTMLElement>('div'));
      for (const kid of bgKids) {
        const kr = kid.getBoundingClientRect();
        if (
          cx >= kr.left &&
          cx <= kr.right &&
          cy >= kr.top &&
          cy <= kr.bottom
        ) {
          const ks = window.getComputedStyle(kid);
          const kc = parseCssColor(ks.backgroundColor);
          if (kc && kc.a > 0.05) {
            candidates = candidates.map((c) => compositeOver(kc, c));
          }
          const kStops = extractGradientStops(ks.backgroundImage);
          if (kStops.length > 0) {
            const strong = kStops.filter((s) => s.a > 0.15);
            if (strong.length > 0) {
              const next: RgbaColor[] = [];
              for (const base of candidates) {
                for (const s of strong) {
                  next.push(compositeOver(s, base));
                }
              }
              candidates = next.slice(0, 8);
            }
          }
        }
      }
    }
  }

  for (const node of chain) {
    const style = window.getComputedStyle(node);
    const col = parseCssColor(style.backgroundColor);
    if (col && col.a > 0.01) {
      candidates = candidates.map((c) => compositeOver(col, c));
    }
    const stops = extractGradientStops(style.backgroundImage);
    if (stops.length > 0) {
      const next: RgbaColor[] = [];
      for (const base of candidates) {
        for (const s of stops) {
          next.push(compositeOver(s, base));
        }
      }
      candidates = next.slice(0, 8);
    }
  }

  return Array.from(new Set(candidates.map(rgbaToHex)));
}

let sharedTofuCanvas: HTMLCanvasElement | null = null;
let sharedTofuCtx: CanvasRenderingContext2D | null = null;

function getTofuCheckContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (!sharedTofuCanvas) {
    sharedTofuCanvas = document.createElement('canvas');
    sharedTofuCanvas.width = 36;
    sharedTofuCanvas.height = 36;
    sharedTofuCtx = sharedTofuCanvas.getContext('2d', {
      willReadFrequently: true,
    });
  }
  return sharedTofuCtx;
}

function glyphInkSignature(
  ctx: CanvasRenderingContext2D,
  ch: string,
  fontSpec: string
): string {
  ctx.clearRect(0, 0, 36, 36);
  ctx.font = fontSpec;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(ch, 2, 2);
  const data = ctx.getImageData(0, 0, 36, 36).data;
  let nonZero = 0;
  let hash = 2166136261;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a > 16) {
      nonZero++;
      hash ^= (i * 31 + a) & 0xff;
      hash = Math.imul(hash, 16777619);
    }
  }
  if (nonZero === 0) {
    return 'empty';
  }
  return `${nonZero}:${(hash >>> 0).toString(36)}`;
}

function detectMissingGlyph(
  text: string,
  fontFamily: string,
  fontWeight: string
): string | null {
  if (!text || text.trim().length === 0) {
    return null;
  }
  if (text.includes('\uFFFD')) {
    return 'U+FFFD replacement glyph present';
  }

  if (typeof document !== 'undefined' && 'fonts' in document && fontFamily) {
    try {
      const ok = document.fonts.check(
        `${fontWeight || '600'} 24px ${fontFamily}`,
        text.slice(0, 24)
      );
      if (!ok && containsBengali(text)) {
        return `Font face not ready for Bengali glyphs in "${fontFamily}"`;
      }
    } catch {
      // Ignore invalid font check syntax
    }
  }

  const ctx = getTofuCheckContext();
  if (!ctx) {
    return null;
  }

  const fontSpec = `${fontWeight || '600'} 24px ${fontFamily || 'sans-serif'}`;
  const notdefSig = glyphInkSignature(ctx, '\uFFFF', fontSpec);
  const graphemes = splitGraphemes(text);
  const tested = new Set<string>();

  for (const g of graphemes) {
    if (!g || /^\s+$/.test(g)) {
      continue;
    }
    if (tested.has(g) || tested.size >= 36) {
      continue;
    }
    tested.add(g);
    const sig = glyphInkSignature(ctx, g, fontSpec);
    if (sig === 'empty') {
      return `Blank/missing glyph for "${g}"`;
    }
    if (notdefSig !== 'empty' && sig === notdefSig) {
      return `Tofu (.notdef) glyph detected for "${g}"`;
    }
  }

  return null;
}

function countSceneContentNodes(sceneRoot: HTMLElement): number {
  const all = Array.from(sceneRoot.querySelectorAll('*'));
  let count = 0;
  for (const node of all) {
    // Skip repeating dot/grid vector geometry inside the background layer
    const bgParent = node.closest('[data-kit="bg"]');
    if (bgParent && node !== bgParent && node.closest('svg')) {
      continue;
    }
    count++;
  }
  return count;
}

async function mountAndMeasureFrame(params: {
  root: Root;
  host: HTMLElement;
  spec: VideoSpec;
  frame: number;
  durationInFrames: number;
  width: number;
  height: number;
  sceneIndex: number;
}): Promise<ReturnType<typeof findSceneElements>> {
  const { root, host, spec, frame, durationInFrames, width, height, sceneIndex } =
    params;

  const ThumbnailForSpec = Thumbnail as unknown as React.ComponentType<{
    component: React.ComponentType<VideoFromSpecProps>;
    inputProps: VideoFromSpecProps;
    frameToDisplay: number;
    durationInFrames: number;
    compositionWidth: number;
    compositionHeight: number;
    fps: number;
    noSuspense?: boolean;
    style?: React.CSSProperties;
  }>;

  root.render(
    React.createElement(ThumbnailForSpec, {
      component: VideoFromSpec,
      inputProps: { spec, disableAudio: true },
      frameToDisplay: frame,
      durationInFrames,
      compositionWidth: width,
      compositionHeight: height,
      fps: spec.fps,
      noSuspense: true,
      style: { width, height },
    })
  );

  // Give React 19 + ResizeObserver + useDelayRender microtasks time to settle
  const deadline = performance.now() + 900;
  let found = findSceneElements(host, sceneIndex);
  while (performance.now() < deadline) {
    await nextAnimationFrame();
    found = findSceneElements(host, sceneIndex);
    if (found.sceneRoot) {
      break;
    }
  }
  // One extra rAF for fitted text & computed styles to stabilize cleanly
  await nextAnimationFrame();
  return findSceneElements(host, sceneIndex);
}

export async function runAudit(
  spec: VideoSpec,
  options: RunAuditOptions = {}
): Promise<AuditReport> {
  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timings = computeSceneTimings(spec);
  const dims = getSpecDimensions(spec);
  const totalF = totalFrames(spec);
  const actualSeconds = Math.round((totalF / (spec.fps || 30)) * 10) / 10;
  const safe = SAFE_AREAS[spec.format];
  const u = sizingUnit(dims.width, dims.height);

  const hasBengali = containsBengali(JSON.stringify(spec.scenes));
  await ensureFonts({ timeoutMs: 4500, hasBengali });

  const changedSet = options.changedSceneIndices
    ? new Set(options.changedSceneIndices)
    : null;

  const sceneIssuesByIdx = new Map<number, AuditIssue[]>();
  const sceneSummaries: SceneAuditSummary[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  let host: HTMLElement | null = null;
  let root: Root | null = null;

  try {
    for (let i = 0; i < timings.length; i++) {
      const timing = timings[i];
      const scene = timing.scene;
      const entryFrame = Math.min(
        timing.startFrame + Math.min(8, Math.max(0, timing.durationInFrames - 1)),
        totalF - 1
      );
      const holdFrame = Math.min(
        timing.startFrame + Math.round(timing.durationInFrames * 0.7),
        totalF - 1
      );

      const cacheKey = computeSceneCacheKey(spec, scene, i);
      const canUseCache =
        (!changedSet || !changedSet.has(i)) && SCENE_AUDIT_CACHE.has(cacheKey);

      if (canUseCache) {
        const cached = SCENE_AUDIT_CACHE.get(cacheKey)!;
        cacheHits++;
        const remappedIssues = cached.issues.map((issue, k) => ({
          ...issue,
          id: `${issue.code}-s${i}-${k}`,
          sceneIndex: i,
          sceneId: scene.id,
          frame: issue.code === 'EMPTY_ENTRY' ? entryFrame : holdFrame,
        }));
        sceneIssuesByIdx.set(i, remappedIssues);
        sceneSummaries.push({
          sceneIndex: i,
          sceneId: scene.id,
          score: computeAuditScore(remappedIssues),
          entryFrame,
          holdFrame,
          issueCount: remappedIssues.length,
          coverageRatio: cached.coverageRatio,
          nodeCount: cached.nodeCount,
        });
        continue;
      }

      if (typeof document === 'undefined') {
        cacheMisses++;
        sceneIssuesByIdx.set(i, []);
        sceneSummaries.push({
          sceneIndex: i,
          sceneId: scene.id,
          score: 100,
          entryFrame,
          holdFrame,
          issueCount: 0,
          coverageRatio: 1,
          nodeCount: 0,
        });
        continue;
      }

      if (!host) {
        host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.setAttribute('data-kit-audit-host', 'true');
        host.style.position = 'fixed';
        host.style.left = '-10000px';
        host.style.top = '0px';
        host.style.width = `${dims.width}px`;
        host.style.height = `${dims.height}px`;
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
        host.style.overflow = 'hidden';
        document.body.appendChild(host);
        root = createRoot(host);
      }

      cacheMisses++;
      const issues: AuditIssue[] = [];

      // 1) Entry frame check (especially scene 0 blank frame / delayed content)
      const entryDom = await mountAndMeasureFrame({
        root: root!,
        host,
        spec,
        frame: entryFrame,
        durationInFrames: totalF,
        width: dims.width,
        height: dims.height,
        sceneIndex: i,
      });

      const hasVisibleEntry =
        entryDom.visibleContentEls.length > 0 ||
        (entryDom.cameraLayer?.innerText.trim().length ?? 0) > 0;

      if (i === 0 && !hasVisibleEntry) {
        issues.push({
          id: `EMPTY_ENTRY-s${i}`,
          code: 'EMPTY_ENTRY',
          severity: 'error',
          sceneIndex: i,
          sceneId: scene.id,
          frame: entryFrame,
          message: `Scene 1 (${scene.layout}) has an empty first frame`,
          detail: 'Zero visible content elements at entry frame.',
        });
      }

      // 2) Hold frame checks (~70% into scene duration)
      const holdDom = await mountAndMeasureFrame({
        root: root!,
        host,
        spec,
        frame: holdFrame,
        durationInFrames: totalF,
        width: dims.width,
        height: dims.height,
        sceneIndex: i,
      });

      const hostRect = host.getBoundingClientRect();
      const refRect = holdDom.cameraLayer
        ? holdDom.cameraLayer.getBoundingClientRect()
        : hostRect;

      const effectiveScale =
        refRect.width > 0 ? refRect.width / dims.width : 1;

      const nodeCount = holdDom.sceneRoot
        ? countSceneContentNodes(holdDom.sceneRoot)
        : 0;

      if (nodeCount > 60) {
        issues.push({
          id: `TOO_MANY_NODES-s${i}`,
          code: 'TOO_MANY_NODES',
          severity: 'warn',
          sceneIndex: i,
          sceneId: scene.id,
          frame: holdFrame,
          metric: nodeCount,
          message: `Scene ${i + 1} (${scene.layout}) has ${nodeCount} DOM/SVG nodes`,
          detail: 'Exceeds recommended cap of 60 nodes per scene.',
        });
      }

      // Text overflow, tiny font, contrast, missing glyph
      const reportedCodesThisScene = new Set<string>();
      const pushSceneIssueOnce = (key: string, issue: AuditIssue) => {
        if (reportedCodesThisScene.has(key)) {
          return;
        }
        reportedCodesThisScene.add(key);
        issues.push(issue);
      };

      const minFontPx = Math.round(2.4 * u * 10) / 10;

      for (let tIdx = 0; tIdx < holdDom.textTargets.length; tIdx++) {
        const el = holdDom.textTargets[tIdx];
        const compStyle = window.getComputedStyle(el);
        const opacity = Number(compStyle.opacity);
        const clientRect = el.getBoundingClientRect();
        if (
          compStyle.display === 'none' ||
          compStyle.visibility === 'hidden' ||
          opacity <= 0.04 ||
          clientRect.width <= 1 ||
          clientRect.height <= 1
        ) {
          continue;
        }

        const rawText = (el.textContent ?? '').trim();
        const isMarqueeRow = scene.layout === 'kinetic' && scene.variant === 'b';
        const computedFontPx = parseFloat(compStyle.fontSize) || 0;
        const isTruncated = el.getAttribute('data-kit-truncated') === 'true';
        const widthTolerance = Math.max(6, Math.round(computedFontPx * 0.14));
        const heightTolerance = Math.max(8, Math.round(computedFontPx * 0.36));
        const overflowW =
          !isMarqueeRow &&
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + widthTolerance;
        const overflowH =
          el.clientHeight > 0 &&
          el.scrollHeight > el.clientHeight + heightTolerance &&
          compStyle.overflow !== 'visible';

        // Check overflow against any clipped ancestor container
        let parentClipped = false;
        let pCursor = el.parentElement;
        while (pCursor && pCursor !== holdDom.sceneRoot) {
          const pStyle = window.getComputedStyle(pCursor);
          if (pStyle.overflow === 'hidden' || pStyle.overflowX === 'hidden' || pStyle.overflowY === 'hidden') {
            const pr = pCursor.getBoundingClientRect();
            if (
              clientRect.left < pr.left - 3 ||
              clientRect.right > pr.right + 3 ||
              clientRect.top < pr.top - 3 ||
              clientRect.bottom > pr.bottom + 3
            ) {
              // Exempt kinetic scrolling marquee rows which intentionally scroll inside viewport overflow
              if (!isMarqueeRow) {
                parentClipped = true;
              }
            }
          }
          pCursor = pCursor.parentElement;
        }

        if (isTruncated || overflowW || overflowH || parentClipped) {
          pushSceneIssueOnce(`TEXT_OVERFLOW:${tIdx}`, {
            id: `TEXT_OVERFLOW-s${i}-${tIdx}`,
            code: 'TEXT_OVERFLOW',
            severity: 'error',
            sceneIndex: i,
            sceneId: scene.id,
            frame: holdFrame,
            selector: `[data-kit-scene="${i}"]`,
            message: `Text overflow in Scene ${i + 1} (${scene.layout})`,
            detail: isTruncated
              ? `"${rawText.slice(0, 42)}" was truncated at minimum font size.`
              : `Text box exceeds available width/height for "${rawText.slice(0, 42)}".`,
          });
        }

        // Font size check (pre-camera composition pixels)
        const effectiveFontPx = computedFontPx / (effectiveScale || 1);
        if (effectiveFontPx > 0 && effectiveFontPx < minFontPx && rawText.length > 0) {
          pushSceneIssueOnce('TEXT_TOO_SMALL', {
            id: `TEXT_TOO_SMALL-s${i}-${tIdx}`,
            code: 'TEXT_TOO_SMALL',
            severity: 'error',
            sceneIndex: i,
            sceneId: scene.id,
            frame: holdFrame,
            metric: Math.round(effectiveFontPx),
            message: `Tiny text (${Math.round(effectiveFontPx)}px < ${Math.ceil(minFontPx)}px) in Scene ${i + 1}`,
            detail: `"${rawText.slice(0, 40)}" is below 2.4u minimum legible size.`,
          });
        }

        // Contrast check against real composited background + gradient stops
        if (rawText.length > 0) {
          const fgParsed = parseCssColor(compStyle.color);
          if (fgParsed) {
            const bgHexes = resolveWorstCaseBackgroundHexes(
              el,
              holdDom.sceneRoot,
              clientRect,
              spec.theme.palette.bg
            );
            let worstContrast = Infinity;
            let worstBgHex = bgHexes[0] ?? spec.theme.palette.bg;

            // Composite translucent text color if opacity < 1
            for (const bgHex of bgHexes) {
              const bgRgba = parseCssColor(bgHex) ?? {
                r: 14,
                g: 11,
                b: 16,
                a: 1,
              };
              const effectiveFgHex = rgbaToHex(
                compositeOver({ ...fgParsed, a: fgParsed.a * opacity }, bgRgba)
              );
              const ratio = getContrastRatio(effectiveFgHex, bgHex);
              if (ratio < worstContrast) {
                worstContrast = ratio;
                worstBgHex = bgHex;
              }
            }

            const fontWeightNum = Number(compStyle.fontWeight) || 400;
            const isLargeOrBoldDisplay =
              (fontWeightNum >= 700 && effectiveFontPx >= 28) ||
              effectiveFontPx >= 48;
            const minRequired = isLargeOrBoldDisplay ? 3.0 : 4.5;

            if (worstContrast < minRequired) {
              const fgHex = rgbaToHex(fgParsed);
              pushSceneIssueOnce(`LOW_CONTRAST:${fgHex}:${worstBgHex}`, {
                id: `LOW_CONTRAST-s${i}-${tIdx}`,
                code: 'LOW_CONTRAST',
                severity: 'error',
                sceneIndex: i,
                sceneId: scene.id,
                frame: holdFrame,
                metric: Math.round(worstContrast * 10) / 10,
                message: `Low contrast (${worstContrast.toFixed(1)}:1 < ${minRequired}:1) in Scene ${i + 1}`,
                detail: `${fgHex} over ${worstBgHex} on "${rawText.slice(0, 32)}".`,
              });
            }
          }

          // Missing glyph / tofu check
          const glyphErr = detectMissingGlyph(
            rawText,
            compStyle.fontFamily,
            compStyle.fontWeight
          );
          if (glyphErr) {
            pushSceneIssueOnce('MISSING_GLYPH', {
              id: `MISSING_GLYPH-s${i}-${tIdx}`,
              code: 'MISSING_GLYPH',
              severity: 'error',
              sceneIndex: i,
              sceneId: scene.id,
              frame: holdFrame,
              message: `Missing glyph in Scene ${i + 1} (${scene.layout})`,
              detail: glyphErr,
            });
          }
        }
      }

      // Safe-area check on visible content elements (normalized to pre-camera coords)
      const safeRight = dims.width - safe.right;
      const safeBottom = dims.height - safe.bottom;
      const sceneContentRects: Array<{
        el: HTMLElement;
        rect: NormalizedRect;
        isTextGroup: boolean;
      }> = [];

      for (let vIdx = 0; vIdx < holdDom.visibleContentEls.length; vIdx++) {
        const el = holdDom.visibleContentEls[vIdx];
        const nr = toSceneRect(
          el.getBoundingClientRect(),
          refRect,
          dims.width,
          dims.height
        );

        // Exempt kinetic horizontal scrolling marquee strips from left/right safe check
        const isMarqueeRow = scene.layout === 'kinetic' && scene.variant === 'b';
        const outLeft = !isMarqueeRow && nr.left < safe.left - 6;
        const outRight = !isMarqueeRow && nr.right > safeRight + 6;
        const outTop = nr.top < safe.top - 6;
        const outBottom = nr.bottom > safeBottom + 6;

        if (outLeft || outRight || outTop || outBottom) {
          pushSceneIssueOnce('OUT_OF_SAFE_AREA', {
            id: `OUT_OF_SAFE_AREA-s${i}-${vIdx}`,
            code: 'OUT_OF_SAFE_AREA',
            severity: 'error',
            sceneIndex: i,
            sceneId: scene.id,
            frame: holdFrame,
            message: `Element outside safe margins in Scene ${i + 1} (${scene.layout})`,
            detail: `Box [${Math.round(nr.left)}, ${Math.round(nr.top)}, ${Math.round(nr.right)}, ${Math.round(nr.bottom)}] exceeds ${spec.format} safe bounds.`,
          });
        }

        const kind = el.getAttribute('data-kit');
        const isTextGroup =
          kind === 'text' ||
          kind === 'badge' ||
          kind === 'button' ||
          kind === 'counter';

        sceneContentRects.push({ el, rect: nr, isTextGroup });
      }

      // Overlap check (text vs text, text vs button|badge|counter, excluding ancestors)
      const textBoxes = sceneContentRects.filter((item) => item.isTextGroup);
      let overlapFound = false;
      for (let a = 0; a < textBoxes.length && !overlapFound; a++) {
        for (let b = a + 1; b < textBoxes.length; b++) {
          const boxA = textBoxes[a];
          const boxB = textBoxes[b];
          if (boxA.el.contains(boxB.el) || boxB.el.contains(boxA.el)) {
            continue;
          }
          const { ix, iy, areaRatio } = rectsOverlapArea(boxA.rect, boxB.rect);
          if (ix > 4 && iy > 4 && areaRatio > 0.02) {
            overlapFound = true;
            issues.push({
              id: `TEXT_OVERLAP-s${i}`,
              code: 'TEXT_OVERLAP',
              severity: 'error',
              sceneIndex: i,
              sceneId: scene.id,
              frame: holdFrame,
              metric: Math.round(areaRatio * 100),
              message: `Overlapping text/controls in Scene ${i + 1} (${scene.layout})`,
              detail: `"${(boxA.el.textContent ?? '').trim().slice(0, 24)}" overlaps "${(boxB.el.textContent ?? '').trim().slice(0, 24)}" (${Math.round(areaRatio * 100)}%).`,
            });
            break;
          }
        }
      }

      // Coverage check (visible content union height / safe height)
      let coverageRatio = 0;
      if (sceneContentRects.length > 0) {
        let minTop = Infinity;
        let maxBottom = -Infinity;
        for (const item of sceneContentRects) {
          minTop = Math.min(minTop, item.rect.top);
          maxBottom = Math.max(maxBottom, item.rect.bottom);
        }
        const safeH = Math.max(1, dims.height - safe.top - safe.bottom);
        coverageRatio = Math.max(0, Math.min(1, (maxBottom - minTop) / safeH));
      }

      const minCoverage = spec.format === '9:16' ? 0.35 : 0.3;
      if (
        scene.layout !== 'lower-third' &&
        (hasVisibleEntry || holdDom.visibleContentEls.length > 0) &&
        coverageRatio < minCoverage
      ) {
        issues.push({
          id: `LOW_COVERAGE-s${i}`,
          code: 'LOW_COVERAGE',
          severity: 'warn',
          sceneIndex: i,
          sceneId: scene.id,
          frame: holdFrame,
          metric: Math.round(coverageRatio * 100),
          message: `Small content footprint (${Math.round(coverageRatio * 100)}% < ${Math.round(minCoverage * 100)}%) in Scene ${i + 1}`,
          detail: `Layout "${scene.layout}" fills under ${Math.round(minCoverage * 100)}% of safe height.`,
        });
      }

      // Also check if an interior scene is completely empty even at hold frame
      if (
        i > 0 &&
        holdDom.visibleContentEls.length === 0 &&
        (holdDom.cameraLayer?.innerText.trim().length ?? 0) === 0
      ) {
        issues.push({
          id: `EMPTY_ENTRY-s${i}`,
          code: 'EMPTY_ENTRY',
          severity: 'error',
          sceneIndex: i,
          sceneId: scene.id,
          frame: holdFrame,
          message: `Scene ${i + 1} (${scene.layout}) rendered zero visible content`,
          detail: 'Scene has no visible text or graphic elements.',
        });
      }

      if (SCENE_AUDIT_CACHE.size >= MAX_SCENE_CACHE_SIZE) {
        const firstKey = SCENE_AUDIT_CACHE.keys().next().value;
        if (firstKey) {
          SCENE_AUDIT_CACHE.delete(firstKey);
        }
      }
      SCENE_AUDIT_CACHE.set(cacheKey, {
        issues,
        coverageRatio,
        nodeCount,
      });

      sceneIssuesByIdx.set(i, issues);
      sceneSummaries.push({
        sceneIndex: i,
        sceneId: scene.id,
        score: computeAuditScore(issues),
        entryFrame,
        holdFrame,
        issueCount: issues.length,
        coverageRatio,
        nodeCount,
      });

      await yieldToBrowser();
    }
  } finally {
    if (root) {
      root.unmount();
    }
    if (host) {
      host.remove();
    }
  }

  // Video-wide structural checks (RHYTHM, REPEAT, DURATION_MISMATCH)
  const allIssues: AuditIssue[] = [];
  for (let i = 0; i < timings.length; i++) {
    const sIssues = sceneIssuesByIdx.get(i) ?? [];
    allIssues.push(...sIssues);
  }

  // RHYTHM: > 5 scenes all within 0.3s of each other
  if (spec.scenes.length > 5) {
    const durs = spec.scenes.map((s) => s.dur);
    const minDur = Math.min(...durs);
    const maxDur = Math.max(...durs);
    if (maxDur - minDur <= 0.3) {
      allIssues.push({
        id: 'RHYTHM-global',
        code: 'RHYTHM',
        severity: 'warn',
        sceneIndex: null,
        frame: 0,
        metric: Math.round((maxDur - minDur) * 10) / 10,
        message: `Monotonous pacing across ${spec.scenes.length} scenes`,
        detail: `All ${spec.scenes.length} scene durations fall within ${(maxDur - minDur).toFixed(1)}s (${minDur}s–${maxDur}s).`,
      });
    }
  }

  // REPEAT: identical layout+variant in adjacent scenes
  for (let i = 1; i < timings.length; i++) {
    const prev = timings[i - 1].scene;
    const curr = timings[i].scene;
    if (prev.layout === curr.layout && prev.variant === curr.variant) {
      const holdFrame = sceneSummaries[i]?.holdFrame ?? timings[i].startFrame;
      allIssues.push({
        id: `REPEAT-layout-s${i}`,
        code: 'REPEAT',
        severity: 'warn',
        sceneIndex: i,
        sceneId: curr.id,
        frame: holdFrame,
        message: `Repeated layout "${curr.layout}" (variant ${curr.variant}) in Scenes ${i} & ${i + 1}`,
        detail: 'Vary layout variant or layout type between adjacent scenes.',
      });
    }
  }

  // REPEAT: same transition 3 times in a row
  for (let i = 2; i < timings.length; i++) {
    const t0 = timings[i - 2].scene.transition;
    const t1 = timings[i - 1].scene.transition;
    const t2 = timings[i].scene.transition;
    if (t0 === t1 && t1 === t2) {
      allIssues.push({
        id: `REPEAT-trans-s${i}`,
        code: 'REPEAT',
        severity: 'warn',
        sceneIndex: i,
        sceneId: timings[i].scene.id,
        frame: timings[i].startFrame,
        message: `Same transition "${t2}" repeated 3 times in a row (Scenes ${i - 1}–${i + 1})`,
        detail: 'Mix transitions to maintain visual momentum.',
      });
    }
  }

  // DURATION_MISMATCH: > 1s away from targetSeconds
  if (
    options.targetSeconds !== undefined &&
    Number.isFinite(options.targetSeconds) &&
    options.targetSeconds > 0
  ) {
    const diff = Math.abs(actualSeconds - options.targetSeconds);
    if (diff > 1.0) {
      allIssues.push({
        id: 'DURATION_MISMATCH-global',
        code: 'DURATION_MISMATCH',
        severity: 'warn',
        sceneIndex: null,
        frame: 0,
        metric: Math.round(diff * 10) / 10,
        message: `Duration ${actualSeconds.toFixed(1)}s differs from target ${options.targetSeconds.toFixed(1)}s`,
        detail: `Off by ${diff.toFixed(1)}s (allowed tolerance ±1.0s).`,
      });
    }
  }

  // Fold scene-linked REPEAT warnings into scene summary issueCounts
  for (const issue of allIssues) {
    if (issue.code === 'REPEAT' && issue.sceneIndex !== null) {
      const summary = sceneSummaries[issue.sceneIndex];
      if (summary) {
        summary.issueCount++;
        const sceneOnlyIssues = allIssues.filter(
          (iss) => iss.sceneIndex === issue.sceneIndex
        );
        summary.score = computeAuditScore(sceneOnlyIssues);
      }
    }
  }

  // Ensure contrast helper usage doesn't leave unused imports
  void mixHex;

  const durationMs = Math.max(
    1,
    Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        startedAt
    )
  );

  return {
    score: computeAuditScore(allIssues),
    sceneScores: sceneSummaries,
    issues: allIssues,
    durationMs,
    ...(options.targetSeconds !== undefined
      ? { targetSeconds: options.targetSeconds }
      : {}),
    actualSeconds,
    cacheHits,
    cacheMisses,
  };
}
