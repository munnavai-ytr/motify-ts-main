'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Menu, Settings } from 'lucide-react';
import type { Project } from '@/lib/types';
import { IconButton } from '@/components/ui/IconButton';

interface TopBarProps {
  project: Project | null;
  onOpenProjects: () => void;
  onOpenSettings: () => void;
  onRenameProject: (newTitle: string) => Promise<void>;
}

export function TopBar({
  project,
  onOpenProjects,
  onOpenSettings,
  onRenameProject,
}: TopBarProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (!project) return;
    setDraftTitle(project.title);
    setEditing(true);
  };

  const commitRename = async () => {
    setEditing(false);
    if (!project) return;
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== project.title) {
      await onRenameProject(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-1 px-2 pt-[env(safe-area-inset-top)] sm:px-3">
      <IconButton
        aria-label="Open projects"
        onClick={onOpenProjects}
      >
        <Menu className="h-5 w-5" />
      </IconButton>

      <div className="min-w-0 flex-1 flex justify-center">
        {editing && project ? (
          <input
            ref={inputRef}
            type="text"
            dir="auto"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={handleKeyDown}
            aria-label="Rename project"
            className="h-10 w-full max-w-[240px] rounded-[10px] border border-accent bg-surface-2 px-2.5 text-center text-sm font-medium text-text focus:outline-none"
          />
        ) : project ? (
          <button
            type="button"
            dir="auto"
            onClick={startEditing}
            title="Tap to rename project"
            className="min-h-[44px] max-w-full truncate rounded-[10px] px-3 py-2 text-sm font-semibold leading-snug text-text transition-colors hover:bg-surface-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {project.title}
          </button>
        ) : (
          <span className="truncate px-3 py-2 text-sm font-semibold leading-snug text-text">
            New project
          </span>
        )}
      </div>

      <IconButton
        aria-label="Open settings"
        onClick={onOpenSettings}
      >
        <Settings className="h-5 w-5" />
      </IconButton>
    </header>
  );
}
