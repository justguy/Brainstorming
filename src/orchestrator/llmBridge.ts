/**
 * llmBridge.ts — thin message-passing shim between orchestrator and service worker.
 *
 * The orchestrator never touches API keys. All provider calls go through this
 * function, which delegates to the service worker via chrome.runtime.sendMessage.
 * The SW reads the key from chrome.storage.local and calls the provider.
 */

import type { ProviderId, LlmMessage } from '../types';
import type { LlmCallResult } from '../providers/BaseProvider';

export interface LlmBridgeArgs {
  providerId: ProviderId;
  model: string;
  messages: LlmMessage[];
  jsonSchema?: object;
  maxTokens?: number;
}

type SwResponse =
  | { ok: true; result: LlmCallResult }
  | { ok: false; error: string };

/**
 * Send an LLM_CALL message to the service worker and return the result.
 * Throws if the SW returns ok:false or if the messaging itself fails.
 */
export async function callLlmViaSW(args: LlmBridgeArgs): Promise<LlmCallResult> {
  const response = await new Promise<SwResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'LLM_CALL', payload: args },
      (reply: SwResponse | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (reply === undefined) {
          reject(new Error('No response from service worker'));
          return;
        }
        resolve(reply);
      },
    );
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}
