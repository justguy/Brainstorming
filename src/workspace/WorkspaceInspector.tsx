import React, { useEffect, useState } from 'react';
import type { Density, Idea } from '../types';
import { getSettings } from '../storage/settings';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ChallengesList from './ChallengesList';
import { createLegacyWorkspaceAdapter } from './legacyPhaseAdapter';
import LensGrid from './LensGrid';
import Markdown from './markdown';
import PhaseSection from './PhaseSection';
import StressTestTiles from './StressTestTiles';

export interface WorkspaceInspectorProps {
  idea: Idea;
  onUpdate?: (updated: Idea) => void;
  docCount?: number;
  onOpenDocs?: (ideaId: string) => void;
}

export function WorkspaceInspector({
  idea: initialIdea,
  onUpdate,
  docCount = 0,
  onOpenDocs,
}: WorkspaceInspectorProps): React.ReactElement {
  const [idea, setIdea] = useState<Idea>(initialIdea);
  const [density, setDensity] = useState<Density>('standard');
  const [exported, setExported] = useState(false);
  const phaseAdapter = createLegacyWorkspaceAdapter(idea);
  const { activeSpec, currentPhase } = phaseAdapter;

  useEffect(() => {
    setIdea(initialIdea);
  }, [initialIdea]);

  useEffect(() => {
    getSettings().then(settings => setDensity(settings.density)).catch(() => {});
  }, []);

  function handleIdeaUpdate(updated: Idea): void {
    setIdea(updated);
    onUpdate?.(updated);
  }

  async function handleExport(): Promise<void> {
    if (!idea.artifactMd) return;

    const blob = new Blob([idea.artifactMd], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `handoff_${slugify(idea.rawText || idea.id)}.md`;

    try {
      await navigator.clipboard.writeText(idea.artifactMd);
    } catch {
      // Copying is a convenience, not a hard requirement.
    }

    if (typeof chrome !== 'undefined' && chrome.downloads) {
      chrome.downloads.download({ url, filename }, () => {
        URL.revokeObjectURL(url);
      });
    } else {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    setExported(true);
    window.setTimeout(() => setExported(false), 3000);
  }

  function renderMicroReadOnly(key: string): React.ReactNode {
    if (key === 'lens') return <LensGrid idea={idea} onUpdate={handleIdeaUpdate} />;
    if (key === 'challenge') return <ChallengesList idea={idea} onUpdate={handleIdeaUpdate} />;
    if (key === 'stress') return <StressTestTiles idea={idea} onUpdate={handleIdeaUpdate} />;
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight text-gray-900">
              {idea.rawText.slice(0, 80)}{idea.rawText.length > 80 ? '…' : ''}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge color={idea.readiness}>{idea.readiness}</Badge>
              <span className="text-xs text-gray-500">
                Step {currentPhase} / 8 — {activeSpec?.label ?? 'Unknown'}
              </span>
              {activeSpec?.kind === 'micro' && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                  Micro
                </span>
              )}
              {idea.providerUsed && (
                <span className="text-xs text-gray-400">{idea.providerUsed}</span>
              )}
            </div>
            {idea.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {idea.tags.map(tag => (
                  <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={density}
              onChange={event => setDensity(event.target.value as Density)}
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
              aria-label="Density view override"
              title="Override output density for this inspector view"
            >
              <option value="simple">Simple</option>
              <option value="standard">Standard</option>
              <option value="expert">Expert</option>
            </select>
            {onOpenDocs && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenDocs(idea.id)}
                aria-label="Open supporting docs"
                title="Attach reference material the orchestrator can cite during phases."
              >
                Docs{docCount > 0 ? ` (${docCount})` : ''}
              </Button>
            )}
            <Button
              variant={exported ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                void handleExport();
              }}
              disabled={idea.readiness !== 'green' || !idea.artifactMd}
              aria-label="Export handoff document"
              title={idea.readiness !== 'green' ? 'Export is available once readiness is green' : 'Download handoff document and copy to clipboard'}
            >
              {exported ? 'Copied!' : 'Export'}
            </Button>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-violet-100 bg-violet-50/70 px-5 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
          Secondary inspector
        </p>
        <p className="mt-1 text-sm leading-snug text-violet-900">
          The active brainstorm loop now runs on the board. Use this drawer to review the full phase trail,
          attached docs, and export when the idea is ready.
        </p>
      </div>

      {idea.liveToolContext && idea.liveToolContext.tools.length > 0 && (
        <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            Live context snapshot
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {idea.liveToolContext.origin} exposed {idea.liveToolContext.tools.length} tool
            {idea.liveToolContext.tools.length === 1 ? '' : 's'} from <em>{idea.liveToolContext.title}</em>.
          </p>
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
        {phaseAdapter.sections.map(section => (
          <div
            key={section.spec.id}
            className={section.isMicro ? 'ml-2 border-l-2 border-violet-200 pl-6' : ''}
          >
            <PhaseSection
              phaseNumber={section.phaseNumber}
              title={section.title}
              locked={section.isLocked}
              active={section.isActive}
            >
              {!section.isLocked && !section.isActive && !section.isMicro && section.artifactContent && (
                <Markdown content={section.artifactContent} density={density} />
              )}

              {!section.isLocked && !section.isActive && section.isMicro && renderMicroReadOnly(section.spec.componentKey)}

              {section.isActive && (
                <div className="space-y-4">
                  {!section.isMicro && section.artifactContent && (
                    <Markdown content={section.artifactContent} density={density} />
                  )}
                  {section.isMicro && renderMicroReadOnly(section.spec.componentKey)}
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900">
                    Continue this step from the board focus dock to keep the canvas visible while the idea moves.
                  </div>
                </div>
              )}
            </PhaseSection>
          </div>
        ))}
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
