import React, { useEffect, useRef, useState } from 'react';
import type { Idea, Panel } from '../../src/types';
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
import { useBoardTheme } from './useBoardTheme';
import { useFacilitatorSync } from './useFacilitatorSync';

const DEV_COMPANION_PAUSED_TWEAK_KEY = 'companion.facilitatorPaused';
const CAPTURE_CANVAS_SELECTOR = '.bo-canvas';
const CAPTURE_REVEAL_PADDING = 32;
const CAPTURE_REVEAL_ATTEMPTS = 5;
const CAPTURE_HIGHLIGHT_CLEAR_MS = 2200;

type CaptureFeedback = {
  tone: 'success' | 'error';
  message: string;
} | null;

type CaptureReveal = {
  ideaId: string;
  panel: Panel;
  attempts: number;
};

type LatestCapture = {
  ideaId: string;
  panel: Panel;
};

function getCanvasElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(CAPTURE_CANVAS_SELECTOR);
}

function isPanelVisible(canvas: HTMLElement, panel: Panel): boolean {
  const visibleLeft = canvas.scrollLeft + CAPTURE_REVEAL_PADDING;
  const visibleTop = canvas.scrollTop + CAPTURE_REVEAL_PADDING;
  const visibleRight = canvas.scrollLeft + canvas.clientWidth - CAPTURE_REVEAL_PADDING;
  const visibleBottom = canvas.scrollTop + canvas.clientHeight - CAPTURE_REVEAL_PADDING;

  return (
    panel.x >= visibleLeft &&
    panel.y >= visibleTop &&
    panel.x + panel.width <= visibleRight &&
    panel.y + panel.height <= visibleBottom
  );
}

function centerPanelOnCanvas(canvas: HTMLElement, panel: Panel): void {
  const targetLeft = Math.max(0, panel.x - (canvas.clientWidth - panel.width) / 2);
  const targetTop = Math.max(0, panel.y - (canvas.clientHeight - panel.height) / 2);
  canvas.scrollTo({
    left: Math.round(targetLeft),
    top: Math.round(targetTop),
    behavior: 'auto',
  });
}

export default function App(): React.ReactElement {
  const [hash, navigate] = useHashRoute();
  const { boardTheme, setBoardTheme } = useBoardTheme();
  const {
    boardId, boardTitle, boardRepository, boardController, ideas, groups, docs, selectedId, setSelectedId, hasApiKey,
    docCounts, setDocCounts, connections, critiques, suggestions, beatReviewSessions, beatReviewItems, tweaks,
    historyState, changeSets, applyCommittedBoard, updateBoardTweaks, createBeatReviewSession, keepBeatReviewItem,
    scratchBeatReviewItem,
    handleIdeaUpdate, loadBoard, loadIdeas, loadDocCounts, loadCritiques, supportingDocMutations, refineSupportingDoc,
  } = useBoardSync();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<CaptureFeedback>(null);
  const [captureReveal, setCaptureReveal] = useState<CaptureReveal | null>(null);
  const [latestCapture, setLatestCapture] = useState<LatestCapture | null>(null);
  const [captureHighlightIds, setCaptureHighlightIds] = useState<string[]>([]);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const lastSharedBoardMutationIdRef = useRef<string | null>(null);
  const { activity, setActivity, textEntryActive, markActivity } = useBoardActivity({ captureOpen });
  const { activeBeatRun, runBoardBeat } = useBoardBeatRunner();
  const persistedFacilitatorPaused = Boolean(tweaks?.values[DEV_COMPANION_PAUSED_TWEAK_KEY]);

  const visibleIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
  const discardedIdeas = ideas.filter(i => i.status === 'discarded');
  const selectedBoardIdea = ideas.find(i => i.id === selectedId) ?? null;
  const selectedLegacyToolIdea = createLegacyToolIdea(selectedBoardIdea);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');

  useEffect(() => {
    if (!captureFeedback) return undefined;
    const timeout = window.setTimeout(() => {
      setCaptureFeedback(current => (current === captureFeedback ? null : current));
    }, captureFeedback.tone === 'success' ? 3200 : 5200);
    return () => window.clearTimeout(timeout);
  }, [captureFeedback]);

  useEffect(() => {
    if (!selectedBoardIdea) {
      setInspectorOpen(false);
    }
  }, [selectedBoardIdea]);

  useEffect(() => {
    if (captureHighlightIds.length === 0) return undefined;
    const timeout = window.setTimeout(() => {
      setCaptureHighlightIds([]);
    }, CAPTURE_HIGHLIGHT_CLEAR_MS);
    return () => window.clearTimeout(timeout);
  }, [captureHighlightIds]);

  useBrainstormingTools(selectedLegacyToolIdea);

  const { handleCapture, handleDiscard, handleRestore, handleUndo, handleRedo } = useBoardSessionActions({
    ideas: visibleIdeas, newIdeaText, newIdeaTags, boardController, applyCommittedBoard, setCreating, setSelectedId,
    setNewIdeaText, setNewIdeaTags, markActivity, onCaptureFeedback: setCaptureFeedback,
    onCaptureCommitted: capture => {
      setLatestCapture(capture);
      setCaptureReveal({ ...capture, attempts: 0 });
    },
  });
  const {
    findingConnections, lastConnectionsRunAt, highlightIds, critiqueBusyByIdea, animatedConnectionIds,
    animatedCritiqueIds, markConnectionsRunAt, handleHighlight, runConnectionFinder, createManualConnection, runCritiqueIdea,
    handleDismissCritique,
  } = useBoardAnalysisActions({
    boardId, ideas, connections, boardRepository, boardController, applyCommittedBoard, runBoardBeat,
  });
  const {
    scouting, lastScoutRunAt, suggestionBusy, animatedSuggestionIds, suggestionsExpanded,
    visibleCanvasSuggestions, suggestionOverflowCount, runScout, runCrossPollinate, handleAdmitSuggestion,
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
    boardId, boardTitle, ideas, groups, connections, suggestions, runConnectionFinder, runCritiqueIdea, runScout, runCrossPollinate, runBoardBeat,
    presentBeatReview,
    handleAdmitSuggestion, handleElaborateSuggestion, handleDismissSuggestion,
  });
  useBrainstormWorkspaceEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadBoard, loadIdeas, setSelectedId, handleMove, handleGroup, handleUngroup, handleMerge,
  });
  const facilitatorSync = useFacilitatorSync(boardId, persistedFacilitatorPaused);

  useEffect(() => {
    const sharedBoardMutation = facilitatorSync.lastBoardMutation;
    if (!sharedBoardMutation) return;
    if (lastSharedBoardMutationIdRef.current === sharedBoardMutation.id) return;
    lastSharedBoardMutationIdRef.current = sharedBoardMutation.id;
    if (sharedBoardMutation.clientId === facilitatorSync.localClientId) return;
    void loadBoard();
  }, [facilitatorSync.lastBoardMutation, facilitatorSync.localClientId, loadBoard]);

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
    persistedFacilitatorPaused,
    persistFacilitatorPaused: async paused => {
      await updateBoardTweaks(
        { [DEV_COMPANION_PAUSED_TWEAK_KEY]: paused },
        { type: 'user', source: 'canvas', label: 'devCompanion' },
        paused ? 'Paused dev companion automation' : 'Resumed dev companion automation',
      );
    },
    sharedFacilitatorPaused: facilitatorSync.sharedPause,
    isAiHost: facilitatorSync.isAiHost,
    syncBoardChangeAt: facilitatorSync.lastBoardActivityAt,
    sharedAiAction: facilitatorSync.lastAiAction,
    setSharedFacilitatorPause: facilitatorSync.setSharedPause,
    recordSharedAiAction: facilitatorSync.recordAiAction,
    scouting,
    findingConnections,
    critiqueBusyByIdea,
    visibleIdeas, connectionsCount: connections.length, suggestionsCount: suggestions.length, docCounts,
    selectedBoardIdea, activeCritiques, runScout, runConnectionFinder, runCritiqueIdea,
  });

  const critiqueFocusIdeaId = hoverIdeaId ?? selectedId ?? null;
  const editingIdeaId = textEntryActive ? selectedId : null;
  const suppressRevealAnimations = dragActive || textEntryActive;
  const highlightedIdeaIds = [...new Set([...highlightIds, ...captureHighlightIds])];
  const openOptions = () => navigate('#/options');
  const openCaptureComposer = () => {
    setCaptureFeedback(null);
    setCaptureOpen(true);
  };
  const toggleCaptureComposer = () => {
    setCaptureFeedback(null);
    setCaptureOpen(value => !value);
  };
  const closeCaptureComposer = () => setCaptureOpen(false);
  const handleCaptureTextChange = (value: string) => {
    setCaptureFeedback(current => (current?.tone === 'error' ? null : current));
    setNewIdeaText(value);
  };
  const handleCaptureTagsChange = (value: string) => {
    setCaptureFeedback(current => (current?.tone === 'error' ? null : current));
    setNewIdeaTags(value);
  };
  const revealCreatedIdea = (ideaId: string, fallbackPanel?: Panel): boolean => {
    const canvas = getCanvasElement();
    const liveIdea = visibleIdeas.find(idea => idea.id === ideaId);
    const panel = liveIdea?.panel ?? fallbackPanel;
    if (!canvas || !panel) return false;

    centerPanelOnCanvas(canvas, panel);
    setSelectedId(ideaId);
    setCaptureHighlightIds([ideaId]);
    return isPanelVisible(canvas, panel);
  };

  useEffect(() => {
    if (!captureReveal) return undefined;

    const liveIdea = visibleIdeas.find(idea => idea.id === captureReveal.ideaId);
    const panel = liveIdea?.panel ?? captureReveal.panel;
    if (!panel) {
      setCaptureFeedback({
        tone: 'error',
        message: 'Note was saved, but its board position is missing.',
      });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const revealed = revealCreatedIdea(captureReveal.ideaId, panel);
      if (revealed) {
        setCaptureFeedback({
          tone: 'success',
          message: 'Note added and centered on the board.',
        });
        setCaptureReveal(null);
        return;
      }

      if (captureReveal.attempts + 1 >= CAPTURE_REVEAL_ATTEMPTS) {
        setCaptureFeedback({
          tone: 'error',
          message: 'Note was saved, but we could not confirm it onscreen.',
        });
        setCaptureReveal(null);
        return;
      }

      setCaptureReveal(current => (
        current && current.ideaId === captureReveal.ideaId
          ? { ...current, attempts: current.attempts + 1, panel }
          : current
      ));
    }, 90);

    return () => window.clearTimeout(timer);
  }, [captureReveal, setSelectedId, visibleIdeas]);

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
        boardTheme,
        captureActionLabel: latestCapture ? (captureReveal ? 'Centering…' : 'Show note') : null,
        canvasBusy,
        captureFeedback,
        captureOpen,
        creating,
        historyState,
        historyOpen,
        onCaptureAction: captureReveal
          ? () => {
            const pending = captureReveal;
            void Promise.resolve().then(() => {
              const revealed = revealCreatedIdea(pending.ideaId, pending.panel);
              setCaptureFeedback({
                tone: revealed ? 'success' : 'error',
                message: revealed
                  ? 'Note centered on the board.'
                  : 'Note was saved, but is still not confirmed onscreen.',
              });
            });
          }
          : latestCapture
            ? () => {
              const revealed = revealCreatedIdea(latestCapture.ideaId, latestCapture.panel);
              setCaptureFeedback({
                tone: revealed ? 'success' : 'error',
                message: revealed
                  ? 'Note centered on the board.'
                  : 'Note was saved, but is still not confirmed onscreen.',
              });
            }
            : undefined,
        onOpenCapture: openCaptureComposer,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onToggleHistory: () => setHistoryOpen(value => !value),
        onSetBoardTheme: setBoardTheme,
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
        showSoftModeHint, ideas: visibleIdeas, connections, findingConnections, scouting, suggestions, handleSoftModeAction, toggleFacilitatorPause,
        runConnectionFinder: () => { void runConnectionFinder(); },
        handleHighlight,
        onCreateConnection: createManualConnection,
        runScout: () => { void runScout(); },
        dismissHint,
        boardBeatReviewSession,
        boardBeatReviewItems,
        onOpenBoardBeatReview: boardBeatReviewSession ? () => focusBeatReviewSession(boardBeatReviewSession.id) : undefined,
        onRunClusterBeat: () => triggerManualBoardBeat('cluster'),
        onRunSummariseBeat: () => triggerManualBoardBeat('summarise'),
        session: {
          localClientId: facilitatorSync.localClientId,
          hostClientId: facilitatorSync.hostClientId,
          manualHostClientId: facilitatorSync.manualHostClientId,
          sharedPause: facilitatorSync.sharedPause,
          peers: facilitatorSync.peers,
          lastAiAction: facilitatorSync.lastAiAction,
          lastBoardMutation: facilitatorSync.lastBoardMutation,
          recentSessionEvents: facilitatorSync.recentSessionEvents,
        },
      }}
      canvasStage={{
        ideas: visibleIdeas, groups, connections, critiques, critiqueBusyByIdea, critiqueFocusIdeaId, hoverIdeaId, editingIdeaId,
        animatedConnectionIds, animatedCritiqueIds, animatedSuggestionIds, suppressAnimations: suppressRevealAnimations, docCounts, highlightIds: highlightedIdeaIds,
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
          open: captureOpen, creating, feedback: captureFeedback, text: newIdeaText, tags: newIdeaTags, onToggle: toggleCaptureComposer,
          onTextChange: handleCaptureTextChange, onTagsChange: handleCaptureTagsChange, onClose: closeCaptureComposer,
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
