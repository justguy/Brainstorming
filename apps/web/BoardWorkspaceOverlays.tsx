import React from 'react';
import DiscardPile, { type DiscardPileProps } from '../../src/canvas/DiscardPile';
import DocsModal, { type DocsModalProps } from '../../src/docs/DocsModal';
import Workspace from '../../src/workspace/Workspace';
import type { Idea } from '../../src/types';
import {
  CaptureIdeaPopover,
  type CaptureIdeaPopoverProps,
} from './CaptureIdeaPopover';

type WorkspaceComponentProps = React.ComponentProps<typeof Workspace>;

export interface BoardWorkspaceOverlaysProps {
  ideas: Idea[];
  discardedIdeas: DiscardPileProps['ideas'];
  selectedBoardIdea: WorkspaceComponentProps['idea'] | null;
  docsIdeaId: string | null;
  boardId: DocsModalProps['boardId'];
  docCounts: Record<string, number>;
  supportingDocMutations: DocsModalProps['docMutations'];
  capturePopover: CaptureIdeaPopoverProps;
  onRestoreDiscardedIdea: DiscardPileProps['onRestore'];
  onPreviewDiscardedIdea?: DiscardPileProps['onPreview'];
  onCloseDocs: () => void;
  onDocsChanged?: DocsModalProps['onDocsChanged'];
  onCloseWorkspace: () => void;
  onWorkspaceUpdate?: WorkspaceComponentProps['onUpdate'];
  onWorkspaceOpenDocs?: WorkspaceComponentProps['onOpenDocs'];
}

function findDocsIdea(ideas: Idea[], docsIdeaId: string | null): Idea | null {
  if (!docsIdeaId) return null;
  return ideas.find(idea => idea.id === docsIdeaId) ?? null;
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
  onRestoreDiscardedIdea,
  onPreviewDiscardedIdea,
  onCloseDocs,
  onDocsChanged,
  onCloseWorkspace,
  onWorkspaceUpdate,
  onWorkspaceOpenDocs,
}: BoardWorkspaceOverlaysProps): React.ReactElement {
  const docsIdea = findDocsIdea(ideas, docsIdeaId);

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
        <>
          <div
            className="absolute inset-0 bg-black/20 z-30"
            onClick={onCloseWorkspace}
            aria-hidden="true"
          />
          <aside
            className="absolute top-0 right-0 h-full w-full sm:w-[640px] max-w-full bg-white shadow-2xl z-40 border-l border-gray-200 flex flex-col"
            aria-label="Workspace"
          >
            <div className="shrink-0 flex items-center justify-end px-3 py-2 border-b border-gray-100">
              <button
                type="button"
                onClick={onCloseWorkspace}
                className="text-sm text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1"
                aria-label="Back to canvas"
              >
                ← Back to canvas
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <Workspace
                idea={selectedBoardIdea}
                onUpdate={onWorkspaceUpdate}
                docCount={docCounts[selectedBoardIdea.id] ?? 0}
                onOpenDocs={onWorkspaceOpenDocs}
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
