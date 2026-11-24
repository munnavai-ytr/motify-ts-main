'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
  Settings,
} from 'lucide-react';
import type { ErrorMessage, RunErrorMessage } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface ErrorCardProps {
  message: ErrorMessage | RunErrorMessage;
  onRetry?: (message: ErrorMessage | RunErrorMessage) => void;
  hasBackupModel?: boolean;
  onOpenSettings?: () => void;
  disabled?: boolean;
}

export function ErrorCard({
  message,
  onRetry,
  hasBackupModel = false,
  onOpenSettings,
  disabled,
}: ErrorCardProps) {
  const showBackupModelAction =
    !hasBackupModel &&
    Boolean(onOpenSettings) &&
    (message.errorKind === 'model_not_found' ||
      Boolean(message.needsBackupModel) ||
      message.summary.includes('not found for this key'));
  const { showToast } = useToast();
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyDebugInfo = async () => {
    const payload = message.debugInfo ?? {
      summary: message.summary,
      details: message.details,
      timestamp: new Date(message.createdAt).toISOString(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      showToast('Debug info copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'danger');
    }
  };

  return (
    <div className="flex justify-start">
      <div
        role="alert"
        className="w-full max-w-[95%] rounded-[16px] border border-danger/40 bg-danger/10 p-3.5 space-y-2.5 text-xs text-text"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-text break-words">
              {message.summary}
            </p>
            {message.userAction &&
              !message.summary.includes(message.userAction) && (
                <p className="text-text-secondary break-words">
                  {message.userAction}
                </p>
              )}
            {message.errorKind === 'overloaded' && !hasBackupModel && (
              <p className="text-text-secondary break-words">
                Tip: Set a Backup model in Settings — it will be used
                automatically next time.
              </p>
            )}
            {message.details && (
              <button
                type="button"
                onClick={() => setShowDetails((prev) => !prev)}
                className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text cursor-pointer"
              >
                <span>Details</span>
                {showDetails ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {showDetails && message.details && (
          <pre className="max-h-48 overflow-auto rounded-[10px] border border-border bg-bg p-2.5 font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-words">
            {message.details}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {message.retryable && message.retryPrompt && onRetry && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onRetry(message)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          )}
          {showBackupModelAction && onOpenSettings && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenSettings}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Set a backup model</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopyDebugInfo()}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy debug info</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
