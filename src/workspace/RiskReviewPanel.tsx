import React, { useState } from 'react';
import { DEFAULT_BOARD_ID } from '../board/types';
import { createBoardController } from '../storage/boardController';
import type { Idea } from '../types';
import RiskRegister from './RiskRegister';

interface RiskReviewPanelProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
  source: 'canvas' | 'workspace';
  emptyMessage: string;
}

export function RiskReviewPanel({
  idea,
  onUpdate,
  source,
  emptyMessage,
}: RiskReviewPanelProps): React.ReactElement {
  const [saveError, setSaveError] = useState<string | null>(null);
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const sourceLabel = source === 'workspace' ? 'Workspace' : 'Canvas';

  async function persistRiskRegister(updated: Idea): Promise<void> {
    try {
      setSaveError(null);
      const committed = await boardController.updateIdea({
        ideaId: updated.id,
        patch: {
          briefState: {
            ...updated.briefState,
          },
        },
        actor: { type: 'user', source },
        summary: `${sourceLabel} updated risk register`,
      });
      onUpdate(committed.idea);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update risk register.');
    }
  }

  return (
    <div className="space-y-3">
      {idea.briefState.risks.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {emptyMessage}
        </p>
      ) : (
        <RiskRegister
          idea={idea}
          onUpdate={updated => {
            void persistRiskRegister(updated);
          }}
        />
      )}
      {saveError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
