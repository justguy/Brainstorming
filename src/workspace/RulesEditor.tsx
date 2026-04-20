/**
 * RulesEditor — review and edit must-stay-true rules directly on the canvas.
 */

import React, { useEffect, useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { createBoardController } from '../storage/boardController';
import type { Idea } from '../types';
import Button from '../ui/Button';

interface RulesEditorProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
  source: 'canvas' | 'workspace';
  advancing: boolean;
  extractError: string | null;
  onGenerate: () => Promise<void>;
  onContinue: () => Promise<void>;
}

function normalizedRules(rules: string[]): string[] {
  return rules.map(rule => rule.trim()).filter(Boolean);
}

function rulesChanged(current: string[], next: string[]): boolean {
  if (current.length !== next.length) return true;
  return current.some((rule, idx) => rule !== next[idx]);
}

export default function RulesEditor({
  idea,
  onUpdate,
  source,
  advancing,
  extractError,
  onGenerate,
  onContinue,
}: RulesEditorProps): React.ReactElement {
  const existingRules = normalizedRules(idea.briefState.mustStayTrueRules);
  const [draftRules, setDraftRules] = useState<string[]>(existingRules.length > 0 ? [...existingRules] : ['']);
  const [persisting, setPersisting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const sourceLabel = source === 'workspace' ? 'Workspace' : 'Canvas';
  const stableDraft = normalizedRules(draftRules);
  const isDirty = rulesChanged(stableDraft, existingRules);
  const hasRules = existingRules.length > 0;
  const canPersist = !advancing && !persisting && isDirty;
  const canContinue = !advancing && !persisting && !isDirty && hasRules;

  useEffect(() => {
    setDraftRules(existingRules.length > 0 ? [...existingRules] : ['']);
  }, [idea.briefState.mustStayTrueRules]);

  function updateRule(index: number, value: string): void {
    setDraftRules(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeRule(index: number): void {
    setDraftRules(prev => prev.filter((_, idx) => idx !== index));
  }

  function addRule(): void {
    setDraftRules(prev => [...prev, '']);
  }

  async function handleSave(): Promise<void> {
    setPersisting(true);
    setSaveError(null);

    try {
      const nextRules = normalizedRules(draftRules);
      const committed = await boardController.updateIdea({
        ideaId: idea.id,
        patch: {
          briefState: {
            ...idea.briefState,
            mustStayTrueRules: nextRules,
          },
        },
        actor: { type: 'user', source },
        summary: `${sourceLabel} edited ${nextRules.length} must-stay-true rule${nextRules.length === 1 ? '' : 's'}`,
      });
      onUpdate(committed.idea);
      setDraftRules(nextRules.length > 0 ? [...nextRules] : ['']);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save rules.');
    } finally {
      setPersisting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
        <p className="text-sm font-semibold text-slate-800">Must-stay-true rules</p>
        <p className="mt-1 text-xs text-slate-600">
          Review generated rules here, and edit before you proceed. Rules should stay concise and actionable.
        </p>
      </div>

      {draftRules.length === 0 ? (
        <p className="rounded-xl bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          No rules recorded yet. Add one manually or use AI extraction.
        </p>
      ) : (
        <div className="space-y-2">
          {draftRules.map((rule, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Rule {index + 1}
              </label>
              <textarea
                rows={2}
                value={rule}
                onChange={event => updateRule(index, event.target.value)}
                className="w-full resize-y rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g., Never store credentials in plain text."
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { removeRule(index); }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={addRule}
          disabled={advancing || persisting}
        >
          Add rule
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onGenerate}
          disabled={advancing || persisting}
        >
          {advancing ? 'Generating rules…' : 'Generate via AI'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!canPersist}
        >
          {persisting ? 'Saving…' : 'Save rules'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void onContinue();
          }}
          disabled={!canContinue}
        >
          {advancing ? 'Moving on…' : 'Continue to next step'}
        </Button>
      </div>

      {(extractError || saveError) && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
          {extractError ?? saveError}
        </p>
      )}

      {!hasRules && !advancing && !isDirty && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Add at least one rule before continuing.
        </p>
      )}
    </div>
  );
}
