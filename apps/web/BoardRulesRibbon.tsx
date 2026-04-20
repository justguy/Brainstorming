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
    return (
      <div className="bo-rules-ribbon">
        <div className="bo-rules-ribbon__header">
          <p className="bo-shell-eyebrow">Rules</p>
          <span className="bo-rules-ribbon__meta">Select a note</span>
        </div>
      </div>
    );
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
    <div className="bo-rules-ribbon">
      <div className="bo-rules-ribbon__header">
        <p className="bo-shell-eyebrow">Rules</p>
        <div className="flex items-center gap-2">
          <span className="bo-rules-ribbon__meta">Lifecycle-backed</span>
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              className="bo-shell-action"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--bo-paper-ink-soft)]">
          No must-stay-true rules yet for this note.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {visibleRules.map((rule, index) => (
            <span key={`${currentIdea.id}-rule-${index}`} className="bo-rule-chip">
              <span className="truncate">{rule}</span>
              <button
                type="button"
                onClick={() => {
                  void handleRemoveRule(index);
                }}
                disabled={pendingRuleIndex !== null}
                className="bo-rule-chip__remove"
                aria-label={`Remove rule ${index + 1}`}
                title="Remove rule"
              >
                {pendingRuleIndex === index ? '…' : '×'}
              </button>
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="bo-rules-ribbon__meta">+{overflowCount} more</span>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
