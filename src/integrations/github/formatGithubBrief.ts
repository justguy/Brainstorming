/**
 * bo-165 · GitHub channel formatter.
 *
 * Pure function: takes a `Brief` and returns a deterministic GitHub-issue
 * payload (title + markdown body + labels). v0 only — no API calls.
 *
 * The artifact markdown stored on the latest `BriefVersion` (`artifactMd`) is
 * the canonical content; we wrap it in an issue body with a small provenance
 * footer. When `artifactMd` is missing we fall back to projecting the embedded
 * `BriefState` into a plain-markdown skeleton so the output remains useful for
 * manual paste into GitHub.
 */
import type { Brief, BriefState, BriefVersion } from '../../types';

export interface GithubIssuePayload {
  /** Issue title — derived from the brief markdown H1/H2 or the problem statement. */
  title: string;
  /** Full issue body in GitHub-flavored markdown. */
  body: string;
  /** Optional labels — v0 emits a single channel-marker label. */
  labels: string[];
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

/**
 * Project a `BriefState` to plain markdown when `artifactMd` is unavailable.
 * Sections are emitted only when populated so the body stays tight.
 */
function projectBriefStateToMarkdown(state: BriefState): string {
  const sections: string[] = [];

  if (state.problemStatement) {
    sections.push(`## Problem\n\n${state.problemStatement.trim()}`);
  }
  if (state.audience) {
    sections.push(`## Audience\n\n${state.audience.trim()}`);
  }
  if (state.desiredOutcome) {
    sections.push(`## Desired outcome\n\n${state.desiredOutcome.trim()}`);
  }
  if (state.mustStayTrueRules.length > 0) {
    sections.push(`## Must stay true\n\n${bulletList(state.mustStayTrueRules)}`);
  }
  if (state.successCriteria.length > 0) {
    sections.push(`## Success criteria\n\n${bulletList(state.successCriteria)}`);
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

function deriveBody(brief: Brief): string {
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
    `<sub>Brief \`${brief.id}\` · ${versionLabel} · ship status: \`${brief.shipStatus}\`</sub>`,
  ].join('\n');
  return `${main}\n${footer}`;
}

export function formatGithubBrief(brief: Brief): GithubIssuePayload {
  return {
    title: deriveTitle(brief),
    body: deriveBody(brief),
    labels: ['brainstorming-brief'],
  };
}
