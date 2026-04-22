import React, { memo } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

import type { IdeaFlowNodeData, IdeaFlowNodeMap, IdeaFlowNodeProps } from './ideaFlowTypes';

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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
    shadow: '2px 3px 0 rgba(26, 24, 20, 0.12), 5px 8px 20px rgba(26, 24, 20, 0.08)',
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
  return (((hashSeed(id) % 7) - 3) * 0.6);
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

function visibleTags(tags: string[]): string[] {
  return tags
    .filter(tag => !tag.startsWith('paper-') && !tag.startsWith('demo-seed') && tag !== 'idea')
    .slice(0, 2);
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
      className={`nodrag nopan absolute inset-y-0 my-auto z-10 flex h-7 w-4 items-center justify-center rounded-full border text-[8px] font-semibold uppercase tracking-[0.18em] transition-all duration-150 ${
        side === 'left' ? '-left-2' : '-right-2'
      } ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
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
    groupColor,
    highlight = false,
    mergeProgress = 0,
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
  const { title, body } = splitIdeaText(idea.rawText);
  const insightCount = idea.insights?.length ?? 0;
  const notePalette = notePaletteFromTags(idea.tags, boardTheme) ?? defaultNotePalette(idea.id, boardTheme);
  const noteTags = visibleTags(idea.tags);
  const isSketch = boardTheme === 'sketch';
  const paperSeed = `${idea.id}:${idea.panel?.x ?? ''}:${idea.panel?.y ?? ''}:${panel.height}`;
  const paperRotation = paperRotationDeg(paperSeed);
  const scale = dragging ? 1.02 : tone === 'active' ? 1.02 : tone === 'related' ? 1.005 : 1;
  const noteTone = tonePresentation(tone);
  const noteBorderColor = isSelected ? '#1a1814' : (isSketch ? 'rgba(0, 0, 0, 0)' : (groupColor ?? notePalette.borderColor));
  const noteBorderWidth = isSelected ? 2.4 : (isSketch ? 0 : 2.5);
  const noteShadow = isSelected
    ? `0 0 0 1px rgba(255, 255, 255, 0.92), 0 16px 32px -20px rgba(26, 24, 20, 0.34), ${notePalette.shadow}`
    : (isSketch ? '0 12px 24px -20px rgba(26, 24, 20, 0.2)' : notePalette.shadow);
  const noteRotation = dragging ? paperRotation + 0.35 : paperRotation;
  const noteZIndex = zIndex ?? (dragging ? 50 : beingMergedInto ? 40 : isSelected ? 28 : tone === 'active' ? 20 : tone === 'related' ? 10 : 8);
  const showLinkAffordance = typeof onStartLink === 'function' || typeof onCompleteLink === 'function';
  const persistHandles = linkModeEnabled || isSelected || dragging || linkModeAnchor || linkModePending;
  const showDocChip = Boolean(onOpenDocs) && (docCount > 0 || isSelected);
  const docPillLabel = docCount > 0 ? `${docCount}` : '0';
  const docPillAria = docCount > 0 ? `${docCount} supporting docs` : 'Open supporting docs';
  const titleFont = '"Caveat", "Gloria Hallelujah", cursive';
  const bodyFont = '"Kalam", "Patrick Hand", cursive';
  const metaFont = '"JetBrains Mono", ui-monospace, monospace';
  const subtleStroke = isSketch ? 'rgba(93, 82, 69, 0.16)' : 'rgba(26, 24, 20, 0.18)';
  const subtleTagBackground = isSketch ? 'rgba(255, 255, 255, 0.26)' : notePalette.tagBackground;
  const showProgressMeta = isSelected || dragging || idea.readiness !== 'red' || Math.abs(idea.phase) > 1e-9 || insightCount > 0;
  const rootStyle: CSSProperties = {
    width: panel.width,
    height: panel.height,
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
      className={`bo-note-artifact group relative h-full overflow-hidden select-none border transition-[transform,box-shadow,filter] duration-200 ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${highlight ? 'bo-highlight-flash ring-2 ring-sky-300' : ''} ${beingMergedInto ? 'ring-4 ring-sky-400' : ''}`}
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
          className={`bo-note-doc-chip nodrag nopan absolute right-2 top-2 z-10 flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium transition-opacity focus:outline-none focus:ring-2 focus:ring-sky-400 ${docCount > 0 || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
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

      <div className="flex h-full flex-col overflow-hidden px-4 pb-4 pt-3.5">
        <p
          className="bo-note-title line-clamp-3 pr-10"
          style={{
            color: notePalette.inkColor,
            fontFamily: titleFont,
            fontSize: boardTheme === 'whiteboard' ? '1.28rem' : '1.46rem',
            lineHeight: isSketch ? 1.08 : 1.05,
            fontWeight: 700,
          }}
        >
          {title}
        </p>

        {showProgressMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${readinessBadgeClass(idea.readiness)}`}>
              {idea.readiness}
            </span>
            <span
              className="text-[10.5px] uppercase tracking-[0.08em]"
              style={{ color: notePalette.metaColor, fontFamily: metaFont }}
            >
              Step {idea.phase}/8
            </span>
            {insightCount > 0 && (
              <span
                className="rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                style={{
                  color: notePalette.metaColor,
                  borderColor: subtleStroke,
                  background: subtleTagBackground,
                  fontFamily: metaFont,
                }}
              >
                {insightCount} insight{insightCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {body && (
          <p
            className="mt-2.5 line-clamp-4 text-[0.95rem] leading-[1.3]"
            style={{
              color: notePalette.bodyColor,
              fontFamily: bodyFont,
            }}
          >
            {body}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          <span
            className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
            style={{
              color: notePalette.metaColor,
              borderColor: subtleStroke,
              background: subtleTagBackground,
              fontFamily: metaFont,
            }}
          >
            idea
          </span>
          {noteTags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
              style={{
                color: notePalette.metaColor,
                borderColor: subtleStroke,
                background: subtleTagBackground,
                fontFamily: metaFont,
              }}
            >
              {tag}
            </span>
          ))}
          {idea.mergedFrom?.length ? (
            <span
              className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
              style={{
                color: '#6f42c1',
                borderColor: 'rgba(111, 66, 193, 0.26)',
                background: isSketch ? 'rgba(245, 239, 255, 0.42)' : 'rgba(245, 239, 255, 0.72)',
                fontFamily: metaFont,
              }}
            >
              merged from {idea.mergedFrom.length}
            </span>
          ) : null}
        </div>

        {mergeProgress > 0 && !beingMergedInto && (
          <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded bg-[#cad9e7]/70">
            <div className="h-full bg-[#4f93d1] transition-all" style={{ width: `${mergeProgress * 100}%` }} />
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
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-[#b49352]/70 bg-[#fff4d8]/92 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6d5431]">
            Link start
          </div>
        )}
      </div>

      {onDiscardIdea && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onDiscardIdea(idea.id);
          }}
          className={`nodrag nopan absolute bottom-2 right-2 z-10 rounded-full border px-2 py-1 text-[10px] text-gray-700 shadow-sm transition-opacity hover:bg-[#edf5fb] focus:outline-none focus:ring-2 focus:ring-sky-400 ${isSelected ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'}`}
          style={{
            borderColor: subtleStroke,
            background: isSketch ? 'rgba(255, 255, 255, 0.4)' : '#fbfdffeb',
          }}
          aria-label="Discard idea"
          title="Discard idea"
        >
          Discard
        </button>
      )}
    </div>
  );
});

IdeaNoteNode.displayName = 'IdeaNoteNode';

export const ideaFlowNodeTypes: IdeaFlowNodeMap = {
  'idea-note': IdeaNoteNode,
};
