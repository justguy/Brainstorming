import type { ProviderId } from '../types';
import type { BaseProvider, LlmCallArgs, LlmCallResult } from './BaseProvider';

const BASE_URL = 'https://api.openai.com/v1';

export const openaiProvider: BaseProvider = {
  id: 'openai' as ProviderId,
  availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],

  async validateCredentials(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async call(args: LlmCallArgs & { apiKey: string }): Promise<LlmCallResult> {
    const { model, messages, jsonSchema, maxTokens, apiKey } = args;

    const body: Record<string, unknown> = {
      model,
      messages,
    };
    if (maxTokens) body.max_tokens = maxTokens;
    if (jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: jsonSchema,
        },
      };
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const raw = normaliseMessageContent(message?.content);
    const usage = data?.usage
      ? {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
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
      const refusal = typeof message?.refusal === 'string' ? message.refusal : undefined;
      const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'unknown';
      throw new Error(
        `OpenAI API returned no usable content (finish_reason=${finishReason}${refusal ? `, refusal=${refusal}` : ''}).`,
      );
    }

    return { raw, parsedJson, usage };
  },
};

function normaliseMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
}
