import {
  classifyFetchFailure,
  createLinkedAbortHandle,
  createTimeoutError,
  GeminiRequestError,
  isAbortError,
  parseHttpErrorResponse,
  type GeminiErrorKind,
} from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';
import {
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  type GeminiStatusEvent,
} from '@/lib/ai/gemini-client';

export { GeminiRequestError, isAbortError, type GeminiErrorKind };

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const REMOTION_SYSTEM_INSTRUCTION = [
  'Output ONLY one TSX file.',
  'Export exactly one default-exported React component named Scene.',
  'Import ONLY from "react" and "remotion". Never import any other package.',
  'Allowed remotion imports: AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing.',
  'Use ONLY elements supported by the Remotion browser renderer: divs with basic inline layout styles, SVG elements, and text using a system font stack (e.g. system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif).',
  'Composition dimensions are 1920x1080 at 30 fps for 150 frames (5 seconds).',
  'Use spring(), interpolate(), and Sequence for motion.',
  'Do NOT use external assets, external URLs, images, audio, video, custom fonts, CSS filters, backdrop-filter, or CSS background-image / gradients.',
  'Do NOT include markdown fences or any explanations. Output raw TSX code only.',
].join('\n');

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return '•'.repeat(trimmed.length);
  }
  const hiddenCount = Math.min(12, trimmed.length - 8);
  return `${trimmed.slice(0, 4)}${'•'.repeat(hiddenCount)}${trimmed.slice(-4)}`;
}

export async function listGeminiModels(
  apiKey: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{
  models: GeminiModel[];
  elapsedMs: number;
}> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new GeminiRequestError({
      kind: 'auth',
      retryable: false,
      message: 'Your Gemini API key is missing.',
      userAction: 'Enter and save a Gemini API key before loading models.',
      explanation: 'API key is empty.',
      rawDetails: 'Missing API key',
    });
  }

  const start = performance.now();
  const collected: GeminiModel[] = [];
  let pageToken: string | undefined;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;

  do {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const url = new URL(`${GEMINI_API_BASE}/models`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const linkedAbort = createLinkedAbortHandle(options?.signal);
    let timedOut = false;
    const timerId = globalThis.setTimeout(() => {
      timedOut = true;
      linkedAbort.abortForTimeout();
    }, timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-goog-api-key': trimmedKey,
        },
        signal: linkedAbort.signal,
      });

      if (!response.ok) {
        throw await parseHttpErrorResponse(response, 60_000);
      }

      const data = (await response.json()) as {
        models?: Array<{
          name?: string;
          displayName?: string;
          description?: string;
          supportedGenerationMethods?: string[];
          inputTokenLimit?: number;
          outputTokenLimit?: number;
        }>;
        nextPageToken?: string;
      };

      for (const m of data.models ?? []) {
        if (!m.name) continue;
        collected.push({
          name: m.name,
          displayName: m.displayName ?? m.name,
          description: m.description,
          supportedGenerationMethods: m.supportedGenerationMethods ?? [],
          inputTokenLimit: m.inputTokenLimit,
          outputTokenLimit: m.outputTokenLimit,
        });
      }

      pageToken = data.nextPageToken;
    } catch (err: unknown) {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (timedOut || (isAbortError(err) && !options?.signal?.aborted)) {
        throw createTimeoutError(
          'timeout',
          `listGeminiModels timed out after ${timeoutMs}ms.`
        );
      }
      throw classifyFetchFailure(err);
    } finally {
      globalThis.clearTimeout(timerId);
      linkedAbort.cleanup();
    }
  } while (pageToken);

  const elapsedMs = Math.round(performance.now() - start);
  return { models: collected, elapsedMs };
}

export async function generateWithGemini(params: {
  apiKey: string;
  modelName: string;
  backupModelName?: string;
  prompt: string;
  systemInstruction?: string;
  signal?: AbortSignal;
  onStatus?: (event: GeminiStatusEvent) => void;
}): Promise<{
  text: string;
  elapsedMs: number;
  finishReason?: string;
  answeringModel: string;
}> {
  const result = await callGeminiWithPolicy({
    apiKey: params.apiKey,
    modelName: params.modelName,
    backupModelName: params.backupModelName,
    systemInstruction: params.systemInstruction,
    contents: [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ],
    signal: params.signal,
    onStatus: params.onStatus,
  });

  return {
    text: result.text,
    elapsedMs: result.elapsedMs,
    finishReason: result.finishReason,
    answeringModel: result.answeringModel,
  };
}
