import React from 'react';
import type { Idea } from '../../src/types';
import {
  CaptureIdeaPopover,
  type CaptureIdeaPopoverProps,
} from './CaptureIdeaPopover';

export interface BoardWorkspaceOverlaysProps {
  ideas: Idea[];
  selectedBoardIdea: Idea | null;
  docCounts: Record<string, number>;
  capturePopover: CaptureIdeaPopoverProps;
  docsPanel?: React.ReactNode;
  selectedIdeaDockContent?: React.ReactNode;
  inspectorContent?: React.ReactNode;
  isInspectorOpen: boolean;
  isTurnLogOpen?: boolean;
  onToggleTurnLog?: () => void;
  onOpenDocs: (ideaId: string) => void;
  onOpenInspector: () => void;
  onCloseInspector: () => void;
  onCloseSelectedIdea: () => void;
}

function formatPhaseLabel(phase: number): string {
  return Number.isInteger(phase) ? `Phase ${phase}` : `Step ${phase}`;
}

export function BoardWorkspaceOverlays({
  selectedBoardIdea,
  docCounts,
  capturePopover,
  docsPanel,
  selectedIdeaDockContent,
  inspectorContent,
  isInspectorOpen,
  isTurnLogOpen = false,
  onToggleTurnLog,
  onOpenDocs,
  onOpenInspector,
  onCloseInspector,
  onCloseSelectedIdea,
}: BoardWorkspaceOverlaysProps): React.ReactElement {
  const selectedIdeaDocCount = selectedBoardIdea ? docCounts[selectedBoardIdea.id] ?? 0 : 0;

  return (
    <>
      <CaptureIdeaPopover {...capturePopover} />

      {docsPanel}

      {selectedBoardIdea && (
        <aside
          className="bo-focus-dock pointer-events-auto absolute bottom-[5.25rem] left-1/2 z-30 flex max-h-[calc(100vh-8rem)] w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[28px] backdrop-blur sm:bottom-6"
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
                onClick={() => onOpenDocs(selectedBoardIdea.id)}
                className="bo-shell-action"
              >
                Docs {selectedIdeaDocCount > 0 ? `(${selectedIdeaDocCount})` : ''}
              </button>
              <button
                type="button"
                onClick={onToggleTurnLog}
                className={`bo-shell-action ${isTurnLogOpen ? 'bo-shell-action--primary' : ''}`}
              >
                {isTurnLogOpen ? 'Hide log' : 'Turn log'}
              </button>
              <button
                type="button"
                onClick={onOpenInspector}
                className="bo-shell-action"
              >
                Open inspector
              </button>
              <button
                type="button"
                onClick={onCloseSelectedIdea}
                className="bo-shell-action"
                aria-label="Back to canvas"
                title="Back to canvas"
              >
                Close
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
            className="bo-inspector-surface absolute inset-x-0 bottom-0 top-0 z-50 flex flex-col border-l sm:inset-y-4 sm:left-auto sm:right-4 sm:w-[min(48rem,calc(100%-2rem))] sm:rounded-2xl"
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
