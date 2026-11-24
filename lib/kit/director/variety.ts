import type { VideoSpec } from '../spec';

export interface VarietyEntryInput {
  id: number | string;
  spec: VideoSpec;
  calls: number;
  usedRepair?: boolean;
  usedRevise?: boolean;
}

export interface VarietyReport {
  total: number;
  distinctStyles: number;
  distinctPalettes: number;
  distinctMoods: number;
  distinctLayoutSequences: number;
  uniquenessPercent: number;
  isLowVariety: boolean;
  repairOrReviseCount: number;
  avgCalls: number;
  styleNames: string[];
  paletteNames: string[];
  moodNames: string[];
}

function getPaletteKey(spec: VideoSpec): string {
  if (spec.theme.paletteName === 'custom') {
    return `custom:${spec.theme.palette.bg}:${spec.theme.palette.accent}`;
  }
  return spec.theme.paletteName;
}

export function formatLayoutSequence(
  spec: VideoSpec,
  abbreviated: boolean = true
): string {
  return spec.scenes
    .map((s) => {
      if (!abbreviated) return s.layout;
      switch (s.layout) {
        case 'hook':
          return 'hook';
        case 'title':
          return 'title';
        case 'feature':
          return 'feat';
        case 'stat':
          return 'stat';
        case 'list':
          return 'list';
        case 'steps':
          return 'step';
        case 'quote':
          return 'quot';
        case 'compare':
          return 'comp';
        case 'bars':
          return 'bars';
        case 'kinetic':
          return 'kin';
        case 'offer':
          return 'offr';
        case 'cta':
          return 'cta';
        case 'brand':
          return 'brnd';
        case 'lower-third':
          return 'l3rd';
        case 'custom':
          return 'cust';
        default:
          return s.layout;
      }
    })
    .join(' → ');
}

function buildFeatureSet(spec: VideoSpec): Set<string> {
  const set = new Set<string>([
    `style:${spec.style}`,
    `palette:${getPaletteKey(spec)}`,
    `mood:${spec.theme.mood}`,
    `intensity:${spec.intensity}`,
  ]);

  for (const scene of spec.scenes) {
    set.add(`layout:${scene.layout}`);
  }
  return set;
}

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return 1 - intersection / union;
}

export function computeVarietyReport(
  entries: readonly VarietyEntryInput[]
): VarietyReport {
  const total = entries.length;
  if (total === 0) {
    return {
      total: 0,
      distinctStyles: 0,
      distinctPalettes: 0,
      distinctMoods: 0,
      distinctLayoutSequences: 0,
      uniquenessPercent: 0,
      isLowVariety: false,
      repairOrReviseCount: 0,
      avgCalls: 0,
      styleNames: [],
      paletteNames: [],
      moodNames: [],
    };
  }

  const styles = new Set<string>();
  const palettes = new Set<string>();
  const moods = new Set<string>();
  const layoutSequences = new Set<string>();
  const featureSets: Array<Set<string>> = [];

  let repairOrReviseCount = 0;
  let totalCalls = 0;

  for (const entry of entries) {
    const { spec } = entry;
    styles.add(spec.style);
    palettes.add(getPaletteKey(spec));
    moods.add(spec.theme.mood);
    layoutSequences.add(spec.scenes.map((s) => s.layout).join('>'));
    featureSets.push(buildFeatureSet(spec));

    totalCalls += entry.calls;
    if (entry.calls > 1 || entry.usedRepair || entry.usedRevise) {
      repairOrReviseCount += 1;
    }
  }

  let uniquenessPercent = 100;
  if (total >= 2) {
    let pairCount = 0;
    let sumDistance = 0;
    for (let i = 0; i < featureSets.length; i++) {
      for (let j = i + 1; j < featureSets.length; j++) {
        sumDistance += jaccardDistance(featureSets[i], featureSets[j]);
        pairCount += 1;
      }
    }
    uniquenessPercent =
      pairCount > 0 ? Math.round((sumDistance / pairCount) * 100) : 100;
  }

  return {
    total,
    distinctStyles: styles.size,
    distinctPalettes: palettes.size,
    distinctMoods: moods.size,
    distinctLayoutSequences: layoutSequences.size,
    uniquenessPercent,
    isLowVariety: total >= 2 && uniquenessPercent < 60,
    repairOrReviseCount,
    avgCalls: Number((totalCalls / total).toFixed(2)),
    styleNames: Array.from(styles),
    paletteNames: Array.from(palettes),
    moodNames: Array.from(moods),
  };
}
