import React, { useEffect, useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { deriveIdeaBeadState, type DerivedBeadStatus } from '../orchestrator/beadState';
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
import { findLatestPhaseRun } from './phaseRunTrace';
import { AmbiguityResolutionPanel } from './AmbiguityResolutionPanel';

export interface WorkspaceActiveFlowProps {
  idea: Idea;
  onUpdate?: (updated: Idea) => void;
  source?: 'canvas' | 'workspace';
  ambiguityPresentation?: 'full' | 'summary';
}

export function WorkspaceActiveFlow({
  idea: initialIdea,
  onUpdate,
  source = 'canvas',
  ambiguityPresentation = 'full',
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
  const beadState = deriveIdeaBeadState(idea);
  const activeBeadIndex = beadState.beads.findIndex(bead => bead.status === 'active');
  const completedBeadCount = beadState.beads.filter(bead => bead.status === 'completed').length;
  const processIndex = activeBeadIndex >= 0 ? activeBeadIndex + 1 : Math.max(0, completedBeadCount);
  const processLabel = activeBeadIndex >= 0
    ? beadState.beads[activeBeadIndex]?.shortLabel
    : completedBeadCount >= beadState.beads.length
      ? 'done'
      : 'queued';
  const activeArtifact = idea.artifactMd && activeSpec?.kind === 'main'
    ? extractPhaseSection(idea.artifactMd, Math.floor(currentPhase))
    : null;
  const latestRun = findLatestPhaseRun(idea.turnLog);
  const latestRunIsAmbiguity = latestRun ? isAmbiguityRun(latestRun) : false;
  const isAmbiguitySurface = activeSpec?.componentKey === 'ambiguity' || activeSpec?.componentKey === 'clarify';

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
        summary: skip
          ? `${sourceLabel} skipped ${activeSpec?.label ?? `step ${currentPhase}`}`
          : `${sourceLabel} ran ${activeSpec?.label ?? `step ${currentPhase}`}`,
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
    if (ambiguityPresentation === 'summary') {
      const openCount = idea.ambiguities.filter(entry => (entry.resolution?.status ?? 'open') !== 'resolved').length;
      return (
        <div className="bo-process-card__artifact">
          <p className="bo-process-card__eyebrow bo-process-card__eyebrow--accent">
            On-board questions
          </p>
          <h4 className="bo-process-card__title">{openCount} clarification prompt{openCount === 1 ? '' : 's'} pinned on the board</h4>
          <p className="bo-process-card__copy">
            Use the handwritten callout next to this note to answer one item at a time, let Bot draft both, or skip for now without losing the thread.
          </p>
        </div>
      );
    }
    return (
      <AmbiguityResolutionPanel
        idea={idea}
        onIdeaUpdate={handleIdeaUpdate}
        mode={activeSpec?.componentKey === 'clarify' ? 'clarify' : 'ambiguity'}
        footer={renderAdvanceRow(primaryLabel)}
      />
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
      <div className="bo-process-card">
        <div className="bo-process-strip" aria-label={`Process progress ${processIndex} of ${beadState.beads.length}`}>
          <span className="bo-process-strip__label">Lifecycle</span>
          <div className="bo-process-strip__bar" aria-hidden="true">
            {beadState.beads.map(bead => (
              <span
                key={bead.id}
                className={processSegmentClassName(bead.status)}
                title={`${bead.shortLabel}: ${bead.summary}`}
              />
            ))}
          </div>
          <span className="bo-process-strip__summary">
            {processIndex} / {beadState.beads.length} · {processLabel ?? 'queued'}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bo-process-card__eyebrow">
                {activeSpec?.kind === 'micro' ? 'Micro step' : 'Active step'}
              </span>
              <span className="bo-process-card__eyebrow bo-process-card__eyebrow--muted">
                Step {currentPhase}
              </span>
              {idea.providerUsed && (
                <span className="bo-process-card__eyebrow bo-process-card__eyebrow--accent">
                  {idea.providerUsed}
                </span>
              )}
            </div>
            <h3 className="bo-process-card__title">{activeSpec?.label ?? 'Unknown step'}</h3>
            <p className="bo-process-card__copy">
              Keep the board visible while you move this idea forward. The inspector is only for deeper review.
            </p>
          </div>
          {activeArtifact && (
            <div className="bo-process-card__artifact">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="bo-process-card__eyebrow bo-process-card__eyebrow--muted">
                  Current artifact
                </p>
                <span className="bo-process-card__density">{density}</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <Markdown content={activeArtifact} density={density} />
              </div>
            </div>
          )}

          {latestRun && !isAmbiguitySurface && (
            <div className="bo-process-run">
              <div className="flex flex-wrap items-center gap-2">
                <p className="bo-process-card__eyebrow bo-process-card__eyebrow--accent">
                  Latest run
                </p>
                <span className="bo-process-run__chip">
                  {latestRun.phaseLabel}
                </span>
                <span className="bo-process-run__chip">
                  {latestRun.roleLabel}
                </span>
                <span className="bo-process-run__chip">
                  {latestRun.providerLabel}
                </span>
              </div>
              <p className="bo-process-run__summary">
                {latestRun.toolSummary}
              </p>
              {latestRunIsAmbiguity ? (
                <div className="bo-process-run__ambiguities">
                  <p className="bo-process-run__ambiguities-copy">
                    {idea.ambiguities.length > 0
                      ? `${idea.ambiguities.length} ambiguity${idea.ambiguities.length === 1 ? '' : 'ies'} surfaced in the last run.`
                      : 'The last run checked for ambiguities, but no open ambiguity items are stored on this note.'}
                  </p>
                  {idea.ambiguities.length > 0 && (
                    <div className="bo-process-run__ambiguity-list">
                      {idea.ambiguities.slice(0, 4).map(ambiguity => {
                        const status = ambiguity.resolution?.status ?? 'open';
                        return (
                          <div key={ambiguity.id} className="bo-process-run__ambiguity-item">
                            <div className="bo-process-run__ambiguity-chips">
                              <span className="bo-process-run__chip">{status}</span>
                              <span className="bo-process-run__chip">{ambiguity.severity}</span>
                              <span className="bo-process-run__chip">{ambiguity.resolutionMode}</span>
                              <span className="bo-process-run__chip">{ambiguity.type.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="bo-process-run__ambiguity-copy">{ambiguity.plainLanguage}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <pre className="bo-process-run__content">
                  {latestRun.content}
                </pre>
              )}
            </div>
          )}

          {renderActivePhaseInput()}
        </div>
      </div>

      <WorkspaceToolContextPanel idea={idea} onIdeaUpdate={handleIdeaUpdate} source={source} />
    </div>
  );
}

function processSegmentClassName(status: DerivedBeadStatus): string {
  const classMap: Record<DerivedBeadStatus, string> = {
    locked: 'bo-process-strip__segment',
    active: 'bo-process-strip__segment bo-process-strip__segment--active',
    completed: 'bo-process-strip__segment bo-process-strip__segment--done',
    needs_attention: 'bo-process-strip__segment bo-process-strip__segment--attention',
    soft_nudge: 'bo-process-strip__segment bo-process-strip__segment--nudge',
  };

  return classMap[status];
}

function isAmbiguityRun(latestRun: NonNullable<ReturnType<typeof findLatestPhaseRun>>): boolean {
  const phaseLabel = latestRun.phaseLabel.toLowerCase();
  const roleLabel = latestRun.roleLabel.toLowerCase();
  const content = latestRun.content.toLowerCase();
  return (
    phaseLabel.includes('ambiguity')
    || roleLabel.includes('ambiguity')
    || content.includes('"ambiguities"')
  );
}
