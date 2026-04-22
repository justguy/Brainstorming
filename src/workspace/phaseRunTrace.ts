import type { LlmMessage } from '../types';

export interface PhaseRunTrace {
  entry: LlmMessage;
  phaseLabel: string;
  roleLabel: string;
  providerLabel: string;
  toolSummary: string;
  content: string;
}

function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function formatTurnEntryContent(entry: LlmMessage): string {
  if (!isJsonContent(entry.content)) return entry.content;
  try {
    return JSON.stringify(JSON.parse(entry.content), null, 2);
  } catch {
    return entry.content;
  }
}

export function summarizeToolUsage(entry: LlmMessage): string {
  const toolNames = entry.meta?.liveToolNames ?? [];
  if (entry.meta?.runSurface === 'webmcp_tool') {
    return toolNames.length > 0
      ? `WebMCP tool: ${toolNames.join(', ')}`
      : 'WebMCP tool run';
  }
  if (toolNames.length > 0) {
    return `No external tool invoked. Active-tab tools visible: ${toolNames.join(', ')}.`;
  }
  return 'No external tool invoked for this step.';
}

function phaseLabel(entry: LlmMessage): string {
  if (entry.meta?.phaseLabel) return entry.meta.phaseLabel;
  if (typeof entry.meta?.phase === 'number') return `Step ${entry.meta.phase}`;
  const legacyMatch = entry.content.match(/\[Step ([^\]]+)\]/);
  return legacyMatch ? `Step ${legacyMatch[1]}` : 'Step run';
}

function roleLabel(entry: LlmMessage): string {
  if (entry.meta?.roleId) return entry.meta.roleId;
  const legacyMatch = entry.content.match(/Running role:\s*([^\n]+)/i);
  return legacyMatch?.[1]?.trim() ?? 'llm role';
}

function providerLabel(entry: LlmMessage): string {
  if (entry.meta?.provider && entry.meta?.model) {
    return `${entry.meta.provider}/${entry.meta.model}`;
  }
  if (entry.meta?.provider) return entry.meta.provider;
  return 'provider not recorded';
}

export function findLatestPhaseRun(entries: LlmMessage[]): PhaseRunTrace | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role !== 'assistant') continue;
    if (
      entry.meta?.source === 'phase_run' ||
      entry.meta?.entryKind === 'result' ||
      entry.meta?.entryKind === 'fallback' ||
      isJsonContent(entry.content)
    ) {
      const legacyContext = entries
        .slice(0, index)
        .reverse()
        .find(candidate => candidate.role === 'system' && /Running role:/i.test(candidate.content));
      return {
        entry,
        phaseLabel: phaseLabel(entry.meta ? entry : (legacyContext ?? entry)),
        roleLabel: roleLabel(entry.meta ? entry : (legacyContext ?? entry)),
        providerLabel: providerLabel(entry),
        toolSummary: summarizeToolUsage(entry),
        content: formatTurnEntryContent(entry),
      };
    }
  }
  return null;
}
