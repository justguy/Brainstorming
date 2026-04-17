import React, { useEffect, useState } from 'react';
import type { Density, Idea, LlmMessage } from '../types';
import { advance } from '../orchestrator/stateMachine';
import { SUB_PHASES, findSubPhase } from '../orchestrator/subPhases';
import { getSettings } from '../storage/settings';
import { updateIdea } from '../storage/ideas';
import { invokeActiveTabTool } from '../webmcp/contextBridge';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import PhaseSection from './PhaseSection';
import Markdown from './markdown';
import PremortemQuestions from './fallbacks/PremortemQuestions';
import ApproachTemplate from './fallbacks/ApproachTemplate';
import LensGrid from './LensGrid';
import ChallengesList from './ChallengesList';
import StressTestTiles from './StressTestTiles';

function slugify(text: string): string {
  // Phase 3 fix: spec says first 40 chars, kebab-cased
  return text
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface WorkspaceProps {
  idea: Idea;
  onUpdate?: (updated: Idea) => void;
  docCount?: number;
  onOpenDocs?: (ideaId: string) => void;
}

export default function Workspace({ idea: initialIdea, onUpdate, docCount = 0, onOpenDocs }: WorkspaceProps): React.ReactElement {
  const [idea, setIdea] = useState<Idea>(initialIdea);
  const [userInput, setUserInput] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('standard');
  const [exported, setExported] = useState(false);

  // Live tool context panel state
  const [liveContextOpen, setLiveContextOpen] = useState(false);
  const [invokeToolName, setInvokeToolName] = useState<string | null>(null);
  const [invokeInputText, setInvokeInputText] = useState('{}');
  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  // Sync prop changes (e.g. re-selection from list)
  useEffect(() => {
    setIdea(initialIdea);
    setUserInput('');
    setAdvanceError(null);
  }, [initialIdea.id]);

  useEffect(() => {
    getSettings().then(s => setDensity(s.density)).catch(() => {});
  }, []);

  function handleIdeaUpdate(updated: Idea) {
    setIdea(updated);
    onUpdate?.(updated);
  }

  async function handleAdvance(skip = false) {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const updated: Idea = await advance(idea, userInput.trim(), skip);
      setUserInput('');
      await updateIdea(updated.id, updated);
      handleIdeaUpdate(updated);
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleExport() {
    if (!idea.artifactMd) return;
    const slug = slugify(idea.rawText || idea.id);
    const filename = `handoff_${slug}.md`;
    const content = idea.artifactMd;

    // Copy to clipboard (always attempt, non-fatal)
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // non-fatal
    }

    // Phase 3 fix: prefer chrome.downloads (manifest has permission), fall back to
    // blob anchor element for contexts where chrome.downloads is unavailable.
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      // chrome.downloads.download keeps the object URL alive until the download starts
      chrome.downloads.download({ url, filename }, () => {
        URL.revokeObjectURL(url);
      });
    } else {
      // Fallback: anchor element download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    setExported(true);
    setTimeout(() => setExported(false), 3000);
  }

  async function handleInvokeTool(toolName: string) {
    setInvoking(true);
    setInvokeError(null);
    let parsedInput: unknown = {};
    try {
      parsedInput = JSON.parse(invokeInputText);
    } catch {
      setInvokeError('Invalid JSON input');
      setInvoking(false);
      return;
    }

    try {
      const result = await invokeActiveTabTool(toolName, parsedInput);
      const messageContent = result.error
        ? `Tool ${toolName} returned an error: ${result.error}`
        : `Tool ${toolName} returned: ${JSON.stringify(result.output, null, 2)}`;

      const toolMessage: LlmMessage = { role: 'user', content: messageContent };
      const now = Date.now();
      const updated: Idea = {
        ...idea,
        turnLog: [...idea.turnLog, toolMessage],
        updatedAt: now,
        lastTurnAt: now,
      };
      await updateIdea(updated.id, updated);
      handleIdeaUpdate(updated);
      setInvokeToolName(null);
      setInvokeInputText('{}');
    } catch (err) {
      setInvokeError(err instanceof Error ? err.message : String(err));
    } finally {
      setInvoking(false);
    }
  }

  const currentPhase = idea.phase as number;
  const activeSpec = findSubPhase(currentPhase);
  const showFallback = idea.readiness === 'yellow';

  function renderActivePhaseInput(): React.ReactNode {
    if (!activeSpec) return null;

    // Fallback yellow-path UIs take priority when readiness is yellow at main phases
    if (showFallback && activeSpec.componentKey === 'premortem') {
      return <PremortemQuestions idea={idea} onUpdate={handleIdeaUpdate} />;
    }
    if (showFallback && activeSpec.componentKey === 'approach') {
      return <ApproachTemplate idea={idea} onUpdate={handleIdeaUpdate} />;
    }

    // Micro-step interactive views (no user-text input required to advance)
    if (activeSpec.componentKey === 'lens') {
      return (
        <div className="space-y-3">
          <LensGrid idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow(activeSpec.role ? 'Surface more angles' : 'Continue', 'Skip this lens')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'challenge') {
      return (
        <div className="space-y-3">
          <ChallengesList idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow('Surface more challenges', 'Skip devils advocate')}
        </div>
      );
    }
    if (activeSpec.componentKey === 'stress') {
      return (
        <div className="space-y-3">
          <StressTestTiles idea={idea} onUpdate={handleIdeaUpdate} />
          {renderAdvanceRow('Generate more stress tests', 'Skip stress-test')}
        </div>
      );
    }

    // User-text input required (clarifications, approach selection, rules amendments)
    if (activeSpec.expectsUserInput) {
      return (
        <div className="space-y-3">
          {activeSpec.componentKey === 'approach' && idea.clarifications.length > 0 && (
            <div className="space-y-2 mb-3">
              {idea.clarifications.map(q => (
                <div key={q.id} className="text-sm text-gray-700">
                  <p className="font-medium">{q.question}</p>
                  {q.answer && (
                    <p className="text-gray-500 text-xs mt-0.5 italic">Answered: {q.answer}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <label htmlFor="phase-user-input" className="block text-sm font-medium text-gray-700">
            {activeSpec.componentKey === 'approach'
              ? 'Your answers to the clarification questions'
              : activeSpec.componentKey === 'rules'
              ? 'Which approach do you prefer, and why?'
              : 'Your input for this step'}
          </label>
          <textarea
            id="phase-user-input"
            rows={5}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="Type your response here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
          />
          {advanceError && (
            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
              {advanceError}
            </p>
          )}
          <Button
            variant="primary"
            onClick={() => handleAdvance(false)}
            disabled={advancing || !userInput.trim()}
          >
            {advancing ? 'Processing…' : 'Submit'}
          </Button>
        </div>
      );
    }

    // Default: AI-only step, single Run button
    if (activeSpec.componentKey !== 'done') {
      return renderAdvanceRow('Run this step', activeSpec.skippable ? 'Skip this step' : undefined);
    }
    return null;
  }

  function renderMicroReadOnly(key: string): React.ReactNode {
    if (key === 'lens') return <LensGrid idea={idea} onUpdate={handleIdeaUpdate} />;
    if (key === 'challenge') return <ChallengesList idea={idea} onUpdate={handleIdeaUpdate} />;
    if (key === 'stress') return <StressTestTiles idea={idea} onUpdate={handleIdeaUpdate} />;
    return null;
  }

  function renderAdvanceRow(primaryLabel: string, skipLabel?: string): React.ReactNode {
    return (
      <div className="space-y-2">
        {advanceError && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1" role="alert">
            {advanceError}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="primary"
            onClick={() => handleAdvance(false)}
            disabled={advancing}
          >
            {advancing ? 'Processing…' : primaryLabel}
          </Button>
          {skipLabel && activeSpec?.skippable && (
            <Button
              variant="ghost"
              onClick={() => handleAdvance(true)}
              disabled={advancing}
              title="Move on without running the AI for this micro-step"
            >
              {skipLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate leading-tight">
              {idea.rawText.slice(0, 80)}{idea.rawText.length > 80 ? '…' : ''}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge color={idea.readiness}>{idea.readiness}</Badge>
              <span className="text-xs text-gray-500">
                Step {currentPhase} / 8 — {activeSpec?.label ?? 'Unknown'}
              </span>
              {activeSpec?.kind === 'micro' && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">
                  Micro
                </span>
              )}
              {idea.providerUsed && (
                <span className="text-xs text-gray-400">{idea.providerUsed}</span>
              )}
            </div>
            {idea.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {idea.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Phase 3: per-workspace density override (session only, not persisted) */}
          <select
            value={density}
            onChange={e => setDensity(e.target.value as Density)}
            className="text-xs rounded border border-gray-200 px-1.5 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            aria-label="Density view override"
            title="Override output density for this workspace view (not saved)"
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
              title="Attach reference material (PRD excerpts, notes, quotes) the orchestrator will cite during phases."
            >
              📎 Docs{docCount > 0 ? ` (${docCount})` : ''}
            </Button>
          )}
          <Button
            variant={exported ? 'secondary' : 'ghost'}
            size="sm"
            onClick={handleExport}
            disabled={idea.readiness !== 'green' || !idea.artifactMd}
            aria-label="Export handoff document"
            title={idea.readiness !== 'green' ? 'Export is available once readiness is green' : 'Download handoff document and copy to clipboard'}
          >
            {exported ? 'Copied!' : 'Export'}
          </Button>
        </div>
      </header>

      {/* Live tool context panel */}
      {idea.liveToolContext && idea.liveToolContext.tools.length > 0 && (
        <div className="shrink-0 border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500"
            onClick={() => setLiveContextOpen(v => !v)}
            aria-expanded={liveContextOpen}
          >
            <span>
              Live context from{' '}
              <span className="font-mono text-xs">{idea.liveToolContext.origin}</span>
              {' '}— {idea.liveToolContext.tools.length} tool{idea.liveToolContext.tools.length !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-400 text-xs">{liveContextOpen ? '▲' : '▼'}</span>
          </button>

          {liveContextOpen && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-gray-500">
                Tab: <em>{idea.liveToolContext.title}</em> — retrieved {new Date(idea.liveToolContext.retrievedAt).toLocaleTimeString()}
              </p>
              <ul className="space-y-2">
                {idea.liveToolContext.tools.map(tool => (
                  <li key={tool.name} className="border border-gray-200 rounded-md bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 font-mono">{tool.name}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{tool.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setInvokeToolName(tool.name);
                          setInvokeInputText('{}');
                          setInvokeError(null);
                        }}
                      >
                        Invoke
                      </Button>
                    </div>

                    {/* Inline invocation modal for this tool */}
                    {invokeToolName === tool.name && (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                        <label className="block text-xs font-medium text-gray-600">
                          JSON input
                        </label>
                        <textarea
                          rows={3}
                          value={invokeInputText}
                          onChange={e => setInvokeInputText(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
                          placeholder="{}"
                          aria-label={`JSON input for ${tool.name}`}
                        />
                        {invokeError && (
                          <p className="text-xs text-red-600" role="alert">{invokeError}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleInvokeTool(tool.name)}
                            disabled={invoking}
                          >
                            {invoking ? 'Invoking…' : 'Run'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setInvokeToolName(null); setInvokeError(null); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Phase sections */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {SUB_PHASES.map(spec => {
          const p = spec.number;
          const isLocked = p > currentPhase;
          const isActive = Math.abs(p - currentPhase) < 1e-9;
          const isMicro = spec.kind === 'micro';
          const title = isMicro ? `${spec.label} (optional)` : spec.label;

          return (
            <div
              key={spec.id}
              className={isMicro ? 'pl-6 border-l-2 border-violet-200 ml-2' : ''}
            >
              <PhaseSection
                phaseNumber={p}
                title={title}
                locked={isLocked}
                active={isActive}
              >
                {/* Render markdown artifact for completed main phases */}
                {!isLocked && !isActive && !isMicro && idea.artifactMd && (
                  <Markdown
                    content={extractPhaseSection(idea.artifactMd, Math.floor(p))}
                    density={density}
                  />
                )}

                {/* Completed micro-step: show micro-specific UI in read-only mode via same component */}
                {!isLocked && !isActive && isMicro && renderMicroReadOnly(spec.componentKey)}

                {/* Active phase: show full artifact so far + interactive input */}
                {isActive && (
                  <div className="space-y-4">
                    {!isMicro && idea.artifactMd && (
                      <Markdown
                        content={extractPhaseSection(idea.artifactMd, Math.floor(p))}
                        density={density}
                      />
                    )}
                    {renderActivePhaseInput()}
                  </div>
                )}
              </PhaseSection>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Extract the content for a specific phase from the full artifactMd.
 * Looks for a heading like `## Phase N:` and returns its content until the next `## Phase`.
 * Falls back to full content if nothing matches.
 */
function extractPhaseSection(artifactMd: string, phase: number): string {
  const lines = artifactMd.split('\n');
  const phaseHeading = new RegExp(`^##\\s+Phase\\s+${phase}[^0-9]`, 'i');
  const nextPhaseHeading = /^##\s+Phase\s+\d/i;

  let inside = false;
  const out: string[] = [];

  for (const line of lines) {
    if (!inside && phaseHeading.test(line)) {
      inside = true;
      out.push(line);
      continue;
    }
    if (inside) {
      if (nextPhaseHeading.test(line) && !phaseHeading.test(line)) break;
      out.push(line);
    }
  }

  return out.length > 0 ? out.join('\n') : artifactMd;
}
