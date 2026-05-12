import React from 'react';

interface AppApiKeyBannerProps {
  onOpenOptions: () => void;
}

export function AppApiKeyBanner({ onOpenOptions }: AppApiKeyBannerProps): React.ReactElement {
  return (
    <div
      className="shrink-0 mx-5 my-3"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--sticky-yellow)',
        border: '2px solid var(--ink)',
        borderRadius: 10,
        boxShadow: '3px 3px 0 var(--ink)',
        color: 'var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 14,
        lineHeight: 1.35,
      }}
    >
      <span>
        <strong
          style={{
            fontFamily: 'var(--f-hand)',
            fontWeight: 700,
            fontSize: 18,
            marginRight: 8,
            letterSpacing: '0.2px',
          }}
        >
          No provider configured.
        </strong>
        Add an API key in Options to start brainstorming.
      </span>
      <button
        type="button"
        className="btn sm"
        onClick={onOpenOptions}
      >
        Open Options
      </button>
    </div>
  );
}
