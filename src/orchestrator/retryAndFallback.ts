import { z } from 'zod';
import type { ProviderId, LlmMessage } from '../types';
import { callLlmViaSW } from './llmBridge';

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

  // Attempt 1: call via SW with schema, validate
  try {
    const res = await callLlmViaSW({ providerId, model, messages, jsonSchema, maxTokens });
    const parsed = tryParse(res.raw, res.parsedJson);
    const validated = schema.parse(parsed);
    return { result: validated, usedFallback: false };
  } catch (err1) {
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
    console.warn(`[retryAndFallback] Attempt 2 failed for ${providerId}/${model}:`, err2);
  }

  // Attempt 3 (terminal): signal fallback
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
