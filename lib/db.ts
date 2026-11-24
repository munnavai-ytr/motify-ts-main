import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { VideoSpec } from './kit/spec';
import type {
  AgentDebugInfo,
  AgentRun,
  AssistantTextMessage,
  ChatMessage,
  DebugInfo,
  KitVideoMessage,
  LegacyVideoMessage,
  MediaRecord,
  NewChatMessage,
  Plan,
  PlanMessage,
  Project,
  VideoFormat,
  VideoSceneRecord,
  VideoType,
} from './types';
import { isKitVideoMessage, isLegacyVideoMessage } from './types';

export interface UsageLedgerRecord {
  id?: number;
  timestamp: number;
  model: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  ok: boolean;
}

interface MotionAIDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updatedAt': number };
  };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-projectId': string };
  };
  usage_ledger: {
    key: number;
    value: UsageLedgerRecord;
    indexes: { 'by-timestamp': number };
  };
  runs: {
    key: string;
    value: AgentRun;
    indexes: { 'by-projectId': string; 'by-updatedAt': number };
  };
  media: {
    key: string;
    value: MediaRecord;
    indexes: { 'by-projectId': string };
  };
}

const DB_NAME = 'motionai_db';
const DB_VERSION = 7;

let dbPromise: Promise<IDBPDatabase<MotionAIDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MotionAIDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in the browser.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<MotionAIDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('usage_ledger')) {
            const ledgerStore = db.createObjectStore('usage_ledger', {
              keyPath: 'id',
              autoIncrement: true,
            });
            ledgerStore.createIndex('by-timestamp', 'timestamp');
          }
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('runs')) {
            const runsStore = db.createObjectStore('runs', {
              keyPath: 'id',
            });
            runsStore.createIndex('by-projectId', 'projectId');
            runsStore.createIndex('by-updatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('media')) {
            const mediaStore = db.createObjectStore('media', {
              keyPath: 'id',
            });
            mediaStore.createIndex('by-projectId', 'projectId');
          }
        }
      },
    });
  }
  return dbPromise;
}

export function createDbId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveTitleFromMessage(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Untitled chat';
  const words = cleaned.split(' ').slice(0, 6);
  const candidate = words.join(' ');
  if (candidate.length <= 42) {
    return candidate;
  }
  return `${candidate.slice(0, 39).trimEnd()}...`;
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('projects', 'by-updatedAt');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listProjectsWithMessageCounts(): Promise<
  Array<{ project: Project; messageCount: number }>
> {
  const db = await getDb();
  const [allProjects, allMessages] = await Promise.all([
    db.getAllFromIndex('projects', 'by-updatedAt'),
    db.getAll('messages'),
  ]);
  const counts = new Map<string, number>();
  for (const msg of allMessages) {
    counts.set(msg.projectId, (counts.get(msg.projectId) ?? 0) + 1);
  }
  return allProjects
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((project) => ({
      project,
      messageCount: counts.get(project.id) ?? 0,
    }));
}

export async function cleanupEmptyProjects(): Promise<Project[]> {
  const rows = await listProjectsWithMessageCounts();
  const nonEmpty: Project[] = [];
  for (const { project, messageCount } of rows) {
    if (messageCount === 0) {
      await deleteProject(project.id);
    } else {
      nonEmpty.push(project);
    }
  }
  return nonEmpty;
}

export async function countProjectMessages(projectId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('messages', 'by-projectId', projectId);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function createProject(
  input: {
    format?: VideoFormat;
    type?: VideoType;
    title?: string;
  } = {}
): Promise<Project> {
  const db = await getDb();
  const now = Date.now();
  const project: Project = {
    id: createDbId(),
    title: input.title?.trim() || 'New project',
    format: input.format ?? '16:9',
    type: input.type ?? 'Explainer',
    createdAt: now,
    updatedAt: now,
  };
  await db.put('projects', project);
  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'title' | 'format' | 'type' | 'updatedAt'>>
): Promise<Project> {
  const db = await getDb();
  const existing = await db.get('projects', id);
  if (!existing) {
    throw new Error('Project not found.');
  }
  const updated: Project = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() || 'Untitled chat' : existing.title,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  await db.put('projects', updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'messages', 'runs', 'media'], 'readwrite');
  const msgIndex = tx.objectStore('messages').index('by-projectId');
  const msgKeys = await msgIndex.getAllKeys(id);
  for (const key of msgKeys) {
    await tx.objectStore('messages').delete(key);
  }
  const runIndex = tx.objectStore('runs').index('by-projectId');
  const runKeys = await runIndex.getAllKeys(id);
  for (const key of runKeys) {
    await tx.objectStore('runs').delete(key);
  }
  const mediaIndex = tx.objectStore('media').index('by-projectId');
  const mediaKeys = await mediaIndex.getAllKeys(id);
  for (const key of mediaKeys) {
    await tx.objectStore('media').delete(key);
  }
  await tx.objectStore('projects').delete(id);
  await tx.done;
}

export async function putMediaRecord(record: MediaRecord): Promise<MediaRecord> {
  const db = await getDb();
  await db.put('media', record);
  return record;
}

export async function putMediaRecords(records: MediaRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('media', 'readwrite');
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function getMediaRecord(id: string): Promise<MediaRecord | undefined> {
  const db = await getDb();
  return db.get('media', id);
}

export async function getMediaRecordsByIds(ids: string[]): Promise<MediaRecord[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await Promise.all(ids.map((id) => db.get('media', id)));
  return rows.filter((row): row is MediaRecord => row !== undefined);
}

export async function listProjectMedia(projectId: string): Promise<MediaRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('media', 'by-projectId', projectId);
}

export async function listAudioMedia(): Promise<MediaRecord[]> {
  const db = await getDb();
  const all = await db.getAll('media');
  return all
    .filter((rec) => rec.kind === 'audio')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteMediaRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('media', id);
}

export async function listMessages(projectId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('messages', 'by-projectId', projectId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addMessage(input: NewChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  const message = {
    ...input,
    id: input.id ?? createDbId(),
    createdAt: input.createdAt ?? Date.now(),
  } as ChatMessage;

  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  await tx.objectStore('messages').put(message);

  const project = await tx.objectStore('projects').get(message.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: message.createdAt,
    });
  }
  await tx.done;
  return message;
}

export async function updateMessage<T extends ChatMessage>(
  message: T
): Promise<T> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  await tx.objectStore('messages').put(message);

  const project = await tx.objectStore('projects').get(message.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }
  await tx.done;
  return message;
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('messages', id);
}

export async function markAssistantOptionAnswered(
  messageId: string,
  chosenOption: string
): Promise<AssistantTextMessage | null> {
  const db = await getDb();
  const msg = await db.get('messages', messageId);
  if (!msg || msg.type !== 'assistant_text') {
    return null;
  }
  const updated: AssistantTextMessage = {
    ...msg,
    answeredOption: chosenOption,
  };
  await updateMessage(updated);
  return updated;
}

export async function saveKitVideoVersion(input: {
  projectId: string;
  spec: VideoSpec;
  brief?: string;
  parentVideoId?: string;
  runId?: string;
  changes?: string[];
  auditScore?: number;
  debugInfo?: AgentDebugInfo;
  createdAt?: number;
}): Promise<{
  createdVideoMessage: KitVideoMessage;
  allMessages: ChatMessage[];
}> {
  const db = await getDb();
  const now = input.createdAt ?? Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  const msgStore = tx.objectStore('messages');
  const existing = await msgStore.index('by-projectId').getAll(input.projectId);

  let maxVersion = 0;
  for (const msg of existing) {
    if (isKitVideoMessage(msg) || isLegacyVideoMessage(msg)) {
      if (msg.version > maxVersion) {
        maxVersion = msg.version;
      }
    }
  }

  const createdVideoMessage: KitVideoMessage = {
    id: createDbId(),
    projectId: input.projectId,
    createdAt: now,
    type: 'video',
    version: maxVersion + 1,
    spec: input.spec,
    ...(input.brief ? { brief: input.brief } : {}),
    ...(input.parentVideoId ? { parentVideoId: input.parentVideoId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.changes && input.changes.length > 0
      ? { changes: input.changes }
      : {}),
    ...(input.auditScore !== undefined ? { auditScore: input.auditScore } : {}),
    ...(input.debugInfo ? { debugInfo: input.debugInfo } : {}),
  };

  await msgStore.put(createdVideoMessage);

  const project = await tx.objectStore('projects').get(input.projectId);
  if (project) {
    const nextTitle =
      project.title === 'New project' ||
      project.title === 'New chat' ||
      project.title === 'Untitled chat' ||
      project.title === 'Untitled video'
        ? input.spec.title || project.title
        : project.title;
    await tx.objectStore('projects').put({
      ...project,
      title: nextTitle,
      format: input.spec.format,
      updatedAt: now,
    });
  }

  const updatedRows = await msgStore.index('by-projectId').getAll(input.projectId);
  await tx.done;

  return {
    createdVideoMessage,
    allMessages: updatedRows.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export async function updateKitVideoSpecInPlace(input: {
  messageId: string;
  spec: VideoSpec;
  auditScore?: number;
}): Promise<KitVideoMessage | null> {
  const db = await getDb();
  const existing = await db.get('messages', input.messageId);
  if (!existing || !isKitVideoMessage(existing)) {
    return null;
  }
  const updated: KitVideoMessage = {
    ...existing,
    spec: input.spec,
    ...(input.auditScore !== undefined ? { auditScore: input.auditScore } : {}),
  };
  await updateMessage(updated);
  return updated;
}

export async function getRun(id: string): Promise<AgentRun | undefined> {
  const db = await getDb();
  return db.get('runs', id);
}

export async function listRunsForProject(
  projectId: string
): Promise<AgentRun[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('runs', 'by-projectId', projectId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putRun(run: AgentRun): Promise<AgentRun> {
  const db = await getDb();
  await db.put('runs', run);
  return run;
}

export async function markInterruptedRunsOnBoot(
  projectId?: string
): Promise<AgentRun[]> {
  const db = await getDb();
  const rows = projectId
    ? await db.getAllFromIndex('runs', 'by-projectId', projectId)
    : await db.getAll('runs');

  const now = Date.now();
  const interrupted: AgentRun[] = [];
  for (const run of rows) {
    if (run.status === 'running') {
      const updated: AgentRun = {
        ...run,
        status: 'paused',
        statusNote: 'Interrupted by page reload. Resume to continue.',
        updatedAt: now,
        steps: run.steps.map((step) =>
          step.status === 'running'
            ? { ...step, status: 'paused', finishedAt: step.finishedAt ?? now }
            : step
        ),
        error: {
          summary: 'Interrupted before finishing.',
          userAction: 'Click Resume to pick up where it stopped.',
          details: 'The browser reloaded or closed while this run was active.',
          retryable: true,
          retryPrompt: run.userPrompt,
        },
      };
      await db.put('runs', updated);
      interrupted.push(updated);
    }
  }
  return interrupted;
}

export async function savePlanTurn(input: {
  projectId: string;
  format: VideoFormat;
  projectType: VideoType;
  message: string;
  assumptions: string[];
  plan: Plan;
  runId?: string;
  debugInfo?: DebugInfo;
}): Promise<{
  createdPlanMessage: PlanMessage;
  allMessages: ChatMessage[];
}> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  const msgStore = tx.objectStore('messages');
  const existing = await msgStore.index('by-projectId').getAll(input.projectId);

  let maxVersion = 0;
  for (const msg of existing) {
    if (msg.type === 'plan') {
      if (msg.version > maxVersion) {
        maxVersion = msg.version;
      }
      if (msg.status !== 'superseded') {
        const superseded: PlanMessage = {
          ...msg,
          status: 'superseded',
        };
        await msgStore.put(superseded);
      }
    }
  }

  const createdPlanMessage: PlanMessage = {
    id: createDbId(),
    projectId: input.projectId,
    createdAt: now,
    type: 'plan',
    version: maxVersion + 1,
    status: 'draft',
    message: input.message,
    assumptions: input.assumptions,
    plan: input.plan,
    format: input.format,
    projectType: input.projectType,
    ...(input.runId ? { runId: input.runId } : {}),
    debugInfo: input.debugInfo,
  };

  await msgStore.put(createdPlanMessage);

  const project = await tx.objectStore('projects').get(input.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }

  const updatedRows = await msgStore.index('by-projectId').getAll(input.projectId);
  await tx.done;

  return {
    createdPlanMessage,
    allMessages: updatedRows.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export async function saveNewVideoBuildTurn(input: {
  projectId: string;
  planMessageId: string;
  planVersion: number;
  scenes: VideoSceneRecord[];
  width: number;
  height: number;
  fps: number;
  modelName: string;
  format: VideoFormat;
  createdAt?: number;
}): Promise<{
  createdVideoMessage: LegacyVideoMessage;
  allMessages: ChatMessage[];
}> {
  const db = await getDb();
  const now = input.createdAt ?? Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  const msgStore = tx.objectStore('messages');
  const existing = await msgStore.index('by-projectId').getAll(input.projectId);

  let maxVersion = 0;
  for (const msg of existing) {
    if (isLegacyVideoMessage(msg)) {
      if (msg.version > maxVersion) {
        maxVersion = msg.version;
      }
      if (msg.status !== 'superseded') {
        const superseded: LegacyVideoMessage = {
          ...msg,
          status: 'superseded',
        };
        await msgStore.put(superseded);
      }
    } else if (isKitVideoMessage(msg) && msg.version > maxVersion) {
      maxVersion = msg.version;
    }
  }

  const createdVideoMessage: LegacyVideoMessage = {
    id: createDbId(),
    projectId: input.projectId,
    createdAt: now,
    type: 'video',
    version: maxVersion + 1,
    planMessageId: input.planMessageId,
    planVersion: input.planVersion,
    status: 'building',
    scenes: input.scenes,
    width: input.width,
    height: input.height,
    fps: input.fps,
    modelName: input.modelName,
    format: input.format,
    startedAt: now,
  };

  await msgStore.put(createdVideoMessage);

  const project = await tx.objectStore('projects').get(input.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }

  const updatedRows = await msgStore.index('by-projectId').getAll(input.projectId);
  await tx.done;

  return {
    createdVideoMessage,
    allMessages: updatedRows.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export async function getDataCounts(): Promise<{
  projectCount: number;
  messageCount: number;
  mediaCount: number;
  mediaBytes: number;
}> {
  const db = await getDb();
  const [projectCount, messageCount, allMedia] = await Promise.all([
    db.count('projects'),
    db.count('messages'),
    db.getAll('media'),
  ]);
  let mediaBytes = 0;
  for (const m of allMedia) {
    mediaBytes +=
      (m.blob?.size ?? m.size ?? 0) +
      (m.thumbBlob?.size ?? 0) +
      (m.aiBlob?.size ?? 0) +
      (m.frames ?? []).reduce((sum, f) => sum + (f?.size ?? 0), 0);
  }
  return {
    projectCount,
    messageCount,
    mediaCount: allMedia.length,
    mediaBytes,
  };
}

export async function deleteAllLocalData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'messages', 'runs', 'media'], 'readwrite');
  await tx.objectStore('messages').clear();
  await tx.objectStore('projects').clear();
  await tx.objectStore('runs').clear();
  await tx.objectStore('media').clear();
  await tx.done;
}

export function formatProjectTimestamp(
  timestamp: number,
  now: number = Date.now()
): string {
  const diffMs = timestamp - now;
  const absMs = Math.abs(diffMs);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (absMs >= sevenDaysMs) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(timestamp));
  }

  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 45) {
    return 'just now';
  }

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffSeconds / 3600);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffSeconds / 86400);
  if (Math.abs(diffDays) >= 7) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(timestamp));
  }

  return rtf.format(diffDays, 'day');
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 45) {
    return rtf.format(0, 'second');
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month');
  }
  const diffYears = Math.round(diffDays / 365);
  return rtf.format(diffYears, 'year');
}
