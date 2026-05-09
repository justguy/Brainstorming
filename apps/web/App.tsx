/**
 * App.tsx — top-level route dispatcher.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §3 Routing changes + §6 M2 — "Refactor
 * App.tsx body → BoardScreen.tsx". The bulk of the previous App body now lives
 * in `apps/web/screens/BoardScreen.tsx`. This file's only jobs are:
 *
 *   1. Read the parsed `RouteState` via `useRoute()` (apps/web/routing).
 *   2. `switch (route.kind)` to the matching screen component.
 *   3. Render route-agnostic globals: `<AppLlmErrorBanner>` and the WebMCP
 *      availability modal (driven by `window.__openWebMcpAvailabilityModal`).
 *
 * NOTE for re-mergers: any board-state edit (hooks, handlers, `BoardAppView`
 * props) belongs in `screens/BoardScreen.tsx`, not here. The dispatcher should
 * stay small enough that future screen wires drop in mechanically. Screens
 * whose components don't exist yet (HomeScreen, BriefScreen, LogScreen,
 * HandoffScreen) currently fall through to a placeholder — replace those
 * branches as their tasks land.
 */
import React, { useEffect, useRef, useState } from 'react';
import AppLlmErrorBanner from './AppLlmErrorBanner';
import Options from './Options';
import { useRoute } from './routing/useRoute';
import { BoardScreen } from './screens/BoardScreen';
import { MapScreen } from './screens/MapScreen';
import { PrinciplesDrawer } from './PrinciplesDrawer';
import { WebMcpAvailabilityModal } from './WebMcpAvailabilityModal';
import { detectWebMcpSupport, type SupportStatus } from '../../src/webmcp/detectSupport';

declare global {
  interface Window {
    __openWebMcpAvailabilityModal?: (reason?: Exclude<SupportStatus, { supported: true }>['reason']) => void;
    __closeWebMcpAvailabilityModal?: () => void;
    /**
     * bo-162 — global handle for opening the principles drawer. Wired up at
     * the App level so any screen (or the slash command parser) can poke it
     * without prop-drilling. Mirrors `__openWebMcpAvailabilityModal` style.
     */
    __openPrinciplesDrawer?: () => void;
    __closePrinciplesDrawer?: () => void;
  }
}

/**
 * Tiny placeholder for routes whose dedicated screen components have not
 * landed yet. The route dispatcher renders this instead of crashing so that
 * partial wave landings (e.g. HomeScreen lands after BoardScreen) keep the
 * app navigable.
 */
function ScreenPlaceholder({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 p-8 text-center">
      <h1 className="text-lg font-semibold text-gray-800">{label}</h1>
      <p className="text-sm text-gray-500">This screen is not implemented yet.</p>
    </div>
  );
}

export default function App(): React.ReactElement {
  const webMcpCheckRef = useRef(false);
  const [route, navigate] = useRoute();
  const [webMcpUnavailableStatus, setWebMcpUnavailableStatus] = useState<Exclude<SupportStatus, { supported: true }> | null>(null);
  const [webMcpModalOpen, setWebMcpModalOpen] = useState(false);
  // bo-162 — principles drawer is mounted at the App level so the FAB-style
  // trigger and the global `window.__openPrinciplesDrawer` shim work from any
  // route without each screen owning the toggle state.
  const [principlesDrawerOpen, setPrinciplesDrawerOpen] = useState(false);

  // WebMCP availability check stays at the top level — it's a once-per-session
  // capability probe that is not tied to any particular screen.
  useEffect(() => {
    if (webMcpCheckRef.current) return;
    webMcpCheckRef.current = true;

    const status = detectWebMcpSupport();
    window.__WEBMCP_STATUS = status;
    if (!status.supported) {
      setWebMcpUnavailableStatus(status);
      setWebMcpModalOpen(true);
    }
  }, []);

  useEffect(() => {
    window.__openWebMcpAvailabilityModal = (reason = 'unknown') => {
      setWebMcpUnavailableStatus({ supported: false, reason });
      setWebMcpModalOpen(true);
    };
    window.__closeWebMcpAvailabilityModal = () => {
      setWebMcpModalOpen(false);
    };

    return () => {
      delete window.__openWebMcpAvailabilityModal;
      delete window.__closeWebMcpAvailabilityModal;
    };
  }, []);

  // bo-162 — surface the principles drawer toggle on `window` so screens that
  // don't own the state (e.g. BoardScreen, BriefScreen, MapScreen) can request
  // it without each carrying its own prop chain. Same pattern as the WebMCP
  // availability modal above.
  useEffect(() => {
    window.__openPrinciplesDrawer = () => setPrinciplesDrawerOpen(true);
    window.__closePrinciplesDrawer = () => setPrinciplesDrawerOpen(false);
    return () => {
      delete window.__openPrinciplesDrawer;
      delete window.__closePrinciplesDrawer;
    };
  }, []);

  // The thin dispatcher. Each branch picks one screen component. Branches
  // whose dedicated screens don't exist yet route to the placeholder; the
  // TODOs identify which task is expected to swap them in.
  let appView: React.ReactElement;
  switch (route.kind) {
    case 'options':
      appView = <Options onBack={() => navigate('')} />;
      break;
    case 'board':
      appView = <BoardScreen onNavigate={navigate} />;
      break;
    case 'map':
      // bo-160 contract: when route.kind === 'map', render MapScreen with the
      // current boardId. MapScreen also reads the route internally, so we
      // don't have to thread the boardId through props for navigation.
      appView = <MapScreen />;
      break;
    case 'home':
      // TODO(bo-104): swap in <HomeScreen projectId={route.projectId} />
      // when the multi-board home shim lands. Until then we fall through to
      // the BoardScreen so the canvas remains the default landing surface.
      appView = <BoardScreen onNavigate={navigate} />;
      break;
    case 'brief':
      // TODO(bo-152): swap in <BriefScreen boardId={...} ideaId={...} />.
      appView = <ScreenPlaceholder label="Brief (coming soon)" />;
      break;
    case 'log':
      // TODO(bo-132 / bo-156): swap in <LogScreen boardId={...} />.
      appView = <ScreenPlaceholder label="Project log (coming soon)" />;
      break;
    case 'handoff':
      // TODO(bo-163): swap in <HandoffScreen boardId={...} briefId={...} />.
      appView = <ScreenPlaceholder label="Handoff (coming soon)" />;
      break;
    case 'unknown':
    default:
      appView = <ScreenPlaceholder label="Page not found" />;
      break;
  }

  return (
    <>
      {appView}
      <AppLlmErrorBanner />
      {/*
        bo-162 — Floating "Principles" trigger. Intentionally minimal-but-
        reachable from every screen; the drawer itself owns its open/close
        UI and edit affordances. Hidden on the Options route to keep the
        settings UI uncluttered.
      */}
      {route.kind !== 'options' && (
        <button
          type="button"
          className="bo-principles-fab fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
          onClick={() => setPrinciplesDrawerOpen(true)}
          aria-label="Open principles drawer"
          title="Open principles drawer"
        >
          <span aria-hidden="true">¶</span>
          Principles
        </button>
      )}
      <PrinciplesDrawer
        open={principlesDrawerOpen}
        onClose={() => setPrinciplesDrawerOpen(false)}
      />
      {webMcpModalOpen && webMcpUnavailableStatus ? (
        <WebMcpAvailabilityModal
          open={webMcpModalOpen}
          status={webMcpUnavailableStatus}
          onClose={() => setWebMcpModalOpen(false)}
        />
      ) : null}
    </>
  );
}
