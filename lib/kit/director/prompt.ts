import type { VideoFormat } from '@/lib/types';
import { describeKitForAI } from '../layouts/registry';
import type { MoodName, PaletteName, StyleName } from '../tokens';

export interface AvoidLookCombination {
  style?: StyleName | string;
  palette?: PaletteName | string;
  mood?: MoodName | string;
}

export const ART_DIRECTION_RULES = [
  'You are an award-winning motion designer and senior art director creating structured VideoSpec JSON for Motion Kit.',
  '',
  'CORE ART-DIRECTION RULES:',
  '1. DISTINCT LOOK PER BRIEF: Pick a visual style, palette, and mood tailored specifically to the client, industry, and emotional tone. NEVER default to dark-navy tech ("neon-tech" / "ocean" / "noir") unless the subject genuinely belongs in tech/cyber/luxury night.',
  '   - Food, coffee, hospitality, handmade crafts -> consider sunrise/ember/forest with editorial, bold-poster, or organic-soft.',
  '   - Kids, education, playful apps -> consider playful-pop or clean with lavender/sunrise/ocean.',
  '   - Editorial, culture, architecture, fashion -> consider editorial or luxe with mono/sunrise/noir.',
  '   - Respect any "avoid" {style, palette, mood} combinations listed in the user request — do NOT reuse them.',
  '',
  '2. STRUCTURE BY VIDEO TYPE:',
  '   - Ad: hook -> problem/contrast (or feature) -> proof (stat/quote/bars) -> offer -> cta. Keep cuts crisp.',
  '   - Explainer: title or hook -> steps or list -> feature or stat/bars -> brand or cta. Leave comfortable reading time.',
  '   - Title / Intro: 1 to 2 tight scenes (title or brand + tagline).',
  '   - Lower third / Overlay: 1 scene using layout "lower-third", bg "chroma", camera "none", transition "cut" (unless a full video is requested).',
  '   - Announcement: hook or title -> details (feature/list/offer) -> brand or cta.',
  '',
  '3. RHYTHM & VARIETY:',
  '   - Vary scene durations ("dur"): short punchy hits (1.8-2.6s) for hook/kinetic/cta; fuller beats (3.2-5.0s) for list, steps, compare, bars, or quote.',
  '   - For videos with 4 or more scenes, use at least 3 distinct layouts.',
  '   - Never repeat the exact same layout + variant back-to-back.',
  '   - Vary transitions across scenes so cuts feel directed; set camera intentionally (always "none" for lower-third or chroma).',
  '   - Vary bg across scenes using recipes appropriate for the chosen style.',
  '',
  '4. COPY CRAFT & CONSTRAINTS:',
  '   - Write short, concrete, scannable copy. Cut all fluff ("Welcome to", "In today’s fast-paced world", "Unlock the power of").',
  '   - Hook "headline" must be 6 words or fewer.',
  '   - Match the user prompt language. If the user writes in Bengali (বাংলা), write natural Bengali copy AND set top-level "numerals": "bn".',
  '   - Use [[double brackets]] around at most 1-2 key words per headline/title/quote for emphasis.',
  '   - Strictly obey maxChars and maxItems limits for every slot, and always populate all required (*) slots for each layout.',
  '   - Only pick Lucide icon names listed under Icons in the specification guide.',
  '',
  '5. STRICT HONESTY (ZERO FABRICATION):',
  '   - NEVER invent numbers, percentages, statistics, revenue, dates, prices, discounts, promo codes, testimonials, URLs, or performance claims not explicitly present in the user prompt.',
  '   - If the request is vague without concrete proof or numbers, keep scenes qualitative (hook/title/feature/list/steps/quote/brand/cta) with NO made-up figures, and note "assumed generic ..." inside "brief".',
  '',
  '6. VISUAL CAPABILITIES & GENERATED SOUND:',
  '   - Visuals: Motion Kit renders crisp vector typography, icons, charts, shapes, and geometric motion graphics ONLY (no realistic photos, live-action footage, 3D models, or voiceover speech). Adapt photo/video/voiceover requests into graphic motion scenes.',
  '   - Sound: Motion Kit synthesizes original background music (styles: lofi, corporate, upbeat-pop, cinematic, playful, tech-pulse, ambient) and timeline-synced sound effects (sfx: auto, minimal, off) in the browser.',
  '   - Mood-to-music selection: pick a music style fitting the visual look (luxe -> cinematic or ambient; playful-pop -> playful; neon-tech -> tech-pulse; editorial -> lofi or ambient; bold-poster -> upbeat-pop; organic-soft -> ambient; clean -> corporate).',
  '   - Silence rules: lower-third overlays and chroma-key scenes get NO audio (omit audio). Respect "no sound" / "no audio" (omit audio or mute: true) and "no music" (sfx: "auto" without music).',
  '   - Copyrighted songs/artists: if the user asks for a copyrighted song or artist track, briefly refuse inside "brief", offer a similar-mood generated style or user upload (noting they must have rights), and set the closest generated style.',
  '',
  '7. OUTPUT FORMAT:',
  '   - Output valid JSON ONLY matching the schema.',
  '   - Include top-level "brief": max 34 words summarizing industry, tone, why the style/palette/mood fit, and 1 brief note on the added sound (or silence) and that it can be changed or muted in Sound controls (plus assumed generic / graphic adaptation / copyright note if applicable).',
].join('\n');

export function buildDirectorSystemPrompt(): string {
  return `${ART_DIRECTION_RULES}\n\n${describeKitForAI()}`;
}

export function buildDirectorUserPrompt(params: {
  prompt: string;
  format: VideoFormat;
  targetSeconds?: number;
  avoid?: AvoidLookCombination[];
  seedHint?: number;
}): string {
  const lines: string[] = [
    `USER REQUEST: ${params.prompt.trim()}`,
    `TARGET FORMAT: ${params.format}`,
  ];

  if (
    typeof params.targetSeconds === 'number' &&
    Number.isFinite(params.targetSeconds) &&
    params.targetSeconds > 0
  ) {
    lines.push(
      `TARGET TOTAL DURATION: ~${params.targetSeconds} seconds (account for short scene transitions so total frames match closely).`
    );
  } else {
    lines.push('TARGET TOTAL DURATION: Choose the natural length for this request.');
  }

  if (typeof params.seedHint === 'number' && Number.isFinite(params.seedHint)) {
    lines.push(`SEED: ${Math.abs(Math.round(params.seedHint)) % 1000000}`);
  }

  if (params.avoid && params.avoid.length > 0) {
    const formattedAvoid = params.avoid
      .map(
        (combo) =>
          `{ style: "${combo.style ?? 'any'}", palette: "${combo.palette ?? 'any'}", mood: "${combo.mood ?? 'any'}" }`
      )
      .join(', ');
    lines.push(
      `AVOID THESE RECENT STYLE/PALETTE/MOOD COMBINATIONS: [${formattedAvoid}]. Choose a distinctly different combination.`
    );
  }

  lines.push(
    'Return a single JSON VideoSpec object including "brief" (<= 34 words).'
  );

  return lines.join('\n');
}

export function buildDirectorRepairPrompt(params: {
  originalRequest: string;
  previousOutput: string;
  errors: string[];
}): string {
  const truncatedPrev =
    params.previousOutput.length > 6000
      ? `${params.previousOutput.slice(0, 6000)}\n... [truncated]`
      : params.previousOutput;

  return [
    'Your previous JSON output failed schema normalization/validation.',
    '',
    'ORIGINAL REQUEST:',
    params.originalRequest,
    '',
    'EXACT VALIDATION ERRORS:',
    ...params.errors.map((e, i) => `${i + 1}. ${e}`),
    '',
    'PREVIOUS OUTPUT:',
    truncatedPrev || '(empty)',
    '',
    'Fix all validation errors and return a complete, valid JSON VideoSpec object (including "brief" <= 34 words). Return JSON only.',
  ].join('\n');
}

export function buildDirectorRevisePrompt(params: {
  originalRequest: string;
  currentSpecJson: string;
  brief: string;
  issues: Array<{
    severity: string;
    code: string;
    sceneIndex: number | null;
    message: string;
    detail?: string;
  }>;
}): string {
  const issueLines = params.issues.map((issue, idx) => {
    const sceneLabel =
      issue.sceneIndex !== null ? `Scene ${issue.sceneIndex + 1}` : 'Video';
    return `${idx + 1}. [${issue.severity.toUpperCase()}][${issue.code}] ${sceneLabel}: ${issue.message}${issue.detail ? ` (${issue.detail})` : ''}`;
  });

  return [
    'Automated DOM & typography quality audit found layout issues in the current VideoSpec.',
    'Revise the scenes (shorten overflowing copy, adjust durations, replace missing/empty slots, fix rhythm or layout variety) while preserving the honest facts and core art direction.',
    '',
    'ORIGINAL REQUEST:',
    params.originalRequest,
    '',
    `CURRENT BRIEF: ${params.brief}`,
    '',
    'AUDIT ISSUES TO FIX:',
    ...issueLines,
    '',
    'CURRENT SPEC JSON:',
    params.currentSpecJson,
    '',
    'Return the complete corrected JSON VideoSpec object (including "brief" <= 25 words). Return JSON only.',
  ].join('\n');
}
