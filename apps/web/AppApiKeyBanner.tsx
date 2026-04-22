import React from 'react';

interface AppApiKeyBannerProps {
  onOpenOptions: () => void;
}

export function AppApiKeyBanner({ onOpenOptions }: AppApiKeyBannerProps): React.ReactElement {
  return (
    <div className="shrink-0 mx-5 my-3 rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
      <span>
        <strong>No provider configured.</strong>{' '}
        Add an API key in Options to start brainstorming.
      </span>
      <button
        type="button"
        className="underline hover:text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500 rounded"
        onClick={onOpenOptions}
      >
        Open Options
      </button>
    </div>
  );
}
