'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary';

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: IconButtonVariant;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-surface-2 hover:text-text',
  secondary:
    'bg-surface-2 text-text border border-border hover:bg-surface-1',
  primary:
    'bg-accent text-accent-fg border border-transparent hover:bg-accent-hover',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { variant = 'ghost', className, children, type = 'button', ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[12px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          VARIANT_CLASSES[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
