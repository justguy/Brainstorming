/**
 * adhocRole.ts — invoke an LLM role outside the main sub-phase state machine.
 *
 * Used by the canvas for:
 *  - groupThemer: when panels get dropped near each other
 *  - ideaMerger: when a panel is held on top of another for 2 seconds
 *
 * Unlike stateMachine.advance(), adhoc roles don't mutate idea.phase or idea.turnLog.
 * Callers are responsible for persisting the output however they like.
 */

import type { RoleSpec } from './ctmcp';
import { getSettings } from '../storage/settings';
import { callWithRetry } from './retryAndFallback';
import type { LlmMessage, ProviderId } from '../types';

export interface RunRoleResult<T> {
  result: T | null;
  usedFallback: boolean;
  providerId: ProviderId;
  model: string;
  lastError?: Error;
}

interface RunAdhocRoleOptions {
  maxTokens?: number;
}

export async function runAdhocRole<T>(
  role: RoleSpec,
  task: string,
  options: RunAdhocRoleOptions = {},
): Promise<RunRoleResult<T>> {
  let activeProvider: ProviderId = 'gemini';
  let activeModel = 'gemini-2.5-pro';
  try {
    const settings = await getSettings();
    activeProvider = settings.activeProvider;
    activeModel = settings.activeModel;
  } catch (e) {
    console.warn('[adhocRole] Could not load settings, using defaults:', e);
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: role.systemPrompt + '\n\nReturn ONLY valid JSON matching the schema. No prose, no markdown fences.' },
    { role: 'user', content: task },
  ];

  const { result, usedFallback, lastError } = await callWithRetry({
    providerId: activeProvider,
    model: activeModel,
    messages,
    jsonSchema: role.jsonSchema,
    maxTokens: options.maxTokens ?? 2048,
    schema: role.schema,
    onFallback: () => console.warn(`[adhocRole] Fallback triggered for ${role.id}`),
  });

  return {
    result: result as T | null,
    usedFallback,
    providerId: activeProvider,
    model: activeModel,
    lastError,
  };
}
