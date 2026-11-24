import { normalizeVideoSpec, type VideoSpec } from '@/lib/kit/spec';
import type { LayoutName } from '@/lib/kit/layouts/types';
import type {
  IntensityName,
  LayoutVariant,
  MoodName,
  PaletteName,
  StyleName,
} from '@/lib/kit/tokens';
import type { VideoFormat } from '@/lib/types';

export interface KitFixtureEntry {
  id: string;
  label: string;
  description: string;
  isAuditTest?: boolean;
  targetSeconds?: number;
  rawSpec: Record<string, unknown>;
}

export const KIT_TEST_FIXTURES: readonly KitFixtureEntry[] = [
  {
    id: 'short-ad-15s',
    label: 'Test fixture: 15s Short ad',
    description:
      '6-scene product ad covering hook, feature, stat, list, offer, and cta with transitions & highlights.',
    rawSpec: {
      title: 'Test fixture: 15s Short Ad',
      format: '9:16',
      style: 'clean',
      intensity: 'balanced',
      theme: {
        palette: 'ember',
        mood: 'bold',
      },
      scenes: [
        {
          id: 's1',
          layout: 'hook',
          variant: 'b',
          dur: 2.5,
          bg: 'mesh-glow',
          animIn: 'mask-up',
          camera: 'push-in',
          slots: {
            kicker: 'Test fixture',
            headline: 'Edit studio reels [[in seconds]]',
            sub: 'Sample text for high-contrast hook opener.',
            icon: 'zap',
          },
        },
        {
          id: 's2',
          layout: 'feature',
          variant: 'a',
          dur: 3.0,
          bg: 'grid',
          animIn: 'fade-up',
          transition: 'push-left',
          camera: 'pull-out',
          slots: {
            kicker: 'Sample text',
            title: 'Auto-fit typography',
            body: 'Binary-search text fitting scales headlines to safe bounds.',
            icon: 'layers',
            highlights: [
              'Zero manual keyframes',
              'Safe margins on 3 ratios',
              'Crisp exports in every format',
            ],
          },
        },
        {
          id: 's3',
          layout: 'stat',
          variant: 'a',
          dur: 2.8,
          bg: 'radial',
          animIn: 'pop',
          transition: 'circle-reveal',
          camera: 'push-in',
          slots: {
            kicker: 'Test fixture',
            value: '3.4x',
            label: 'Faster turnaround from script to MP4',
            delta: '+240% throughput',
            icon: 'trending-up',
          },
        },
        {
          id: 's4',
          layout: 'list',
          variant: 'c',
          dur: 3.2,
          bg: 'dots-grid',
          animIn: 'slide-left',
          transition: 'wipe-left',
          camera: 'none',
          slots: {
            kicker: 'Workflow',
            title: 'Three clean steps',
            items: [
              { title: 'Pick style & palette', detail: 'Sample text row one', icon: 'sparkles' },
              { title: 'Fill structured slots', detail: 'Sample text row two', icon: 'check' },
              { title: 'Preview & export MP4', detail: 'Sample text row three', icon: 'rocket' },
            ],
          },
        },
        {
          id: 's5',
          layout: 'offer',
          variant: 'b',
          dur: 2.8,
          bg: 'shapes',
          animIn: 'pop',
          transition: 'color-block',
          camera: 'push-in',
          slots: {
            badge: 'Test fixture',
            headline: 'Pro Creator Pass',
            price: '$19/mo',
            originalPrice: '$39/mo',
            details: 'Sample text offer summary.',
            code: 'KITLAUNCH40',
            cta: 'Start Trial',
          },
        },
        {
          id: 's6',
          layout: 'cta',
          variant: 'a',
          dur: 2.7,
          bg: 'linear',
          animIn: 'fade-up',
          transition: 'fade',
          camera: 'pull-out',
          slots: {
            kicker: 'Ready',
            headline: 'Ship your [[next reel]] today',
            sub: 'Sample text closing statement.',
            buttonText: 'Create Video',
            url: 'example.com/kit',
            icon: 'arrow-right',
          },
        },
      ],
    },
  },
  {
    id: 'explainer-20s',
    label: 'Test fixture: 20s Explainer',
    description:
      '20s 6-scene product explainer showcasing hook, steps, compare, bars, quote, and cta.',
    rawSpec: {
      title: 'Test fixture: 20s Motion Explainer',
      format: '9:16',
      style: 'neon-tech',
      intensity: 'balanced',
      seed: 402,
      theme: {
        palette: 'ocean',
        mood: 'tech',
      },
      scenes: [
        {
          id: 'exp-1',
          layout: 'hook',
          variant: 'c',
          dur: 3.0,
          bg: 'grid',
          animIn: 'wipe',
          camera: 'push-in',
          slots: {
            kicker: 'Test fixture explainer',
            headline: 'Why static slides lose [[70%]] attention',
            sub: 'Sample text explainer thesis across three aspect ratios.',
            icon: 'sparkles',
          },
        },
        {
          id: 'exp-2',
          layout: 'steps',
          variant: 'a',
          dur: 4.0,
          bg: 'dots-grid',
          transition: 'wipe-left',
          camera: 'none',
          slots: {
            heading: 'How [[Motion Kit]] works',
            items: [
              { title: 'Define concise JSON slots', detail: 'Sample text step 01' },
              { title: 'Pick style & pacing preset', detail: 'Sample text step 02' },
              { title: 'Render deterministic 30fps MP4', detail: 'Sample text step 03' },
            ],
          },
        },
        {
          id: 'exp-3',
          layout: 'compare',
          variant: 'b',
          dur: 3.8,
          bg: 'mesh-glow',
          transition: 'push-left',
          camera: 'pull-out',
          slots: {
            leftTitle: 'Manual Edit',
            rightTitle: 'Kit Spec',
            leftItems: ['3 hours keyframing', 'Broken mobile margins', 'Inconsistent font scale'],
            rightItems: ['200-token JSON spec', 'Locked 9:16 safe bounds', 'Studio typography scale'],
          },
        },
        {
          id: 'exp-4',
          layout: 'bars',
          variant: 'a',
          dur: 3.5,
          bg: 'rings',
          transition: 'zoom-through',
          camera: 'push-in',
          slots: {
            heading: 'Completion rate by format',
            data: [
              { label: 'Static', value: 28 },
              { label: 'Slides', value: 52 },
              { label: 'Kinetic', value: 79 },
              { label: 'Motion Kit', value: 94 },
            ],
          },
        },
        {
          id: 'exp-5',
          layout: 'quote',
          variant: 'b',
          dur: 3.2,
          bg: 'aurora',
          transition: 'fade',
          camera: 'pull-out',
          slots: {
            quote: 'Structured scenes let teams ship [[twice as fast]] without sacrificing craft.',
            author: 'Sample Creative Lead',
          },
        },
        {
          id: 'exp-6',
          layout: 'cta',
          variant: 'b',
          dur: 3.0,
          bg: 'mesh-glow',
          transition: 'circle-reveal',
          camera: 'push-in',
          slots: {
            kicker: 'Test fixture',
            headline: 'Try the [[explainer]] flow',
            sub: 'Sample text CTA with style-aware shine button.',
            buttonText: 'Launch Builder',
            url: 'example.com/explainer',
            icon: 'rocket',
          },
        },
      ],
    },
  },
  {
    id: 'sale-ad-30s',
    label: 'Test fixture: 30s Sale ad',
    description:
      'High-energy 30s promotional campaign using bold-poster style, kinetic slams, bars, compare, stat, offer, and brand.',
    rawSpec: {
      title: 'Test fixture: 30s Campaign Sale Ad',
      format: '9:16',
      style: 'bold-poster',
      intensity: 'energetic',
      seed: 818,
      theme: {
        palette: 'ember',
        mood: 'bold',
      },
      scenes: [
        {
          id: 'sale-1',
          layout: 'hook',
          variant: 'a',
          dur: 2.4,
          bg: 'color-blocks',
          animIn: 'slam',
          camera: 'push-in',
          slots: {
            kicker: 'Test fixture sale',
            headline: 'Launch week [[50% off]] bundle',
            sub: 'Sample text promotional opener.',
            icon: 'flame',
          },
        },
        {
          id: 'sale-2',
          layout: 'kinetic',
          variant: 'a',
          dur: 2.5,
          bg: 'stripes',
          transition: 'cut',
          camera: 'none',
          slots: {
            words: ['CREATE', 'ANIMATE', 'EXPORT', 'SHIP FAST'],
          },
        },
        {
          id: 'sale-3',
          layout: 'feature',
          variant: 'c',
          dur: 3.2,
          bg: 'lines-sweep',
          transition: 'push-left',
          camera: 'pan-left',
          slots: {
            kicker: 'Included',
            title: '15 layouts [[× 3 ratios]]',
            body: 'Sample text explaining every card auto-scales cleanly.',
            icon: 'layers',
            highlights: [
              '7 distinct look styles',
              '10 seamless transitions',
              'Bengali & Latin fonts',
            ],
          },
        },
        {
          id: 'sale-4',
          layout: 'compare',
          variant: 'a',
          dur: 3.5,
          bg: 'solid',
          transition: 'color-block',
          camera: 'none',
          slots: {
            leftTitle: 'Free Plan',
            rightTitle: 'Pro Bundle',
            leftItems: ['Standard exports', '3 templates', 'Basic pacing'],
            rightItems: ['60fps Studio MP4', 'All 15 layouts', 'Priority render'],
          },
        },
        {
          id: 'sale-5',
          layout: 'stat',
          variant: 'c',
          dur: 2.8,
          bg: 'shapes',
          transition: 'push-up',
          camera: 'push-in',
          slots: {
            kicker: 'Creator metrics',
            value: '12,400',
            label: 'Videos exported in sample benchmark',
            delta: '+180% this quarter',
            icon: 'award',
          },
        },
        {
          id: 'sale-6',
          layout: 'steps',
          variant: 'b',
          dur: 3.4,
          bg: 'color-blocks',
          transition: 'wipe-left',
          camera: 'pan-right',
          slots: {
            heading: 'Claim in 3 steps',
            items: [
              { title: 'Pick campaign template', detail: 'Sample step 1' },
              { title: 'Apply coupon code', detail: 'Sample step 2' },
              { title: 'Render & publish', detail: 'Sample step 3' },
            ],
          },
        },
        {
          id: 'sale-7',
          layout: 'bars',
          variant: 'b',
          dur: 3.2,
          bg: 'stripes',
          transition: 'push-left',
          camera: 'pull-out',
          slots: {
            heading: 'Return by channel',
            data: [
              { label: 'Reels', value: 95 },
              { label: 'Shorts', value: 86 },
              { label: 'Stories', value: 72 },
              { label: 'Feed', value: 64 },
            ],
          },
        },
        {
          id: 'sale-8',
          layout: 'offer',
          variant: 'a',
          dur: 3.2,
          bg: 'color-blocks',
          transition: 'circle-reveal',
          camera: 'push-in',
          slots: {
            badge: 'LIMITED FIXTURE',
            headline: 'Annual Creator Suite',
            price: '$99/yr',
            originalPrice: '$199/yr',
            details: 'Sample text sale terms.',
            code: 'POSTER50',
            cta: 'Claim Bundle',
          },
        },
        {
          id: 'sale-9',
          layout: 'kinetic',
          variant: 'b',
          dur: 2.2,
          bg: 'lines-sweep',
          transition: 'cut',
          camera: 'none',
          slots: {
            words: ['SAVE 50%', 'ENDS SOON', 'GET KIT'],
          },
        },
        {
          id: 'sale-10',
          layout: 'cta',
          variant: 'c',
          dur: 2.8,
          bg: 'color-blocks',
          transition: 'color-block',
          camera: 'push-in',
          slots: {
            kicker: 'Final call',
            headline: 'Upgrade your [[video output]]',
            sub: 'Sample text closing banner.',
            buttonText: 'Grab 50% Off',
            url: 'example.com/sale',
            icon: 'arrow-right',
          },
        },
        {
          id: 'sale-11',
          layout: 'brand',
          variant: 'b',
          dur: 2.6,
          bg: 'solid',
          transition: 'wipe-up',
          camera: 'pull-out',
          slots: {
            brandName: 'Sample Studio',
            tagline: 'Test fixture end-card mark',
            badge: '2026 Release',
            url: 'example.com',
            icon: 'sparkles',
          },
        },
      ],
    },
  },
  {
    id: 'title-5s',
    label: 'Test fixture: 5s Title',
    description: 'Single-scene editorial title card with serif typography.',
    rawSpec: {
      title: 'Test fixture: Editorial Title Card',
      format: '16:9',
      style: 'editorial',
      theme: {
        palette: 'sunrise',
        mood: 'elegant',
      },
      scenes: [
        {
          id: 'title-1',
          layout: 'title',
          variant: 'a',
          dur: 5.0,
          bg: 'paper',
          animIn: 'mask-up',
          camera: 'push-in',
          slots: {
            kicker: 'Sample text',
            title: 'Design Systems for [[Motion]]',
            subtitle: 'Test fixture subtitle demonstrating balanced editorial spacing.',
            tag: 'Episode 04',
          },
        },
      ],
    },
  },
  {
    id: 'lower-third-chroma-6s',
    label: 'Test fixture: 6s Lower third (Chroma)',
    description: 'Broadcast lower-third over #00FF00 chroma key background.',
    rawSpec: {
      title: 'Test fixture: Chroma Lower Third',
      format: '16:9',
      style: 'clean',
      theme: {
        palette: 'ocean',
        mood: 'tech',
      },
      scenes: [
        {
          id: 'lt-1',
          layout: 'lower-third',
          variant: 'a',
          dur: 6.0,
          bg: 'chroma',
          animIn: 'slide-right',
          camera: 'none',
          slots: {
            tag: 'TEST FIXTURE',
            name: 'Ariana Rahman',
            role: 'Principal Motion Engineer',
            org: 'Sample Studio',
            icon: 'video',
          },
        },
      ],
    },
  },
  {
    id: 'audit-broken-a-geometry',
    label: 'Audit test A: Overflow / Overlap / Contrast',
    description:
      'Audit test fixture (intentionally broken): low contrast custom colors, tiny text (16px), overlapping blocks, and overlong headline.',
    isAuditTest: true,
    rawSpec: {
      title: 'Audit test fixture (intentionally broken) A',
      format: '9:16',
      style: 'clean',
      intensity: 'balanced',
      theme: {
        palette: {
          bg: '#14141B',
          surface: '#1D1D28',
          text: '#F2F2F7',
          muted: '#46465C',
          accent: '#28283C',
          accent2: '#303048',
        },
        mood: 'bold',
      },
      scenes: [
        {
          id: 'brk-a1',
          layout: 'custom',
          variant: 'a',
          dur: 3.5,
          bg: 'solid',
          slots: {
            align: 'center',
            blocks: [
              {
                kind: 'heading',
                text: 'Sample intentionally overloaded headline pushing typography fitting past safe container dimensions across mobile portrait frames',
                fontSize: 78,
              },
              {
                kind: 'body',
                text: 'Tiny body label colliding upward',
                fontSize: 16,
                offsetY: -120,
              },
            ],
          },
        },
        {
          id: 'brk-a2',
          layout: 'feature',
          variant: 'a',
          dur: 3.5,
          bg: 'solid',
          transition: 'fade',
          slots: {
            kicker: 'Audit sample',
            title:
              'Overlong sample feature heading engineered to exceed line height budget inside compact cards',
            body: 'Dim muted secondary description that also fails contrast ratio checks and overflows container bounds.',
            icon: 'sparkles',
          },
        },
      ],
    },
  },
  {
    id: 'audit-broken-b-rhythm',
    label: 'Audit test B: Rhythm / Repeat',
    description:
      'Audit test fixture (intentionally broken): 6 uniform 3.0s scenes, repeated title+a layout, and repeated fade transitions.',
    isAuditTest: true,
    rawSpec: {
      title: 'Audit test fixture (intentionally broken) B',
      format: '9:16',
      style: 'clean',
      intensity: 'balanced',
      theme: {
        palette: 'ocean',
        mood: 'bold',
      },
      scenes: [
        {
          id: 'brk-b1',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 1',
            title: 'Opening point',
            subtitle: 'Sample text card one.',
          },
        },
        {
          id: 'brk-b2',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 2',
            title: 'Second identical layout',
            subtitle: 'Sample text card two.',
          },
        },
        {
          id: 'brk-b3',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 3',
            title: 'Third identical layout',
            subtitle: 'Sample text card three.',
          },
        },
        {
          id: 'brk-b4',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 4',
            title: 'Fourth identical layout',
            subtitle: 'Sample text card four.',
          },
        },
        {
          id: 'brk-b5',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 5',
            title: 'Fifth identical layout',
            subtitle: 'Sample text card five.',
          },
        },
        {
          id: 'brk-b6',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'linear',
          transition: 'fade',
          slots: {
            kicker: 'Chapter 6',
            title: 'Sixth identical layout',
            subtitle: 'Sample text card six.',
          },
        },
      ],
    },
  },
  {
    id: 'audit-broken-c-empty',
    label: 'Audit test C: Empty entry / Duration',
    description:
      'Audit test fixture (intentionally broken): blank first frame and 4.5s total vs 15s target duration.',
    isAuditTest: true,
    targetSeconds: 15,
    rawSpec: {
      title: 'Audit test fixture (intentionally broken) C',
      format: '9:16',
      style: 'clean',
      intensity: 'balanced',
      theme: {
        palette: 'ember',
        mood: 'bold',
      },
      scenes: [
        {
          id: 'brk-c1',
          layout: 'custom',
          variant: 'a',
          dur: 2.0,
          bg: 'solid',
          slots: {
            align: 'center',
            blocks: [],
          },
        },
        {
          id: 'brk-c2',
          layout: 'title',
          variant: 'a',
          dur: 3.0,
          bg: 'radial',
          transition: 'fade',
          slots: {
            kicker: 'Too short',
            title: 'Closing card',
            subtitle: 'Video ends far under 15s target.',
          },
        },
      ],
    },
  },
];

export type GallerySampleVariant = 'standard' | 'bengali' | 'long';

const STANDARD_SLOTS: Record<LayoutName, Record<string, unknown>> = {
  hook: {
    kicker: 'Sample text',
    headline: 'Stop scrolling [[right now]]',
    sub: 'Test fixture hook subline',
    icon: 'zap',
  },
  title: {
    kicker: 'Test fixture',
    title: 'Clean Motion [[Titles]]',
    subtitle: 'Sample text subtitle line',
    tag: '2026 Edition',
  },
  feature: {
    kicker: 'Sample text',
    title: 'Auto-fit Typography',
    body: 'Test fixture feature summary across aspect ratios.',
    icon: 'cpu',
    highlights: ['Safe margins', 'WCAG contrast', 'Zero keyframes'],
  },
  stat: {
    kicker: 'Test fixture',
    value: '98.4%',
    label: 'Sample text metric label',
    delta: '+14.2% MoM',
    icon: 'trending-up',
  },
  list: {
    kicker: 'Test fixture',
    title: 'Key Takeaways',
    items: [
      { title: 'Sample text item one', detail: 'First detail' },
      { title: 'Sample text item two', detail: 'Second detail' },
      { title: 'Sample text item three', detail: 'Third detail' },
    ],
  },
  steps: {
    heading: 'Three [[Simple Steps]]',
    items: [
      { title: 'Choose a visual style', detail: '7 curated design recipes' },
      { title: 'Supply concise text slots', detail: 'Auto-fitted to safe bounds' },
      { title: 'Export lossless MP4', detail: 'Crisp at 30fps on web' },
    ],
  },
  quote: {
    quote: 'Typography in motion should feel [[inevitable]], never accidental.',
    author: 'Sample Design Lead',
  },
  compare: {
    leftTitle: 'Before',
    rightTitle: 'After Kit',
    leftItems: ['Manual keyframes', 'Inconsistent padding', 'Static fades'],
    rightItems: ['Beat-grid pacing', 'Contrast locked', '10 transitions'],
  },
  bars: {
    heading: 'Engagement Lift',
    data: [
      { label: 'Text', value: 34 },
      { label: 'Icons', value: 58 },
      { label: 'Motion', value: 82 },
      { label: 'Kit S1-B', value: 96 },
    ],
  },
  kinetic: {
    words: ['BOLD', 'FAST', 'CRISP', 'MOTION'],
  },
  offer: {
    badge: 'Sample text',
    headline: 'Starter Bundle',
    price: '$29',
    originalPrice: '$59',
    details: 'Test fixture offer terms',
    code: 'SAVE50',
    cta: 'Get Offer',
  },
  cta: {
    kicker: 'Test fixture',
    headline: 'Launch in [[minutes]]',
    sub: 'Sample text supporting note',
    buttonText: 'Get Started',
    url: 'example.com/demo',
    icon: 'arrow-right',
  },
  brand: {
    brandName: 'Sample Brand',
    tagline: 'Test fixture brand reveal',
    badge: 'Verified Kit',
    url: 'example.com',
    icon: 'sparkles',
  },
  'lower-third': {
    tag: 'SAMPLE TEXT',
    name: 'Tariq Hasan',
    role: 'Creative Director',
    org: 'Test Fixture Lab',
    icon: 'mic',
  },
  custom: {
    align: 'center',
    blocks: [
      { kind: 'kicker', text: 'Test fixture' },
      { kind: 'heading', text: 'Custom Block Stack' },
      { kind: 'divider', text: '' },
      { kind: 'body', text: 'Sample text body paragraph.' },
      { kind: 'cta', text: 'Explore Kit', icon: 'sparkles' },
    ],
  },
};

const BENGALI_SLOTS: Record<LayoutName, Record<string, unknown>> = {
  hook: {
    kicker: 'নমুনা লেখা',
    headline: 'দ্রুত ও সুন্দর [[মোশন ভিডিও]] তৈরি করুন',
    sub: 'বাংলা যুক্তবর্ণ ও ফন্ট পরীক্ষার নমুনা টেক্সট।',
    icon: 'sparkles',
  },
  title: {
    kicker: 'টেস্ট ফিক্সচার',
    title: 'বাংলা [[টাইপোগ্রাফি]] ও গতি',
    subtitle: 'স্বয়ংক্রিয় লেআউট ও পরিষ্কার কনট্রাস্ট পরীক্ষা।',
    tag: 'পর্ব ০১',
  },
  feature: {
    kicker: 'নমুনা ফিচার',
    title: 'স্মার্ট ফন্ট ও মার্জিন',
    body: 'সব ফরম্যাটে বাংলা টেক্সট স্পষ্টভাবে ফিট হয়।',
    icon: 'layers',
    highlights: ['পরিষ্কার কনট্রাস্ট', 'বাংলা সংখ্যা ০-৯', 'সহজ এক্সপোর্ট'],
  },
  stat: {
    kicker: 'নমুনা পরিসংখ্যান',
    value: '96.5%',
    label: 'বাংলা ডিজাইন ও ফন্ট সামঞ্জস্য হার',
    delta: '+24% গতি',
    icon: 'trending-up',
  },
  list: {
    kicker: 'নমুনা তালিকা',
    title: 'তিনটি প্রধান ধাপ',
    items: [
      { title: 'প্যালেট নির্বাচন করুন', detail: 'নমুনা ধাপ ১' },
      { title: 'বাংলা লেখা যোগ করুন', detail: 'নমুনা ধাপ ২' },
      { title: 'ভিডিও এক্সপোর্ট করুন', detail: 'নমুনা ধাপ ৩' },
    ],
  },
  steps: {
    heading: 'কাজের তিনটি ধাপ',
    items: [
      { title: 'স্টাইল বেছে নিন', detail: 'নমুনা বিবরণ ১' },
      { title: 'বাংলা টেক্সট লিখুন', detail: 'নমুনা বিবরণ ২' },
      { title: 'MP4 সেভ করুন', detail: 'নমুনা বিবরণ ৩' },
    ],
  },
  quote: {
    quote: 'গতিশীল বাংলা [[টাইপোগ্রাফি]] গল্পকে আরও জীবন্ত করে তোলে।',
    author: 'নমুনা ডিজাইনার',
  },
  compare: {
    leftTitle: 'পুরোনো পদ্ধতি',
    rightTitle: 'মোশন কিট',
    leftItems: ['ম্যানুয়াল এডিটিং', 'ভাঙা যুক্তবর্ণ', 'সময়সাপেক্ষ কাজ'],
    rightItems: ['অটো ফিট বাংলা', 'সঠিক মার্জিন', 'দ্রুত রেন্ডার'],
  },
  bars: {
    heading: 'বাংলা ফরম্যাট সূচক',
    data: [
      { label: 'ধাপ ১', value: 40 },
      { label: 'ধাপ ২', value: 65 },
      { label: 'ধাপ ৩', value: 85 },
      { label: 'ধাপ ৪', value: 98 },
    ],
  },
  kinetic: {
    words: ['দ্রুত', 'স্পষ্ট', 'আধুনিক', 'মোশন'],
  },
  offer: {
    badge: 'নমুনা অফার',
    headline: 'বিশেষ ক্রিয়েটর প্যাকেজ',
    price: '৳৯৯০',
    originalPrice: '৳১৯৯০',
    details: 'সীমিত সময়ের টেস্ট ফিক্সচার অফার।',
    code: 'BANGLA50',
    cta: 'এখনই শুরু করুন',
  },
  cta: {
    kicker: 'নমুনা আহ্বান',
    headline: 'আজই আপনার [[ভিডিও]] তৈরি করুন',
    sub: 'বাংলা ও ইংরেজি উভয় ভাষায় নিখুঁত ফলাফল।',
    buttonText: 'শুরু করুন',
    url: 'example.com/bn',
    icon: 'arrow-right',
  },
  brand: {
    brandName: 'নমুনা স্টুডিও',
    tagline: 'আধুনিক বাংলা মোশন গ্রাফিক্স কিট',
    badge: 'টেস্ট ফিক্সচার',
    url: 'example.com',
    icon: 'crown',
  },
  'lower-third': {
    tag: 'নমুনা',
    name: 'তানভীর আহমেদ',
    role: 'প্রধান ডিজাইনার',
    org: 'নমুনা মিডিয়া',
    icon: 'video',
  },
  custom: {
    align: 'center',
    blocks: [
      { kind: 'kicker', text: 'নমুনা ব্লক' },
      { kind: 'heading', text: 'বাংলা কাস্টম লেআউট' },
      { kind: 'divider', text: '' },
      { kind: 'body', text: 'যুক্তবর্ণ ও বিরামচিহ্ন সুরক্ষিত রেখে অ্যানিমেশন।' },
    ],
  },
};

const LONG_SLOTS: Record<LayoutName, Record<string, unknown>> = {
  hook: {
    kicker: 'Test fixture overflow guard',
    headline:
      'Sample text headline intentionally written extra long to verify automatic font shrinking and graceful multi-line wrapping inside safe bounds',
    sub: 'Additional sample text subtitle verifying the bottom spacing never collides with safe area edges across portrait, landscape, or square frames.',
    icon: 'flame',
  },
  title: {
    kicker: 'Sample text overflow stress test',
    title:
      'An Extraordinarily Detailed Editorial Title Testing Binary Search Typography Fitting',
    subtitle:
      'Sample text supporting paragraph crafted to test line height, margin containment, and ellipsis fallback at minimum readable size.',
    tag: 'Long Text Test Fixture',
  },
  feature: {
    kicker: 'Long text test fixture',
    title:
      'Responsive Multi-Line Feature Card Heading That Scales Down Cleanly',
    body: 'Sample text body explanation designed to push canvas text measurement to its limits across 9:16, 16:9, and 1:1 compositions.',
    icon: 'shield',
    highlights: [
      'Sample text highlight bullet one with extra detail',
      'Sample text highlight bullet two for vertical stacking',
      'Sample text highlight bullet three checking truncation',
    ],
  },
  stat: {
    kicker: 'Long label stress test',
    value: '1,248,900',
    label:
      'Sample text metric description intentionally long to confirm card padding and number alignment remain balanced',
    delta: '+312% Year Over Year Growth',
    icon: 'award',
  },
  list: {
    kicker: 'Test fixture 5-row check',
    title: 'Comprehensive Five-Item Checklist With Longer Sample Titles',
    items: [
      { title: 'Sample text row 1 verifying compact vertical spacing', detail: 'Detail text one' },
      { title: 'Sample text row 2 verifying compact vertical spacing', detail: 'Detail text two' },
      { title: 'Sample text row 3 verifying compact vertical spacing', detail: 'Detail text three' },
      { title: 'Sample text row 4 verifying compact vertical spacing', detail: 'Detail text four' },
      { title: 'Sample text row 5 verifying compact vertical spacing', detail: 'Detail text five' },
    ],
  },
  steps: {
    heading: 'Five Detailed Steps Testing Vertical Timeline Containment',
    items: [
      { title: 'First comprehensive step description in sequence', detail: 'Extended detail one' },
      { title: 'Second comprehensive step description in sequence', detail: 'Extended detail two' },
      { title: 'Third comprehensive step description in sequence', detail: 'Extended detail three' },
      { title: 'Fourth comprehensive step description in sequence', detail: 'Extended detail four' },
    ],
  },
  quote: {
    quote:
      'Sample extended quotation testing balanced multi-line typography and optical spacing inside portrait and wide editorial frames.',
    author: 'Dr. Farhana Yasmin Chowdhury, Principal Systems Designer',
  },
  compare: {
    leftTitle: 'Legacy Manual Workflow',
    rightTitle: 'Automated Kit Pipeline',
    leftItems: [
      'Lengthy repetitive manual alignment step one',
      'Lengthy repetitive manual alignment step two',
      'Lengthy repetitive manual alignment step three',
    ],
    rightItems: [
      'Deterministic multi-ratio auto-layout step one',
      'Deterministic multi-ratio auto-layout step two',
      'Deterministic multi-ratio auto-layout step three',
    ],
  },
  bars: {
    heading: 'Extended Six-Category Comparative Performance Breakdown',
    data: [
      { label: 'Tier A', value: 32 },
      { label: 'Tier B', value: 49 },
      { label: 'Tier C', value: 67 },
      { label: 'Tier D', value: 81 },
      { label: 'Tier E', value: 94 },
    ],
  },
  kinetic: {
    words: ['EXTENDED', 'SAMPLE', 'KINETIC', 'SEQUENCE', 'STRESS', 'TEST'],
  },
  offer: {
    badge: 'Extended Test Fixture',
    headline: 'Complete Annual Studio Membership With All Templates Unlocked',
    price: '$199/yr',
    originalPrice: '$499/yr',
    details:
      'Sample text offer fine print verifying card padding and CTA visibility inside safe margins.',
    code: 'STUDIOBUNDLE2026',
    cta: 'Upgrade Now',
  },
  cta: {
    kicker: 'Long CTA Test Fixture',
    headline:
      'Build Consistent Broadcast-Grade Motion Videos Without Manual Keyframing',
    sub: 'Sample text closing callout designed to verify maximum height containment above the button.',
    buttonText: 'Start Building Free Today',
    url: 'https://example.com/motion-kit-docs',
    icon: 'rocket',
  },
  brand: {
    brandName: 'Northstar Motion Engineering Lab',
    tagline:
      'Sample text extended brand positioning statement testing centered wrap behavior across three aspect ratios',
    badge: 'Test Fixture Verification',
    url: 'northstar-example.com',
    icon: 'globe',
  },
  'lower-third': {
    tag: 'TEST FIXTURE EXTENDED',
    name: 'Dr. Farhana Yasmin Chowdhury',
    role: 'Director of Computational Design & Broadcast Graphics',
    org: 'Sample Research Institute',
    icon: 'user',
  },
  custom: {
    align: 'left',
    blocks: [
      { kind: 'kicker', text: 'Long Custom Block Test' },
      {
        kind: 'heading',
        text: 'Sample text extended heading block inside custom vertical stack',
      },
      { kind: 'divider', text: '' },
      {
        kind: 'body',
        text: 'Sample text body block verifying five-block spacing never clips outside the safe area boundaries.',
      },
      { kind: 'cta', text: 'Inspect Documentation', icon: 'arrow-up-right' },
    ],
  },
};

export function buildGallerySpec(params: {
  layout: LayoutName;
  format: VideoFormat;
  variant: GallerySampleVariant;
  palette: PaletteName;
  mood: MoodName;
  style?: StyleName;
  intensity?: IntensityName;
  layoutVariant?: LayoutVariant;
  seed?: number;
}): VideoSpec {
  const {
    layout,
    format,
    variant,
    palette,
    mood,
    style = 'clean',
    intensity = 'balanced',
    layoutVariant,
    seed = 101,
  } = params;
  const slotMap =
    variant === 'bengali'
      ? BENGALI_SLOTS
      : variant === 'long'
        ? LONG_SLOTS
        : STANDARD_SLOTS;

  const result = normalizeVideoSpec({
    title: `Test fixture: ${layout} (${format})`,
    format,
    style,
    intensity,
    seed,
    theme: {
      palette,
      mood,
    },
    scenes: [
      {
        id: `gal-${layout}-${format}-${variant}-${style}-${layoutVariant ?? 'auto'}`,
        layout,
        ...(layoutVariant ? { variant: layoutVariant } : {}),
        dur: layout === 'lower-third' ? 5.0 : 3.5,
        bg: layout === 'lower-third' ? 'chroma' : undefined,
        slots: slotMap[layout],
      },
    ],
  });

  if (result.ok) {
    return result.spec;
  }

  return normalizeVideoSpec({
    title: 'Fallback',
    format,
    theme: { palette, mood },
    scenes: [{ layout: 'title', dur: 3.5, slots: { title: 'Sample text' } }],
  }) as unknown as VideoSpec;
}
