import React, { useEffect, useMemo, useState } from 'react';
import type { Ambiguity, Idea } from '../types';
import { createLegacyWorkspaceAdapter } from '../workspace/legacyPhaseAdapter';
import { questionsForAmbiguity, useAmbiguityResolutionFlow } from '../workspace/useAmbiguityResolutionFlow';
import { estimateBoardBounds } from './reactflow/flowProjection';

interface ClarificationBoardOverlayProps {
  ideas?: Idea[];
  selectedIdeaId: string | null;
  onIdeaUpdate: (updated: Idea) => void;
}

export function ClarificationBoardOverlay({
  ideas = [],
  selectedIdeaId,
  onIdeaUpdate,
}: ClarificationBoardOverlayProps): React.ReactElement | null {
  const idea = selectedIdeaId ? ideas.find(candidate => candidate.id === selectedIdeaId) ?? null : null;
  const activeSpec = idea ? createLegacyWorkspaceAdapter(idea).activeSpec : null;
  const isClarificationPhase = activeSpec?.componentKey === 'ambiguity' || activeSpec?.componentKey === 'clarify';

  const {
    ambiguities,
    suggestions,
    customDrafts,
    errors,
    loadingSuggestionId,
    applyingId,
    expandedId,
    setExpandedId,
    setCustomDraft,
    suggestResolution,
    applyResolution,
    skipForNow,
  } = useAmbiguityResolutionFlow({ idea: idea ?? EMPTY_IDEA, onIdeaUpdate });

  const visibleAmbiguities = useMemo(
    () => ambiguities.filter(ambiguity => (ambiguity.resolution?.status ?? 'open') !== 'resolved'),
    [ambiguities],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const firstOpen = visibleAmbiguities.find(entry => (entry.resolution?.status ?? 'open') === 'open')?.id
      ?? visibleAmbiguities[0]?.id
      ?? null;
    setActiveId(current => (
      current && visibleAmbiguities.some(entry => entry.id === current)
        ? current
        : firstOpen
    ));
  }, [visibleAmbiguities]);

  if (!idea || !idea.panel || !isClarificationPhase || visibleAmbiguities.length === 0) {
    return null;
  }
  const panel = idea.panel;

  const activeIndex = Math.max(0, visibleAmbiguities.findIndex(entry => entry.id === activeId));
  const activeAmbiguity = visibleAmbiguities[activeIndex] ?? visibleAmbiguities[0];
  if (!activeAmbiguity) return null;

  const boardBounds = estimateBoardBounds(ideas);
  const linkedQuestions = questionsForAmbiguity(idea, activeAmbiguity.id);
  const suggestion = suggestions[activeAmbiguity.id];
  const isBusy = loadingSuggestionId === activeAmbiguity.id || applyingId === activeAmbiguity.id;
  const isDraftOpen = expandedId === activeAmbiguity.id;
  const bubbleWidth = 330;
  const bubbleHeight = 320;
  const bubbleSide = panel.x + panel.width + bubbleWidth + 80 < boardBounds.width ? 'right' : 'left';
  const pinColumnX = bubbleSide === 'right'
    ? panel.x + panel.width + 22
    : Math.max(12, panel.x - 42);
  const qstripLeft = clamp(panel.x - 4, 12, Math.max(12, boardBounds.width - 250));
  const qstripTop = Math.max(12, panel.y - 58);
  const bubbleLeft = bubbleSide === 'right'
    ? pinColumnX + 42
    : Math.max(12, pinColumnX - bubbleWidth - 24);
  const bubbleTop = clamp(panel.y - 4, 18, Math.max(18, boardBounds.height - bubbleHeight - 24));
  const activePin = pinPosition(activeIndex, pinColumnX, panel.y + 18);
  const lineBounds = inkLineBounds(
    bubbleSide === 'right' ? bubbleLeft : bubbleLeft + bubbleWidth,
    bubbleTop + 48,
    activePin.x + 16,
    activePin.y + 16,
  );

  return (
    <>
      <div
        className="bo-clarify-queue"
        style={{ left: qstripLeft, top: qstripTop }}
      >
        <span className="bo-clarify-queue__label">Clarifications</span>
        <div className="bo-clarify-queue__bar" aria-hidden="true">
          {visibleAmbiguities.map((ambiguity, index) => {
            const status = ambiguity.resolution?.status ?? 'open';
            const segmentClassName = [
              'bo-clarify-queue__segment',
              status === 'resolved' ? 'bo-clarify-queue__segment--done' : '',
              ambiguity.id === activeAmbiguity.id ? 'bo-clarify-queue__segment--active' : '',
            ].filter(Boolean).join(' ');
            return <span key={ambiguity.id} className={segmentClassName} />;
          })}
        </div>
        <span className="bo-clarify-queue__count">
          {activeIndex + 1} / {visibleAmbiguities.length}
        </span>
      </div>

        {visibleAmbiguities.map((ambiguity, index) => {
          const status = ambiguity.resolution?.status ?? 'open';
          const position = pinPosition(index, pinColumnX, panel.y + 18);
          const isActive = ambiguity.id === activeAmbiguity.id;
          return (
          <button
            key={ambiguity.id}
            type="button"
            className={`bo-clarify-pin ${isActive ? 'bo-clarify-pin--active' : ''} ${status === 'deferred' ? 'bo-clarify-pin--deferred' : ''}`}
            style={{ left: position.x, top: position.y }}
            onClick={() => setActiveId(ambiguity.id)}
            title={ambiguity.plainLanguage}
          >
            ?
            <span className="bo-clarify-pin__num">{index + 1}</span>
          </button>
        );
      })}

      <svg
        className="bo-clarify-ink"
        style={{
          left: lineBounds.left,
          top: lineBounds.top,
          width: lineBounds.width,
          height: lineBounds.height,
        }}
        viewBox={`0 0 ${lineBounds.width} ${lineBounds.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={lineBounds.path}
          fill="none"
          stroke="rgba(42, 37, 32, 0.82)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="6 5"
        />
      </svg>

      <div
        className="bo-clarify-bubble"
        style={{ left: bubbleLeft, top: bubbleTop }}
      >
        <div className="bo-clarify-bubble__who">
          <span className="bo-clarify-bubble__avatar" aria-hidden="true" />
          <span>DEV · BOT</span>
        </div>
        <p className="bo-clarify-bubble__question">
          {activeAmbiguity.plainLanguage}
        </p>
        <p className="bo-clarify-bubble__why">
          <strong>Why I&apos;m asking:</strong> {whyThisBlocks(activeAmbiguity, activeSpec?.componentKey === 'clarify' ? 'clarify' : 'ambiguity')}
        </p>

        {linkedQuestions.length > 0 && (
          <p className="bo-clarify-bubble__linkage">
            {linkedQuestions.filter(question => question.answer?.trim()).length} / {linkedQuestions.length} answers captured for this thread.
          </p>
        )}

        {suggestion && (
          <div className="bo-clarify-bubble__draft">
            <span className="bo-clarify-bubble__draft-meta">{suggestion.providerLabel}</span>
            <p className="bo-clarify-bubble__draft-copy">{suggestion.suggestedResolution}</p>
            <p className="bo-clarify-bubble__draft-why">{suggestion.rationale}</p>
          </div>
        )}

        {isDraftOpen && (
          <div className="bo-clarify-bubble__answer-box">
            <label htmlFor={`clarify-answer-${activeAmbiguity.id}`} className="bo-clarify-bubble__answer-label">
              Your answer
            </label>
            <textarea
              id={`clarify-answer-${activeAmbiguity.id}`}
              rows={4}
              value={customDrafts[activeAmbiguity.id] ?? ''}
              onChange={event => setCustomDraft(activeAmbiguity.id, event.target.value)}
              placeholder={suggestion?.userInputPrompt ?? 'Answer this one directly, then apply it to the note.'}
              className="bo-clarify-bubble__answer-input"
            />
          </div>
        )}

        {errors[activeAmbiguity.id] && (
          <p className="bo-clarify-bubble__error" role="alert">
            {errors[activeAmbiguity.id]}
          </p>
        )}

        <div className="bo-clarify-bubble__actions">
          {suggestion ? (
            <button
              type="button"
              className="bo-clarify-bubble__btn bo-clarify-bubble__btn--primary"
              onClick={() => { void applyResolution(activeAmbiguity, 'suggested'); }}
              disabled={isBusy}
            >
              {applyingId === activeAmbiguity.id ? 'applying…' : 'use AI draft'}
            </button>
          ) : (
            <button
              type="button"
              className="bo-clarify-bubble__btn bo-clarify-bubble__btn--primary"
              onClick={() => setExpandedId(isDraftOpen ? null : activeAmbiguity.id)}
              disabled={isBusy}
            >
              answer →
            </button>
          )}
          <button
            type="button"
            className="bo-clarify-bubble__btn"
            onClick={() => {
              if (suggestion) {
                setExpandedId(isDraftOpen ? null : activeAmbiguity.id);
                return;
              }
              void suggestResolution(activeAmbiguity);
            }}
            disabled={isBusy}
          >
            {suggestion ? 'answer myself' : loadingSuggestionId === activeAmbiguity.id ? 'drafting…' : 'let AI draft both'}
          </button>
          <button
            type="button"
            className="bo-clarify-bubble__btn bo-clarify-bubble__btn--ghost"
            onClick={() => { void skipForNow(activeAmbiguity); }}
            disabled={isBusy}
          >
            {applyingId === activeAmbiguity.id ? 'working…' : 'skip for now'}
          </button>
          {isDraftOpen && (
            <button
              type="button"
              className="bo-clarify-bubble__btn"
              onClick={() => { void applyResolution(activeAmbiguity, 'custom'); }}
              disabled={isBusy || !(customDrafts[activeAmbiguity.id] ?? '').trim()}
            >
              {applyingId === activeAmbiguity.id ? 'applying…' : 'apply my answer'}
            </button>
          )}
        </div>

        <div className="bo-clarify-bubble__foot">
          <span>{footerLabel(activeAmbiguity, activeSpec?.componentKey === 'clarify' ? 'clarify' : 'ambiguity')}</span>
          <div className="bo-clarify-bubble__nav">
            <button
              type="button"
              onClick={() => setActiveId(visibleAmbiguities[(activeIndex - 1 + visibleAmbiguities.length) % visibleAmbiguities.length]?.id ?? activeAmbiguity.id)}
            >
              ← prev
            </button>
            <button
              type="button"
              onClick={() => setActiveId(visibleAmbiguities[(activeIndex + 1) % visibleAmbiguities.length]?.id ?? activeAmbiguity.id)}
            >
              next →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const EMPTY_IDEA: Idea = {
  id: '__empty__',
  rawText: '',
  status: 'captured',
  phase: 0,
  readiness: 'red',
  tags: [],
  turnLog: [],
  ambiguities: [],
  clarifications: [],
  briefState: {
    mustStayTrueRules: [],
    approaches: [],
    rejectedApproaches: [],
    risks: [],
    successCriteria: [],
    outOfScope: [],
    openQuestions: [],
    lenses: [],
    challenges: [],
    stressResults: [],
  },
  createdAt: 0,
  updatedAt: 0,
};

function pinPosition(index: number, x: number, baseY: number): { x: number; y: number } {
  return { x, y: baseY + index * 38 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function inkLineBounds(x1: number, y1: number, x2: number, y2: number): {
  left: number;
  top: number;
  width: number;
  height: number;
  path: string;
} {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.max(1, Math.abs(x2 - x1));
  const height = Math.max(1, Math.abs(y2 - y1));
  const sx = x1 - left;
  const sy = y1 - top;
  const tx = x2 - left;
  const ty = y2 - top;
  const cx = sx + (tx - sx) * 0.48;
  const cy = sy + (ty - sy) * 0.08;
  return {
    left,
    top,
    width,
    height,
    path: `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`,
  };
}

function whyThisBlocks(ambiguity: Ambiguity, mode: 'ambiguity' | 'clarify'): string {
  const reasonByType: Partial<Record<Ambiguity['type'], string>> = {
    audience: 'the answer changes who this note is actually serving, which changes the review standard and the next artifacts.',
    scope: 'the board can’t move cleanly if the action boundary is still fuzzy.',
    integration: 'the implementation path changes once we know what needs to trigger or receive this action.',
    data_process: 'we need to know where the explanation comes from before we can trust or document it.',
    ux: 'the handoff changes once we know where a person sees and acts on this recommendation.',
    ownership: 'someone has to carry this decision, or it will stall after synthesis.',
  };
  const severityPrefix = ambiguity.severity === 'high' ? 'This blocks the next move because ' : 'This matters because ';
  const modeSuffix = mode === 'clarify'
    ? 'We should settle it before synthesis.'
    : 'We should settle it before we widen the note.';
  return `${severityPrefix}${reasonByType[ambiguity.type] ?? 'this uncertainty changes what the board should do next.'} ${modeSuffix}`;
}

function footerLabel(ambiguity: Ambiguity, mode: 'ambiguity' | 'clarify'): string {
  const priority = ambiguity.severity === 'high' ? 'high priority' : ambiguity.severity === 'medium' ? 'medium priority' : 'low priority';
  const blocker = mode === 'clarify' ? 'blocks synthesis' : 'blocks shaping';
  return `${priority} · ${blocker}`;
}
