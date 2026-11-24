'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Paperclip,
  Plus,
  RotateCcw,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useIsMobile } from '@/hooks/use-mobile';
import { createDbId } from '@/lib/db';
import {
  classifyAttachmentFile,
  formatBytes,
  MAX_ATTACHMENTS_PER_MESSAGE,
  processAttachmentFile,
} from '@/lib/media/process';
import type {
  AgentRun,
  ChatMessage,
  ErrorMessage,
  FormatPreference,
  MediaRecord,
  PendingAttachment,
  PlanMessage,
  Project,
  QueuedMessageDraft,
  RunErrorMessage,
} from '@/lib/types';
import { isKitVideoMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { AttachmentMenu } from './AttachmentMenu';
import { AttachmentTray } from './AttachmentTray';
import { ErrorCard } from './ErrorCard';
import { KitVideoCard } from './KitVideoCard';
import { LegacyPlanCard } from './LegacyPlanCard';
import { LegacyVideoCard } from './LegacyVideoCard';
import { MediaLightbox } from './MediaLightbox';
import { MessageAttachments } from './MessageAttachments';
import { ThinkingBlock } from './ThinkingBlock';

interface ChatPanelProps {
  project: Project | null;
  messages: ChatMessage[];
  runsById: Record<string, AgentRun>;
  activeRun: AgentRun | null;
  loadingMessages: boolean;
  focusComposerSignal?: number;
  buildingVideoMessageId: string | null;
  queuedDrafts: QueuedMessageDraft[];
  cachedMediaById: Record<string, MediaRecord>;
  onSendMessage: (
    content: string,
    attachments: Array<Omit<MediaRecord, 'projectId'>>
  ) => Promise<boolean>;
  onStopThinking: () => void;
  onCancelQueued: (draftId: string) => void;
  onSendQueuedNow: (draftId: string) => void;
  onRetryAssistantTurn: (assistantMessageId: string) => void;
  onRetryError: (message: ErrorMessage | RunErrorMessage) => void;
  onUndoEdit?: (assistantMessageId: string) => void;
  hasBackupModel?: boolean;
  onOpenSettings?: () => void;
  formatPreference?: FormatPreference;
  onFormatChange?: (format: FormatPreference) => void;
}

const COMPOSER_FORMAT_OPTIONS: ReadonlyArray<{
  value: FormatPreference;
  label: string;
  hint: string;
}> = [
  { value: '9:16', label: '9:16', hint: 'Portrait' },
  { value: '16:9', label: '16:9', hint: 'Landscape' },
  { value: '1:1', label: '1:1', hint: 'Square' },
  { value: 'auto', label: 'Auto', hint: 'AI decides' },
];

function AssistantProse({
  messageId,
  text,
  shouldAnimate,
}: {
  messageId: string;
  text: string;
  shouldAnimate: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return null;

  const animateParagraphs = shouldAnimate && !reducedMotion;

  return (
    <div dir="auto" className="space-y-3 text-[15px] leading-[1.68] text-text">
      {paragraphs.map((para, idx) =>
        animateParagraphs ? (
          <motion.p
            key={`${messageId}-p-${idx}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: Math.min(idx * 0.05, 0.25),
              duration: 0.2,
              ease: 'easeOut',
            }}
            className="whitespace-pre-wrap break-words"
          >
            {para}
          </motion.p>
        ) : (
          <p
            key={`${messageId}-p-${idx}`}
            className="whitespace-pre-wrap break-words"
          >
            {para}
          </p>
        )
      )}
    </div>
  );
}

function AssistantActions({
  textToCopy,
  retryDisabled,
  onRetry,
  undoState,
}: {
  textToCopy: string;
  retryDisabled: boolean;
  onRetry: () => void;
  undoState?: {
    undone: boolean;
    disabled: boolean;
    onUndo: () => void;
  };
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      showToast('Response copied', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Could not copy response', 'danger');
    }
  };

  return (
    <div className="mt-2 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Copy response"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>

      <button
        type="button"
        disabled={retryDisabled}
        onClick={onRetry}
        className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Retry turn"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span>Retry</span>
      </button>

      {undoState && (
        <button
          type="button"
          disabled={undoState.undone || undoState.disabled}
          onClick={undoState.onUndo}
          className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={undoState.undone ? 'Edit undone' : 'Undo edit'}
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span>{undoState.undone ? 'Undone' : 'Undo'}</span>
        </button>
      )}
    </div>
  );
}

export function ChatPanel({
  project,
  messages,
  runsById,
  activeRun,
  loadingMessages,
  focusComposerSignal = 0,
  buildingVideoMessageId,
  queuedDrafts,
  cachedMediaById,
  onSendMessage,
  onStopThinking,
  onCancelQueued,
  onSendQueuedNow,
  onRetryAssistantTurn,
  onRetryError,
  onUndoEdit,
  hasBackupModel = false,
  onOpenSettings,
  formatPreference = 'auto',
  onFormatChange,
}: ChatPanelProps) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const { showToast } = useToast();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [lightboxRecord, setLightboxRecord] = useState<MediaRecord | null>(
    null
  );
  const [revealMessageIds, setRevealMessageIds] = useState<Set<string>>(
    () => new Set()
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const dragDepthRef = useRef(0);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
  const trackedProjectIdRef = useRef<string | null>(project?.id ?? null);

  const isThinking = activeRun !== null;
  const isBuildingVideo = buildingVideoMessageId !== null;
  const isBusy = isThinking || isBuildingVideo;

  const readyAttachments = pendingAttachments
    .filter((item) => item.status === 'ready' && item.record)
    .map((item) => item.record!);

  const hasProcessingAttachments = pendingAttachments.some(
    (item) => item.status === 'processing'
  );

  const hasDraftToSend =
    input.trim().length > 0 || readyAttachments.length > 0;

  useEffect(() => {
    if (focusComposerSignal > 0) {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [focusComposerSignal]);

  useEffect(() => {
    if (!formatMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && formatMenuRef.current?.contains(target)) {
        return;
      }
      setFormatMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFormatMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [formatMenuOpen]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    isPinnedToBottomRef.current = true;
    setShowJumpToLatest(false);
    scrollEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  useEffect(() => {
    isPinnedToBottomRef.current = true;
    knownMessageIdsRef.current = null;
    trackedProjectIdRef.current = project?.id ?? null;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setShowJumpToLatest(false);
        setRevealMessageIds(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  useEffect(() => {
    if (loadingMessages) {
      knownMessageIdsRef.current = null;
      return;
    }
    const currentProjectId = project?.id ?? null;
    if (trackedProjectIdRef.current !== currentProjectId) {
      trackedProjectIdRef.current = currentProjectId;
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
      return;
    }
    if (knownMessageIdsRef.current === null) {
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
      return;
    }
    const newlyAdded: string[] = [];
    for (const msg of messages) {
      if (!knownMessageIdsRef.current.has(msg.id)) {
        knownMessageIdsRef.current.add(msg.id);
        newlyAdded.push(msg.id);
      }
    }
    if (newlyAdded.length === 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setRevealMessageIds((prev) => {
          const next = new Set(prev);
          for (const id of newlyAdded) next.add(id);
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadingMessages, messages, project?.id]);

  useEffect(() => {
    if (isPinnedToBottomRef.current) {
      scrollEndRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'end',
      });
    }
  }, [
    messages.length,
    isThinking,
    activeRun?.updatedAt,
    isBuildingVideo,
    queuedDrafts.length,
    project?.id,
    reducedMotion,
  ]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const pinned = distanceFromBottom < 80;
    isPinnedToBottomRef.current = pinned;
    setShowJumpToLatest(!pinned && (messages.length > 0 || isThinking));
  };

  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 148;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea(e.target);
  };

  const enqueueFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const remainingSlots =
        MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
      if (remainingSlots <= 0) {
        showToast(
          `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`,
          'info'
        );
        return;
      }

      const slice = files.slice(0, remainingSlots);
      if (files.length > remainingSlots) {
        showToast(
          `Attached the first ${remainingSlots} files (limit ${MAX_ATTACHMENTS_PER_MESSAGE} per message).`,
          'info'
        );
      }

      const accepted: PendingAttachment[] = [];

      for (const file of slice) {
        const classified = classifyAttachmentFile(file);
        if (!classified) {
          showToast(
            `Unsupported file "${file.name}". Allowed: photos, videos, audio, PDF, TXT, MD, CSV, or JSON.`,
            'danger'
          );
          continue;
        }
        if (file.size > classified.limitBytes) {
          showToast(
            `"${file.name}" (${formatBytes(file.size)}) exceeds the ${formatBytes(classified.limitBytes)} limit.`,
            'danger'
          );
          continue;
        }

        accepted.push({
          id: createDbId(),
          file,
          kind: classified.kind,
          name: file.name || 'attachment',
          size: file.size,
          mime: classified.mime,
          progress: 0.05,
          status: 'processing',
        });
      }

      if (accepted.length === 0) return;

      setPendingAttachments((prev) => [...prev, ...accepted]);

      for (const item of accepted) {
        void processAttachmentFile(item.file, item.id, (progress) => {
          setPendingAttachments((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress } : p))
          );
        })
          .then((record) => {
            setPendingAttachments((prev) =>
              prev.map((p) =>
                p.id === item.id
                  ? { ...p, progress: 1, status: 'ready', record }
                  : p
              )
            );
          })
          .catch((err: unknown) => {
            const reason =
              err instanceof Error ? err.message : 'Failed to process file.';
            showToast(reason, 'danger');
            setPendingAttachments((prev) =>
              prev.map((p) =>
                p.id === item.id
                  ? { ...p, status: 'error', error: reason }
                  : p
              )
            );
          });
      }
    },
    [pendingAttachments.length, showToast]
  );

  const handleRemovePending = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles: File[] = [];
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && f.type.startsWith('image/')) {
            clipboardFiles.push(f);
          }
        }
      }
    }
    if (clipboardFiles.length > 0) {
      e.preventDefault();
      enqueueFiles(clipboardFiles);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length > 0) {
      enqueueFiles(dropped);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!hasDraftToSend || sending || hasProcessingAttachments) return;

    const attachmentsToSend = [...readyAttachments];
    setSending(true);
    try {
      const accepted = await onSendMessage(trimmed, attachmentsToSend);
      if (accepted) {
        setInput('');
        setPendingAttachments([]);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        isPinnedToBottomRef.current = true;
        window.requestAnimationFrame(() => scrollToBottom('smooth'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMobile) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const planById = new Map<string, PlanMessage>();
  for (const msg of messages) {
    if (msg.type === 'plan') {
      planById.set(msg.id, msg);
    }
  }

  const shouldAnimateMessage = (msg: ChatMessage): boolean =>
    revealMessageIds.has(msg.id);

  const renderMessageItem = (message: ChatMessage) => {
    switch (message.type) {
      case 'user_text':
        return (
          <div key={message.id} className="flex justify-end">
            <div className="flex max-w-[85%] flex-col items-end gap-2">
              <div className="rounded-[16px] rounded-br-[4px] bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-fg space-y-2.5">
                {message.content.trim().length > 0 && (
                  <p dir="auto" className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                )}
                {message.attachments && message.attachments.length > 0 && (
                  <MessageAttachments
                    attachments={message.attachments}
                    cachedMediaById={cachedMediaById}
                    onOpenLightbox={setLightboxRecord}
                  />
                )}
              </div>
            </div>
          </div>
        );

      case 'system_notice':
        return (
          <div key={message.id} className="flex justify-center py-1">
            <div className="max-w-md rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5 text-center text-xs leading-relaxed text-text-secondary">
              {message.content}
            </div>
          </div>
        );

      case 'assistant_text': {
        const linkedRun = message.runId ? runsById[message.runId] ?? null : null;
        const animateNow = shouldAnimateMessage(message);
        return (
          <div key={message.id} className="flex flex-col items-start">
            <div className="w-full max-w-full">
              <ThinkingBlock
                run={linkedRun}
                isActive={false}
                fallbackDebugInfo={message.debugInfo}
                fallbackAssumptions={message.assumptions}
              />
              <AssistantProse
                messageId={message.id}
                text={message.content}
                shouldAnimate={animateNow}
              />
              <AssistantActions
                textToCopy={message.content}
                retryDisabled={isBusy}
                onRetry={() => onRetryAssistantTurn(message.id)}
                undoState={
                  message.undoEdit && onUndoEdit
                    ? {
                        undone: Boolean(message.undoEdit.undone),
                        disabled: isBusy,
                        onUndo: () => onUndoEdit(message.id),
                      }
                    : undefined
                }
              />
            </div>
          </div>
        );
      }

      case 'plan': {
        const linkedRun = message.runId ? runsById[message.runId] ?? null : null;
        const animateNow = shouldAnimateMessage(message);
        return (
          <div key={message.id} className="flex flex-col items-start space-y-2.5">
            <div className="w-full max-w-full">
              <ThinkingBlock
                run={linkedRun}
                isActive={false}
                fallbackDebugInfo={message.debugInfo}
                fallbackAssumptions={message.assumptions}
              />
              {message.message && (
                <>
                  <AssistantProse
                    messageId={message.id}
                    text={message.message}
                    shouldAnimate={animateNow}
                  />
                  <AssistantActions
                    textToCopy={message.message}
                    retryDisabled={isBusy}
                    onRetry={() => onRetryAssistantTurn(message.id)}
                  />
                </>
              )}
            </div>
            <div className="w-full">
              <LegacyPlanCard message={message} hideMessage />
            </div>
          </div>
        );
      }

      case 'video': {
        if (isKitVideoMessage(message)) {
          return <KitVideoCard key={message.id} message={message} />;
        }
        const linkedPlanMsg = planById.get(message.planMessageId);
        return (
          <LegacyVideoCard
            key={message.id}
            message={message}
            linkedPlan={linkedPlanMsg ? linkedPlanMsg.plan : null}
          />
        );
      }

      case 'error':
      case 'run_error':
        return (
          <ErrorCard
            key={message.id}
            message={message}
            disabled={isBusy || sending}
            hasBackupModel={hasBackupModel}
            onOpenSettings={onOpenSettings}
            onRetry={onRetryError}
          />
        );

      case 'scene_code':
      case 'render_result':
        return (
          <div key={message.id} className="flex justify-start">
            <div className="max-w-[85%] rounded-[12px] border border-border bg-surface-2 px-3.5 py-2 text-xs text-text-secondary">
              {message.content}
            </div>
          </div>
        );

      default: {
        const _exhaustive: never = message;
        return _exhaustive;
      }
    }
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-bg"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg/85 backdrop-blur-[2px] p-6"
        >
          <div className="flex flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-accent bg-surface-1 px-8 py-8 text-center">
            <Paperclip className="h-6 w-6 text-accent" />
            <p className="text-sm font-semibold text-text">
              Drop files to attach
            </p>
            <p className="text-xs text-text-muted">
              Photos, videos, audio, or documents (up to 8 per message)
            </p>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
      >
        {loadingMessages ? (
          <div className="space-y-3">
            <div className="ml-auto h-11 w-3/5 animate-pulse rounded-[16px] bg-surface-2" />
            <div className="mx-auto h-10 w-4/5 animate-pulse rounded-[12px] bg-surface-2" />
          </div>
        ) : messages.length === 0 && !isThinking && queuedDrafts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-text text-balance">
              What are we making?
            </h1>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
              Describe your video in any language. I&apos;ll ask if I need anything.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg) => renderMessageItem(msg))}

            {activeRun && (
              <div className="flex flex-col items-start">
                <ThinkingBlock run={activeRun} isActive={true} />
              </div>
            )}

            {queuedDrafts.map((draft) => (
              <div key={draft.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-[16px] rounded-br-[4px] border border-accent/40 bg-accent/80 px-4 py-2.5 text-sm text-accent-fg space-y-2">
                  {draft.text && (
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {draft.text}
                    </p>
                  )}
                  {draft.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-accent-fg/90">
                      {draft.attachments.map((att) => (
                        <span
                          key={att.id}
                          className="inline-flex items-center gap-1 rounded-md bg-black/15 px-2 py-0.5"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span className="max-w-[140px] truncate">{att.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5 text-[11px]">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 font-medium">
                      {draft.status === 'queued' ? 'Queued' : 'Paused in queue'}
                    </span>
                    {draft.status === 'paused_failed' && !isBusy && (
                      <button
                        type="button"
                        onClick={() => onSendQueuedNow(draft.id)}
                        className="inline-flex min-h-[26px] items-center rounded-[8px] bg-white/20 px-2.5 py-0.5 font-medium hover:bg-white/30 transition-colors cursor-pointer"
                      >
                        Send now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onCancelQueued(draft.id)}
                      aria-label="Cancel queued message"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/20 hover:bg-black/35 transition-colors cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {showJumpToLatest && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[88px] z-20 flex justify-center px-4">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="pointer-events-auto inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3.5 py-1.5 text-xs font-medium text-text shadow-lg hover:bg-surface-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>Jump to latest</span>
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-surface-1 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="relative rounded-[18px] border border-border bg-surface-2 focus-within:border-accent">
          <AttachmentMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={plusBtnRef}
            onFilesSelected={enqueueFiles}
            disabled={sending}
          />

          <AttachmentTray
            items={pendingAttachments}
            onRemove={handleRemovePending}
          />

          <div className="flex items-end gap-1.5 p-1.5">
            <button
              ref={plusBtnRef}
              type="button"
              onClick={() => {
                setFormatMenuOpen(false);
                setMenuOpen((prev) => !prev);
              }}
              aria-label={menuOpen ? 'Close attachment menu' : 'Add attachment'}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-text-secondary hover:bg-surface-1 hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus
                className="h-5 w-5 transition-transform duration-200"
                style={{
                  transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                }}
              />
            </button>

            <div ref={formatMenuRef} className="relative mb-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setFormatMenuOpen((prev) => !prev);
                }}
                aria-label="Video aspect ratio format"
                aria-haspopup="listbox"
                aria-expanded={formatMenuOpen}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-[9px] border px-2 font-mono text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  formatPreference === 'auto'
                    ? 'border-border bg-surface-1/70 text-text-muted hover:bg-surface-1 hover:text-text'
                    : 'border-accent/40 bg-accent/12 text-accent hover:bg-accent/18'
                )}
              >
                <span>{formatPreference === 'auto' ? 'Auto' : formatPreference}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform duration-150',
                    formatMenuOpen ? 'rotate-180' : ''
                  )}
                />
              </button>

              <AnimatePresence>
                {formatMenuOpen && (
                  <motion.div
                    role="listbox"
                    aria-label="Choose video format"
                    initial={
                      reducedMotion
                        ? { opacity: 1 }
                        : { opacity: 0, scale: 0.94, y: 6 }
                    }
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 0.95, y: 4 }
                    }
                    transition={{ duration: reducedMotion ? 0 : 0.14 }}
                    style={{ transformOrigin: 'bottom left' }}
                    className="absolute bottom-full left-0 z-40 mb-2 w-48 rounded-[12px] border border-border bg-surface-1 p-1 shadow-xl"
                  >
                    {COMPOSER_FORMAT_OPTIONS.map((opt) => {
                      const selected = formatPreference === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            onFormatChange?.(opt.value);
                            setFormatMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            selected
                              ? 'bg-accent/12 text-text'
                              : 'text-text-secondary hover:bg-surface-2 hover:text-text'
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'font-mono font-semibold',
                                selected && opt.value !== 'auto'
                                  ? 'text-accent'
                                  : 'text-text'
                              )}
                            >
                              {opt.label}
                            </span>
                            <span className="truncate text-[11px] text-text-muted">
                              {opt.hint}
                            </span>
                          </span>
                          {selected && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              dir="auto"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Describe your video..."
              aria-label="Message composer"
              className="min-h-[44px] max-h-[148px] flex-1 resize-none bg-transparent px-1.5 py-2.5 text-sm leading-[22px] text-text placeholder:text-text-muted focus:outline-none"
            />

            {isBusy && (
              <button
                type="button"
                onClick={onStopThinking}
                aria-label="Stop response"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-1 text-text hover:bg-bg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            )}

            {(!isBusy || hasDraftToSend) && (
              <button
                type="button"
                aria-label={isBusy ? 'Queue message' : 'Send message'}
                disabled={
                  !hasDraftToSend || sending || hasProcessingAttachments
                }
                onClick={() => void handleSend()}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-fg hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 hidden md:flex items-center justify-between px-1 text-[11px] text-text-muted">
          <span>
            {isBusy
              ? 'Send queues your next message · Shift+Enter for new line'
              : 'Enter to send · Shift+Enter for new line'}
          </span>
        </div>
      </div>

      <MediaLightbox
        record={lightboxRecord}
        onClose={() => setLightboxRecord(null)}
      />
    </div>
  );
}
