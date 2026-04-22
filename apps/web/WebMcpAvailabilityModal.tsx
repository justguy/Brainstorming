import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SupportStatus } from '../../src/webmcp/detectSupport';
import Button from '../../src/ui/Button';
import { useOverlaySurface } from './useOverlaySurface';

interface WebMcpAvailabilityModalProps {
  open: boolean;
  status: Exclude<SupportStatus, { supported: true }> | null;
  onClose: () => void;
}

const CHROME_FLAGS_DOC_URL = 'https://developer.chrome.com/docs/web-platform/chrome-flags';
const MODEL_CONTEXT_INSPECTOR_URL = 'https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd';
const REQUIRED_CHROME_VERSION = '146.0.7672.0';
const WEBMCP_FLAG_URL = 'chrome://flags/#enable-webmcp-testing';
const DIALOG_STYLE: React.CSSProperties = {
  padding: 0,
  margin: 0,
  border: 'none',
  background: 'transparent',
  width: '100vw',
  maxWidth: '100vw',
  height: '100vh',
  maxHeight: '100vh',
};
const SURFACE_STYLE: React.CSSProperties = {
  width: 'min(48rem, 100%)',
};

export function WebMcpAvailabilityModal({
  open,
  status,
  onClose,
}: WebMcpAvailabilityModalProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const { closeButtonRef, surfaceRef } = useOverlaySurface<HTMLDivElement>(onClose);
  const reason = status?.reason ?? 'unknown';
  const reasonTone = reason === 'flag_disabled'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-slate-100 text-slate-700';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    };
  }, []);

  if (!open || !status || typeof document === 'undefined') return null;

  return createPortal((
    <dialog
      ref={dialogRef}
      className="bo-webmcp-availability-modal"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      style={DIALOG_STYLE}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="flex min-h-full w-full items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:p-6"
        onClick={onClose}
      >
        <div
          ref={surfaceRef}
          className="relative w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white shadow-2xl"
          style={SURFACE_STYLE}
          tabIndex={-1}
          onClick={event => event.stopPropagation()}
        >
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">
                    WebMCP required
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${reasonTone}`}>
                    {reasonLabel(reason)}
                  </span>
                </div>
                <div className="space-y-1">
                  <h2 id={headingId} className="text-lg font-semibold text-slate-950">
                    Enable WebMCP to use the app&apos;s agent tool surface
                  </h2>
                  <p id={descriptionId} className="max-w-2xl text-sm leading-6 text-slate-600">
                    This app relies on WebMCP so browser agents and the Model Context Tool Inspector can
                    discover and execute its registered tools. Without it, the workspace still loads, but
                    the WebMCP tool surface does not register.
                  </p>
                </div>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close WebMCP instructions"
              >
                Close
              </button>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 md:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-5">
              <InfoBlock title="Availability">
                <p>
                  WebMCP is available behind a flag in Chrome 146.{' '}
                  <a
                    href={CHROME_FLAGS_DOC_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
                  >
                    Learn more about Chrome flags.
                  </a>
                </p>
              </InfoBlock>

              <InfoBlock title="Requirements">
                <ul className="space-y-2">
                  <li>Chrome: version `{REQUIRED_CHROME_VERSION}` or higher.</li>
                  <li>Flags: the `WebMCP for testing` flag must be enabled.</li>
                </ul>
              </InfoBlock>

              <InfoBlock title="Setup">
                <ol className="space-y-2">
                  <li>Open Chrome and navigate to:</li>
                  <li>
                    <code className="block rounded-xl bg-slate-950 px-3 py-2 text-[13px] text-slate-50">
                      {WEBMCP_FLAG_URL}
                    </code>
                  </li>
                  <li>Set the flag to `Enabled`.</li>
                  <li>Relaunch Chrome to apply the changes.</li>
                </ol>
              </InfoBlock>
            </section>

            <section className="space-y-5">
              <InfoBlock title="Demo">
                <p className="mb-3">
                  Install the Chrome extension below to inspect registered functions, execute them manually,
                  or test them with an agent against the live demo.
                </p>
                <a
                  href={MODEL_CONTEXT_INSPECTOR_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Install Model Context Tool Inspector
                </a>
              </InfoBlock>

              <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
                  Why you&apos;re seeing this
                </p>
                <p className="mt-2 text-sm leading-6 text-violet-950">
                  {reasonMessage(reason)}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close for now
                </Button>
                <a
                  href={CHROME_FLAGS_DOC_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  Open Chrome flags guide
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  ), document.body);
}

function InfoBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 text-sm leading-6 text-slate-700">{children}</div>
    </section>
  );
}

function reasonLabel(reason: Exclude<SupportStatus, { supported: true }>['reason']): string {
  switch (reason) {
    case 'flag_disabled':
      return 'Flag disabled';
    case 'not_chrome':
      return 'Chrome required';
    case 'api_missing':
      return 'API missing';
    default:
      return 'Unavailable';
  }
}

function reasonMessage(reason: Exclude<SupportStatus, { supported: true }>['reason']): string {
  switch (reason) {
    case 'flag_disabled':
      return 'Chrome looks new enough, but navigator.modelContext is still missing. The WebMCP testing flag is the likely missing step.';
    case 'not_chrome':
      return 'This browser is not reporting a Chrome 146+ runtime with WebMCP support. Use a compatible Chrome build, enable the flag, and relaunch.';
    case 'api_missing':
      return 'navigator.modelContext is missing in this browsing context, so the app cannot register its WebMCP tools yet.';
    default:
      return 'The app could not confirm WebMCP support in this browsing context, so it is showing the enablement steps before you try the tool surface.';
  }
}
