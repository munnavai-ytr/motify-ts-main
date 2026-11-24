import type { GeminiErrorKind } from '@/lib/ai/gemini-errors';
import type { AudioSpec } from '@/lib/kit/audio/types';
import type { AuditReport } from '@/lib/kit/audit/audit';
import type { Op } from '@/lib/kit/ops';
import type { VideoSpec } from '@/lib/kit/spec';

export type VideoFormat = '9:16' | '16:9' | '1:1';

export type FormatPreference = VideoFormat | 'auto';

export type VideoType = 'Explainer' | 'Title' | 'Lower third' | 'Short ad';

export type ThemePreference = 'system' | 'dark' | 'light';

export type ExportMode = 'standard' | 'compatibility';

export type PlanFont = 'sans' | 'serif' | 'mono';

export type PlanStatus = 'draft' | 'approved' | 'superseded';

export interface PlanPalette {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accentAlt: string;
}

export interface PlanStyle {
  mood: string;
  palette: PlanPalette;
  font: PlanFont;
}

export interface PlanScene {
  id: string;
  name: string;
  durationSeconds: number;
  purpose: string;
  onScreenText: string[];
  visualIdea: string;
  motion: string;
}

export interface Plan {
  title: string;
  format?: VideoFormat;
  style: PlanStyle;
  scenes: PlanScene[];
  audio?: AudioSpec;
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount?: number;
  totalTokenCount: number;
}

export interface SessionUsage {
  requestsMade: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens?: number;
}

export interface DebugInfo {
  modelName: string;
  requestedModelName?: string;
  usedBackupModel?: boolean;
  usedStructuredSchema: boolean;
  repaired: boolean;
  timestamp: string;
  requestContext: {
    format: FormatPreference;
    type: VideoType;
    recentMessageCount: number;
    hasCurrentPlan: boolean;
    userPromptChars: number;
  };
  rawModelOutput?: string;
  repairModelOutput?: string;
  validationErrors?: string[];
  usageMetadata?: GeminiUsageMetadata;
}

export type AgentAction = 'reply' | 'ask' | 'create' | 'edit' | 'resume';

export type RunStatus =
  | 'running'
  | 'waiting_user'
  | 'paused'
  | 'done'
  | 'failed';

export type MediaKind = 'image' | 'video' | 'audio' | 'text' | 'pdf';

export interface AttachmentRef {
  mediaId: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MediaRecord {
  id: string;
  projectId: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  blob: Blob;
  thumbBlob?: Blob;
  aiBlob?: Blob;
  frames?: Blob[];
  waveformPeaks?: number[];
  textContent?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export type PendingAttachmentStatus = 'processing' | 'ready' | 'error';

export interface PendingAttachment {
  id: string;
  file: File;
  kind: MediaKind;
  name: string;
  size: number;
  mime: string;
  progress: number;
  status: PendingAttachmentStatus;
  error?: string;
  record?: Omit<MediaRecord, 'projectId'>;
}

export interface QueuedMessageDraft {
  id: string;
  text: string;
  attachments: Array<Omit<MediaRecord, 'projectId'>>;
  createdAt: number;
  status: 'queued' | 'paused_failed';
}

export type RunStepId =
  | 'understand'
  | 'attachments'
  | 'design'
  | 'apply'
  | 'check'
  | 'save';

export type RunStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'paused'
  | 'failed'
  | 'skipped';

export interface RunStep {
  id: RunStepId;
  label: string;
  status: RunStepStatus;
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
  subNotes?: string[];
}

export interface RouterStructuredResponse {
  action: AgentAction;
  message: string;
  options?: string[];
  specJson?: string;
  opsJson?: string;
  target?: string;
  assumptions?: string[];
}

export interface AgentRunError {
  summary: string;
  userAction?: string;
  errorKind?: GeminiErrorKind;
  needsBackupModel?: boolean;
  details: string;
  retryable: boolean;
  retryPrompt?: string;
  retryAttachments?: AttachmentRef[];
}

export interface AgentDebugInfo {
  runId?: string;
  action?: AgentAction;
  modelName: string;
  requestedModelName?: string;
  usedBackupModel?: boolean;
  requests: number;
  tokens: {
    prompt: number;
    output: number;
    thinking: number;
  };
  elapsedMs: number;
  timestamp: string;
  rawRouterOutput?: string;
  warnings?: string[];
  steps?: RunStep[];
}

export interface AgentRun {
  id: string;
  projectId: string;
  userMessageId: string;
  userPrompt: string;
  status: RunStatus;
  action?: AgentAction;
  steps: RunStep[];
  artifacts: {
    rawRouterOutput?: string;
    routerData?: RouterStructuredResponse;
    parsedSpec?: VideoSpec;
    parsedOps?: Op[];
    auditBefore?: AuditReport;
    auditAfter?: AuditReport;
    brief?: string;
    assumptions?: string[];
    changes?: string[];
    targetVideoId?: string;
    warnings?: string[];
  };
  usage: {
    requests: number;
    promptTokens: number;
    outputTokens: number;
    thoughtTokens: number;
  };
  modelName?: string;
  requestedModelName?: string;
  usedBackupModel?: boolean;
  subNotes?: string[];
  skippedAttachments?: string[];
  statusNote?: string;
  error?: AgentRunError;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface Project {
  id: string;
  title: string;
  format?: VideoFormat;
  type?: VideoType;
  createdAt: number;
  updatedAt: number;
}

export interface BaseMessage {
  id: string;
  projectId: string;
  createdAt: number;
}

export interface UserTextMessage extends BaseMessage {
  type: 'user_text';
  content: string;
  attachments?: AttachmentRef[];
}

export interface AssistantEditUndoState {
  targetKind: 'kit' | 'plan';
  targetMessageId: string;
  previousSpec?: VideoSpec;
  previousPlan?: Plan;
  previousFormat?: VideoFormat;
  undone?: boolean;
}

export interface AssistantTextMessage extends BaseMessage {
  type: 'assistant_text';
  content: string;
  runId?: string;
  options?: string[];
  answeredOption?: string;
  assumptions?: string[];
  debugInfo?: AgentDebugInfo;
  undoEdit?: AssistantEditUndoState;
}

export interface SystemNoticeMessage extends BaseMessage {
  type: 'system_notice';
  content: string;
}

export interface PlanMessage extends BaseMessage {
  type: 'plan';
  version: number;
  status: PlanStatus;
  message: string;
  assumptions: string[];
  plan: Plan;
  format: VideoFormat;
  projectType: VideoType;
  runId?: string;
  debugInfo?: DebugInfo;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  runId?: string;
  summary: string;
  userAction?: string;
  errorKind?: GeminiErrorKind;
  needsBackupModel?: boolean;
  details: string;
  retryable: boolean;
  retryPrompt?: string;
  retryAttachments?: AttachmentRef[];
  debugInfo?: DebugInfo | AgentDebugInfo;
}

export interface RunErrorMessage extends BaseMessage {
  type: 'run_error';
  runId?: string;
  summary: string;
  userAction?: string;
  errorKind?: GeminiErrorKind;
  needsBackupModel?: boolean;
  details: string;
  retryable: boolean;
  retryPrompt?: string;
  retryAttachments?: AttachmentRef[];
  debugInfo?: AgentDebugInfo;
}

export type VideoStatus =
  | 'building'
  | 'ready'
  | 'partial'
  | 'paused'
  | 'failed'
  | 'superseded';

export type VideoSceneStatus =
  | 'pending'
  | 'writing'
  | 'checking'
  | 'repairing'
  | 'ok'
  | 'failed'
  | 'outdated';

export interface SceneAttempt {
  outcome:
    | 'ok'
    | 'truncated'
    | 'compile_error'
    | 'runtime_error'
    | 'internal_error'
    | 'api_error'
    | 'aborted';
  error?: string;
  modelName?: string;
}

export interface VideoSceneRecord {
  sceneId: string;
  name: string;
  specHash: string;
  status: VideoSceneStatus;
  statusNote?: string;
  modelName?: string;
  code: string;
  rawOutputs?: string[];
  attempts: SceneAttempt[];
  tokens: number;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  elapsedMs: number;
  error?: string;
  errorKind?: GeminiErrorKind;
}

export interface LegacyVideoMessage extends BaseMessage {
  type: 'video';
  version: number;
  planMessageId: string;
  planVersion: number;
  status: VideoStatus;
  pauseReason?: 'google_busy' | 'stopped';
  pauseMessage?: string;
  scenes: VideoSceneRecord[];
  width: number;
  height: number;
  fps: number;
  modelName: string;
  format: VideoFormat;
  startedAt: number;
  finishedAt?: number;
}

export interface KitVideoMessage extends BaseMessage {
  type: 'video';
  version: number;
  spec: VideoSpec;
  brief?: string;
  parentVideoId?: string;
  runId?: string;
  changes?: string[];
  auditScore?: number;
  debugInfo?: AgentDebugInfo;
}

/** Alias kept for legacy components until M5 cleanup. */
export type VideoMessage = LegacyVideoMessage;

// Reserved message types for future phases
export interface ReservedSceneCodeMessage extends BaseMessage {
  type: 'scene_code';
  content: string;
}

export interface ReservedRenderResultMessage extends BaseMessage {
  type: 'render_result';
  content: string;
}

export type ChatMessage =
  | UserTextMessage
  | AssistantTextMessage
  | SystemNoticeMessage
  | PlanMessage
  | ErrorMessage
  | RunErrorMessage
  | LegacyVideoMessage
  | KitVideoMessage
  | ReservedSceneCodeMessage
  | ReservedRenderResultMessage;

export type NewChatMessage = ChatMessage extends infer M
  ? M extends ChatMessage
    ? Omit<M, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
    : never
  : never;

export function isKitVideoMessage(msg: ChatMessage): msg is KitVideoMessage {
  return msg.type === 'video' && 'spec' in msg;
}

export function isLegacyVideoMessage(
  msg: ChatMessage
): msg is LegacyVideoMessage {
  return msg.type === 'video' && 'scenes' in msg;
}

export function isErrorLikeMessage(
  msg: ChatMessage
): msg is ErrorMessage | RunErrorMessage {
  return msg.type === 'error' || msg.type === 'run_error';
}
