import React, { useEffect, useState } from 'react';
import type { Idea } from '../../src/types';
import Options from './Options';
import { useBrainstormingTools, dispatchAndWait } from './webmcp-tools';
import Workspace, { WorkspacePhaseFlow } from '../../src/workspace/Workspace';
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
import { useHashRoute } from './useHashRoute';
import { useBoardActivity } from './useBoardActivity';
import { useBoardBeatRunner } from './useBoardBeatRunner';
import { BoardAppView } from './BoardAppView';
import { useBeatReviewActions } from './useBeatReviewActions';
import { BeatReviewPanel } from './BeatReviewPanel';
import { BoardHistoryPanel } from './BoardHistoryPanel';
import { createBoardHistoryEntries } from './historyTimeline';
import { runManualBoardBeat, selectBoardBeatReviewSurface } from './boardBeatReviewSurface';

const DEV_COMPANION_PAUSED_TWEAK_KEY = 'companion.facilitatorPaused';

export default function App(): React.ReactElement {
  const [hash, navigate] = useHashRoute();
  const {
    boardId, boardTitle, boardRepository, boardController, ideas, groups, docs, selectedId, setSelectedId, hasApiKey,
    docCounts, setDocCounts, connections, critiques, suggestions, beatReviewSessions, beatReviewItems, tweaks,
    historyState, changeSets, applyCommittedBoard, updateBoardTweaks, createBeatReviewSession, keepBeatReviewItem,
    scratchBeatReviewItem,
    handleIdeaUpdate, loadIdeas, loadDocCounts, loadCritiques, supportingDocMutations, refineSupportingDoc,
  } = useBoardSync();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const { activity, setActivity, textEntryActive, markActivity } = useBoardActivity({ captureOpen });
  const { activeBeatRun, runBoardBeat } = useBoardBeatRunner();

  const visibleIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
  const discardedIdeas = ideas.filter(i => i.status === 'discarded');
  const selectedBoardIdea = ideas.find(i => i.id === selectedId) ?? null;
  const selectedLegacyToolIdea = createLegacyToolIdea(selectedBoardIdea);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');

  useEffect(() => {
    if (!selectedBoardIdea) {
      setInspectorOpen(false);
    }
  }, [selectedBoardIdea]);

  useBrainstormingTools(selectedLegacyToolIdea);

  const { handleCapture, handleDiscard, handleRestore, handleUndo, handleRedo } = useBoardSessionActions({
    newIdeaText, newIdeaTags, boardController, applyCommittedBoard, setCreating, setSelectedId,
    setNewIdeaText, setNewIdeaTags, markActivity,
  });
  const {
    findingConnections, lastConnectionsRunAt, highlightIds, critiqueBusyByIdea, animatedConnectionIds,
    animatedCritiqueIds, markConnectionsRunAt, handleHighlight, runConnectionFinder, runCritiqueIdea,
    handleDismissCritique,
  } = useBoardAnalysisActions({
    boardId, ideas, connections, boardRepository, boardController, applyCommittedBoard, runBoardBeat,
  });
  const {
    scouting, lastScoutRunAt, suggestionBusy, animatedSuggestionIds, suggestionsExpanded,
    visibleCanvasSuggestions, suggestionOverflowCount, runScout, handleAdmitSuggestion,
    handleElaborateSuggestion, handleDismissSuggestion, expandSuggestions, collapseSuggestions,
  } = useBoardSuggestionActions({
    boardId, ideas, suggestions, boardRepository, boardController, applyCommittedBoard, runBoardBeat, markActivity,
  });
  const { handleMove, handleGroup, handleUngroup, handleMerge } = useCanvasIdeaMutations({
    ideas, boardController, applyCommittedBoard, setCanvasBusy, setSelectedId, markActivity,
  });
  const {
    activeSession: activeBeatReviewSession, activeItems: activeBeatReviewItems, busyByItem: beatReviewBusyByItem,
    batchBusy: beatReviewBatchBusy, presentBeatReview, handleKeep: handleKeepBeatReviewItem,
    handleScratch: handleScratchBeatReviewItem, handleKeepAll: handleKeepAllBeatReviewItems,
    handleScratchAll: handleScratchAllBeatReviewItems, closeActiveSession: closeBeatReviewSession,
    focusSession: focusBeatReviewSession,
  } = useBeatReviewActions({ ideas, beatReviewSessions, beatReviewItems, boardController, applyCommittedBoard, createBeatReviewSession, keepBeatReviewItem, scratchBeatReviewItem });

  useBrainstormSupportingDocEvents({ boardId, ideas, loadDocCounts, markActivity, supportingDocMutations, refineSupportingDoc });
  useBrainstormAnalysisEvents({
    boardId, ideas, connections, boardController, applyCommittedBoard, markConnectionsRunAt,
    handleHighlight, loadCritiques, runConnectionFinder, runCritiqueIdea, handleDismissCritique,
  });
  useBrainstormLifecycleEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadIdeas, setSelectedId, setAdvancingFromTool, setCreating,
  });
  useBrainstormSuggestionEvents({
    boardId, boardTitle, ideas, groups, connections, suggestions, runConnectionFinder, runCritiqueIdea, runScout, runBoardBeat,
    presentBeatReview,
    handleAdmitSuggestion, handleElaborateSuggestion, handleDismissSuggestion,
  });
  useBrainstormWorkspaceEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadIdeas, setSelectedId, handleMove, handleGroup, handleUngroup, handleMerge,
  });

  const { boardBeatReviewSession, boardBeatReviewItems } = selectBoardBeatReviewSurface({ beatReviewSessions, beatReviewItems, activeBeatReviewSession });

  const {
    facilitatorPaused, idleMs, softModeAssessment, interactionSuppressed, softModeBusy,
    lastMeaningfulActivity, pendingBoardChange, autoRunReady, autoRunCountdownMs,
    showSoftModeHint, companionActionLabel, handleSoftModeAction, toggleFacilitatorPause, lastAiAction, dismissHint,
  } = useCompanionAutomation({
    activity,
    setActivity,
    dragActive,
    textEntryActive,
    activeBeatRun,
    persistedFacilitatorPaused: Boolean(tweaks?.values[DEV_COMPANION_PAUSED_TWEAK_KEY]),
    persistFacilitatorPaused: async paused => {
      await updateBoardTweaks(
        { [DEV_COMPANION_PAUSED_TWEAK_KEY]: paused },
        { type: 'user', source: 'canvas', label: 'devCompanion' },
        paused ? 'Paused dev companion automation' : 'Resumed dev companion automation',
      );
    },
    scouting,
    findingConnections,
    critiqueBusyByIdea,
    visibleIdeas, connectionsCount: connections.length, suggestionsCount: suggestions.length, docCounts,
    selectedBoardIdea, activeCritiques, runScout, runConnectionFinder, runCritiqueIdea,
  });

  const critiqueFocusIdeaId = hoverIdeaId ?? selectedId ?? null;
  const editingIdeaId = textEntryActive ? selectedId : null;
  const suppressRevealAnimations = dragActive || textEntryActive;
  const openOptions = () => navigate('#/options');
  const historyEntries = createBoardHistoryEntries({ changeSets, historyState, ideas, groups, docs, suggestions, critiques, connections, beatReviewSessions, beatReviewItems });
  const triggerManualBoardBeat = (beat: 'cluster' | 'summarise'): void => {
    void runManualBoardBeat({ beat, boardId, boardTitle, ideas, groups, connections, runBoardBeat, presentBeatReview }).catch(err => {
      console.error(`[App] ${beat} beat failed:`, err);
    });
  };

  if (hash === '#/options') {
    return <Options onBack={() => navigate('')} />;
  }

  return (
    <BoardAppView
      header={{
        advancingFromTool,
        canvasBusy,
        historyState,
        historyOpen,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onToggleHistory: () => setHistoryOpen(value => !value),
        onOpenOptions: openOptions,
      }}
      showApiKeyBanner={hasApiKey === false}
      onOpenOptions={openOptions}
      historyPanel={historyOpen ? (
        <BoardHistoryPanel
          entries={historyEntries}
          cursor={historyState.cursor}
          totalChanges={Math.max(0, historyState.nextSeq - 1)}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
      reviewPanel={activeBeatReviewSession && activeBeatReviewItems.length > 0 ? (
        <BeatReviewPanel
          session={activeBeatReviewSession}
          items={activeBeatReviewItems}
          busyByItem={beatReviewBusyByItem}
          batchBusy={beatReviewBatchBusy}
          onKeep={itemId => { void handleKeepBeatReviewItem(itemId); }}
          onScratch={itemId => { void handleScratchBeatReviewItem(itemId); }}
          onKeepAll={() => { void handleKeepAllBeatReviewItems(); }}
          onScratchAll={() => { void handleScratchAllBeatReviewItems(); }}
          onClose={closeBeatReviewSession}
        />
      ) : null}
      companionRail={{
        hasApiKey, facilitatorPaused, activeBeatRun, softModeAssessment, interactionSuppressed, idleMs,
        autoIdleMs: AUTO_IDLE_MS, lastAiAction, lastScoutRunAt, lastConnectionsRunAt, companionActionLabel,
        softModeBusy, lastMeaningfulActivity, pendingBoardChange, autoRunReady, autoRunCountdownMs,
        showSoftModeHint, connections, findingConnections, scouting, suggestions, handleSoftModeAction, toggleFacilitatorPause,
        runConnectionFinder: () => { void runConnectionFinder(); },
        handleHighlight,
        runScout: () => { void runScout(); },
        dismissHint,
        boardBeatReviewSession,
        boardBeatReviewItems,
        onOpenBoardBeatReview: boardBeatReviewSession ? () => focusBeatReviewSession(boardBeatReviewSession.id) : undefined,
        onRunClusterBeat: () => triggerManualBoardBeat('cluster'),
        onRunSummariseBeat: () => triggerManualBoardBeat('summarise'),
      }}
      canvasStage={{
        ideas: visibleIdeas, groups, connections, critiques, critiqueBusyByIdea, critiqueFocusIdeaId, hoverIdeaId, editingIdeaId,
        animatedConnectionIds, animatedCritiqueIds, animatedSuggestionIds, suppressAnimations: suppressRevealAnimations, docCounts, highlightIds,
        suggestions: visibleCanvasSuggestions,
        suggestionOverflowCount, suggestionsExpanded, suggestionBusy,
        onDismissCritique: handleDismissCritique,
        onConnectionClick: handleHighlight, onFocusIdeaChange: setHoverIdeaId, onDragStateChange: setDragActive, onMove: handleMove,
        onOpen: id => {
          setInspectorOpen(false);
          setSelectedId(id);
        },
        onOpenDocs: id => setDocsIdeaId(id),
        onGroup: handleGroup, onUngroup: handleUngroup, onMerge: handleMerge, onDiscard: handleDiscard, onAdmitSuggestion: handleAdmitSuggestion,
        onElaborateSuggestion: handleElaborateSuggestion,
        onDismissSuggestion: handleDismissSuggestion,
        onExpandSuggestions: expandSuggestions, onCollapseSuggestions: collapseSuggestions,
      }}
      workspaceOverlays={{
        ideas, discardedIdeas, selectedBoardIdea, docsIdeaId, boardId, docCounts, supportingDocMutations,
        isInspectorOpen: inspectorOpen,
        capturePopover: {
          open: captureOpen, creating, text: newIdeaText, tags: newIdeaTags, onToggle: () => setCaptureOpen(value => !value),
          onTextChange: setNewIdeaText, onTagsChange: setNewIdeaTags, onClose: () => setCaptureOpen(false),
          onSubmit: handleCapture,
        },
        selectedIdeaDockContent: selectedBoardIdea ? (
          <WorkspacePhaseFlow
            idea={selectedBoardIdea}
            onUpdate={handleIdeaUpdate}
            source="canvas"
          />
        ) : null,
        inspectorContent: selectedBoardIdea ? (
          <Workspace
            idea={selectedBoardIdea}
            onUpdate={handleIdeaUpdate}
            docCount={docCounts[selectedBoardIdea.id] ?? 0}
            onOpenDocs={id => setDocsIdeaId(id)}
          />
        ) : null,
        onRestoreDiscardedIdea: handleRestore,
        onPreviewDiscardedIdea: id => {
          setSelectedId(id);
          setInspectorOpen(true);
        },
        onCloseDocs: () => setDocsIdeaId(null),
        onDocsChanged: (id, count) => setDocCounts(prev => ({ ...prev, [id]: count })),
        onOpenInspector: () => setInspectorOpen(true),
        onCloseInspector: () => setInspectorOpen(false),
        onCloseSelectedIdea: () => {
          setInspectorOpen(false);
          setSelectedId(null);
        },
      }}
    />
  );
}

// Re-export dispatchAndWait for use in event listeners above (suppress unused warning)
void dispatchAndWait;
