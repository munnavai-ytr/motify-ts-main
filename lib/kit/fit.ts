import { splitGraphemes } from './anim';
import { stripHighlightMarkers } from './text-craft';

export interface FitTextOptions {
  text: string;
  maxWidth: number;
  maxHeight: number;
  fontFamily: string;
  fontWeight: number;
  minSize: number;
  maxSize: number;
  maxLines?: number;
  lineHeight?: number;
  letterSpacingEm?: number;
  balanceLines?: boolean;
}

export interface FitTextResult {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  displayText: string;
  truncated: boolean;
  warning?: string;
}

const FIT_CACHE_LIMIT = 800;
const fitCache = new Map<string, FitTextResult>();
let sharedCanvasCtx: CanvasRenderingContext2D | null = null;

export function clearFitTextCache(): void {
  fitCache.clear();
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (!sharedCanvasCtx) {
    const canvas = document.createElement('canvas');
    sharedCanvasCtx = canvas.getContext('2d');
  }
  return sharedCanvasCtx;
}

function measureLineWidth(
  ctx: CanvasRenderingContext2D | null,
  line: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacingEm: number
): number {
  if (!line) {
    return 0;
  }
  if (!ctx) {
    return splitGraphemes(line).length * fontSize * 0.56;
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const baseWidth = ctx.measureText(line).width;
  const extraTracking =
    letterSpacingEm !== 0
      ? Math.max(0, splitGraphemes(line).length - 1) * fontSize * letterSpacingEm
      : 0;
  return baseWidth + extraTracking;
}

function breakLongWord(
  word: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D | null,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacingEm: number
): string[] {
  const graphemes = splitGraphemes(word);
  if (graphemes.length <= 1) {
    return [word];
  }
  const chunks: string[] = [];
  let current = '';
  for (const g of graphemes) {
    const candidate = current + g;
    if (
      current.length > 0 &&
      measureLineWidth(
        ctx,
        candidate,
        fontSize,
        fontFamily,
        fontWeight,
        letterSpacingEm
      ) > maxWidth
    ) {
      chunks.push(current);
      current = g;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function balanceParagraphWords(
  words: readonly string[],
  greedyLineCount: number,
  maxWidth: number,
  ctx: CanvasRenderingContext2D | null,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacingEm: number
): string[] | null {
  const n = words.length;
  if (n <= 2 || greedyLineCount <= 1 || n > 44) {
    return null;
  }

  const wordWidths = words.map((w) =>
    measureLineWidth(ctx, w, fontSize, fontFamily, fontWeight, letterSpacingEm)
  );
  const spaceWidth = measureLineWidth(
    ctx,
    ' ',
    fontSize,
    fontFamily,
    fontWeight,
    letterSpacingEm
  );

  // Prefix widths for fast O(1) span width computation
  const prefixSum = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefixSum[i + 1] = prefixSum[i] + wordWidths[i];
  }

  const spanWidth = (i: number, j: number): number => {
    const wordsSum = prefixSum[j + 1] - prefixSum[i];
    const spaces = Math.max(0, j - i) * spaceWidth;
    return wordsSum + spaces;
  };

  const totalNaturalWidth = spanWidth(0, n - 1);
  const targetWidth = Math.min(
    maxWidth * 0.96,
    Math.max(maxWidth * 0.45, totalNaturalWidth / greedyLineCount)
  );

  // DP: dp[lineCount][i] = min cost to place words[0..i-1] into lineCount lines
  const INF = 1e18;
  const dp: number[][] = Array.from({ length: greedyLineCount + 1 }, () =>
    new Array<number>(n + 1).fill(INF)
  );
  const prevSplit: number[][] = Array.from({ length: greedyLineCount + 1 }, () =>
    new Array<number>(n + 1).fill(-1)
  );

  dp[0][0] = 0;

  for (let linesUsed = 1; linesUsed <= greedyLineCount; linesUsed++) {
    for (let end = linesUsed; end <= n; end++) {
      for (let start = linesUsed - 1; start < end; start++) {
        if (dp[linesUsed - 1][start] >= INF) {
          continue;
        }
        const w = spanWidth(start, end - 1);
        if (w > maxWidth) {
          continue;
        }

        const isLastLine = linesUsed === greedyLineCount && end === n;
        const diff = w - targetWidth;
        let lineCost = diff * diff;

        // Avoid orphan last line (< 25% of maxWidth or targetWidth)
        if (isLastLine && w < maxWidth * 0.25) {
          const orphanShortfall = maxWidth * 0.45 - w;
          lineCost += orphanShortfall * orphanShortfall * 8;
        }

        const total = dp[linesUsed - 1][start] + lineCost;
        if (total < dp[linesUsed][end]) {
          dp[linesUsed][end] = total;
          prevSplit[linesUsed][end] = start;
        }
      }
    }
  }

  if (dp[greedyLineCount][n] >= INF) {
    return null;
  }

  const balanced: string[] = [];
  let cursor = n;
  for (let linesUsed = greedyLineCount; linesUsed >= 1; linesUsed--) {
    const start = prevSplit[linesUsed][cursor];
    if (start < 0) {
      return null;
    }
    balanced.unshift(words.slice(start, cursor).join(' '));
    cursor = start;
  }

  return balanced;
}

function wrapTextLines(
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D | null,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacingEm: number,
  balanceLines: boolean
): { lines: string[]; hadHardWordBreak: boolean } {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  let hadHardWordBreak = false;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    const paraLines: string[] = [];
    let paraHardBreak = false;
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candidateW = measureLineWidth(
        ctx,
        candidate,
        fontSize,
        fontFamily,
        fontWeight,
        letterSpacingEm
      );
      if (candidateW <= maxWidth) {
        currentLine = candidate;
      } else if (!currentLine) {
        const singleW = measureLineWidth(
          ctx,
          word,
          fontSize,
          fontFamily,
          fontWeight,
          letterSpacingEm
        );
        if (singleW <= maxWidth) {
          currentLine = word;
        } else {
          paraHardBreak = true;
          hadHardWordBreak = true;
          const broken = breakLongWord(
            word,
            maxWidth,
            ctx,
            fontSize,
            fontFamily,
            fontWeight,
            letterSpacingEm
          );
          for (let i = 0; i < broken.length - 1; i++) {
            paraLines.push(broken[i]);
          }
          currentLine = broken[broken.length - 1] ?? '';
        }
      } else {
        paraLines.push(currentLine);
        const wordW = measureLineWidth(
          ctx,
          word,
          fontSize,
          fontFamily,
          fontWeight,
          letterSpacingEm
        );
        if (wordW <= maxWidth) {
          currentLine = word;
        } else {
          paraHardBreak = true;
          hadHardWordBreak = true;
          const broken = breakLongWord(
            word,
            maxWidth,
            ctx,
            fontSize,
            fontFamily,
            fontWeight,
            letterSpacingEm
          );
          for (let i = 0; i < broken.length - 1; i++) {
            paraLines.push(broken[i]);
          }
          currentLine = broken[broken.length - 1] ?? '';
        }
      }
    }

    if (currentLine) {
      paraLines.push(currentLine);
    }

    if (balanceLines && !paraHardBreak && paraLines.length >= 2) {
      const balanced = balanceParagraphWords(
        words,
        paraLines.length,
        maxWidth,
        ctx,
        fontSize,
        fontFamily,
        fontWeight,
        letterSpacingEm
      );
      if (balanced && balanced.length > 0) {
        lines.push(...balanced);
        continue;
      }
    }

    lines.push(...paraLines);
  }

  return { lines, hadHardWordBreak };
}

function truncateLineToWidth(
  line: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D | null,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacingEm: number
): string {
  const graphemes = splitGraphemes(line.trimEnd());
  while (graphemes.length > 0) {
    const candidate = `${graphemes.join('')}…`;
    if (
      measureLineWidth(
        ctx,
        candidate,
        fontSize,
        fontFamily,
        fontWeight,
        letterSpacingEm
      ) <= maxWidth
    ) {
      return candidate;
    }
    graphemes.pop();
  }
  return '…';
}

export function fitText(options: FitTextOptions): FitTextResult {
  const {
    text,
    maxWidth,
    maxHeight,
    fontFamily,
    fontWeight,
    minSize,
    maxSize,
    maxLines = 4,
    lineHeight = 1.15,
    letterSpacingEm = 0,
    balanceLines = true,
  } = options;

  const cleanText = stripHighlightMarkers(text).trim();
  const safeMin = Math.max(10, Math.round(minSize));
  const safeMax = Math.max(safeMin, Math.round(maxSize));
  const safeWidth = Math.max(40, Math.round(maxWidth));
  const safeHeight = Math.max(20, Math.round(maxHeight));

  if (!cleanText) {
    return {
      fontSize: safeMax,
      lineHeight,
      lines: [],
      displayText: '',
      truncated: false,
    };
  }

  const cacheKey = `${cleanText}__${safeWidth}x${safeHeight}__${fontFamily}__${fontWeight}__${safeMin}-${safeMax}__${maxLines}__${lineHeight}__${letterSpacingEm}__${balanceLines ? 1 : 0}`;
  const cached = fitCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const ctx = getMeasureContext();

  let lo = safeMin;
  let hi = safeMax;
  let bestSize = safeMin;
  let bestLines: string[] = [cleanText];
  let foundFit = false;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { lines, hadHardWordBreak } = wrapTextLines(
      cleanText,
      safeWidth,
      ctx,
      mid,
      fontFamily,
      fontWeight,
      letterSpacingEm,
      balanceLines
    );
    const totalHeight = lines.length * mid * lineHeight;
    const fitsLines = lines.length <= maxLines;
    const fitsHeight = totalHeight <= safeHeight;

    if (fitsLines && fitsHeight && !hadHardWordBreak) {
      foundFit = true;
      bestSize = mid;
      bestLines = lines;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (foundFit) {
    const result: FitTextResult = {
      fontSize: bestSize,
      lineHeight,
      lines: bestLines,
      displayText: bestLines.join('\n'),
      truncated: false,
    };
    if (fitCache.size >= FIT_CACHE_LIMIT) {
      fitCache.clear();
    }
    fitCache.set(cacheKey, result);
    return result;
  }

  const fallbackWrap = wrapTextLines(
    cleanText,
    safeWidth,
    ctx,
    safeMin,
    fontFamily,
    fontWeight,
    letterSpacingEm,
    balanceLines
  );
  const maxLinesByHeight = Math.max(
    1,
    Math.floor(safeHeight / (safeMin * lineHeight))
  );
  const allowedLines = Math.min(maxLines, maxLinesByHeight);
  let finalLines = fallbackWrap.lines;
  let truncated = false;

  if (finalLines.length > allowedLines) {
    truncated = true;
    const head = finalLines.slice(0, allowedLines);
    const lastIdx = head.length - 1;
    head[lastIdx] = truncateLineToWidth(
      head[lastIdx] ?? '',
      safeWidth,
      ctx,
      safeMin,
      fontFamily,
      fontWeight,
      letterSpacingEm
    );
    finalLines = head;
  }

  const result: FitTextResult = {
    fontSize: safeMin,
    lineHeight,
    lines: finalLines,
    displayText: finalLines.join('\n'),
    truncated,
    warning: truncated
      ? `Text truncated to fit ${safeWidth}x${safeHeight}px box at minSize ${safeMin}px.`
      : undefined,
  };

  if (fitCache.size >= FIT_CACHE_LIMIT) {
    fitCache.clear();
  }
  fitCache.set(cacheKey, result);
  return result;
}
