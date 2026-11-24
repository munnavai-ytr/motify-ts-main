import { KIT_ICON_NAMES } from '../elements';
import { STYLE_DEFS, describeStylesForAI } from '../styles';
import { MOODS, PALETTES } from '../tokens';
import { BarsLayout } from './bars';
import { BrandLayout } from './brand';
import { CompareLayout } from './compare';
import { CtaLayout } from './cta';
import { CustomLayout } from './custom';
import { FeatureLayout } from './feature';
import { HookLayout } from './hook';
import { KineticLayout } from './kinetic';
import { ListLayout } from './list';
import { LowerThirdLayout } from './lower-third';
import { OfferLayout } from './offer';
import { QuoteLayout } from './quote';
import { StatLayout } from './stat';
import { StepsLayout } from './steps';
import { TitleLayout } from './title';
import type { LayoutDefinition, LayoutName } from './types';

const LAYOUT_REGISTRY = new Map<LayoutName, LayoutDefinition>();

export function registerLayout(definition: LayoutDefinition): void {
  LAYOUT_REGISTRY.set(definition.name, definition);
}

const BUILTIN_LAYOUTS: readonly LayoutDefinition[] = [
  {
    name: 'hook',
    label: 'Hook',
    variants: ['a', 'b', 'c'],
    description:
      'High-impact opener with badge/icon, bold headline, accent rule, and optional subline.',
    defaultDurationSec: 2.5,
    slots: [
      {
        name: 'headline',
        required: true,
        type: 'string',
        maxChars: 55,
        description: 'Punchy 3-7 word opening hook (supports [[highlight]]).',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Short category/eyebrow badge.',
      },
      {
        name: 'sub',
        required: false,
        type: 'string',
        maxChars: 75,
        description: 'Supporting hook line.',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Lucide icon name from curated list.',
      },
    ],
    component: HookLayout,
  },
  {
    name: 'title',
    label: 'Title',
    variants: ['a', 'b', 'c'],
    description:
      'Editorial title card with kicker, headline, divider, subtitle, and optional tag.',
    defaultDurationSec: 4.0,
    slots: [
      {
        name: 'title',
        required: true,
        type: 'string',
        maxChars: 60,
        description: 'Main scene title (supports [[highlight]]).',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 30,
        description: 'Uppercase eyebrow text.',
      },
      {
        name: 'subtitle',
        required: false,
        type: 'string',
        maxChars: 90,
        description: 'Supporting subtitle.',
      },
      {
        name: 'tag',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Optional bottom tag badge.',
      },
    ],
    component: TitleLayout,
  },
  {
    name: 'feature',
    label: 'Feature',
    variants: ['a', 'b', 'c'],
    description:
      'Product or capability spotlight pairing copy with an icon highlight card.',
    defaultDurationSec: 3.5,
    slots: [
      {
        name: 'title',
        required: true,
        type: 'string',
        maxChars: 55,
        description: 'Feature headline (supports [[highlight]]).',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 26,
        description: 'Short feature pill label.',
      },
      {
        name: 'body',
        required: false,
        type: 'string',
        maxChars: 110,
        description: 'Concise 1-2 sentence explanation.',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Lucide icon name for feature emblem.',
      },
      {
        name: 'highlights',
        required: false,
        type: 'string[]',
        maxItems: 3,
        maxChars: 44,
        description: 'Up to 3 short checkmarked highlights.',
      },
    ],
    component: FeatureLayout,
  },
  {
    name: 'stat',
    label: 'Stat',
    variants: ['a', 'b', 'c'],
    description:
      'Hero KPI count-up card with tabular numerals, fitted progress ring or split layout, and delta badge.',
    defaultDurationSec: 3.0,
    slots: [
      {
        name: 'value',
        required: true,
        type: 'string',
        maxChars: 18,
        description: 'Metric value (e.g. "98.4%", "$120K", "10x", or number).',
      },
      {
        name: 'label',
        required: true,
        type: 'string',
        maxChars: 65,
        description: 'What the metric measures.',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Metric category label.',
      },
      {
        name: 'unit',
        required: false,
        type: 'string',
        maxChars: 12,
        description: 'Optional unit suffix appended during count-up.',
      },
      {
        name: 'delta',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Comparison/growth pill.',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Lucide icon name.',
      },
    ],
    component: StatLayout,
  },
  {
    name: 'list',
    label: 'List',
    variants: ['a', 'b', 'c'],
    description:
      'Staggered numbered, checkmarked, or bordered-row list with 2-5 concise items.',
    defaultDurationSec: 4.0,
    slots: [
      {
        name: 'title',
        required: true,
        type: 'string',
        maxChars: 50,
        description: 'List heading.',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Optional eyebrow text.',
      },
      {
        name: 'items',
        required: true,
        type: 'items[]',
        maxItems: 5,
        maxChars: 55,
        description: 'Array of strings or { title, detail?, icon? } rows (max 5).',
      },
    ],
    component: ListLayout,
  },
  {
    name: 'steps',
    label: 'Steps',
    variants: ['a', 'b'],
    description:
      'Numbered step-by-step process with drawing timeline connector or stacked accent step cards.',
    defaultDurationSec: 4.0,
    slots: [
      {
        name: 'heading',
        required: true,
        type: 'string',
        maxChars: 50,
        description: 'Steps heading.',
      },
      {
        name: 'items',
        required: true,
        type: 'items[]',
        maxItems: 5,
        maxChars: 55,
        description: 'Array of strings or { title, detail? } steps (max 5).',
      },
    ],
    component: StepsLayout,
  },
  {
    name: 'quote',
    label: 'Quote',
    variants: ['a', 'b'],
    description:
      'Editorial pull-quote with oversized quote mark or highlighted marker card and attribution.',
    defaultDurationSec: 3.5,
    slots: [
      {
        name: 'quote',
        required: true,
        type: 'string',
        maxChars: 110,
        description: 'Quote statement (supports [[highlight]]).',
      },
      {
        name: 'author',
        required: false,
        type: 'string',
        maxChars: 42,
        description: 'Quote attribution.',
      },
    ],
    component: QuoteLayout,
  },
  {
    name: 'compare',
    label: 'Compare',
    variants: ['a', 'b'],
    description:
      'Two-column Before/After or A vs B comparison with drawing divider or reveal wipe panel.',
    defaultDurationSec: 4.0,
    slots: [
      {
        name: 'leftTitle',
        required: true,
        type: 'string',
        maxChars: 28,
        description: 'Left/Before column heading.',
      },
      {
        name: 'rightTitle',
        required: true,
        type: 'string',
        maxChars: 28,
        description: 'Right/After column heading.',
      },
      {
        name: 'leftItems',
        required: true,
        type: 'string[]',
        maxItems: 4,
        maxChars: 40,
        description: 'Up to 4 short left column items.',
      },
      {
        name: 'rightItems',
        required: true,
        type: 'string[]',
        maxItems: 4,
        maxChars: 40,
        description: 'Up to 4 short right column items.',
      },
    ],
    component: CompareLayout,
  },
  {
    name: 'bars',
    label: 'Bars',
    variants: ['a', 'b'],
    description:
      'Vertical or horizontal animated bar chart with count-up values and highlighted peak bar.',
    defaultDurationSec: 3.5,
    slots: [
      {
        name: 'heading',
        required: true,
        type: 'string',
        maxChars: 50,
        description: 'Chart heading.',
      },
      {
        name: 'data',
        required: true,
        type: 'data[]',
        maxItems: 6,
        maxChars: 20,
        description: '3 to 6 { label, value } bars.',
      },
    ],
    component: BarsLayout,
  },
  {
    name: 'kinetic',
    label: 'Kinetic',
    variants: ['a', 'b'],
    description:
      'High-energy beat-synced giant word slams or dual scrolling kinetic marquee strips.',
    defaultDurationSec: 2.5,
    slots: [
      {
        name: 'words',
        required: true,
        type: 'string[]',
        maxItems: 8,
        maxChars: 22,
        description: '3 to 8 short punchy words or phrases.',
      },
    ],
    component: KineticLayout,
  },
  {
    name: 'offer',
    label: 'Offer',
    variants: ['a', 'b', 'c'],
    description:
      'Promotional offer card with badge, headline, hero price, crossed-out original price, code, and CTA.',
    defaultDurationSec: 3.5,
    slots: [
      {
        name: 'headline',
        required: true,
        type: 'string',
        maxChars: 55,
        description: 'Offer headline.',
      },
      {
        name: 'price',
        required: true,
        type: 'string',
        maxChars: 20,
        description: 'Promotional price or discount (e.g. "$29/mo", "50% OFF").',
      },
      {
        name: 'badge',
        required: false,
        type: 'string',
        maxChars: 24,
        description: 'Top promo badge.',
      },
      {
        name: 'originalPrice',
        required: false,
        type: 'string',
        maxChars: 20,
        description: 'Crossed-out original price.',
      },
      {
        name: 'details',
        required: false,
        type: 'string',
        maxChars: 80,
        description: 'Fine print or offer terms.',
      },
      {
        name: 'code',
        required: false,
        type: 'string',
        maxChars: 22,
        description: 'Promo code.',
      },
      {
        name: 'cta',
        required: false,
        type: 'string',
        maxChars: 24,
        description: 'Button label.',
      },
    ],
    component: OfferLayout,
  },
  {
    name: 'cta',
    label: 'CTA',
    variants: ['a', 'b', 'c'],
    description:
      'Closing call-to-action with headline, supporting copy, pulsing/shining action button, and URL.',
    defaultDurationSec: 3.0,
    slots: [
      {
        name: 'headline',
        required: true,
        type: 'string',
        maxChars: 55,
        description: 'Action-oriented headline (supports [[highlight]]).',
      },
      {
        name: 'buttonText',
        required: true,
        type: 'string',
        maxChars: 26,
        description: 'Primary CTA button text.',
      },
      {
        name: 'kicker',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Optional eyebrow text.',
      },
      {
        name: 'sub',
        required: false,
        type: 'string',
        maxChars: 80,
        description: 'Supporting copy.',
      },
      {
        name: 'url',
        required: false,
        type: 'string',
        maxChars: 42,
        description: 'Website or handle shown below CTA.',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Button trailing icon.',
      },
    ],
    component: CtaLayout,
  },
  {
    name: 'brand',
    label: 'Brand',
    variants: ['a', 'b', 'c'],
    description:
      'Clean brand emblem and wordmark reveal with tagline and website.',
    defaultDurationSec: 3.0,
    slots: [
      {
        name: 'brandName',
        required: true,
        type: 'string',
        maxChars: 36,
        description: 'Brand or channel name.',
      },
      {
        name: 'tagline',
        required: false,
        type: 'string',
        maxChars: 75,
        description: 'Brand positioning tagline.',
      },
      {
        name: 'badge',
        required: false,
        type: 'string',
        maxChars: 28,
        description: 'Optional stamp or credential badge.',
      },
      {
        name: 'url',
        required: false,
        type: 'string',
        maxChars: 42,
        description: 'Domain or social handle.',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Emblem Lucide icon.',
      },
    ],
    component: BrandLayout,
  },
  {
    name: 'lower-third',
    label: 'Lower Third',
    variants: ['a', 'b', 'c'],
    description:
      'Broadcast name & role card (bottom-left band, floating pill, or corner stamp; pairs with bg: "chroma").',
    defaultDurationSec: 5.0,
    slots: [
      {
        name: 'name',
        required: true,
        type: 'string',
        maxChars: 42,
        description: 'Speaker, guest, or topic name.',
      },
      {
        name: 'role',
        required: true,
        type: 'string',
        maxChars: 54,
        description: 'Title, role, or subtitle.',
      },
      {
        name: 'org',
        required: false,
        type: 'string',
        maxChars: 36,
        description: 'Optional organization appended to role.',
      },
      {
        name: 'tag',
        required: false,
        type: 'string',
        maxChars: 24,
        description: 'Optional top pill badge (e.g. LIVE, HOST).',
      },
      {
        name: 'icon',
        required: false,
        type: 'icon',
        description: 'Optional Lucide icon.',
      },
    ],
    component: LowerThirdLayout,
  },
  {
    name: 'custom',
    label: 'Custom',
    variants: ['a'],
    description:
      'Structured vertical stack of up to 5 typed blocks (kicker, heading, body, stat, badge, cta, divider).',
    defaultDurationSec: 3.5,
    slots: [
      {
        name: 'blocks',
        required: true,
        type: 'blocks[]',
        maxItems: 5,
        maxChars: 90,
        description:
          'Array of { kind: "kicker"|"heading"|"body"|"stat"|"badge"|"cta"|"divider", text, sub?, icon? }.',
      },
      {
        name: 'align',
        required: false,
        type: 'string',
        maxChars: 10,
        description: '"left" | "center" | "right".',
      },
    ],
    component: CustomLayout,
  },
];

for (const layout of BUILTIN_LAYOUTS) {
  registerLayout(layout);
}

export const LAYOUT_NAMES = BUILTIN_LAYOUTS.map((l) => l.name);

export function getLayoutDefinition(name: string): LayoutDefinition | undefined {
  return LAYOUT_REGISTRY.get(name as LayoutName);
}

export function getAllLayouts(): LayoutDefinition[] {
  return Array.from(LAYOUT_REGISTRY.values());
}

export { describeStylesForAI };

export function describeKitForAI(): string {
  const paletteList = Object.keys(PALETTES).join(', ');
  const moodList = Object.keys(MOODS).join(', ');
  const iconList = KIT_ICON_NAMES.join(', ');
  const layoutLines = getAllLayouts().map((layout) => {
    const slotDesc = layout.slots
      .map(
        (s) =>
          `${s.name}${s.required ? '*' : ''} (${s.type}${s.maxChars ? `, <=${s.maxChars}c` : ''}${s.maxItems ? `, <=${s.maxItems} items` : ''})`
      )
      .join(', ');
    return `- ${layout.name} [variants: ${layout.variants.join('|')}]: ${layout.description} Slots: ${slotDesc}`;
  });

  return [
    'MOTION KIT SPECIFICATION GUIDE',
    `Formats: "9:16" (1080x1920), "16:9" (1920x1080), "1:1" (1080x1080) @ 30fps`,
    `Styles (top-level "style"): ${Object.keys(STYLE_DEFS).join(', ')}`,
    describeStylesForAI(),
    `Intensities (top-level "intensity"): calm, balanced, energetic`,
    `Numerals (top-level "numerals"): "latn" (default), "bn" (Bengali digits)`,
    `Palettes: ${paletteList} (or theme.customPalette { bg, accent, surface?, text?, muted?, accent2? })`,
    `Moods: ${moodList}`,
    `Text highlight markup: wrap [[key phrase]] inside headlines/titles/quotes (max 1-2 key words per headline).`,
    `Backgrounds (bg): solid, linear, radial, grid, dots, shapes, chroma (#00FF00), mesh-glow, aurora, stripes, dots-grid, rings, color-blocks, waves, confetti, sparkles, lines-sweep, paper`,
    `Transitions (scene.transition): fade, push-left, push-right, push-up, wipe-left, wipe-up, circle-reveal, zoom-through, color-block, cut`,
    `Camera (scene.camera): push-in, pull-out, pan-left, pan-right, none`,
    `Entrance (animIn): fade, fade-up, fade-down, slide-left, slide-right, pop, zoom, wipe, type, words, mask-up, slam, drop, rotate-in, highlight-sweep, draw, none`,
    `Exit (animOut): fade, slide, zoom, none`,
    `Easing (ease): smooth, snappy, bounce, cinematic`,
    `Icons: ${iconList}`,
    `Audio (optional "audio"): { music?: { source?: "synth", style: lofi|corporate|upbeat-pop|cinematic|playful|tech-pulse|ambient, bpm?, seed?, volume? (0-1, default 0.35) } | { source: "upload", mediaId, volume?, startAt?, loop? }, sfx?: "auto"|"minimal"|"off", sfxVolume? (0-1), mute?: boolean }. When music.bpm is present, scene durations snap gently to the beat grid. Lower-thirds and chroma scenes stay silent.`,
    'Layouts (* = required slot):',
    ...layoutLines,
  ].join('\n');
}
