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

    const generationConfig: Record<string, unknown> = {};
    if (maxTokens) generationConfig.maxOutputTokens = maxTokens;
    if (jsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = sanitizeForGemini(jsonSchema);
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
    const usage = data?.usageMetadata
      ? {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined;

    let parsedJson: unknown;
    if (jsonSchema) {
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        parsedJson = undefined;
      }
    }

    if (!raw.trim() && parsedJson === undefined) {
      const finishReason = typeof candidate?.finishReason === 'string' ? candidate.finishReason : 'unknown';
      const blockReason = typeof data?.promptFeedback?.blockReason === 'string'
        ? data.promptFeedback.blockReason
        : undefined;
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
