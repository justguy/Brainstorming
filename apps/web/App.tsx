import React, { useState } from 'react';
import type { Idea } from '../../src/types';
import Options from './Options';
import { useBrainstormingTools, dispatchAndWait } from './webmcp-tools';
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

export default function App(): React.ReactElement {
  const [hash, navigate] = useHashRoute();
  const {
    boardId, boardRepository, boardController, ideas, groups, selectedId, setSelectedId, hasApiKey,
    docCounts, setDocCounts, connections, critiques, suggestions, historyState, applyCommittedBoard,
    handleIdeaUpdate, loadIdeas, loadDocCounts, loadCritiques, supportingDocMutations, refineSupportingDoc,
  } = useBoardSync();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const { activity, setActivity, textEntryActive, markActivity } = useBoardActivity({ captureOpen });
  const { activeBeatRun, runBoardBeat } = useBoardBeatRunner();

  const visibleIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
  const discardedIdeas = ideas.filter(i => i.status === 'discarded');
  const selectedBoardIdea = ideas.find(i => i.id === selectedId) ?? null;
  const selectedLegacyToolIdea = createLegacyToolIdea(selectedBoardIdea);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');

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

  useBrainstormSupportingDocEvents({ boardId, ideas, loadDocCounts, markActivity, supportingDocMutations, refineSupportingDoc });
  useBrainstormAnalysisEvents({
    boardId, ideas, connections, boardController, applyCommittedBoard, markConnectionsRunAt,
    handleHighlight, loadCritiques, runConnectionFinder, runCritiqueIdea, handleDismissCritique,
  });
  useBrainstormLifecycleEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadIdeas, setSelectedId, setAdvancingFromTool, setCreating,
  });
  useBrainstormSuggestionEvents({
    boardId, ideas, connections, suggestions, runConnectionFinder, runCritiqueIdea, runScout, runBoardBeat,
    handleAdmitSuggestion, handleElaborateSuggestion, handleDismissSuggestion,
  });
  useBrainstormWorkspaceEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadIdeas, setSelectedId, handleMove, handleGroup, handleUngroup, handleMerge,
  });

  const {
    facilitatorPaused, idleMs, softModeAssessment, interactionSuppressed, softModeBusy,
    showSoftModeHint, companionActionLabel, handleSoftModeAction, toggleFacilitatorPause, lastAiAction, dismissHint,
  } = useCompanionAutomation({
    activity, setActivity, dragActive, textEntryActive, scouting, findingConnections, critiqueBusyByIdea,
    visibleIdeas, connectionsCount: connections.length, suggestionsCount: suggestions.length, docCounts,
    selectedBoardIdea, activeCritiques, runScout, runConnectionFinder, runCritiqueIdea,
  });

  const critiqueFocusIdeaId = hoverIdeaId ?? selectedId ?? null;
  const editingIdeaId = textEntryActive ? selectedId : null;
  const suppressRevealAnimations = dragActive || textEntryActive;
  const openOptions = () => navigate('#/options');

  if (hash === '#/options') {
    return <Options onBack={() => navigate('')} />;
  }

  return (
    <BoardAppView
      header={{ advancingFromTool, canvasBusy, historyState, onUndo: handleUndo, onRedo: handleRedo, onOpenOptions: openOptions }}
      showApiKeyBanner={hasApiKey === false}
      onOpenOptions={openOptions}
      companionRail={{
        hasApiKey, facilitatorPaused, activeBeatRun, softModeAssessment, interactionSuppressed, idleMs,
        autoIdleMs: AUTO_IDLE_MS, lastAiAction, lastScoutRunAt, lastConnectionsRunAt, companionActionLabel,
        softModeBusy, showSoftModeHint, connections, findingConnections, scouting, suggestions, handleSoftModeAction, toggleFacilitatorPause,
        runConnectionFinder: () => { void runConnectionFinder(); },
        handleHighlight,
        runScout: () => { void runScout(); },
        dismissHint,
      }}
      canvasStage={{
        ideas: visibleIdeas, groups, connections, critiques, critiqueBusyByIdea, critiqueFocusIdeaId, hoverIdeaId, editingIdeaId,
        animatedConnectionIds, animatedCritiqueIds, animatedSuggestionIds, suppressAnimations: suppressRevealAnimations, docCounts, highlightIds,
        suggestions: visibleCanvasSuggestions,
        suggestionOverflowCount, suggestionsExpanded, suggestionBusy,
        onDismissCritique: handleDismissCritique,
        onConnectionClick: handleHighlight, onFocusIdeaChange: setHoverIdeaId, onDragStateChange: setDragActive, onMove: handleMove,
        onOpen: id => setSelectedId(id),
        onOpenDocs: id => setDocsIdeaId(id),
        onGroup: handleGroup, onUngroup: handleUngroup, onMerge: handleMerge, onDiscard: handleDiscard, onAdmitSuggestion: handleAdmitSuggestion,
        onElaborateSuggestion: handleElaborateSuggestion,
        onDismissSuggestion: handleDismissSuggestion,
        onExpandSuggestions: expandSuggestions, onCollapseSuggestions: collapseSuggestions,
      }}
      workspaceOverlays={{
        ideas, discardedIdeas, selectedBoardIdea, docsIdeaId, boardId, docCounts, supportingDocMutations,
        capturePopover: {
          open: captureOpen, creating, text: newIdeaText, tags: newIdeaTags, onToggle: () => setCaptureOpen(value => !value),
          onTextChange: setNewIdeaText, onTagsChange: setNewIdeaTags, onClose: () => setCaptureOpen(false),
          onSubmit: handleCapture,
        },
        onRestoreDiscardedIdea: handleRestore, onPreviewDiscardedIdea: id => setSelectedId(id), onCloseDocs: () => setDocsIdeaId(null),
        onDocsChanged: (id, count) => setDocCounts(prev => ({ ...prev, [id]: count })),
        onCloseWorkspace: () => setSelectedId(null), onWorkspaceUpdate: handleIdeaUpdate, onWorkspaceOpenDocs: id => setDocsIdeaId(id),
      }}
    />
  );
}

// Re-export dispatchAndWait for use in event listeners above (suppress unused warning)
void dispatchAndWait;
