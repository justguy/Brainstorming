import type { LlmMessage, ProviderId } from '../types';

export interface LlmCallArgs {
  model: string;
  messages: LlmMessage[];
  jsonSchema?: object;
  maxTokens?: number;
  onChunk?: (delta: string) => void;
}

export interface LlmCallResult {
  raw: string;
  parsedJson?: unknown;
  usage?: { input: number; output: number };
}

export interface BaseProvider {
  id: ProviderId;
  availableModels: string[];
  validateCredentials(key: string): Promise<boolean>;
  call(args: LlmCallArgs & { apiKey: string }): Promise<LlmCallResult>;
}
