/**
 * App.tsx — Top-level layout for the Brainstorming Orchestrator web app.
 *
 * Routing is hash-based (no React Router dependency needed):
 *   ''  or '#' → canvas view
 *   '#/options' → Options settings page
 *
 * Layout:
 *   Header: title + WebMCP status + Options link
 *   Main: full-screen Canvas with floating idea panels.
 *   Capture: floating "+" button opens a popover.
 *   Workspace: slides in from the right when an idea is clicked.
 *
 * WebMCP tools are registered via useBrainstormingTools() on mount.
 * The App listens for CustomEvents dispatched by tool execute() functions:
 *   'brainstorm:selectIdea'  → selects an idea by id
 *   'brainstorm:advancePhase' → triggers phase advance (supports skip flag)
 *   'brainstorm:exportHandoff' → triggers export
 *   'brainstorm:chooseNextStep' → updates nextStep on brief
 *   'brainstorm:patchLens'    → pin/dismiss/note a lens at phase 0.5
 *   'brainstorm:patchChallenge' → accept/defer/rebut a challenge at phase 2.5
 *   'brainstorm:patchStress'  → mark handled / response for a stress test at phase 4.5
 *   'brainstorm:movePanel'    → position a panel on the canvas
 *   'brainstorm:groupIdeas'   → group two ideas by proximity (triggers LLM themer)
 *   'brainstorm:ungroupIdea'  → remove an idea from its group
 *   'brainstorm:mergeIdeas'   → merge two ideas via LLM into a new one
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { Idea, IdeaCritique } from '../../src/types';
import { DEFAULT_BOARD_TITLE } from '../../src/board/types';
import type {
  BeatContextMap,
  BeatName,
  BeatResult,
  BeatRunState,
  ClusterBeatContext,
  ConnectBeatContext,
  CritiqueBeatContext,
  ScoutBeatContext,
  SummariseBeatContext,
} from '../../src/beats/types';
import { runBeat } from '../../src/orchestrator/runBeat';
import Button from '../../src/ui/Button';
import Workspace from '../../src/workspace/Workspace';
import Canvas from '../../src/canvas/Canvas';
import { CritiqueCardsLayer } from '../../src/canvas/CritiqueCardsLayer';
import DiscardPile from '../../src/canvas/DiscardPile';
import ConnectionsPanel from '../../src/canvas/ConnectionsPanel';
import DocsModal from '../../src/docs/DocsModal';
import { SoftModeHint } from './SoftModeHint';
import { DevCompanionCard } from './DevCompanionCard';
import {
  recordActivity,
  type ActivityState,
} from './softMode';
import Options from './Options';
import { useBrainstormingTools, dispatchAndWait } from './webmcp-tools';
import { CaptureIdeaPopover } from './CaptureIdeaPopover';
import { createLegacyToolIdea } from '../../src/workspace/legacyPhaseAdapter';
import { useBrainstormAnalysisEvents } from './useBrainstormAnalysisEvents';
import { useBrainstormLifecycleEvents } from './useBrainstormLifecycleEvents';
import { useBrainstormSuggestionEvents } from './useBrainstormSuggestionEvents';
import { useBoardSync } from './useBoardSync';
import { useBrainstormSupportingDocEvents } from './useBrainstormSupportingDocEvents';
import { useBrainstormWorkspaceEvents } from './useBrainstormWorkspaceEvents';
import { useCanvasIdeaMutations } from './useCanvasIdeaMutations';
import { AUTO_IDLE_MS, useCompanionAutomation } from './useCompanionAutomation';
import { useBoardSessionActions } from './useBoardSessionActions';
import { useBoardAnalysisActions } from './useBoardAnalysisActions';
import { useBoardSuggestionActions } from './useBoardSuggestionActions';

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------

function useHashRoute(): [string, (hash: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((h: string) => {
    window.location.hash = h;
  }, []);

  return [hash, navigate];
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches('input, textarea, select, [role="textbox"]');
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.ReactElement {
  const [hash, navigate] = useHashRoute();
  const {
    boardId,
    boardRepository,
    boardController,
    ideas,
    groups,
    selectedId,
    setSelectedId,
    hasApiKey,
    docCounts,
    setDocCounts,
    connections,
    critiques,
    suggestions,
    historyState,
    applyCommittedBoard,
    handleIdeaUpdate,
    loadBoard,
    loadIdeas,
    loadGroups,
    loadDocCounts,
    loadConnections,
    loadSuggestions,
    loadCritiques,
    supportingDocMutations,
    refineSupportingDoc,
  } = useBoardSync();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityState>(() => ({
    lastInteractionAt: Date.now(),
    recentEdits: [],
    recentGroups: [],
    recentDocs: [],
    lastDismissedAt: 0,
  }));
  const [dragActive, setDragActive] = useState(false);
  const [textEntryActive, setTextEntryActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const [activeBeatRun, setActiveBeatRun] = useState<BeatRunState | null>(null);

  // Canvas shows only active ideas. Archived (post-merge originals) and
  // discarded (user dismissed) both stay in IDB but are hidden from the board.
  const visibleIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
  const discardedIdeas = ideas.filter(i => i.status === 'discarded');
  const selectedBoardIdea = ideas.find(i => i.id === selectedId) ?? null;
  const selectedLegacyToolIdea = createLegacyToolIdea(selectedBoardIdea);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');

  // Register WebMCP tools (global + lifecycle)
  useBrainstormingTools(selectedLegacyToolIdea);

  useEffect(() => {
    if (captureOpen) {
      setTextEntryActive(true);
      return;
    }
    setTextEntryActive(isTextEntryTarget(document.activeElement));
  }, [captureOpen]);

  useEffect(() => {
    if (captureOpen) return;
    const syncTextEntryState = (target: EventTarget | null) => {
      setTextEntryActive(isTextEntryTarget(target ?? document.activeElement));
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isTextEntryTarget(event.target)) {
        syncTextEntryState(event.target);
        return;
      }
      touchInteraction();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        syncTextEntryState(event.target);
        return;
      }
      touchInteraction();
      syncTextEntryState(event.target);
    };
    const handleInput = (event: Event) => {
      if (isTextEntryTarget(event.target)) {
        touchInteraction();
        syncTextEntryState(event.target);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      syncTextEntryState(event.target);
      if (!isTextEntryTarget(event.target)) {
        touchInteraction();
      }
    };
    const handleFocusOut = () => {
      window.setTimeout(() => syncTextEntryState(document.activeElement), 0);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('input', handleInput, true);
    window.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('focusout', handleFocusOut, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('input', handleInput, true);
      window.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('focusout', handleFocusOut, true);
    };
  }, [captureOpen]);

  function markActivity(kind: 'edit' | 'group' | 'doc'): void {
    setActivity(prev => recordActivity(prev, kind));
  }

  function touchInteraction(now = Date.now()): void {
    setActivity(prev => ({ ...prev, lastInteractionAt: now }));
  }

  async function runBoardBeat(context: ScoutBeatContext): Promise<BeatResult<'scout'>>;
  async function runBoardBeat(context: ConnectBeatContext): Promise<BeatResult<'connect'>>;
  async function runBoardBeat(context: CritiqueBeatContext): Promise<BeatResult<'critique'>>;
  async function runBoardBeat(context: ClusterBeatContext): Promise<BeatResult<'cluster'>>;
  async function runBoardBeat(context: SummariseBeatContext): Promise<BeatResult<'summarise'>>;
  async function runBoardBeat(context: BeatContextMap[BeatName]): Promise<BeatResult<BeatName>> {
    setActiveBeatRun({
      beat: context.beat,
      trigger: context.trigger,
      size: context.size,
      status: 'running',
      startedAt: Date.now(),
      focusIdeaId: 'focusIdeaId' in context ? context.focusIdeaId : undefined,
    });
    try {
      return await runBeat(context as any);
    } finally {
      setActiveBeatRun(null);
    }
  }

  const {
    handleCapture,
    handleDiscard,
    handleRestore,
    handleUndo,
    handleRedo,
  } = useBoardSessionActions({
    newIdeaText,
    newIdeaTags,
    boardController,
    applyCommittedBoard,
    setCreating,
    setSelectedId,
    setNewIdeaText,
    setNewIdeaTags,
    markActivity,
  });
  const {
    findingConnections,
    lastConnectionsRunAt,
    highlightIds,
    critiqueBusyByIdea,
    animatedConnectionIds,
    animatedCritiqueIds,
    markConnectionsRunAt,
    handleHighlight,
    runConnectionFinder,
    runCritiqueIdea,
    handleDismissCritique,
  } = useBoardAnalysisActions({
    boardId,
    ideas,
    connections,
    boardRepository,
    boardController,
    applyCommittedBoard,
    runBoardBeat,
  });
  const {
    scouting,
    lastScoutRunAt,
    suggestionBusy,
    animatedSuggestionIds,
    suggestionsExpanded,
    visibleCanvasSuggestions,
    suggestionOverflowCount,
    runScout,
    handleAdmitSuggestion,
    handleElaborateSuggestion,
    handleDismissSuggestion,
    expandSuggestions,
    collapseSuggestions,
  } = useBoardSuggestionActions({
    boardId,
    ideas,
    suggestions,
    boardRepository,
    boardController,
    applyCommittedBoard,
    runBoardBeat,
    markActivity,
  });
  const {
    handleMove,
    handleGroup,
    handleUngroup,
    handleMerge,
  } = useCanvasIdeaMutations({
    ideas,
    boardController,
    applyCommittedBoard,
    setCanvasBusy,
    setSelectedId,
    markActivity,
  });

  useBrainstormSupportingDocEvents({
    boardId,
    ideas,
    loadDocCounts,
    markActivity,
    supportingDocMutations,
    refineSupportingDoc,
  });
  useBrainstormAnalysisEvents({
    boardId,
    ideas,
    connections,
    boardController,
    applyCommittedBoard,
    markConnectionsRunAt,
    handleHighlight,
    loadCritiques,
    runConnectionFinder,
    runCritiqueIdea,
    handleDismissCritique,
  });
  useBrainstormLifecycleEvents({
    boardId,
    ideas,
    boardController,
    applyCommittedBoard,
    loadIdeas,
    setSelectedId,
    setAdvancingFromTool,
    setCreating,
  });
  useBrainstormSuggestionEvents({
    boardId,
    ideas,
    connections,
    suggestions,
    runConnectionFinder,
    runCritiqueIdea,
    runScout,
    runBoardBeat,
    handleAdmitSuggestion,
    handleElaborateSuggestion,
    handleDismissSuggestion,
  });
  useBrainstormWorkspaceEvents({
    boardId,
    ideas,
    boardController,
    applyCommittedBoard,
    loadIdeas,
    setSelectedId,
    handleMove,
    handleGroup,
    handleUngroup,
    handleMerge,
  });

  // ---------------------------------------------------------------------------
  // Tool event listeners
  // ---------------------------------------------------------------------------

  const {
    facilitatorPaused,
    idleMs,
    softModeAssessment,
    interactionSuppressed,
    softModeBusy,
    showSoftModeHint,
    companionActionLabel,
    handleSoftModeAction,
    toggleFacilitatorPause,
    lastAiAction,
    dismissHint,
  } = useCompanionAutomation({
    activity,
    setActivity,
    dragActive,
    textEntryActive,
    scouting,
    findingConnections,
    critiqueBusyByIdea,
    visibleIdeas,
    connectionsCount: connections.length,
    suggestionsCount: suggestions.length,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
    runScout,
    runConnectionFinder,
    runCritiqueIdea,
  });

  const critiqueFocusIdeaId = hoverIdeaId ?? selectedId ?? null;
  const editingIdeaId = textEntryActive ? selectedId : null;
  const suppressRevealAnimations = dragActive || textEntryActive;

  // ---------------------------------------------------------------------------
  // Hash routing
  // ---------------------------------------------------------------------------

  if (hash === '#/options') {
    return <Options onBack={() => navigate('')} />;
  }

  // ---------------------------------------------------------------------------
  // Main layout
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-900">Brainstorming Orchestrator</span>
          {advancingFromTool && (
            <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
              Agent driving…
            </span>
          )}
          {canvasBusy && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              {canvasBusy}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* WebMCP status indicator */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              typeof window !== 'undefined' && window.navigator.modelContext
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
            title={
              typeof window !== 'undefined' && window.navigator.modelContext
                ? 'WebMCP is available — agentic browsers can drive this app'
                : 'WebMCP not detected — direct use only'
            }
          >
            {typeof window !== 'undefined' && window.navigator.modelContext
              ? 'WebMCP active'
              : 'WebMCP unavailable'}
          </span>
          <button
            type="button"
            onClick={() => { void handleUndo(); }}
            disabled={!historyState.canUndo}
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => { void handleRedo(); }}
            disabled={!historyState.canRedo}
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1 disabled:opacity-40"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => navigate('#/options')}
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1"
          >
            Options
          </button>
        </div>
      </header>

      {hasApiKey === false && (
        <div className="shrink-0 mx-5 my-3 rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
          <span>
            <strong>No provider configured.</strong>{' '}
            Add an API key in Options to start brainstorming.
          </span>
          <button
            type="button"
            className="underline hover:text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500 rounded"
            onClick={() => navigate('#/options')}
          >
            Open Options
          </button>
        </div>
      )}

      <div className="shrink-0 px-5 py-3">
        <div className="ml-auto flex w-full max-w-[360px] flex-col items-end gap-3">
          <DevCompanionCard
            hasApiKey={hasApiKey}
            facilitatorPaused={facilitatorPaused}
            activeBeatRun={activeBeatRun}
            softModeAssessment={softModeAssessment}
            interactionSuppressed={interactionSuppressed}
            idleMs={idleMs}
            autoIdleMs={AUTO_IDLE_MS}
            lastAiAction={lastAiAction}
            lastScoutRunAt={lastScoutRunAt}
            lastConnectionsRunAt={lastConnectionsRunAt}
            actionLabel={companionActionLabel}
            onAction={companionActionLabel ? () => { void handleSoftModeAction(); } : undefined}
            onTogglePause={toggleFacilitatorPause}
          />
          <ConnectionsPanel
            connections={connections}
            busy={findingConnections}
            lastRunAt={lastConnectionsRunAt}
            onRun={runConnectionFinder}
            onHighlight={handleHighlight}
          />

          <button
            type="button"
            onClick={() => { void runScout(); }}
            disabled={scouting}
            className="flex w-full items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm shadow hover:shadow-md focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60"
            aria-label={scouting ? 'Scout running' : 'Ask the scout to suggest ideas'}
            title={
              lastScoutRunAt
                ? `Last scout run ${formatSince(lastScoutRunAt)}. Click to refresh.`
                : 'Ask the scout to propose ideas adjacent to the board.'
            }
          >
            <span>🔭</span>
            <span className="font-semibold text-teal-700">
              {scouting ? 'Scouting…' : suggestions.length > 0 ? `Scout (${suggestions.length})` : 'Scout'}
            </span>
          </button>

          {showSoftModeHint && (
            <SoftModeHint
              assessment={softModeAssessment}
              actionLabel={companionActionLabel}
              busy={softModeBusy}
              onAction={companionActionLabel ? () => { void handleSoftModeAction(); } : undefined}
              onDismiss={dismissHint}
            />
          )}
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Canvas fills the full area */}
        <main className="flex-1 overflow-hidden" aria-label="Canvas">
          <Canvas
            ideas={visibleIdeas}
            groups={groups}
            connections={connections}
            animatedConnectionIds={animatedConnectionIds}
            animatedSuggestionIds={animatedSuggestionIds}
            suppressAnimations={suppressRevealAnimations}
            overlayContent={
              <CritiqueCardsLayer
                ideas={visibleIdeas}
                critiques={critiques}
                busyIdeaIds={
                  Object.entries(critiqueBusyByIdea)
                    .filter(([, busy]) => busy)
                    .map(([ideaId]) => ideaId)
                }
                activeIdeaId={critiqueFocusIdeaId}
                hoveredIdeaId={hoverIdeaId}
                editingIdeaId={editingIdeaId}
                animatedCritiqueIds={animatedCritiqueIds}
                suppressAnimations={suppressRevealAnimations}
                onDismiss={handleDismissCritique}
              />
            }
            docCounts={docCounts}
            highlightIds={highlightIds}
            onConnectionClick={handleHighlight}
            suggestions={visibleCanvasSuggestions}
            suggestionOverflowCount={suggestionOverflowCount}
            suggestionsExpanded={suggestionsExpanded}
            suggestionBusy={suggestionBusy}
            onFocusIdeaChange={setHoverIdeaId}
            onDragStateChange={setDragActive}
            onMove={handleMove}
            onOpen={id => setSelectedId(id)}
            onOpenDocs={id => setDocsIdeaId(id)}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
            onMerge={handleMerge}
            onDiscard={handleDiscard}
            onAdmitSuggestion={handleAdmitSuggestion}
            onElaborateSuggestion={handleElaborateSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onExpandSuggestions={expandSuggestions}
            onCollapseSuggestions={collapseSuggestions}
          />
        </main>

        {/* Discard pile drawer (bottom-left) */}
        <DiscardPile
          ideas={discardedIdeas}
          onRestore={handleRestore}
          onPreview={id => setSelectedId(id)}
        />

        <CaptureIdeaPopover
          open={captureOpen}
          creating={creating}
          text={newIdeaText}
          tags={newIdeaTags}
          onToggle={() => setCaptureOpen(value => !value)}
          onTextChange={setNewIdeaText}
          onTagsChange={setNewIdeaTags}
          onClose={() => setCaptureOpen(false)}
          onSubmit={handleCapture}
        />

        {/* Supporting docs modal */}
        {docsIdeaId && (() => {
          const docsIdea = ideas.find(i => i.id === docsIdeaId);
          if (!docsIdea) return null;
          return (
            <DocsModal
              boardId={boardId}
              ideaId={docsIdeaId}
              ideaTitle={docsIdea.rawText.slice(0, 80)}
              open={true}
              onClose={() => setDocsIdeaId(null)}
              onDocsChanged={(id, count) => setDocCounts(prev => ({ ...prev, [id]: count }))}
              docMutations={supportingDocMutations}
            />
          );
        })()}

        {/* Workspace slideover */}
        {selectedBoardIdea && (
          <>
            <div
              className="absolute inset-0 bg-black/20 z-30"
              onClick={() => setSelectedId(null)}
              aria-hidden="true"
            />
            <aside
              className="absolute top-0 right-0 h-full w-full sm:w-[640px] max-w-full bg-white shadow-2xl z-40 border-l border-gray-200 flex flex-col"
              aria-label="Workspace"
            >
              <div className="shrink-0 flex items-center justify-end px-3 py-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1"
                  aria-label="Back to canvas"
                >
                  ← Back to canvas
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <Workspace
                  idea={selectedBoardIdea}
                  onUpdate={handleIdeaUpdate}
                  docCount={docCounts[selectedBoardIdea.id] ?? 0}
                  onOpenDocs={id => setDocsIdeaId(id)}
                />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function formatSince(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

// Re-export dispatchAndWait for use in event listeners above (suppress unused warning)
void dispatchAndWait;
