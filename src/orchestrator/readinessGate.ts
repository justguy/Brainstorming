import type { Idea, ProviderId } from '../types';
import { buildPayload, payloadToMessages } from './ctmcp';
import { callWithRetry } from './retryAndFallback';
import { readinessJudge } from './roles/readinessJudge';
// Phase 3 fix: static import instead of dynamic import (settings.ts is stable)
import { getSettings } from '../storage/settings';

export interface ReadinessResult {
  ready: boolean;
  blockers: string[];
}

export async function checkReadiness(idea: Idea): Promise<ReadinessResult> {
  // Get provider/model from settings — API key stays in the service worker.
  let activeProvider: ProviderId = 'gemini';
  let activeModel = 'gemini-2.5-pro';

  try {
    const settings = await getSettings();
    activeProvider = settings.activeProvider;
    activeModel = settings.activeModel;
  } catch (e) {
    console.warn('[readinessGate] Could not load settings:', e);
  }

  const task = readinessJudge.buildTask(idea);
  const payload = buildPayload(readinessJudge, idea, task);
  const messages = payloadToMessages(payload);

  const { result, usedFallback } = await callWithRetry({
    providerId: activeProvider,
    model: activeModel,
    messages,
    jsonSchema: readinessJudge.jsonSchema,
    maxTokens: 1024,
    schema: readinessJudge.schema,
  });

  if (usedFallback || result === null) {
    return { ready: false, blockers: ['Readiness check failed — manual review required.'] };
  }

  return {
    ready: result.ready ?? false,
    blockers: result.blockers ?? [],
  };
}
