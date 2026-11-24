import { getNextQuotaResetInfo } from '@/lib/ai/quota-time';

export type GeminiErrorKind =
  | 'overloaded'
  | 'quota_minute'
  | 'quota_day'
  | 'timeout'
  | 'timeout_budget'
  | 'network'
  | 'cors'
  | 'auth'
  | 'bad_request'
  | 'model_not_found'
  | 'blocked'
  | 'truncated'
  | 'unknown';

export class GeminiRequestError extends Error {
  readonly kind: GeminiErrorKind;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly userAction: string;
  readonly httpStatus?: number;
  readonly apiStatus?: string;
  readonly explanation: string;
  readonly rawDetails: string;

  constructor(params: {
    kind: GeminiErrorKind;
    retryable: boolean;
    userAction: string;
    message: string;
    explanation: string;
    rawDetails: string;
    retryAfterMs?: number;
    httpStatus?: number;
    apiStatus?: string;
  }) {
    super(params.message);
    this.name = 'GeminiRequestError';
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
    this.userAction = params.userAction;
    this.httpStatus = params.httpStatus;
    this.apiStatus = params.apiStatus;
    this.explanation = params.explanation;
    this.rawDetails = params.rawDetails;
  }
}

export function isAbortError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  return err instanceof Error && err.name === 'AbortError';
}

export interface LinkedAbortHandle {
  signal: AbortSignal;
  abortForTimeout: () => void;
  cleanup: () => void;
}

export function createLinkedAbortHandle(
  parentSignal?: AbortSignal
): LinkedAbortHandle {
  const timeoutController = new AbortController();
  const cleanups: Array<() => void> = [];

  const hasAbortSignalAny =
    typeof AbortSignal !== 'undefined' &&
    typeof (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal })
      .any === 'function';

  let combinedSignal: AbortSignal;

  if (parentSignal && hasAbortSignalAny) {
    combinedSignal = (
      AbortSignal as { any: (signals: AbortSignal[]) => AbortSignal }
    ).any([parentSignal, timeoutController.signal]);
  } else if (parentSignal) {
    const manualController = new AbortController();
    const abortFromParent = () => {
      if (!manualController.signal.aborted) {
        manualController.abort(parentSignal.reason);
      }
    };
    const abortFromTimeout = () => {
      if (!manualController.signal.aborted) {
        manualController.abort(timeoutController.signal.reason);
      }
    };

    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true });
      cleanups.push(() =>
        parentSignal.removeEventListener('abort', abortFromParent)
      );
    }

    timeoutController.signal.addEventListener('abort', abortFromTimeout, {
      once: true,
    });
    cleanups.push(() =>
      timeoutController.signal.removeEventListener('abort', abortFromTimeout)
    );
    combinedSignal = manualController.signal;
  } else {
    combinedSignal = timeoutController.signal;
  }

  return {
    signal: combinedSignal,
    abortForTimeout: () => {
      if (!timeoutController.signal.aborted) {
        timeoutController.abort(new DOMException('Request timed out', 'AbortError'));
      }
    },
    cleanup: () => {
      for (const fn of cleanups) {
        fn();
      }
      cleanups.length = 0;
    },
  };
}

interface QuotaViolation {
  quotaMetric?: string;
  quotaId?: string;
  subject?: string;
  description?: string;
  quotaValue?: string;
}

interface GoogleErrorDetail {
  '@type'?: string;
  violations?: QuotaViolation[];
  retryDelay?: string;
  reason?: string;
  metadata?: Record<string, string>;
}

interface ParsedGoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GoogleErrorDetail[];
  };
}

const PER_DAY_REGEX =
  /per\s*day|perday|daily|\brpd\b|\btpd\b|requests_per_day|tokens_per_day/i;
const PER_MINUTE_REGEX =
  /per\s*minute|perminute|\brpm\b|\btpm\b|requests_per_minute|tokens_per_minute/i;

export function parseRetryAfterHeaderMs(
  headerValue: string | null,
  capMs: number
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  const numericSeconds = Number(trimmed);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.min(Math.round(numericSeconds * 1000), capMs);
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    const delta = Math.max(0, parsedDate - Date.now());
    return Math.min(delta, capMs);
  }

  return undefined;
}

function parseGoogleRetryDelayMs(
  retryDelay: string | undefined,
  capMs: number
): number | undefined {
  if (!retryDelay) return undefined;
  const trimmed = retryDelay.trim();
  const msMatch = /^(\d+(?:\.\d+)?)ms$/i.exec(trimmed);
  if (msMatch) {
    const val = Number(msMatch[1]);
    if (Number.isFinite(val) && val >= 0) {
      return Math.min(Math.round(val), capMs);
    }
  }
  const secMatch = /^(\d+(?:\.\d+)?)s$/i.exec(trimmed);
  if (secMatch) {
    const val = Number(secMatch[1]);
    if (Number.isFinite(val) && val >= 0) {
      return Math.min(Math.round(val * 1000), capMs);
    }
  }
  return undefined;
}

export function detect429QuotaKind(params: {
  apiMessage: string;
  rawText: string;
  details?: GoogleErrorDetail[];
}): 'quota_minute' | 'quota_day' {
  const violationTexts: string[] = [];

  for (const detail of params.details ?? []) {
    if (Array.isArray(detail.violations)) {
      for (const v of detail.violations) {
        if (v.quotaMetric) violationTexts.push(v.quotaMetric);
        if (v.quotaId) violationTexts.push(v.quotaId);
        if (v.description) violationTexts.push(v.description);
      }
    }
    if (detail.metadata && typeof detail.metadata === 'object') {
      for (const val of Object.values(detail.metadata)) {
        if (typeof val === 'string') violationTexts.push(val);
      }
    }
    if (typeof detail.reason === 'string') {
      violationTexts.push(detail.reason);
    }
  }

  if (violationTexts.length > 0) {
    const joined = violationTexts.join(' ');
    const hasDay = PER_DAY_REGEX.test(joined);
    const hasMinute = PER_MINUTE_REGEX.test(joined);
    if (hasDay && !hasMinute) return 'quota_day';
    if (hasMinute && !hasDay) return 'quota_minute';
  }

  const fallbackText = `${params.apiMessage} ${params.rawText}`;
  const hasDay = PER_DAY_REGEX.test(fallbackText);
  const hasMinute = PER_MINUTE_REGEX.test(fallbackText);
  if (hasDay && !hasMinute) {
    return 'quota_day';
  }
  return 'quota_minute';
}

export function createTimeoutError(
  kind: 'timeout' | 'timeout_budget',
  rawDetails: string
): GeminiRequestError {
  if (kind === 'timeout_budget') {
    return new GeminiRequestError({
      kind: 'timeout_budget',
      retryable: false,
      message: 'The request took too long across retries and hit the time limit.',
      userAction:
        'Try again, simplify your prompt, or switch to a faster model in Settings.',
      explanation:
        'The whole-call 240-second budget across attempts and retry waits was exceeded.',
      rawDetails,
    });
  }

  return new GeminiRequestError({
    kind: 'timeout',
    retryable: true,
    message: "Google didn't answer in time.",
    userAction: 'Retry the request, or switch to a faster model in Settings.',
    explanation:
      'A single HTTP attempt to Google Gemini exceeded the 120-second response timeout.',
    rawDetails,
  });
}

export function createBlockedError(params: {
  reason: string;
  explanation?: string;
  rawDetails: string;
}): GeminiRequestError {
  return new GeminiRequestError({
    kind: 'blocked',
    retryable: false,
    message: 'Google blocked this response due to safety or policy filters.',
    userAction: 'Adjust your prompt wording and try again.',
    explanation:
      params.explanation ??
      `Gemini stopped or blocked output (${params.reason}).`,
    rawDetails: params.rawDetails,
  });
}

export function createTruncatedError(params: {
  modelName: string;
  rawDetails: string;
}): GeminiRequestError {
  return new GeminiRequestError({
    kind: 'truncated',
    retryable: false,
    message: "The model's response was cut off before finishing.",
    userAction:
      'Try a shorter request or switch to a model with a higher output limit.',
    explanation: `${params.modelName} hit MAX_TOKENS without producing usable text.`,
    rawDetails: params.rawDetails,
  });
}

export function classifyFetchFailure(err: unknown): GeminiRequestError {
  if (err instanceof GeminiRequestError) {
    return err;
  }

  const errObj = err instanceof Error ? err : new Error(String(err));
  const rawDetails = `${errObj.name}: ${errObj.message}`;
  const lower = `${errObj.name} ${errObj.message}`.toLowerCase();

  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  const looksLikeCors =
    !isOffline &&
    (lower.includes('cors') ||
      lower.includes('cross-origin') ||
      lower.includes('access-control') ||
      lower.includes('blocked by'));

  if (looksLikeCors) {
    return new GeminiRequestError({
      kind: 'cors',
      retryable: false,
      message: 'The browser blocked the request to Google Gemini.',
      userAction:
        'Disable ad blockers or privacy extensions for this site, or check API key referrer rules.',
      explanation:
        'The browser blocked the cross-origin request before an HTTP status was received.',
      rawDetails,
    });
  }

  return new GeminiRequestError({
    kind: 'network',
    retryable: true,
    message: 'Could not reach Google Gemini due to a network error.',
    userAction: 'Check your internet connection and try again.',
    explanation: isOffline
      ? 'The browser appears to be offline.'
      : 'The request failed before receiving an HTTP response from generativelanguage.googleapis.com.',
    rawDetails,
  });
}

export interface HttpResponseLike {
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export async function parseHttpErrorResponse(
  response: HttpResponseLike,
  retryAfterCapMs: number
): Promise<GeminiRequestError> {
  const headerRetryAfterMs = parseRetryAfterHeaderMs(
    response.headers.get('Retry-After'),
    retryAfterCapMs
  );
  const rawText = await response.text().catch(() => '');
  let apiMessage = rawText || response.statusText || `HTTP ${response.status}`;
  let apiStatus: string | undefined;
  let details: GoogleErrorDetail[] | undefined;

  try {
    const parsed = JSON.parse(rawText) as ParsedGoogleErrorBody;
    if (parsed?.error) {
      apiMessage = parsed.error.message ?? apiMessage;
      apiStatus = parsed.error.status;
      details = parsed.error.details;
    }
  } catch {
    // Non-JSON response body
  }

  let bodyRetryDelayMs: number | undefined;
  for (const detail of details ?? []) {
    const candidate = parseGoogleRetryDelayMs(
      detail.retryDelay,
      retryAfterCapMs
    );
    if (candidate !== undefined) {
      bodyRetryDelayMs = candidate;
      break;
    }
  }

  const retryAfterMs = headerRetryAfterMs ?? bodyRetryDelayMs;
  const rawDetails = rawText || `HTTP ${response.status} ${response.statusText}`;
  const status = response.status;
  const normalizedApiStatus = apiStatus?.toUpperCase();

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalizedApiStatus === 'UNAVAILABLE'
  ) {
    return new GeminiRequestError({
      kind: 'overloaded',
      retryable: true,
      retryAfterMs,
      httpStatus: status,
      apiStatus,
      message:
        "Google's servers are busy with this model right now. This is temporary and not your quota.",
      userAction: 'Wait a moment and retry, or switch to another model in Settings.',
      explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Google's server reported temporary overload or unavailability. Server message: ${apiMessage}`,
      rawDetails,
    });
  }

  if (status === 429 || normalizedApiStatus === 'RESOURCE_EXHAUSTED') {
    const quotaKind = detect429QuotaKind({ apiMessage, rawText, details });
    if (quotaKind === 'quota_day') {
      const { localTime } = getNextQuotaResetInfo();
      return new GeminiRequestError({
        kind: 'quota_day',
        retryable: false,
        httpStatus: status,
        apiStatus,
        message: `Today's free quota for this model is used up. It resets at ${localTime}. You can switch to another model in Settings.`,
        userAction:
          'Switch to another model in Settings, or wait until the daily quota resets.',
        explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Daily request/token quota exhausted for this model. Server message: ${apiMessage}`,
        rawDetails,
      });
    }

    return new GeminiRequestError({
      kind: 'quota_minute',
      retryable: true,
      retryAfterMs,
      httpStatus: status,
      apiStatus,
      message:
        "You're sending requests too fast for this model. Waiting a moment.",
      userAction:
        'Wait a few seconds before sending again, or switch to another model in Settings.',
      explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Per-minute rate limit reached. Server message: ${apiMessage}`,
      rawDetails,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    normalizedApiStatus === 'UNAUTHENTICATED' ||
    normalizedApiStatus === 'PERMISSION_DENIED'
  ) {
    return new GeminiRequestError({
      kind: 'auth',
      retryable: false,
      httpStatus: status,
      apiStatus,
      message:
        status === 401
          ? 'Your Gemini API key was rejected or is missing.'
          : 'Access was denied for this Gemini API key.',
      userAction:
        'Check or replace your API key in Settings, and verify Gemini API access.',
      explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Authentication or permission error. Server message: ${apiMessage}`,
      rawDetails,
    });
  }

  if (status === 404 || normalizedApiStatus === 'NOT_FOUND') {
    return new GeminiRequestError({
      kind: 'model_not_found',
      retryable: true,
      httpStatus: status,
      apiStatus,
      message: 'The selected Gemini model was not found for this key.',
      userAction: 'Open Settings, refresh models, and select an available model.',
      explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Requested model or endpoint was not found. Server message: ${apiMessage}`,
      rawDetails,
    });
  }

  if (status === 400 || normalizedApiStatus === 'INVALID_ARGUMENT') {
    return new GeminiRequestError({
      kind: 'bad_request',
      retryable: false,
      httpStatus: status,
      apiStatus,
      message: 'Google rejected the request format or parameters.',
      userAction:
        'Try rephrasing your request or choose another model in Settings.',
      explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Invalid request sent to Gemini. Server message: ${apiMessage}`,
      rawDetails,
    });
  }

  return new GeminiRequestError({
    kind: 'unknown',
    retryable: false,
    httpStatus: status,
    apiStatus,
    message: 'Google returned an unexpected error.',
    userAction:
      'Open Details for server info, then retry or switch to another model in Settings.',
    explanation: `HTTP ${status}${apiStatus ? ` (${apiStatus})` : ''}: Unclassified API error. Server message: ${apiMessage}`,
    rawDetails,
  });
}
