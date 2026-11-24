import {
  Noto_Sans_Bengali,
  Noto_Serif_Bengali,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Space_Grotesk,
} from 'next/font/google';
import { clearFitTextCache } from './fit';
import type { FontRole } from './tokens';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const notoSerifBengali = Noto_Serif_Bengali({
  subsets: ['bengali'],
  weight: ['400', '600', '700'],
  display: 'swap',
});

export interface KitFontDescriptor {
  id: string;
  label: string;
  script: 'latin' | 'bengali';
  roles: readonly FontRole[];
  family: string;
  className: string;
  weights: readonly number[];
  sample: string;
}

export const KIT_FONTS: readonly KitFontDescriptor[] = [
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    script: 'latin',
    roles: ['display', 'tech', 'serif'],
    family: plusJakartaSans.style.fontFamily,
    className: plusJakartaSans.className,
    weights: [400, 500, 600, 700, 800],
    sample: 'AaBbGg 0123456789',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    script: 'latin',
    roles: ['tech'],
    family: spaceGrotesk.style.fontFamily,
    className: spaceGrotesk.className,
    weights: [400, 500, 600, 700],
    sample: 'AaBbGg 0123456789',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    script: 'latin',
    roles: ['serif'],
    family: playfairDisplay.style.fontFamily,
    className: playfairDisplay.className,
    weights: [500, 700, 800],
    sample: 'AaBbGg 0123456789',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    script: 'latin',
    roles: ['friendly'],
    family: poppins.style.fontFamily,
    className: poppins.className,
    weights: [400, 600, 700, 800],
    sample: 'AaBbGg 0123456789',
  },
  {
    id: 'noto-sans-bengali',
    label: 'Noto Sans Bengali',
    script: 'bengali',
    roles: ['display', 'tech', 'friendly'],
    family: notoSansBengali.style.fontFamily,
    className: notoSansBengali.className,
    weights: [400, 500, 600, 700, 800],
    sample: 'অআইঈ কখগঘ ০১২৩',
  },
  {
    id: 'noto-serif-bengali',
    label: 'Noto Serif Bengali',
    script: 'bengali',
    roles: ['serif'],
    family: notoSerifBengali.style.fontFamily,
    className: notoSerifBengali.className,
    weights: [400, 600, 700],
    sample: 'অআইঈ কখগঘ ০১২৩',
  },
];

export const KIT_FONT_CLASS_NAMES = KIT_FONTS.map((f) => f.className).join(' ');

export function getFontFamilyStack(role: FontRole): string {
  switch (role) {
    case 'tech':
      return `${spaceGrotesk.style.fontFamily}, ${notoSansBengali.style.fontFamily}, system-ui, sans-serif`;
    case 'serif':
      return `${playfairDisplay.style.fontFamily}, ${notoSerifBengali.style.fontFamily}, Georgia, serif`;
    case 'friendly':
      return `${poppins.style.fontFamily}, ${notoSansBengali.style.fontFamily}, system-ui, sans-serif`;
    case 'display':
    default:
      return `${plusJakartaSans.style.fontFamily}, ${notoSansBengali.style.fontFamily}, system-ui, sans-serif`;
  }
}

export interface FontLoadResult {
  ready: boolean;
  timedOut: boolean;
  elapsedMs: number;
  loadedSpecs: number;
}

export interface EnsureFontsOptions {
  timeoutMs?: number;
  roles?: readonly FontRole[];
  hasBengali?: boolean;
}

const loadedCache = new Map<string, FontLoadResult>();
const inFlightCache = new Map<string, Promise<FontLoadResult>>();

export function getCachedFontLoadResult(): FontLoadResult | null {
  return loadedCache.get('ALL:bn') ?? Array.from(loadedCache.values())[0] ?? null;
}

export async function ensureFonts(
  options?: number | EnsureFontsOptions
): Promise<FontLoadResult> {
  const timeoutMs =
    typeof options === 'number'
      ? Math.min(4500, Math.max(200, options))
      : Math.min(4500, Math.max(200, options?.timeoutMs ?? 4500));

  const roles =
    typeof options === 'object' && options?.roles && options.roles.length > 0
      ? Array.from(new Set(options.roles)).sort()
      : null;

  const hasBengali =
    typeof options === 'object' && options?.hasBengali !== undefined
      ? options.hasBengali
      : true;

  if (typeof document === 'undefined' || !('fonts' in document)) {
    return {
      ready: true,
      timedOut: false,
      elapsedMs: 0,
      loadedSpecs: 0,
    };
  }

  const cacheKey = `${roles ? roles.join(',') : 'ALL'}:${hasBengali ? 'bn' : 'en'}`;
  const fullLoaded = loadedCache.get('ALL:bn');
  if (fullLoaded?.ready) {
    return fullLoaded;
  }
  const existing = loadedCache.get(cacheKey);
  if (existing?.ready) {
    return existing;
  }
  const inFlight = inFlightCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;

  const targetFonts = KIT_FONTS.filter((font) => {
    if (font.script === 'bengali' && !hasBengali) {
      return false;
    }
    if (roles && !font.roles.some((r) => roles.includes(r))) {
      return false;
    }
    return true;
  });

  const fontsToLoad = targetFonts.length > 0 ? targetFonts : KIT_FONTS;

  const promise = (async () => {
    const loadTasks: Array<Promise<FontFace[]>> = [];
    for (const font of fontsToLoad) {
      for (const weight of font.weights) {
        loadTasks.push(
          document.fonts
            .load(`${weight} 32px ${font.family}`, font.sample)
            .catch(() => [] as FontFace[])
        );
      }
    }

    let timedOut = false;
    let loadedSpecs = 0;

    const allLoads = Promise.allSettled([document.fonts.ready, ...loadTasks]).then(
      (results) => {
        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            loadedSpecs += res.value.length;
          }
        }
      }
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      allLoads,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    clearFitTextCache();

    const elapsedMs =
      typeof performance !== 'undefined'
        ? Math.round(performance.now() - startedAt)
        : 0;

    const result: FontLoadResult = {
      ready: true,
      timedOut,
      elapsedMs,
      loadedSpecs,
    };
    loadedCache.set(cacheKey, result);
    inFlightCache.delete(cacheKey);
    return result;
  })();

  inFlightCache.set(cacheKey, promise);
  return promise;
}

export interface FontProbeEntry {
  id: string;
  label: string;
  script: 'latin' | 'bengali';
  family: string;
  sample: string;
  loadedWeights: number[];
  expectedWeights: readonly number[];
}

export function probeKitFontFaces(): FontProbeEntry[] {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return KIT_FONTS.map((font) => ({
      id: font.id,
      label: font.label,
      script: font.script,
      family: font.family,
      sample: font.sample,
      loadedWeights: [],
      expectedWeights: font.weights,
    }));
  }

  return KIT_FONTS.map((font) => {
    const loadedWeights = font.weights.filter((weight) => {
      try {
        return document.fonts.check(`${weight} 24px ${font.family}`, font.sample);
      } catch {
        return false;
      }
    });
    return {
      id: font.id,
      label: font.label,
      script: font.script,
      family: font.family,
      sample: font.sample,
      loadedWeights,
      expectedWeights: font.weights,
    };
  });
}
