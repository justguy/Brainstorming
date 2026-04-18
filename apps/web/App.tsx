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

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { Idea, IdeaCritique, IdeaGroup, Connection, SupportingDoc, ScoutSuggestion } from '../../src/types';
import { DEFAULT_BOARD_ID } from '../../src/board/types';
import { createIdea, updateIdea } from '../../src/storage/ideas';
import { updateBriefState } from '../../src/storage/ideas';
import {
  createCritique,
  dismissCritique as dismissCritiqueStore,
  listCritiquesForIdea,
} from '../../src/storage/critiques';
import {
  createSuggestion,
  admitSuggestion as admitSuggestionStore,
  dismissSuggestion as dismissSuggestionStore,
  setSuggestionElaboration,
  getSuggestion,
} from '../../src/storage/suggestions';
import {
  createGroup,
  updateGroup,
  addIdeaToGroup,
  removeIdeaFromGroup,
  getGroup,
} from '../../src/storage/groups';
import { getSettings } from '../../src/storage/settings';
import { advance } from '../../src/orchestrator/stateMachine';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { groupThemer, buildGroupThemerTask, type GroupThemerOutput } from '../../src/orchestrator/roles/groupThemer';
import { ideaMerger, buildIdeaMergerTask, type IdeaMergerOutput } from '../../src/orchestrator/roles/ideaMerger';
import Button from '../../src/ui/Button';
import Workspace from '../../src/workspace/Workspace';
import Canvas from '../../src/canvas/Canvas';
import { CritiqueCardsLayer } from '../../src/canvas/CritiqueCardsLayer';
import DiscardPile from '../../src/canvas/DiscardPile';
import ConnectionsPanel from '../../src/canvas/ConnectionsPanel';
import DocsModal from '../../src/docs/DocsModal';
import { listDocsForIdea } from '../../src/storage/docs';
import {
  connectionFinder,
  buildConnectionFinderTask,
  type ConnectionFinderOutput,
} from '../../src/orchestrator/roles/connectionFinder';
import {
  buildStandaloneCritiqueTask,
  devilsAdvocate,
  type DevilsAdvocateOutput,
} from '../../src/orchestrator/roles/devilsAdvocate';
import {
  outsideKnowledgeScout,
  buildScoutTask,
  type OutsideKnowledgeScoutOutput,
} from '../../src/orchestrator/roles/outsideKnowledgeScout';
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
import {
  defaultBoardRepository,
  mapStandaloneBoardSnapshot,
  type StandaloneBoardSnapshot,
} from './boardRepository';
import { SoftModeHint } from './SoftModeHint';
import {
  dismissSoftModeHint,
  inferSoftMode,
  recordActivity,
  shouldShowSoftModeHint,
  type ActivityState,
} from './softMode';
import { MAX_VISIBLE_SUGGESTIONS, pickVisibleSuggestions } from './suggestionDedup';
import Options from './Options';
import { useBrainstormingTools, dispatchAndWait } from './webmcp-tools';
import { CaptureIdeaPopover } from './CaptureIdeaPopover';
import { createLegacyToolIdea } from '../../src/workspace/legacyPhaseAdapter';
import { createBoardController } from '../../src/storage/boardController';

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

const AUTO_IDLE_MS = 1_500;
const AUTO_SEQUENCE_GAP_MS = 850;
const AUTO_CRITIQUE_COOLDOWN_MS = 45_000;
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
  const [boardId, setBoardId] = useState(DEFAULT_BOARD_ID);
  const boardRepository = useMemo(() => defaultBoardRepository.forBoard(boardId), [boardId]);
  const boardController = useMemo(() => createBoardController(boardId), [boardId]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [groups, setGroups] = useState<IdeaGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsHydrated, setConnectionsHydrated] = useState(false);
  const [findingConnections, setFindingConnections] = useState(false);
  const [lastConnectionsRunAt, setLastConnectionsRunAt] = useState<number | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [critiques, setCritiques] = useState<IdeaCritique[]>([]);
  const [critiqueBusyByIdea, setCritiqueBusyByIdea] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<ScoutSuggestion[]>([]);
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
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [facilitatorPaused, setFacilitatorPaused] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [textEntryActive, setTextEntryActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const [animatedConnectionIds, setAnimatedConnectionIds] = useState<string[]>([]);
  const [animatedCritiqueIds, setAnimatedCritiqueIds] = useState<string[]>([]);
  const [animatedSuggestionIds, setAnimatedSuggestionIds] = useState<string[]>([]);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    cursor: 0,
    nextSeq: 1,
  });
  const [aiActions, setAiActions] = useState<Array<{
    origin: 'ai';
    kind: 'connections' | 'scout' | 'critique';
    createdAt: number;
    ideaId?: string;
  }>>([]);
  const autoCooldownRef = useRef({
    lastConnectionsAt: 0,
    lastScoutAt: 0,
    lastAiActionAt: 0,
    critiqueByIdea: {} as Record<string, number>,
  });
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

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  function applyBoardSnapshot(snapshot: StandaloneBoardSnapshot): void {
    setBoardId(snapshot.board.id);
    setIdeas(snapshot.ideas);
    setGroups(snapshot.groups);
    setConnections(snapshot.connections);
    setCritiques(snapshot.critiques);
    setSuggestions(snapshot.suggestions);
    setDocCounts(snapshot.docCounts);
  }

  function applyCommittedBoard(
    document: Awaited<ReturnType<typeof boardRepository.loadDocument>>,
    history: typeof historyState,
  ): void {
    applyBoardSnapshot(mapStandaloneBoardSnapshot(document));
    setHistoryState(history);
    setSelectedId(prev => (prev && document.ideas.some(idea => idea.id === prev) ? prev : null));
  }

  async function loadBoard() {
    try {
      applyBoardSnapshot(await boardRepository.loadSnapshot());
      setHistoryState(await boardController.getHistoryState());
    } catch {
      // non-fatal
    } finally {
      setConnectionsHydrated(true);
    }
  }

  async function loadIdeas() {
    await loadBoard();
  }

  async function loadGroups() {
    await loadBoard();
  }

  async function loadDocCounts(ideaIds: string[]): Promise<void> {
    try {
      const counts = Object.fromEntries(
        await Promise.all(
          ideaIds.map(async id => [id, await boardRepository.countDocsForIdea(id)] as const),
        ),
      );
      setDocCounts(prev => ({ ...prev, ...counts }));
    } catch {
      // non-fatal
    }
  }

  async function loadConnections() {
    await loadBoard();
  }

  async function checkApiKey() {
    try {
      const s = await getSettings();
      setHasApiKey(!!(s.credentials[s.activeProvider]));
    } catch {
      setHasApiKey(false);
    }
  }

  async function loadSuggestions() {
    await loadBoard();
  }

  async function loadCritiques() {
    await loadBoard();
  }

  useEffect(() => {
    loadBoard();
    checkApiKey();
  }, []);

  useEffect(() => {
    if (!connectionsHydrated) return;
    boardRepository.replaceConnections(connections).catch(() => {
      // non-fatal
    });
  }, [boardId, connections, connectionsHydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  function recordAiAction(kind: 'connections' | 'scout' | 'critique', ideaId?: string): void {
    const action = {
      origin: 'ai' as const,
      kind,
      createdAt: Date.now(),
      ideaId,
    };
    autoCooldownRef.current.lastAiActionAt = action.createdAt;
    setAiActions(prev => [action, ...prev].slice(0, 5));
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

  // Keep doc counts in sync with the visible idea set.
  useEffect(() => {
    const ids = ideas.filter(i => i.status !== 'archived').map(i => i.id);
    if (ids.length > 0) loadDocCounts(ids);
  }, [ideas]);

  useEffect(() => {
    if (suggestions.length <= COLLAPSED_SUGGESTION_COUNT && suggestionsExpanded) {
      setSuggestionsExpanded(false);
    }
  }, [suggestions.length, suggestionsExpanded]);

  // ---------------------------------------------------------------------------
  // Canvas operations
  // ---------------------------------------------------------------------------

  async function handleMove(
    ideaId: string,
    x: number,
    y: number,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    const result = await boardController.moveIdeaPanel({
      ideaId,
      x,
      y,
      actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
    });
    applyCommittedBoard(result.document, result.history);
    markActivity('edit');
  }

  async function handleGroup(ideaIdA: string, ideaIdB: string): Promise<void> {
    const a = ideas.find(i => i.id === ideaIdA);
    const b = ideas.find(i => i.id === ideaIdB);
    if (!a || !b) return;

    setCanvasBusy('Naming group…');
    try {
      let groupId: string;

      // If B is already in a group, join it. Else if A is, add B to A's. Else create.
      if (b.panel?.groupId) {
        groupId = b.panel.groupId;
        await addIdeaToGroup(groupId, ideaIdA);
      } else if (a.panel?.groupId) {
        groupId = a.panel.groupId;
        await addIdeaToGroup(groupId, ideaIdB);
      } else {
        const g = await createGroup([ideaIdA, ideaIdB], undefined, undefined, boardId);
        groupId = g.id;
      }

      // Stamp groupId on both ideas' panels
      const patchedA = await updateIdea(ideaIdA, {
        panel: { ...(a.panel ?? { x: 0, y: 0, width: 260, height: 180 }), groupId },
      });
      const patchedB = await updateIdea(ideaIdB, {
        panel: { ...(b.panel ?? { x: 0, y: 0, width: 260, height: 180 }), groupId },
      });
      setIdeas(prev =>
        prev.map(i => (i.id === patchedA.id ? patchedA : i.id === patchedB.id ? patchedB : i)),
      );

      // Refresh groups + kick off theming
      await loadGroups();
      const group = await getGroup(groupId);
      if (group) {
        const groupIdeas = group.ideaIds
          .map(id => (id === patchedA.id ? patchedA : id === patchedB.id ? patchedB : ideas.find(x => x.id === id)))
          .filter((x): x is Idea => !!x);
        const task = buildGroupThemerTask(groupIdeas);
        const { result } = await runAdhocRole<GroupThemerOutput>(groupThemer, task);
        if (result) {
          await updateGroup(groupId, {
            theme: result.theme,
            sharedQuestion: result.sharedQuestion,
          });
          await loadGroups();
        }
      }
      markActivity('group');
    } catch (err) {
      console.error('[App] group failed:', err);
    } finally {
      setCanvasBusy(null);
    }
  }

  async function handleUngroup(ideaId: string): Promise<void> {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea?.panel?.groupId) return;
    const groupId = idea.panel.groupId;
    try {
      await removeIdeaFromGroup(groupId, ideaId);
      const patched = await updateIdea(ideaId, {
        panel: { ...idea.panel, groupId: undefined },
      });
      setIdeas(prev => prev.map(i => (i.id === patched.id ? patched : i)));
      await loadGroups();
      markActivity('group');
    } catch (err) {
      console.error('[App] ungroup failed:', err);
    }
  }

  async function handleMerge(draggedId: string, targetId: string): Promise<void> {
    const a = ideas.find(i => i.id === draggedId);
    const b = ideas.find(i => i.id === targetId);
    if (!a || !b) return;

    setCanvasBusy('Merging ideas…');
    try {
      const task = buildIdeaMergerTask(a, b);
      const { result } = await runAdhocRole<IdeaMergerOutput>(ideaMerger, task);
      if (!result) {
        console.warn('[App] merge LLM call returned no result — skipping merge.');
        return;
      }
      // Create the new merged idea at the target's position
      const targetPanel = b.panel ?? { x: 60, y: 60, width: 260, height: 180 };
      const merged = await createIdea({
        boardId,
        rawText: result.mergedRawText,
        tags: result.mergedTags,
        panel: { ...targetPanel, groupId: undefined },
      });
      const mergedWithProvenance = await updateIdea(merged.id, {
        mergedFrom: [a.id, b.id],
        briefState: {
          ...merged.briefState,
          openQuestions: [
            ...(result.tensions.length > 0 ? [`Tensions: ${result.tensions.join(' | ')}`] : []),
            `Merge notes: ${result.synthesisNotes}`,
          ],
        },
      });

      // Archive the originals (kept in IDB for history, hidden from canvas)
      await updateIdea(a.id, { status: 'archived' });
      await updateIdea(b.id, { status: 'archived' });

      // Remove from any groups they were in
      if (a.panel?.groupId) await removeIdeaFromGroup(a.panel.groupId, a.id);
      if (b.panel?.groupId) await removeIdeaFromGroup(b.panel.groupId, b.id);

      await loadBoard();
      setSelectedId(mergedWithProvenance.id);
      markActivity('edit');
    } catch (err) {
      console.error('[App] merge failed:', err);
    } finally {
      setCanvasBusy(null);
    }
  }

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
        await updateIdea(updated.id, updated);
        setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
        if (idea.id === selectedId) {
          setSelectedId(updated.id);
        }
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
        const updated = await updateBriefState(ideaId, { lenses });
        setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
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
        const updated = await updateBriefState(ideaId, { challenges });
        setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
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
        const updated = await updateBriefState(ideaId, { stressResults });
        setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
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
        const updated = await updateBriefState(ideaId, {
          nextStep: nextStep as Idea['briefState']['nextStep'],
        });
        setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
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
      try { await handleGroup(ideaIdA, ideaIdB); } catch (err) { console.error('[App] group failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };
    const handleUngroupEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = ev.detail;
      try { await handleUngroup(ideaId); } catch (err) { console.error('[App] ungroup failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };
    const handleMergeEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ draggedId: string; targetId: string; requestId?: string }>;
      const { draggedId, targetId, requestId } = ev.detail;
      try { await handleMerge(draggedId, targetId); } catch (err) { console.error('[App] merge failed:', err); }
      if (requestId) window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`));
    };

    // brainstorm:findConnections — agent-driven connection finder run.
    // Signals completion with the connection count via the requestId envelope.
    const handleFindConnectionsEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ requestId?: string }>;
      const { requestId } = ev.detail ?? {};
      let count = 0;
      try {
        const found = await runConnectionFinder();
        count = found.length;
      } catch (err) {
        console.error('[App] find_connections failed:', err);
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { count } }));
      }
    };

    const handleDrawConnectionEvent = (e: Event) => {
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
        setConnections(prev => upsertConnection(prev, connection));
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
        const critique = await runCritiqueIdea(ideaId);
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
        await handleDismissCritique(critiqueId);
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
        const created = await runScout();
        count = created.length;
      } catch (err) {
        console.error('[App] scout_ideas failed:', err);
      }
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail: { count } }));
      }
    };

    const handleAdmitSuggestionEvent = async (e: Event) => {
      const ev = e as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = ev.detail;
      let admittedIdeaId: string | undefined;
      let error: string | undefined;
      try {
        await handleAdmitSuggestion(suggestionId);
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
        await handleElaborateSuggestion(suggestionId);
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
        await handleDismissSuggestion(suggestionId);
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
    window.addEventListener('brainstorm:critiquesChanged', handleCritiquesChanged as EventListener);
    window.addEventListener('brainstorm:ideasChanged', handleIdeasChanged as EventListener);
    window.addEventListener('brainstorm:findConnections', handleFindConnectionsEvent as EventListener);
    window.addEventListener('brainstorm:drawConnection', handleDrawConnectionEvent as EventListener);
    window.addEventListener('brainstorm:critiqueIdea', handleCritiqueIdeaEvent as EventListener);
    window.addEventListener('brainstorm:dismissCritique', handleDismissCritiqueEvent as EventListener);
    window.addEventListener('brainstorm:scout', handleScoutEvent as EventListener);
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
      window.removeEventListener('brainstorm:critiquesChanged', handleCritiquesChanged as EventListener);
      window.removeEventListener('brainstorm:ideasChanged', handleIdeasChanged as EventListener);
      window.removeEventListener('brainstorm:findConnections', handleFindConnectionsEvent as EventListener);
      window.removeEventListener('brainstorm:drawConnection', handleDrawConnectionEvent as EventListener);
      window.removeEventListener('brainstorm:critiqueIdea', handleCritiqueIdeaEvent as EventListener);
      window.removeEventListener('brainstorm:dismissCritique', handleDismissCritiqueEvent as EventListener);
      window.removeEventListener('brainstorm:scout', handleScoutEvent as EventListener);
      window.removeEventListener('brainstorm:admitSuggestion', handleAdmitSuggestionEvent as EventListener);
      window.removeEventListener('brainstorm:elaborateSuggestion', handleElaborateSuggestionEvent as EventListener);
      window.removeEventListener('brainstorm:dismissSuggestion', handleDismissSuggestionEvent as EventListener);
    };
  }, [ideas, selectedId, connections, suggestions]);

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

  function handleIdeaUpdate(updated: Idea) {
    setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
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
  } = {}): Promise<Connection[]> {
    setFindingConnections(true);
    try {
      const boardIdeas = ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded');
      const discarded = ideas.filter(i => i.status === 'discarded');
      const docsPerIdea = await Promise.all(
        boardIdeas.map(idea => boardRepository.listDocsForIdea(idea.id).catch(() => [] as SupportingDoc[])),
      );
      const supportingDocs = docsPerIdea.flat().filter(doc => doc.status === 'ready');

      const task = buildConnectionFinderTask({
        boardIdeas,
        discardedIdeas: discarded,
        supportingDocs,
      });
      const { result } = await runAdhocRole<ConnectionFinderOutput>(connectionFinder, task);
      const now = Date.now();
      if (!result) {
        setConnections(prev => prev.filter(connection => connection.id.startsWith('manual-')));
        setLastConnectionsRunAt(now);
        return [];
      }
      const materialised = materializeConnections(ideas, supportingDocs, result, now);
      const nextGenerated = [...materialised]
        .sort((left, right) => {
          const strengthDelta = connectionStrengthWeight(right.strength) - connectionStrengthWeight(left.strength);
          if (strengthDelta !== 0) return strengthDelta;
          return left.createdAt - right.createdAt;
        })
        .slice(0, options.limitGenerated ?? materialised.length);
      setConnections(prev => replaceGeneratedConnections(prev, nextGenerated));
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
    options: { origin?: RevealOrigin } = {},
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
      const task = buildStandaloneCritiqueTask({
        idea,
        boardIdeas,
        supportingDocs,
        existingCritiques: priorCritiques,
      });
      const { result } = await runAdhocRole<DevilsAdvocateOutput>(devilsAdvocate, task);
      if (!result || result.challenges.length === 0) {
        throw new Error('Devil’s advocate returned no critique.');
      }

      const priorCritiqueTexts = new Set(
        priorCritiques.map(critique => critique.critique.trim().toLowerCase()),
      );
      const nextChallenge = result.challenges.find(challenge => (
        !priorCritiqueTexts.has(challenge.critique.trim().toLowerCase())
      ));
      if (!nextChallenge) {
        throw new Error('No new critique surfaced beyond the ones already shown.');
      }

      const critique = await createCritique({
        boardId,
        ideaId,
        critique: nextChallenge.critique,
        evidenceAsk: nextChallenge.evidenceAsk,
      });
      await loadCritiques();
      handleHighlight([ideaId]);
      if (options.origin === 'ai') revealCritique(critique.id);
      return critique;
    } finally {
      setCritiqueBusyByIdea(prev => ({ ...prev, [ideaId]: false }));
    }
  }

  async function handleDismissCritique(id: string): Promise<void> {
    try {
      await dismissCritiqueStore(id);
      await loadCritiques();
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

      const task = buildScoutTask({
        boardIdeas,
        discardedIdeas: discarded,
        supportingDocs,
        alreadyProposedRawTexts,
        dismissedRawTexts,
      });
      const { result } = await runAdhocRole<OutsideKnowledgeScoutOutput>(outsideKnowledgeScout, task);
      const now = Date.now();
      setLastScoutRunAt(now);
      if (!result || result.suggestions.length === 0) return [];

      const visibleSuggestions = pickVisibleSuggestions({
        currentVisibleCount: suggestions.length,
        alreadyProposedRawTexts,
        dismissedRawTexts,
        suggestions: result.suggestions,
      }).slice(0, options.limitNew ?? MAX_VISIBLE_SUGGESTIONS);
      if (visibleSuggestions.length === 0) return [];

      const allIds = new Set(ideas.map(i => i.id));
      const created: ScoutSuggestion[] = [];
      for (let i = 0; i < visibleSuggestions.length; i++) {
        const s = visibleSuggestions[i];
        const createdSuggestion = await createSuggestion({
          boardId,
          rawText: s.rawText,
          rationale: s.rationale,
          source: s.source,
          relatedIdeaIds: s.relatedIdeaIds?.filter(id => allIds.has(id)),
          panel: ghostPanelFor(suggestions.length + i),
        });
        created.push(createdSuggestion);
      }
      await loadSuggestions();
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

  async function handleAdmitSuggestion(id: string): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'admit' }));
    try {
      const s = await getSuggestion(id);
      if (!s) return;
      const bodyParts = [s.rawText];
      if (s.elaboration) bodyParts.push('', '## Scout elaboration', s.elaboration);
      if (s.rationale) bodyParts.push('', `_Scout rationale:_ ${s.rationale}`);
      const idea = await createIdea({
        boardId,
        rawText: bodyParts.join('\n'),
        tags: ['from-scout', s.source.split(':')[0]?.trim() || 'scout'],
        panel: s.panel ? { ...s.panel } : undefined,
      });
      await admitSuggestionStore(id, idea.id);
      await loadBoard();
      markActivity('edit');
    } catch (err) {
      console.error('[App] admit suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleElaborateSuggestion(id: string): Promise<void> {
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
        parts.push('', '**Sub-parts:**', ...result.subSuggestions.map(x => `- ${x}`));
      }
      if (result.implicationsIfAdmitted.length > 0) {
        parts.push('', '**If admitted:**', ...result.implicationsIfAdmitted.map(x => `- ${x}`));
      }
      await setSuggestionElaboration(id, parts.join('\n'));
      await loadSuggestions();
    } catch (err) {
      console.error('[App] elaborate suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleDismissSuggestion(id: string): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'dismiss' }));
    try {
      await dismissSuggestionStore(id);
      await loadSuggestions();
    } catch (err) {
      console.error('[App] dismiss suggestion failed:', err);
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  const idleMs = Math.max(0, clockMs - activity.lastInteractionAt);
  const softModeAssessment = inferSoftMode({
    ideaCount: visibleIdeas.length,
    editCount: activity.recentEdits.length,
    groupingCount: activity.recentGroups.length,
    idleMs,
    docIdeasCount: Object.values(docCounts).filter(count => count > 0).length,
    connectionCount: connections.length,
    activeCritiqueCount: activeCritiques.length,
  });
  const interactionSuppressed = dragActive || textEntryActive;
  const softModeBusy = scouting || findingConnections || Object.values(critiqueBusyByIdea).some(Boolean);
  const showSoftModeHint = shouldShowSoftModeHint({
    assessment: softModeAssessment,
    idleMs,
    lastDismissedAt: activity.lastDismissedAt,
    now: clockMs,
  }) && !softModeBusy && !interactionSuppressed;

  async function handleSoftModeAction(): Promise<void> {
    setActivity(prev => dismissSoftModeHint(recordActivity(prev, 'edit')));

    if (softModeAssessment.inferredMode === 'explore') {
      await runScout();
      return;
    }

    if (softModeAssessment.inferredMode === 'structure') {
      await runConnectionFinder();
      return;
    }

    if (softModeAssessment.inferredMode === 'stress') {
      const targetIdeaId = selectedBoardIdea?.id ?? visibleIdeas[0]?.id;
      if (targetIdeaId) await runCritiqueIdea(targetIdeaId);
    }
  }

  function softModeActionLabel(): string | undefined {
    switch (softModeAssessment.inferredMode) {
      case 'explore':
        return 'Run scout';
      case 'structure':
        return 'Find links';
      case 'stress':
        return selectedBoardIdea || visibleIdeas[0] ? 'Stress-test idea' : undefined;
      case 'converge':
      default:
        return undefined;
    }
  }

  useEffect(() => {
    if (facilitatorPaused || softModeBusy || interactionSuppressed || idleMs < AUTO_IDLE_MS) return;

    let cancelled = false;

    async function runObserver(): Promise<void> {
      const now = Date.now();
      const auto = autoCooldownRef.current;
      if (now - auto.lastAiActionAt < AUTO_SEQUENCE_GAP_MS) return;

      if (
        visibleIdeas.length >= 3 &&
        connections.length === 0 &&
        now - auto.lastConnectionsAt >= 30_000
      ) {
        auto.lastConnectionsAt = now;
        const found = await runConnectionFinder({ origin: 'ai', limitGenerated: 1 });
        if (!cancelled && found.length > 0) recordAiAction('connections');
        return;
      }

      const critiqueTarget = selectedBoardIdea ?? visibleIdeas.find(idea => (docCounts[idea.id] ?? 0) > 0) ?? visibleIdeas[0];
      if (critiqueTarget) {
        const activeForIdea = activeCritiques.filter(critique => critique.ideaId === critiqueTarget.id);
        const lastCritiqueAt = auto.critiqueByIdea[critiqueTarget.id] ?? 0;
        const critiqueAllowed =
          activeForIdea.length < 2 &&
          now - lastCritiqueAt >= AUTO_CRITIQUE_COOLDOWN_MS;

        if (critiqueAllowed) {
          const critique = await runCritiqueIdea(critiqueTarget.id, { origin: 'ai' }).catch(() => null);
          if (critique) {
            auto.critiqueByIdea[critiqueTarget.id] = now;
            if (!cancelled) recordAiAction('critique', critiqueTarget.id);
            return;
          }
        }
      }

      const doclessIdea = visibleIdeas.find(idea => (docCounts[idea.id] ?? 0) === 0);
      if (
        doclessIdea &&
        suggestions.length === 0 &&
        now - auto.lastScoutAt >= 45_000
      ) {
        auto.lastScoutAt = now;
        const created = await runScout({ origin: 'ai', limitNew: 1 });
        if (!cancelled && created.length > 0) recordAiAction('scout', doclessIdea.id);
      }
    }

    void runObserver();

    return () => {
      cancelled = true;
    };
  }, [
    facilitatorPaused,
    softModeBusy,
    interactionSuppressed,
    idleMs,
    visibleIdeas,
    connections.length,
    suggestions.length,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
  ]);

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
            onClick={() => setFacilitatorPaused(value => !value)}
            className={`text-xs px-2 py-0.5 rounded-full border ${
              facilitatorPaused
                ? 'bg-gray-100 text-gray-600 border-gray-300'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {facilitatorPaused ? 'Facilitator paused' : 'Facilitator active'}
          </button>
          {aiActions[0] && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              ai:{aiActions[0].kind}
            </span>
          )}
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
              actionLabel={softModeActionLabel()}
              busy={softModeBusy}
              onAction={softModeActionLabel() ? () => { void handleSoftModeAction(); } : undefined}
              onDismiss={() => setActivity(prev => dismissSoftModeHint(prev))}
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
              ideaId={docsIdeaId}
              ideaTitle={docsIdea.rawText.slice(0, 80)}
              open={true}
              onClose={() => setDocsIdeaId(null)}
              onDocsChanged={(id, count) => setDocCounts(prev => ({ ...prev, [id]: count }))}
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
