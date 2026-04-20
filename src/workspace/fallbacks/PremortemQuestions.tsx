/**
 * Graceful-degradation fallback for Phase 4 (Premortem / Red Team).
 * When the LLM cannot produce structured RiskItems, the user fills these
 * 8 rigorous challenge questions manually.
 */
import React, { useState } from 'react';
import type { Idea, RiskItem, Severity } from '../../types';
import { createBoardController } from '../../storage/boardController';
import Button from '../../ui/Button';
import RiskRegister from '../RiskRegister';

const CHALLENGE_QUESTIONS: { id: string; question: string; hint: string }[] = [
  {
    id: 'q1',
    question: 'Where is this most likely to fail?',
    hint: 'Think about the riskiest assumption, dependency, or step in execution.',
  },
  {
    id: 'q2',
    question: 'What fragile assumptions are baked in?',
    hint: "List things that must be true for this to work, but you haven't verified.",
  },
  {
    id: 'q3',
    question: 'What critical dependencies could block or derail progress?',
    hint: 'External systems, teams, vendors, regulatory approvals, data sources.',
  },
  {
    id: 'q4',
    question: 'Where will users be confused or push back?',
    hint: 'Think about onboarding friction, mental model mismatches, or trust gaps.',
  },
  {
    id: 'q5',
    question: 'What is the operational burden after launch?',
    hint: 'Support load, maintenance, monitoring, incident response, upgrade paths.',
  },
  {
    id: 'q6',
    question: 'What would a well-resourced competitor do to undercut this?',
    hint: 'Price, speed, better integration, regulatory capture, distribution lock-in.',
  },
  {
    id: 'q7',
    question: 'What compliance, legal, or security exposure exists?',
    hint: 'Data residency, PII handling, licensing, accessibility, export controls.',
  },
  {
    id: 'q8',
    question: 'If this ships and immediately underperforms, what is the rollback plan?',
    hint: 'Can you revert? What data or commitments would be hard to undo?',
  },
];

function severityFromLength(answer: string): Severity {
  // Rough heuristic: longer, more detailed answers → higher concern
  const words = answer.trim().split(/\s+/).length;
  if (words >= 30) return 'high';
  if (words >= 10) return 'medium';
  return 'low';
}

interface PremortemQuestionsProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

export default function PremortemQuestions({ idea, onUpdate }: PremortemQuestionsProps): React.ReactElement {
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(CHALLENGE_QUESTIONS.map(q => [q.id, ''])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRisks, setDraftRisks] = useState<RiskItem[] | null>(null);

  function handleChange(id: string, value: string) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  function buildDraftRisks(): RiskItem[] {
    const filled = CHALLENGE_QUESTIONS.filter(q => answers[q.id].trim().length > 0);
    const timestamp = Date.now();
    return filled.map((q, idx) => {
      const answer = answers[q.id].trim();
      return {
        id: crypto.randomUUID(),
        description: answer,
        likelihood: severityFromLength(answer),
        impact: 'medium',
        sourceQuestionId: q.id,
        sourceQuestion: q.question,
        createdAt: timestamp + idx,
        updatedAt: timestamp + idx,
      };
    });
  }

  function handlePrepare() {
    const generated = buildDraftRisks();
    if (generated.length === 0) {
      setError('Answer at least one question before reviewing.');
      return;
    }

    setError(null);
    setDraftRisks([...idea.briefState.risks, ...generated]);
  }

  async function handleSubmit() {
    if (!draftRisks) return;

    setSubmitting(true);
    setError(null);

    try {
      const boardController = createBoardController(idea.boardId ?? 'local-board');
      const committed = await boardController.updateIdea({
        ideaId: idea.id,
        patch: {
          briefState: {
            ...idea.briefState,
            risks: draftRisks,
          },
          readiness: 'yellow', // fallback path — not AI-reviewed
        },
        actor: { type: 'user', source: 'workspace' },
        summary: `Updated risk register for idea ${idea.id}`,
      });
      onUpdate(committed.idea);
      setDraftRisks(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save answers.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetDraft() {
    setDraftRisks(null);
  }

  if (draftRisks) {
    const draftIdea: Idea = { ...idea, briefState: { ...idea.briefState, risks: draftRisks } };
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-800">
          <strong>Review mode:</strong> Edit risk likelihood, impact, and follow-up notes before saving.
        </div>
        <RiskRegister
          idea={draftIdea}
          onUpdate={updated => setDraftRisks(updated.briefState.risks)}
        />
        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={resetDraft}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? 'Saving…' : 'Save risk register'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-800">
        <strong>Fallback mode:</strong> The AI couldn't generate risk items automatically.
        Answer as many of the questions below as you can — your answers will be saved as risk items.
      </div>

      {CHALLENGE_QUESTIONS.map((q, idx) => (
        <div key={q.id} className="space-y-1">
          <label
            htmlFor={`premortem-${q.id}`}
            className="block text-sm font-medium text-gray-800"
          >
            {idx + 1}. {q.question}
          </label>
          <p className="text-xs text-gray-500">{q.hint}</p>
          <textarea
            id={`premortem-${q.id}`}
            rows={3}
            value={answers[q.id]}
            onChange={e => handleChange(q.id, e.target.value)}
            placeholder="Your answer…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
          />
        </div>
      ))}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        onClick={handlePrepare}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? 'Preparing…' : 'Review risk register'}
      </Button>
    </div>
  );
}
