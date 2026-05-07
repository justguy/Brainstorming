/**
 * AppLlmErrorBanner — surfaces LLM provider errors to the user.
 *
 * Listens for `brainstorm:llm-error` window events dispatched by
 * `retryAndFallback.ts` after all attempts have failed. Renders a stack of
 * dismissible cards in the top-right of the viewport with the provider, model,
 * a friendly summary (quota / auth / outage / generic), and the raw message
 * for debugging.
 *
 * The component intentionally has no state plumbing into the rest of the app:
 * everything flows through the global event so any LLM caller — workspace
 * advance, scout, critique, beat run — gets the same surface for free.
 */

import React, { useEffect, useState } from 'react';
import type { LlmErrorEventDetail } from '../../src/orchestrator/retryAndFallback';

interface BannerEntry {
  id: string;
  providerId: string;
  model: string;
  message: string;
  status?: number;
  receivedAt: number;
}

const AUTO_DISMISS_MS = 12_000;
const MAX_VISIBLE = 3;

function categorize(detail: BannerEntry): { headline: string; tone: 'quota' | 'auth' | 'outage' | 'unknown' } {
  const status = detail.status;
  const message = detail.message.toLowerCase();
  if (status === 429 || message.includes('quota') || message.includes('rate limit') || message.includes('credits are depleted') || message.includes('resource_exhausted')) {
    return { headline: `${detail.providerId} quota or rate limit hit`, tone: 'quota' };
  }
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('invalid api key') || message.includes('authentication')) {
    return { headline: `${detail.providerId} key rejected`, tone: 'auth' };
  }
  if ((status && status >= 500) || message.includes('unavailable') || message.includes('service_unavailable')) {
    return { headline: `${detail.providerId} provider outage`, tone: 'outage' };
  }
  return { headline: `${detail.providerId} request failed`, tone: 'unknown' };
}

function toneClasses(tone: ReturnType<typeof categorize>['tone']): string {
  switch (tone) {
    case 'quota':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'auth':
      return 'border-rose-300 bg-rose-50 text-rose-900';
    case 'outage':
      return 'border-violet-300 bg-violet-50 text-violet-900';
    default:
      return 'border-red-300 bg-red-50 text-red-900';
  }
}

function actionHint(tone: ReturnType<typeof categorize>['tone'], providerId: string): string {
  switch (tone) {
    case 'quota':
      if (providerId === 'gemini') return 'Top up credits at ai.studio or switch provider in Options.';
      if (providerId === 'openai') return 'Check usage at platform.openai.com or switch provider in Options.';
      if (providerId === 'anthropic') return 'Check billing at console.anthropic.com or switch provider in Options.';
      return 'Top up credits with your provider or switch provider in Options.';
    case 'auth':
      return 'Open Options and re-enter your API key for this provider.';
    case 'outage':
      return 'The provider is having trouble. Try again, or switch provider in Options.';
    default:
      return 'Open Options to verify your provider settings, or try again.';
  }
}

export default function AppLlmErrorBanner(): React.ReactElement | null {
  const [entries, setEntries] = useState<BannerEntry[]>([]);

  useEffect(() => {
    console.info('[AppLlmErrorBanner] mounted, listening for brainstorm:llm-error');
    function onError(event: Event): void {
      const detail = (event as CustomEvent<LlmErrorEventDetail>).detail;
      console.info('[AppLlmErrorBanner] received brainstorm:llm-error', detail);
      if (!detail) return;
      const entry: BannerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        providerId: detail.providerId,
        model: detail.model,
        message: detail.message,
        status: detail.status,
        receivedAt: Date.now(),
      };
      setEntries(prev => [...prev, entry].slice(-MAX_VISIBLE));
    }
    window.addEventListener('brainstorm:llm-error', onError as EventListener);
    return () => window.removeEventListener('brainstorm:llm-error', onError as EventListener);
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    const timers = entries.map(entry => {
      const elapsed = Date.now() - entry.receivedAt;
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      return window.setTimeout(() => {
        setEntries(prev => prev.filter(e => e.id !== entry.id));
      }, remaining);
    });
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [entries]);

  function dismiss(id: string): void {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function openOptions(): void {
    window.location.hash = '#/options';
  }

  if (entries.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-[360px] max-w-[90vw] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {entries.map(entry => {
        const category = categorize(entry);
        const tone = toneClasses(category.tone);
        return (
          <div
            key={entry.id}
            role="alert"
            className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-md ${tone}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold capitalize">
                  {category.headline}
                </p>
                <p className="mt-0.5 text-[11px] opacity-80">
                  {entry.providerId} · {entry.model}{entry.status ? ` · HTTP ${entry.status}` : ''}
                </p>
                <p className="mt-1 text-[12px] leading-snug">
                  {actionHint(category.tone, entry.providerId)}
                </p>
                <details className="mt-1.5 text-[11px] opacity-80">
                  <summary className="cursor-pointer select-none">Details</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-white/60 p-1.5 font-mono text-[10.5px]">
                    {entry.message}
                  </pre>
                </details>
                <button
                  type="button"
                  onClick={openOptions}
                  className="mt-2 rounded border border-current bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-current"
                >
                  Open Options
                </button>
              </div>
              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                className="-mr-1 -mt-1 rounded p-1 text-[14px] leading-none opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
                aria-label="Dismiss"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
