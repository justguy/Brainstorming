/**
 * bo-166 · Notion channel formatter.
 *
 * Pure function: takes a `Brief` and returns a Notion page payload — page
 * title properties + a list of block descriptors. v0 only — no API calls.
 *
 * We emit a small subset of Notion block types (heading_1 / heading_2 /
 * paragraph / bulleted_list_item) keyed in the same shape Notion's API uses.
 * Adapter consumers can paste the result directly into a Notion API request
 * once OAuth lands.
 */
import type { Brief, BriefState, BriefVersion } from '../../types';

export type NotionRichText = { type: 'text'; text: { content: string } };

export type NotionBlock =
  | { type: 'heading_1'; heading_1: { rich_text: NotionRichText[] } }
  | { type: 'heading_2'; heading_2: { rich_text: NotionRichText[] } }
  | { type: 'paragraph'; paragraph: { rich_text: NotionRichText[] } }
  | { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: NotionRichText[] } };

export interface NotionPagePayload {
  /** Page title — derived from the brief markdown H1/H2 or problemStatement. */
  title: string;
  /** Page properties keyed for the default Notion "Name" + "Status" fields. */
  properties: {
    Name: { title: NotionRichText[] };
    Status: { select: { name: string } };
  };
  /** Ordered block list — feeds Notion's `children` array. */
  blocks: NotionBlock[];
}

const FALLBACK_TITLE = 'Brief';
const TITLE_TRUNCATE_AT = 80;

function rich(content: string): NotionRichText[] {
  return [{ type: 'text', text: { content } }];
}

function paragraph(content: string): NotionBlock {
  return { type: 'paragraph', paragraph: { rich_text: rich(content) } };
}

function heading2(content: string): NotionBlock {
  return { type: 'heading_2', heading_2: { rich_text: rich(content) } };
}

function bullet(content: string): NotionBlock {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(content) } };
}

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

function bulletsFrom(items: ReadonlyArray<string>): NotionBlock[] {
  return items.map((s) => s.trim()).filter((s) => s.length > 0).map((s) => bullet(s));
}

function blocksFromBriefState(state: BriefState): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  if (state.problemStatement) {
    blocks.push(heading2('Problem'), paragraph(state.problemStatement.trim()));
  }
  if (state.audience) {
    blocks.push(heading2('Audience'), paragraph(state.audience.trim()));
  }
  if (state.desiredOutcome) {
    blocks.push(heading2('Desired outcome'), paragraph(state.desiredOutcome.trim()));
  }
  if (state.mustStayTrueRules.length > 0) {
    blocks.push(heading2('Must stay true'), ...bulletsFrom(state.mustStayTrueRules));
  }
  if (state.successCriteria.length > 0) {
    blocks.push(heading2('Success criteria'), ...bulletsFrom(state.successCriteria));
  }
  if (state.outOfScope.length > 0) {
    blocks.push(heading2('Out of scope'), ...bulletsFrom(state.outOfScope));
  }
  if (state.openQuestions.length > 0) {
    blocks.push(heading2('Open questions'), ...bulletsFrom(state.openQuestions));
  }
  if (state.risks.length > 0) {
    blocks.push(
      heading2('Risks'),
      ...state.risks.map((r) =>
        bullet(`${r.description.trim()} (likelihood: ${r.likelihood}, impact: ${r.impact})`),
      ),
    );
  }
  return blocks;
}

/**
 * Light markdown → Notion block converter for the artifact md case.
 * Handles `# `, `## `, `### `, `- `, blank-line paragraphs. Anything fancier
 * (bold/italic/code) collapses into the surrounding rich-text content; v0
 * intentionally keeps this simple.
 */
function blocksFromArtifactMd(md: string): NotionBlock[] {
  const lines = md.split('\n');
  const blocks: NotionBlock[] = [];
  let paraBuf: string[] = [];
  const flushPara = (): void => {
    if (paraBuf.length === 0) return;
    const text = paraBuf.join(' ').trim();
    if (text.length > 0) blocks.push(paragraph(text));
    paraBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) { flushPara(); continue; }
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      flushPara();
      blocks.push({ type: 'heading_1', heading_1: { rich_text: rich(h1[1].trim()) } });
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) { flushPara(); blocks.push(heading2(h2[1].trim())); continue; }
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) { flushPara(); blocks.push(heading2(h3[1].trim())); continue; }
    const li = /^[-*]\s+(.+)$/.exec(line);
    if (li) { flushPara(); blocks.push(bullet(li[1].trim())); continue; }
    paraBuf.push(line.trim());
  }
  flushPara();
  return blocks;
}

export function formatNotionBrief(brief: Brief): NotionPagePayload {
  const v = latestVersion(brief);
  const title = deriveTitle(brief);
  const main: NotionBlock[] = v?.artifactMd?.trim()
    ? blocksFromArtifactMd(v.artifactMd.trim())
    : v
      ? blocksFromBriefState(v.briefState)
      : [paragraph('No brief content yet.')];
  const versionLabel = v ? `v${v.seq}` : 'unversioned';
  const footer: NotionBlock[] = [
    paragraph(`Brief ${brief.id} · ${versionLabel} · ship status: ${brief.shipStatus}`),
  ];
  return {
    title,
    properties: {
      Name: { title: rich(title) },
      Status: { select: { name: brief.shipStatus } },
    },
    blocks: [...main, ...footer],
  };
}
