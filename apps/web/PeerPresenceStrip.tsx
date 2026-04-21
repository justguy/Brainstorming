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
  const peerCount = peers.length;
  const localIsHost = localClientId !== null && hostClientId === localClientId;
  const hostLabel = localIsHost ? 'host local' : hostClientId !== null ? `host peer ${hostClientId}` : 'host unset';

  if (peerCount <= 1) {
    return (
      <div className="rounded-full border border-[#313432] bg-[#272d2a] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2eadb] shadow-[0_18px_32px_-24px_rgba(17,24,20,0.72)]">
        Local-first · IndexedDB · {hostLabel}
      </div>
    );
  }

  return (
    <div className="rounded-full border border-[#313432] bg-[#272d2a] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f2eadb] shadow-[0_18px_32px_-24px_rgba(17,24,20,0.72)]">
      {peerCount} peers · {hostLabel}
    </div>
  );
}
