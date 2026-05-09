import { useEffect } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { Idea } from '../../src/types';
import { IdeaConversation } from './IdeaConversation';
import type {
  ConversationTurn,
  NeighborIdea,
  PhaseStep,
} from './ideaConversationTypes';

interface BoardThumbnailIdea {
  id: string;
  x: number;
  y: number;
  tone: string;
  isSelf: boolean;
}

interface FocusArtifact {
  id: string;
  label: string;
  icon: '📎' | '🔗' | '+' | '⊕';
}

export interface IdeaFocusOverlayProps {
  idea: Idea;
  conversation: ConversationTurn[];
  phases: PhaseStep[];
  neighbors: NeighborIdea[];
  artifacts: FocusArtifact[];
  showGuidance: boolean;
  onClose: () => void;
  onDemoteToBloom: () => void;
  onJumpToPhase: (phaseNumber: number) => void;
  onPickOption: (optionKey: string) => void;
  onConfirmAdvance: () => void;
  onStay: () => void;
  onSkip: () => void;
  onJumpToIdea: (ideaId: string) => void;
  onJumpToBoardThumbnail: () => void;
  boardThumbnailIdeas?: BoardThumbnailIdea[];
  /**
   * bo-162 — invoked when the user picks "Promote to principle" from the
   * quick-actions rail. Returns `true` if the principle was added (the
   * overlay shows lightweight feedback in either case).
   */
  onPromoteToPrinciple?: () => Promise<boolean> | boolean;
}

interface FocusHeadingProps {
  idea: Idea;
}

function FocusHeading({ idea }: FocusHeadingProps): JSX.Element {
  const title = (idea.rawText || 'Untitled idea').trim();
  return <h3 className="bo-focus__title">{title}</h3>;
}

function phaseClass(phase: PhaseStep): string {
  const tokens: string[] = ['bo-focus__phase'];
  if (phase.status === 'done') tokens.push('bo-focus__phase--done');
  if (phase.status === 'active') tokens.push('bo-focus__phase--active');
  if (phase.status === 'queued') tokens.push('bo-focus__phase--queued');
  if (phase.status === 'locked') tokens.push('bo-focus__phase--locked');
  if (phase.optional) tokens.push('bo-focus__phase--optional');
  return tokens.join(' ');
}

function activePhaseNumber(phases: PhaseStep[]): number | null {
  const active = phases.find((entry) => entry.status === 'active');
  return active ? active.number : null;
}

function nextPhaseLabel(phases: PhaseStep[]): string {
  const activeIndex = phases.findIndex((entry) => entry.status === 'active');
  if (activeIndex === -1) return 'next';
  const next = phases[activeIndex + 1];
  if (!next) return 'next';
  return String(next.number);
}

function neighborToneClass(tone: NeighborIdea['swatchTone']): string {
  return `bo-focus__neigh-card bo-focus__neigh-card--${tone}`;
}

interface BoardThumbnailProps {
  ideas: BoardThumbnailIdea[] | undefined;
  onClick: () => void;
}

function BoardThumbnail({ ideas, onClick }: BoardThumbnailProps): JSX.Element {
  const stickies = ideas ?? [];
  return (
    <button
      type="button"
      className="bo-focus__thumb"
      onClick={onClick}
      title="Click to restore the full board"
      aria-label="Restore board"
    >
      <span className="bo-focus__thumb-label">
        Board · {stickies.length} ideas · click to restore
      </span>
      {stickies.map((sticky) => {
        const style: CSSProperties = {
          left: `${sticky.x}%`,
          top: `${sticky.y}%`,
          background: sticky.tone,
        };
        const klass = sticky.isSelf
          ? 'bo-focus__thumb-mini bo-focus__thumb-mini--self'
          : 'bo-focus__thumb-mini';
        return <span key={sticky.id} className={klass} style={style} aria-hidden="true" />;
      })}
      <span className="bo-focus__thumb-restore">restore board</span>
    </button>
  );
}

interface PhaseRailProps {
  phases: PhaseStep[];
  onJumpToPhase: (phaseNumber: number) => void;
}

function PhaseRail({ phases, onJumpToPhase }: PhaseRailProps): JSX.Element {
  const doneCount = phases.filter((entry) => entry.status === 'done').length;
  const total = phases.length;
  return (
    <div className="bo-focus__phases">
      <h4 className="bo-focus__phases-label">
        Lifecycle · {doneCount} of {total}
      </h4>
      <div className="bo-focus__phase-list">
        {phases.map((phase) => {
          const isClickable =
            phase.status === 'done' || phase.status === 'active';
          const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
            event.preventDefault();
            if (!isClickable) return;
            onJumpToPhase(phase.number);
          };
          return (
            <div
              key={`phase-${phase.number}-${phase.shortLabel}`}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={phaseClass(phase)}
              title={phase.longLabel}
              onClick={isClickable ? handleClick : undefined}
              onKeyDown={(event) => {
                if (!isClickable) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onJumpToPhase(phase.number);
                }
              }}
              aria-disabled={!isClickable || undefined}
            >
              <span className="bo-focus__phase-name">
                <span className="bo-focus__phase-num">{String(phase.number)}</span>
                {phase.shortLabel}
              </span>
              {phase.meta ? (
                <span className="bo-focus__phase-meta">{phase.meta}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ConfirmBarProps {
  questionLabel: string;
  helperText: string;
  primaryLabel: string;
  onConfirm: () => void;
  onStay: () => void;
  onSkip: () => void;
}

function ConfirmBar({
  questionLabel,
  helperText,
  primaryLabel,
  onConfirm,
  onStay,
  onSkip,
}: ConfirmBarProps): JSX.Element {
  return (
    <div className="bo-focus__confirm-bar" role="region" aria-label="Phase confirmation">
      <div className="bo-focus__confirm-icon" aria-hidden="true">▸</div>
      <div className="bo-focus__confirm-text">
        <span className="bo-focus__confirm-q">{questionLabel}</span>
        <small>{helperText}</small>
      </div>
      <div className="bo-focus__confirm-actions">
        <button
          type="button"
          className="bo-focus__cb-btn bo-focus__cb-btn--primary"
          onClick={onConfirm}
        >
          {primaryLabel}
        </button>
        <button type="button" className="bo-focus__cb-btn" onClick={onStay}>
          stay
        </button>
        <button
          type="button"
          className="bo-focus__cb-btn bo-focus__cb-btn--ghost"
          onClick={onSkip}
        >
          skip
        </button>
      </div>
    </div>
  );
}

interface NeighborCardProps {
  neighbor: NeighborIdea;
  onJump: (ideaId: string) => void;
}

function NeighborCard({ neighbor, onJump }: NeighborCardProps): JSX.Element {
  return (
    <button
      type="button"
      className={neighborToneClass(neighbor.swatchTone)}
      onClick={() => onJump(neighbor.ideaId)}
    >
      <span className="bo-focus__neigh-swatch" aria-hidden="true" />
      <span className="bo-focus__neigh-rel">{neighbor.relationshipLabel}</span>
      <span className="bo-focus__neigh-title">{neighbor.title}</span>
      <span className="bo-focus__neigh-why">{neighbor.why}</span>
      <span className="bo-focus__neigh-go">jump · or merge →</span>
    </button>
  );
}

export function IdeaFocusOverlay({
  idea,
  conversation,
  phases,
  neighbors,
  artifacts,
  showGuidance,
  onClose,
  onDemoteToBloom,
  onJumpToPhase,
  onPickOption,
  onConfirmAdvance,
  onStay,
  onSkip,
  onJumpToIdea,
  onJumpToBoardThumbnail,
  boardThumbnailIdeas,
  onPromoteToPrinciple,
}: IdeaFocusOverlayProps): JSX.Element {
  const activeNumber = activePhaseNumber(phases);
  const nextLabel = nextPhaseLabel(phases);
  const phaseHeadline =
    activeNumber !== null
      ? `${activeNumber} · live conversation`
      : 'conversation';

  // Esc demotes back to bloom (the user's most recent state); cmd/ctrl+Esc fully exits.
  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        onClose();
      } else {
        onDemoteToBloom();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onDemoteToBloom]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="bo-focus__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Idea focus overlay"
      onClick={handleBackdropClick}
    >
      <div className="bo-focus__backdrop" aria-hidden="true" />
      <div className="bo-focus__shell">
        <span className="bo-focus__mode-badge">▸ Focus on · this idea</span>

        <BoardThumbnail
          ideas={boardThumbnailIdeas}
          onClick={onJumpToBoardThumbnail}
        />

        <div className="bo-focus__surface">
          <div className="bo-focus__head">
            <div className="bo-focus__head-meta">
              <div className="bo-focus__you-here">
                <span className="bo-focus__pulse" aria-hidden="true" />
                You · in the room
              </div>
              <FocusHeading idea={idea} />
              <div className="bo-focus__prov">
                {idea.providerUsed ? (
                  <span className="bo-focus__prov-model">{idea.providerUsed}</span>
                ) : null}
                {idea.providerUsed ? <span>·</span> : null}
                <span>phase {String(idea.phase)}</span>
              </div>
            </div>
            <button
              type="button"
              className="bo-focus__closer"
              onClick={onDemoteToBloom}
              title="Switch to bloom — keep the board visible while you work this idea."
            >
              ↙ to bloom
            </button>
            <button
              type="button"
              className="bo-focus__closer"
              onClick={onClose}
              title="Close the focus overlay."
            >
              × exit
            </button>
          </div>

          <PhaseRail phases={phases} onJumpToPhase={onJumpToPhase} />

          <div className="bo-focus__conv">
            <div className="bo-focus__conv-label">
              <span>{phaseHeadline}</span>
              <span className="bo-focus__listening">listening</span>
            </div>

            <IdeaConversation
              turns={conversation}
              onPickOption={onPickOption}
            />

            <ConfirmBar
              questionLabel="Done with this phase? Move on?"
              helperText="No auto-advance. The phase only closes when you (or the agent) explicitly say so. Always reversible."
              primaryLabel={`✓ confirm · advance to ${nextLabel}`}
              onConfirm={onConfirmAdvance}
              onStay={onStay}
              onSkip={onSkip}
            />
          </div>

          <div className="bo-focus__neigh">
            <h4 className="bo-focus__phases-label">Close ideas on the board</h4>
            {neighbors.length === 0 ? (
              <p className="bo-focus__neigh-empty">No close neighbors yet.</p>
            ) : (
              neighbors.map((neighbor) => (
                <NeighborCard
                  key={`neigh-${neighbor.ideaId}`}
                  neighbor={neighbor}
                  onJump={onJumpToIdea}
                />
              ))
            )}

            <hr className="bo-focus__neigh-divider" />

            <h4 className="bo-focus__phases-label">Quick actions</h4>
            <div className="bo-focus__quick-actions">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  className="bo-focus__qa"
                >
                  <span className="bo-focus__qa-icon" aria-hidden="true">
                    {artifact.icon}
                  </span>
                  {artifact.label}
                </button>
              ))}
              {onPromoteToPrinciple ? (
                /*
                 * bo-162 — Promote-to-principle from the focused idea. The
                 * callback is wired in IdeaFocusSlot → BoardScreen and writes
                 * through `useProjectSync().updateProject({ principles })`.
                 * Lightweight `window.alert` feedback matches the convention
                 * used by PersonaPanel and keeps this surface unblocked while
                 * a global toast story lands.
                 */
                <button
                  key="promote-to-principle"
                  type="button"
                  className="bo-focus__qa"
                  onClick={() => {
                    void Promise.resolve(onPromoteToPrinciple()).then((added) => {
                      if (typeof window === 'undefined' || typeof window.alert !== 'function') {
                        return;
                      }
                      window.alert(
                        added
                          ? 'Promoted to a project principle. Open the Principles drawer to review.'
                          : 'This idea is already a principle on the project.',
                      );
                    });
                  }}
                  title="Add this idea to the project's principles list."
                >
                  <span className="bo-focus__qa-icon" aria-hidden="true">¶</span>
                  Promote to principle
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {showGuidance ? (
          <>
            <div className="bo-focus__anno bo-focus__anno--right">
              right rail keeps neighbors,
              <br />
              artifacts &amp; quick actions
              <br />
              visible always
            </div>
            <div className="bo-focus__anno bo-focus__anno--top-right">
              board minimized →
              <br />
              still glanceable ·
              <br />
              "restore" or click any
              <br />
              mini-sticky
            </div>
            <div className="bo-focus__anno bo-focus__anno--bottom-left">
              left rail = phase journey
              <br />
              · any past phase clickable ·
              <br />
              future phases queued, locked
              <br />
              until confirm
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default IdeaFocusOverlay;
