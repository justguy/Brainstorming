import React, { useState } from 'react';

interface PhaseSectionProps {
  phaseNumber: number;
  title: string;
  locked?: boolean;
  active?: boolean;
  children?: React.ReactNode;
}

export default function PhaseSection({
  phaseNumber,
  title,
  locked = false,
  active = false,
  children,
}: PhaseSectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(!locked);

  function handleToggle() {
    if (!locked) setExpanded(prev => !prev);
  }

  const borderColor = active
    ? 'border-violet-400'
    : locked
    ? 'border-gray-200'
    : 'border-gray-300';

  return (
    <section
      className={`rounded-lg border ${borderColor} mb-3 overflow-hidden`}
      aria-labelledby={`phase-${phaseNumber}-heading`}
    >
      <button
        id={`phase-${phaseNumber}-heading`}
        type="button"
        onClick={handleToggle}
        disabled={locked}
        aria-expanded={!locked && expanded}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
          ${active ? 'bg-violet-50' : locked ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}
          ${locked ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center
              ${active ? 'bg-violet-600 text-white' : locked ? 'bg-gray-200 text-gray-500' : 'bg-gray-700 text-white'}`}
            aria-hidden="true"
          >
            {phaseNumber}
          </span>
          <span
            className={`text-sm font-medium ${locked ? 'text-gray-400' : active ? 'text-violet-800' : 'text-gray-800'}`}
          >
            {title}
          </span>
          {active && (
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {locked ? (
            <span className="text-xs text-gray-400 flex items-center gap-1" aria-label="Locked">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              Locked
            </span>
          ) : (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {!locked && expanded && (
        <div className="px-4 py-3 border-t border-gray-100">
          {children ?? <p className="text-sm text-gray-500">No content yet.</p>}
        </div>
      )}
    </section>
  );
}
