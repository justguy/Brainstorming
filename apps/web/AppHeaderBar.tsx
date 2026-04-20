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
  boardTitle?: string;
  captureActionLabel?: string | null;
  canvasBusy: string | null;
  captureFeedback: AppHeaderBarCaptureFeedback | null;
  captureOpen: boolean;
  creating: boolean;
  historyState: AppHeaderBarHistoryState;
  historyOpen: boolean;
  linkModeEnabled: boolean;
  onCaptureAction?: () => void;
  onOpenCapture: () => void;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
  onToggleLinkMode: () => void;
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
  linkModeEnabled,
  onCaptureAction,
  onOpenCapture,
  onUndo,
  onRedo,
  onToggleLinkMode,
  onToggleHistory,
  onSetBoardTheme,
  onOpenOptions,
  boardTitle = 'Brainstorm Canvas',
}: AppHeaderBarProps): React.ReactElement {
  const webMcpAvailable = typeof window !== 'undefined' && Boolean(window.navigator.modelContext);
  const totalChanges = Math.max(0, historyState.nextSeq - 1);
  const visibleBoardTitle = boardTitle.trim() || 'Brainstorm Canvas';

  return (
    <header className="bo-topbar">
      <div className="bo-topbar-left">
        <span className="bo-board-title-chip" title={visibleBoardTitle}>
          {visibleBoardTitle}
        </span>
        <span className="bo-mini-chip">Board shell</span>

        {advancingFromTool && (
          <span className="bo-mini-chip bo-mini-chip-warning">
            Agent driving
          </span>
        )}
        {canvasBusy && (
          <span className="bo-mini-chip bo-mini-chip-muted">
            {canvasBusy}
          </span>
        )}
        <span className={`bo-mini-chip ${webMcpAvailable ? 'bo-mini-chip-success' : 'bo-mini-chip-muted'}`}>
          {webMcpAvailable ? 'WebMCP active' : 'WebMCP unavailable'}
        </span>

        {captureFeedback && (
          <div
            className={`rounded-full border px-3 py-1 text-xs ${
              captureFeedback.tone === 'success'
                ? 'bo-mini-chip-success'
                : 'bo-mini-chip-error'
            }`}
            role="status"
          >
            <span>{captureFeedback.message}</span>
            {captureActionLabel && onCaptureAction && (
              <button
                type="button"
                onClick={onCaptureAction}
                className="ml-2 rounded-full bg-black/8 px-2 py-0.5 font-semibold"
              >
                {captureActionLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bo-topbar-right">
        <button
          type="button"
          onClick={onOpenCapture}
          aria-pressed={captureOpen}
          data-capture-anchor="bo-capture-portal-anchor"
          className="bo-topbar-primary-action"
        >
          {creating ? 'Adding...' : 'New note'}
        </button>

        <div className="bo-theme-toggle" role="group" aria-label="Board theme">
          {(['whiteboard', 'sketch'] as const).map(theme => (
            <button
              key={theme}
              type="button"
              onClick={() => {
                void onSetBoardTheme(theme);
              }}
              className="bo-theme-button"
              data-active={boardTheme === theme}
              aria-pressed={boardTheme === theme}
            >
              {theme}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            void onUndo();
          }}
          disabled={!historyState.canUndo}
          className="bo-topbar-secondary-action"
        >
          Undo
        </button>

        <button
          type="button"
          onClick={() => {
            void onRedo();
          }}
          disabled={!historyState.canRedo}
          className="bo-topbar-secondary-action"
        >
          Redo
        </button>

        <button
          type="button"
          onClick={onToggleLinkMode}
          className={`bo-topbar-secondary-action ${linkModeEnabled ? 'is-active' : ''}`}
          aria-pressed={linkModeEnabled}
          title="Toggle board-surface link mode"
        >
          Link mode
        </button>

        <button
          type="button"
          onClick={onToggleHistory}
          className={`bo-topbar-secondary-action ${historyOpen ? 'is-active' : ''}`}
          title={totalChanges > 0 ? `Viewing ${historyState.cursor} of ${totalChanges} applied changes.` : 'No durable change history yet.'}
        >
          History {totalChanges > 0 ? `(${historyState.cursor}/${totalChanges})` : ''}
        </button>

        <button
          type="button"
          onClick={onOpenOptions}
          className="bo-topbar-secondary-action"
        >
          Options
        </button>
      </div>
    </header>
  );
}
