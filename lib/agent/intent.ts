import type { Plan } from '@/lib/types';

export const BUILD_INTENT_PATTERNS: readonly string[] = [
  'make a video',
  'build it',
  'build the video',
  'build',
  'go',
  'go ahead',
  'ok',
  'yes',
  'yes, build',
  'start',
  'create it',
  'do it',
  'create video',
  'create the video',
  'build now',
  "let's build",
  'lets build',
  "let's go",
  'lets go',
  'make it',
  'make the video',
  'run it',
  'execute',
  'proceed',
  'confirm',
  'approve',
  'done',
  'perfect',
  'great',
  'sounds good',
  "that's good",
  'thats good',
  'looks good',
  'বানাও',
  'শুরু করো',
  'চালাও',
  'ঠিক আছে',
  'হ্যাঁ',
  'করো',
  'করে দাও',
  'তৈরি করো',
  'শুরু',
  'এগিয়ে যাও',
  'ঠিক',
  'বানিয়ে দাও',
  'হয়ে গেলো',
  'ভালো',
  'ওকে',
];

const BUILD_INTENT_SET = new Set<string>(BUILD_INTENT_PATTERNS);

const BUILD_INTENT_PREFIX_SET = new Set<string>([
  'build',
  'create',
  'make',
  'run',
  'go',
  'yes',
  'ok',
  'okay',
  'sure',
  'fine',
  'start',
  'proceed',
  'করো',
  'বানাও',
  'শুরু',
  'হ্যাঁ',
  'ঠিক',
]);

const SAFE_BUILD_QUALIFIERS = new Set<string>([
  'it',
  'this',
  'that',
  'now',
  'please',
  'pls',
  'ahead',
  'the',
  'a',
  'video',
  'build',
  'go',
  'start',
  'on',
  'yes',
  'ok',
  'okay',
  'sure',
  'করো',
  'দাও',
  'যাও',
  'এটা',
  'ভিডিও',
  'ভিডিওটা',
  'এখন',
  'ঠিক',
  'আছে',
  'হ্যাঁ',
]);

/**
 * Checks whether a user message is a direct build/go-ahead command for an
 * existing active plan. Avoids false positives on questions or edit prompts
 * such as "make it blue".
 */
export function isBuildIntent(
  text: string,
  lastActivePlan: Plan | null
): boolean {
  if (!lastActivePlan) {
    return false;
  }
  if (text.includes('?') || text.includes('？')) {
    return false;
  }
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!,।!?…\s]+$/g, '')
    .trim();
  if (!normalized) {
    return false;
  }
  if (BUILD_INTENT_SET.has(normalized)) {
    return true;
  }

  const words = normalized
    .split(/\s+/)
    .map((w) => w.replace(/^,+|,+$/g, ''))
    .filter((w) => w.length > 0);
  if (words.length === 0 || words.length > 4) {
    return false;
  }

  const firstWord = words[0];
  if (!BUILD_INTENT_PREFIX_SET.has(firstWord)) {
    return false;
  }

  return words.slice(1).every((word) => SAFE_BUILD_QUALIFIERS.has(word));
}

export function isBengaliText(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}
