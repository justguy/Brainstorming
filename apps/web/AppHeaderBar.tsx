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
  boardSubtitle?: string;
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
  boardSubtitle,
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
  boardTitle = 'AI Brainstorming',
}: AppHeaderBarProps): React.ReactElement {
  const normalizedTitle = boardTitle.trim();
  const visibleBoardTitle = !normalizedTitle || normalizedTitle === 'Main Board'
    ? 'AI Brainstorming'
    : normalizedTitle;
  const visibleBoardSubtitle = boardSubtitle?.trim() || `${boardTheme} mode`;
  const nextTheme = boardTheme === 'whiteboard' ? 'sketch' : 'whiteboard';
  const totalChanges = Math.max(0, historyState.nextSeq - 1);
  const statusTone = captureFeedback?.tone
    ?? (canvasBusy ? 'success' : null)
    ?? (advancingFromTool ? 'success' : null);
  const statusMessage = captureFeedback?.message
    ?? canvasBusy
    ?? (advancingFromTool ? 'Agent driving the board' : null);

  return (
    <header className="bo-topbar">
      <div className="bo-topbar-left">
        <div className="bo-brand-pill">
          <span className="bo-brand-lamp" aria-hidden="true">
            <BrandLampIcon />
          </span>
          <span className="bo-brand-copy">
            <span className="bo-brand-title">Brainstorm</span>
            <span className="bo-brand-subtitle">A thinking partner</span>
          </span>
        </div>

        <div className="bo-topbar-util-group">
          <button
            type="button"
            onClick={onToggleHistory}
            className={`bo-topbar-icon-button ${historyOpen ? 'is-active' : ''}`}
            title={totalChanges > 0 ? `Board history (${historyState.cursor}/${totalChanges})` : 'Board history'}
            aria-label="Open board history"
          >
            <ClockIcon />
          </button>
          <button
            type="button"
            onClick={onOpenOptions}
            className="bo-topbar-icon-button"
            title="Open options"
            aria-label="Open options"
          >
            <GearIcon />
          </button>
        </div>
      </div>

      <div className="bo-topbar-center">
        <div className="bo-title-plaque" title={visibleBoardTitle}>
          <span className="bo-title-main">{visibleBoardTitle}</span>
          <span className="bo-title-subtitle">{visibleBoardSubtitle}</span>
        </div>

        {statusMessage && (
          <div className={`bo-topbar-status ${statusTone === 'error' ? 'is-error' : 'is-success'}`} role="status">
            <span>{statusMessage}</span>
            {captureActionLabel && onCaptureAction && (
              <button type="button" onClick={onCaptureAction} className="bo-topbar-status-action">
                {captureActionLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bo-topbar-right">
        <div className="bo-topbar-util-group">
          <button
            type="button"
            onClick={onOpenCapture}
            aria-pressed={captureOpen}
            data-capture-anchor="bo-capture-portal-anchor"
            className="bo-topbar-icon-button"
            title={creating ? 'Adding note' : 'Add note'}
            aria-label="Add note"
          >
            <PlusIcon />
          </button>

          <button
            type="button"
            onClick={onToggleLinkMode}
            className={`bo-topbar-icon-button ${linkModeEnabled ? 'is-active' : ''}`}
            aria-pressed={linkModeEnabled}
            title="Toggle link mode"
            aria-label="Toggle link mode"
          >
            <LinkIcon />
          </button>

          <button
            type="button"
            onClick={() => {
              void onUndo();
            }}
            disabled={!historyState.canUndo}
            className="bo-topbar-icon-button"
            title="Undo"
            aria-label="Undo"
          >
            <UndoIcon />
          </button>

          <button
            type="button"
            onClick={() => {
              void onRedo();
            }}
            disabled={!historyState.canRedo}
            className="bo-topbar-icon-button"
            title="Redo"
            aria-label="Redo"
          >
            <RedoIcon />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            void onSetBoardTheme(nextTheme);
          }}
          className="bo-topbar-theme-pill"
          aria-label={`Switch to ${nextTheme} theme`}
        >
          {boardTheme}
        </button>
      </div>
    </header>
  );
}

function BrandLampIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.5a4.6 4.6 0 0 0-2.78 8.26c.48.37.78.91.82 1.51l.03.36h3.86l.03-.36c.05-.6.34-1.14.82-1.5A4.6 4.6 0 0 0 10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.1 14.4h3.8M8.7 16.6h2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.7v3.5l2.4 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m10 3.1.9 1.46 1.69.32 1.1 1.34-.33 1.7 1.04 1.36-1.04 1.37.33 1.7-1.1 1.33-1.69.33L10 16.9l-1.6-1.48-1.69-.33-1.1-1.33.33-1.7L4.9 10.7l1.04-1.36-.33-1.7 1.1-1.34 1.69-.32L10 3.1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 5.1v9.8M5.1 10h9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 12.5 6.1 14a2.3 2.3 0 1 1-3.25-3.25l2.45-2.46A2.3 2.3 0 0 1 8.56 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m12.5 7.5 1.39-1.39a2.3 2.3 0 1 1 3.25 3.25l-2.45 2.46A2.3 2.3 0 0 1 11.44 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.2 10h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8.1 5 4.5 8.6 8.1 12.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.1 8.6h5.3A4.6 4.6 0 0 1 15 13.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m11.9 5 3.6 3.6-3.6 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.9 8.6H9.6A4.6 4.6 0 0 0 5 13.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
