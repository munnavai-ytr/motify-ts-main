import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  interpolateColors,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { transform } from 'sucrase';
import { sanitizeCode } from './sanitize';

export type CompiledComponentType = React.ComponentType<Record<string, unknown>>;

export interface CompileSuccess {
  ok: true;
  component: CompiledComponentType;
  sanitizedCode: string;
  transpiledCode: string;
}

export interface CompileFailure {
  ok: false;
  internal?: boolean;
  error: string;
  line?: number;
  column?: number;
  codeSnippet?: string;
  sanitizedCode: string;
  transpiledCode?: string;
}

export type CompileResult = CompileSuccess | CompileFailure;

const ALLOWED_REMOTION_EXPORTS = {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  random,
};

// Note: Never include 'eval' or 'arguments' in function parameter names because
// strict mode forbids them as formal parameter identifiers.
const SHADOWED_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'globalThis',
  'self',
  'top',
  'parent',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'Date',
] as const;

/**
 * Strips comments and literal text inside single/double quotes and template
 * literals while preserving `${ ... }` interpolation expressions and `\n`
 * line counts so line numbers remain accurate and template text never causes
 * identifier false positives.
 */
function maskCommentsAndLiteralsPreserveExpressions(source: string): string {
  const out: string[] = [];
  const len = source.length;

  type Mode = 'code' | 'template';
  const stack: Array<{ mode: Mode; braceDepth: number }> = [
    { mode: 'code', braceDepth: 0 },
  ];

  let i = 0;
  while (i < len) {
    const topFrame = stack[stack.length - 1];
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    if (topFrame.mode === 'template') {
      if (ch === '\\') {
        out.push(' ');
        if (i + 1 < len) {
          out.push(source[i + 1] === '\n' ? '\n' : ' ');
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (ch === '`') {
        out.push('`');
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        out.push('${');
        stack.push({ mode: 'code', braceDepth: 1 });
        i += 2;
        continue;
      }
      out.push(ch === '\n' ? '\n' : ' ');
      i += 1;
      continue;
    }

    // Mode === 'code'
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < len && source[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      out.push('  ');
      i += 2;
      while (i < len) {
        if (source[i] === '*' && i + 1 < len && source[i + 1] === '/') {
          out.push('  ');
          i += 2;
          break;
        }
        out.push(source[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      continue;
    }

    // Single or double quoted string literal
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out.push(quote);
      i += 1;
      while (i < len) {
        const cur = source[i];
        if (cur === '\\') {
          out.push(' ');
          if (i + 1 < len) {
            out.push(source[i + 1] === '\n' ? '\n' : ' ');
            i += 2;
          } else {
            i += 1;
          }
          continue;
        }
        if (cur === quote) {
          out.push(quote);
          i += 1;
          break;
        }
        out.push(cur === '\n' ? '\n' : ' ');
        i += 1;
      }
      continue;
    }

    // Template literal start
    if (ch === '`') {
      out.push('`');
      stack.push({ mode: 'template', braceDepth: 0 });
      i += 1;
      continue;
    }

    // Brace tracking inside `${ ... }`
    if (stack.length > 1) {
      if (ch === '{') {
        topFrame.braceDepth += 1;
        out.push('{');
        i += 1;
        continue;
      }
      if (ch === '}') {
        topFrame.braceDepth -= 1;
        out.push('}');
        i += 1;
        if (topFrame.braceDepth === 0) {
          stack.pop();
        }
        continue;
      }
    }

    out.push(ch);
    i += 1;
  }

  return out.join('');
}

function findLineNumber(source: string, index: number): number {
  if (index <= 0) return 1;
  return source.slice(0, index).split('\n').length;
}

export function checkCodeSafety(
  sanitizedCode: string
): { ok: true } | { ok: false; error: string; line: number } {
  const masked = maskCommentsAndLiteralsPreserveExpressions(sanitizedCode);

  const structuralRules: Array<{ regex: RegExp; label: string }> = [
    { regex: /\bimport\s*\(/, label: 'dynamic import()' },
    { regex: /\b__proto__\b/, label: '__proto__' },
    {
      regex: /constructor\s*\.\s*constructor|\[\s*['"`]constructor['"`]\s*\]/,
      label: 'constructor access',
    },
    { regex: /\bdangerouslySetInnerHTML\b/, label: 'dangerouslySetInnerHTML' },
    { regex: /\bwhile\s*\(\s*true\s*\)/, label: 'infinite while(true) loop' },
    { regex: /\bfor\s*\(\s*;\s*;\s*\)/, label: 'infinite for(;;) loop' },
    {
      regex: /\bMath\s*\.\s*random\b/,
      label: 'Math.random (use random("seed") from remotion)',
    },
  ];

  for (const rule of structuralRules) {
    const match = rule.regex.exec(masked);
    if (match) {
      return {
        ok: false,
        error: `Forbidden pattern detected: ${rule.label}.`,
        line: findLineNumber(sanitizedCode, match.index),
      };
    }
  }

  // Check require(...) on original comment-stripped strings so module string literal is readable
  const noComments = sanitizedCode
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ');
  const requireRegex = /\brequire\s*\(\s*([^)]*)\s*\)/g;
  let reqMatch: RegExpExecArray | null;
  while ((reqMatch = requireRegex.exec(noComments)) !== null) {
    const arg = reqMatch[1].trim();
    if (
      arg !== "'react'" &&
      arg !== '"react"' &&
      arg !== "'remotion'" &&
      arg !== '"remotion"'
    ) {
      return {
        ok: false,
        error: `Forbidden require(${arg}). Only "react" and "remotion" may be imported.`,
        line: findLineNumber(sanitizedCode, reqMatch.index),
      };
    }
  }

  // Reject global forbidden identifiers while ignoring property accesses (`.name`)
  // and object key definitions (`name:`).
  const identifierRegex =
    /(?<![.\w$])(window|document|localStorage|sessionStorage|indexedDB|globalThis|self|top|parent|fetch|XMLHttpRequest|WebSocket|eval|Function|setTimeout|setInterval|requestAnimationFrame|Date)(?!\s*:)\b/g;

  const idMatch = identifierRegex.exec(masked);
  if (idMatch) {
    return {
      ok: false,
      error: `Forbidden global or API identifier "${idMatch[1]}". Scene components must be pure frame functions.`,
      line: findLineNumber(sanitizedCode, idMatch.index),
    };
  }

  return { ok: true };
}

function getCodeSnippet(source: string, lineNumber: number): string {
  const lines = source.split('\n');
  const start = Math.max(0, lineNumber - 2);
  const end = Math.min(lines.length, lineNumber + 1);
  return lines
    .slice(start, end)
    .map((text, idx) => {
      const currentLine = start + idx + 1;
      const marker = currentLine === lineNumber ? '>' : ' ';
      return `${marker} ${String(currentLine).padStart(3, ' ')} | ${text}`;
    })
    .join('\n');
}

function extractLineFromStack(stack?: string): { line?: number; column?: number } {
  if (!stack) return {};
  const match = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (!match) return {};
  const rawLine = Number.parseInt(match[1], 10);
  const column = Number.parseInt(match[2], 10);
  const adjustedLine = Math.max(1, rawLine - 3);
  return { line: adjustedLine, column };
}

/**
 * Compiles a TSX/JSX Remotion component string in the browser using Sucrase,
 * enforces static safety checks, and evaluates it inside an isolated function
 * scope exposing only React and allowed Remotion exports while shadowing
 * forbidden browser/runtime globals as undefined.
 *
 * Kept behind a single boundary function so it can later be swapped for a
 * sandboxed iframe evaluator without changing callers.
 */
export function compileComponent(source: string): CompileResult {
  const sanitizedCode = sanitizeCode(source);
  if (!sanitizedCode) {
    return {
      ok: false,
      error: 'No code found after stripping markdown fences and prose.',
      sanitizedCode,
    };
  }

  const safety = checkCodeSafety(sanitizedCode);
  if (!safety.ok) {
    return {
      ok: false,
      error: `Safety check failed (line ${safety.line}): ${safety.error}`,
      line: safety.line,
      codeSnippet: getCodeSnippet(sanitizedCode, safety.line),
      sanitizedCode,
    };
  }

  let transpiledCode = '';
  try {
    const result = transform(sanitizedCode, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'Scene.tsx',
    });
    transpiledCode = result.code;
  } catch (err: unknown) {
    const sucraseErr = err as Error & { loc?: { line: number; column: number } };
    const line = sucraseErr.loc?.line;
    const column = sucraseErr.loc?.column;
    const locationText =
      line !== undefined
        ? ` (line ${line}${column !== undefined ? `, col ${column}` : ''})`
        : '';
    return {
      ok: false,
      error: `Transpile error${locationText}: ${sucraseErr.message}`,
      line,
      column,
      codeSnippet: line !== undefined ? getCodeSnippet(sanitizedCode, line) : undefined,
      sanitizedCode,
    };
  }

  const reactModule = {
    ...React,
    default: React,
    __esModule: true,
  };

  const remotionModule = {
    ...ALLOWED_REMOTION_EXPORTS,
    __esModule: true,
  };

  const safeRequire = (moduleId: string): unknown => {
    if (moduleId === 'react') {
      return reactModule;
    }
    if (moduleId === 'remotion') {
      return remotionModule;
    }
    throw new Error(
      `Unsupported import "${moduleId}". Only "react" and "remotion" are allowed.`
    );
  };

  const exportsObj: Record<string, unknown> = {};
  const moduleObj: { exports: unknown } = { exports: exportsObj };

  let evaluator: (...args: unknown[]) => unknown;
  try {
    evaluator = new Function(
      'require',
      'exports',
      'module',
      'React',
      'AbsoluteFill',
      'interpolate',
      'interpolateColors',
      'spring',
      'useCurrentFrame',
      'useVideoConfig',
      'Sequence',
      'Easing',
      'random',
      ...SHADOWED_FORBIDDEN_GLOBALS,
      `'use strict';\n{\n${transpiledCode}\n}`
    ) as (...args: unknown[]) => unknown;
  } catch (err: unknown) {
    const ctorErr = err instanceof Error ? err : new Error(String(err));
    return {
      ok: false,
      internal: true,
      error: `Internal compiler error: ${ctorErr.message}`,
      sanitizedCode,
      transpiledCode,
    };
  }

  try {
    evaluator(
      safeRequire,
      exportsObj,
      moduleObj,
      React,
      AbsoluteFill,
      interpolate,
      interpolateColors,
      spring,
      useCurrentFrame,
      useVideoConfig,
      Sequence,
      Easing,
      random,
      ...SHADOWED_FORBIDDEN_GLOBALS.map(() => undefined)
    );
  } catch (err: unknown) {
    const evalErr = err instanceof Error ? err : new Error(String(err));
    const { line, column } = extractLineFromStack(evalErr.stack);
    const locationText =
      line !== undefined
        ? ` (transpiled line ~${line}${column !== undefined ? `, col ${column}` : ''})`
        : '';
    return {
      ok: false,
      error: `Evaluation error${locationText}: ${evalErr.message}`,
      line,
      column,
      codeSnippet: line !== undefined ? getCodeSnippet(transpiledCode, line) : undefined,
      sanitizedCode,
      transpiledCode,
    };
  }

  const exported = moduleObj.exports;
  const candidate =
    typeof exported === 'function'
      ? exported
      : exported && typeof exported === 'object' && 'default' in exported
        ? (exported as { default: unknown }).default
        : undefined;

  if (typeof candidate !== 'function') {
    return {
      ok: false,
      error:
        'Compiled module did not default-export a React component function. Add `export default Scene;` or `export default function Scene() { ... }`.',
      sanitizedCode,
      transpiledCode,
    };
  }

  return {
    ok: true,
    component: candidate as CompiledComponentType,
    sanitizedCode,
    transpiledCode,
  };
}
