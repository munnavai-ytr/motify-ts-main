'use client';

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  children,
  footer,
}: SheetProps) {
  const isMobile = useIsMobile();
  const titleId = React.useId();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const initialVariant = isMobile
    ? { opacity: 0, y: 28 }
    : { opacity: 0, x: side === 'left' ? -24 : 24 };

  const animateVariant = isMobile
    ? { opacity: 1, y: 0 }
    : { opacity: 1, x: 0 };

  return (
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
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
          />

          <motion.div
            initial={initialVariant}
            animate={animateVariant}
            exit={initialVariant}
            transition={{ duration: 0.19, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed z-10 flex flex-col border-border bg-surface-1',
              isMobile
                ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[16px] border-t pb-[env(safe-area-inset-bottom)]'
                : cn(
                    'inset-y-0 w-full max-w-[400px]',
                    side === 'left'
                      ? 'left-0 rounded-r-[16px] border-r'
                      : 'right-0 rounded-l-[16px] border-l'
                  )
            )}
          >
            {isMobile && (
              <div className="flex justify-center pt-2.5 pb-1">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
            )}

            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-base font-semibold tracking-tight text-text truncate"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 text-xs text-text-secondary truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              <IconButton
                aria-label={`Close ${title}`}
                onClick={onClose}
                className="-mr-2 -mt-1.5"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div className="border-t border-border px-5 py-4">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
