import type { ProviderId } from '../types';
import type { BaseProvider, LlmCallArgs, LlmCallResult } from './BaseProvider';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Gemini's responseSchema is a subset of OpenAPI 3.0 Schema and rejects
// `additionalProperties` (and `$schema`). Recursively strip them before
// sending. Does not mutate the caller's object.
function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (schema && typeof schema === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema') continue;
      result[k] = sanitizeForGemini(v);
    }
    return result;
  }
  return schema;
}

export const geminiProvider: BaseProvider = {
  id: 'gemini' as ProviderId,
  availableModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],

  async validateCredentials(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models?key=${key}`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async call(args: LlmCallArgs & { apiKey: string }): Promise<LlmCallResult> {
    const { model, messages, jsonSchema, maxTokens, apiKey } = args;

    // Build Gemini content array from messages
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Prepend system message as first user turn if present
    const systemMsg = messages.find(m => m.role === 'system');
    const systemInstruction = systemMsg
      ? { parts: [{ text: systemMsg.content }] }
      : undefined;

    // Gemini 2.5 reserves a chunk of the token budget for internal "thinking"
    // before producing visible output. With our role-call budgets (often
    // 800–2048), the thinking phase can swallow the entire budget and the
    // visible response gets zero tokens — finishReason comes back as
    // MAX_TOKENS with empty content. Pad the requested budget so the visible
    // response always has room. On 2.5-flash thinking can be disabled
    // entirely; on 2.5-pro the API still requires a non-zero thinking
    // budget but we can keep it small.
    const isGemini25 = /gemini-2\.5/.test(model);
    const isGemini25Pro = /gemini-2\.5-pro/.test(model);
    const thinkingBudget = isGemini25Pro ? 256 : 0;
    const visibleBudget = maxTokens ?? 1024;
    const totalOutputBudget = isGemini25 ? visibleBudget + thinkingBudget : visibleBudget;

    const generationConfig: Record<string, unknown> = {};
    generationConfig.maxOutputTokens = totalOutputBudget;
    if (jsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = sanitizeForGemini(jsonSchema);
    }
    if (isGemini25) {
      generationConfig.thinkingConfig = { thinkingBudget };
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const url = `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const raw = normaliseGeminiParts(candidate?.content?.parts);
    const finishReason = typeof candidate?.finishReason === 'string' ? candidate.finishReason : 'unknown';
    const blockReason = typeof data?.promptFeedback?.blockReason === 'string'
      ? data.promptFeedback.blockReason
      : undefined;
    const thoughtsTokenCount = typeof data?.usageMetadata?.thoughtsTokenCount === 'number'
      ? data.usageMetadata.thoughtsTokenCount
      : undefined;
    const usage = data?.usageMetadata
      ? {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined;

    // MAX_TOKENS with no parts (or with truncated content) is the most common
    // failure mode on 2.5-pro: the thinking phase eats the visible budget and
    // we get back a stub. Surface a precise error that the retry helper and
    // banner can show to the user, instead of a meaningless "couldn't parse
    // JSON" downstream.
    if (finishReason === 'MAX_TOKENS') {
      const thoughtsHint = thoughtsTokenCount !== undefined
        ? ` Thinking consumed ${thoughtsTokenCount} tokens before output.`
        : '';
      throw new Error(
        `Gemini hit the token budget (HTTP 200, finishReason=MAX_TOKENS) before producing a complete response.${thoughtsHint} Try a smaller request, switch to gemini-2.5-flash, or raise the maxTokens budget for this role.`,
      );
    }

    let parsedJson: unknown;
    if (jsonSchema) {
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        parsedJson = undefined;
      }
    }

    if (!raw.trim() && parsedJson === undefined) {
      throw new Error(
        `Gemini API returned no usable content (finishReason=${finishReason}${blockReason ? `, blockReason=${blockReason}` : ''}).`,
      );
    }

    return { raw, parsedJson, usage };
  },
};

function normaliseGeminiParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (
      part && typeof part === 'object' && 'text' in part && typeof part.text === 'string'
        ? part.text
        : ''
    ))
    .join('');
}
