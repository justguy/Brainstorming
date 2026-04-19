import React from 'react';
import type { WebMcpToolDescriptor } from '../webmcp/types';
import type { PhaseTransitionWritebackDraft } from '../webmcp/phaseTransitionWriteback';
import Button from '../ui/Button';

interface WorkspacePhaseTransitionWritebackCardProps {
  draft: PhaseTransitionWritebackDraft;
  tools: WebMcpToolDescriptor[];
  selectedToolName: string;
  inputText: string;
  error: string | null;
  invoking: boolean;
  onToolChange: (toolName: string) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onDismiss: () => void;
}

export function WorkspacePhaseTransitionWritebackCard({
  draft,
  tools,
  selectedToolName,
  inputText,
  error,
  invoking,
  onToolChange,
  onInputChange,
  onSend,
  onDismiss,
}: WorkspacePhaseTransitionWritebackCardProps): React.ReactElement {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
        Phase-Transition Writeback
      </p>
      <p className="mt-1 text-sm font-semibold text-emerald-950">{draft.trigger.headline}</p>
      <p className="mt-1 text-xs text-emerald-900">
        {draft.trigger.detail} This external write uses the active-tab bridge and needs a second explicit confirmation.
      </p>
      <label className="mt-3 block text-xs font-medium text-emerald-900">
        Active-tab tool
      </label>
      <select
        value={selectedToolName}
        onChange={event => onToolChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-emerald-300 bg-white px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {tools.map(tool => (
          <option key={tool.name} value={tool.name}>{tool.name}</option>
        ))}
      </select>
      <label className="mt-3 block text-xs font-medium text-emerald-900">Draft JSON input</label>
      <textarea
        rows={8}
        value={inputText}
        onChange={event => onInputChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-xl border border-emerald-300 bg-white px-2 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Draft JSON input for phase transition writeback"
      />
      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onSend}
          disabled={invoking}
        >
          {invoking ? 'Sending…' : 'Send update'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
