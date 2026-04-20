import React, { useEffect, useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { advance } from '../orchestrator/stateMachine';
import { nextPhaseNumber } from '../orchestrator/subPhases';
import { getSettings } from '../storage/settings';
import { createBoardController } from '../storage/boardController';
import type { Density, Idea } from '../types';
import Button from '../ui/Button';
import ChallengesList from './ChallengesList';
import LensGrid from './LensGrid';
import { RiskReviewPanel } from './RiskReviewPanel';
import RulesEditor from './RulesEditor';
import { createLegacyWorkspaceAdapter, extractPhaseSection } from './legacyPhaseAdapter';
import Markdown from './markdown';
import ApproachTemplate from './fallbacks/ApproachTemplate';
import PremortemQuestions from './fallbacks/PremortemQuestions';
import StressTestTiles from './StressTestTiles';
import { WorkspaceToolContextPanel } from './WorkspaceToolContextPanel';

export interface WorkspaceActiveFlowProps {
  idea: Idea;
  onUpdate?: (updated: Idea) => void;
  source?: 'canvas' | 'workspace';
}

export function WorkspaceActiveFlow({
  idea: initialIdea,
  onUpdate,
  source = 'canvas',
}: WorkspaceActiveFlowProps): React.ReactElement {
  const [idea, setIdea] = useState<Idea>(initialIdea);
  const [userInput, setUserInput] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('standard');
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const phaseAdapter = createLegacyWorkspaceAdapter(idea);
  const { activeSpec, currentPhase, showFallback } = phaseAdapter;
  const sourceLabel = source === 'workspace' ? 'Workspace' : 'Canvas';
  const activeArtifact = idea.artifactMd && activeSpec?.kind === 'main'
    ? extractPhaseSection(idea.artifactMd, Math.floor(currentPhase))
    : null;

  useEffect(() => {
    setIdea(initialIdea);
    setUserInput('');
    setAdvanceError(null);
  }, [initialIdea]);

  useEffect(() => {
    getSettings().then(s => setDensity(s.density)).catch(() => {});
  }, []);

  function handleIdeaUpdate(updated: Idea): void {
    setIdea(updated);
    onUpdate?.(updated);
  }

  async function handleAdvance(skip = false): Promise<void> {
    setAdvancing(true);
    setAdvanceError(null);

    try {
      const updated = await advance(idea, userInput.trim(), skip);
      setUserInput('');
      await boardController.updateIdea({
        ideaId: updated.id,
        patch: updated,
        actor: { type: 'user', source },
        summary: skip ? `${sourceLabel} skipped advance` : `${sourceLabel} advanced idea`,
      });
      handleIdeaUpdate(updated);
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleRulesContinue(): Promise<void> {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const now = Date.now();
      const nextPhase = nextPhaseNumber(idea.phase);
      const committed = await boardController.updateIdea({
        ideaId: idea.id,
        patch: {
          phase: nextPhase,
          lastTurnAt: now,
          turnLog: [
            ...idea.turnLog,
            {
              role: 'system',
              content: `[Step ${activeSpec?.number ?? 3}] Confirmed must-stay-true rules on canvas`,
            },
          ],
        },
        actor: { type: 'user', source },
        summary: `${sourceLabel} confirmed rules and advanced`,
      });
      handleIdeaUpdate(committed.idea);
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : 'Failed to advance after rule review.');
    } finally {
      setAdvancing(false);
    }
  }

  function renderAdvanceRow(primaryLabel: string, skipLabel?: string): React.ReactNode {
    return (
      <div className="space-y-2">
        {advanceError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
            {advanceError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void handleAdvance(false);
            }}
            disabled={advancing}
          >
            {advancing ? 'Processing…' : primaryLabel}
          </Button>
          {skipLabel && activeSpec?.skippable && (
            <Button
              variant="ghost"
              onClick={() => {
                void handleAdvance(true);
              }}
              disabled={advancing}
              title="Move on without running the AI for this micro-step"
            >
              {skipLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  function renderAmbiguityState(primaryLabel: string): React.ReactNode {
    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Ambiguity state</p>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {idea.ambiguities.length} item{idea.ambiguities.length === 1 ? '' : 's'}
            </span>
          </div>
          {idea.ambiguities.length === 0 ? (
            <p className="text-sm text-slate-600">No explicit ambiguities recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {idea.ambiguities.map(ambiguity => {
                const resolutionStatus = ambiguity.resolution?.status ?? 'open';
                const linkedQuestions = idea.clarifications.filter(question => question.ambiguityId === ambiguity.id);
                return (
                  <div key={ambiguity.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                        {resolutionStatus}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                        {ambiguity.severity}
                      </span>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-800">
                        {ambiguity.resolutionMode}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-800">{ambiguity.plainLanguage}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{ambiguity.type}</p>
                    {ambiguity.resolution?.note && (
                      <p className="mt-2 text-xs text-slate-600">Note: {ambiguity.resolution.note}</p>
                    )}
                    {linkedQuestions.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {linkedQuestions.map(question => (
                          <p key={question.id}>
                            Clarification: {question.question}
                            {question.answer ? ` Answered: ${question.answer}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {renderAdvanceRow(primaryLabel)}
      </div>
    );
  }

  function renderActivePhaseInput(): React.ReactNode {
    if (!activeSpec) return null;

    if (showFallback && activeSpec.componentKey === 'premortem') {
      return <PremortemQuestions idea={idea} onUpdate={handleIdeaUpdate} />;
    }
    if (showFallback && activeSpec.componentKey === 'approach') {
      return <ApproachTemplate idea={idea} onUpdate={handleIdeaUpdate} />;
    }

    if (activeSpec.componentKey === 'lens') {
      return (
        <div className="space-y-3">
          <LensGrid idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow(activeSpec.role ? 'Surface more angles' : 'Continue', 'Skip this lens')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'challenge') {
      return (
        <div className="space-y-3">
          <ChallengesList idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow('Surface more challenges', 'Skip devils advocate')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'stress') {
      return (
        <div className="space-y-3">
          <RiskReviewPanel
            idea={idea}
            onUpdate={handleIdeaUpdate}
            source={source}
            emptyMessage="No risks recorded yet. Generate a premortem first, then refine the register while stress-testing the rules."
          />
          <StressTestTiles idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow('Generate more stress tests', 'Skip stress-test')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'premortem') {
      return (
        <div className="space-y-3">
          <RiskReviewPanel
            idea={idea}
            onUpdate={handleIdeaUpdate}
            source={source}
            emptyMessage="No risks recorded yet. Run the premortem to generate the risk register, then refine it here."
          />
          {renderAdvanceRow(idea.briefState.risks.length > 0 ? 'Refresh premortem' : 'Generate risk register')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'rules') {
      return (
        <RulesEditor
          idea={idea}
          onUpdate={handleIdeaUpdate}
          source={source}
          advancing={advancing}
          extractError={advanceError}
          onGenerate={() => {
            return handleAdvance(false);
          }}
          onContinue={() => {
            return handleRulesContinue();
          }}
        />
      );
    }
    if (activeSpec.componentKey === 'ambiguity') {
      return renderAmbiguityState('Detect ambiguities');
    }
    if (activeSpec.componentKey === 'clarify') {
      return renderAmbiguityState('Generate clarification questions');
    }

    if (activeSpec.expectsUserInput) {
      return (
        <div className="space-y-3">
          {activeSpec.componentKey === 'approach' && idea.clarifications.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              {idea.clarifications.map(question => (
                <div key={question.id} className="text-sm text-slate-700">
                  <p className="font-medium">{question.question}</p>
                  {question.answer && (
                    <p className="mt-0.5 text-xs italic text-slate-500">Answered: {question.answer}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <label htmlFor="board-phase-user-input" className="block text-sm font-medium text-slate-700">
            {activeSpec.componentKey === 'approach'
              ? 'Your answers to the clarification questions'
              : 'Your input for this step'}
          </label>
          <textarea
            id="board-phase-user-input"
            rows={5}
            value={userInput}
            onChange={event => setUserInput(event.target.value)}
            placeholder="Type your response here…"
            className="w-full resize-y rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {advanceError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
              {advanceError}
            </p>
          )}
          <Button
            variant="primary"
            onClick={() => {
              void handleAdvance(false);
            }}
            disabled={advancing || !userInput.trim()}
          >
            {advancing ? 'Processing…' : 'Submit'}
          </Button>
        </div>
      );
    }

    if (activeSpec.componentKey !== 'done') {
      return renderAdvanceRow('Run this step', activeSpec.skippable ? 'Skip this step' : undefined);
    }

    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        This idea is ready for handoff. Use the inspector if you want the full phase history or export.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
            {activeSpec?.kind === 'micro' ? 'Micro step' : 'Active step'}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Step {currentPhase} / 8
          </span>
          {idea.providerUsed && (
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              {idea.providerUsed}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{activeSpec?.label ?? 'Unknown step'}</h3>
            <p className="mt-1 text-sm leading-snug text-slate-600">
              Keep the board visible while you move this idea forward. The inspector is only for deeper review.
            </p>
          </div>
          {activeArtifact && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Current artifact
                </p>
                <span className="text-[11px] text-slate-400">{density}</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <Markdown content={activeArtifact} density={density} />
              </div>
            </div>
          )}

          {renderActivePhaseInput()}
        </div>
      </div>

      <WorkspaceToolContextPanel idea={idea} onIdeaUpdate={handleIdeaUpdate} source={source} />
    </div>
  );
}
