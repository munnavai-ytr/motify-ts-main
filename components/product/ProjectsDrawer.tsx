'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import { formatProjectTimestamp } from '@/lib/db';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';

interface ProjectsDrawerProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string, title: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}

export function ProjectsDrawer({
  open,
  onClose,
  projects,
  activeProjectId,
  loading,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onDeleteProject,
}: ProjectsDrawerProps) {
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const skipRestoreFocusRef = useRef(false);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;
    cancelled: boolean;
  } | null>(null);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const hasOpenSubDialog = renameTarget !== null || deleteTarget !== null;

  useEffect(() => {
    if (!open) return;

    skipRestoreFocusRef.current = false;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const rafId = window.requestAnimationFrame(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else {
        const focusables = getFocusableElements(drawerPanelRef.current);
        focusables[0]?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = prevOverflow;
      setMenuOpenId(null);
      setDragOffsetX(0);
      setIsSwiping(false);

      if (!skipRestoreFocusRef.current) {
        const prevEl = previousFocusRef.current;
        if (prevEl && prevEl.isConnected) {
          window.requestAnimationFrame(() => {
            prevEl.focus();
          });
        }
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || hasOpenSubDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menuOpenId !== null) {
          setMenuOpenId(null);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getFocusableElements(drawerPanelRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !drawerPanelRef.current?.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || active === last || !drawerPanelRef.current?.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasOpenSubDialog, menuOpenId, onClose]);

  useEffect(() => {
    if (!open || menuOpenId === null) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-project-row-menu]')) return;
      setMenuOpenId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, menuOpenId]);

  const handleClose = () => {
    setMenuOpenId(null);
    onClose();
  };

  const handleNewProjectClick = () => {
    skipRestoreFocusRef.current = true;
    setMenuOpenId(null);
    onNewProject();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    swipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      active: false,
      cancelled: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.cancelled || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - swipe.startX;
    const dy = touch.clientY - swipe.startY;

    if (!swipe.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        swipe.cancelled = true;
        return;
      }
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swipe.active = true;
        setIsSwiping(true);
      } else {
        return;
      }
    }

    setDragOffsetX(Math.min(0, dx));
  };

  const handleTouchEnd = () => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (swipe?.active && dragOffsetX <= -56) {
      setIsSwiping(false);
      setDragOffsetX(0);
      handleClose();
      return;
    }
    setIsSwiping(false);
    setDragOffsetX(0);
  };

  const openRenameDialog = (project: Project) => {
    setMenuOpenId(null);
    setRenameTarget(project);
    setRenameInput(project.title);
  };

  const openDeleteDialog = (project: Project) => {
    setMenuOpenId(null);
    setDeleteTarget(project);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onRenameProject(renameTarget.id, trimmed);
      setRenameTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDeleteProject(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const slideTransition = prefersReducedMotion || isSwiping
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

  const fadeTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2 };

  return (
    <>
      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-40"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fadeTransition}
              onClick={handleClose}
              className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            />

            <motion.aside
              ref={drawerPanelRef}
              initial={{ x: '-100%' }}
              animate={{ x: dragOffsetX }}
              exit={{ x: '-100%' }}
              transition={slideTransition}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="fixed inset-y-0 left-0 z-10 flex w-[min(86vw,340px)] sm:w-[320px] flex-col border-r border-border bg-surface-1 touch-pan-y"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold tracking-tight text-text"
                >
                  {APP_NAME}
                </h2>
                <IconButton
                  ref={closeButtonRef}
                  aria-label="Close drawer"
                  onClick={handleClose}
                  className="-mr-2"
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="px-4 pt-3.5 pb-2">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleNewProjectClick}
                >
                  <Plus className="h-4 w-4" />
                  <span>New project</span>
                </Button>
              </div>

              <div className="px-4 pt-2 pb-1.5">
                <div className="text-xs font-medium text-text-muted">Recent</div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {loading ? (
                  <div className="space-y-2 px-1">
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="h-14 animate-pulse rounded-[12px] border border-border bg-surface-2"
                      />
                    ))}
                  </div>
                ) : sortedProjects.length === 0 ? (
                  <p className="px-1.5 py-6 text-sm leading-relaxed text-text-secondary">
                    No projects yet. Describe a video to start.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {sortedProjects.map((project) => {
                      const isActive = project.id === activeProjectId;
                      const menuOpen = menuOpenId === project.id;

                      return (
                        <li
                          key={project.id}
                          className="relative"
                          data-project-row-menu
                        >
                          <div
                            className={cn(
                              'flex items-center gap-1 rounded-[12px] border p-1.5 transition-colors duration-150',
                              isActive
                                ? 'border-accent/60 bg-accent/8'
                                : 'border-transparent bg-transparent hover:border-border hover:bg-surface-2/70'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpenId(null);
                                onSelectProject(project.id);
                                onClose();
                              }}
                              className="min-h-[44px] min-w-0 flex-1 rounded-[8px] px-2.5 py-1.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                              <div
                                dir="auto"
                                className="truncate py-0.5 text-sm font-medium leading-snug text-text"
                              >
                                {project.title}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-text-muted tabular-nums">
                                {formatProjectTimestamp(project.updatedAt)}
                              </div>
                            </button>

                            <IconButton
                              aria-label={`Actions for ${project.title}`}
                              aria-expanded={menuOpen}
                              onClick={() =>
                                setMenuOpenId((prev) =>
                                  prev === project.id ? null : project.id
                                )
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </IconButton>
                          </div>

                          {menuOpen && (
                            <div
                              role="menu"
                              className="absolute right-2 top-14 z-20 w-40 rounded-[12px] border border-border bg-surface-1 p-1.5 shadow-lg"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => openRenameDialog(project)}
                                className="flex min-h-[44px] w-full items-center gap-2 rounded-[8px] px-2.5 text-sm text-text hover:bg-surface-2 cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5 text-text-secondary" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => openDeleteDialog(project)}
                                className="flex min-h-[44px] w-full items-center gap-2 rounded-[8px] px-2.5 text-sm text-danger hover:bg-danger/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename project"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRenameTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="rename-project-form"
              variant="primary"
              loading={busy}
              disabled={!renameInput.trim() || busy}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="rename-project-form" onSubmit={handleConfirmRename}>
          <Input
            label="Project title"
            dir="auto"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            autoFocus
            placeholder="New project"
          />
        </form>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete project?"
        description={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.title}" and all of its saved messages from this browser.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void handleConfirmDelete()}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );
}
