/**
 * RiskRegister — canvas-friendly risk state with inline follow-up notes.
 *
 * Interaction: each risk row supports inline editing of description, likelihood,
 * impact, and a user follow-up note. All edits persist directly into briefState.risks.
 */
import React, { useState } from 'react';
import type { Idea, RiskItem, Severity } from '../types';
import Button from '../ui/Button';

type SeverityValue = Severity;

interface RiskRegisterProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

const SEVERITY_OPTIONS: SeverityValue[] = ['low', 'medium', 'high'];
const SEVERITY_CLASS: Record<SeverityValue, string> = {
  low: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  medium: 'bg-amber-50 border-amber-200 text-amber-800',
  high: 'bg-rose-50 border-rose-200 text-rose-800',
};

export default function RiskRegister({ idea, onUpdate }: RiskRegisterProps): React.ReactElement {
  const risks = idea.briefState.risks;
  const highPriority = risks.filter(r => r.likelihood === 'high' || r.impact === 'high').length;

  function patchRisk(id: string, patch: Partial<RiskItem>): void {
    const now = Date.now();
    const next = risks.map(r => (r.id === id ? { ...r, ...patch, updatedAt: now } : r));
    onUpdate({ ...idea, briefState: { ...idea.briefState, risks: next } });
  }

  if (risks.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No risks recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-700">
        {highPriority > 0 && (
          <p className="font-semibold text-rose-700">{highPriority} high-priority risk{highPriority !== 1 ? 's' : ''}</p>
        )}
      </div>

      <div className="space-y-2">
        {risks.map(risk => (
          <RiskRow
            key={risk.id}
            risk={risk}
            onPatch={patchRisk}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

interface RiskRowProps {
  risk: RiskItem;
  onPatch: (riskId: string, patch: Partial<RiskItem>) => void;
}

function RiskRow({ risk, onPatch }: RiskRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(risk.description);
  const [draftLikelihood, setDraftLikelihood] = useState<Severity>(risk.likelihood);
  const [draftImpact, setDraftImpact] = useState<Severity>(risk.impact);
  const [draftUserNote, setDraftUserNote] = useState(risk.userNote ?? '');

  const panelClass = SEVERITY_CLASS[risk.impact];

  function applyPatch() {
    onPatch(risk.id, {
      description: draftDescription.trim() || risk.description,
      likelihood: draftLikelihood,
      impact: draftImpact,
      userNote: draftUserNote.trim() || undefined,
    });
    setEditing(false);
  }

  function cancel() {
    setDraftDescription(risk.description);
    setDraftLikelihood(risk.likelihood);
    setDraftImpact(risk.impact);
    setDraftUserNote(risk.userNote ?? '');
    setEditing(false);
  }

  return (
    <div className={`rounded-lg border-2 ${panelClass} p-3 space-y-2`}>
      {risk.sourceQuestion && (
        <p className="text-[11px] uppercase tracking-wide text-gray-600">{risk.sourceQuestion}</p>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draftDescription}
            onChange={e => setDraftDescription(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Risk description"
          />

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
            <label className="space-y-1 block">
              <p>Likelihood</p>
              <select
                value={draftLikelihood}
                onChange={e => setDraftLikelihood(e.target.value as Severity)}
                className="w-full rounded border border-gray-300 px-2 py-1 bg-white"
              >
                {SEVERITY_OPTIONS.map(severity => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <p>Impact</p>
              <select
                value={draftImpact}
                onChange={e => setDraftImpact(e.target.value as Severity)}
                className="w-full rounded border border-gray-300 px-2 py-1 bg-white"
              >
                {SEVERITY_OPTIONS.map(severity => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <textarea
            value={draftUserNote}
            onChange={e => setDraftUserNote(e.target.value)}
            rows={2}
            placeholder="Follow-up note: mitigation, owner, deadline, etc."
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Risk follow-up note"
          />

          <div className="flex gap-1">
            <Button variant="primary" size="sm" onClick={applyPatch}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm text-gray-900 leading-snug">
            {risk.description}
          </p>
          <p className="text-xs text-gray-700">
            Likelihood: <span className="font-semibold">{risk.likelihood}</span> ·
            Impact: <span className="font-semibold">{risk.impact}</span>
          </p>
          {risk.userNote && (
            <p className="text-xs italic text-gray-700 bg-white/70 rounded px-2 py-1">
              {risk.userNote}
            </p>
          )}
        </div>
      )}

      {!editing && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}
