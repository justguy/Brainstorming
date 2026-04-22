// cards.jsx — Sticky (idea), Ghost, Critique bubble, Margin note
// Exposes: window.Sticky, window.GhostSticky, window.CritiqueBubble, window.MarginNote, window.ClusterHalo

const COLORS = ["yellow", "pink", "blue", "green", "peach", "lilac"];

function stickyRotation(id) {
  // deterministic slight rotation per idea id
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 0.6; // -1.8..1.8 deg
}

function Sticky({ idea, selected, onClick, onMouseDown, showAI = true, highlighted, linkCandidate, linkSource }) {
  const rot = stickyRotation(idea.id);
  const cls = [
    "sticky", "torn",
    "c-" + (idea.color || "yellow"),
    selected && "selected",
    idea.ai && showAI && "ai-authored",
    idea.killed && "killed",
    highlighted && "highlighted",
    linkCandidate && "link-candidate",
    linkSource && "link-source",
  ].filter(Boolean).join(" ");

  return (
    <div className={cls}
         data-id={idea.id}
         onMouseDown={onMouseDown}
         onClick={onClick}
         style={{
           left: idea.x, top: idea.y,
           transform: `rotate(${rot}deg)`,
           '--r': `${rot}deg`,
           width: idea.w || 230,
         }}>
      <div className="sticky-title">{idea.title}</div>
      {idea.body && <div className="sticky-body">{idea.body}</div>}
      {idea.meta !== false && (
        <div className="sticky-meta">
          <span className="tag">{idea.tag || "idea"}</span>
          {idea.turns != null && <span>· {idea.turns} turns</span>}
        </div>
      )}
    </div>
  );
}

function GhostSticky({ idea, onAccept, onDismiss }) {
  const rot = stickyRotation(idea.id) * 0.5;
  return (
    <div className="sticky torn ghost"
         style={{
           left: idea.x, top: idea.y,
           transform: `rotate(${rot}deg)`,
           '--r': `${rot}deg`,
           width: idea.w || 220,
         }}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8}}>
        <div className="sticky-title">{idea.title}</div>
        <span className="stamp ai">scout</span>
      </div>
      <div className="sticky-body">{idea.body}</div>
      <div style={{display: "flex", gap: 6, marginTop: 10}}>
        <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); onAccept && onAccept(idea); }}>
          keep it
        </button>
        <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); onDismiss && onDismiss(idea); }}>
          dismiss
        </button>
      </div>
    </div>
  );
}

// Draggable wrapper for floating board elements
function useDragHandle(initialX, initialY) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  useEffect(() => { setPos({ x: initialX, y: initialY }); }, [initialX, initialY]);
  useEffect(() => {
    if (!dragging) return;
    function onMove(e) {
      const s = startRef.current;
      setPos({ x: s.baseX + (e.clientX - s.cx), y: s.baseY + (e.clientY - s.cy) });
    }
    function onUp() { setDragging(false); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);
  function start(e) {
    startRef.current = { baseX: pos.x, baseY: pos.y, cx: e.clientX, cy: e.clientY };
    setDragging(true);
    e.preventDefault();
    e.stopPropagation();
  }
  return { pos, start, dragging };
}

// Speech-bubble critique (persona-authored)
function CritiqueBubble({ x, y, text, who = "Dev", onDismiss }) {
  const { pos, start, dragging } = useDragHandle(x, y);
  return (
    <div className={"bubble critique bubble-left fade-in-up" + (dragging ? " dragging" : "")}
         onMouseDown={start}
         style={{left: pos.x, top: pos.y, cursor: dragging ? "grabbing" : "grab"}}>
      <div className="bubble-who">{who} · devil's advocate</div>
      <div>{text}</div>
      <div style={{display: "flex", gap: 6, marginTop: 8}}>
        <button className="btn sm ghost"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDismiss && onDismiss(); }}>noted</button>
        <button className="btn sm ghost"
                onMouseDown={(e) => e.stopPropagation()}>press harder</button>
      </div>
    </div>
  );
}

// Torn-paper margin note critique
function MarginNote({ x, y, text, onDismiss }) {
  const { pos, start, dragging } = useDragHandle(x, y);
  return (
    <div className={"margin-note fade-in-up" + (dragging ? " dragging" : "")}
         onMouseDown={start}
         style={{left: pos.x, top: pos.y, cursor: dragging ? "grabbing" : "grab"}}>
      <span className="mn-label">critique</span>
      <button className="mn-dismiss" onClick={(e) => { e.stopPropagation(); onDismiss && onDismiss(); }} aria-label="dismiss">×</button>
      {text}
    </div>
  );
}

function ClusterHalo({ ideas, ideaIds, label }) {
  if (!ideaIds || ideaIds.length === 0) return null;
  const picks = ideas.filter(i => ideaIds.includes(i.id));
  if (picks.length === 0) return null;
  const pad = 28;
  const xs = picks.map(i => i.x), ys = picks.map(i => i.y);
  const xe = picks.map(i => i.x + (i.w || 230));
  const ye = picks.map(i => i.y + (i.h || 120));
  const left = Math.min(...xs) - pad;
  const top  = Math.min(...ys) - pad;
  const right = Math.max(...xe) + pad;
  const bottom = Math.max(...ye) + pad;
  return (
    <div className="cluster-halo"
         style={{left, top, width: right - left, height: bottom - top}}>
      <span className="cluster-label">{label || "cluster"}</span>
    </div>
  );
}

Object.assign(window, { Sticky, GhostSticky, CritiqueBubble, MarginNote, ClusterHalo, stickyRotation, COLORS });
