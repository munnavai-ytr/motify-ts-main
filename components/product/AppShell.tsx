'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online';
import { useVisualViewportHeight } from '@/hooks/use-visual-viewport';
import { buildMultimodalTurnParts } from '@/lib/agent/context';
import { isBengaliText, isBuildIntent } from '@/lib/agent/intent';
import {
  appendRunSubNote,
  appendStepSubNote,
  createAgentRun,
  loadProjectRuns,
  normalizeInterruptedRuns,
  persistRun,
  withRunFinalState,
  withStepStatus,
} from '@/lib/agent/runs';
import {
  buildSingleScene,
  isEndOfBuildRetryEligible,
  RETRYING_ON_BACKUP_MODEL_NOTE,
} from '@/lib/ai/animator';
import { runDirectorTurn } from '@/lib/ai/director';
import { isAbortError } from '@/lib/ai/gemini-client';
import { applyOpsToPlan } from '@/lib/ai/plan-edit';
import { validatePlanTotalDuration } from '@/lib/ai/plan-schema';
import { compileComponent, type CompiledComponentType } from '@/lib/compile';
import {
  addMessage,
  cleanupEmptyProjects,
  countProjectMessages,
  createDbId,
  createProject,
  deleteMessage,
  deleteProject,
  deriveTitleFromMessage,
  getMediaRecordsByIds,
  listMessages,
  listProjectsWithMessageCounts,
  putMediaRecords,
  saveNewVideoBuildTurn,
  savePlanTurn,
  updateKitVideoSpecInPlace,
  updateMessage,
  updateProject,
} from '@/lib/db';
import type { GeminiModel } from '@/lib/gemini';
import {
  createKitHistory,
  type KitHistoryController,
} from '@/lib/kit/history';
import { applyOps } from '@/lib/kit/ops';
import {
  clearStoredBackupModel,
  clearStoredModel,
  clearStoredProjectFormat,
  getStoredActiveProjectId,
  getStoredApiKey,
  getStoredAutoBuild,
  getStoredBackupModel,
  getStoredDefaultFormat,
  getStoredModel,
  getStoredProjectFormat,
  setStoredActiveProjectId,
  setStoredProjectFormat,
} from '@/lib/storage';
import type {
  AgentDebugInfo,
  AgentRun,
  AssistantTextMessage,
  AttachmentRef,
  ChatMessage,
  ErrorMessage,
  FormatPreference,
  KitVideoMessage,
  LegacyVideoMessage,
  MediaRecord,
  PlanMessage,
  Project,
  QueuedMessageDraft,
  RunErrorMessage,
  SessionUsage,
  UserTextMessage,
  VideoMessage,
  VideoSceneRecord,
  VideoStatus,
} from '@/lib/types';
import { isKitVideoMessage, isLegacyVideoMessage } from '@/lib/types';
import {
  buildSceneTheme,
  computeSceneSpecHash,
  getDimensionsForFormat,
  secondsToFrames,
  VIDEO_FPS,
} from '@/lib/video/dimensions';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ChatPanel } from './ChatPanel';
import { Onboarding } from './Onboarding';
import { ProjectsDrawer } from './ProjectsDrawer';
import {
  SceneRuntimeProbe,
  type SceneRuntimeProbeHandle,
} from './SceneRuntimeProbe';
import { SettingsSheet } from './SettingsSheet';
import { StagePanel } from './StagePanel';
import { TopBar } from './TopBar';

function subscribeHydration(): () => void {
  return () => {};
}

const EMPTY_SESSION_USAGE: SessionUsage = {
  requestsMade: 0,
  promptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
};

function compileVideosFromMessages(
  msgs: ChatMessage[]
): Record<string, Record<string, CompiledComponentType>> {
  const compiledMap: Record<string, Record<string, CompiledComponentType>> = {};
  for (const msg of msgs) {
    if (!isLegacyVideoMessage(msg) || msg.status === 'superseded') continue;
    const perScene: Record<string, CompiledComponentType> = {};
    for (const scene of msg.scenes) {
      if ((scene.status === 'ok' || scene.status === 'outdated') && scene.code) {
        const res = compileComponent(scene.code);
        if (res.ok) {
          perScene[scene.sceneId] = res.component;
        }
      }
    }
    compiledMap[msg.id] = perScene;
  }
  return compiledMap;
}

async function normalizeInterruptedBuilds(
  msgs: ChatMessage[]
): Promise<ChatMessage[]> {
  let changed = false;
  const normalized: ChatMessage[] = [];

  for (const msg of msgs) {
    if (isLegacyVideoMessage(msg) && msg.status === 'building') {
      changed = true;
      const updatedScenes: VideoSceneRecord[] = msg.scenes.map((scene) => {
        if (
          scene.status === 'pending' ||
          scene.status === 'writing' ||
          scene.status === 'checking' ||
          scene.status === 'repairing'
        ) {
          return {
            ...scene,
            status: 'pending',
            statusNote: 'Interrupted',
            error: undefined,
          };
        }
        return scene;
      });
      const fixedMsg: VideoMessage = {
        ...msg,
        status: 'paused',
        pauseReason: 'stopped',
        scenes: updatedScenes,
        finishedAt: msg.finishedAt ?? Date.now(),
      };
      await updateMessage(fixedMsg);
      normalized.push(fixedMsg);
    } else {
      normalized.push(msg);
    }
  }

  return changed ? normalized : msgs;
}

function WorkspaceShell() {
  const isOnline = useOnlineStatus();
  const vvHeight = useVisualViewportHeight();
  const { showToast } = useToast();

  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );

  const [apiKey, setApiKey] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredApiKey() : ''
  );
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredModel() : ''
  );
  const [backupModel, setBackupModel] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredBackupModel() : ''
  );
  const [autoBuild, setAutoBuild] = useState<boolean>(() =>
    typeof window !== 'undefined' ? getStoredAutoBuild() : true
  );
  const [defaultFormat, setDefaultFormat] = useState<FormatPreference>(() =>
    typeof window !== 'undefined' ? getStoredDefaultFormat() : 'auto'
  );
  const [draftFormatOverride, setDraftFormatOverride] =
    useState<FormatPreference | null>(null);
  const [activeProjectFormatPref, setActiveProjectFormatPref] =
    useState<FormatPreference | null>(null);
  const [models, setModels] = useState<GeminiModel[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [messageCountByProjectId, setMessageCountByProjectId] = useState<
    Record<string, number>
  >({});
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runsById, setRunsById] = useState<Record<string, AgentRun>>({});
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [queuedDrafts, setQueuedDrafts] = useState<QueuedMessageDraft[]>([]);
  const [cachedMediaById, setCachedMediaById] = useState<
    Record<string, MediaRecord>
  >({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [compiledByVideoId, setCompiledByVideoId] = useState<
    Record<string, Record<string, CompiledComponentType>>
  >({});
  const [buildingVideoMessageId, setBuildingVideoMessageId] = useState<
    string | null
  >(null);
  const [activeVideoStatusDetail, setActiveVideoStatusDetail] = useState<
    string | null
  >(null);
  const [activeVideoWaitStartedAt, setActiveVideoWaitStartedAt] = useState<
    number | null
  >(null);

  const [sessionUsage, setSessionUsage] =
    useState<SessionUsage>(EMPTY_SESSION_USAGE);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusComposerSignal, setFocusComposerSignal] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const videoAbortControllerRef = useRef<AbortController | null>(null);
  const probeRef = useRef<SceneRuntimeProbeHandle | null>(null);
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  const queuedDraftsRef = useRef<QueuedMessageDraft[]>([]);
  const handledRuntimeErrorsRef = useRef<Set<string>>(new Set());
  const kitHistoryRef = useRef<Map<string, KitHistoryController>>(new Map());

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    queuedDraftsRef.current = queuedDrafts;
  }, [queuedDrafts]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      videoAbortControllerRef.current?.abort();
    };
  }, []);

  const effectiveApiKey = hydrated ? apiKey || getStoredApiKey() : '';
  const effectiveModel = hydrated ? selectedModel || getStoredModel() : '';
  const effectiveBackupModel = hydrated
    ? backupModel || getStoredBackupModel()
    : '';

  const abortInFlight = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (videoAbortControllerRef.current) {
      videoAbortControllerRef.current.abort();
      videoAbortControllerRef.current = null;
    }
    setThinkingStartedAt(null);
    setActiveRun((prev) => {
      if (prev) {
        const paused = withRunFinalState(prev, {
          status: 'paused',
          statusNote: 'Stopped',
        });
        void persistRun(paused);
        setRunsById((map) => ({ ...map, [paused.id]: paused }));
      }
      return null;
    });
    setQueuedDrafts((prev) =>
      prev.map((d) =>
        d.status === 'queued' ? { ...d, status: 'paused_failed' } : d
      )
    );
    setBuildingVideoMessageId(null);
    setActiveVideoStatusDetail(null);
    setActiveVideoWaitStartedAt(null);
  }, []);

  const refreshProjectsList = useCallback(async () => {
    const rows = await listProjectsWithMessageCounts();
    const counts: Record<string, number> = {};
    const list: Project[] = [];
    for (const row of rows) {
      list.push(row.project);
      counts[row.project.id] = row.messageCount;
    }
    setProjects(list);
    setMessageCountByProjectId(counts);
  }, []);

  const loadWorkspaceProjects = useCallback(async () => {
    abortInFlight();
    const nonEmpty = await cleanupEmptyProjects();
    const counts: Record<string, number> = {};
    for (const project of nonEmpty) {
      counts[project.id] = 1;
    }
    setProjects(nonEmpty);
    setMessageCountByProjectId(counts);

    const savedId = getStoredActiveProjectId();
    const match = nonEmpty.find((p) => p.id === savedId) ?? nonEmpty[0] ?? null;
    const nextId = match?.id ?? null;
    setActiveProjectId(nextId);
    setStoredActiveProjectId(nextId);
    setDraftFormatOverride(null);
    setActiveProjectFormatPref(
      nextId
        ? getStoredProjectFormat(nextId) ??
            match?.format ??
            getStoredDefaultFormat()
        : null
    );
    setLoadingProjects(false);

    if (nextId) {
      setLoadingMessages(true);
      await normalizeInterruptedRuns(nextId);
      const [rawMsgs, projectRuns] = await Promise.all([
        listMessages(nextId),
        loadProjectRuns(nextId),
      ]);
      const msgs = await normalizeInterruptedBuilds(rawMsgs);
      const runMap: Record<string, AgentRun> = {};
      for (const r of projectRuns) {
        runMap[r.id] = r;
      }
      setRunsById(runMap);
      setMessages(msgs);
      setQueuedDrafts([]);
      setMessageCountByProjectId((prev) => ({
        ...prev,
        [nextId]: msgs.length,
      }));
      setCompiledByVideoId(compileVideosFromMessages(msgs));
      setLoadingMessages(false);
    } else {
      setMessages([]);
      setRunsById({});
      setQueuedDrafts([]);
      setCachedMediaById({});
      setCompiledByVideoId({});
    }
  }, [abortInFlight]);

  useEffect(() => {
    if (!effectiveApiKey) return;
    let active = true;
    cleanupEmptyProjects()
      .then(async (nonEmpty) => {
        if (!active) return;
        const rows = await listProjectsWithMessageCounts();
        if (!active) return;
        const counts: Record<string, number> = {};
        for (const row of rows) {
          counts[row.project.id] = row.messageCount;
        }
        setProjects(nonEmpty);
        setMessageCountByProjectId(counts);
        const savedId = getStoredActiveProjectId();
        const match =
          nonEmpty.find((p) => p.id === savedId) ?? nonEmpty[0] ?? null;
        const nextId = match?.id ?? null;
        setActiveProjectId(nextId);
        setStoredActiveProjectId(nextId);
        setDraftFormatOverride(null);
        setActiveProjectFormatPref(
          nextId
            ? getStoredProjectFormat(nextId) ??
                match?.format ??
                getStoredDefaultFormat()
            : null
        );
        setLoadingProjects(false);

        if (nextId) {
          setLoadingMessages(true);
          await normalizeInterruptedRuns(nextId);
          const [rawMsgs, projectRuns] = await Promise.all([
            listMessages(nextId),
            loadProjectRuns(nextId),
          ]);
          const msgs = await normalizeInterruptedBuilds(rawMsgs);
          if (!active) return;
          const runMap: Record<string, AgentRun> = {};
          for (const r of projectRuns) {
            runMap[r.id] = r;
          }
          setRunsById(runMap);
          setMessages(msgs);
          setCompiledByVideoId(compileVideosFromMessages(msgs));
          setLoadingMessages(false);
        } else {
          setMessages([]);
          setRunsById({});
          setCompiledByVideoId({});
        }
      })
      .catch(() => {
        if (active) {
          setLoadingProjects(false);
          setLoadingMessages(false);
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveApiKey]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? null;

  const composerFormat: FormatPreference = activeProject
    ? activeProjectFormatPref ?? activeProject.format ?? defaultFormat
    : draftFormatOverride ?? defaultFormat;

  const drawerProjects = useMemo(
    () => projects.filter((p) => (messageCountByProjectId[p.id] ?? 0) > 0),
    [projects, messageCountByProjectId]
  );

  const handleSelectProject = async (id: string) => {
    const leavingId = activeProjectId;
    if (id !== leavingId) {
      abortInFlight();
      setQueuedDrafts([]);
      if (leavingId) {
        const leavingCount = await countProjectMessages(leavingId);
        if (leavingCount === 0) {
          await deleteProject(leavingId);
          setProjects((prev) => prev.filter((p) => p.id !== leavingId));
          setMessageCountByProjectId((prev) => {
            const next = { ...prev };
            delete next[leavingId];
            return next;
          });
        }
      }
    }
    const selectedProject = projects.find((p) => p.id === id) ?? null;
    setActiveProjectId(id);
    setStoredActiveProjectId(id);
    setDraftFormatOverride(null);
    setActiveProjectFormatPref(
      getStoredProjectFormat(id) ?? selectedProject?.format ?? defaultFormat
    );
    setLoadingMessages(true);
    try {
      await normalizeInterruptedRuns(id);
      const [rawMsgs, projectRuns] = await Promise.all([
        listMessages(id),
        loadProjectRuns(id),
      ]);
      const msgs = await normalizeInterruptedBuilds(rawMsgs);
      const runMap: Record<string, AgentRun> = {};
      for (const r of projectRuns) {
        runMap[r.id] = r;
      }
      setRunsById(runMap);
      setMessages(msgs);
      setMessageCountByProjectId((prev) => ({
        ...prev,
        [id]: msgs.length,
      }));
      setCompiledByVideoId(compileVideosFromMessages(msgs));
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleNewProject = () => {
    setProjectsOpen(false);
    setDraftFormatOverride(null);
    setActiveProjectFormatPref(null);
    if (messages.length === 0) {
      setFocusComposerSignal((n) => n + 1);
      return;
    }

    abortInFlight();
    setQueuedDrafts([]);
    activeProjectIdRef.current = null;
    setActiveProjectId(null);
    setStoredActiveProjectId(null);
    setMessages([]);
    setRunsById({});
    setCompiledByVideoId({});
    setFocusComposerSignal((n) => n + 1);
  };

  const handleRenameProject = async (id: string, title: string) => {
    const updated = await updateProject(id, { title });
    setProjects((prev) =>
      prev
        .map((p) => (p.id === id ? updated : p))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  };

  const handleComposerFormatChange = useCallback(
    async (nextFormat: FormatPreference) => {
      if (!activeProject) {
        setDraftFormatOverride(nextFormat);
        return;
      }
      setStoredProjectFormat(activeProject.id, nextFormat);
      setActiveProjectFormatPref(nextFormat);
      if (nextFormat !== 'auto' && activeProject.format !== nextFormat) {
        const updated = await updateProject(activeProject.id, {
          format: nextFormat,
        });
        setProjects((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
      }
    },
    [activeProject]
  );

  const handleDeleteProject = async (id: string) => {
    if (activeProjectId === id) {
      abortInFlight();
    }
    await deleteProject(id);
    clearStoredProjectFormat(id);
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    setMessageCountByProjectId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (activeProjectId === id) {
      const next =
        remaining.find((p) => (messageCountByProjectId[p.id] ?? 0) > 0) ??
        remaining[0] ??
        null;
      setActiveProjectId(next?.id ?? null);
      setStoredActiveProjectId(next?.id ?? null);
      setDraftFormatOverride(null);
      setActiveProjectFormatPref(
        next
          ? getStoredProjectFormat(next.id) ?? next.format ?? defaultFormat
          : null
      );
      if (next) {
        const rawMsgs = await listMessages(next.id);
        const msgs = await normalizeInterruptedBuilds(rawMsgs);
        setMessages(msgs);
        setCompiledByVideoId(compileVideosFromMessages(msgs));
      } else {
        setMessages([]);
        setCompiledByVideoId({});
      }
    }
    showToast('Project deleted', 'info');
  };

  const executeDirectorTurnRef = useRef<
    ((
      targetProject: Project,
      conversationMessages: ChatMessage[],
      userPrompt: string,
      mediaRecords: MediaRecord[],
      userMessageId: string
    ) => Promise<void>) | null
  >(null);

  const startVideoBuildRef = useRef<
    ((
      targetProject: Project,
      planMsg: PlanMessage,
      currentMessages: ChatMessage[],
      minCreatedAt?: number
    ) => Promise<void>) | null
  >(null);

  const dispatchUserTurnImmediate = useCallback(
    async (
      content: string,
      attachments: Array<Omit<MediaRecord, 'projectId'>>
    ): Promise<boolean> => {
      if (!effectiveApiKey) {
        return false;
      }

      if (!effectiveModel) {
        setSettingsOpen(true);
        showToast('Select a Gemini model in Settings first.', 'info');
        return false;
      }

      let targetProject = activeProject;
      const existingMessages = messages;
      const titleSource =
        content.trim() || attachments[0]?.name || 'Media project';

      if (!targetProject) {
        const chosenFormatPref = draftFormatOverride ?? defaultFormat;
        targetProject = await createProject({
          format: chosenFormatPref === 'auto' ? '16:9' : chosenFormatPref,
          type: 'Explainer',
          title: deriveTitleFromMessage(titleSource),
        });
        setStoredProjectFormat(targetProject.id, chosenFormatPref);
        setActiveProjectFormatPref(chosenFormatPref);
        setDraftFormatOverride(null);
        activeProjectIdRef.current = targetProject.id;
        setActiveProjectId(targetProject.id);
        setStoredActiveProjectId(targetProject.id);
        setProjects((prev) => [targetProject!, ...prev]);
      } else if (
        (targetProject.title === 'Untitled video' ||
          targetProject.title === 'New project' ||
          targetProject.title === 'New chat') &&
        !existingMessages.some((m) => m.type === 'user_text')
      ) {
        targetProject = await updateProject(targetProject.id, {
          title: deriveTitleFromMessage(titleSource),
        });
      }

      const fullMediaRecords: MediaRecord[] = attachments.map((att) => ({
        ...att,
        projectId: targetProject!.id,
      }));

      if (fullMediaRecords.length > 0) {
        await putMediaRecords(fullMediaRecords);
        setCachedMediaById((prev) => {
          const next = { ...prev };
          for (const rec of fullMediaRecords) {
            next[rec.id] = rec;
          }
          return next;
        });
      }

      const attachmentRefs: AttachmentRef[] = fullMediaRecords.map((rec) => ({
        mediaId: rec.id,
        kind: rec.kind,
        name: rec.name,
        mime: rec.mime,
        size: rec.size,
        ...(rec.width !== undefined ? { width: rec.width } : {}),
        ...(rec.height !== undefined ? { height: rec.height } : {}),
        ...(rec.duration !== undefined ? { duration: rec.duration } : {}),
      }));

      const userMsg = await addMessage({
        projectId: targetProject.id,
        type: 'user_text',
        content,
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
      });

      const updatedHistory: ChatMessage[] = [...existingMessages, userMsg];
      setMessages(updatedHistory);

      await refreshProjectsList();

      const latestActivePlanMsg =
        [...existingMessages]
          .reverse()
          .find(
            (m): m is PlanMessage =>
              m.type === 'plan' && m.status !== 'superseded'
          ) ?? null;

      if (
        fullMediaRecords.length === 0 &&
        !content.includes('?') &&
        isBuildIntent(
          content,
          latestActivePlanMsg ? latestActivePlanMsg.plan : null
        ) &&
        latestActivePlanMsg
      ) {
        const lastUserMessageBeforeThis = [...existingMessages]
          .reverse()
          .find((m): m is UserTextMessage => m.type === 'user_text');
        const useBengali =
          isBengaliText(content) ||
          (lastUserMessageBeforeThis
            ? isBengaliText(lastUserMessageBeforeThis.content)
            : false);
        const startMessageText = useBengali
          ? 'ভিডিও বানানো শুরু করছি…'
          : 'Starting the build…';

        const assistantStartMsg = await addMessage({
          projectId: targetProject.id,
          type: 'assistant_text',
          content: startMessageText,
          createdAt: Math.max(Date.now(), userMsg.createdAt + 1),
        });
        const historyWithStart: ChatMessage[] = [
          ...updatedHistory,
          assistantStartMsg,
        ];
        if (activeProjectIdRef.current === targetProject.id) {
          setMessages(historyWithStart);
        }
        await refreshProjectsList();

        if (startVideoBuildRef.current) {
          void startVideoBuildRef.current(
            targetProject,
            latestActivePlanMsg,
            historyWithStart,
            assistantStartMsg.createdAt + 1
          );
        }
        return true;
      }

      if (executeDirectorTurnRef.current) {
        void executeDirectorTurnRef.current(
          targetProject,
          existingMessages,
          content,
          fullMediaRecords,
          userMsg.id
        );
      }
      return true;
    },
    [
      activeProject,
      defaultFormat,
      draftFormatOverride,
      effectiveApiKey,
      effectiveModel,
      messages,
      refreshProjectsList,
      showToast,
    ]
  );

  const executeDirectorTurn = useCallback(
    async (
      targetProject: Project,
      conversationMessages: ChatMessage[],
      userPrompt: string,
      mediaRecords: MediaRecord[] = [],
      userMessageId: string = createDbId()
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setThinkingStartedAt(Date.now());

      let currentRun = createAgentRun({
        projectId: targetProject.id,
        userMessageId,
        userPrompt,
        hasAttachments: mediaRecords.length > 0,
        modelName: effectiveModel,
        requestedModelName: effectiveModel,
      });
      currentRun = withStepStatus(currentRun, 'understand', 'running');

      const updateLiveRun = (mutator: (prev: AgentRun) => AgentRun) => {
        currentRun = mutator(currentRun);
        if (
          !controller.signal.aborted &&
          activeProjectIdRef.current === targetProject.id
        ) {
          setActiveRun(currentRun);
        }
      };

      setActiveRun(currentRun);

      const latestActivePlanMsg = [...conversationMessages]
        .reverse()
        .find(
          (m): m is PlanMessage =>
            m.type === 'plan' && m.status !== 'superseded'
        );

      const latestKitVideoMsg =
        [...conversationMessages]
          .reverse()
          .find((m): m is KitVideoMessage => isKitVideoMessage(m)) ?? null;

      const latestLegacyVideoMsg =
        [...conversationMessages]
          .reverse()
          .find(
            (m): m is LegacyVideoMessage =>
              isLegacyVideoMessage(m) && m.status !== 'superseded'
          ) ?? null;

      let turnSucceeded = false;

      try {
        updateLiveRun((r) => withStepStatus(r, 'understand', 'done'));

        let currentTurnParts: Awaited<
          ReturnType<typeof buildMultimodalTurnParts>
        >['parts'] = [];
        let attachmentSummaryLines: string[] = [];

        if (mediaRecords.length > 0) {
          updateLiveRun((r) => withStepStatus(r, 'attachments', 'running'));
          const built = await buildMultimodalTurnParts({
            mediaRecords,
            onStepNote: (label, subNote) => {
              updateLiveRun((r) => {
                let next = withStepStatus(
                  r,
                  'attachments',
                  'running',
                  undefined,
                  label
                );
                if (subNote) {
                  next = appendStepSubNote(next, 'attachments', subNote);
                }
                return next;
              });
            },
          });
          currentTurnParts = built.parts;
          attachmentSummaryLines = built.summaryLines;
          updateLiveRun((r) => ({
            ...withStepStatus(r, 'attachments', 'done'),
            ...(built.skippedNotes.length > 0
              ? { skippedAttachments: built.skippedNotes }
              : {}),
          }));
        }

        if (controller.signal.aborted) {
          return;
        }

        const resolvedTurnFormat =
          getStoredProjectFormat(targetProject.id) ??
          targetProject.format ??
          defaultFormat;

        const result = await runDirectorTurn({
          apiKey: effectiveApiKey,
          modelName: effectiveModel,
          backupModelName: effectiveBackupModel || undefined,
          projectId: targetProject.id,
          format: resolvedTurnFormat,
          projectType: targetProject.type ?? 'Short ad',
          recentMessages: conversationMessages,
          currentPlan: latestActivePlanMsg ? latestActivePlanMsg.plan : null,
          currentSpec: latestKitVideoMsg ? latestKitVideoMsg.spec : null,
          hasExistingVideo: Boolean(latestKitVideoMsg || latestLegacyVideoMsg),
          userPrompt,
          currentTurnParts,
          currentAttachmentSummaryLines: attachmentSummaryLines,
          signal: controller.signal,
          onPhase: (phase, detail) => {
            if (controller.signal.aborted) return;
            if (phase === 'design') {
              updateLiveRun((r) =>
                withStepStatus(
                  r,
                  'design',
                  'running',
                  undefined,
                  'Designing the video'
                )
              );
            } else if (phase === 'check') {
              updateLiveRun((r) => {
                const afterDesign = withStepStatus(r, 'design', 'done');
                return withStepStatus(afterDesign, 'check', 'running');
              });
            } else if (phase === 'repair') {
              updateLiveRun((r) =>
                withStepStatus(
                  r,
                  'check',
                  'running',
                  undefined,
                  detail || 'Fixing issues'
                )
              );
            }
          },
          onStatus: (ev) => {
            if (!ev || controller.signal.aborted) return;
            if (ev.type === 'attempt') {
              updateLiveRun((r) => ({
                ...r,
                modelName: ev.model,
                usedBackupModel: r.usedBackupModel || ev.isBackup,
              }));
            } else if (ev.type === 'waiting') {
              const reasonLabel =
                ev.reasonKind === 'quota_minute'
                  ? 'Rate limit reached — waiting to retry'
                  : ev.reasonKind === 'overloaded'
                    ? 'Google was busy — waiting to retry'
                    : 'Request timed out — retrying';
              updateLiveRun((r) => appendRunSubNote(r, reasonLabel));
            } else if (ev.type === 'fallback') {
              updateLiveRun((r) => {
                const withNote = appendRunSubNote(
                  r,
                  'Google was busy, switched to the backup model'
                );
                return {
                  ...withNote,
                  modelName: ev.toModel,
                  usedBackupModel: true,
                };
              });
            }
          },
          onUsage: (delta) => {
            if (!controller.signal.aborted) {
              updateLiveRun((r) => ({
                ...r,
                modelName: delta.modelName,
                usage: {
                  requests: r.usage.requests + delta.requestsMade,
                  promptTokens: r.usage.promptTokens + delta.promptTokens,
                  outputTokens: r.usage.outputTokens + delta.outputTokens,
                  thoughtTokens: r.usage.thoughtTokens + delta.thoughtTokens,
                },
              }));
            }
            setSessionUsage((prev) => ({
              requestsMade: prev.requestsMade + delta.requestsMade,
              promptTokens: prev.promptTokens + delta.promptTokens,
              outputTokens: prev.outputTokens + delta.outputTokens,
              thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
            }));
          },
        });

        if (controller.signal.aborted) {
          return;
        }

        if (result.ok) {
          const resolvedAction =
            result.output.kind === 'plan'
              ? 'create'
              : result.output.kind === 'edit'
                ? 'edit'
                : 'reply';

          updateLiveRun((r) => {
            let next = withStepStatus(r, 'check', 'done');
            next = withStepStatus(next, 'save', 'running');
            return {
              ...next,
              action: resolvedAction,
              modelName: result.debugInfo.modelName,
              usedBackupModel: result.debugInfo.usedBackupModel,
              artifacts: {
                ...next.artifacts,
                ...(result.output.kind === 'plan'
                  ? {
                      brief: `${result.output.plan.title} — ${result.output.plan.style.mood}`,
                      assumptions: result.output.assumptions,
                    }
                  : result.output.kind === 'edit'
                    ? {
                        parsedOps: result.output.ops,
                        assumptions: result.output.assumptions,
                      }
                    : {}),
              },
            };
          });

          const agentDebugInfo: AgentDebugInfo = {
            runId: currentRun.id,
            action: resolvedAction,
            modelName: result.debugInfo.modelName,
            requestedModelName: result.debugInfo.requestedModelName,
            usedBackupModel: result.debugInfo.usedBackupModel,
            requests: currentRun.usage.requests || 1,
            tokens: {
              prompt: currentRun.usage.promptTokens,
              output: currentRun.usage.outputTokens,
              thinking: currentRun.usage.thoughtTokens,
            },
            elapsedMs: Date.now() - currentRun.createdAt,
            timestamp: result.debugInfo.timestamp,
            rawRouterOutput: result.debugInfo.rawModelOutput,
          };

          if (result.output.kind === 'reply') {
            const finalizedRun = withRunFinalState(
              withStepStatus(currentRun, 'save', 'done'),
              { status: 'done' }
            );
            currentRun = finalizedRun;
            await persistRun(finalizedRun);
            setRunsById((prev) => ({
              ...prev,
              [finalizedRun.id]: finalizedRun,
            }));

            const assistantMsg = await addMessage({
              projectId: targetProject.id,
              type: 'assistant_text',
              content: result.output.text,
              runId: finalizedRun.id,
              debugInfo: agentDebugInfo,
            });
            if (activeProjectIdRef.current === targetProject.id) {
              setMessages((prev) => [...prev, assistantMsg]);
            }
          } else if (result.output.kind === 'edit') {
            const finalizedRun = withRunFinalState(
              withStepStatus(currentRun, 'save', 'done'),
              { status: 'done' }
            );
            currentRun = finalizedRun;
            await persistRun(finalizedRun);
            setRunsById((prev) => ({
              ...prev,
              [finalizedRun.id]: finalizedRun,
            }));

            let appliedUndoState: AssistantTextMessage['undoEdit'] | undefined;
            let updatedMessageOverride: ChatMessage | null = null;
            let updatedLegacyVideoOverride: LegacyVideoMessage | null = null;
            let replyContent = result.output.message;

            if (latestKitVideoMsg) {
              const applied = applyOps(latestKitVideoMsg.spec, result.output.ops);
              if (applied.errors.length === 0) {
                let history = kitHistoryRef.current.get(latestKitVideoMsg.id);
                if (!history) {
                  history = createKitHistory(
                    latestKitVideoMsg.spec,
                    'Before edit'
                  );
                  kitHistoryRef.current.set(latestKitVideoMsg.id, history);
                }
                history.commit(applied.spec, result.output.message);

                const savedKit = await updateKitVideoSpecInPlace({
                  messageId: latestKitVideoMsg.id,
                  spec: applied.spec,
                });
                updatedMessageOverride = savedKit ?? {
                  ...latestKitVideoMsg,
                  spec: applied.spec,
                };

                if (applied.spec.format !== (targetProject.format ?? '16:9')) {
                  const updatedProj = await updateProject(targetProject.id, {
                    format: applied.spec.format,
                  });
                  setStoredProjectFormat(targetProject.id, applied.spec.format);
                  if (activeProjectIdRef.current === targetProject.id) {
                    setActiveProjectFormatPref(applied.spec.format);
                  }
                  setProjects((prev) =>
                    prev.map((p) =>
                      p.id === targetProject.id ? updatedProj : p
                    )
                  );
                }

                appliedUndoState = {
                  targetKind: 'kit',
                  targetMessageId: latestKitVideoMsg.id,
                  previousSpec: latestKitVideoMsg.spec,
                  previousFormat: targetProject.format,
                };
              } else {
                replyContent = `${result.output.message}\n\nNote: ${applied.errors[0]}`;
              }
            } else if (latestActivePlanMsg) {
              const planEdit = applyOpsToPlan(
                latestActivePlanMsg.plan,
                result.output.ops
              );
              if (planEdit.appliedCount > 0) {
                const nextPlanFormat =
                  planEdit.nextFormat ?? latestActivePlanMsg.format;
                const updatedPlanMsg: PlanMessage = {
                  ...latestActivePlanMsg,
                  plan: planEdit.plan,
                  format: nextPlanFormat,
                };
                await updateMessage(updatedPlanMsg);
                updatedMessageOverride = updatedPlanMsg;

                if (
                  planEdit.nextFormat &&
                  planEdit.nextFormat !== (targetProject.format ?? '16:9')
                ) {
                  const updatedProj = await updateProject(targetProject.id, {
                    format: planEdit.nextFormat,
                  });
                  setStoredProjectFormat(targetProject.id, planEdit.nextFormat);
                  if (activeProjectIdRef.current === targetProject.id) {
                    setActiveProjectFormatPref(planEdit.nextFormat);
                  }
                  setProjects((prev) =>
                    prev.map((p) =>
                      p.id === targetProject.id ? updatedProj : p
                    )
                  );
                  if (latestLegacyVideoMsg) {
                    const dims = getDimensionsForFormat(planEdit.nextFormat);
                    const updatedLegacy: LegacyVideoMessage = {
                      ...latestLegacyVideoMsg,
                      format: planEdit.nextFormat,
                      width: dims.width,
                      height: dims.height,
                    };
                    await updateMessage(updatedLegacy);
                    updatedLegacyVideoOverride = updatedLegacy;
                  }
                }

                appliedUndoState = {
                  targetKind: 'plan',
                  targetMessageId: latestActivePlanMsg.id,
                  previousPlan: latestActivePlanMsg.plan,
                  previousFormat: targetProject.format,
                };
              }
            }

            const assistantMsg = await addMessage({
              projectId: targetProject.id,
              type: 'assistant_text',
              content: replyContent,
              runId: finalizedRun.id,
              assumptions: result.output.assumptions,
              debugInfo: agentDebugInfo,
              ...(appliedUndoState ? { undoEdit: appliedUndoState } : {}),
            });

            if (activeProjectIdRef.current === targetProject.id) {
              setMessages((prev) => {
                const mapped = prev.map((m) => {
                  if (updatedMessageOverride && m.id === updatedMessageOverride.id) {
                    return updatedMessageOverride;
                  }
                  if (
                    updatedLegacyVideoOverride &&
                    m.id === updatedLegacyVideoOverride.id
                  ) {
                    return updatedLegacyVideoOverride;
                  }
                  return m;
                });
                return [...mapped, assistantMsg];
              });
            }
          } else {
            const finalizedRun = withRunFinalState(
              withStepStatus(currentRun, 'save', 'done'),
              { status: 'done' }
            );
            currentRun = finalizedRun;
            await persistRun(finalizedRun);
            setRunsById((prev) => ({
              ...prev,
              [finalizedRun.id]: finalizedRun,
            }));

            const nextFormat =
              result.updatedFormat ?? targetProject.format ?? '16:9';
            const nextProjectRecord =
              result.updatedProject ??
              (result.updatedFormat
                ? { ...targetProject, format: result.updatedFormat }
                : targetProject);

            if (result.updatedFormat) {
              setStoredProjectFormat(targetProject.id, result.updatedFormat);
              if (activeProjectIdRef.current === targetProject.id) {
                setActiveProjectFormatPref(result.updatedFormat);
              }
            }

            if (result.updatedFormat || result.updatedProject) {
              setProjects((prev) =>
                prev.map((p) =>
                  p.id === targetProject.id ? nextProjectRecord : p
                )
              );
            }

            if (result.updatedSpec && latestKitVideoMsg) {
              await updateKitVideoSpecInPlace({
                messageId: latestKitVideoMsg.id,
                spec: result.updatedSpec,
              });
            }

            const { createdPlanMessage, allMessages } = await savePlanTurn({
              projectId: targetProject.id,
              format: nextFormat,
              projectType: targetProject.type ?? 'Short ad',
              message: result.output.message,
              assumptions: result.output.assumptions,
              plan: result.output.plan,
              runId: finalizedRun.id,
              debugInfo: result.debugInfo,
            });
            let messagesAfterPlan = allMessages;
            if (activeProjectIdRef.current === targetProject.id) {
              setMessages(messagesAfterPlan);
            }

            if (autoBuild && startVideoBuildRef.current) {
              const startText = isBengaliText(userPrompt)
                ? 'আপনার ভিডিও তৈরি করছি…'
                : 'Building your video…';
              const buildStartMsg = await addMessage({
                projectId: targetProject.id,
                type: 'assistant_text',
                content: startText,
                createdAt: Math.max(
                  Date.now(),
                  createdPlanMessage.createdAt + 1
                ),
              });
              messagesAfterPlan = [...messagesAfterPlan, buildStartMsg];
              if (activeProjectIdRef.current === targetProject.id) {
                setMessages(messagesAfterPlan);
              }
              void startVideoBuildRef.current(
                nextProjectRecord,
                createdPlanMessage,
                messagesAfterPlan,
                buildStartMsg.createdAt + 1
              );
            }
          }
          turnSucceeded = true;
        } else {
          const failedRun = withRunFinalState(
            withStepStatus(currentRun, 'check', 'failed'),
            {
              status: 'failed',
              error: {
                summary: result.summary,
                userAction: result.userAction,
                errorKind: result.errorKind,
                details: result.details,
                retryable: result.retryable,
                retryPrompt: userPrompt,
                retryAttachments: mediaRecords.map((m) => ({
                  mediaId: m.id,
                  kind: m.kind,
                  name: m.name,
                  mime: m.mime,
                  size: m.size,
                  width: m.width,
                  height: m.height,
                  duration: m.duration,
                })),
              },
            }
          );
          await persistRun(failedRun);
          setRunsById((prev) => ({ ...prev, [failedRun.id]: failedRun }));

          const errorMsg = await addMessage({
            projectId: targetProject.id,
            type: 'error',
            runId: failedRun.id,
            summary: result.summary,
            userAction: result.userAction,
            errorKind: result.errorKind,
            needsBackupModel:
              result.errorKind === 'model_not_found' && !effectiveBackupModel,
            details: result.details,
            retryable: result.retryable,
            retryPrompt: userPrompt,
            retryAttachments: failedRun.error?.retryAttachments,
            debugInfo: result.debugInfo,
          });
          if (activeProjectIdRef.current === targetProject.id) {
            setMessages((prev) => [...prev, errorMsg]);
          }
        }

        await refreshProjectsList();
      } catch (err: unknown) {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }
        const messageText = err instanceof Error ? err.message : String(err);
        const failedRun = withRunFinalState(
          withStepStatus(currentRun, 'design', 'failed'),
          {
            status: 'failed',
            error: {
              summary: 'Could not reach Gemini.',
              userAction: 'Check your internet connection and retry.',
              details: messageText,
              retryable: true,
              retryPrompt: userPrompt,
            },
          }
        );
        await persistRun(failedRun);
        setRunsById((prev) => ({ ...prev, [failedRun.id]: failedRun }));

        const errorMsg = await addMessage({
          projectId: targetProject.id,
          type: 'error',
          runId: failedRun.id,
          summary: 'Could not reach Gemini.',
          userAction: 'Check your internet connection and retry.',
          details: messageText,
          retryable: true,
          retryPrompt: userPrompt,
          retryAttachments: mediaRecords.map((m) => ({
            mediaId: m.id,
            kind: m.kind,
            name: m.name,
            mime: m.mime,
            size: m.size,
            width: m.width,
            height: m.height,
            duration: m.duration,
          })),
        });
        if (activeProjectIdRef.current === targetProject.id) {
          setMessages((prev) => [...prev, errorMsg]);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setThinkingStartedAt(null);
          setActiveRun(null);

          if (turnSucceeded) {
            const pendingQueue = queuedDraftsRef.current;
            const nextQueued = pendingQueue.find((d) => d.status === 'queued');
            if (nextQueued) {
              setQueuedDrafts((prev) =>
                prev.filter((d) => d.id !== nextQueued.id)
              );
              window.setTimeout(() => {
                void dispatchUserTurnImmediate(
                  nextQueued.text,
                  nextQueued.attachments
                );
              }, 0);
            }
          } else {
            setQueuedDrafts((prev) =>
              prev.map((d) =>
                d.status === 'queued' ? { ...d, status: 'paused_failed' } : d
              )
            );
          }
        }
      }
    },
    [
      autoBuild,
      defaultFormat,
      dispatchUserTurnImmediate,
      effectiveApiKey,
      effectiveBackupModel,
      effectiveModel,
      refreshProjectsList,
    ]
  );

  useEffect(() => {
    executeDirectorTurnRef.current = executeDirectorTurn;
  }, [executeDirectorTurn]);

  const handleSendMessage = async (
    content: string,
    attachments: Array<Omit<MediaRecord, 'projectId'>>
  ): Promise<boolean> => {
    if (!effectiveApiKey) {
      return false;
    }

    if (!effectiveModel) {
      setSettingsOpen(true);
      showToast('Select a Gemini model in Settings first.', 'info');
      return false;
    }

    if (thinkingStartedAt !== null || buildingVideoMessageId !== null) {
      const queuedItem: QueuedMessageDraft = {
        id: createDbId(),
        text: content,
        attachments,
        createdAt: Date.now(),
        status: 'queued',
      };
      setQueuedDrafts((prev) => [...prev, queuedItem]);
      return true;
    }

    return dispatchUserTurnImmediate(content, attachments);
  };

  const handleCancelQueued = (draftId: string) => {
    setQueuedDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  const handleSendQueuedNow = (draftId: string) => {
    if (thinkingStartedAt !== null || buildingVideoMessageId !== null) {
      return;
    }
    const target = queuedDrafts.find((d) => d.id === draftId);
    if (!target) return;
    setQueuedDrafts((prev) => prev.filter((d) => d.id !== draftId));
    void dispatchUserTurnImmediate(target.text, target.attachments);
  };

  const handleRetryAssistantTurn = (assistantMessageId: string) => {
    if (
      !activeProject ||
      thinkingStartedAt !== null ||
      buildingVideoMessageId !== null
    ) {
      return;
    }
    if (!effectiveModel) {
      setSettingsOpen(true);
      showToast('Select a Gemini model in Settings first.', 'info');
      return;
    }

    const assistantIdx = messages.findIndex((m) => m.id === assistantMessageId);
    if (assistantIdx < 0) return;

    let userIdx = -1;
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (messages[i].type === 'user_text') {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) return;

    const userMsg = messages[userIdx];
    if (userMsg.type !== 'user_text') return;

    const historyPrior = messages.slice(0, userIdx);
    const attachmentIds = (userMsg.attachments ?? []).map((a) => a.mediaId);
    const staleErrorsAfterUser = messages
      .slice(userIdx + 1)
      .filter((m) => m.type === 'error' || m.type === 'run_error');
    if (staleErrorsAfterUser.length > 0) {
      const removeIds = new Set(staleErrorsAfterUser.map((m) => m.id));
      const cleanedMessages = messages.filter((m) => !removeIds.has(m.id));
      setMessages(cleanedMessages);
      setMessageCountByProjectId((prev) => ({
        ...prev,
        [activeProject.id]: cleanedMessages.length,
      }));
    }

    void (async () => {
      for (const errMsg of staleErrorsAfterUser) {
        await deleteMessage(errMsg.id);
      }
      const mediaRecords =
        attachmentIds.length > 0
          ? await getMediaRecordsByIds(attachmentIds)
          : [];
      await executeDirectorTurn(
        activeProject,
        historyPrior,
        userMsg.content,
        mediaRecords,
        userMsg.id
      );
    })();
  };

  const handleRetryError = (errorMessage: ErrorMessage | RunErrorMessage) => {
    if (
      !activeProject ||
      (errorMessage.retryPrompt === undefined &&
        (!errorMessage.retryAttachments ||
          errorMessage.retryAttachments.length === 0)) ||
      thinkingStartedAt !== null ||
      buildingVideoMessageId !== null
    ) {
      return;
    }
    if (!effectiveModel) {
      setSettingsOpen(true);
      showToast('Select a Gemini model in Settings first.', 'info');
      return;
    }

    const attachmentIds = (errorMessage.retryAttachments ?? []).map(
      (a) => a.mediaId
    );
    const messagesWithoutError = messages.filter(
      (m) => m.id !== errorMessage.id
    );
    setMessages(messagesWithoutError);
    setMessageCountByProjectId((prev) => ({
      ...prev,
      [activeProject.id]: messagesWithoutError.length,
    }));

    void (async () => {
      await deleteMessage(errorMessage.id);
      const mediaRecords =
        attachmentIds.length > 0
          ? await getMediaRecordsByIds(attachmentIds)
          : [];
      const retryPromptText = errorMessage.retryPrompt ?? '';
      const latestActivePlanMsg =
        [...messagesWithoutError]
          .reverse()
          .find(
            (m): m is PlanMessage =>
              m.type === 'plan' && m.status !== 'superseded'
          ) ?? null;
      if (
        mediaRecords.length === 0 &&
        !retryPromptText.includes('?') &&
        isBuildIntent(
          retryPromptText,
          latestActivePlanMsg ? latestActivePlanMsg.plan : null
        ) &&
        latestActivePlanMsg
      ) {
        if (startVideoBuildRef.current) {
          await startVideoBuildRef.current(
            activeProject,
            latestActivePlanMsg,
            messagesWithoutError
          );
        }
        return;
      }
      await executeDirectorTurn(
        activeProject,
        messagesWithoutError,
        retryPromptText,
        mediaRecords
      );
    })();
  };

  const handleUndoEdit = useCallback(
    async (assistantMessageId: string) => {
      const targetMsg = messages.find(
        (m): m is AssistantTextMessage =>
          m.id === assistantMessageId && m.type === 'assistant_text'
      );
      if (!targetMsg?.undoEdit || targetMsg.undoEdit.undone) {
        return;
      }
      const { undoEdit } = targetMsg;
      let restoredTargetMsg: ChatMessage | null = null;
      let restoredLegacyMsg: LegacyVideoMessage | null = null;

      if (undoEdit.targetKind === 'kit') {
        const history = kitHistoryRef.current.get(undoEdit.targetMessageId);
        const undoneSpec = history?.undo()?.spec ?? undoEdit.previousSpec;
        if (!undoneSpec) return;

        const saved = await updateKitVideoSpecInPlace({
          messageId: undoEdit.targetMessageId,
          spec: undoneSpec,
        });
        if (saved) {
          restoredTargetMsg = saved;
        }
        if (undoEdit.previousFormat) {
          const updatedProj = await updateProject(targetMsg.projectId, {
            format: undoEdit.previousFormat,
          });
          setProjects((prev) =>
            prev.map((p) => (p.id === updatedProj.id ? updatedProj : p))
          );
        }
      } else if (undoEdit.targetKind === 'plan' && undoEdit.previousPlan) {
        const existingPlanMsg = messages.find(
          (m): m is PlanMessage =>
            m.id === undoEdit.targetMessageId && m.type === 'plan'
        );
        if (existingPlanMsg) {
          const restoredFormat =
            undoEdit.previousFormat ?? existingPlanMsg.format;
          const restoredPlanMsg: PlanMessage = {
            ...existingPlanMsg,
            plan: undoEdit.previousPlan,
            format: restoredFormat,
          };
          await updateMessage(restoredPlanMsg);
          restoredTargetMsg = restoredPlanMsg;

          if (undoEdit.previousFormat) {
            const updatedProj = await updateProject(targetMsg.projectId, {
              format: undoEdit.previousFormat,
            });
            setProjects((prev) =>
              prev.map((p) => (p.id === updatedProj.id ? updatedProj : p))
            );
            const activeLegacy = [...messages]
              .reverse()
              .find(
                (m): m is LegacyVideoMessage =>
                  isLegacyVideoMessage(m) && m.status !== 'superseded'
              );
            if (activeLegacy && activeLegacy.format !== undoEdit.previousFormat) {
              const dims = getDimensionsForFormat(undoEdit.previousFormat);
              const restoredLegacy: LegacyVideoMessage = {
                ...activeLegacy,
                format: undoEdit.previousFormat,
                width: dims.width,
                height: dims.height,
              };
              await updateMessage(restoredLegacy);
              restoredLegacyMsg = restoredLegacy;
            }
          }
        }
      }

      const markedAssistantMsg: AssistantTextMessage = {
        ...targetMsg,
        undoEdit: {
          ...undoEdit,
          undone: true,
        },
      };
      await updateMessage(markedAssistantMsg);

      if (activeProjectIdRef.current === targetMsg.projectId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === markedAssistantMsg.id) return markedAssistantMsg;
            if (restoredTargetMsg && m.id === restoredTargetMsg.id) {
              return restoredTargetMsg;
            }
            if (restoredLegacyMsg && m.id === restoredLegacyMsg.id) {
              return restoredLegacyMsg;
            }
            return m;
          })
        );
      }
      showToast('Edit undone', 'info');
    },
    [messages, showToast]
  );

  const executeVideoSceneQueue = useCallback(
    async (params: {
      projectId: string;
      planMessage: PlanMessage;
      initialVideoMessage: VideoMessage;
      sceneIdsToBuild: Set<string>;
      initialRepairContextBySceneId?: Record<
        string,
        { previousCode: string; errorMessage: string }
      >;
    }) => {
      const {
        projectId,
        planMessage,
        initialVideoMessage,
        sceneIdsToBuild,
        initialRepairContextBySceneId,
      } = params;

      const controller = new AbortController();
      videoAbortControllerRef.current = controller;
      setBuildingVideoMessageId(initialVideoMessage.id);
      setActiveVideoStatusDetail(null);
      setActiveVideoWaitStartedAt(Date.now());

      let workingVideo: VideoMessage = initialVideoMessage;
      let pausedByBusy = false;
      let pausedBusyMessage: string | undefined;

      const commitVideoState = async (
        nextVideo: VideoMessage,
        persistToDb: boolean
      ) => {
        workingVideo = nextVideo;
        if (activeProjectIdRef.current === projectId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === nextVideo.id ? nextVideo : m))
          );
        }
        if (persistToDb) {
          await updateMessage(nextVideo);
        }
      };

      const plan = planMessage.plan;
      const otherScenesSummary = plan.scenes.map((s) => ({
        name: s.name,
        motion: s.motion,
      }));

      const endOfBuildRetryIds: string[] = [];

      const applyBusyPause = async (
        targetSceneId: string,
        targetSceneName: string,
        planSceneSpecHash: string,
        result: Extract<Awaited<ReturnType<typeof buildSingleScene>>, { ok: false }>,
        candidateScopeIds: Set<string>
      ) => {
        pausedByBusy = true;
        pausedBusyMessage = result.userAction
          ? `${result.error} ${result.userAction}`
          : result.error;
        const statusNoteLabel =
          result.errorKind === 'quota_day'
            ? 'Daily quota used up'
            : result.errorKind === 'quota_minute'
              ? 'Rate limit reached'
              : result.errorKind === 'timeout' ||
                  result.errorKind === 'timeout_budget'
                ? 'Timed out'
                : 'Model overloaded';

        await commitVideoState(
          {
            ...workingVideo,
            scenes: workingVideo.scenes.map((s) => {
              if (s.sceneId === targetSceneId) {
                return {
                  ...s,
                  name: targetSceneName,
                  specHash: planSceneSpecHash,
                  status: 'pending',
                  statusNote: statusNoteLabel,
                  modelName: result.modelName,
                  tokens: s.tokens + result.tokens,
                  promptTokens: (s.promptTokens ?? 0) + result.promptTokens,
                  outputTokens: (s.outputTokens ?? 0) + result.outputTokens,
                  thoughtTokens: (s.thoughtTokens ?? 0) + result.thoughtTokens,
                  elapsedMs: s.elapsedMs + result.elapsedMs,
                  error: undefined,
                  errorKind: undefined,
                };
              }
              if (
                candidateScopeIds.has(s.sceneId) &&
                s.status !== 'ok' &&
                s.status !== 'failed'
              ) {
                return {
                  ...s,
                  status: 'pending',
                  statusNote: statusNoteLabel,
                  error: undefined,
                  errorKind: undefined,
                };
              }
              return s;
            }),
          },
          true
        );
      };

      try {
        for (let idx = 0; idx < plan.scenes.length; idx++) {
          const planScene = plan.scenes[idx];
          if (!sceneIdsToBuild.has(planScene.id)) continue;

          if (controller.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          setActiveVideoWaitStartedAt(Date.now());

          const initialStage = initialRepairContextBySceneId?.[planScene.id]
            ? 'repairing'
            : 'writing';

          await commitVideoState(
            {
              ...workingVideo,
              scenes: workingVideo.scenes.map((s) =>
                s.sceneId === planScene.id
                  ? {
                      ...s,
                      name: planScene.name,
                      specHash: computeSceneSpecHash(planScene),
                      status: initialStage,
                      statusNote: undefined,
                      error: undefined,
                      errorKind: undefined,
                    }
                  : s
              ),
            },
            false
          );

          const result = await buildSingleScene({
            apiKey: effectiveApiKey,
            modelName: effectiveModel,
            backupModelName: effectiveBackupModel || undefined,
            format: workingVideo.format,
            width: workingVideo.width,
            height: workingVideo.height,
            fps: workingVideo.fps,
            style: plan.style,
            scene: planScene,
            sceneIndex: idx,
            totalScenes: plan.scenes.length,
            otherScenes: otherScenesSummary,
            initialRepairContext: initialRepairContextBySceneId?.[planScene.id],
            signal: controller.signal,
            probeScene: async (probeReq) => {
              if (!probeRef.current) {
                return { ok: true };
              }
              return probeRef.current.probeScene(probeReq);
            },
            onStageChange: (stage) => {
              if (controller.signal.aborted) return;
              workingVideo = {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id ? { ...s, status: stage } : s
                ),
              };
              if (activeProjectIdRef.current === projectId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === workingVideo.id ? workingVideo : m
                  )
                );
              }
            },
            onStatus: (ev) => {
              if (!controller.signal.aborted) {
                setActiveVideoStatusDetail(ev ? ev.message : null);
              }
            },
            onUsage: (delta) => {
              setActiveVideoWaitStartedAt(Date.now());
              setSessionUsage((prev) => ({
                requestsMade: prev.requestsMade + delta.requestsMade,
                promptTokens: prev.promptTokens + delta.promptTokens,
                outputTokens: prev.outputTokens + delta.outputTokens,
                thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
              }));
            },
          });

          setActiveVideoStatusDetail(null);

          if (result.ok) {
            setCompiledByVideoId((prev) => ({
              ...prev,
              [workingVideo.id]: {
                ...(prev[workingVideo.id] ?? {}),
                [planScene.id]: result.component,
              },
            }));

            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        name: planScene.name,
                        specHash: computeSceneSpecHash(planScene),
                        status: 'ok',
                        statusNote: undefined,
                        modelName: result.modelName,
                        code: result.code,
                        rawOutputs: result.rawOutputs,
                        attempts: result.attempts,
                        tokens: result.tokens,
                        promptTokens: result.promptTokens,
                        outputTokens: result.outputTokens,
                        thoughtTokens: result.thoughtTokens,
                        elapsedMs: result.elapsedMs,
                        error: undefined,
                        errorKind: undefined,
                      }
                    : s
                ),
              },
              true
            );
          } else if (result.transientBusy) {
            await applyBusyPause(
              planScene.id,
              planScene.name,
              computeSceneSpecHash(planScene),
              result,
              sceneIdsToBuild
            );
            break;
          } else {
            const fullSceneError = result.userAction
              ? `${result.error} ${result.userAction}`
              : result.error;
            if (isEndOfBuildRetryEligible(result.errorKind)) {
              endOfBuildRetryIds.push(planScene.id);
            }
            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        name: planScene.name,
                        specHash: computeSceneSpecHash(planScene),
                        status: 'failed',
                        statusNote: undefined,
                        modelName: result.modelName,
                        code: result.code,
                        rawOutputs: result.rawOutputs,
                        attempts: result.attempts,
                        tokens: result.tokens,
                        promptTokens: result.promptTokens,
                        outputTokens: result.outputTokens,
                        thoughtTokens: result.thoughtTokens,
                        elapsedMs: result.elapsedMs,
                        error: fullSceneError,
                        errorKind: result.errorKind,
                      }
                    : s
                ),
              },
              true
            );
          }
        }

        // End-of-build single automatic retry for scenes that failed for a
        // transient or model reason (overloaded, timeout, quota, model_not_found).
        if (
          !controller.signal.aborted &&
          !pausedByBusy &&
          endOfBuildRetryIds.length > 0
        ) {
          const retryScopeIds = new Set(endOfBuildRetryIds);
          const retryPrimaryModel = effectiveBackupModel || effectiveModel;
          const retryStatusNote = effectiveBackupModel
            ? RETRYING_ON_BACKUP_MODEL_NOTE
            : 'retrying failed scene';

          for (const retrySceneId of endOfBuildRetryIds) {
            const idx = plan.scenes.findIndex((s) => s.id === retrySceneId);
            if (idx < 0) continue;
            const planScene = plan.scenes[idx];

            if (controller.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            setActiveVideoWaitStartedAt(Date.now());
            const existingRecord = workingVideo.scenes.find(
              (s) => s.sceneId === planScene.id
            );
            const retryStage = initialRepairContextBySceneId?.[planScene.id]
              ? 'repairing'
              : 'writing';

            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        status: retryStage,
                        statusNote: retryStatusNote,
                        error: undefined,
                        errorKind: undefined,
                      }
                    : s
                ),
              },
              false
            );

            const retryResult = await buildSingleScene({
              apiKey: effectiveApiKey,
              modelName: retryPrimaryModel,
              backupModelName: undefined,
              format: workingVideo.format,
              width: workingVideo.width,
              height: workingVideo.height,
              fps: workingVideo.fps,
              style: plan.style,
              scene: planScene,
              sceneIndex: idx,
              totalScenes: plan.scenes.length,
              otherScenes: otherScenesSummary,
              initialRepairContext: initialRepairContextBySceneId?.[planScene.id],
              signal: controller.signal,
              probeScene: async (probeReq) => {
                if (!probeRef.current) {
                  return { ok: true };
                }
                return probeRef.current.probeScene(probeReq);
              },
              onStageChange: (stage) => {
                if (controller.signal.aborted) return;
                workingVideo = {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id ? { ...s, status: stage } : s
                  ),
                };
                if (activeProjectIdRef.current === projectId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === workingVideo.id ? workingVideo : m
                    )
                  );
                }
              },
              onStatus: (ev) => {
                if (!controller.signal.aborted) {
                  setActiveVideoStatusDetail(ev ? ev.message : null);
                }
              },
              onUsage: (delta) => {
                setActiveVideoWaitStartedAt(Date.now());
                setSessionUsage((prev) => ({
                  requestsMade: prev.requestsMade + delta.requestsMade,
                  promptTokens: prev.promptTokens + delta.promptTokens,
                  outputTokens: prev.outputTokens + delta.outputTokens,
                  thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
                }));
              },
            });

            setActiveVideoStatusDetail(null);

            const prevRawOutputs = existingRecord?.rawOutputs ?? [];
            const prevAttempts = existingRecord?.attempts ?? [];
            const prevTokens = existingRecord?.tokens ?? 0;
            const prevPromptTokens = existingRecord?.promptTokens ?? 0;
            const prevOutputTokens = existingRecord?.outputTokens ?? 0;
            const prevThoughtTokens = existingRecord?.thoughtTokens ?? 0;
            const prevElapsedMs = existingRecord?.elapsedMs ?? 0;

            if (retryResult.ok) {
              setCompiledByVideoId((prev) => ({
                ...prev,
                [workingVideo.id]: {
                  ...(prev[workingVideo.id] ?? {}),
                  [planScene.id]: retryResult.component,
                },
              }));

              await commitVideoState(
                {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id
                      ? {
                          ...s,
                          name: planScene.name,
                          specHash: computeSceneSpecHash(planScene),
                          status: 'ok',
                          statusNote: undefined,
                          modelName: retryResult.modelName,
                          code: retryResult.code,
                          rawOutputs: [...prevRawOutputs, ...retryResult.rawOutputs],
                          attempts: [...prevAttempts, ...retryResult.attempts],
                          tokens: prevTokens + retryResult.tokens,
                          promptTokens: prevPromptTokens + retryResult.promptTokens,
                          outputTokens: prevOutputTokens + retryResult.outputTokens,
                          thoughtTokens:
                            prevThoughtTokens + retryResult.thoughtTokens,
                          elapsedMs: prevElapsedMs + retryResult.elapsedMs,
                          error: undefined,
                          errorKind: undefined,
                        }
                      : s
                  ),
                },
                true
              );
            } else if (retryResult.transientBusy) {
              await applyBusyPause(
                planScene.id,
                planScene.name,
                computeSceneSpecHash(planScene),
                retryResult,
                retryScopeIds
              );
              break;
            } else {
              const fullRetryError = retryResult.userAction
                ? `${retryResult.error} ${retryResult.userAction}`
                : retryResult.error;
              await commitVideoState(
                {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id
                      ? {
                          ...s,
                          name: planScene.name,
                          specHash: computeSceneSpecHash(planScene),
                          status: 'failed',
                          statusNote: undefined,
                          modelName: retryResult.modelName,
                          code: retryResult.code || existingRecord?.code || '',
                          rawOutputs: [...prevRawOutputs, ...retryResult.rawOutputs],
                          attempts: [...prevAttempts, ...retryResult.attempts],
                          tokens: prevTokens + retryResult.tokens,
                          promptTokens: prevPromptTokens + retryResult.promptTokens,
                          outputTokens: prevOutputTokens + retryResult.outputTokens,
                          thoughtTokens:
                            prevThoughtTokens + retryResult.thoughtTokens,
                          elapsedMs: prevElapsedMs + retryResult.elapsedMs,
                          error: fullRetryError,
                          errorKind: retryResult.errorKind,
                        }
                      : s
                  ),
                },
                true
              );
            }
          }
        }
      } catch (err: unknown) {
        if (!isAbortError(err) && !controller.signal.aborted) {
          const fallbackMsg = err instanceof Error ? err.message : String(err);
          showToast(fallbackMsg, 'danger');
        }
      } finally {
        const wasAborted = controller.signal.aborted;
        const finalizedScenes: VideoSceneRecord[] = workingVideo.scenes.map(
          (scene) => {
            if (scene.status === 'ok' || scene.status === 'failed') {
              return scene;
            }
            if (wasAborted) {
              return {
                ...scene,
                status: 'pending',
                statusNote: 'Stopped',
                error: undefined,
              };
            }
            if (pausedByBusy) {
              return {
                ...scene,
                status: 'pending',
                statusNote: scene.statusNote ?? 'Paused',
                error: undefined,
              };
            }
            return {
              ...scene,
              status: 'failed',
              error: 'Scene build did not complete.',
            };
          }
        );

        let finalStatus: VideoStatus;
        let pauseReason: VideoMessage['pauseReason'] = undefined;

        if (wasAborted) {
          finalStatus = 'paused';
          pauseReason = 'stopped';
        } else if (pausedByBusy) {
          finalStatus = 'paused';
          pauseReason = 'google_busy';
        } else {
          const okCount = finalizedScenes.filter((s) => s.status === 'ok').length;
          finalStatus =
            okCount === finalizedScenes.length
              ? 'ready'
              : okCount > 0
                ? 'partial'
                : 'failed';
        }

        await commitVideoState(
          {
            ...workingVideo,
            status: finalStatus,
            pauseReason,
            pauseMessage:
              finalStatus === 'paused' && pausedByBusy
                ? pausedBusyMessage
                : undefined,
            scenes: finalizedScenes,
            finishedAt: Date.now(),
          },
          true
        );

        let haltExplanation: string | null = null;
        if (finalStatus === 'failed') {
          const firstError = (
            finalizedScenes.find((s) => s.status === 'failed')?.error ??
            'Unknown error'
          )
            .trim()
            .slice(0, 120);
          haltExplanation = `I ran into an error building your video. ${firstError}. Tap Retry on any failed scene or try a different model in Settings.`;
        } else if (finalStatus === 'partial') {
          const okCount = finalizedScenes.filter(
            (s) => s.status === 'ok'
          ).length;
          const firstError = (
            finalizedScenes.find((s) => s.status === 'failed')?.error ??
            'Unknown error'
          )
            .trim()
            .slice(0, 100);
          haltExplanation = `I built ${okCount} of ${finalizedScenes.length} scenes. ${firstError}. You can retry the failed scenes individually.`;
        } else if (finalStatus === 'paused' && pauseReason === 'google_busy') {
          haltExplanation =
            "Google's servers were busy so I paused the build. Tap Resume on the video card to continue from where it stopped, or switch to another model in Settings.";
        }

        if (haltExplanation) {
          const explanationMsg = await addMessage({
            projectId,
            type: 'assistant_text',
            content: haltExplanation,
            createdAt: Date.now(),
          });
          if (activeProjectIdRef.current === projectId) {
            setMessages((prev) => [...prev, explanationMsg]);
          }
        }

        await refreshProjectsList();

        if (videoAbortControllerRef.current === controller) {
          videoAbortControllerRef.current = null;
          setBuildingVideoMessageId(null);
          setActiveVideoStatusDetail(null);
          setActiveVideoWaitStartedAt(null);
        }
      }
    },
    [
      effectiveApiKey,
      effectiveBackupModel,
      effectiveModel,
      refreshProjectsList,
      showToast,
    ]
  );

  const startVideoBuildForPlan = useCallback(
    async (
      targetProject: Project,
      planMsg: PlanMessage,
      currentMessages: ChatMessage[],
      minCreatedAt?: number
    ) => {
      if (!effectiveApiKey || !effectiveModel) return;

      const durationValidation = validatePlanTotalDuration(
        planMsg.plan,
        planMsg.projectType
      );
      if (!durationValidation.valid) {
        showToast(
          durationValidation.error || 'Adjust scene durations before building.',
          'danger'
        );
        return;
      }

      const approvedPlanMsg: PlanMessage =
        planMsg.status === 'approved'
          ? planMsg
          : { ...planMsg, status: 'approved' };

      if (planMsg.status !== 'approved') {
        await updateMessage(approvedPlanMsg);
        if (activeProjectIdRef.current === targetProject.id) {
          setMessages((prev) =>
            prev.map((m) => (m.id === approvedPlanMsg.id ? approvedPlanMsg : m))
          );
        }
      }

      const existingLinkedVideo = [...currentMessages]
        .reverse()
        .find(
          (m): m is LegacyVideoMessage =>
            isLegacyVideoMessage(m) &&
            m.planMessageId === approvedPlanMsg.id &&
            m.status !== 'superseded'
        );

      const prevCompiled = existingLinkedVideo
        ? compiledByVideoId[existingLinkedVideo.id] ?? {}
        : {};

      const sceneIdsToBuild = new Set<string>();
      const reusedCompiled: Record<string, CompiledComponentType> = {};
      const scenes: VideoSceneRecord[] = approvedPlanMsg.plan.scenes.map(
        (planScene) => {
          const specHash = computeSceneSpecHash(planScene);
          const existingRecord = existingLinkedVideo?.scenes.find(
            (s) => s.sceneId === planScene.id
          );
          if (
            existingRecord &&
            existingRecord.status === 'ok' &&
            existingRecord.specHash === specHash &&
            existingRecord.code
          ) {
            const compiled =
              prevCompiled[planScene.id] ??
              (() => {
                const res = compileComponent(existingRecord.code);
                return res.ok ? res.component : undefined;
              })();
            if (compiled) {
              reusedCompiled[planScene.id] = compiled;
              return {
                ...existingRecord,
                name: planScene.name,
                specHash,
              };
            }
          }
          sceneIdsToBuild.add(planScene.id);
          return {
            sceneId: planScene.id,
            name: planScene.name,
            specHash,
            status: 'pending',
            code: '',
            attempts: [],
            tokens: 0,
            elapsedMs: 0,
          };
        }
      );

      if (sceneIdsToBuild.size === 0) {
        for (const sc of approvedPlanMsg.plan.scenes) {
          sceneIdsToBuild.add(sc.id);
        }
        for (let i = 0; i < scenes.length; i++) {
          scenes[i] = {
            ...scenes[i],
            status: 'pending',
            statusNote: undefined,
            error: undefined,
            errorKind: undefined,
          };
        }
      }

      const format = approvedPlanMsg.format ?? targetProject.format ?? '16:9';
      const { width, height } = getDimensionsForFormat(format);
      const fps = VIDEO_FPS;

      const { createdVideoMessage, allMessages } = await saveNewVideoBuildTurn({
        projectId: targetProject.id,
        planMessageId: approvedPlanMsg.id,
        planVersion: approvedPlanMsg.version,
        scenes,
        width,
        height,
        fps,
        modelName: effectiveModel,
        format,
        ...(minCreatedAt !== undefined
          ? { createdAt: Math.max(Date.now(), minCreatedAt) }
          : {}),
      });

      if (Object.keys(reusedCompiled).length > 0) {
        setCompiledByVideoId((prev) => ({
          ...prev,
          [createdVideoMessage.id]: reusedCompiled,
        }));
      }

      if (activeProjectIdRef.current === targetProject.id) {
        setMessages(allMessages);
      }
      await refreshProjectsList();

      await executeVideoSceneQueue({
        projectId: targetProject.id,
        planMessage: approvedPlanMsg,
        initialVideoMessage: createdVideoMessage,
        sceneIdsToBuild,
      });
    },
    [
      compiledByVideoId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      refreshProjectsList,
      showToast,
    ]
  );

  useEffect(() => {
    startVideoBuildRef.current = startVideoBuildForPlan;
  }, [startVideoBuildForPlan]);
  const handleRuntimeErrorDetected = useCallback(
    async (videoMessageId: string, errorMessage: string) => {
      if (buildingVideoMessageId !== null || !effectiveModel || !effectiveApiKey) {
        return;
      }

      const dedupeKey = `${videoMessageId}:${errorMessage}`;
      if (handledRuntimeErrorsRef.current.has(dedupeKey)) {
        return;
      }
      handledRuntimeErrorsRef.current.add(dedupeKey);

      const videoMsg = messages.find(
        (m): m is LegacyVideoMessage =>
          m.id === videoMessageId && isLegacyVideoMessage(m)
      );
      if (!videoMsg || videoMsg.status === 'superseded') return;

      const planMsg = messages.find(
        (m): m is PlanMessage =>
          m.id === videoMsg.planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const compiledMap = compiledByVideoId[videoMsg.id] ?? {};
      const theme = buildSceneTheme(planMsg.plan.style);

      let targetSceneId: string | null = null;
      let targetSceneError = errorMessage;

      if (probeRef.current) {
        for (const record of videoMsg.scenes) {
          if (record.status !== 'ok') continue;
          const compiled = compiledMap[record.sceneId];
          const planScene = planMsg.plan.scenes.find(
            (s) => s.id === record.sceneId
          );
          if (!compiled || !planScene) continue;

          const probeOutcome = await probeRef.current.probeScene({
            component: compiled,
            props: {
              texts: planScene.onScreenText,
              theme,
              durationInFrames: secondsToFrames(
                planScene.durationSeconds,
                videoMsg.fps
              ),
            },
            width: videoMsg.width,
            height: videoMsg.height,
            fps: videoMsg.fps,
          });

          if (!probeOutcome.ok) {
            targetSceneId = record.sceneId;
            targetSceneError = probeOutcome.error;
            break;
          }
        }
      }

      if (!targetSceneId) {
        const firstOk = videoMsg.scenes.find((s) => s.status === 'ok');
        targetSceneId = firstOk?.sceneId ?? null;
      }
      if (!targetSceneId) return;

      const previousCode =
        videoMsg.scenes.find((s) => s.sceneId === targetSceneId)?.code ?? '';

      showToast(
        'Playback runtime error detected — repairing scene...',
        'info'
      );

      const resetVideo: VideoMessage = {
        ...videoMsg,
        status: 'building',
        pauseReason: undefined,
        startedAt: Date.now(),
        finishedAt: undefined,
        scenes: videoMsg.scenes.map((s) =>
          s.sceneId === targetSceneId
            ? {
                ...s,
                status: 'repairing',
                statusNote: undefined,
                error: undefined,
              }
            : s
        ),
      };

      await updateMessage(resetVideo);
      setMessages((prev) =>
        prev.map((m) => (m.id === resetVideo.id ? resetVideo : m))
      );

      await executeVideoSceneQueue({
        projectId: videoMsg.projectId,
        planMessage: planMsg,
        initialVideoMessage: resetVideo,
        sceneIdsToBuild: new Set([targetSceneId]),
        initialRepairContextBySceneId: {
          [targetSceneId]: {
            previousCode,
            errorMessage: targetSceneError,
          },
        },
      });
    },
    [
      buildingVideoMessageId,
      compiledByVideoId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      showToast,
    ]
  );

  const stageContext = useMemo(() => {
    const latestVideo =
      [...messages]
        .reverse()
        .find(
          (m): m is LegacyVideoMessage =>
            isLegacyVideoMessage(m) && m.status !== 'superseded'
        ) ?? null;

    if (!latestVideo) {
      return {
        latestVideo: null,
        linkedPlan: null,
        compiledBySceneId: {} as Record<string, CompiledComponentType>,
      };
    }

    const planMsg = messages.find(
      (m): m is PlanMessage =>
        m.id === latestVideo.planMessageId && m.type === 'plan'
    );

    return {
      latestVideo,
      linkedPlan: planMsg ? planMsg.plan : null,
      compiledBySceneId: compiledByVideoId[latestVideo.id] ?? {},
    };
  }, [compiledByVideoId, messages]);

  if (!hydrated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  if (!effectiveApiKey) {
    return (
      <Onboarding
        onComplete={(result) => {
          setApiKey(result.apiKey);
          setSelectedModel(result.selectedModel);
          setModels(result.models);
        }}
      />
    );
  }

  return (
    <div
      style={vvHeight !== null ? { height: `${vvHeight}px` } : undefined}
      className="flex h-dvh w-full flex-col overflow-hidden bg-bg text-text"
    >
      {!isOnline && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/30 bg-warning/12 px-4 py-2 text-xs text-text"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            You are offline. Local projects and saved messages continue to work.
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 w-full min-w-0 flex-col md:w-[clamp(340px,36vw,440px)] md:shrink-0 md:border-r md:border-border">
          <TopBar
            project={activeProject}
            onOpenProjects={() => setProjectsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onRenameProject={async (newTitle) => {
              if (!activeProject) return;
              await handleRenameProject(activeProject.id, newTitle);
            }}
          />

          {loadingProjects ? (
            <div className="flex-1 space-y-3 p-4">
              <div className="h-12 animate-pulse rounded-[12px] bg-surface-2" />
              <div className="h-12 w-3/4 animate-pulse rounded-[12px] bg-surface-2" />
            </div>
          ) : (
            <ChatPanel
              project={activeProject}
              messages={messages}
              runsById={runsById}
              activeRun={activeRun}
              loadingMessages={loadingMessages}
              focusComposerSignal={focusComposerSignal}
              buildingVideoMessageId={buildingVideoMessageId}
              queuedDrafts={queuedDrafts}
              cachedMediaById={cachedMediaById}
              onSendMessage={handleSendMessage}
              onStopThinking={abortInFlight}
              onCancelQueued={handleCancelQueued}
              onSendQueuedNow={handleSendQueuedNow}
              onRetryAssistantTurn={handleRetryAssistantTurn}
              onRetryError={handleRetryError}
              onUndoEdit={(id) => void handleUndoEdit(id)}
              hasBackupModel={Boolean(effectiveBackupModel)}
              onOpenSettings={() => setSettingsOpen(true)}
              formatPreference={composerFormat}
              onFormatChange={(fmt) => void handleComposerFormatChange(fmt)}
            />
          )}
        </div>

        <div className="hidden min-w-0 flex-1 md:flex">
          <StagePanel
            project={activeProject}
            formatPreference={composerFormat}
            latestVideo={stageContext.latestVideo}
            linkedPlan={stageContext.linkedPlan}
            compiledBySceneId={stageContext.compiledBySceneId}
            activeVideoStatusDetail={activeVideoStatusDetail}
            activeVideoWaitStartedAt={activeVideoWaitStartedAt}
            onStopBuild={abortInFlight}
            onRuntimeErrorDetected={(videoId, errMsg) =>
              void handleRuntimeErrorDetected(videoId, errMsg)
            }
          />
        </div>
      </div>

      <SceneRuntimeProbe ref={probeRef} />

      <ProjectsDrawer
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        projects={drawerProjects}
        activeProjectId={activeProjectId}
        loading={loadingProjects}
        onSelectProject={(id) => void handleSelectProject(id)}
        onNewProject={handleNewProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={effectiveApiKey}
        selectedModel={effectiveModel}
        backupModel={effectiveBackupModel}
        models={models}
        autoBuild={autoBuild}
        onAutoBuildChange={setAutoBuild}
        defaultFormat={defaultFormat}
        onDefaultFormatChange={setDefaultFormat}
        sessionUsage={sessionUsage}
        onResetSessionUsage={() => setSessionUsage(EMPTY_SESSION_USAGE)}
        onApiKeyUpdated={(newKey) => setApiKey(newKey)}
        onApiKeyRemoved={() => {
          abortInFlight();
          clearStoredModel();
          clearStoredBackupModel();
          setApiKey('');
          setSelectedModel('');
          setBackupModel('');
          setModels([]);
        }}
        onModelsUpdated={(nextModels, nextSelected) => {
          setModels(nextModels);
          setSelectedModel(nextSelected);
        }}
        onModelSelected={(modelName) => setSelectedModel(modelName)}
        onBackupModelSelected={(modelName) => setBackupModel(modelName)}
        onLocalDataDeleted={loadWorkspaceProjects}
      />
    </div>
  );
}

export function AppShell() {
  return (
    <ToastProvider>
      <ErrorBoundary
        resetKey="motionai-shell"
        fallback={(error, reset) => (
          <div className="flex min-h-dvh flex-col items-center justify-center bg-bg p-6 text-center text-text">
            <div className="max-w-md rounded-[16px] border border-border bg-surface-1 p-6 space-y-4">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="font-mono text-xs text-text-secondary break-words">
                {error.message}
              </p>
              <Button variant="primary" onClick={reset}>
                Reload workspace
              </Button>
            </div>
          </div>
        )}
      >
        <WorkspaceShell />
      </ErrorBoundary>
    </ToastProvider>
  );
}
