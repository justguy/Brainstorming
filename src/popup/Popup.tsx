import React, { useEffect, useRef, useState } from 'react';
import type { Idea } from '../types';
import { createIdea, listIdeas } from '../storage/ideas';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Popup(): React.ReactElement {
  const [rawText, setRawText] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [recentIdeas, setRecentIdeas] = useState<Idea[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const ideas = await listIdeas();
      setRecentIdeas(ideas.slice(0, 5));
    } catch {
      // non-fatal: list may be empty on first use
    }
  }

  function parseTags(input: string): string[] {
    return input
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  async function handleSave() {
    const text = rawText.trim();
    if (!text) {
      setError('Please enter an idea first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createIdea({ rawText: text, tags: parseTags(tagsInput) });
      setRawText('');
      setTagsInput('');
      await loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save idea.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBrainstormNow() {
    const text = rawText.trim();
    if (!text) {
      setError('Please enter an idea first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const idea = await createIdea({ rawText: text, tags: parseTags(tagsInput) });
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', ideaId: idea.id });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create idea.');
      setSaving(false);
    }
  }

  function handleOpenIdea(ideaId: string) {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', ideaId });
    window.close();
  }

  return (
    <div className="w-[360px] p-4 flex flex-col gap-3">
      <h1 className="text-base font-semibold text-gray-900">
        💡 Brainstorming Orchestrator
      </h1>

      {/* Idea input */}
      <div>
        <label htmlFor="rawText" className="block text-xs font-medium text-gray-700 mb-1">
          Idea
        </label>
        <textarea
          id="rawText"
          ref={textareaRef}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder="Describe your idea…"
          rows={4}
          className="w-full min-h-[100px] resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          aria-label="Idea description"
        />
      </div>

      {/* Tags input */}
      <div>
        <label htmlFor="tags" className="block text-xs font-medium text-gray-700 mb-1">
          Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <input
          id="tags"
          type="text"
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="e.g. product, ai, ux"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={handleSave}
          disabled={saving}
          className="flex-1"
          aria-label="Save idea without starting brainstorming"
        >
          Save
        </Button>
        <Button
          variant="primary"
          onClick={handleBrainstormNow}
          disabled={saving}
          className="flex-1"
          aria-label="Save idea and open brainstorming side panel"
        >
          Brainstorm now
        </Button>
      </div>

      {/* Recent ideas */}
      {recentIdeas.length > 0 && (
        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Recent
          </p>
          <ul className="flex flex-col gap-0.5">
            {recentIdeas.map(idea => (
              <li key={idea.id}>
                <button
                  type="button"
                  onClick={() => handleOpenIdea(idea.id)}
                  className="w-full text-left rounded px-2 py-1.5 hover:bg-gray-50 group focus:outline-none focus:ring-2 focus:ring-violet-400"
                  aria-label={`Open idea: ${idea.rawText.slice(0, 40)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-violet-700">
                      {idea.rawText.slice(0, 40)}
                      {idea.rawText.length > 40 ? '…' : ''}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge color={idea.readiness}>{idea.readiness}</Badge>
                      <span className="text-xs text-gray-400">{formatRelativeTime(idea.updatedAt)}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
