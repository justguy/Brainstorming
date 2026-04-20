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

export function PeerPresenceStrip({
  hostClientId,
  localClientId,
  peers,
}: PeerPresenceStripProps): React.ReactElement {
  if (peers.length === 0) {
    return (
      <div className="bo-shell-inline-card">
        <p className="bo-shell-eyebrow">Peers</p>
        <p className="mt-1 text-sm text-[color:var(--bo-paper-ink-soft)]">Solo board.</p>
      </div>
    );
  }

  return (
    <div className="bo-shell-inline-card">
      <div className="flex items-center justify-between gap-3">
        <p className="bo-shell-eyebrow">Peers</p>
        <span className="bo-rules-ribbon__meta">{peers.length} live</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {peers.map(peer => {
          const label = `Peer ${String(peer.clientId).padStart(2, '0')}`;
          const isHost = hostClientId === peer.clientId || peer.wantsAiHost;
          const isLocal = peer.clientId === localClientId;
          return (
            <span key={peer.clientId} className={`bo-peer-chip ${isHost ? 'is-host' : ''}`}>
              {label}
              {isLocal ? ' • you' : ''}
              {isHost ? ' • host' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
