import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { createBoardController } from '../storage/boardController';
import type { Idea, LlmMessage } from '../types';
import Button from '../ui/Button';
import { invokeActiveTabTool, queryActiveTabTools } from '../webmcp/contextBridge';
import {
  buildPhaseTransitionWritebackInput,
  buildPhaseTransitionWritebackDraft,
  listPhaseTransitionWriteTools,
  type PhaseTransitionSnapshot,
  type PhaseTransitionWritebackDraft,
} from '../webmcp/phaseTransitionWriteback';
import { WorkspacePhaseTransitionWritebackCard } from './WorkspacePhaseTransitionWritebackCard';

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
  const [writebackDraft, setWritebackDraft] = useState<PhaseTransitionWritebackDraft | null>(null);
  const [writebackToolName, setWritebackToolName] = useState<string | null>(null);
  const [writebackInputText, setWritebackInputText] = useState('{}');
  const [writebackError, setWritebackError] = useState<string | null>(null);
  const [writebackInvoking, setWritebackInvoking] = useState(false);
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const sourceLabel = source === 'workspace' ? 'Workspace' : 'Canvas';
  const previousIdeaIdRef = useRef(idea.id);
  const previousSnapshotRef = useRef<PhaseTransitionSnapshot>({
    phase: idea.phase,
    nextStep: idea.briefState.nextStep,
  });
  const writebackTools = useMemo(
    () => listPhaseTransitionWriteTools(idea.liveToolContext),
    [idea.liveToolContext],
  );

  useEffect(() => {
    if (previousIdeaIdRef.current !== idea.id) {
      previousIdeaIdRef.current = idea.id;
      previousSnapshotRef.current = {
        phase: idea.phase,
        nextStep: idea.briefState.nextStep,
      };
      setWritebackDraft(null);
      setWritebackToolName(null);
      setWritebackInputText('{}');
      setWritebackError(null);
      return;
    }

    const previous = previousSnapshotRef.current;
    const current = {
      phase: idea.phase,
      nextStep: idea.briefState.nextStep,
    };
    previousSnapshotRef.current = current;

    if (writebackTools.length === 0) return;
    const draft = buildPhaseTransitionWritebackDraft({
      idea,
      previous,
      current,
      tool: writebackTools[0],
    });
    if (!draft) return;

    setWritebackDraft(draft);
    setWritebackToolName(draft.toolName);
    setWritebackInputText(JSON.stringify(draft.input, null, 2));
    setWritebackError(null);
    setOpen(true);
  }, [idea, writebackTools]);

  async function recordToolInvocation(toolName: string, input: unknown, summary: string): Promise<void> {
    try {
      const result = await invokeActiveTabTool(toolName, input);
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
        summary,
      });
      onIdeaUpdate(updated);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async function handleInvokeTool(toolName: string): Promise<void> {
    setInvoking(true);
    setInvokeError(null);

    try {
      const parsedInput = JSON.parse(invokeInputText);
      await recordToolInvocation(toolName, parsedInput, `${sourceLabel} invoked ${toolName}`);
      setInvokeToolName(null);
      setInvokeInputText('{}');
    } catch (err) {
      setInvokeError(err instanceof Error ? err.message : 'Invalid JSON input');
    } finally {
      setInvoking(false);
    }
  }

  async function handleSendWriteback(): Promise<void> {
    if (!writebackToolName) return;
    const expectedOrigin = idea.liveToolContext?.origin;
    if (!expectedOrigin) return;
    setWritebackInvoking(true);
    setWritebackError(null);

    try {
      const activeTabContext = await queryActiveTabTools();
      if (!activeTabContext) {
        setWritebackError(`Active tab no longer exposes WebMCP tools. Switch back to ${expectedOrigin}.`);
        return;
      }
      if (activeTabContext.origin !== expectedOrigin) {
        setWritebackError(
          `Active tab changed to ${activeTabContext.origin}. Switch back to ${expectedOrigin} before sending.`,
        );
        return;
      }
      const parsedInput = JSON.parse(writebackInputText);
      await recordToolInvocation(
        writebackToolName,
        parsedInput,
        `${sourceLabel} sent phase-transition writeback via ${writebackToolName}`,
      );
      setWritebackDraft(null);
      setWritebackToolName(null);
      setWritebackInputText('{}');
    } catch (err) {
      setWritebackError(err instanceof Error ? err.message : 'Invalid JSON input');
    } finally {
      setWritebackInvoking(false);
    }
  }

  function handleSelectWritebackTool(toolName: string): void {
    if (!writebackDraft) return;
    const tool = writebackTools.find(entry => entry.name === toolName);
    if (!tool) return;
    const nextInput = buildPhaseTransitionWritebackInput(idea, writebackDraft.trigger, tool);
    setWritebackDraft({
      trigger: writebackDraft.trigger,
      toolName: tool.name,
      input: nextInput,
    });
    setWritebackToolName(tool.name);
    setWritebackInputText(JSON.stringify(nextInput, null, 2));
    setWritebackError(null);
  }

  if (!idea.liveToolContext || idea.liveToolContext.tools.length === 0) return null;

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
          {writebackDraft && writebackToolName && (
            <WorkspacePhaseTransitionWritebackCard
              draft={writebackDraft}
              tools={writebackTools}
              selectedToolName={writebackToolName}
              inputText={writebackInputText}
              error={writebackError}
              invoking={writebackInvoking}
              onToolChange={handleSelectWritebackTool}
              onInputChange={setWritebackInputText}
              onSend={() => { void handleSendWriteback(); }}
              onDismiss={() => {
                setWritebackDraft(null);
                setWritebackToolName(null);
                setWritebackError(null);
              }}
            />
          )}
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
