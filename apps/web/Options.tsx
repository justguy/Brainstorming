/**
 * Options.tsx — Settings page for the web app.
 *
 * Reached via hash-based routing: window.location.hash = '#/options'
 * Uses the IndexedDB-backed settings store via src/storage/settings.ts.
 *
 * Reuses the exact same logic as src/options/Options.tsx but adds a Back link
 * and operates in the single-page hash router context.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Density, ProviderId, Settings } from '../../src/types';
import { getSettings, setSettings, setCredential } from '../../src/storage/settings';
import { selectProvider, ALL_PROVIDERS } from '../../src/providers/index';
import { resetAllLocalData } from './storageReset';

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

interface ProviderKeyState {
  key: string;
  validation: ValidationState;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const DENSITY_OPTIONS: { value: Density; label: string; description: string }[] = [
  { value: 'simple', label: 'Simple', description: 'Hides expert annexes; cleaner output' },
  { value: 'standard', label: 'Standard', description: 'Balanced detail for most users' },
  { value: 'expert', label: 'Expert', description: 'Full technical detail including annexes' },
];

interface OptionsProps {
  onBack?: () => void;
}

export default function Options({ onBack }: OptionsProps): React.ReactElement {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderId>('gemini');
  const [activeModel, setActiveModel] = useState<string>('gemini-2.5-pro');
  const [density, setDensity] = useState<Density>('standard');
  // The inputs are uncontrolled (defaultValue + ref). Earlier we used
  // `value=` controlled inputs and on this user's setup keystrokes never
  // triggered onChange — likely a global capture-phase listener interacting
  // poorly with React's controlled-input synchronization. Refs sidestep the
  // issue: the browser owns the field, we read the value at save time. We
  // still track validation state so the marker (✓/✗) renders.
  const [proactiveEnabled, setProactiveEnabled] = useState<boolean>(true);
  const [guidanceEnabled, setGuidanceEnabled] = useState<boolean>(true);
  const [providerKeys, setProviderKeys] = useState<Record<ProviderId, ProviderKeyState>>({
    gemini: { key: '', validation: 'idle' },
    openai: { key: '', validation: 'idle' },
    anthropic: { key: '', validation: 'idle' },
  });
  const keyInputRefs = useRef<Record<ProviderId, HTMLInputElement | null>>({
    gemini: null,
    openai: null,
    anthropic: null,
  });

  function readKey(providerId: ProviderId): string {
    return keyInputRefs.current[providerId]?.value ?? providerKeys[providerId].key;
  }
  // Tiny live-save status indicator. We ditched the "Validate & Save" button in
  // favour of immediate per-field persistence — this just shows a fleeting
  // "Saved" pip so the user has feedback that their toggle landed in storage.
  const [saveTick, setSaveTick] = useState<{ key: string; ts: number } | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'resetting'>('idle');

  /**
   * Persist a partial settings patch immediately and flash a "Saved" pip.
   * Errors are swallowed to keep the form responsive; callers can choose to
   * surface them inline if needed.
   */
  async function persist(patch: Partial<Settings>): Promise<void> {
    try {
      await setSettings(patch);
      const key = Object.keys(patch).join('+') || 'change';
      setSaveTick({ key, ts: Date.now() });
    } catch {
      // intentionally silent — IndexedDB writes are essentially synchronous in
      // practice and rarely fail; if they do, the UI state remains the truth
      // until the next reload, when we'd resync from storage.
    }
  }

  async function handleResetLocalData() {
    if (resetStatus === 'resetting') return;
    const confirmed = window.confirm(
      'Reset all local data?\n\n' +
        'This permanently deletes every idea, supporting doc, critique, suggestion, ' +
        'connection, and saved API key from this browser. There is no server-side ' +
        'backup. The page will reload.'
    );
    if (!confirmed) return;
    setResetStatus('resetting');
    try {
      await resetAllLocalData();
    } catch {
      setResetStatus('idle');
    }
  }

  useEffect(() => {
    getSettings().then(s => {
      setLocalSettings(s);
      setActiveProvider(s.activeProvider);
      setActiveModel(s.activeModel);
      setDensity(s.density);
      setProactiveEnabled(s.proactiveSuggestionsEnabled);
      setGuidanceEnabled(s.guidanceNotesEnabled);
      setProviderKeys(prev => {
        const next = { ...prev };
        for (const id of ['gemini', 'openai', 'anthropic'] as ProviderId[]) {
          const stored = s.credentials[id];
          if (stored) {
            next[id] = { key: stored, validation: 'idle' };
            // Inputs are uncontrolled — defaultValue only takes effect on
            // first mount, so push loaded credentials into the live DOM
            // value once the refs are wired.
            const el = keyInputRefs.current[id];
            if (el && el.value === '') el.value = stored;
          }
        }
        return next;
      });
    });
  }, []);


  /**
   * Persist an API key for a single provider on blur. Validation runs lazily
   * — see handleValidateProvider below — so a typo doesn't gate persistence.
   */
  async function persistKeyOnBlur(providerId: ProviderId): Promise<void> {
    const key = readKey(providerId).trim();
    if (!key) return;
    try {
      await setCredential(providerId, key);
      setProviderKeys(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], key },
      }));
      setSaveTick({ key: `key:${providerId}`, ts: Date.now() });
    } catch {
      // ignore; field still holds the typed value
    }
  }

  /**
   * Optional explicit "Test" — validates the typed key against the provider.
   * Decoupled from persistence so users can save now and validate later
   * (e.g. before paying for a key swap).
   */
  async function handleValidateProvider(providerId: ProviderId): Promise<void> {
    const key = readKey(providerId).trim();
    if (!key) return;
    setProviderKeys(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], validation: 'validating' },
    }));
    let valid = false;
    try {
      const provider = selectProvider(providerId);
      valid = await provider.validateCredentials(key);
    } catch {
      valid = false;
    }
    setProviderKeys(prev => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        key,
        validation: valid ? 'valid' : 'invalid',
      },
    }));
  }

  function handleProviderChange(id: ProviderId) {
    setActiveProvider(id);
    const provider = selectProvider(id);
    const nextModel = provider.availableModels[0] ?? '';
    setActiveModel(nextModel);
    void persist({ activeProvider: id, activeModel: nextModel });
  }

  function handleModelChange(model: string) {
    setActiveModel(model);
    void persist({ activeModel: model });
  }

  function handleDensityChange(d: Density) {
    setDensity(d);
    void persist({ density: d });
  }

  function handleProactiveChange(enabled: boolean) {
    setProactiveEnabled(enabled);
    void persist({ proactiveSuggestionsEnabled: enabled });
  }

  function handleGuidanceChange(enabled: boolean) {
    setGuidanceEnabled(enabled);
    void persist({ guidanceNotesEnabled: enabled });
  }

  const currentProvider = selectProvider(activeProvider);

  if (!settings) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <p className="text-sm text-gray-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="p-6 max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Back link */}
        <div className="mb-5">
          <button
            type="button"
            onClick={onBack ?? (() => { window.location.hash = ''; })}
            className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
          >
            <span aria-hidden="true">&larr;</span> Back to workspace
          </button>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">Options</h1>
        <p className="text-sm text-gray-500 mb-6">Configure your LLM provider and preferences.</p>

        {/* Provider picker */}
        <section className="mb-6" aria-labelledby="provider-heading">
          <h2 id="provider-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            LLM Provider
          </h2>
          <div className="flex flex-col gap-2">
          {ALL_PROVIDERS.map(provider => {
            const isActive = provider.id === activeProvider;
            return (
              <div
                key={provider.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    id={`provider-${provider.id}`}
                    type="radio"
                    name="activeProvider"
                    value={provider.id}
                    checked={isActive}
                    onChange={() => handleProviderChange(provider.id)}
                    className="mt-0.5 accent-violet-600"
                    aria-label={`Select ${PROVIDER_LABELS[provider.id]} as active provider`}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`provider-${provider.id}`} className="block cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {PROVIDER_LABELS[provider.id]}
                        </span>
                        {isActive && (
                          <span className="text-xs bg-violet-600 text-white px-1.5 py-0.5 rounded-full font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {provider.availableModels.join(', ')}
                      </p>
                    </label>
                    <div className="mt-2">
                      <label
                        htmlFor={`key-${provider.id}`}
                        className="mb-1 block text-xs font-medium text-gray-600"
                      >
                        API Key{isActive && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          ref={el => { keyInputRefs.current[provider.id] = el; }}
                          id={`key-${provider.id}`}
                          type="text"
                          defaultValue={providerKeys[provider.id].key}
                          onInput={() => {
                            // Reset the validation marker when the user edits
                            // the field. We do not mirror the value into React
                            // state — the input is uncontrolled.
                            const current = providerKeys[provider.id].validation;
                            if (current !== 'idle') {
                              setProviderKeys(prev => ({
                                ...prev,
                                [provider.id]: { ...prev[provider.id], validation: 'idle' },
                              }));
                            }
                          }}
                          onBlur={() => { void persistKeyOnBlur(provider.id); }}
                          placeholder={isActive ? 'Required' : 'Optional'}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                          aria-label={`API key for ${PROVIDER_LABELS[provider.id]}`}
                        />
                        <button
                          type="button"
                          onClick={() => { void handleValidateProvider(provider.id); }}
                          className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                          aria-label={`Test ${PROVIDER_LABELS[provider.id]} key`}
                        >
                          Test
                        </button>
                        {(() => {
                          const v = providerKeys[provider.id].validation;
                          if (v === 'validating') return <span className="text-xs text-gray-500">…</span>;
                          if (v === 'valid') return <span className="text-green-600 text-sm" aria-label="Valid">✓</span>;
                          if (v === 'invalid') return <span className="text-red-600 text-sm" aria-label="Invalid">✗</span>;
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

        {/* Model picker */}
        <section className="mb-6" aria-labelledby="model-heading">
          <h2 id="model-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Model
          </h2>
          <select
            id="model-select"
            value={activeModel}
            onChange={e => handleModelChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Select model"
          >
            {currentProvider.availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </section>

        {/* Density */}
        <section className="mb-6" aria-labelledby="density-heading">
          <h2 id="density-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Output Density
          </h2>
          <div className="flex flex-col gap-2">
            {DENSITY_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  density === opt.value
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="density"
                  value={opt.value}
                  checked={density === opt.value}
                  onChange={() => handleDensityChange(opt.value)}
                  className="mt-0.5 accent-violet-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Proactive coach */}
        <section className="mb-6" aria-labelledby="proactive-heading">
          <h2 id="proactive-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Proactive coach
          </h2>
          <label
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              proactiveEnabled
                ? 'border-violet-500 bg-violet-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <input
              type="checkbox"
              checked={proactiveEnabled}
              onChange={e => handleProactiveChange(e.target.checked)}
              className="mt-0.5 accent-violet-600"
              aria-label="Enable proactive coach suggestions"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">
                Surface gentle suggestions when I pause
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                During idle moments or when the board stops moving, the coach drops 2-3 dismissable cards onto the canvas. Off keeps the LLM silent until you ask.
              </p>
            </div>
          </label>
        </section>

        {/* Guidance notes */}
        <section className="mb-6" aria-labelledby="guidance-heading">
          <h2 id="guidance-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Guidance notes
          </h2>
          <label
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              guidanceEnabled
                ? 'border-violet-500 bg-violet-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <input
              type="checkbox"
              checked={guidanceEnabled}
              onChange={e => handleGuidanceChange(e.target.checked)}
              className="mt-0.5 accent-violet-600"
              aria-label="Enable guidance callouts"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">
                Show inline guidance callouts
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Light green callouts inside Focus / Bloom mode that label controls and explain
                what each surface does. Off hides the labels once you know your way around.
              </p>
            </div>
          </label>
        </section>

        {/* Live-save status */}
        {saveTick && (Date.now() - saveTick.ts) < 2000 && (
          <p
            key={saveTick.ts}
            className="text-xs text-green-700 bg-green-50 rounded px-3 py-2 mb-3"
            role="status"
          >
            Saved.
          </p>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          Changes save instantly. Keys are stored in the browser's IndexedDB on this device.
          Use a provider's <span className="font-medium">Test</span> button above to validate
          the API key without sending real traffic. Legacy localStorage values are migrated on
          first load.
        </p>

        <section className="mt-8 border-t border-gray-100 pt-6" aria-labelledby="local-data-heading">
          <h2 id="local-data-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Local data
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            Everything you do in this app — ideas, supporting docs, critiques, suggestions,
            connections, and your API keys — lives in this browser only. Nothing is sent to a
            server we operate. That means:
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs text-gray-600 leading-relaxed space-y-1">
            <li>Clearing browser data or using incognito will wipe your boards.</li>
            <li>Switching browsers or devices does not carry your work over.</li>
            <li>There is no automatic backup. Use the export tools if you need one.</li>
          </ul>
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3">
            <p className="text-xs font-medium text-red-800">Reset all local data</p>
            <p className="mt-1 text-[11px] text-red-700 leading-relaxed">
              Permanently deletes every board, idea, doc, critique, suggestion, and saved
              API key from this browser. Useful when sharing the app with someone else or
              starting from a clean slate.
            </p>
            <button
              type="button"
              onClick={handleResetLocalData}
              disabled={resetStatus === 'resetting'}
              className="mt-3 rounded-md border border-red-400 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60"
            >
              {resetStatus === 'resetting' ? 'Resetting…' : 'Reset all data'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
