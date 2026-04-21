import type { ProviderId } from '../types';
import type { BaseProvider, LlmCallArgs, LlmCallResult } from './BaseProvider';

const BASE_URL = 'https://api.anthropic.com/v1';

export const anthropicProvider: BaseProvider = {
  id: 'anthropic' as ProviderId,
  availableModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],

  async validateCredentials(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // 200 = valid key, 401/403 = invalid
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  },

  async call(args: LlmCallArgs & { apiKey: string }): Promise<LlmCallResult> {
    const { model, messages, jsonSchema, maxTokens, apiKey } = args;

    // Extract system prompt from messages
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens ?? 4096,
      messages: chatMessages,
    };
    if (systemMsg) body.system = systemMsg.content;

    // Force structured output via tool use
    if (jsonSchema) {
      body.tools = [
        {
          name: 'return_json',
          description: 'Return structured JSON matching the required schema.',
          input_schema: jsonSchema,
        },
      ];
      body.tool_choice = { type: 'tool', name: 'return_json' };
    }

    const res = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }

    const data = await res.json();

    // Extract content: if tool_use forced, parse from tool_use block
    let raw = '';
    let parsedJson: unknown;

    const content: Array<{ type: string; text?: string; input?: unknown }> =
      data?.content ?? [];

    if (jsonSchema) {
      const toolBlock = content.find(b => b.type === 'tool_use');
      if (toolBlock?.input !== undefined) {
        parsedJson = toolBlock.input;
        raw = JSON.stringify(toolBlock.input);
      }
    } else {
      const textBlock = content.find(b => b.type === 'text');
      raw = textBlock?.text ?? '';
    }

    const usage = data?.usage
      ? {
          input: data.usage.input_tokens ?? 0,
          output: data.usage.output_tokens ?? 0,
        }
      : undefined;

    if (!raw.trim() && parsedJson === undefined) {
      const stopReason = typeof data?.stop_reason === 'string' ? data.stop_reason : 'unknown';
      const contentTypes = Array.isArray(content)
        ? content.map(block => block.type).filter((type): type is string => typeof type === 'string')
        : [];
      throw new Error(
        `Anthropic API returned no usable content (stop_reason=${stopReason}, content_types=${contentTypes.join(',') || 'none'}).`,
      );
    }

    return { raw, parsedJson, usage };
  },
};
