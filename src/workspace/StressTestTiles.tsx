/**
 * StressTestTiles — edge-case stress tests grouped by rule.
 *
 * Interaction: each tile shows an edge case + break mode for a specific rule.
 * User toggles "handled" to mark the concern addressed, optionally captures
 * how it was handled.
 */

import React, { useState } from 'react';
import type { Idea, StressResult } from '../types';
import Button from '../ui/Button';

interface StressTestTilesProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

export default function StressTestTiles({ idea, onUpdate }: StressTestTilesProps): React.ReactElement {
  const stressResults = idea.briefState.stressResults;
  const rules = idea.briefState.mustStayTrueRules;

  function patch(id: string, p: Partial<StressResult>): void {
    const next = stressResults.map(s => (s.id === id ? { ...s, ...p } : s));
    onUpdate({ ...idea, briefState: { ...idea.briefState, stressResults: next } });
  }

  if (stressResults.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No stress tests yet. Run this step to see how each rule might break.
      </p>
    );
  }

  // Group by ruleIndex
  const byRule = new Map<number, StressResult[]>();
  for (const sr of stressResults) {
    const list = byRule.get(sr.ruleIndex) ?? [];
    list.push(sr);
    byRule.set(sr.ruleIndex, list);
  }

  const handled = stressResults.filter(s => s.handled).length;
  const total = stressResults.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-600">Handled: </span>
        <span className="font-semibold text-gray-800">{handled}/{total}</span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: total === 0 ? '0%' : `${(handled / total) * 100}%` }}
          />
        </div>
      </div>

      {Array.from(byRule.entries()).sort(([a], [b]) => a - b).map(([ruleIdx, results]) => (
        <div key={ruleIdx} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-[10px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 mt-0.5">
              RULE {ruleIdx + 1}
            </span>
            <p className="text-xs font-medium text-gray-800 leading-snug">
              {rules[ruleIdx] ?? <em>(rule removed — orphaned stress test)</em>}
            </p>
          </div>

          <div className="space-y-2 pt-1 border-t border-gray-100">
            {results.map(sr => (
              <StressTile
                key={sr.id}
                result={sr}
                onToggle={() => patch(sr.id, { handled: !sr.handled })}
                onResponse={r => patch(sr.id, { userResponse: r })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single stress tile
// ---------------------------------------------------------------------------

interface StressTileProps {
  result: StressResult;
  onToggle: () => void;
  onResponse: (r: string) => void;
}

function StressTile({ result, onToggle, onResponse }: StressTileProps): React.ReactElement {
  const [respondOpen, setRespondOpen] = useState(false);
  const [draft, setDraft] = useState(result.userResponse ?? '');

  return (
    <div className={`rounded border p-2 space-y-1 ${result.handled ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={result.handled}
          onChange={onToggle}
          className="mt-0.5 accent-emerald-500"
          aria-label="Mark as handled"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 leading-snug">
            <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 mr-1.5">
              Edge case:
            </span>
            {result.edgeCase}
          </p>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">
            <span className="font-semibold text-gray-700">Break mode: </span>
            {result.breakMode}
          </p>
        </div>
      </div>

      {result.userResponse && !respondOpen && (
        <p className="text-xs italic text-emerald-800 bg-white/80 rounded px-2 py-1 ml-6">
          <span className="font-semibold">How we handle it: </span>
          {result.userResponse}
        </p>
      )}

      {respondOpen && (
        <div className="ml-6 space-y-1">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            placeholder="How does the design handle this edge case?"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Your response"
          />
          <div className="flex gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => { onResponse(draft.trim()); setRespondOpen(false); }}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRespondOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!respondOpen && (
        <div className="ml-6">
          <Button variant="ghost" size="sm" onClick={() => setRespondOpen(true)}>
            {result.userResponse ? 'Edit response' : 'Add response'}
          </Button>
        </div>
      )}
    </div>
  );
}
