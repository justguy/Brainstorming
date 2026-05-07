import { z } from 'zod';
import type { ProviderId, LlmMessage } from '../types';
import { callLlmViaSW } from './llmBridge';

export interface LlmErrorEventDetail {
  providerId: ProviderId;
  model: string;
  message: string;
  status?: number;
}

const LLM_ERROR_EVENT = 'brainstorm:llm-error';

function describeError(err: unknown): { message: string; status?: number } {
  if (err instanceof Error) {
    const match = /(\b[1-5]\d\d\b)/.exec(err.message);
    const status = match ? Number(match[1]) : undefined;
    return { message: err.message, status };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: 'Unknown LLM error.' };
  }
}

function dispatchLlmError(detail: LlmErrorEventDetail): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    console.info('[retryAndFallback] dispatching brainstorm:llm-error', detail);
    window.dispatchEvent(new CustomEvent<LlmErrorEventDetail>(LLM_ERROR_EVENT, { detail }));
  } catch (err) {
    console.warn('[retryAndFallback] failed to dispatch error event', err);
  }
}

/**
 * Public helper for callers that did not get a usable LLM result and want to
 * surface a user-visible message via the same banner. Use this when a role
 * returned null without throwing — e.g. retry succeeded but produced unusable
 * content, or a downstream parser/validator rejected the output.
 */
export function reportLlmFallback(detail: LlmErrorEventDetail): void {
  dispatchLlmError(detail);
}

export interface CallWithRetryOptions {
  providerId: ProviderId;
  model: string;
  messages: LlmMessage[];
  jsonSchema?: object;
  maxTokens?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
  onFallback?: () => void;
}

export interface CallWithRetryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  usedFallback: boolean;
}

export async function callWithRetry(
  options: CallWithRetryOptions
): Promise<CallWithRetryResult> {
  const { providerId, model, messages, jsonSchema, maxTokens, schema, onFallback } = options;
  let lastError: unknown = null;

  // Attempt 1: call via SW with schema, validate
  try {
    const res = await callLlmViaSW({ providerId, model, messages, jsonSchema, maxTokens });
    const parsed = tryParse(res.raw, res.parsedJson);
    const validated = schema.parse(parsed);
    return { result: validated, usedFallback: false };
  } catch (err1) {
    lastError = err1;
    console.warn(`[retryAndFallback] Attempt 1 failed for ${providerId}/${model}:`, err1);
  }

  // Attempt 2: prepend corrective message, retry via SW
  try {
    const schemaStr = JSON.stringify(jsonSchema ?? {}, null, 2);
    const correctiveMessage: LlmMessage = {
      role: 'user',
      content: `Your previous response failed validation. Return ONLY valid JSON matching the schema:\n${schemaStr}`,
    };
    const retryMessages: LlmMessage[] = [...messages, correctiveMessage];
    const res = await callLlmViaSW({ providerId, model, messages: retryMessages, jsonSchema, maxTokens });
    const parsed = tryParse(res.raw, res.parsedJson);
    const validated = schema.parse(parsed);
    return { result: validated, usedFallback: false };
  } catch (err2) {
    lastError = err2;
    console.warn(`[retryAndFallback] Attempt 2 failed for ${providerId}/${model}:`, err2);
  }

  // Attempt 3 (terminal): signal fallback and surface the failure to the UI.
  // Without this dispatch, the user sees a silent fallback (or nothing) when
  // the provider rejects the request — e.g. 429 quota exhaustion, expired
  // keys, or 5xx outages — and has no way to know they need to act.
  const { message, status } = describeError(lastError);
  dispatchLlmError({ providerId, model, message, status });
  if (onFallback) onFallback();
  return { result: null, usedFallback: true };
}

function tryParse(raw: string, parsedJson?: unknown): unknown {
  if (parsedJson !== undefined) return parsedJson;
  if (!raw.trim()) {
    throw new Error('Provider returned an empty response body.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting JSON from markdown code fences
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // fall through
      }
    }
    throw new Error(`Could not parse JSON from response: ${raw.slice(0, 200)}`);
  }
}
