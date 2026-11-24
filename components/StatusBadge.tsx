'use client';

import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Loader2,
  XCircle,
} from 'lucide-react';

export type TestStatus = 'not_run' | 'running' | 'passed' | 'failed';

const STATUS_META: Record<
  TestStatus,
  {
    label: string;
    classes: string;
    Icon: React.ComponentType<{ className?: string }>;
    spin?: boolean;
  }
> = {
  not_run: {
    label: 'Not run',
    classes: 'bg-slate-800/80 text-slate-300 border-slate-700',
    Icon: CircleDashed,
  },
  running: {
    label: 'Running',
    classes: 'bg-amber-950/60 text-amber-300 border-amber-700/70',
    Icon: Loader2,
    spin: true,
  },
  passed: {
    label: 'Passed',
    classes: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/70',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-950/60 text-red-300 border-red-700/70',
    Icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: TestStatus }) {
  const { label, classes, Icon, spin } = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </span>
  );
}

export function ErrorDisplay({
  title = 'Error',
  message,
  details,
}: {
  title?: string;
  message: string;
  details?: string;
}) {
  const [copied, setCopied] = useState(false);

  const fullText = details ? `${message}\n\n${details}` : message;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback if clipboard API is unavailable
    }
  };

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-800/70 bg-red-950/35 p-3.5 text-sm text-red-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-red-300">{title}</div>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed text-red-100">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-red-700/70 bg-red-900/40 px-2.5 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {details && (
        <pre className="mt-2.5 max-h-48 overflow-auto rounded-md border border-red-900/60 bg-[#080C14] p-2.5 font-mono text-xs leading-relaxed text-red-200 whitespace-pre-wrap break-words">
          {details}
        </pre>
      )}
    </div>
  );
}
