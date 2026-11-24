'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Camera, FileText, Film, Image as ImageIcon, Music, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type AttachmentPickerKind = 'photo' | 'camera' | 'video' | 'audio' | 'file';

interface AttachmentMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

interface MenuItemSpec {
  id: AttachmentPickerKind;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const DESKTOP_ITEMS: MenuItemSpec[] = [
  { id: 'photo', label: 'Photo', hint: 'PNG, JPG, WebP', Icon: ImageIcon },
  { id: 'video', label: 'Video', hint: 'MP4, WebM, MOV', Icon: Film },
  { id: 'audio', label: 'Audio', hint: 'MP3, WAV, M4A', Icon: Music },
  { id: 'file', label: 'File', hint: 'PDF, TXT, MD, CSV, JSON', Icon: FileText },
];

const MOBILE_ITEMS: MenuItemSpec[] = [
  { id: 'photo', label: 'Photo', hint: 'PNG, JPG, WebP', Icon: ImageIcon },
  { id: 'camera', label: 'Camera', hint: 'Take a photo', Icon: Camera },
  { id: 'video', label: 'Video', hint: 'MP4, WebM, MOV', Icon: Film },
  { id: 'audio', label: 'Audio', hint: 'MP3, WAV, M4A', Icon: Music },
  { id: 'file', label: 'File', hint: 'PDF, TXT, MD, CSV, JSON', Icon: FileText },
];

export function AttachmentMenu({
  open,
  onClose,
  anchorRef,
  onFilesSelected,
  disabled = false,
}: AttachmentMenuProps) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);

  const items = useMemo(
    () => (isMobile ? MOBILE_ITEMS : DESKTOP_ITEMS),
    [isMobile]
  );

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        const firstBtn =
          menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
        firstBtn?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      anchorRef.current?.focus();
    }
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && menuRef.current) {
        const focusables = Array.from(
          menuRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, onClose, anchorRef]);

  const handleChoose = (kind: AttachmentPickerKind) => {
    if (disabled) return;
    onClose();
    switch (kind) {
      case 'photo':
        photoInputRef.current?.click();
        break;
      case 'camera':
        cameraInputRef.current?.click();
        break;
      case 'video':
        videoInputRef.current?.click();
        break;
      case 'audio':
        audioInputRef.current?.click();
        break;
      case 'file':
        fileInputRef.current?.click();
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length > 0) {
      onFilesSelected(Array.from(list));
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      <AnimatePresence>
        {open && isMobile && (
          <motion.div
            key="attachment-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55"
            aria-hidden="true"
          />
        )}

        {open && (
          <motion.div
            key="attachment-menu-surface"
            ref={menuRef}
            role="dialog"
            aria-modal={isMobile ? 'true' : undefined}
            aria-label="Add attachment"
            initial={
              reducedMotion
                ? { opacity: 1 }
                : isMobile
                  ? { opacity: 0, y: 24 }
                  : { opacity: 0, scale: 0.92, y: 6 }
            }
            animate={
              reducedMotion
                ? { opacity: 1 }
                : isMobile
                  ? { opacity: 1, y: 0 }
                  : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              reducedMotion
                ? { opacity: 0 }
                : isMobile
                  ? { opacity: 0, y: 20 }
                  : { opacity: 0, scale: 0.94, y: 6 }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }
            }
            style={!isMobile ? { transformOrigin: 'bottom left' } : undefined}
            className={cn(
              isMobile
                ? 'fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-border bg-surface-1 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl'
                : 'absolute bottom-full left-0 z-40 mb-2 w-64 rounded-[16px] border border-border bg-surface-1 p-1.5 shadow-xl'
            )}
          >
            {isMobile && (
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-text-secondary">
                  Attach media or files
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close attachment menu"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div role="menu" aria-label="Attachment types" className="space-y-0.5">
              {items.map((item, idx) => {
                const Icon = item.Icon;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => handleChoose(item.id)}
                    initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { delay: idx * 0.04, duration: 0.16 }
                    }
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-[11px] px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 cursor-pointer"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-text-secondary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text">
                        {item.label}
                      </span>
                      <span className="block text-[11px] text-text-muted">
                        {item.hint}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
