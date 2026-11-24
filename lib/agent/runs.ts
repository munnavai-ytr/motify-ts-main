import {
  createDbId,
  getRun,
  listRunsForProject,
  markInterruptedRunsOnBoot,
  putRun,
} from '@/lib/db';
import type {
  AgentAction,
  AgentRun,
  AgentRunError,
  RunStatus,
  RunStep,
  RunStepId,
  RunStepStatus,
} from '@/lib/types';

export function buildInitialRunSteps(hasAttachments = false): RunStep[] {
  const steps: RunStep[] = [
    { id: 'understand', label: 'Reading your request', status: 'pending' },
  ];
  if (hasAttachments) {
    steps.push({
      id: 'attachments',
      label: 'Looking at your files',
      status: 'pending',
    });
  }
  steps.push(
    { id: 'design', label: 'Designing the video', status: 'pending' },
    { id: 'check', label: 'Checking quality', status: 'pending' },
    { id: 'save', label: 'Saving', status: 'pending' }
  );
  return steps;
}

export function createAgentRun(input: {
  projectId: string;
  userMessageId: string;
  userPrompt: string;
  hasAttachments?: boolean;
  modelName?: string;
  requestedModelName?: string;
}): AgentRun {
  const now = Date.now();
  return {
    id: createDbId(),
    projectId: input.projectId,
    userMessageId: input.userMessageId,
    userPrompt: input.userPrompt,
    status: 'running',
    steps: buildInitialRunSteps(Boolean(input.hasAttachments)),
    artifacts: {},
    usage: {
      requests: 0,
      promptTokens: 0,
      outputTokens: 0,
      thoughtTokens: 0,
    },
    ...(input.modelName ? { modelName: input.modelName } : {}),
    ...(input.requestedModelName
      ? { requestedModelName: input.requestedModelName }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function withStepStatus(
  run: AgentRun,
  stepId: RunStepId,
  status: RunStepStatus,
  detail?: string,
  label?: string
): AgentRun {
  const now = Date.now();
  const hasStep = run.steps.some((s) => s.id === stepId);
  const nextSteps: RunStep[] = hasStep
    ? run.steps.map((step) => {
        if (step.id !== stepId) return step;
        return {
          ...step,
          status,
          ...(label !== undefined ? { label } : {}),
          startedAt:
            step.startedAt ?? (status === 'running' ? now : undefined),
          finishedAt:
            status === 'done' ||
            status === 'paused' ||
            status === 'failed' ||
            status === 'skipped'
              ? now
              : undefined,
          ...(detail !== undefined ? { detail } : {}),
        };
      })
    : [
        ...run.steps,
        {
          id: stepId,
          label: label ?? stepId,
          status,
          startedAt: now,
          ...(status !== 'running' ? { finishedAt: now } : {}),
          ...(detail !== undefined ? { detail } : {}),
        },
      ];

  return {
    ...run,
    steps: nextSteps,
    updatedAt: now,
  };
}

export function appendStepSubNote(
  run: AgentRun,
  stepId: RunStepId,
  note: string
): AgentRun {
  const now = Date.now();
  return {
    ...run,
    steps: run.steps.map((step) => {
      if (step.id !== stepId) return step;
      const existing = step.subNotes ?? [];
      if (existing[existing.length - 1] === note) return step;
      return { ...step, subNotes: [...existing, note] };
    }),
    updatedAt: now,
  };
}

export function appendRunSubNote(run: AgentRun, note: string): AgentRun {
  const now = Date.now();
  const existing = run.subNotes ?? [];
  const nextRunNotes =
    existing[existing.length - 1] === note ? existing : [...existing, note];
  const runningStep = run.steps.find((s) => s.status === 'running');
  return {
    ...run,
    subNotes: nextRunNotes,
    steps: runningStep
      ? run.steps.map((step) => {
          if (step.id !== runningStep.id) return step;
          const prev = step.subNotes ?? [];
          if (prev[prev.length - 1] === note) return step;
          return { ...step, subNotes: [...prev, note] };
        })
      : run.steps,
    updatedAt: now,
  };
}

export function withRunAction(run: AgentRun, action: AgentAction): AgentRun {
  const now = Date.now();
  const nextSteps = run.steps.map((step) => {
    if (action === 'reply' || action === 'ask') {
      if (
        step.id === 'design' ||
        step.id === 'apply' ||
        step.id === 'check' ||
        step.id === 'save'
      ) {
        return { ...step, status: 'skipped' as const };
      }
    } else if (action === 'create') {
      if (step.id === 'apply') {
        return { ...step, status: 'skipped' as const };
      }
    } else if (action === 'edit') {
      if (step.id === 'design') {
        return { ...step, status: 'skipped' as const };
      }
    }
    return step;
  });

  return {
    ...run,
    action,
    steps: nextSteps,
    updatedAt: now,
  };
}

export function withRunFinalState(
  run: AgentRun,
  input: {
    status: RunStatus;
    statusNote?: string;
    error?: AgentRunError;
  }
): AgentRun {
  const now = Date.now();
  return {
    ...run,
    status: input.status,
    ...(input.statusNote !== undefined ? { statusNote: input.statusNote } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
    updatedAt: now,
    ...(input.status === 'done' ||
    input.status === 'failed' ||
    input.status === 'waiting_user' ||
    input.status === 'paused'
      ? { finishedAt: now }
      : {}),
  };
}

export function getFirstIncompleteStepId(run: AgentRun): RunStepId | null {
  for (const step of run.steps) {
    if (
      step.status === 'pending' ||
      step.status === 'running' ||
      step.status === 'paused' ||
      step.status === 'failed'
    ) {
      return step.id;
    }
  }
  return null;
}

export function getLatestResumableRun(runs: readonly AgentRun[]): AgentRun | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    if (run.status === 'paused' || run.status === 'failed') {
      return run;
    }
  }
  return null;
}

export function computeRunElapsedMs(run: AgentRun, now: number = Date.now()): number {
  const end = run.finishedAt ?? now;
  return Math.max(0, end - run.createdAt);
}

export async function persistRun(run: AgentRun): Promise<AgentRun> {
  return putRun(run);
}

export async function loadRun(id: string): Promise<AgentRun | undefined> {
  return getRun(id);
}

export async function loadProjectRuns(projectId: string): Promise<AgentRun[]> {
  return listRunsForProject(projectId);
}

export async function normalizeInterruptedRuns(
  projectId?: string
): Promise<AgentRun[]> {
  return markInterruptedRunsOnBoot(projectId);
}
