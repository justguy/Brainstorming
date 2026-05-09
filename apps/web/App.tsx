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
import { WebMcpAvailabilityModal } from './WebMcpAvailabilityModal';
import { detectWebMcpSupport, type SupportStatus } from '../../src/webmcp/detectSupport';

declare global {
  interface Window {
    __openWebMcpAvailabilityModal?: (reason?: Exclude<SupportStatus, { supported: true }>['reason']) => void;
    __closeWebMcpAvailabilityModal?: () => void;
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
