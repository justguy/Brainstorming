import React from 'react';
import type { BoardThemeMode } from '../../src/types';

export interface AppHeaderBarHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  cursor: number;
  nextSeq: number;
}

export interface AppHeaderBarCaptureFeedback {
  tone: 'success' | 'error';
  message: string;
}

export interface AppHeaderBarProps {
  advancingFromTool: boolean;
  boardTheme: BoardThemeMode;
  captureActionLabel?: string | null;
  canvasBusy: string | null;
  captureFeedback: AppHeaderBarCaptureFeedback | null;
  captureOpen: boolean;
  creating: boolean;
  historyState: AppHeaderBarHistoryState;
  historyOpen: boolean;
  onCaptureAction?: () => void;
  onOpenCapture: () => void;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
  onToggleHistory: () => void;
  onSetBoardTheme: (theme: BoardThemeMode) => void | Promise<void>;
  onOpenOptions: () => void;
}

export function AppHeaderBar({
  advancingFromTool,
  boardTheme,
  captureActionLabel,
  canvasBusy,
  captureFeedback,
  captureOpen,
  creating,
  historyState,
  historyOpen,
  onCaptureAction,
  onOpenCapture,
  onUndo,
  onRedo,
  onToggleHistory,
  onSetBoardTheme,
  onOpenOptions,
}: AppHeaderBarProps): React.ReactElement {
  const webMcpAvailable = typeof window !== 'undefined' && Boolean(window.navigator.modelContext);
  const totalChanges = Math.max(0, historyState.nextSeq - 1);

  return (
    <header className="bo-topbar shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
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
        {captureFeedback && (
          <div
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
              captureFeedback.tone === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
            role="status"
          >
            <span>{captureFeedback.message}</span>
            {captureActionLabel && onCaptureAction && (
              <button
                type="button"
                onClick={onCaptureAction}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition focus:outline-none focus:ring-2 ${
                  captureFeedback.tone === 'success'
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 focus:ring-emerald-300'
                    : 'bg-rose-100 text-rose-800 hover:bg-rose-200 focus:ring-rose-300'
                }`}
              >
                {captureActionLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onOpenCapture}
          aria-pressed={captureOpen}
          className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-violet-300 ${
            captureOpen
              ? 'bg-violet-700 hover:bg-violet-800'
              : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          {creating ? 'Adding…' : 'New note'}
        </button>

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
