'use client';

import React from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';

interface CodeViewerSheetProps {
  open: boolean;
  sceneName: string;
  code: string;
  onClose: () => void;
}

export function CodeViewerSheet({
  open,
  sceneName,
  code,
  onClose,
}: CodeViewerSheetProps) {
  const { showToast } = useToast();

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('Scene code copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'danger');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={sceneName || 'Scene code'}
      subtitle="Read-only Remotion TSX component"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!code}
            onClick={() => void handleCopy()}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy code</span>
          </Button>
        </div>
      }
    >
      <pre className="overflow-x-auto rounded-[12px] border border-border bg-surface-2 p-3.5 font-mono text-xs leading-relaxed text-text whitespace-pre">
        {code || '// No code recorded for this scene yet.'}
      </pre>
    </Sheet>
  );
}
