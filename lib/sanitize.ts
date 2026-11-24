/**
 * Sanitizes LLM or pasted source output into clean TSX/JSX code by stripping
 * markdown code fences and any surrounding prose explanations.
 */
export function sanitizeCode(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  // 1. Extract fenced code blocks if present (```tsx ... ``` or ``` ... ```)
  const fenceRegex = /```(?:[a-zA-Z0-9_-]+)?[ \t]*\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(normalized)) !== null) {
    if (match[1] && match[1].trim().length > 0) {
      blocks.push(match[1].trim());
    }
  }

  if (blocks.length > 0) {
    // Prefer the block that looks like a Remotion component or default export
    const preferred =
      blocks.find(
        (b) =>
          b.includes('export default') &&
          (b.includes('remotion') || b.includes('AbsoluteFill') || b.includes('React'))
      ) ??
      blocks.find((b) => b.includes('export default')) ??
      blocks.reduce((longest, current) =>
        current.length > longest.length ? current : longest
      );
    return preferred.trim();
  }

  // 2. Handle an unclosed opening markdown fence (e.g. truncated response)
  let text = normalized;
  const unclosedFenceMatch = text.match(/^```(?:[a-zA-Z0-9_-]+)?[ \t]*\n([\s\S]*)$/);
  if (unclosedFenceMatch) {
    text = unclosedFenceMatch[1].replace(/\n```[ \t]*$/, '').trim();
  }

  // 3. Strip leading prose lines before the first code-like line
  const lines = text.split('\n');
  const codeStartPattern =
    /^\s*(import\s+|export\s+|const\s+|let\s+|var\s+|function\s+|class\s+|type\s+|interface\s+|\/\/|\/\*|'use\s+client'|"use\s+client"|<[A-Za-z])/;

  let startIdx = lines.findIndex((line) => codeStartPattern.test(line));
  if (startIdx === -1) {
    // No clear code start found; return trimmed text so compiler reports real error
    return text.trim();
  }

  // 4. Strip trailing prose lines after the last code terminator
  let endIdx = lines.length - 1;
  while (endIdx > startIdx) {
    const line = lines[endIdx].trim();
    if (line === '') {
      endIdx--;
      continue;
    }
    // Check if the line looks like code vs trailing natural-language explanation
    const looksLikeCode =
      /[{};()=<>\[\]/*`'"\\]/.test(line) ||
      /^(export|return|import|const|let|var|function|type|interface)\b/.test(line);
    if (looksLikeCode) {
      break;
    }
    endIdx--;
  }

  return lines.slice(startIdx, endIdx + 1).join('\n').trim();
}
