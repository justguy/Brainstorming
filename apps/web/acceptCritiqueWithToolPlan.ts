import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { SUB_PHASES } from '../../src/orchestrator/subPhases';
import {
  buildCritiqueAcceptanceTask,
  critiqueAcceptancePlanner,
  type CritiqueAcceptancePlannerOutput,
} from '../../src/orchestrator/roles/critiqueAcceptancePlanner';
import type { Idea, IdeaCritique } from '../../src/types';
import { dispatchAndWaitForResult } from '../../src/webmcp/toolDispatch';

type CritiqueToolAction = CritiqueAcceptancePlannerOutput['action'];

export interface AcceptCritiqueWithToolPlanArgs {
  idea: Idea;
  critique: IdeaCritique;
}

export async function acceptCritiqueWithToolPlan({
  idea,
  critique,
}: AcceptCritiqueWithToolPlanArgs): Promise<{ action: CritiqueToolAction; summary: string }> {
  const task = buildCritiqueAcceptanceTask(idea, critique);
  const { result } = await runAdhocRole<CritiqueAcceptancePlannerOutput>(
    critiqueAcceptancePlanner,
    task,
    { maxTokens: 1200 },
  );

  if (!result) {
    throw new Error('Accepted critique planner returned no usable result.');
  }

  const normalizedRule = normalizeRule(result.rule);
  const nextFutureBead = SUB_PHASES.find(spec => spec.number > idea.phase);
  const candidateActions = uniqueActions([
    result.action,
    nextStepAction(idea, result.nextStep),
    ruleAction(idea, normalizedRule),
    nextFutureBead ? 'suggest_next_bead' : null,
  ]);

  for (const action of candidateActions) {
    if (action === 'choose_next_step' && nextStepAction(idea, result.nextStep)) {
      await dispatchAndWaitForResult<Record<string, never>>('brainstorm:chooseNextStep', {
        ideaId: idea.id,
        nextStep: result.nextStep,
      });
      return { action, summary: `Next step changed to "${result.nextStep}".` };
    }

    if (action === 'add_rule' && normalizedRule && ruleAction(idea, normalizedRule)) {
      const detail = await dispatchAndWaitForResult<{ rule: string }>('brainstorm:add_rule', {
        ideaId: idea.id,
        rule: normalizedRule,
      });
      return { action, summary: `Added rule "${detail.rule}".` };
    }

    if (action === 'suggest_next_bead' && nextFutureBead) {
      const detail = await dispatchAndWaitForResult<{ phaseNumber: number; reason: string }>(
        'brainstorm:suggest_next_bead',
        {
          ideaId: idea.id,
          phaseNumber: nextFutureBead.number,
          reason: result.forwardReason.trim(),
        },
      );
      return { action, summary: `Suggested bead ${detail.phaseNumber}.` };
    }
  }

  throw new Error('Accepted critique did not produce a durable idea change.');
}

function normalizeRule(rule: string | null): string | null {
  if (typeof rule !== 'string') return null;
  const trimmed = rule.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nextStepAction(
  idea: Idea,
  nextStep: CritiqueAcceptancePlannerOutput['nextStep'],
): CritiqueToolAction | null {
  return idea.briefState.nextStep === nextStep ? null : 'choose_next_step';
}

function ruleAction(idea: Idea, rule: string | null): CritiqueToolAction | null {
  if (!rule) return null;
  return idea.briefState.mustStayTrueRules.includes(rule) ? null : 'add_rule';
}

function uniqueActions(actions: Array<CritiqueToolAction | null>): CritiqueToolAction[] {
  return actions.filter((action, index): action is CritiqueToolAction => (
    action !== null && actions.indexOf(action) === index
  ));
}
