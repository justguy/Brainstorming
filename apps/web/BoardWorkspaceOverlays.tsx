import React from 'react';
import DiscardPile, { type DiscardPileProps } from '../../src/canvas/DiscardPile';
import DocsModal, { type DocsModalProps } from '../../src/docs/DocsModal';
import type { Idea } from '../../src/types';
import {
  CaptureIdeaPopover,
  type CaptureIdeaPopoverProps,
} from './CaptureIdeaPopover';

export interface BoardWorkspaceOverlaysProps {
  ideas: Idea[];
  discardedIdeas: DiscardPileProps['ideas'];
  selectedBoardIdea: Idea | null;
  docsIdeaId: string | null;
  boardId: DocsModalProps['boardId'];
  docCounts: Record<string, number>;
  supportingDocMutations: DocsModalProps['docMutations'];
  capturePopover: CaptureIdeaPopoverProps;
  selectedIdeaDockContent?: React.ReactNode;
  inspectorContent?: React.ReactNode;
  isInspectorOpen: boolean;
  onRestoreDiscardedIdea: DiscardPileProps['onRestore'];
  onPreviewDiscardedIdea?: DiscardPileProps['onPreview'];
  onCloseDocs: () => void;
  onDocsChanged?: DocsModalProps['onDocsChanged'];
  onOpenInspector: () => void;
  onCloseInspector: () => void;
  onCloseSelectedIdea: () => void;
}

function findDocsIdea(ideas: Idea[], docsIdeaId: string | null): Idea | null {
  if (!docsIdeaId) return null;
  return ideas.find(idea => idea.id === docsIdeaId) ?? null;
}

function formatPhaseLabel(phase: number): string {
  return Number.isInteger(phase) ? `Phase ${phase}` : `Step ${phase}`;
}

export function BoardWorkspaceOverlays({
  ideas,
  discardedIdeas,
  selectedBoardIdea,
  docsIdeaId,
  boardId,
  docCounts,
  supportingDocMutations,
  capturePopover,
  selectedIdeaDockContent,
  inspectorContent,
  isInspectorOpen,
  onRestoreDiscardedIdea,
  onPreviewDiscardedIdea,
  onCloseDocs,
  onDocsChanged,
  onOpenInspector,
  onCloseInspector,
  onCloseSelectedIdea,
}: BoardWorkspaceOverlaysProps): React.ReactElement {
  const docsIdea = findDocsIdea(ideas, docsIdeaId);
  const selectedIdeaDocCount = selectedBoardIdea ? docCounts[selectedBoardIdea.id] ?? 0 : 0;

  return (
    <>
      <DiscardPile
        ideas={discardedIdeas}
        onRestore={onRestoreDiscardedIdea}
        onPreview={onPreviewDiscardedIdea}
      />

      <CaptureIdeaPopover {...capturePopover} />

      {docsIdeaId && docsIdea && (
        <DocsModal
          boardId={boardId}
          ideaId={docsIdeaId}
          ideaTitle={docsIdea.rawText.slice(0, 80)}
          open={true}
          onClose={onCloseDocs}
          onDocsChanged={onDocsChanged}
          docMutations={supportingDocMutations}
        />
      )}

      {selectedBoardIdea && (
        <aside
          className="pointer-events-auto absolute bottom-[5.25rem] left-1/2 z-30 flex max-h-[calc(100vh-8rem)] w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white/95 shadow-2xl backdrop-blur sm:bottom-6"
          aria-label="Board focus dock"
        >
          <div className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Board focus
              </p>
              <h2 className="mt-1 text-sm font-semibold text-gray-900 truncate" title={selectedBoardIdea.rawText}>
                {selectedBoardIdea.rawText.slice(0, 80)}
                {selectedBoardIdea.rawText.length > 80 ? '…' : ''}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{formatPhaseLabel(selectedBoardIdea.phase)}</span>
                <span>•</span>
                <span className="capitalize">{selectedBoardIdea.readiness} readiness</span>
                <span>•</span>
                <span>{selectedIdeaDocCount} doc{selectedIdeaDocCount === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenInspector}
                className="text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-full px-3 py-1.5"
              >
                Open inspector
              </button>
              <button
                type="button"
                onClick={onCloseSelectedIdea}
                className="text-xs text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-full px-2 py-1.5"
                aria-label="Back to canvas"
                title="Back to canvas"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            <div className="space-y-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {selectedBoardIdea.rawText}
              </p>
              {selectedBoardIdea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedBoardIdea.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {selectedIdeaDockContent && (
              <div className="border-t border-gray-100 pt-3">
                {selectedIdeaDockContent}
              </div>
            )}
          </div>
        </aside>
      )}

      {isInspectorOpen && selectedBoardIdea && inspectorContent && (
        <>
          <div
            className="absolute inset-0 bg-black/20 z-40"
            onClick={onCloseInspector}
            aria-hidden="true"
          />
          <aside
            className="absolute inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl border-l border-gray-200 sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[min(48rem,calc(100%-2rem))] sm:rounded-2xl"
            aria-label="Inspector"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Inspector
                </p>
                <h2 className="mt-1 text-sm font-semibold text-gray-900 truncate" title={selectedBoardIdea.rawText}>
                  {selectedBoardIdea.rawText.slice(0, 80)}
                  {selectedBoardIdea.rawText.length > 80 ? '…' : ''}
                </h2>
              </div>
              <button
                type="button"
                onClick={onCloseInspector}
                className="text-sm text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1"
                aria-label="Close inspector"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {inspectorContent}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
