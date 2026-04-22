/**
 * Graceful-degradation fallback for Phase 3 (Approach Synthesis).
 * When the LLM cannot produce structured Approach objects, the user fills
 * 3 blank approach templates manually.
 */
import React, { useState } from 'react';
import type { Approach, Idea } from '../../types';
import { createBoardController } from '../../storage/boardController';
import Button from '../../ui/Button';

const SCORE_DIMENSIONS: { key: keyof Approach['scores']; label: string; description: string }[] = [
  { key: 'speed', label: 'Speed', description: 'How quickly can it be delivered?' },
  { key: 'cost', label: 'Cost', description: 'Estimated cost relative to budget' },
  { key: 'complexity', label: 'Complexity', description: 'Implementation complexity' },
  { key: 'maintainability', label: 'Maintainability', description: 'Long-term upkeep burden' },
  { key: 'teamBurden', label: 'Team Burden', description: 'Ongoing load on the team' },
  { key: 'userValue', label: 'User Value', description: 'Value delivered to end users' },
  { key: 'operationalLoad', label: 'Operational Load', description: 'Day-to-day ops effort' },
  { key: 'adoptionRisk', label: 'Adoption Risk', description: 'Risk users won\'t adopt it' },
  { key: 'reversibility', label: 'Reversibility', description: 'Ease of rolling back' },
  { key: 'complianceRisk', label: 'Compliance Risk', description: 'Regulatory or legal exposure' },
];

type ScoreMap = Approach['scores'];

function defaultScores(): ScoreMap {
  return {
    speed: 5,
    cost: 5,
    complexity: 5,
    maintainability: 5,
    teamBurden: 5,
    userValue: 5,
    operationalLoad: 5,
    adoptionRisk: 5,
    reversibility: 5,
    complianceRisk: 5,
  };
}

interface ApproachDraft {
  label: string;
  summary: string;
  scores: ScoreMap;
}

function defaultDraft(n: number): ApproachDraft {
  return { label: `Approach ${n}`, summary: '', scores: defaultScores() };
}

interface ApproachTemplateProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

export default function ApproachTemplate({ idea, onUpdate }: ApproachTemplateProps): React.ReactElement {
  const [drafts, setDrafts] = useState<ApproachDraft[]>([
    defaultDraft(1),
    defaultDraft(2),
    defaultDraft(3),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraftField(idx: number, field: 'label' | 'summary', value: string) {
    setDrafts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function updateScore(idx: number, dim: keyof ScoreMap, value: number) {
    setDrafts(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        scores: { ...next[idx].scores, [dim]: value },
      };
      return next;
    });
  }

  async function handleSubmit() {
    const filled = drafts.filter(d => d.label.trim() && d.summary.trim());
    if (filled.length === 0) {
      setError('Fill in at least one approach (label + summary) before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const approaches: Approach[] = filled.map(d => ({
      id: crypto.randomUUID(),
      label: d.label.trim(),
      summary: d.summary.trim(),
      scores: d.scores,
    }));

    try {
      const boardController = createBoardController(idea.boardId ?? 'local-board');
      const committed = await boardController.updateIdea({
        ideaId: idea.id,
        patch: {
          briefState: {
            ...idea.briefState,
            approaches: [...idea.briefState.approaches, ...approaches],
          },
          readiness: 'yellow', // fallback path — not AI-reviewed
        },
        actor: { type: 'user', source: 'workspace' },
        summary: `Added ${approaches.length} fallback approaches to idea ${idea.id}`,
      });
      onUpdate(committed.idea);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save approaches.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-800">
        <strong>Fallback mode:</strong> The AI couldn't generate approaches automatically.
        Fill in up to 3 approaches below — the more detail you provide, the better the next phases will work.
      </div>

      {drafts.map((draft, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Approach {idx + 1}</h3>

          <div className="space-y-1">
            <label htmlFor={`approach-label-${idx}`} className="block text-xs font-medium text-gray-700">
              Label / Name
            </label>
            <input
              id={`approach-label-${idx}`}
              type="text"
              value={draft.label}
              onChange={e => updateDraftField(idx, 'label', e.target.value)}
              placeholder={`e.g. "Minimal MVP", "Full Integration", "No-Code Solution"`}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={`approach-summary-${idx}`} className="block text-xs font-medium text-gray-700">
              Summary
            </label>
            <textarea
              id={`approach-summary-${idx}`}
              rows={3}
              value={draft.summary}
              onChange={e => updateDraftField(idx, 'summary', e.target.value)}
              placeholder="Describe this approach in 2–4 sentences…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">
              Dimension Scores{' '}
              <span className="font-normal text-gray-400">(1 = worst · 10 = best)</span>
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SCORE_DIMENSIONS.map(dim => (
                <div key={dim.key} className="flex items-center gap-3">
                  <label
                    htmlFor={`score-${idx}-${dim.key}`}
                    className="text-xs text-gray-700 w-36 shrink-0"
                    title={dim.description}
                  >
                    {dim.label}
                  </label>
                  <input
                    id={`score-${idx}-${dim.key}`}
                    type="range"
                    min={1}
                    max={10}
                    value={draft.scores[dim.key]}
                    onChange={e => updateScore(idx, dim.key, Number(e.target.value))}
                    className="flex-1 accent-violet-600"
                    aria-label={`${dim.label} score for approach ${idx + 1}`}
                  />
                  <span className="text-xs text-gray-500 w-5 text-right tabular-nums">
                    {draft.scores[dim.key]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? 'Saving…' : 'Submit Approaches'}
      </Button>
    </div>
  );
}
