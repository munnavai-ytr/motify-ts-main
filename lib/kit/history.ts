import { getOpsJsonSchema } from './ops';
import type { VideoSpec } from './spec';

export { getOpsJsonSchema };

export const MAX_HISTORY_ENTRIES = 50;

export interface HistoryEntry {
  spec: VideoSpec;
  label: string;
  timestamp: number;
}

export interface KitHistoryState {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
}

export function createHistoryState(
  initialSpec: VideoSpec,
  label: string = 'Initial spec'
): KitHistoryState {
  return {
    past: [],
    present: {
      spec: initialSpec,
      label,
      timestamp: Date.now(),
    },
    future: [],
  };
}

export function commitHistory(
  state: KitHistoryState,
  nextSpec: VideoSpec,
  label: string
): KitHistoryState {
  const nextPast = [...state.past, state.present];
  const trimmedPast =
    nextPast.length > MAX_HISTORY_ENTRIES
      ? nextPast.slice(nextPast.length - MAX_HISTORY_ENTRIES)
      : nextPast;

  return {
    past: trimmedPast,
    present: {
      spec: nextSpec,
      label,
      timestamp: Date.now(),
    },
    future: [],
  };
}

export function undoHistory(state: KitHistoryState): {
  state: KitHistoryState;
  entry: HistoryEntry | null;
} {
  if (state.past.length === 0) {
    return { state, entry: null };
  }
  const previous = state.past[state.past.length - 1];
  const nextPast = state.past.slice(0, state.past.length - 1);
  return {
    state: {
      past: nextPast,
      present: previous,
      future: [state.present, ...state.future].slice(0, MAX_HISTORY_ENTRIES),
    },
    entry: previous,
  };
}

export function redoHistory(state: KitHistoryState): {
  state: KitHistoryState;
  entry: HistoryEntry | null;
} {
  if (state.future.length === 0) {
    return { state, entry: null };
  }
  const next = state.future[0];
  const nextFuture = state.future.slice(1);
  const nextPast = [...state.past, state.present];
  return {
    state: {
      past:
        nextPast.length > MAX_HISTORY_ENTRIES
          ? nextPast.slice(nextPast.length - MAX_HISTORY_ENTRIES)
          : nextPast,
      present: next,
      future: nextFuture,
    },
    entry: next,
  };
}

export interface KitHistoryController {
  readonly current: HistoryEntry;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly entries: readonly HistoryEntry[];
  commit: (spec: VideoSpec, label: string) => HistoryEntry;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  getState: () => KitHistoryState;
}

export function createKitHistory(
  initialSpec: VideoSpec,
  initialLabel: string = 'Initial spec'
): KitHistoryController {
  let internal = createHistoryState(initialSpec, initialLabel);

  return {
    get current() {
      return internal.present;
    },
    get canUndo() {
      return internal.past.length > 0;
    },
    get canRedo() {
      return internal.future.length > 0;
    },
    get undoLabel() {
      return internal.past[internal.past.length - 1]?.label ?? null;
    },
    get redoLabel() {
      return internal.future[0]?.label ?? null;
    },
    get entries() {
      return [...internal.past, internal.present];
    },
    commit(spec: VideoSpec, label: string) {
      internal = commitHistory(internal, spec, label);
      return internal.present;
    },
    undo() {
      const res = undoHistory(internal);
      internal = res.state;
      return res.entry;
    },
    redo() {
      const res = redoHistory(internal);
      internal = res.state;
      return res.entry;
    },
    getState() {
      return internal;
    },
  };
}

export function diffSpecs(a: VideoSpec, b: VideoSpec): string[] {
  const lines: string[] = [];

  if (a.title !== b.title) {
    lines.push(`Title: "${a.title}" → "${b.title}"`);
  }
  if (a.format !== b.format) {
    lines.push(`Format: ${a.format} → ${b.format}`);
  }
  if (a.style !== b.style) {
    lines.push(`Style: ${a.style} → ${b.style}`);
  }
  if (a.intensity !== b.intensity) {
    lines.push(`Intensity: ${a.intensity} → ${b.intensity}`);
  }
  if (a.seed !== b.seed) {
    lines.push(`Seed: ${a.seed} → ${b.seed}`);
  }
  if (a.theme.paletteName !== b.theme.paletteName) {
    lines.push(`Palette: ${a.theme.paletteName} → ${b.theme.paletteName}`);
  } else if (
    JSON.stringify(a.theme.palette) !== JSON.stringify(b.theme.palette)
  ) {
    lines.push('Theme colors updated');
  }
  if (a.theme.mood !== b.theme.mood) {
    lines.push(`Mood: ${a.theme.mood} → ${b.theme.mood}`);
  }
  if (a.transition !== b.transition) {
    lines.push(
      `Global transition: ${a.transition ?? 'auto'} → ${b.transition ?? 'auto'}`
    );
  }
  if (JSON.stringify(a.audio ?? null) !== JSON.stringify(b.audio ?? null)) {
    lines.push('Audio settings updated');
  }

  const aById = new Map(a.scenes.map((s, idx) => [s.id, { scene: s, idx }]));
  const bById = new Map(b.scenes.map((s, idx) => [s.id, { scene: s, idx }]));

  for (const [id, info] of aById.entries()) {
    if (!bById.has(id)) {
      lines.push(
        `Removed Scene #${info.idx + 1} (${info.scene.layout}, id=${id})`
      );
    }
  }

  for (const [id, bInfo] of bById.entries()) {
    const aInfo = aById.get(id);
    if (!aInfo) {
      lines.push(
        `Added Scene #${bInfo.idx + 1} (${bInfo.scene.layout}, id=${id})`
      );
      continue;
    }
    const scA = aInfo.scene;
    const scB = bInfo.scene;
    const label = `Scene #${bInfo.idx + 1} (${scB.layout})`;

    if (aInfo.idx !== bInfo.idx) {
      lines.push(
        `Moved ${label}: position #${aInfo.idx + 1} → #${bInfo.idx + 1}`
      );
    }
    if (scA.layout !== scB.layout) {
      lines.push(`${label}: layout ${scA.layout} → ${scB.layout}`);
    }
    if (scA.variant !== scB.variant) {
      lines.push(`${label}: variant ${scA.variant} → ${scB.variant}`);
    }
    if (scA.dur !== scB.dur) {
      lines.push(`${label}: duration ${scA.dur}s → ${scB.dur}s`);
    }
    if (scA.transition !== scB.transition) {
      lines.push(`${label}: transition ${scA.transition} → ${scB.transition}`);
    }
    if (scA.camera !== scB.camera) {
      lines.push(`${label}: camera ${scA.camera} → ${scB.camera}`);
    }
    if (scA.bg !== scB.bg) {
      lines.push(`${label}: background ${scA.bg} → ${scB.bg}`);
    }

    const slotKeys = new Set([
      ...Object.keys(scA.slots),
      ...Object.keys(scB.slots),
    ]);
    for (const key of slotKeys) {
      const valA = scA.slots[key];
      const valB = scB.slots[key];
      if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        if (valB === undefined) {
          lines.push(`${label}: removed slot "${key}"`);
        } else if (valA === undefined) {
          lines.push(`${label}: added slot "${key}"`);
        } else {
          lines.push(`${label}: updated slot "${key}"`);
        }
      }
    }
  }

  return lines;
}
