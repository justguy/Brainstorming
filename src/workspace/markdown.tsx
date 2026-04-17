import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Density } from '../types';

// Patterns that mark the start of an expert-only section header
const EXPERT_SECTION_RE = /^###\s+⚙️\s+(Expert Annex|Technical Annex)/;
// Any heading at ## or ### level — used to detect end of expert section
const HEADING_RE = /^#{2,3}\s+/;

/**
 * Strip sections whose header matches EXPERT_SECTION_RE.
 * Everything from that header until (but not including) the next ## or ### heading
 * is removed.
 */
function stripExpertSections(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (EXPERT_SECTION_RE.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && HEADING_RE.test(line)) {
      skipping = false;
    }
    if (!skipping) {
      out.push(line);
    }
  }

  return out.join('\n');
}

function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

interface MarkdownProps {
  content: string;
  density?: Density;
}

export default function Markdown({ content, density = 'standard' }: MarkdownProps): React.ReactElement {
  const html = useMemo(() => {
    const processed = density === 'simple' ? stripExpertSections(content) : content;
    return renderMarkdown(processed);
  }, [content, density]);

  return (
    <div
      className="prose prose-sm max-w-none text-gray-800"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
