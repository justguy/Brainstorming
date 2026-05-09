import React, { memo } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

import type { IdeaFlowNodeData, IdeaFlowNodeMap, IdeaFlowNodeProps } from './ideaFlowTypes';

// Forks: change this to point at your own repository.
const ISSUE_REPO_URL = 'https://github.com/justguy/Brainstorming';

function buildIssueUrl(idea: IdeaFlowNodeData['idea']): string {
  const lines = idea.rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = lines[0] ?? 'Idea from brainstorming board';
  const body = lines.slice(1).join('\n\n');
  const tagLine = idea.tags && idea.tags.length > 0 ? `\n\nTags: ${idea.tags.join(', ')}` : '';
  const fullBody =
    `${body}${tagLine}\n\n---\n_Filed from a Brainstorming Orchestrator board card._`;
  const params = new URLSearchParams({
    title,
    body: fullBody,
    labels: 'enhancement',
  });
  return `${ISSUE_REPO_URL}/issues/new?${params.toString()}`;
}

type NotePalette = {
  borderColor: string;
  backgroundColor: string;
  inkColor: string;
  bodyColor: string;
  metaColor: string;
  shadow: string;
  docChipBackground: string;
  docChipBorder: string;
  docChipText: string;
  tagBackground: string;
};

const DESIGN_TORN_CLIP_PATH = `polygon(
  0% 3%, 4% 0%, 12% 2%, 20% 0%, 30% 3%, 42% 0%, 55% 2%, 68% 0%, 80% 3%, 92% 0%, 100% 4%,
  98% 14%, 100% 26%, 97% 40%, 100% 55%, 98% 70%, 100% 85%, 97% 100%,
  86% 98%, 72% 100%, 58% 97%, 44% 100%, 30% 98%, 16% 100%, 4% 98%, 0% 94%,
  2% 80%, 0% 66%, 3% 50%, 0% 34%, 2% 18%
)`;

const WHITEBOARD_NOTE_PALETTES: Record<string, NotePalette> = {
  blue: {
    borderColor: '#2e88b8',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    inkColor: '#2e88b8',
    bodyColor: '#465460',
    metaColor: '#6f7c88',
    shadow: '0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(255, 255, 255, 0.82)',
    docChipBorder: 'rgba(46, 136, 184, 0.34)',
    docChipText: '#2e6f96',
    tagBackground: 'rgba(255, 255, 255, 0.72)',
  },
  yellow: {
    borderColor: '#e0a500',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    inkColor: '#c89200',
    bodyColor: '#4e4a3e',
    metaColor: '#7e745d',
    shadow: '0 0 0 4px rgba(255, 204, 0, 0.12), 0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(255, 252, 242, 0.84)',
    docChipBorder: 'rgba(224, 165, 0, 0.34)',
    docChipText: '#9f7700',
    tagBackground: 'rgba(255, 252, 242, 0.72)',
  },
  pink: {
    borderColor: '#c93d5e',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    inkColor: '#b54061',
    bodyColor: '#5a4f54',
    metaColor: '#8a7980',
    shadow: '0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(255, 248, 250, 0.84)',
    docChipBorder: 'rgba(201, 61, 94, 0.34)',
    docChipText: '#aa4b66',
    tagBackground: 'rgba(255, 248, 250, 0.72)',
  },
  peach: {
    borderColor: '#c66a28',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    inkColor: '#b46730',
    bodyColor: '#5b4f43',
    metaColor: '#8a7a69',
    shadow: '0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(255, 248, 242, 0.84)',
    docChipBorder: 'rgba(198, 106, 40, 0.34)',
    docChipText: '#a7632d',
    tagBackground: 'rgba(255, 248, 242, 0.72)',
  },
  lavender: {
    borderColor: '#6a4eae',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    inkColor: '#6a4eae',
    bodyColor: '#4f4b5d',
    metaColor: '#7b738c',
    shadow: '0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(250, 247, 255, 0.84)',
    docChipBorder: 'rgba(106, 78, 174, 0.34)',
    docChipText: '#6c56a4',
    tagBackground: 'rgba(250, 247, 255, 0.72)',
  },
  green: {
    borderColor: '#2a9f5e',
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    inkColor: '#2a9f5e',
    bodyColor: '#465746',
    metaColor: '#6d806d',
    shadow: '0 2px 8px rgba(31, 42, 46, 0.08)',
    docChipBackground: 'rgba(245, 253, 246, 0.84)',
    docChipBorder: 'rgba(42, 159, 94, 0.34)',
    docChipText: '#2f7f5b',
    tagBackground: 'rgba(245, 253, 246, 0.72)',
  },
};

const SKETCH_NOTE_PALETTES: Record<string, NotePalette> = {
  blue: {
    borderColor: '#8abfd0',
    backgroundColor: '#b8dbe8',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#7c7667',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(246, 251, 255, 0.84)',
    docChipBorder: 'rgba(86, 120, 134, 0.32)',
    docChipText: '#516978',
    tagBackground: 'rgba(255, 255, 255, 0.32)',
  },
  yellow: {
    borderColor: '#e5cf5c',
    backgroundColor: '#f7e58a',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#7d7254',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(255, 251, 236, 0.84)',
    docChipBorder: 'rgba(137, 116, 44, 0.3)',
    docChipText: '#6e5b1f',
    tagBackground: 'rgba(255, 255, 255, 0.3)',
  },
  pink: {
    borderColor: '#df8fa4',
    backgroundColor: '#f4b9c6',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#7f6970',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(255, 247, 250, 0.84)',
    docChipBorder: 'rgba(149, 91, 108, 0.3)',
    docChipText: '#7d5665',
    tagBackground: 'rgba(255, 255, 255, 0.3)',
  },
  peach: {
    borderColor: '#e0a77d',
    backgroundColor: '#f5ccac',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#7c705f',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(255, 248, 242, 0.84)',
    docChipBorder: 'rgba(149, 104, 72, 0.3)',
    docChipText: '#7f6248',
    tagBackground: 'rgba(255, 255, 255, 0.3)',
  },
  lavender: {
    borderColor: '#b19fcd',
    backgroundColor: '#d7c8e8',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#756f83',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(251, 249, 255, 0.84)',
    docChipBorder: 'rgba(110, 98, 140, 0.3)',
    docChipText: '#645b79',
    tagBackground: 'rgba(255, 255, 255, 0.3)',
  },
  green: {
    borderColor: '#9cc279',
    backgroundColor: '#c5e0a8',
    inkColor: '#1a1814',
    bodyColor: '#4a4740',
    metaColor: '#6e7963',
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)',
    docChipBackground: 'rgba(247, 252, 243, 0.84)',
    docChipBorder: 'rgba(89, 117, 67, 0.3)',
    docChipText: '#587342',
    tagBackground: 'rgba(255, 255, 255, 0.3)',
  },
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paperRotationDeg(id: string): number {
  // ±1.5° deterministic; never re-random on re-render.
  const bucket = hashSeed(id) % 7;
  return (bucket - 3) * 0.5;
}

const AI_ORIGIN_TAGS = ['from-scout', 'ai-takeaway', 'ai-draft', 'ai-authored'];

function isAiAuthored(tags: string[]): boolean {
  return tags.some(tag => AI_ORIGIN_TAGS.includes(tag));
}

function paletteSet(boardTheme: IdeaFlowNodeData['boardTheme']): Record<string, NotePalette> {
  return boardTheme === 'sketch' ? SKETCH_NOTE_PALETTES : WHITEBOARD_NOTE_PALETTES;
}

function notePaletteFromTags(tags: string[], boardTheme: IdeaFlowNodeData['boardTheme']): NotePalette | null {
  const palettes = paletteSet(boardTheme);
  if (tags.includes('paper-blue')) return palettes.blue;
  if (tags.includes('paper-yellow')) return palettes.yellow;
  if (tags.includes('paper-pink')) return palettes.pink;
  if (tags.includes('paper-peach')) return palettes.peach;
  if (tags.includes('paper-lavender')) return palettes.lavender;
  if (tags.includes('paper-green')) return palettes.green;
  return null;
}

function defaultNotePalette(id: string, boardTheme: IdeaFlowNodeData['boardTheme']): NotePalette {
  const palettes = Object.values(paletteSet(boardTheme));
  return palettes[hashSeed(id) % palettes.length];
}

function splitIdeaText(rawText: string): { title: string; body: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: 'Idea', body: '' };
  }

  return {
    title: lines[0],
    body: lines.slice(1).join(' '),
  };
}

function readinessBadgeClass(readiness: IdeaFlowNodeData['idea']['readiness']): string {
  switch (readiness) {
    case 'green':
      return 'border-emerald-200/80 bg-emerald-50/85 text-emerald-700';
    case 'yellow':
      return 'border-amber-200/80 bg-amber-50/85 text-amber-800';
    case 'red':
    default:
      return 'border-rose-200/80 bg-rose-50/85 text-rose-700';
  }
}

function tonePresentation(tone: NonNullable<IdeaFlowNodeData['tone']>): { opacity: number; filter?: string } {
  switch (tone) {
    case 'active':
      return { opacity: 1, filter: 'saturate(1.04)' };
    case 'related':
      return { opacity: 0.98 };
    case 'muted':
      return { opacity: 0.9, filter: 'saturate(0.78)' };
    case 'idle':
    default:
      return { opacity: 1 };
  }
}

const HIDDEN_TAG_PREFIXES = ['paper-', 'demo-seed', 'demo-', '__'];
const HIDDEN_TAGS = new Set(['idea', 'scout', 'from-scout', 'ai-takeaway', 'ai-draft', 'ai-authored']);

function visibleTags(tags: string[]): { shown: string[]; overflow: number } {
  const surfaced = tags.filter(tag => {
    if (HIDDEN_TAGS.has(tag)) return false;
    return !HIDDEN_TAG_PREFIXES.some(prefix => tag.startsWith(prefix));
  });
  return {
    shown: surfaced.slice(0, 2),
    overflow: Math.max(0, surfaced.length - 2),
  };
}

function FlowHandle({
  side,
  active,
  onActivate,
  label,
  enabled,
  visible,
}: {
  side: 'left' | 'right';
  active: boolean;
  onActivate?: () => void;
  label: string;
  enabled: boolean;
  visible: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        onActivate?.();
      }}
      className={`nodrag nopan absolute inset-y-0 my-auto z-10 flex h-7 w-4 items-center justify-center rounded-full border text-[8px] font-semibold uppercase tracking-[0.18em] ${
        side === 'left' ? '-left-2' : '-right-2'
      } ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      } ${enabled ? 'cursor-pointer' : 'opacity-55'}`}
      style={{
        borderColor: active ? '#ce7657' : 'rgba(93, 82, 69, 0.16)',
        background: active ? 'rgba(255, 248, 243, 0.98)' : 'rgba(255, 255, 255, 0.76)',
        color: active ? '#a25233' : 'rgba(89, 79, 69, 0.62)',
        boxShadow: active ? '0 8px 18px -16px rgba(26, 24, 20, 0.45)' : '0 6px 14px -16px rgba(26, 24, 20, 0.32)',
      }}
      title={enabled ? label : 'Connection handle'}
      aria-label={label}
      data-handle-position={side}
    >
      {side === 'left' ? '⇄' : '➜'}
    </button>
  );
}

function ideaNodePropsEqual(prev: IdeaFlowNodeProps, next: IdeaFlowNodeProps): boolean {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.dragging !== next.dragging) return false;
  if (prev.zIndex !== next.zIndex) return false;
  if (prev.isConnectable !== next.isConnectable) return false;
  const a = prev.data;
  const b = next.data;
  if (a === b) return true;
  return (
    a.idea === b.idea &&
    a.boardTheme === b.boardTheme &&
    a.selected === b.selected &&
    a.tone === b.tone &&
    a.docCount === b.docCount &&
    a.displayHeight === b.displayHeight &&
    a.groupColor === b.groupColor &&
    a.highlight === b.highlight &&
    a.merging === b.merging &&
    a.beingMergedInto === b.beingMergedInto &&
    a.linkModeEnabled === b.linkModeEnabled &&
    a.linkModeAnchor === b.linkModeAnchor &&
    a.linkModePending === b.linkModePending &&
    a.onOpenIdea === b.onOpenIdea &&
    a.onOpenDocs === b.onOpenDocs &&
    a.onDiscardIdea === b.onDiscardIdea &&
    a.onStartLink === b.onStartLink &&
    a.onCompleteLink === b.onCompleteLink
  );
}

export const IdeaNoteNode = memo(function IdeaNoteNode({
  id,
  data,
  selected: selectedProp = false,
  dragging = false,
  zIndex,
}: IdeaFlowNodeProps): ReactElement {
  const {
    idea,
    boardTheme,
    selected: selectedFromData = false,
    tone = 'idle',
    docCount = 0,
    displayHeight,
    groupColor,
    highlight = false,
    merging = false,
    beingMergedInto = false,
    linkModeEnabled = true,
    linkModeAnchor = false,
    linkModePending = false,
    onOpenIdea,
    onOpenDocs,
    onDiscardIdea,
    onStartLink,
    onCompleteLink,
  } = data;

  const panel = idea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
  const isSelected = selectedProp || selectedFromData;
  const noteHeight = displayHeight ?? panel.height;
  const { title, body } = splitIdeaText(idea.rawText);
  const insightCount = idea.insights?.length ?? 0;
  const notePalette = notePaletteFromTags(idea.tags, boardTheme) ?? defaultNotePalette(idea.id, boardTheme);
  const { shown: noteTags, overflow: tagOverflow } = visibleTags(idea.tags);
  const aiAuthored = isAiAuthored(idea.tags);
  const isSketch = boardTheme === 'sketch';
  const paperSeed = `${idea.id}:${idea.panel?.x ?? ''}:${idea.panel?.y ?? ''}:${panel.height}`;
  const paperRotation = paperRotationDeg(paperSeed);
  const scale = dragging ? 1.02 : 1;
  const noteTone = tonePresentation(tone);
  // Sketch: torn-paper silhouette with offset ink shadow; whiteboard: translucent marker with colored outline.
  const noteBorderColor = isSelected
    ? '#1a1814'
    : (isSketch ? 'rgba(0, 0, 0, 0)' : (groupColor ?? notePalette.borderColor));
  const noteBorderWidth = isSelected ? (isSketch ? 2 : 2.4) : (isSketch ? 0 : 2.5);
  const sketchSelectedShadow = '3px 4px 0 rgba(26, 24, 20, 0.32), 5px 8px 18px rgba(26, 24, 20, 0.18)';
  const whiteboardSelectedShadow = `0 0 0 1px rgba(255, 255, 255, 0.92), 0 16px 32px -20px rgba(26, 24, 20, 0.34), ${notePalette.shadow}`;
  const noteShadow = isSelected
    ? (isSketch ? sketchSelectedShadow : whiteboardSelectedShadow)
    : notePalette.shadow;
  const noteRotation = dragging ? paperRotation + 0.35 : paperRotation;
  const noteZIndex = zIndex ?? (dragging ? 50 : beingMergedInto ? 40 : isSelected ? 28 : 8);
  const showLinkAffordance = typeof onStartLink === 'function' || typeof onCompleteLink === 'function';
  // Handles only appear once a card is in focus (selected, being dragged, or
  // actively part of a link gesture). Hovering must not trigger them — the
  // card's resting state should be visually static.
  void linkModeEnabled;
  const persistHandles = isSelected || dragging || linkModeAnchor || linkModePending;
  const showDocChip = Boolean(onOpenDocs) && (docCount > 0 || isSelected);
  const docPillLabel = docCount > 0 ? `${docCount}` : '0';
  const docPillAria = docCount > 0 ? `${docCount} supporting docs` : 'Open supporting docs';
  // Sketch = paper+pen (Kalam hand). Whiteboard retains its previous marker-display look; it will get its own pass.
  const titleFont = isSketch
    ? '"Kalam", "Patrick Hand", "Caveat", cursive'
    : '"Caveat", "Gloria Hallelujah", cursive';
  const bodyFont = '"Kalam", "Patrick Hand", cursive';
  const longBodyFont = '"Inter", system-ui, sans-serif';
  const metaFont = '"JetBrains Mono", ui-monospace, monospace';
  const isLongBody = body.length > 140;
  const bodyLineCount = body.split(/\r?\n/).length;
  // Only the sketch theme enforces the "long paragraphs fall back to Inter" rule per DESIGN_PROMPT §TYPOGRAPHY.
  const useLongBodyFont = isSketch && (isLongBody || bodyLineCount > 2);
  const inkHairline = isSketch ? 'rgba(26, 24, 20, 0.32)' : 'rgba(26, 24, 20, 0.28)';
  const chipTagBackground = 'transparent';
  const chipTagInk = isSketch ? 'rgba(26, 24, 20, 0.78)' : notePalette.metaColor;
  const rootStyle: CSSProperties = {
    width: panel.width,
    height: noteHeight,
    zIndex: noteZIndex,
    opacity: noteTone.opacity,
    filter: noteTone.filter,
    transform: `rotate(${noteRotation}deg) scale(${scale})`,
    transformOrigin: 'center center',
    borderWidth: noteBorderWidth,
    borderColor: noteBorderColor,
    backgroundColor: notePalette.backgroundColor,
    boxShadow: noteShadow,
    clipPath: isSketch ? DESIGN_TORN_CLIP_PATH : undefined,
    borderRadius: isSketch ? 2 : 14,
    outline: isSelected && !isSketch ? '3px dashed rgba(26, 24, 20, 0.88)' : undefined,
    outlineOffset: isSelected && !isSketch ? 4 : undefined,
  };

  return (
    <div
      role="button"
      aria-pressed={isSelected}
      aria-label={`Idea node: ${title}`}
      data-artifact-surface="idea-note"
      data-artifact-tone={tone}
      data-selected={isSelected ? 'true' : 'false'}
      data-node-id={id}
      className={`bo-note-artifact group relative h-full ${isSelected ? 'overflow-visible' : 'overflow-hidden'} select-none border cursor-grab ${highlight ? 'bo-highlight-flash ring-2 ring-sky-300' : ''} ${beingMergedInto ? 'ring-4 ring-sky-400' : ''}`}
      style={rootStyle}
      onClick={() => onOpenIdea?.(idea.id)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenIdea?.(idea.id);
        }
      }}
      tabIndex={onOpenIdea ? 0 : -1}
    >
      <div className="absolute inset-y-0 left-0 flex items-center">
        {showLinkAffordance && (
          <FlowHandle
            side="left"
            active={linkModeAnchor}
            visible={persistHandles}
            enabled={typeof onStartLink === 'function'}
            label="Start linking from this idea"
            onActivate={() => onStartLink?.(idea.id)}
          />
        )}
      </div>

      <div className="absolute inset-y-0 right-0 flex items-center">
        {showLinkAffordance && (
          <FlowHandle
            side="right"
            active={linkModePending}
            visible={persistHandles}
            enabled={typeof onCompleteLink === 'function'}
            label="Complete linking to this idea"
            onActivate={() => onCompleteLink?.(idea.id)}
          />
        )}
      </div>

      {showDocChip && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onOpenDocs?.(idea.id);
          }}
          className={`bo-note-doc-chip nodrag nopan absolute right-2 top-2 z-10 flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 ${docCount > 0 || isSelected ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          style={{
            background: notePalette.docChipBackground,
            borderColor: notePalette.docChipBorder,
            color: notePalette.docChipText,
            boxShadow: '0 8px 18px -18px rgba(26, 24, 20, 0.34)',
          }}
          aria-label={docPillAria}
          title={docPillAria}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.25 5.25 8.9 1.6a2.75 2.75 0 1 1 3.9 3.9L7.55 10.75a3.5 3.5 0 1 1-4.95-4.95l5.1-5.1" />
          </svg>
          <span>{docPillLabel}</span>
        </button>
      )}

      {aiAuthored && (
        <span
          className="bo-note-ai-stamp pointer-events-none absolute right-3 top-3 z-[9]"
          aria-label="Authored by Dev"
          title="Dev drafted this note"
          style={{
            fontFamily: metaFont,
          }}
        >
          ai
        </span>
      )}

      <div className={`flex h-full flex-col px-4 pb-9 pt-3.5 ${isSelected ? 'overflow-visible' : 'overflow-hidden'}`}>
        <p
          className={`bo-note-title ${isSelected ? '' : 'line-clamp-3'} ${aiAuthored ? 'pr-10' : 'pr-6'}`}
          style={{
            color: notePalette.inkColor,
            fontFamily: titleFont,
            fontSize: boardTheme === 'whiteboard' ? '1.18rem' : '1.32rem',
            lineHeight: 1.1,
            // Sketch fonts (Kalam, Marker Felt, Bradley Hand) already render
            // visually bold at weight 400. Forcing 700 makes the whole board
            // look shouty.
            fontWeight: isSketch ? 400 : 700,
            letterSpacing: '-0.005em',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </p>

        {body && (
          <p
            className={`mt-2 ${isSelected ? (useLongBodyFont ? 'text-[0.82rem]' : 'text-[0.92rem]') : (useLongBodyFont ? 'line-clamp-5 text-[0.82rem]' : 'line-clamp-4 text-[0.92rem]')} leading-[1.34]`}
            style={{
              color: notePalette.bodyColor,
              fontFamily: useLongBodyFont ? longBodyFont : bodyFont,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {body}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {noteTags.map(tag => (
            <span
              key={tag}
              className="bo-note-tag inline-flex items-center px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.1em]"
              style={{
                color: chipTagInk,
                borderColor: inkHairline,
                background: chipTagBackground,
                fontFamily: metaFont,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 2,
              }}
            >
              {tag}
            </span>
          ))}
          {tagOverflow > 0 && (
            <span
              className="bo-note-tag inline-flex items-center px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.1em]"
              style={{
                color: chipTagInk,
                borderColor: inkHairline,
                background: chipTagBackground,
                fontFamily: metaFont,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 2,
              }}
              aria-label={`${tagOverflow} more tags`}
            >
              +{tagOverflow}
            </span>
          )}
          {insightCount > 0 && (
            <span
              className="bo-note-tag inline-flex items-center px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.1em]"
              style={{
                color: chipTagInk,
                borderColor: inkHairline,
                background: chipTagBackground,
                fontFamily: metaFont,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 2,
              }}
            >
              {insightCount} insight{insightCount === 1 ? '' : 's'}
            </span>
          )}
          {idea.mergedFrom?.length ? (
            <span
              className="bo-note-tag bo-note-tag--semantic inline-flex items-center px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.1em]"
              style={{
                color: 'rgba(101, 56, 180, 0.9)',
                borderColor: 'rgba(101, 56, 180, 0.45)',
                background: 'transparent',
                fontFamily: metaFont,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 2,
              }}
            >
              merged×{idea.mergedFrom.length}
            </span>
          ) : null}
        </div>

        {merging && !beingMergedInto && (
          <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded bg-[#cad9e7]/70">
            <div className="bo-merge-progress-fill h-full bg-[#4f93d1]" />
          </div>
        )}

        {beingMergedInto && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-sky-50/86">
            <span className="bo-note-merge-overlay text-[10px] font-semibold uppercase tracking-wide text-sky-900">
              Hold to merge
            </span>
          </div>
        )}

        {linkModeAnchor && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 px-2 py-[2px] text-[9px] uppercase tracking-[0.18em]"
            style={{
              fontFamily: metaFont,
              color: '#6d5431',
              borderColor: 'rgba(109, 84, 49, 0.7)',
              borderStyle: 'solid',
              borderWidth: 1,
              borderRadius: 2,
              background: 'transparent',
            }}
          >
            link start
          </div>
        )}
      </div>

      <div
        className={`pointer-events-none absolute inset-x-3 bottom-2 z-10 flex items-center justify-between gap-2 ${
          isSelected ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <a
          href={buildIssueUrl(idea)}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className={`bo-note-issue nodrag nopan inline-flex items-center gap-1 px-2 py-[2px] text-[9.5px] uppercase tracking-[0.12em] focus:outline-none focus:ring-2 focus:ring-sky-400 ${
            isSelected ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          style={{
            fontFamily: metaFont,
            color: isSketch ? 'rgba(26, 24, 20, 0.78)' : notePalette.metaColor,
            borderColor: inkHairline,
            borderStyle: 'solid',
            borderWidth: 1,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.78)',
            textDecoration: 'none',
          }}
          aria-label="Open this idea as a GitHub issue in a new tab"
          title="Open this idea as a GitHub issue (new tab)"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 11.7a5.2 5.2 0 1 1 0-10.4 5.2 5.2 0 0 1 0 10.4Zm0-9.1a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Zm0 6.5a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
          </svg>
          <span>issue</span>
        </a>

        {onDiscardIdea && (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onDiscardIdea(idea.id);
            }}
            className={`bo-note-discard nodrag nopan px-2 py-[2px] text-[9.5px] uppercase tracking-[0.12em] focus:outline-none focus:ring-2 focus:ring-sky-400 ${
              isSelected ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{
              fontFamily: metaFont,
              color: isSketch ? 'rgba(26, 24, 20, 0.78)' : notePalette.metaColor,
              borderColor: inkHairline,
              borderStyle: 'solid',
              borderWidth: 1,
              borderRadius: 2,
              background: 'rgba(255, 255, 255, 0.78)',
            }}
            aria-label="Discard idea"
            title="Discard idea"
          >
            discard
          </button>
        )}
      </div>
    </div>
  );
}, ideaNodePropsEqual);

IdeaNoteNode.displayName = 'IdeaNoteNode';

export const ideaFlowNodeTypes: IdeaFlowNodeMap = {
  'idea-note': IdeaNoteNode,
};
