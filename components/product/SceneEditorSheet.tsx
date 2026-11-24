'use client';

import React, { useState } from 'react';
import type { PlanScene } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';

interface SceneEditorSheetProps {
  open: boolean;
  scene: PlanScene | null;
  onClose: () => void;
  onSave: (updatedScene: PlanScene) => Promise<void>;
}

interface SceneEditorFormProps {
  scene: PlanScene;
  onClose: () => void;
  onSave: (updatedScene: PlanScene) => Promise<void>;
}

function SceneEditorForm({ scene, onClose, onSave }: SceneEditorFormProps) {
  const [name, setName] = useState(scene.name);
  const [durationInput, setDurationInput] = useState(String(scene.durationSeconds));
  const [onScreenTextInput, setOnScreenTextInput] = useState(
    scene.onScreenText.join('\n')
  );
  const [visualIdea, setVisualIdea] = useState(scene.visualIdea);
  const [motion, setMotion] = useState(scene.motion);
  const [saving, setSaving] = useState(false);

  const parsedDuration = Number(durationInput);
  const durationValid =
    Number.isFinite(parsedDuration) &&
    parsedDuration >= 1.5 &&
    parsedDuration <= 15;

  const parsedLines = onScreenTextInput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const longLineIndex = parsedLines.findIndex((line) => line.length > 60);
  const tooManyLines = parsedLines.length > 6;

  const nameValid = name.trim().length > 0 && name.trim().length <= 80;
  const visualValid = visualIdea.trim().length > 0 && visualIdea.trim().length <= 280;
  const motionValid = motion.trim().length > 0 && motion.trim().length <= 220;
  const textLinesValid = longLineIndex === -1 && !tooManyLines;

  const formValid =
    nameValid && durationValid && textLinesValid && visualValid && motionValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || saving) return;

    setSaving(true);
    try {
      await onSave({
        ...scene,
        name: name.trim(),
        durationSeconds: Math.round(parsedDuration * 10) / 10,
        onScreenText: parsedLines,
        visualIdea: visualIdea.trim(),
        motion: motion.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Scene name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        dir="auto"
        error={!nameValid ? 'Enter a scene name (1–80 characters).' : undefined}
      />

      <Input
        label="Duration (seconds)"
        type="number"
        step="0.5"
        min="1.5"
        max="15"
        value={durationInput}
        onChange={(e) => setDurationInput(e.target.value)}
        className="font-mono tabular-nums"
        error={
          !durationValid
            ? 'Each scene must be between 1.5 and 15 seconds.'
            : undefined
        }
      />

      <div className="space-y-1.5">
        <Textarea
          label="On-screen text (one line per caption, max 60 chars each)"
          rows={3}
          value={onScreenTextInput}
          onChange={(e) => setOnScreenTextInput(e.target.value)}
          dir="auto"
          placeholder="Short headline&#10;Supporting subline"
          error={
            tooManyLines
              ? 'Use at most 6 lines of on-screen text.'
              : longLineIndex !== -1
                ? `Line ${longLineIndex + 1} is ${parsedLines[longLineIndex].length} chars (max 60).`
                : undefined
          }
        />
        {parsedLines.length > 0 && textLinesValid && (
          <p className="text-[11px] text-text-muted tabular-nums">
            {parsedLines.length} {parsedLines.length === 1 ? 'line' : 'lines'} · max{' '}
            {Math.max(...parsedLines.map((l) => l.length))}/60 chars
          </p>
        )}
      </div>

      <Textarea
        label="Visual idea"
        rows={3}
        value={visualIdea}
        onChange={(e) => setVisualIdea(e.target.value)}
        maxLength={280}
        dir="auto"
        error={
          !visualValid
            ? 'Describe the visual layout and shapes (1–280 characters).'
            : undefined
        }
      />

      <Textarea
        label="Motion"
        rows={3}
        value={motion}
        onChange={(e) => setMotion(e.target.value)}
        maxLength={220}
        dir="auto"
        error={
          !motionValid
            ? 'Describe the animation and transition motion (1–220 characters).'
            : undefined
        }
      />

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={!formValid || saving}
        >
          Save scene
        </Button>
      </div>
    </form>
  );
}

export function SceneEditorSheet({
  open,
  scene,
  onClose,
  onSave,
}: SceneEditorSheetProps) {
  return (
    <Sheet
      open={open && scene !== null}
      onClose={onClose}
      side="right"
      title={scene ? `Edit scene: ${scene.name}` : 'Edit scene'}
      subtitle="Changes save immediately to your local project"
    >
      {scene && (
        <SceneEditorForm
          key={scene.id}
          scene={scene}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Sheet>
  );
}
