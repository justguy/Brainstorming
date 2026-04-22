// Polished empty-board → first-scouts animated beat
// Exposes: window.EmptyBoardAnimated

function EmptyBoardAnimated({ onNav, tweaks }) {
  // phases: idle → typing → captured → observing → scouts
  const [phase, setPhase] = useState("idle");
  const [text, setText] = useState("");
  const [captured, setCaptured] = useState(null);

  function capture() {
    const t = text.trim();
    if (!t) return;
    setCaptured({ id: "seed", title: t, body: "", x: 420, y: 250, color: "yellow" });
    setPhase("captured");
    // Dev observes
    setTimeout(() => setPhase("observing"), 800);
    // scouts arrive
    setTimeout(() => setPhase("scouts"), 2600);
  }

  function reset() {
    setPhase("idle"); setText(""); setCaptured(null);
  }

  const scouts = [
    { id: "s1", title: "Score it before you ship it", body: "Confidence × reversibility × blast radius. Borrowed from decision-quality lit.", x: 120, y: 200 },
    { id: "s2", title: "Decision journal, not a dashboard", body: "Write the bet down. Open it in 60 days. Score yourself.", x: 760, y: 440 },
  ];

  const isLocked = phase !== "idle";

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
          <div className="bs">{captured ? (phase === "scouts" ? "1 idea · 2 scouts" : "1 idea") : "0 ideas"}</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          {phase !== "idle" && (
            <button className="btn sm ghost" onClick={reset}>
              ↺ restart beat
            </button>
          )}
        </div>
      </div>

      {/* Idle / typing state — centered input */}
      {phase === "idle" && (
        <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", padding: 24}}>
          <div style={{textAlign:"center", maxWidth: 560}}>
            <div className="hand-title" style={{fontSize: 64, lineHeight: 0.95}}>
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
                     onKeyDown={(e) => e.key === "Enter" && capture()}
                     placeholder="Build a tool that helps teams…"
                     style={{
                       flex: 1, border:"none", background:"transparent", outline:"none",
                       fontFamily:"var(--f-hand)", fontSize: 28, fontWeight: 600, color:"var(--ink)"
                     }}/>
              <button className="btn primary" onClick={capture}>capture</button>
            </div>
            <div style={{marginTop: 14, display:"flex", gap:6, justifyContent:"center", fontFamily:"var(--f-mono)", fontSize:11, color:"var(--ink-faint)", textTransform:"uppercase", letterSpacing:"0.12em"}}>
              <kbd>⏎</kbd> to capture · <kbd>esc</kbd> dashboard
            </div>
          </div>
        </div>
      )}

      {/* First sticky lands */}
      {captured && (
        <div className="sticky-drop sticky torn c-yellow"
             style={{
               position: "absolute",
               left: captured.x, top: captured.y,
               width: 260,
               '--r': "-1.5deg",
             }}>
          <div className="sticky-title">{captured.title}</div>
          <div className="sticky-meta"><span className="tag">idea · 1 turn</span></div>
        </div>
      )}

      {/* Connection hints from scouts back to seed */}
      {phase === "scouts" && (
        <svg width="100%" height="100%" style={{position:"absolute", inset:0, pointerEvents:"none", zIndex: 2}}>
          <defs>
            <marker id="a-ghost" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L9 5 L0 10 z" fill="#7a5cab"/>
            </marker>
          </defs>
          {[
            { from: { x: 300, y: 240 }, to: { x: 540, y: 300 } },
            { from: { x: 870, y: 480 }, to: { x: 680, y: 330 } },
          ].map((c, i) => (
            <path key={i}
                  d={`M ${c.from.x} ${c.from.y} Q ${(c.from.x + c.to.x)/2} ${(c.from.y + c.to.y)/2 - 30} ${c.to.x} ${c.to.y}`}
                  stroke="#7a5cab" strokeWidth="1.5" strokeDasharray="3 4"
                  fill="none"
                  markerEnd="url(#a-ghost)"
                  style={{ animation: `draw-line 900ms ease-out both`, animationDelay: `${200 + i * 150}ms` }}/>
          ))}
        </svg>
      )}

      {/* Scout ghosts arrive */}
      {phase === "scouts" && scouts.map((s, i) => (
        <div key={s.id}
             className="scout-float sticky torn ghost"
             style={{
               left: s.x, top: s.y, width: 230,
               animationDelay: `${300 + i * 220}ms`,
               '--r': i % 2 === 0 ? "-3deg" : "2deg",
             }}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 8}}>
            <div className="sticky-title">{s.title}</div>
            <span className="stamp ai">scout</span>
          </div>
          <div className="sticky-body">{s.body}</div>
          <div style={{display:"flex", gap:6, marginTop: 10}}>
            <button className="btn sm primary">keep it</button>
            <button className="btn sm ghost">dismiss</button>
          </div>
        </div>
      ))}

      {/* Observing indicator */}
      {phase === "observing" && (
        <div style={{
          position:"absolute", left: "50%", top: "55%", transform:"translate(-50%, 0)",
          textAlign:"center", color:"var(--ink-faint)",
          fontFamily:"var(--f-mono)", fontSize: 11, letterSpacing:"0.16em", textTransform:"uppercase"
        }}>
          <div>Dev is observing · idle threshold 2.0s</div>
          <div style={{width: 180, margin: "10px auto 0", background:"var(--hairline)", height: 3, borderRadius: 2, overflow:"hidden"}}>
            <div className="observer-bar"/>
          </div>
        </div>
      )}

      {/* Persona with changing line across phases */}
      {isLocked && (
        <PersonaDock
          name={tweaks.personaName || "Dev"}
          role={tweaks.personaRole || "Bot"}
          line={
            phase === "captured" ? "Got it. Let me sit with this for a beat."
          : phase === "observing" ? "Two seconds. I'm looking for loosely-related neighbors, not filler."
          : "Two scouts. Loosely related, slightly unexpected. Ignore either one if it's noise."
          }
          pulsing={phase === "observing"}
          paused={false}
          onTogglePause={() => {}}
        />
      )}

      {/* Phase dots */}
      {isLocked && (
        <div style={{
          position:"absolute", top: 78, left: "50%", transform:"translateX(-50%)",
          display:"flex", gap:6, zIndex: 10
        }}>
          {["captured","observing","scouts"].map(p => (
            <div key={p} style={{
              width: 32, height: 4, borderRadius: 2,
              background: phase === p ? "var(--ink)"
                        : (["captured","observing","scouts"].indexOf(phase) > ["captured","observing","scouts"].indexOf(p) ? "var(--ink)" : "var(--hairline)")
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { EmptyBoardAnimated });
