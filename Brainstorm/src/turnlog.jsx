// turnlog.jsx — turn-log inspector for a single idea
// Shows the AI/user turn history; supports pin, dismiss, drag-to-transfer.
// Exposes: window.TurnLog, window.useTurnLog

// Mock turn data per idea. Each entry has origin: ai | user | edit | critique
const TURN_DATA = {
  i1: [
    { id: "t1",  origin: "user",    t: "14m", who: "You",       text: "Build a tool that helps teams make better decisions using AI." },
    { id: "t2",  origin: "ai",      t: "14m", who: "Dev · scout_ideas",
      text: "Floated 2 scouts: 'Red team mode' and 'Decision half-life'.",
      rationale: "Explore phase — user just anchored a broad idea; surface slightly-unexpected neighbors." },
    { id: "t3",  origin: "edit",    t: "13m", who: "You",       text: "Tightened title: 'blind spots before a decision is committed'." },
    { id: "t4",  origin: "ai",      t: "12m", who: "Dev · find_connections",
      text: "Drew 4 connections. The #2↔#3 pair is the spicy one.",
      rationale: "Structure phase — 3 related ideas + idle 2.1s. Confidence 0.74." },
    { id: "t5",  origin: "critique",t: "9m",  who: "Dev · critique_idea",
      text: "You're assuming past decisions were correct. Most of them weren't — you just shipped them.",
      rationale: "Stress phase — idea stable 42s, no contradicting signal in neighborhood." },
    { id: "t6",  origin: "user",    t: "8m",  who: "You",       text: "Dismissed Red team mode." },
    { id: "t7",  origin: "ai",      t: "6m",  who: "Dev · scout_ideas",
      text: "Scout: 'Score decisions before execution' — grounded leap.",
      rationale: "Feels like a reach, but reversibility × blast-radius framing is standard in the decision-quality literature." },
    { id: "t8",  origin: "ai",      t: "2m",  who: "Dev · converge_hint",
      text: "This cluster (score + journal + pre-mortem) looks promising. Want to consolidate?",
      rationale: "Converge phase — 3 co-located ideas, all builds_on, pairwise similarity > 0.7." },
    { id: "t9",  origin: "user",    t: "1m",  who: "You",       text: "Pinned the pre-mortem sticky." },
  ],
};

function useTurnLog() {
  const [openIdeaId, setOpenIdeaId] = useState(null);
  const [pinned, setPinned] = useLocal("bs_pinned_turns", {});
  const [dismissed, setDismissed] = useLocal("bs_dismissed_turns", {});
  const [draggingTurn, setDraggingTurn] = useState(null);

  return {
    openIdeaId, setOpenIdeaId,
    pinned, setPinned,
    dismissed, setDismissed,
    draggingTurn, setDraggingTurn,
  };
}

function DotLabel({ origin }) {
  const letter = origin === "ai" ? "Ai"
               : origin === "critique" ? "!"
               : origin === "edit" ? "✎"
               : "•";
  return <div className="lt-dot">{letter}</div>;
}

function LogTurn({ turn, pinned, onPin, onDismiss, onDragStart, onDragEnd, onNewIdea, onTransfer }) {
  const [menu, setMenu] = useState(false);
  const cls = ["log-turn", `origin-${turn.origin}`, pinned && "pinned"].filter(Boolean).join(" ");
  return (
    <div className={cls}
         draggable
         onDragStart={(e) => {
           e.dataTransfer.setData("text/plain", JSON.stringify(turn));
           e.dataTransfer.effectAllowed = "move";
           onDragStart && onDragStart(turn);
         }}
         onDragEnd={() => onDragEnd && onDragEnd()}>
      <DotLabel origin={turn.origin}/>
      <div className="lt-head">
        <div className="lt-who">
          <span className={turn.origin === "ai" || turn.origin === "critique" ? "who-ai" : ""}>{turn.who}</span>
        </div>
        <div className="lt-time">{turn.t} ago</div>
      </div>
      <div className="lt-text">{turn.text}</div>
      {turn.rationale && (
        <div className="lt-rationale">
          <strong style={{fontSize: 10, textTransform:"uppercase", letterSpacing:"0.1em"}}>why · </strong>
          {turn.rationale}
        </div>
      )}
      <div className="lt-actions">
        <button className={"pin" + (pinned ? " on" : "")} onClick={onPin}>
          {pinned ? "★ pinned" : "☆ pin"}
        </button>
        <button onClick={() => setMenu(m => !m)}>transfer →</button>
        <button className="dismiss" onClick={onDismiss}>dismiss</button>
        <span style={{marginLeft:"auto", fontFamily:"var(--f-mono)", fontSize: 10, color:"var(--ink-faint)"}}>
          ⋮⋮ drag to board
        </span>
      </div>
      {menu && (
        <div style={{
          marginTop: 8, padding: 8, background:"var(--paper)",
          border: "1.5px dashed var(--ink)", borderRadius: 6,
          display:"flex", flexDirection:"column", gap: 4
        }}>
          <button className="btn sm ghost" style={{justifyContent:"flex-start"}}
                  onClick={() => { onNewIdea && onNewIdea(turn); setMenu(false); }}>
            → new idea on this board
          </button>
          <button className="btn sm ghost" style={{justifyContent:"flex-start"}}
                  onClick={() => { onTransfer && onTransfer(turn, "existing"); setMenu(false); }}>
            → attach to existing idea…
          </button>
          <button className="btn sm ghost" style={{justifyContent:"flex-start"}}
                  onClick={() => { onTransfer && onTransfer(turn, "board"); setMenu(false); }}>
            → another board (Q3 roadmap re-think)
          </button>
        </div>
      )}
    </div>
  );
}

function TurnLog({ ideaId, ideaTitle, onClose, log, onNewIdea, onTransfer }) {
  const [filter, setFilter] = useState("all");
  const turns = TURN_DATA[ideaId] || TURN_DATA.i1;
  const shown = turns.filter(t => {
    if (log.dismissed[t.id]) return false;
    if (filter === "all") return true;
    if (filter === "ai") return t.origin === "ai" || t.origin === "critique";
    if (filter === "user") return t.origin === "user" || t.origin === "edit";
    if (filter === "pinned") return !!log.pinned[t.id];
    return true;
  });

  const counts = {
    all: turns.length,
    ai: turns.filter(t => t.origin === "ai" || t.origin === "critique").length,
    user: turns.filter(t => t.origin === "user" || t.origin === "edit").length,
    pinned: Object.values(log.pinned).filter(Boolean).length,
  };

  return (
    <>
      <div className="log-backdrop" onClick={onClose}/>
      <div className="log-panel" role="dialog" aria-label="turn log">
        <div className="log-head">
          <div>
            <div className="lh-sub">turn log · idea</div>
            <div className="lh-title">{ideaTitle || "Untitled idea"}</div>
            <div className="lh-sub" style={{marginTop:6}}>
              {counts.ai} ai · {counts.user} you · {counts.pinned} pinned
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <Icon name="close" size={16}/>
          </button>
        </div>

        <div className="log-filters">
          {["all","ai","user","pinned"].map(k => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {k} · {counts[k]}
            </button>
          ))}
        </div>

        <div className="log-body">
          {shown.map(t => (
            <LogTurn key={t.id}
                     turn={t}
                     pinned={!!log.pinned[t.id]}
                     onPin={() => log.setPinned({ ...log.pinned, [t.id]: !log.pinned[t.id] })}
                     onDismiss={() => log.setDismissed({ ...log.dismissed, [t.id]: true })}
                     onDragStart={(turn) => log.setDraggingTurn(turn)}
                     onDragEnd={() => log.setDraggingTurn(null)}
                     onNewIdea={onNewIdea}
                     onTransfer={onTransfer}/>
          ))}
          {shown.length === 0 && (
            <div style={{textAlign:"center", padding:"40px 20px", color:"var(--ink-faint)", fontFamily:"var(--f-hand-body)"}}>
              nothing in this filter yet.
            </div>
          )}
        </div>

        <div className="log-foot">
          <div className="lf-stats">paginated · cursor {turns.length}/{turns.length}</div>
          <div style={{display:"flex", gap:6}}>
            <button className="btn sm ghost">export</button>
            <button className="btn sm">load more</button>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TurnLog, useTurnLog, TURN_DATA });
