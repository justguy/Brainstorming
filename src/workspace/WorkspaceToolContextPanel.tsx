import React, { useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { createBoardController } from '../storage/boardController';
import type { Idea, LlmMessage } from '../types';
import Button from '../ui/Button';
import { invokeActiveTabTool } from '../webmcp/contextBridge';

interface WorkspaceToolContextPanelProps {
  idea: Idea;
  onIdeaUpdate: (updated: Idea) => void;
  source: 'canvas' | 'workspace';
}

export function WorkspaceToolContextPanel({
  idea,
  onIdeaUpdate,
  source,
}: WorkspaceToolContextPanelProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [invokeToolName, setInvokeToolName] = useState<string | null>(null);
  const [invokeInputText, setInvokeInputText] = useState('{}');
  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const sourceLabel = source === 'workspace' ? 'Workspace' : 'Canvas';

  if (!idea.liveToolContext || idea.liveToolContext.tools.length === 0) return null;

  async function handleInvokeTool(toolName: string): Promise<void> {
    setInvoking(true);
    setInvokeError(null);
    let parsedInput: unknown = {};

    try {
      parsedInput = JSON.parse(invokeInputText);
    } catch {
      setInvokeError('Invalid JSON input');
      setInvoking(false);
      return;
    }

    try {
      const result = await invokeActiveTabTool(toolName, parsedInput);
      const messageContent = result.error
        ? `Tool ${toolName} returned an error: ${result.error}`
        : `Tool ${toolName} returned: ${JSON.stringify(result.output, null, 2)}`;
      const toolMessage: LlmMessage = { role: 'user', content: messageContent };
      const now = Date.now();
      const updated: Idea = {
        ...idea,
        turnLog: [...idea.turnLog, toolMessage],
        updatedAt: now,
        lastTurnAt: now,
      };

      await boardController.updateIdea({
        ideaId: updated.id,
        patch: updated,
        actor: { type: 'user', source },
        summary: `${sourceLabel} invoked ${toolName}`,
      });
      onIdeaUpdate(updated);
      setInvokeToolName(null);
      setInvokeInputText('{}');
    } catch (err) {
      setInvokeError(err instanceof Error ? err.message : String(err));
    } finally {
      setInvoking(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Live tab context
          </p>
          <p className="text-sm text-slate-700">
            {idea.liveToolContext.origin} with {idea.liveToolContext.tools.length} tool
            {idea.liveToolContext.tools.length === 1 ? '' : 's'} ready
          </p>
        </div>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Open'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          <p className="text-xs text-slate-500">
            Tab: <em>{idea.liveToolContext.title}</em> retrieved{' '}
            {new Date(idea.liveToolContext.retrievedAt).toLocaleTimeString()}
          </p>
          <ul className="space-y-2">
            {idea.liveToolContext.tools.map(tool => (
              <li key={tool.name} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-slate-800">{tool.name}</p>
                    <p className="mt-1 text-xs text-slate-600">{tool.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInvokeToolName(tool.name);
                      setInvokeInputText('{}');
                      setInvokeError(null);
                    }}
                  >
                    Invoke
                  </Button>
                </div>

                {invokeToolName === tool.name && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <label className="block text-xs font-medium text-slate-600">JSON input</label>
                    <textarea
                      rows={3}
                      value={invokeInputText}
                      onChange={event => setInvokeInputText(event.target.value)}
                      className="w-full resize-y rounded-xl border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      placeholder="{}"
                      aria-label={`JSON input for ${tool.name}`}
                    />
                    {invokeError && (
                      <p className="text-xs text-red-600" role="alert">{invokeError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          void handleInvokeTool(tool.name);
                        }}
                        disabled={invoking}
                      >
                        {invoking ? 'Invoking…' : 'Run'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setInvokeToolName(null);
                          setInvokeError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
