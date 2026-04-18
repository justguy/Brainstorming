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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { Idea, IdeaCritique, Connection, SupportingDoc, ScoutSuggestion } from '../../src/types';
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
import {
  listCritiquesForIdea,
} from '../../src/storage/critiques';
import {
  getSuggestion,
} from '../../src/storage/suggestions';
import { advance } from '../../src/orchestrator/stateMachine';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { runBeat } from '../../src/orchestrator/runBeat';
import Button from '../../src/ui/Button';
import Workspace from '../../src/workspace/Workspace';
import Canvas from '../../src/canvas/Canvas';
import { CritiqueCardsLayer } from '../../src/canvas/CritiqueCardsLayer';
import DiscardPile from '../../src/canvas/DiscardPile';
import ConnectionsPanel from '../../src/canvas/ConnectionsPanel';
import DocsModal from '../../src/docs/DocsModal';
import { getDoc, listDocsForIdea } from '../../src/storage/docs';
import {
  suggestionElaborator,
  buildElaboratorTask,
  type SuggestionElaboratorOutput,
} from '../../src/orchestrator/roles/suggestionElaborator';
import {
  makeManualConnection,
  materializeConnections,
  replaceGeneratedConnections,
  upsertConnection,
} from './connectionState';
import { SoftModeHint } from './SoftModeHint';
import { DevCompanionCard } from './DevCompanionCard';
import {
  recordActivity,
  type ActivityState,
} from './softMode';
import { MAX_VISIBLE_SUGGESTIONS, pickVisibleSuggestions } from './suggestionDedup';
import Options from './Options';
import { useBrainstormingTools, dispatchAndWait } from './webmcp-tools';
import { CaptureIdeaPopover } from './CaptureIdeaPopover';
import {
  buildClusterBeatContext,
  buildConnectBeatContext,
  buildCritiqueBeatContext,
  buildScoutBeatContext,
  buildSummariseBeatContext,
} from './beatContext';
import { createLegacyToolIdea } from '../../src/workspace/legacyPhaseAdapter';
import { useBoardSync } from './useBoardSync';
import { useCanvasIdeaMutations } from './useCanvasIdeaMutations';
import { AUTO_IDLE_MS, useCompanionAutomation } from './useCompanionAutomation';

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

const COLLAPSED_SUGGESTION_COUNT = 3;
const HIGHLIGHT_FLASH_MS = 320;
const REVEAL_WINDOW_MS = 1_800;

type RevealOrigin = 'manual' | 'ai';

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches('input, textarea, select, [role="textbox"]');
}

function connectionStrengthWeight(strength: Connection['strength']): number {
  switch (strength) {
    case 'strong':
      return 2;
    case 'medium':
      return 1;
    case 'weak':
    default:
      return 0;
  }
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
  const [findingConnections, setFindingConnections] = useState(false);
  const [lastConnectionsRunAt, setLastConnectionsRunAt] = useState<number | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [critiqueBusyByIdea, setCritiqueBusyByIdea] = useState<Record<string, boolean>>({});
  const [scouting, setScouting] = useState(false);
  const [lastScoutRunAt, setLastScoutRunAt] = useState<number | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState<Record<string, 'admit' | 'elaborate' | 'dismiss' | null>>({});
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
  const [animatedConnectionIds, setAnimatedConnectionIds] = useState<string[]>([]);
  const [animatedCritiqueIds, setAnimatedCritiqueIds] = useState<string[]>([]);
  const [animatedSuggestionIds, setAnimatedSuggestionIds] = useState<string[]>([]);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [activeBeatRun, setActiveBeatRun] = useState<BeatRunState | null>(null);
  const connectionRevealTimerRef = useRef<number | null>(null);
  const critiqueRevealTimerRef = useRef<number | null>(null);
  const suggestionRevealTimerRef = useRef<number | null>(null);

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

  function beatTrigger(origin?: RevealOrigin): BeatContextMap[BeatName]['trigger'] {
    return origin === 'ai' ? 'automatic' : 'manual';
  }

  function beatSize(origin?: RevealOrigin): BeatContextMap[BeatName]['size'] {
    return origin === 'ai' ? 'small' : 'big';
  }

  function beatAggressiveness(origin?: RevealOrigin): BeatContextMap[BeatName]['aggressiveness'] {
    return origin === 'ai' ? 'gentle' : 'balanced';
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

  function clearRevealTimer(ref: React.MutableRefObject<number | null>): void {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }

  function revealConnections(connectionIds: string[]): void {
    clearRevealTimer(connectionRevealTimerRef);
    setAnimatedConnectionIds(connectionIds);
    connectionRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedConnectionIds([]);
      connectionRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  function revealCritique(critiqueId: string): void {
    clearRevealTimer(critiqueRevealTimerRef);
    setAnimatedCritiqueIds([critiqueId]);
    critiqueRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedCritiqueIds([]);
      critiqueRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  function revealSuggestions(suggestionIds: string[]): void {
    clearRevealTimer(suggestionRevealTimerRef);
    setAnimatedSuggestionIds(suggestionIds);
    suggestionRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedSuggestionIds([]);
      suggestionRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  useEffect(() => {
    if (suggestions.length <= COLLAPSED_SUGGESTION_COUNT && suggestionsExpanded) {
      setSuggestionsExpanded(false);
    }
  }, [suggestions.length, suggestionsExpanded]);
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

  // ---------------------------------------------------------------------------
  // Tool event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // brainstorm:selectIdea — captures idea created by capture_idea tool
    const handleSelectIdea = (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      setSelectedId(ideaId);
      loadIdeas().then(() => {
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
        }
      });
    };

    // brainstorm:advancePhase — drives the phase workflow from an agent
    const handleAdvancePhase = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; userInput?: string; skip?: boolean; requestId?: string }>;
      const { ideaId, userInput, skip, requestId } = ev.detail;

      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) {
        if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
        return;
      }

      setAdvancingFromTool(true);
      try {
        const updated = await advance(idea, userInput ?? '', !!skip);
        const committed = await boardController.updateIdea({
          ideaId: updated.id,
          patch: updated,
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Advanced idea ${updated.id} to phase ${updated.phase}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] advancePhase failed:', err);
      } finally {
        setAdvancingFromTool(false);
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
        }
      }
    };

    // brainstorm:patchLens — pin/dismiss/note a lens entry
    const handlePatchLens = async (e: Event) => {
      const ev = e as CustomEvent<{
        ideaId: string;
        lensId: string;
        verdict?: 'pending' | 'pinned' | 'dismissed';
        userNote?: string;
        requestId?: string;
      }>;
      const { ideaId, lensId, verdict, userNote, requestId } = ev.detail;
      try {
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) return;
        const lenses = idea.briefState.lenses.map(l =>
          l.id === lensId
            ? { ...l, ...(verdict ? { verdict } : {}), ...(userNote !== undefined ? { userNote } : {}) }
            : l,
        );
        const committed = await boardController.updateIdea({
          ideaId,
          patch: { briefState: { ...idea.briefState, lenses } },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Updated lens ${lensId} on idea ${ideaId}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] patchLens failed:', err);
      } finally {
        if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
      }
    };

    // brainstorm:patchChallenge — accept/defer/rebut a challenge entry
    const handlePatchChallenge = async (e: Event) => {
      const ev = e as CustomEvent<{
        ideaId: string;
        challengeId: string;
        stance?: 'pending' | 'accept' | 'defer' | 'rebut';
        userRebuttal?: string;
        requestId?: string;
      }>;
      const { ideaId, challengeId, stance, userRebuttal, requestId } = ev.detail;
      try {
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) return;
        const challenges = idea.briefState.challenges.map(c =>
          c.id === challengeId
            ? { ...c, ...(stance ? { stance } : {}), ...(userRebuttal !== undefined ? { userRebuttal } : {}) }
            : c,
        );
        const committed = await boardController.updateIdea({
          ideaId,
          patch: { briefState: { ...idea.briefState, challenges } },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Updated challenge ${challengeId} on idea ${ideaId}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] patchChallenge failed:', err);
      } finally {
        if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
      }
    };

    // brainstorm:patchStress — mark handled / add response for a stress test entry
    const handlePatchStress = async (e: Event) => {
      const ev = e as CustomEvent<{
        ideaId: string;
        stressId: string;
        handled?: boolean;
        userResponse?: string;
        requestId?: string;
      }>;
      const { ideaId, stressId, handled, userResponse, requestId } = ev.detail;
      try {
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) return;
        const stressResults = idea.briefState.stressResults.map(s =>
          s.id === stressId
            ? { ...s, ...(handled !== undefined ? { handled } : {}), ...(userResponse !== undefined ? { userResponse } : {}) }
            : s,
        );
        const committed = await boardController.updateIdea({
          ideaId,
          patch: { briefState: { ...idea.briefState, stressResults } },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Updated stress result ${stressId} on idea ${ideaId}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] patchStress failed:', err);
      } finally {
        if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
      }
    };

    // brainstorm:exportHandoff — triggered by export_handoff tool
    const handleExportHandoff = (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      const idea = ideas.find(i => i.id === ideaId);
      if (idea?.artifactMd) {
        const slug = idea.rawText.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const blob = new Blob([idea.artifactMd], { type: 'text/markdown; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: `handoff_${slug}.md` });
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
      }
    };

    // brainstorm:chooseNextStep — updates nextStep on the brief
    const handleChooseNextStep = async (e: Event) => {
      const ev = e as CustomEvent<{
        ideaId: string;
        nextStep: string;
        requestId?: string;
      }>;
      const { ideaId, nextStep, requestId } = ev.detail;
      try {
        const idea = ideas.find(entry => entry.id === ideaId);
        if (!idea) return;
        const committed = await boardController.updateIdea({
          ideaId,
          patch: {
            briefState: {
              ...idea.briefState,
              nextStep: nextStep as Idea['briefState']['nextStep'],
            },
          },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Selected next step for idea ${ideaId}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] chooseNextStep failed:', err);
      } finally {
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
        }
      }
    };

    // Discard/restore tools mutate IDB directly; this listener refreshes the visible idea list.
    const handleIdeasChanged = () => {
      loadIdeas();
    };

    // Supporting-doc tools mutate IDB directly; this listener just refreshes the pill count.
    const handleDocsChanged = (e: Event) => {
      const ev = e as CustomEvent<{ ideaId?: string }>;
      const { ideaId } = ev.detail ?? {};
      markActivity('doc');
      if (ideaId) {
        loadDocCounts([ideaId]);
      } else {
        // Unknown idea — refresh all visible
        loadDocCounts(ideas.filter(i => i.status !== 'archived').map(i => i.id));
      }
    };

    const handleAttachSupportingDocEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; title?: string; rawText: string; requestId?: string }>;
      const { ideaId, title, rawText, requestId } = ev.detail;
      let error: string | undefined;
      let doc: SupportingDoc | undefined;
      try {
        if (!ideaId) throw new Error('ideaId is required');
        if (!rawText || rawText.trim().length === 0) throw new Error('rawText must be non-empty');
        doc = await supportingDocMutations.createDoc({
          ideaId,
          title: title ?? '',
          rawText,
          actor: { type: 'tool', source: 'webmcp' },
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId } }));
        doc = await refineSupportingDoc(doc, { type: 'tool', source: 'webmcp' });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'attach failed';
      }
      if (requestId) {
        window.dispatchEvent(
          new CustomEvent(`tool-completion-${requestId}`, {
            detail: doc
              ? {
                  ok: !error,
                  error,
                  docId: doc.id,
                  status: doc.status,
                  summary: doc.summary,
                  facts: doc.facts,
                }
              : { ok: !error, error },
          }),
        );
      }
    };

    const handleDeleteSupportingDocEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ docId: string; requestId?: string }>;
      const { docId, requestId } = ev.detail;
      let error: string | undefined;
      try {
        const doc = await getDoc(docId);
        if (!doc) throw new Error(`no doc with id ${docId}`);
        await supportingDocMutations.deleteDoc({
          docId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: doc.ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'delete failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };

    const handleRetrySupportingDocEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ docId: string; requestId?: string }>;
      const { docId, requestId } = ev.detail;
      let error: string | undefined;
      let doc: SupportingDoc | undefined;
      try {
        const current = await getDoc(docId);
        if (!current) throw new Error(`no doc with id ${docId}`);
        doc = await supportingDocMutations.updateDoc({
          docId,
          patch: { status: 'processing', error: undefined },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Retried extraction for ${current.title}`,
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: current.ideaId } }));
        doc = await refineSupportingDoc(doc, { type: 'tool', source: 'webmcp' });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: current.ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'retry failed';
      }
      if (requestId) {
        window.dispatchEvent(
          new CustomEvent(`tool-completion-${requestId}`, {
            detail: doc
              ? {
                  ok: !error,
                  error,
                  docId: doc.id,
                  status: doc.status,
                  summary: doc.summary,
                  facts: doc.facts,
                }
              : { ok: !error, error },
          }),
        );
      }
    };

    const handleCritiquesChanged = () => {
      loadCritiques();
    };

    const handleCaptureIdeaEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ rawText: string; tags?: string[]; requestId?: string }>;
      const { rawText, tags, requestId } = ev.detail;
      let ideaId: string | undefined;
      let error: string | undefined;
      setCreating(true);
      try {
        const result = await boardController.captureIdea({
          rawText: rawText.trim(),
          tags: tags ?? [],
          actor: { type: 'tool', source: 'webmcp' },
        });
        applyCommittedBoard(result.document, result.history);
        ideaId = result.changeSet?.affected.find(entry => entry.store === 'ideas')?.id;
        setSelectedId(ideaId ?? null);
      } catch (err) {
        error = err instanceof Error ? err.message : 'capture failed';
      } finally {
        setCreating(false);
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ideaId, error } }));
      }
    };

    // Canvas operations — delegate to the same handlers the UI uses
    const handleMoveEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; x: number; y: number; requestId?: string }>;
      const { ideaId, x, y, requestId } = ev.detail;
      try { await handleMove(ideaId, x, y, 'webmcp'); } catch (err) { console.error('[App] move failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };
    const handleDiscardIdeaEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      let error: string | undefined;
      try {
        const result = await boardController.discardIdea({
          ideaId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        applyCommittedBoard(result.document, result.history);
        if (selectedId === ideaId) setSelectedId(null);
      } catch (err) {
        error = err instanceof Error ? err.message : 'discard failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };
    const handleRestoreIdeaEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      let error: string | undefined;
      try {
        const result = await boardController.restoreIdea({
          ideaId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        applyCommittedBoard(result.document, result.history);
      } catch (err) {
        error = err instanceof Error ? err.message : 'restore failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };
    const handleGroupEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaIdA: string; ideaIdB: string; requestId?: string }>;
      const { ideaIdA, ideaIdB, requestId } = ev.detail;
      try { await handleGroup(ideaIdA, ideaIdB, 'webmcp'); } catch (err) { console.error('[App] group failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };
    const handleUngroupEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      try { await handleUngroup(ideaId, 'webmcp'); } catch (err) { console.error('[App] ungroup failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };
    const handleMergeEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ draggedId: string; targetId: string; requestId?: string }>;
      const { draggedId, targetId, requestId } = ev.detail;
      try { await handleMerge(draggedId, targetId, 'webmcp'); } catch (err) { console.error('[App] merge failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };

    // brainstorm:findConnections — agent-driven connection finder run.
    // Signals completion with the connection count via the requestId envelope.
    const handleFindConnectionsEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ requestId?: string }>;
      const { requestId } = ev.detail ?? {};
      let count = 0;
      try {
        const found = await runConnectionFinder({ source: 'webmcp' });
        count = found.length;
      } catch (err) {
        console.error('[App] find_connections failed:', err);
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { count } }));
      }
    };

    const handleDrawConnectionEvent = async (e: Event) => {
      const ev = e as CustomEvent<{
        fromIdeaId: string;
        toIdeaId: string;
        kind: Connection['kind'];
        rationale: string;
        requestId?: string;
      }>;
      const { fromIdeaId, toIdeaId, kind, rationale, requestId } = ev.detail;
      let error: string | undefined;
      let connectionId: string | undefined;

      const visibleIdeaIds = new Set(
        ideas
          .filter(idea => idea.status !== 'archived' && idea.status !== 'discarded')
          .map(idea => idea.id),
      );

      if (!visibleIdeaIds.has(fromIdeaId) || !visibleIdeaIds.has(toIdeaId)) {
        error = 'draw_connection requires both idea ids to be visible on the active canvas.';
      } else if (fromIdeaId === toIdeaId) {
        error = 'draw_connection requires two different idea ids.';
      } else if (!rationale.trim()) {
        error = 'draw_connection requires a non-empty rationale.';
      } else {
        const connection = makeManualConnection({
          fromIdeaId,
          toIdeaId,
          kind,
          rationale: rationale.trim(),
        });
        connectionId = connection.id;
        const committed = await boardController.replaceConnections({
          connections: upsertConnection(connections, connection),
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Added manual connection ${connection.id}`,
        });
        applyCommittedBoard(committed.document, committed.history);
        setLastConnectionsRunAt(connection.createdAt);
        handleHighlight(connection.ideaIds);
      }

      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error, connectionId } }));
      }
    };

    const handleCritiqueIdeaEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      let critiqueId: string | undefined;
      let error: string | undefined;

      try {
        const critique = await runCritiqueIdea(ideaId, { source: 'webmcp' });
        critiqueId = critique?.id;
      } catch (err) {
        error = err instanceof Error ? err.message : 'critique failed';
      }

      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error, critiqueId } }));
      }
    };

    const handleDismissCritiqueEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ critiqueId: string; requestId?: string }>;
      const { critiqueId, requestId } = ev.detail;
      let error: string | undefined;

      try {
        await handleDismissCritique(critiqueId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'dismiss critique failed';
      }

      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };

    // brainstorm:scout — agent-driven scout run. Returns count of new suggestions.
    const handleScoutEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ requestId?: string }>;
      const { requestId } = ev.detail ?? {};
      let count = 0;
      try {
        const created = await runScout({ source: 'webmcp' });
        count = created.length;
      } catch (err) {
        console.error('[App] scout_ideas failed:', err);
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { count } }));
      }
    };

    const handleRunBeatEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ beat: BeatName; focusIdeaId?: string; requestId?: string }>;
      const { beat, focusIdeaId, requestId } = ev.detail;
      let detail: Record<string, unknown>;

      try {
        switch (beat) {
          case 'scout': {
            const created = await runScout({ source: 'webmcp' });
            detail = {
              ok: true,
              beat,
              mode: 'committed',
              count: created.length,
              suggestions: created.map(suggestion => ({
                id: suggestion.id,
                rawText: suggestion.rawText,
                rationale: suggestion.rationale,
                source: suggestion.source,
                relatedIdeaIds: suggestion.relatedIdeaIds ?? [],
                status: suggestion.status,
              })),
            };
            break;
          }
          case 'connect': {
            const found = await runConnectionFinder({ source: 'webmcp' });
            detail = {
              ok: true,
              beat,
              mode: 'committed',
              count: found.length,
              connections: found,
            };
            break;
          }
          case 'critique': {
            if (!focusIdeaId) throw new Error('run_beat critique requires focusIdeaId.');
            const critique = await runCritiqueIdea(focusIdeaId, { source: 'webmcp' });
            detail = {
              ok: !!critique,
              beat,
              mode: 'committed',
              critiqueId: critique?.id,
              critique,
            };
            break;
          }
          case 'cluster': {
            const result = await runBoardBeat(buildClusterBeatContext({
              boardId,
              boardTitle: DEFAULT_BOARD_TITLE,
              ideas,
              connections,
              trigger: 'manual',
              size: 'big',
              aggressiveness: 'balanced',
            }));
            detail = {
              ok: result.ok,
              beat,
              mode: 'preview',
              meta: result.meta,
              hints: result.ok ? result.proposal.hints : [],
              reason: result.ok ? undefined : result.reason,
            };
            break;
          }
          case 'summarise': {
            const result = await runBoardBeat(buildSummariseBeatContext({
              boardId,
              boardTitle: DEFAULT_BOARD_TITLE,
              ideas,
              connections,
              trigger: 'manual',
              size: 'big',
              aggressiveness: 'balanced',
            }));
            detail = {
              ok: result.ok,
              beat,
              mode: 'preview',
              meta: result.meta,
              summaries: result.ok ? result.proposal.summaries : [],
              reason: result.ok ? undefined : result.reason,
            };
            break;
          }
          default:
            detail = { ok: false, beat, error: `Unsupported beat: ${beat}` };
        }
      } catch (err) {
        detail = {
          ok: false,
          beat,
          error: err instanceof Error ? err.message : `${beat} failed`,
        };
      }

      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
      }
    };

    const handleAdmitSuggestionEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = ev.detail;
      let admittedIdeaId: string | undefined;
      let error: string | undefined;
      try {
        await handleAdmitSuggestion(suggestionId, 'webmcp');
        const updated = await getSuggestion(suggestionId);
        admittedIdeaId = updated?.admittedIdeaId;
      } catch (err) {
        error = err instanceof Error ? err.message : 'admit failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { admittedIdeaId, error } }));
      }
    };

    const handleElaborateSuggestionEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = ev.detail;
      let error: string | undefined;
      try {
        await handleElaborateSuggestion(suggestionId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'elaborate failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };

    const handleDismissSuggestionEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = ev.detail;
      let error: string | undefined;
      try {
        await handleDismissSuggestion(suggestionId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'dismiss failed';
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { ok: !error, error } }));
      }
    };

    window.addEventListener('brainstorm:captureIdea', handleCaptureIdeaEvent as EventListener);
    window.addEventListener('brainstorm:selectIdea', handleSelectIdea);
    window.addEventListener('brainstorm:advancePhase', handleAdvancePhase as EventListener);
    window.addEventListener('brainstorm:exportHandoff', handleExportHandoff);
    window.addEventListener('brainstorm:chooseNextStep', handleChooseNextStep as EventListener);
    window.addEventListener('brainstorm:patchLens', handlePatchLens as EventListener);
    window.addEventListener('brainstorm:patchChallenge', handlePatchChallenge as EventListener);
    window.addEventListener('brainstorm:patchStress', handlePatchStress as EventListener);
    window.addEventListener('brainstorm:movePanel', handleMoveEvent as EventListener);
    window.addEventListener('brainstorm:discardIdea', handleDiscardIdeaEvent as EventListener);
    window.addEventListener('brainstorm:restoreIdea', handleRestoreIdeaEvent as EventListener);
    window.addEventListener('brainstorm:groupIdeas', handleGroupEvent as EventListener);
    window.addEventListener('brainstorm:ungroupIdea', handleUngroupEvent as EventListener);
    window.addEventListener('brainstorm:mergeIdeas', handleMergeEvent as EventListener);
    window.addEventListener('brainstorm:docsChanged', handleDocsChanged as EventListener);
    window.addEventListener('brainstorm:attachSupportingDoc', handleAttachSupportingDocEvent as EventListener);
    window.addEventListener('brainstorm:deleteSupportingDoc', handleDeleteSupportingDocEvent as EventListener);
    window.addEventListener('brainstorm:retrySupportingDoc', handleRetrySupportingDocEvent as EventListener);
    window.addEventListener('brainstorm:critiquesChanged', handleCritiquesChanged as EventListener);
    window.addEventListener('brainstorm:ideasChanged', handleIdeasChanged as EventListener);
    window.addEventListener('brainstorm:findConnections', handleFindConnectionsEvent as EventListener);
    window.addEventListener('brainstorm:drawConnection', handleDrawConnectionEvent as EventListener);
    window.addEventListener('brainstorm:critiqueIdea', handleCritiqueIdeaEvent as EventListener);
    window.addEventListener('brainstorm:dismissCritique', handleDismissCritiqueEvent as EventListener);
    window.addEventListener('brainstorm:scout', handleScoutEvent as EventListener);
    window.addEventListener('brainstorm:runBeat', handleRunBeatEvent as EventListener);
    window.addEventListener('brainstorm:admitSuggestion', handleAdmitSuggestionEvent as EventListener);
    window.addEventListener('brainstorm:elaborateSuggestion', handleElaborateSuggestionEvent as EventListener);
    window.addEventListener('brainstorm:dismissSuggestion', handleDismissSuggestionEvent as EventListener);

    return () => {
      window.removeEventListener('brainstorm:captureIdea', handleCaptureIdeaEvent as EventListener);
      window.removeEventListener('brainstorm:selectIdea', handleSelectIdea);
      window.removeEventListener('brainstorm:advancePhase', handleAdvancePhase as EventListener);
      window.removeEventListener('brainstorm:exportHandoff', handleExportHandoff);
      window.removeEventListener('brainstorm:chooseNextStep', handleChooseNextStep as EventListener);
      window.removeEventListener('brainstorm:patchLens', handlePatchLens as EventListener);
      window.removeEventListener('brainstorm:patchChallenge', handlePatchChallenge as EventListener);
      window.removeEventListener('brainstorm:patchStress', handlePatchStress as EventListener);
      window.removeEventListener('brainstorm:movePanel', handleMoveEvent as EventListener);
      window.removeEventListener('brainstorm:discardIdea', handleDiscardIdeaEvent as EventListener);
      window.removeEventListener('brainstorm:restoreIdea', handleRestoreIdeaEvent as EventListener);
      window.removeEventListener('brainstorm:groupIdeas', handleGroupEvent as EventListener);
      window.removeEventListener('brainstorm:ungroupIdea', handleUngroupEvent as EventListener);
      window.removeEventListener('brainstorm:mergeIdeas', handleMergeEvent as EventListener);
      window.removeEventListener('brainstorm:docsChanged', handleDocsChanged as EventListener);
      window.removeEventListener('brainstorm:attachSupportingDoc', handleAttachSupportingDocEvent as EventListener);
      window.removeEventListener('brainstorm:deleteSupportingDoc', handleDeleteSupportingDocEvent as EventListener);
      window.removeEventListener('brainstorm:retrySupportingDoc', handleRetrySupportingDocEvent as EventListener);
      window.removeEventListener('brainstorm:critiquesChanged', handleCritiquesChanged as EventListener);
      window.removeEventListener('brainstorm:ideasChanged', handleIdeasChanged as EventListener);
      window.removeEventListener('brainstorm:findConnections', handleFindConnectionsEvent as EventListener);
      window.removeEventListener('brainstorm:drawConnection', handleDrawConnectionEvent as EventListener);
      window.removeEventListener('brainstorm:critiqueIdea', handleCritiqueIdeaEvent as EventListener);
      window.removeEventListener('brainstorm:dismissCritique', handleDismissCritiqueEvent as EventListener);
      window.removeEventListener('brainstorm:scout', handleScoutEvent as EventListener);
      window.removeEventListener('brainstorm:runBeat', handleRunBeatEvent as EventListener);
      window.removeEventListener('brainstorm:admitSuggestion', handleAdmitSuggestionEvent as EventListener);
      window.removeEventListener('brainstorm:elaborateSuggestion', handleElaborateSuggestionEvent as EventListener);
      window.removeEventListener('brainstorm:dismissSuggestion', handleDismissSuggestionEvent as EventListener);
    };
  }, [boardId, ideas, selectedId, connections, suggestions]);

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  async function handleCapture() {
    const text = newIdeaText.trim();
    if (!text) return;
    setCreating(true);
    try {
      const tags = newIdeaTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      const result = await boardController.captureIdea({
        rawText: text,
        tags,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      setSelectedId(result.changeSet?.affected.find(entry => entry.store === 'ideas')?.id ?? null);
      setNewIdeaText('');
      setNewIdeaTags('');
      markActivity('edit');
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Discard / restore (UI-side — tool-side paths live in webmcp-tools.ts)
  // ---------------------------------------------------------------------------

  async function handleDiscard(ideaId: string): Promise<void> {
    try {
      const result = await boardController.discardIdea({
        ideaId,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      if (selectedId === ideaId) setSelectedId(null);
      markActivity('edit');
    } catch (err) {
      console.error('[App] discard failed:', err);
    }
  }

  async function handleRestore(ideaId: string): Promise<void> {
    try {
      const result = await boardController.restoreIdea({
        ideaId,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      markActivity('edit');
    } catch (err) {
      console.error('[App] restore failed:', err);
    }
  }

  async function handleUndo(): Promise<void> {
    try {
      const result = await boardController.undo();
      if (!result) return;
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] undo failed:', err);
    }
  }

  async function handleRedo(): Promise<void> {
    try {
      const result = await boardController.redo();
      if (!result) return;
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] redo failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Connections (ad-hoc LLM call; persisted board state)
  // ---------------------------------------------------------------------------

  async function runConnectionFinder(options: {
    origin?: RevealOrigin;
    limitGenerated?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  } = {}): Promise<Connection[]> {
    setFindingConnections(true);
    try {
      const boardIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
      const discarded = ideas.filter(i => i.status === 'discarded');
      const docsPerIdea = await Promise.all(
        boardIdeas.map(idea => boardRepository.listDocsForIdea(idea.id).catch(() => [] as SupportingDoc[])),
      );
      const supportingDocs = docsPerIdea.flat().filter(doc => doc.status === 'ready');
      const beatResult = await runBoardBeat(buildConnectBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas,
        supportingDocs,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin),
      }));
      const now = beatResult.meta.finishedAt;
      const proposedConnections = beatResult.ok ? beatResult.proposal.connections : [];
      if (proposedConnections.length === 0) {
        const committed = await boardController.replaceConnections({
          connections: connections.filter(connection => connection.id.startsWith('manual-')),
          actor: options.origin === 'ai'
            ? { type: 'ai', source: 'beat', beat: 'connect', label: 'connectionFinder' }
            : options.source === 'webmcp'
            ? { type: 'tool', source: 'webmcp' }
            : { type: 'user', source: 'canvas' },
          summary: 'Refreshed board connections',
        });
        applyCommittedBoard(committed.document, committed.history);
        setLastConnectionsRunAt(now);
        return [];
      }
      const materialised = materializeConnections(
        ideas,
        supportingDocs,
        { connections: proposedConnections },
        now,
      );
      const nextGenerated = [...materialised]
        .sort((left, right) => {
          const strengthDelta = connectionStrengthWeight(right.strength) - connectionStrengthWeight(left.strength);
          if (strengthDelta !== 0) return strengthDelta;
          return left.createdAt - right.createdAt;
        })
        .slice(0, options.limitGenerated ?? materialised.length);
      const committed = await boardController.replaceConnections({
        connections: replaceGeneratedConnections(connections, nextGenerated),
        actor: options.origin === 'ai'
          ? { type: 'ai', source: 'beat', beat: 'connect', label: 'connectionFinder' }
          : options.source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
        summary: 'Refreshed board connections',
      });
      applyCommittedBoard(committed.document, committed.history);
      setLastConnectionsRunAt(now);
      if (options.origin === 'ai' && nextGenerated.length > 0) {
        revealConnections(nextGenerated.map(connection => connection.id));
      }
      return nextGenerated;
    } catch (err) {
      console.error('[App] connection finder failed:', err);
      return [];
    } finally {
      setFindingConnections(false);
    }
  }

  const flashTimerRef = useRef<number | null>(null);
  function handleHighlight(ids: string[]): void {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setHighlightIds(ids);
    flashTimerRef.current = window.setTimeout(() => {
      setHighlightIds([]);
      flashTimerRef.current = null;
    }, HIGHLIGHT_FLASH_MS);
  }

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      clearRevealTimer(connectionRevealTimerRef);
      clearRevealTimer(critiqueRevealTimerRef);
      clearRevealTimer(suggestionRevealTimerRef);
    };
  }, []);

  async function runCritiqueIdea(
    ideaId: string,
    options: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat' } = {},
  ): Promise<IdeaCritique | null> {
    setCritiqueBusyByIdea(prev => ({ ...prev, [ideaId]: true }));
    try {
      const idea = ideas.find(entry => entry.id === ideaId);
      if (!idea) throw new Error(`Idea not found: ${ideaId}`);

      const activeCritiques = await listCritiquesForIdea(ideaId, 'active', boardId);
      if (activeCritiques.length >= 2) {
        throw new Error('This idea already has the maximum number of active critiques.');
      }
      const mostRecentCritiqueAt = activeCritiques[0]?.createdAt ?? 0;
      if (mostRecentCritiqueAt && Date.now() - mostRecentCritiqueAt < 25_000) {
        throw new Error('This idea is on critique cooldown. Wait a moment before asking for another critique.');
      }

      const supportingDocs = (await listDocsForIdea(ideaId, boardId)).filter(doc => doc.status === 'ready');
      const boardIdeas = ideas.filter(entry => entry.status !== 'archived' && entry.status !== 'discarded');
      const priorCritiques = await listCritiquesForIdea(ideaId, undefined, boardId);
      const beatResult = await runBoardBeat(buildCritiqueBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas: boardIdeas,
        focusIdeaId: ideaId,
        supportingDocs,
        existingCritiques: priorCritiques,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin),
      }));
      if (!beatResult.ok || beatResult.proposal.challenges.length === 0) {
        throw new Error('Devil’s advocate returned no critique.');
      }

      const priorCritiqueTexts = new Set(
        priorCritiques.map(critique => critique.critique.trim().toLowerCase()),
      );
      const nextChallenge = beatResult.proposal.challenges.find(challenge => (
        !priorCritiqueTexts.has(challenge.critique.trim().toLowerCase())
      ));
      if (!nextChallenge) {
        throw new Error('No new critique surfaced beyond the ones already shown.');
      }

      const critiqueResult = await boardController.createCritique({
        ideaId,
        critique: nextChallenge.critique,
        evidenceAsk: nextChallenge.evidenceAsk,
        actor: options.origin === 'ai'
          ? { type: 'ai', source: 'beat', beat: 'critique', label: 'devilsAdvocate' }
          : options.source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
      });
      const critique = critiqueResult.critique;
      applyCommittedBoard(critiqueResult.document, critiqueResult.history);
      handleHighlight([ideaId]);
      if (options.origin === 'ai') revealCritique(critique.id);
      return critique;
    } finally {
      setCritiqueBusyByIdea(prev => ({ ...prev, [ideaId]: false }));
    }
  }

  async function handleDismissCritique(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    try {
      const result = await boardController.dismissCritique({
        critiqueId: id,
        actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
      });
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] dismiss critique failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Scout / suggestions
  // ---------------------------------------------------------------------------

  function ghostPanelFor(index: number): ScoutSuggestion['panel'] {
    // Lay ghost panels along the right side, offset vertically by index so
    // a fresh batch doesn't stack on top of each other.
    return {
      x: 520 + (index % 2) * 40,
      y: 60 + index * 220,
      width: 280,
      height: 200,
    };
  }

  async function runScout(options: {
    origin?: RevealOrigin;
    limitNew?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  } = {}): Promise<ScoutSuggestion[]> {
    setScouting(true);
    try {
      const boardIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
      const discarded = ideas.filter(i => i.status === 'discarded');
      const docsPerIdea = await Promise.all(
        boardIdeas.map(idea => boardRepository.listDocsForIdea(idea.id).catch(() => [] as SupportingDoc[])),
      );
      const supportingDocs = docsPerIdea.flat().filter(doc => doc.status === 'ready');

      const existing = await boardRepository.listSuggestions();
      const alreadyProposedRawTexts = existing
        .filter(s => s.status === 'pending' || s.status === 'admitted')
        .map(s => s.rawText);
      const dismissedRawTexts = existing.filter(s => s.status === 'dismissed').map(s => s.rawText);

      const beatResult = await runBoardBeat(buildScoutBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas,
        supportingDocs,
        existingSuggestions: existing,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin),
      }));
      const now = beatResult.meta.finishedAt;
      setLastScoutRunAt(now);
      if (!beatResult.ok || beatResult.proposal.suggestions.length === 0) return [];

      const visibleSuggestions = pickVisibleSuggestions({
        currentVisibleCount: suggestions.length,
        alreadyProposedRawTexts,
        dismissedRawTexts,
        suggestions: beatResult.proposal.suggestions,
      }).slice(0, options.limitNew ?? MAX_VISIBLE_SUGGESTIONS);
      if (visibleSuggestions.length === 0) return [];

      const allIds = new Set(ideas.map(i => i.id));
      const created: ScoutSuggestion[] = [];
      let lastCommit: Awaited<ReturnType<typeof boardController.createSuggestion>> | null = null;
      for (let i = 0; i < visibleSuggestions.length; i++) {
        const s = visibleSuggestions[i];
        lastCommit = await boardController.createSuggestion({
          rawText: s.rawText,
          rationale: s.rationale,
          source: s.source,
          relatedIdeaIds: s.relatedIdeaIds?.filter(id => allIds.has(id)),
          panel: ghostPanelFor(suggestions.length + i),
          actor: options.origin === 'ai'
            ? { type: 'ai', source: 'beat', beat: 'scout', label: 'outsideKnowledgeScout' }
            : options.source === 'webmcp'
            ? { type: 'tool', source: 'webmcp' }
            : { type: 'user', source: 'canvas' },
        });
        created.push(lastCommit.suggestion);
      }
      if (lastCommit) {
        applyCommittedBoard(lastCommit.document, lastCommit.history);
      }
      if (created.length > 0) setSuggestionsExpanded(false);
      if (options.origin === 'ai' && created.length > 0) {
        revealSuggestions(created.map(suggestion => suggestion.id));
      }
      return created;
    } catch (err) {
      console.error('[App] scout failed:', err);
      return [];
    } finally {
      setScouting(false);
    }
  }

  async function handleAdmitSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'admit' }));
    try {
      const result = await boardController.admitSuggestion({
        suggestionId: id,
        actor: source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      markActivity('edit');
    } catch (err) {
      console.error('[App] admit suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleElaborateSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'elaborate' }));
    try {
      const s = await getSuggestion(id);
      if (!s) return;
      const boardIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
      const task = buildElaboratorTask({ suggestion: s, boardIdeas });
      const { result } = await runAdhocRole<SuggestionElaboratorOutput>(suggestionElaborator, task);
      if (!result) return;
      const parts = [result.elaboration];
      if (result.subSuggestions.length > 0) {
        parts.push('', '**Sub-parts:**', ...result.subSuggestions.map((x: string) => `- ${x}`));
      }
      if (result.implicationsIfAdmitted.length > 0) {
        parts.push('', '**If admitted:**', ...result.implicationsIfAdmitted.map((x: string) => `- ${x}`));
      }
      const committed = await boardController.elaborateSuggestion({
        suggestionId: id,
        elaboration: parts.join('\n'),
        actor: source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(committed.document, committed.history);
    } catch (err) {
      console.error('[App] elaborate suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleDismissSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'dismiss' }));
    try {
      const result = await boardController.dismissSuggestion({
        suggestionId: id,
        actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
      });
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] dismiss suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

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

  const visibleCanvasSuggestions = suggestionsExpanded
    ? suggestions
    : suggestions.slice(0, Math.min(COLLAPSED_SUGGESTION_COUNT, suggestions.length));
  const suggestionOverflowCount = Math.max(0, suggestions.length - visibleCanvasSuggestions.length);
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
            onExpandSuggestions={() => setSuggestionsExpanded(true)}
            onCollapseSuggestions={() => setSuggestionsExpanded(false)}
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
