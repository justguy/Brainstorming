import React, { useEffect, useRef } from 'react';
import type { Idea } from '../types';
import { questionsForAmbiguity, useAmbiguityResolutionFlow } from './useAmbiguityResolutionFlow';

interface AmbiguityResolutionPanelProps {
  idea: Idea;
  onIdeaUpdate: (updated: Idea) => void;
  footer?: React.ReactNode;
  mode: 'ambiguity' | 'clarify';
}

export function AmbiguityResolutionPanel({
  idea,
  onIdeaUpdate,
  footer,
  mode,
}: AmbiguityResolutionPanelProps): React.ReactElement {
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  } = useAmbiguityResolutionFlow({ idea, onIdeaUpdate });

  useEffect(() => {
    if (!expandedId) return;
    window.setTimeout(() => {
      activeTextareaRef.current?.focus();
      const value = activeTextareaRef.current?.value ?? '';
      activeTextareaRef.current?.setSelectionRange(value.length, value.length);
    }, 0);
  }, [expandedId]);

  return (
    <div className="bo-ambiguity-panel-wrap">
      <div className="bo-ambiguity-panel">
        <div className="bo-ambiguity-panel__header">
          <p className="bo-ambiguity-panel__title">
            {mode === 'clarify' ? 'Resolve ambiguities before synthesis' : 'Ambiguities to resolve'}
          </p>
          <span className="bo-ambiguity-panel__count">
            {idea.ambiguities.length} item{idea.ambiguities.length === 1 ? '' : 's'}
          </span>
        </div>

        {ambiguities.length === 0 ? (
          <p className="bo-ambiguity-panel__empty">No explicit ambiguities recorded yet.</p>
        ) : (
          <div className="bo-ambiguity-panel__list">
            {ambiguities.map(ambiguity => {
              const resolutionStatus = ambiguity.resolution?.status ?? 'open';
              const linkedQuestions = questionsForAmbiguity(idea, ambiguity.id);
              const suggestion = suggestions[ambiguity.id];
              const isExpanded = expandedId === ambiguity.id;
              const isBusy = loadingSuggestionId === ambiguity.id || applyingId === ambiguity.id;

              return (
                <div key={ambiguity.id} className="bo-ambiguity-card">
                  <div className="bo-ambiguity-card__pills">
                    <Chip tone={`status-${resolutionStatus}`}>{resolutionStatus}</Chip>
                    <Chip tone={`severity-${ambiguity.severity}`}>{ambiguity.severity}</Chip>
                    <Chip tone={`mode-${ambiguity.resolutionMode}`}>{ambiguity.resolutionMode}</Chip>
                    <Chip tone={`type-${ambiguity.type}`}>{ambiguity.type}</Chip>
                  </div>
                  <p className="bo-ambiguity-card__question">{ambiguity.plainLanguage}</p>
                  {ambiguity.resolution?.note && (
                    <p className="bo-ambiguity-card__resolution">Resolution: {ambiguity.resolution.note}</p>
                  )}
                  {linkedQuestions.length > 0 && (
                    <div className="bo-ambiguity-card__linked">
                      {linkedQuestions.map(question => (
                        <span
                          key={question.id}
                          className="bo-ambiguity-card__linked-chip"
                          title={question.question}
                        >
                          {question.answer ? `Answered: ${question.question}` : question.question}
                        </span>
                      ))}
                    </div>
                  )}

                  {resolutionStatus === 'open' && (
                    <div className="bo-ambiguity-card__body">
                      {suggestion && (
                        <div className="bo-ambiguity-card__suggestion">
                          <div className="bo-ambiguity-card__pills">
                            <Chip tone="suggestion">LLM option</Chip>
                            <Chip tone="neutral">{suggestion.suggestionLabel}</Chip>
                            <Chip tone="neutral">{suggestion.suggestedStatus}</Chip>
                            <Chip tone="neutral">{suggestion.providerLabel}</Chip>
                          </div>
                          <p className="bo-ambiguity-card__suggestion-title">
                            {suggestion.suggestedResolution}
                          </p>
                          <p className="bo-ambiguity-card__suggestion-copy">{suggestion.rationale}</p>
                        </div>
                      )}

                      <div className="bo-ambiguity-card__actions">
                        {!suggestion && (
                          <button
                            type="button"
                            className="bo-ambiguity-card__button bo-ambiguity-card__button--primary"
                            onClick={() => {
                              void suggestResolution(ambiguity);
                            }}
                            disabled={isBusy}
                          >
                            {loadingSuggestionId === ambiguity.id ? 'Thinking…' : 'Suggest resolution'}
                          </button>
                        )}
                        {suggestion && (
                          <button
                            type="button"
                            className="bo-ambiguity-card__button bo-ambiguity-card__button--primary"
                            onClick={() => {
                              void applyResolution(ambiguity, 'suggested');
                            }}
                            disabled={isBusy}
                          >
                            {applyingId === ambiguity.id ? 'Applying…' : 'Use suggestion'}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`bo-ambiguity-card__button ${isExpanded ? 'bo-ambiguity-card__button--active' : 'bo-ambiguity-card__button--ghost'}`}
                          onClick={() => {
                            setExpandedId(isExpanded ? null : ambiguity.id);
                          }}
                          disabled={isBusy}
                        >
                          {isExpanded ? 'Hide custom input' : 'Write my own'}
                        </button>
                        <button
                          type="button"
                          className="bo-ambiguity-card__button bo-ambiguity-card__button--ghost"
                          onClick={() => {
                            void skipForNow(ambiguity);
                          }}
                          disabled={isBusy}
                        >
                          {applyingId === ambiguity.id ? 'Working…' : 'Skip for now'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="bo-ambiguity-card__draft">
                          <label htmlFor={`ambiguity-resolution-${ambiguity.id}`} className="bo-ambiguity-card__draft-label">
                            Custom resolution
                          </label>
                          <textarea
                            ref={isExpanded ? activeTextareaRef : null}
                            id={`ambiguity-resolution-${ambiguity.id}`}
                            rows={4}
                            value={customDrafts[ambiguity.id] ?? ''}
                            onChange={event => {
                              setCustomDraft(ambiguity.id, event.target.value);
                            }}
                            onPointerDown={event => {
                              event.stopPropagation();
                            }}
                            onClick={event => {
                              event.stopPropagation();
                            }}
                            onKeyDown={event => {
                              event.stopPropagation();
                            }}
                            placeholder={suggestion?.userInputPrompt ?? 'Write how this ambiguity should be resolved.'}
                            className="bo-ambiguity-card__textarea"
                          />
                          <div className="bo-ambiguity-card__actions">
                            <button
                              type="button"
                              className="bo-ambiguity-card__button bo-ambiguity-card__button--secondary"
                              onClick={() => {
                                void applyResolution(ambiguity, 'custom');
                              }}
                              disabled={isBusy || !(customDrafts[ambiguity.id] ?? '').trim()}
                            >
                              {applyingId === ambiguity.id ? 'Applying…' : 'Apply my resolution'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {errors[ambiguity.id] && (
                    <p className="bo-ambiguity-card__error" role="alert">
                      {errors[ambiguity.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}): React.ReactElement {
  return (
    <span className={`bo-ambiguity-pill bo-ambiguity-pill--${tone}`}>
      {children}
    </span>
  );
}
