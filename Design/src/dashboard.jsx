// dashboard.jsx — boards home
// Exposes: window.DashboardScreen

function BoardPreview({ color }) {
  // tiny SVG preview of stickies + lines
  const C = { yellow: "#f7e58a", pink: "#f4b9c6", blue: "#b8dbe8", green: "#c5e0a8", peach: "#f5ccac", lilac: "#d7c8e8" };
  const fill = C[color] || C.yellow;
  return (
    <svg viewBox="0 0 240 120" width="100%" height="100%" preserveAspectRatio="none">
      <g stroke="#1a1814" strokeWidth="1.2">
        <rect x="14" y="18" width="58" height="34" fill={fill} transform="rotate(-2 43 35)"/>
        <rect x="95" y="10" width="58" height="34" fill="#f7e58a" transform="rotate(1 124 27)"/>
        <rect x="176" y="22" width="54" height="34" fill="#b8dbe8" transform="rotate(-3 203 39)"/>
        <rect x="40" y="72" width="58" height="34" fill="#c5e0a8" transform="rotate(2 69 89)"/>
        <rect x="140" y="66" width="62" height="34" fill="#f4b9c6" transform="rotate(-1 171 83)"/>
        <path d="M60 50 C90 40 110 40 124 44" fill="none"/>
        <path d="M153 27 C168 32 180 34 195 30" fill="none" strokeDasharray="3 2" stroke="#c94a3a"/>
        <path d="M120 44 C120 60 100 70 95 82" fill="none" strokeDasharray="1 3"/>
        <path d="M170 60 C160 75 140 80 130 80" fill="none"/>
      </g>
    </svg>
  );
}

function DashboardScreen({ onNav }) {
  const { BOARDS } = window.DATA;
  return (
    <div className="paper-dots dashboard">
      <div className="dash-head">
        <div>
          <h1>Boards.</h1>
          <div className="dash-sub">Six boards going. Dev hasn't interrupted once today — that means you're either on a roll or stuck. Open one and find out.</div>
        </div>
        <div style={{display:"flex", gap: 10, alignItems:"center"}}>
          <button className="btn" onClick={() => onNav("settings")}>
            <Icon name="gear" size={16}/> settings
          </button>
          <button className="btn primary">
            <Icon name="plus" size={16}/> new board
          </button>
        </div>
      </div>

      <div className="board-grid">
        <div className="board-card new-board" onClick={() => onNav("empty")}>
          <div className="plus">+</div>
          <div className="hand-body" style={{marginTop: 4}}>start a blank board</div>
        </div>
        {BOARDS.map(b => (
          <div key={b.id} className="board-card" onClick={() => onNav("canvas")}>
            <div className="bc-title">{b.title}</div>
            <div className="bc-sub">{b.sub}</div>
            <div className="bc-preview"><BoardPreview color={b.color}/></div>
            <div className="bc-stats">
              <span>{b.ideas} ideas · {b.conns} conns</span>
              <span>{b.last}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop: 40, display: "flex", gap: 18, alignItems:"center", color:"var(--ink-soft)"}}>
        <span className="stamp">v0.7 · local-only</span>
        <span className="hand-body">sync + multiplayer is on the roadmap, not yet.</span>
      </div>
    </div>
  );
}

// Empty board + first-idea flow
function EmptyBoard({ onNav, tweaks }) {
  const [seeded, setSeeded] = useState(false);
  const [text, setText] = useState("");

  function addFirst() {
    if (!text.trim()) return;
    setSeeded(true);
  }

  return (
    <div className="paper-grid" style={{position:"absolute", inset:0, overflow:"hidden"}}>
      <SvgDefs/>
      <div className="topbar">
        <div style={{display:"flex", gap:10}}>
          <div className="brand">
            <BrandMark/>
            <div>
              <div className="brand-name">Brainstorm</div>
              <div className="brand-tag">a thinking partner</div>
            </div>
          </div>
          <div className="toolbar-group">
            <button className="icon-btn" onClick={() => onNav("dashboard")}><Icon name="back" size={16}/></button>
          </div>
        </div>
        <div className="board-title-chip">
          <div className="bt">Untitled board</div>
          <div className="bs">0 ideas</div>
        </div>
        <div style={{width: 180}}></div>
      </div>

      {!seeded ? (
        <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
          <div style={{textAlign:"center", maxWidth: 540}}>
            <div className="hand-title" style={{fontSize: 64, lineHeight: 1}}>
              One idea.<br/>Don't overthink it.
            </div>
            <div className="hand-body" style={{color:"var(--ink-soft)", margin:"14px 0 26px", fontSize: 17}}>
              Dev is watching. He won't speak for about 2 seconds after you stop typing.
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap: 8,
              padding: 12, background:"var(--sticky-yellow)", border:"2px solid var(--ink)",
              borderRadius: 10, boxShadow: "3px 3px 0 var(--ink)", transform:"rotate(-1deg)"
            }}>
              <input autoFocus value={text} onChange={e => setText(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && addFirst()}
                     placeholder="Build a tool that helps teams…"
                     style={{
                       flex: 1, border:"none", background:"transparent", outline:"none",
                       fontFamily:"var(--f-hand)", fontSize: 28, fontWeight: 600, color:"var(--ink)"
                     }}/>
              <button className="btn primary" onClick={addFirst}>capture</button>
            </div>
            <div style={{marginTop: 14, display:"flex", gap:6, justifyContent:"center", fontFamily:"var(--f-mono)", fontSize:11, color:"var(--ink-faint)", textTransform:"uppercase", letterSpacing:"0.12em"}}>
              <kbd>⏎</kbd> to capture · <kbd>⇧⏎</kbd> for a new line · <kbd>esc</kbd> dashboard
            </div>
          </div>
        </div>
      ) : (
        <>
          <Sticky idea={{id:"seed", title: text, body:"", x: 420, y: 260, color:"yellow", origin:"user"}}/>
          <div style={{position:"absolute", left: 420, top: 420}}
               className="persona-say fade-in-up">
            <div className="who">Dev · engineering manager</div>
            <div className="what">Good first cut. I'll sit with it for 2 seconds and then float two scout ideas — ignore them if they're noise.</div>
          </div>
          <PersonaDock
            name={tweaks.personaName || "Dev"}
            line="Observing. I'll act when it adds clear value."
            pulsing={true}
            paused={false}
            onTogglePause={() => {}}
          />
        </>
      )}
    </div>
  );
}

Object.assign(window, { DashboardScreen, EmptyBoard });
