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
import Button from '../../src/ui/Button';
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'resetting'>('idle');

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


  async function handleValidateAndSave() {
    setSaveStatus('saving');
    setSaveError(null);

    // Read straight from the DOM since the inputs are uncontrolled.
    const activeKey = readKey(activeProvider).trim();
    if (!activeKey) {
      setSaveError(`API key for ${PROVIDER_LABELS[activeProvider]} is required.`);
      setSaveStatus('error');
      return;
    }

    setProviderKeys(prev => ({
      ...prev,
      [activeProvider]: { ...prev[activeProvider], validation: 'validating' },
    }));

    let valid = false;
    try {
      const provider = selectProvider(activeProvider);
      valid = await provider.validateCredentials(activeKey);
    } catch {
      valid = false;
    }

    setProviderKeys(prev => ({
      ...prev,
      [activeProvider]: {
        ...prev[activeProvider],
        key: activeKey,
        validation: valid ? 'valid' : 'invalid',
      },
    }));

    if (!valid) {
      setSaveError(`API key for ${PROVIDER_LABELS[activeProvider]} appears invalid.`);
      setSaveStatus('error');
      return;
    }

    try {
      for (const id of ['gemini', 'openai', 'anthropic'] as ProviderId[]) {
        const k = readKey(id).trim();
        if (k) await setCredential(id, k);
      }
      await setSettings({ activeProvider, activeModel, density });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
      setSaveStatus('error');
    }
  }

  function handleProviderChange(id: ProviderId) {
    setActiveProvider(id);
    const provider = selectProvider(id);
    setActiveModel(provider.availableModels[0] ?? '');
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
                          placeholder={isActive ? 'Required' : 'Optional'}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                          aria-label={`API key for ${PROVIDER_LABELS[provider.id]}`}
                        />
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
            onChange={e => setActiveModel(e.target.value)}
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
                  onChange={() => setDensity(opt.value)}
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

        {/* Save */}
        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-3" role="alert">
            {saveError}
          </p>
        )}
        {saveStatus === 'saved' && (
          <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2 mb-3" role="status">
            Settings saved successfully.
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          onClick={handleValidateAndSave}
          disabled={saveStatus === 'saving'}
          className="w-full"
        >
          {saveStatus === 'saving' ? 'Validating & Saving…' : 'Validate & Save'}
        </Button>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Keys are stored in the browser's IndexedDB-backed settings store on this device.
          Legacy localStorage values are migrated on first load.
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
