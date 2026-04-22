import React from 'react';
import type { Connection, Idea } from '../types';

interface ConnectionComposerProps {
  sourceIdea: Idea;
  targetIdea: Idea;
  draftKind: Connection['kind'];
  draftRationale: string;
  busy: boolean;
  error: string | null;
  onKindChange: (kind: Connection['kind']) => void;
  onRationaleChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const KIND_OPTIONS: Array<{ value: Connection['kind']; label: string }> = [
  { value: 'builds_on', label: 'Builds on' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'revives_killed', label: 'Revives' },
  { value: 'shared_theme', label: 'Shared theme' },
];

export function ConnectionComposer({
  sourceIdea,
  targetIdea,
  draftKind,
  draftRationale,
  busy,
  error,
  onKindChange,
  onRationaleChange,
  onSubmit,
  onCancel,
}: ConnectionComposerProps): React.ReactElement {
  const sourcePanel = sourceIdea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
  const targetPanel = targetIdea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
  const midpointX = (sourcePanel.x + sourcePanel.width / 2 + targetPanel.x + targetPanel.width / 2) / 2;
  const midpointY = (sourcePanel.y + sourcePanel.height / 2 + targetPanel.y + targetPanel.height / 2) / 2;

  return (
    <div
      className="bo-connection-composer"
      style={{
        left: Math.max(24, midpointX - 190),
        top: Math.max(24, midpointY - 100),
      }}
      onPointerDown={event => event.stopPropagation()}
    >
      <p className="bo-shell-eyebrow">Link notes</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {sourceIdea.rawText.slice(0, 36)}{sourceIdea.rawText.length > 36 ? '…' : ''} → {targetIdea.rawText.slice(0, 36)}{targetIdea.rawText.length > 36 ? '…' : ''}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[9rem,1fr]">
        <select
          value={draftKind}
          onChange={event => onKindChange(event.target.value as Connection['kind'])}
          className="bo-doc-input"
        >
          {KIND_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <textarea
          value={draftRationale}
          onChange={event => onRationaleChange(event.target.value)}
          rows={3}
          className="bo-doc-textarea"
          placeholder="Why should this connection be visible on the board?"
        />
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="bo-shell-action">
          Cancel
        </button>
        <button type="button" onClick={onSubmit} disabled={busy} className="bo-shell-action bo-shell-action--primary">
          {busy ? 'Saving…' : 'Save link'}
        </button>
      </div>
    </div>
  );
}
