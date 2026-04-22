// connections.jsx — the ink connection overlay
// Exposes: window.ConnectionLayer, window.getConnectionStyle

function getConnectionStyle(kind) {
  switch (kind) {
    case "builds_on":     return { stroke: "#1a1814", strokeWidth: 1.8, dash: "none",   marker: null,           label: "builds on" };
    case "contradicts":   return { stroke: "#c94a3a", strokeWidth: 2.0, dash: "8 5",    marker: null,           label: "contradicts" };
    case "shared_theme":  return { stroke: "#8a8578", strokeWidth: 1.4, dash: "1 5",    marker: null,           label: "shared theme" };
    case "revives_killed":return { stroke: "#2f8f5e", strokeWidth: 1.8, dash: "none",   marker: "url(#arrow-green)", label: "revives" };
    default:              return { stroke: "#1a1814", strokeWidth: 1.6, dash: "none",   marker: null,           label: "" };
  }
}

// Compute an organic-ink curved path from A to B with two control points
// that wobble deterministically based on the endpoints.
function inkPath(a, b, seed = 0) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const len = Math.max(1, Math.hypot(dx, dy));
  // perpendicular
  const nx = -dy / len, ny = dx / len;
  // deterministic wobble
  const r = (i) => {
    const s = Math.sin((seed + 1) * 9301 + i * 49297) * 233280;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const bow = Math.min(60, len * 0.14) * (0.6 + 0.4 * r(1));
  const cx1 = a.x + dx * 0.33 + nx * bow;
  const cy1 = a.y + dy * 0.33 + ny * bow;
  const cx2 = a.x + dx * 0.66 + nx * bow * 0.6 * (0.5 + 0.5 * r(2));
  const cy2 = a.y + dy * 0.66 + ny * bow * 0.6;
  return `M ${a.x} ${a.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`;
}

function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Given an idea position + size, return anchor point nearest to target.
function anchorPoint(idea, other) {
  const w = idea.w || 230, h = idea.h || 96;
  const cx = idea.x + w / 2, cy = idea.y + h / 2;
  const dx = (other.x + (other.w || 230) / 2) - cx;
  const dy = (other.y + (other.h || 96) / 2) - cy;
  const ang = Math.atan2(dy, dx);
  // ellipse approximation
  const rx = w / 2 + 4, ry = h / 2 + 4;
  const ex = cx + Math.cos(ang) * rx;
  const ey = cy + Math.sin(ang) * ry;
  return { x: ex, y: ey };
}

function ConnectionLayer({ ideas, connections, width, height, highlightIds = [], revealed = null, onDeleteConnection, interactive = true }) {
  const byId = {};
  ideas.forEach(i => { byId[i.id] = i; });
  const [hoverIdx, setHoverIdx] = useState(null);

  return (
    <svg className="connection-layer rough-soft"
         width={width} height={height}
         style={{position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2, overflow: "visible"}}>
      {connections.map((c, idx) => {
        if (revealed != null && idx >= revealed) return null;
        const a = byId[c.from], b = byId[c.to];
        if (!a || !b) return null;
        const pa = anchorPoint(a, b);
        const pb = anchorPoint(b, a);
        const style = getConnectionStyle(c.kind);
        const highlighted = highlightIds.includes(c.from) && highlightIds.includes(c.to);
        const d = inkPath(pa, pb, idx);
        const mid = midPoint(pa, pb);
        const isHovered = hoverIdx === idx;
        return (
          <g key={`${c.from}-${c.to}-${idx}`} style={{opacity: highlighted ? 1 : 0.88}}>
            {/* shadow ghost for depth */}
            <path d={d}
                  fill="none"
                  stroke="rgba(26,24,20,0.10)"
                  strokeWidth={style.strokeWidth + 2}
                  strokeLinecap="round"
                  transform="translate(1.5, 2.5)"/>
            <path d={d}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={isHovered ? style.strokeWidth + 1.5 : (highlighted ? style.strokeWidth + 0.8 : style.strokeWidth)}
                  strokeDasharray={style.dash === "none" ? undefined : style.dash}
                  strokeLinecap="round"
                  markerEnd={style.marker || undefined}
                  style={{
                    strokeDashoffset: 0,
                    animation: `draw-line 700ms cubic-bezier(0.4,0,0.2,1) both`,
                    animationDelay: `${idx * 120}ms`,
                  }}/>
            {/* hit-area for hover (invisible wide stroke, pointer-events: stroke) */}
            {interactive && (
              <path d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    style={{pointerEvents: "stroke", cursor: "pointer"}}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onMouseLeave={() => setHoverIdx(cur => cur === idx ? null : cur)}/>
            )}
            {/* hover delete × at midpoint */}
            {isHovered && onDeleteConnection && (
              <g transform={`translate(${mid.x}, ${mid.y})`}
                 style={{pointerEvents: "all", cursor: "pointer"}}
                 onMouseEnter={() => setHoverIdx(idx)}
                 onMouseLeave={() => setHoverIdx(null)}
                 onClick={(e) => { e.stopPropagation(); onDeleteConnection(idx, c); }}>
                <circle r="11" fill="#ffffff" stroke="#1a1814" strokeWidth="1.4"/>
                <line x1="-4" y1="-4" x2="4" y2="4" stroke="#1a1814" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="-4" y1="4" x2="4" y2="-4" stroke="#1a1814" strokeWidth="1.8" strokeLinecap="round"/>
              </g>
            )}
            {/* hover label with connection kind */}
            {isHovered && !highlighted && (
              <g transform={`translate(${mid.x}, ${mid.y + 22})`} style={{pointerEvents:"none"}}>
                <rect x="-48" y="-10" width="96" height="20" rx="3"
                      fill="#1a1814" opacity="0.9"/>
                <text x="0" y="4" textAnchor="middle"
                      fontFamily='"Kalam", cursive' fontSize="11"
                      fill="#f6f1e4">{style.label}</text>
              </g>
            )}
            {c.rationale && highlighted && (
              <g transform={`translate(${mid.x}, ${mid.y})`} style={{pointerEvents:"none"}}>
                <rect x="-70" y="-20" width="140" height="26" rx="4"
                      fill="#f6f1e4" stroke="#1a1814" strokeWidth="1.2"/>
                <text x="0" y="-3" textAnchor="middle"
                      fontFamily='"Kalam", cursive' fontSize="11"
                      fill="#1a1814">{c.rationale.slice(0, 36)}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

Object.assign(window, { ConnectionLayer, getConnectionStyle });
