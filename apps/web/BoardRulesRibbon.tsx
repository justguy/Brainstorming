import React, { useState } from 'react';
import type { Idea } from '../../src/types';
import { dispatchAndWait } from './webmcp-tools';

interface BoardRulesRibbonProps {
  idea: Idea | null;
  onOpenInspector?: () => void;
}

const MAX_VISIBLE_RULES = 5;

export function BoardRulesRibbon({
  idea,
  onOpenInspector,
}: BoardRulesRibbonProps): React.ReactElement {
  const [pendingRuleIndex, setPendingRuleIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!idea) {
    return <></>;
  }

  const currentIdea = idea;
  const rules = currentIdea.briefState.mustStayTrueRules;
  const visibleRules = rules.slice(0, MAX_VISIBLE_RULES);
  const overflowCount = Math.max(0, rules.length - visibleRules.length);

  async function handleRemoveRule(ruleIndex: number): Promise<void> {
    if (pendingRuleIndex !== null) return;
    setPendingRuleIndex(ruleIndex);
    setError(null);
    try {
      await dispatchAndWait(
        'brainstorm:remove_rule',
        { ideaId: currentIdea.id, ruleIndex },
        'Rule removed',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove rule.');
    } finally {
      setPendingRuleIndex(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 px-2 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Rules
        </p>
        <div className="flex items-center gap-2">
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-600"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          No must-stay-true rules yet for this note.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {visibleRules.map((rule, index) => (
            <span key={`${currentIdea.id}-rule-${index}`} className="flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
              <span className="max-w-[14rem] truncate">{rule}</span>
              <button
                type="button"
                onClick={() => {
                  void handleRemoveRule(index);
                }}
                disabled={pendingRuleIndex !== null}
                className="rounded-full px-1 text-[10px] text-emerald-700 transition hover:text-rose-700 disabled:opacity-50"
                aria-label={`Remove rule ${index + 1}`}
                title="Remove rule"
              >
                {pendingRuleIndex === index ? '…' : '×'}
              </button>
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="text-[10px] text-slate-500">+{overflowCount} more</span>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
