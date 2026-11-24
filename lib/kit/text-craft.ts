export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Parses `[[double-bracket]]` emphasis spans while keeping unclosed/empty
 * brackets safe and preserving whitespace.
 */
export function parseHighlightSegments(input: string): HighlightSegment[] {
  if (!input.includes('[[')) {
    return input ? [{ text: input, highlighted: false }] : [];
  }

  const segments: HighlightSegment[] = [];
  const regex = /\[\[([\s\S]*?)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        highlighted: false,
      });
    }
    const inner = match[1];
    if (inner.length > 0) {
      segments.push({ text: inner, highlighted: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({
      text: input.slice(lastIndex),
      highlighted: false,
    });
  }

  return segments;
}

export function stripHighlightMarkers(input: string): string {
  if (!input.includes('[[')) {
    return input;
  }
  return input.replace(/\[\[([\s\S]*?)\]\]/g, '$1');
}

/**
 * Uppercases Latin segments only so Bengali conjunct clusters and vowel matras
 * remain 100% untouched.
 */
export function applyCaseTransform(text: string, uppercase: boolean): string {
  if (!uppercase || !text) {
    return text;
  }
  return text.replace(/[a-z\u00e0-\u00f6\u00f8-\u00ff]+/g, (segment) =>
    segment.toUpperCase()
  );
}

/**
 * Aligns wrapped plain lines produced by fitText back to `[[...]]` highlighted
 * spans from the source text so highlight markers can span across wrapped lines.
 */
export function mapLinesToHighlightedRuns(
  sourceWithBrackets: string,
  wrappedPlainLines: readonly string[]
): HighlightSegment[][] {
  if (!sourceWithBrackets.includes('[[')) {
    return wrappedPlainLines.map((line) => [{ text: line, highlighted: false }]);
  }

  const rawSegments = parseHighlightSegments(sourceWithBrackets);
  const charFlags: boolean[] = [];
  const plainJoined = rawSegments
    .map((seg) => {
      const len = Array.from(seg.text).length;
      for (let k = 0; k < len; k++) {
        charFlags.push(seg.highlighted);
      }
      return seg.text;
    })
    .join('');

  let cursor = 0;
  return wrappedPlainLines.map((line) => {
    // Advance past whitespace separator where wrapping broke lines
    while (cursor < plainJoined.length && /\s/.test(plainJoined[cursor] ?? '')) {
      if (line.startsWith(plainJoined[cursor] ?? '')) {
        break;
      }
      cursor++;
    }

    const chars = Array.from(line);
    const lineSegments: HighlightSegment[] = [];
    let currentText = '';
    let currentHighlighted: boolean | null = null;

    for (const ch of chars) {
      // Handle truncation ellipsis inserted by fitText at the end
      let flagged = false;
      if (cursor < plainJoined.length && plainJoined[cursor] === ch) {
        flagged = charFlags[cursor] ?? false;
        cursor++;
      } else if (cursor < plainJoined.length) {
        // Skip mismatched whitespace if any, otherwise match best effort
        let scan = cursor;
        while (scan < plainJoined.length && /\s/.test(plainJoined[scan] ?? '')) {
          scan++;
        }
        if (scan < plainJoined.length && plainJoined[scan] === ch) {
          flagged = charFlags[scan] ?? false;
          cursor = scan + 1;
        }
      }

      if (currentHighlighted === null) {
        currentHighlighted = flagged;
        currentText = ch;
      } else if (currentHighlighted === flagged) {
        currentText += ch;
      } else {
        lineSegments.push({ text: currentText, highlighted: currentHighlighted });
        currentText = ch;
        currentHighlighted = flagged;
      }
    }

    if (currentText) {
      lineSegments.push({
        text: currentText,
        highlighted: currentHighlighted ?? false,
      });
    }

    return lineSegments;
  });
}
