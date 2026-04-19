import React from 'react';
import type { BoardThemeMode } from '../../src/types';

export interface AppHeaderBarHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  cursor: number;
  nextSeq: number;
}

export interface AppHeaderBarProps {
  advancingFromTool: boolean;
  boardTheme: BoardThemeMode;
  canvasBusy: string | null;
  historyState: AppHeaderBarHistoryState;
  historyOpen: boolean;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
  onToggleHistory: () => void;
  onSetBoardTheme: (theme: BoardThemeMode) => void | Promise<void>;
  onOpenOptions: () => void;
}

export function AppHeaderBar({
  advancingFromTool,
  boardTheme,
  canvasBusy,
  historyState,
  historyOpen,
  onUndo,
  onRedo,
  onToggleHistory,
  onSetBoardTheme,
  onOpenOptions,
}: AppHeaderBarProps): React.ReactElement {
  const webMcpAvailable = typeof window !== 'undefined' && Boolean(window.navigator.modelContext);
  const totalChanges = Math.max(0, historyState.nextSeq - 1);

  return (
    <header className="bo-topbar shrink-0 flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold text-gray-900">Brainstorming Orchestrator</span>
        {advancingFromTool && (
          <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            Agent driving…
          </span>
        )}
        {canvasBusy && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            {canvasBusy}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="bo-theme-toggle flex items-center gap-1 rounded-full p-1" role="group" aria-label="Board theme">
          {(['whiteboard', 'sketch'] as const).map(theme => (
            <button
              key={theme}
              type="button"
              onClick={() => {
                void onSetBoardTheme(theme);
              }}
              className="bo-theme-button rounded-full px-3 py-1 text-xs font-semibold capitalize"
              data-active={boardTheme === theme}
              aria-pressed={boardTheme === theme}
            >
              {theme}
            </button>
          ))}
        </div>

        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            webMcpAvailable
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
          title={
            webMcpAvailable
              ? 'WebMCP is available — agentic browsers can drive this app'
              : 'WebMCP not detected — direct use only'
          }
        >
          {webMcpAvailable ? 'WebMCP active' : 'WebMCP unavailable'}
        </span>

        <button
          type="button"
          onClick={() => {
            void onUndo();
          }}
          disabled={!historyState.canUndo}
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1 disabled:opacity-40"
        >
          Undo
        </button>

        <button
          type="button"
          onClick={() => {
            void onRedo();
          }}
          disabled={!historyState.canRedo}
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1 disabled:opacity-40"
        >
          Redo
        </button>

        <button
          type="button"
          onClick={onToggleHistory}
          className={`text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1 ${
            historyOpen
              ? 'bg-violet-50 text-violet-700'
              : 'text-gray-600 hover:text-gray-900'
          }`}
          title={totalChanges > 0 ? `Viewing ${historyState.cursor} of ${totalChanges} applied changes.` : 'No durable change history yet.'}
        >
          History {totalChanges > 0 ? `(${historyState.cursor}/${totalChanges})` : ''}
        </button>

        <button
          type="button"
          onClick={onOpenOptions}
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-2 py-1"
        >
          Options
        </button>
      </div>
    </header>
  );
}
