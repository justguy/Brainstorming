import type { ProviderId } from '../types';
import type { BaseProvider } from './BaseProvider';
import { geminiProvider } from './geminiProvider';
import { openaiProvider } from './openaiProvider';
import { anthropicProvider } from './anthropicProvider';

export const ALL_PROVIDERS: BaseProvider[] = [
  geminiProvider,
  openaiProvider,
  anthropicProvider,
];

const PROVIDER_MAP: Record<ProviderId, BaseProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

export function selectProvider(id: ProviderId): BaseProvider {
  const p = PROVIDER_MAP[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function getDefaultModel(id: ProviderId): string {
  const defaults: Record<ProviderId, string> = {
    gemini: 'gemini-2.5-pro',
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-6',
  };
  return defaults[id];
}

export { geminiProvider, openaiProvider, anthropicProvider };
export type { BaseProvider, LlmCallArgs, LlmCallResult } from './BaseProvider';
