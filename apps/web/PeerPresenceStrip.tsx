import React from 'react';

interface FacilitatorPeer {
  clientId: number;
  heartbeatAt?: number;
  wantsAiHost?: boolean;
}

interface PeerPresenceStripProps {
  hostClientId: number | null;
  localClientId: number | null;
  peers: FacilitatorPeer[];
}

const PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 999,
  boxShadow: '2px 2px 0 var(--ink)',
  color: 'var(--ink)',
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.02em',
  textTransform: 'none',
  color: 'var(--ink-soft)',
};

export function PeerPresenceStrip({
  hostClientId,
  localClientId,
  peers,
}: PeerPresenceStripProps): React.ReactElement {
  const peerCount = peers.length;
  const localIsHost = localClientId !== null && hostClientId === localClientId;
  const hostLabel = localIsHost ? 'host local' : hostClientId !== null ? `host peer ${hostClientId}` : 'host unset';

  if (peerCount <= 1) {
    return (
      <div style={PILL_STYLE}>
        <span>Local-first</span>
        <span style={{ color: 'var(--ink-faint)' }}>·</span>
        <span>IndexedDB</span>
        <span style={{ color: 'var(--ink-faint)' }}>·</span>
        <span style={LABEL_STYLE}>{hostLabel}</span>
      </div>
    );
  }

  return (
    <div style={PILL_STYLE}>
      <span>{peerCount} peers</span>
      <span style={{ color: 'var(--ink-faint)' }}>·</span>
      <span style={LABEL_STYLE}>{hostLabel}</span>
    </div>
  );
}
