/**
 * bo-167 · Linear channel formatter.
 *
 * Pure function: takes a `Brief` and returns a Linear issue payload — a
 * concise title plus a markdown description body. Linear's `IssueCreate`
 * mutation accepts plain markdown for `description`, so the body shape mirrors
 * GitHub's but with a Linear-style "## Context / ## Acceptance" structure
 * teams typically use.
 */
import type { Brief, BriefState, BriefVersion } from '../../types';

export type LinearPriority = 0 | 1 | 2 | 3 | 4; // 0=No priority, 1=Urgent, 4=Low

export interface LinearIssuePayload {
  /** Issue title — derived from latest version. */
  title: string;
  /** Markdown body for `description`. */
  description: string;
  /** Default labels — adapter consumers may augment with team-specific ones. */
  labels: string[];
  /** Priority hint mapped from BriefShipStatus (`ready` → 2 Medium, else 0). */
  priority: LinearPriority;
}

const FALLBACK_TITLE = 'Brief';
const TITLE_TRUNCATE_AT = 80;

function latestVersion(brief: Brief): BriefVersion | null {
  if (brief.versions.length === 0) return null;
  return brief.versions[brief.versions.length - 1];
}

function deriveTitle(brief: Brief): string {
  const v = latestVersion(brief);
  if (!v) return FALLBACK_TITLE;
  const md = v.artifactMd ?? '';
  const heading = md.match(/^\s*#{1,2}\s+(.+?)\s*$/m);
  if (heading) return heading[1].trim();
  const ps = v.briefState.problemStatement?.trim();
  if (ps) return ps.length > TITLE_TRUNCATE_AT ? `${ps.slice(0, TITLE_TRUNCATE_AT - 1)}…` : ps;
  return FALLBACK_TITLE;
}

function bulletList(items: ReadonlyArray<string>): string {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => `- ${item}`)
    .join('\n');
}

function projectBriefStateToMarkdown(state: BriefState): string {
  const sections: string[] = [];
  // Linear convention: lead with Context, then Acceptance, then risks/scope.
  if (state.problemStatement || state.audience || state.desiredOutcome) {
    const parts: string[] = ['## Context'];
    if (state.problemStatement) parts.push(`**Problem:** ${state.problemStatement.trim()}`);
    if (state.audience) parts.push(`**Audience:** ${state.audience.trim()}`);
    if (state.desiredOutcome) parts.push(`**Desired outcome:** ${state.desiredOutcome.trim()}`);
    sections.push(parts.join('\n\n'));
  }
  if (state.successCriteria.length > 0) {
    sections.push(`## Acceptance criteria\n\n${bulletList(state.successCriteria)}`);
  }
  if (state.mustStayTrueRules.length > 0) {
    sections.push(`## Invariants\n\n${bulletList(state.mustStayTrueRules)}`);
  }
  if (state.outOfScope.length > 0) {
    sections.push(`## Out of scope\n\n${bulletList(state.outOfScope)}`);
  }
  if (state.openQuestions.length > 0) {
    sections.push(`## Open questions\n\n${bulletList(state.openQuestions)}`);
  }
  if (state.risks.length > 0) {
    const lines = state.risks
      .map((r) => `- ${r.description.trim()} _(likelihood: ${r.likelihood}, impact: ${r.impact})_`)
      .join('\n');
    sections.push(`## Risks\n\n${lines}`);
  }
  return sections.join('\n\n');
}

function deriveDescription(brief: Brief): string {
  const v = latestVersion(brief);
  const main = v?.artifactMd?.trim()
    ? v.artifactMd.trim()
    : v
      ? projectBriefStateToMarkdown(v.briefState)
      : '_No brief content yet._';
  const versionLabel = v ? `v${v.seq}` : 'unversioned';
  const footer = [
    '',
    '---',
    '',
    `_Brief \`${brief.id}\` · ${versionLabel} · ship status: \`${brief.shipStatus}\`_`,
  ].join('\n');
  return `${main}\n${footer}`;
}

function priorityFromShipStatus(brief: Brief): LinearPriority {
  switch (brief.shipStatus) {
    case 'ready':
      return 2; // Medium
    case 'shipped':
      return 4; // Low
    case 'archived':
      return 0; // No priority
    case 'draft':
    default:
      return 0;
  }
}

export function formatLinearBrief(brief: Brief): LinearIssuePayload {
  return {
    title: deriveTitle(brief),
    description: deriveDescription(brief),
    labels: ['brainstorming-brief'],
    priority: priorityFromShipStatus(brief),
  };
}
