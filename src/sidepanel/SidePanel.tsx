import React, { useEffect, useRef, useState } from 'react';
import type { Idea, ActiveTabToolContext } from '../types';
import { listIdeas, createIdea, updateIdea } from '../storage/ideas';
import { getSettings } from '../storage/settings';
import { queryActiveTabTools } from '../webmcp/contextBridge';
import IdeaListItem from '../ui/IdeaListItem';
import Button from '../ui/Button';
import Workspace from '../workspace/Workspace';

function getIdeaQueryParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('idea');
  } catch {
    return null;
  }
}

// Per-idea WebMCP consent decision: 'allowed' | 'skipped' | null (= not yet asked)
type ConsentDecision = 'allowed' | 'skipped';

export default function SidePanel(): React.ReactElement {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); // null = loading
  const [creating, setCreating] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const newIdeaRef = useRef<HTMLTextAreaElement>(null);

  // WebMCP consent state: keyed by idea id
  const [consentDecisions, setConsentDecisions] = useState<Record<string, ConsentDecision>>({});
  // Detected tool context for the consent banner (pre-fetch before showing banner)
  const [pendingToolCtx, setPendingToolCtx] = useState<ActiveTabToolContext | null>(null);
  // Whether we're probing the tab right now
  const [probingTab, setProbingTab] = useState(false);

  // Load ideas + settings on mount
  useEffect(() => {
    loadIdeas();
    checkApiKey();

    // Phase 3 fix: read pendingIdeaId from chrome.storage.session (set by service
    // worker when popup sends OPEN_SIDE_PANEL). Clear it after reading so it doesn't
    // persist across panel re-opens.
    chrome.storage.session.get('pendingIdeaId', (result) => {
      const id = result['pendingIdeaId'] as string | undefined;
      if (id) {
        setSelectedId(id);
        chrome.storage.session.remove('pendingIdeaId');
        // Refresh list to include the newly created idea from the popup
        loadIdeas();
      }
    });

    // Also listen for live messages in case the panel is already open when popup fires
    const listener = (message: { type: string; ideaId?: string }) => {
      if (message.type === 'OPEN_SIDE_PANEL' && message.ideaId) {
        setSelectedId(message.ideaId);
        loadIdeas();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Auto-select from query param on mount (secondary path)
  useEffect(() => {
    const param = getIdeaQueryParam();
    if (param) setSelectedId(param);
  }, []);

  // Focus textarea when new idea form appears
  useEffect(() => {
    if (showNewForm) newIdeaRef.current?.focus();
  }, [showNewForm]);

  async function loadIdeas() {
    try {
      const all = await listIdeas();
      setIdeas(all);
    } catch {
      // non-fatal
    }
  }

  async function checkApiKey() {
    try {
      const s = await getSettings();
      const key = s.credentials[s.activeProvider];
      setHasApiKey(!!key);
    } catch {
      setHasApiKey(false);
    }
  }

  async function handleCreate() {
    const text = newIdeaText.trim();
    if (!text) return;
    setCreating(true);
    try {
      const idea = await createIdea({ rawText: text, tags: [] });
      await loadIdeas();
      setSelectedId(idea.id);
      setNewIdeaText('');
      setShowNewForm(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  function handleIdeaUpdate(updated: Idea) {
    setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
  }

  // When an idea is selected: if it's at phase 0 (not yet brainstormed) and we
  // haven't asked for consent yet, probe the active tab for WebMCP tools.
  useEffect(() => {
    if (!selectedId) return;
    const idea = ideas.find(i => i.id === selectedId);
    if (!idea) return;

    // Already has tools persisted — no need to re-probe
    if (idea.liveToolContext) return;

    // Already decided for this idea
    if (consentDecisions[selectedId]) return;

    // Only probe at Phase 0 (idea not yet brainstormed)
    if (idea.phase !== 0) return;

    let cancelled = false;
    setProbingTab(true);
    setPendingToolCtx(null);

    queryActiveTabTools()
      .then(ctx => {
        if (cancelled) return;
        // Only show banner if there are actually tools on the tab
        if (ctx && ctx.tools.length > 0) {
          setPendingToolCtx(ctx);
        }
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => {
        if (!cancelled) setProbingTab(false);
      });

    return () => { cancelled = true; };
    // Re-run when selection changes or ideas list updates (idea could be created)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ideas.length]);

  async function handleConsentAllow() {
    if (!selectedId || !pendingToolCtx) return;
    const idea = ideas.find(i => i.id === selectedId);
    if (!idea) return;

    // Persist the tool context on the idea
    const updated: Idea = { ...idea, liveToolContext: pendingToolCtx, updatedAt: Date.now() };
    try {
      await updateIdea(updated.id, updated);
      setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    } catch { /* non-fatal */ }

    setConsentDecisions(prev => ({ ...prev, [selectedId]: 'allowed' }));
    setPendingToolCtx(null);
  }

  function handleConsentSkip() {
    if (!selectedId) return;
    setConsentDecisions(prev => ({ ...prev, [selectedId]: 'skipped' }));
    setPendingToolCtx(null);
  }

  const selectedIdea = ideas.find(i => i.id === selectedId) ?? null;

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Left column: idea list ── */}
      <aside
        className="w-[320px] shrink-0 flex flex-col border-r border-gray-200 bg-gray-50"
        aria-label="Idea list"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-sm font-semibold text-gray-800">
              💡 Brainstorming
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewForm(v => !v)}
              aria-label="New idea"
              title="Create a new idea"
            >
              {showNewForm ? 'Cancel' : '+ New'}
            </Button>
          </div>

          {/* Inline new idea form */}
          {showNewForm && (
            <div className="mt-2 space-y-2">
              <textarea
                ref={newIdeaRef}
                value={newIdeaText}
                onChange={e => setNewIdeaText(e.target.value)}
                placeholder="Describe your idea…"
                rows={3}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                aria-label="New idea description"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newIdeaText.trim()}
                className="w-full"
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          )}
        </div>

        {/* No API key banner */}
        {hasApiKey === false && (
          <div className="mx-3 mt-3 rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
            <strong>No LLM provider configured.</strong>{' '}
            <button
              type="button"
              className="underline hover:text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500 rounded"
              onClick={() => chrome.runtime.openOptionsPage()}
            >
              Configure your provider
            </button>{' '}
            to begin brainstorming.
          </div>
        )}

        {/* Idea list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {ideas.length === 0 ? (
            <p className="text-xs text-gray-400 text-center mt-6 px-4">
              No ideas yet. Create one above or use the popup.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {ideas.map(idea => (
                <li key={idea.id}>
                  <IdeaListItem
                    idea={idea}
                    selected={idea.id === selectedId}
                    onClick={() => setSelectedId(idea.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right column: workspace ── */}
      <main className="flex-1 overflow-hidden flex flex-col" aria-label="Workspace">
        {/* WebMCP consent banner */}
        {pendingToolCtx && selectedIdea && !selectedIdea.liveToolContext && (
          <div className="shrink-0 mx-4 mt-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
            <p className="font-semibold mb-1">Live tool context available</p>
            <p className="text-xs mb-2">
              This brainstorm can see <strong>{pendingToolCtx.tools.length} tool{pendingToolCtx.tools.length !== 1 ? 's' : ''}</strong> on{' '}
              <span className="font-mono">{pendingToolCtx.origin}</span> to give it better context.
              Allow?
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleConsentAllow}>
                Allow
              </Button>
              <Button variant="ghost" size="sm" onClick={handleConsentSkip}>
                Skip
              </Button>
            </div>
          </div>
        )}
        {probingTab && selectedIdea && !selectedIdea.liveToolContext && !pendingToolCtx && (
          <div className="shrink-0 mx-4 mt-3 text-xs text-gray-400 italic px-1">
            Checking for live tools on active tab…
          </div>
        )}
        {/* Live context chip (persisted tools) */}
        {selectedIdea?.liveToolContext && (
          <div className="shrink-0 mx-4 mt-2">
            <span className="inline-flex items-center gap-1 text-xs rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5">
              <span className="font-semibold">Live context:</span>
              {selectedIdea.liveToolContext.tools.length} tool{selectedIdea.liveToolContext.tools.length !== 1 ? 's' : ''} from{' '}
              <span className="font-mono">{selectedIdea.liveToolContext.origin}</span>
            </span>
          </div>
        )}
        {selectedIdea ? (
          <div className="flex-1 overflow-hidden">
            <Workspace idea={selectedIdea} onUpdate={handleIdeaUpdate} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-2 max-w-sm px-6">
              <p className="text-gray-400 text-sm">
                Select or create an idea to start brainstorming
              </p>
              {hasApiKey === false && (
                <p className="text-xs text-amber-700">
                  Remember to{' '}
                  <button
                    type="button"
                    className="underline focus:outline-none"
                    onClick={() => chrome.runtime.openOptionsPage()}
                  >
                    configure your LLM provider
                  </button>{' '}
                  first.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
