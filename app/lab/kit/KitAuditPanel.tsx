'use client';

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Play,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AuditIssue, AuditReport, AuditSeverity } from '@/lib/kit';

export interface FixtureScoreEntry {
  id: string;
  label: string;
  isAuditTest: boolean;
  score: number;
  issueCount: number;
  durationMs: number;
  codes: string[];
}

export interface AutoFixSummaryBanner {
  scoreBefore: number;
  scoreAfter: number;
  applied: string[];
  remainingCount: number;
}

export interface KitAuditPanelProps {
  report: AuditReport | null;
  auditing: boolean;
  fixing: boolean;
  scoringAll: boolean;
  autoRun: boolean;
  targetSecondsInput: string;
  onTargetSecondsChange: (val: string) => void;
  onToggleAutoRun: () => void;
  onRunAudit: () => void;
  onAutoFix: () => void;
  onUndoAutoFix: () => void;
  lastFixSummary: AutoFixSummaryBanner | null;
  canUndoFix: boolean;
  onIssueClick: (issue: AuditIssue) => void;
  onScoreAllFixtures: () => void;
  fixtureScores: FixtureScoreEntry[];
  onLoadFixtureById: (id: string) => void;
}

const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

function scoreBadgeTone(score: number): string {
  if (score >= 90) {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
  }
  if (score >= 70) {
    return 'bg-amber-500/15 text-amber-400 border-amber-500/35';
  }
  return 'bg-rose-500/15 text-rose-400 border-rose-500/35';
}

function severityBadgeTone(severity: AuditSeverity): string {
  switch (severity) {
    case 'error':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'warn':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'info':
    default:
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  }
}

export function KitAuditPanel({
  report,
  auditing,
  fixing,
  scoringAll,
  autoRun,
  targetSecondsInput,
  onTargetSecondsChange,
  onToggleAutoRun,
  onRunAudit,
  onAutoFix,
  onUndoAutoFix,
  lastFixSummary,
  canUndoFix,
  onIssueClick,
  onScoreAllFixtures,
  fixtureScores,
  onLoadFixtureById,
}: KitAuditPanelProps) {
  const sortedIssues = report
    ? [...report.issues].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      )
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4 text-xs">
      {/* Header + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-text">Quality Audit</span>
          {report ? (
            <span
              data-testid="audit-overall-score"
              className={`rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${scoreBadgeTone(
                report.score
              )}`}
            >
              Score {report.score}/100
            </span>
          ) : null}
          {report ? (
            <span className="font-mono text-[11px] text-text-muted tabular-nums">
              {report.durationMs}ms · {report.actualSeconds.toFixed(1)}s
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span>Target(s)</span>
            <input
              type="number"
              min={1}
              max={180}
              step={0.5}
              placeholder="—"
              value={targetSecondsInput}
              onChange={(e) => onTargetSecondsChange(e.target.value)}
              className="w-14 rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-text tabular-nums"
            />
          </label>

          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={onToggleAutoRun}
              className="accent-accent cursor-pointer"
            />
            <span>Auto (800ms)</span>
          </label>

          <Button
            variant="primary"
            size="sm"
            loading={auditing}
            onClick={onRunAudit}
          >
            <Play className="h-3.5 w-3.5" />
            Run quality check
          </Button>

          {report && report.issues.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              loading={fixing}
              onClick={onAutoFix}
            >
              <Wand2 className="h-3.5 w-3.5 text-accent" />
              Auto-fix
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            loading={scoringAll}
            onClick={onScoreAllFixtures}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Score all fixtures
          </Button>
        </div>
      </div>

      {/* Auto-fix summary banner with 1-tap Undo */}
      {lastFixSummary ? (
        <div
          data-testid="autofix-summary"
          className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                Auto-fix: Score {lastFixSummary.scoreBefore} →{' '}
                {lastFixSummary.scoreAfter}
              </span>
              <span className="font-normal text-text-secondary">
                ({lastFixSummary.applied.length} fixes,{' '}
                {lastFixSummary.remainingCount} remaining)
              </span>
            </div>
            {canUndoFix ? (
              <Button variant="secondary" size="sm" onClick={onUndoAutoFix}>
                <Undo2 className="h-3.5 w-3.5" />
                Undo fix
              </Button>
            ) : null}
          </div>
          {lastFixSummary.applied.length > 0 ? (
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-text-secondary">
              {lastFixSummary.applied.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Current Report Issues */}
      {report ? (
        sortedIssues.length === 0 ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>All 12 layout & rhythm quality checks passed cleanly.</span>
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              cache {report.cacheHits}/{report.cacheHits + report.cacheMisses}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-0.5">
            {sortedIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onIssueClick(issue)}
                className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left hover:border-accent transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-2 min-w-0">
                  {issue.severity === 'error' ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                  ) : issue.severity === 'warn' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${severityBadgeTone(
                          issue.severity
                        )}`}
                      >
                        {issue.code}
                      </span>
                      <span className="font-semibold text-text">
                        {issue.message}
                      </span>
                    </div>
                    {issue.detail ? (
                      <div className="mt-0.5 text-[11px] text-text-secondary">
                        {issue.detail}
                      </div>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-text-muted tabular-nums">
                  {issue.sceneIndex !== null
                    ? `S${issue.sceneIndex + 1} · ${issue.frame ?? 0}f`
                    : 'Global'}
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2.5 text-[11px] text-text-secondary">
          Click &ldquo;Run quality check&rdquo; to inspect rendered scenes at entry and hold frames via Remotion Thumbnail.
        </div>
      )}

      {/* Batch All Fixtures Scorecard */}
      {fixtureScores.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-2.5">
          <div className="text-[11px] font-semibold text-text">
            All Fixtures Audit Scorecard ({fixtureScores.length})
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {fixtureScores.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onLoadFixtureById(entry.id)}
                className="flex items-center justify-between gap-2 rounded border border-border/70 bg-surface-1 px-2.5 py-1.5 text-left hover:border-accent cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-text">
                    {entry.label}
                  </div>
                  <div className="truncate font-mono text-[10px] text-text-muted">
                    {entry.codes.length > 0
                      ? entry.codes.join(', ')
                      : 'No issues'}
                    {' · '}
                    {entry.durationMs}ms
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${scoreBadgeTone(
                    entry.score
                  )}`}
                >
                  {entry.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
