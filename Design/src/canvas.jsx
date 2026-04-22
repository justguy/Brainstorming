// canvas.jsx — main brainstorm board
// Exposes: window.CanvasScreen

function CanvasScreen({ tweaks, onNav, demoState, onOpenDemo, onOpenLog, log, newIdeaFlash }) {
  const { IDEAS_MAIN, GHOSTS, CONNECTIONS, CRITIQUES, CLUSTER } = window.DATA;
  const [ideas, setIdeas] = useState(IDEAS_MAIN);
  const [selectedId, setSelectedId] = useState(null);
  const [dismissedCritiques, setDismissedCritiques] = useState([]);
  const [dismissedGhosts, setDismissedGhosts] = useState([]);
  const [acceptedGhosts, setAcceptedGhosts] = useState([]);
  const [hoverConn, setHoverConn] = useState(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 1600, h: 900 });

  // Connection edit state
  const [userConnections, setUserConnections] = useState([]);     // connections user added
  const [deletedKeys, setDeletedKeys] = useState([]);             // keys of deleted connections
  const [linkMode, setLinkMode] = useState(false);                // toolbar link button
  const [linkSource, setLinkSource] = useState(null);             // first sticky picked
  const [linkCursor, setLinkCursor] = useState(null);             // mouse {x,y} for rubber-band

  // Thinking beat — AI considers candidates, rejects some, promotes others
  const [thinkingIdeas, setThinkingIdeas] = useState([]);         // [{id, title, x, y, phase, color}] phase: candidate|rejected|survive
  const [aiThinking, setAiThinking] = useState(false);

  function connKey(c) { return `${c.from}-${c.to}-${c.kind || "builds_on"}`; }
  function flashToast(msg) { /* lightweight toast */ console.log(msg); }

  // expose thinking beat globally (for Tweaks panel)
  window.__runThinkingBeat = () => runThinkingBeat();

  // Run a full thinking beat — "AI is drafting" → candidates pop in → rejects scratch out → survivors solidify → real ideas
  function runThinkingBeat(seedTitle = "AI decision tool") {
    if (aiThinking) return;
    setAiThinking(true);
    // Pick origin near the current selected idea or center
    const anchor = ideas.find(i => i.id === selectedId) || ideas[0];
    const ax = (anchor?.x || 700) + 260;
    const ay = (anchor?.y || 360) - 60;

    const candidates = [
      { id: "tc1", title: "Decision journal → auto-surface precedent", color: "blue",  survives: true,  dx: 0,   dy: 0 },
      { id: "tc2", title: "Rubber-duck mode for 1:1 prep",              color: "peach", survives: false, dx: 220, dy: 40 },
      { id: "tc3", title: "Slack thread → decision doc condenser",      color: "green", survives: true,  dx: 80,  dy: 170 },
      { id: "tc4", title: "Meeting-end 'one-line takeaway' prompt",     color: "lilac", survives: false, dx: 300, dy: 200 },
      { id: "tc5", title: "Trade-off matrix generator",                 color: "pink",  survives: false, dx: -40, dy: 210 },
    ];

    // Stagger reveal
    const staged = [];
    candidates.forEach((c, i) => {
      staged.push({
        ...c,
        x: ax + c.dx,
        y: ay + c.dy,
        phase: "pending",
      });
    });
    setThinkingIdeas(staged);

    let delay = 0;
    candidates.forEach((c, i) => {
      setTimeout(() => {
        setThinkingIdeas(curr => curr.map(t => t.id === c.id ? { ...t, phase: "candidate" } : t));
      }, 250 + i * 280);
    });

    // After all revealed, reject the non-survivors one by one
    const allRevealedBy = 250 + candidates.length * 280 + 400;
    let rejectDelay = allRevealedBy;
    candidates.forEach(c => {
      if (!c.survives) {
        setTimeout(() => {
          setThinkingIdeas(curr => curr.map(t => t.id === c.id ? { ...t, phase: "rejected" } : t));
        }, rejectDelay);
        rejectDelay += 420;
      }
    });

    // Survivors pulse & then get added as real ideas
    const surviveAt = rejectDelay + 300;
    candidates.forEach(c => {
      if (c.survives) {
        setTimeout(() => {
          setThinkingIdeas(curr => curr.map(t => t.id === c.id ? { ...t, phase: "survive" } : t));
        }, surviveAt);
      }
    });

    // Final: clear thinking, add survivors as real ideas
    setTimeout(() => {
      const surviving = candidates.filter(c => c.survives);
      setIdeas(curr => [
        ...curr,
        ...surviving.map((c, idx) => ({
          id: "think_" + c.id,
          x: ax + c.dx, y: ay + c.dy,
          w: 220, h: 96,
          title: c.title,
          tag: "ai draft",
          ai: true,
          color: c.color,
          turns: 1,
        }))
      ]);
      setThinkingIdeas([]);
      setAiThinking(false);
    }, surviveAt + 900);
  }

  // Drag state
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    function measure() {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Demo mode overrides
  const demoActive = demoState && demoState.active;
  const demoScene = demoState && demoState.scene;

  // Scripted reveal states
  let visibleIdeas = ideas;
  // merge built-in + user-added, filter deleted
  const allConnections = [...CONNECTIONS, ...userConnections].filter(c => !deletedKeys.includes(connKey(c)));
  let visibleConnections = allConnections;
  let visibleGhosts = GHOSTS;
  let visibleCritiques = CRITIQUES;
  let showCluster = tweaks.showConnections && !demoActive; // normal mode
  let connRevealed = null;
  let highlightIds = [];

  if (demoActive) {
    const act = demoScene?.act;
    // everything hidden by default
    visibleIdeas = ideas.filter(i => i.id === "i1");
    visibleConnections = [];
    visibleGhosts = [];
    visibleCritiques = [];
    showCluster = false;
    if (["scouts", "connections", "aha", "critique", "quiet", "pushfurther", "cluster", "reframe"].includes(act)) {
      visibleIdeas = ideas.filter(i => ["i1","i2","i3"].includes(i.id));
    }
    if (["connections","aha","critique","quiet","pushfurther","cluster","reframe"].includes(act)) {
      visibleConnections = CONNECTIONS.filter(c => ["i2","i3","i1"].includes(c.from) && ["i2","i3","i1"].includes(c.to));
      connRevealed = visibleConnections.length;
    }
    if (act === "aha") highlightIds = ["i2","i3"];
    if (act === "critique") {
      visibleCritiques = CRITIQUES.filter(c => c.ideaId === "i2");
    }
    if (["pushfurther","cluster","reframe"].includes(act)) {
      visibleIdeas = ideas.filter(i => ["i1","i2","i3","i4","i5","i6"].includes(i.id));
      visibleConnections = CONNECTIONS;
      connRevealed = null;
    }
    if (act === "cluster" || act === "reframe") showCluster = true;
    if (act === "scouts") visibleGhosts = GHOSTS;
  } else {
    if (!tweaks.showConnections) visibleConnections = [];
    if (!tweaks.showCritiques)   visibleCritiques  = [];
    if (!tweaks.showGhosts)      visibleGhosts     = [];
  }

  // Filter dismissed
  visibleGhosts = visibleGhosts.filter(g => !dismissedGhosts.includes(g.id));
  visibleCritiques = visibleCritiques.filter(c => !dismissedCritiques.includes(c.id));

  // Drag handlers
  function startDrag(e, ideaId) {
    if (demoActive) return;
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrag({ id: ideaId, dx: e.clientX - rect.left - idea.x, dy: e.clientY - rect.top - idea.y });
    setSelectedId(ideaId);
    e.preventDefault();
  }
  useEffect(() => {
    if (!drag) return;
    function onMove(e) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - drag.dx;
      const y = e.clientY - rect.top  - drag.dy;
      setIdeas(curr => curr.map(i => i.id === drag.id ? { ...i, x, y } : i));
    }
    function onUp() { setDrag(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  // Persona line
  let personaLine = window.PERSONA_LINES.observing;
  let pulsing = false;
  if (aiThinking) {
    // lines cycle based on phase — we'll just pick a generic
    personaLine = "Drafting a few candidates. Scratching the ones that don't hold up.";
    pulsing = true;
  } else if (demoActive && demoScene?.say) {
    personaLine = demoScene.say;
    pulsing = true;
  } else if (selectedId) {
    const sel = ideas.find(i => i.id === selectedId);
    personaLine = `Looking at "${sel?.title}". Want me to press on it?`;
    pulsing = false;
  }

  return (
    <div className={"paper-grid" + (linkMode ? " link-mode" : "")} ref={canvasRef}
         onMouseMove={(e) => {
           if (!linkMode || !linkSource) return;
           const rect = canvasRef.current.getBoundingClientRect();
           setLinkCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
         }}
         onMouseLeave={() => setLinkCursor(null)}
         style={{position:"absolute", inset:0, overflow:"hidden"}}>
      <SvgDefs/>

      {/* Top chrome */}
      <div className="topbar">
        <div style={{display:"flex", gap: 10, alignItems:"center"}}>
          <div className="brand">
            <BrandMark/>
            <div>
              <div className="brand-name">Brainstorm</div>
              <div className="brand-tag">a thinking partner</div>
            </div>
          </div>
          <div className="toolbar-group">
            <button className="icon-btn" onClick={() => onNav("dashboard")} title="Boards">
              <Icon name="home" size={16}/>
            </button>
            <button className="icon-btn" onClick={() => onNav("settings")} title="Settings">
              <Icon name="gear" size={16}/>
            </button>
          </div>
        </div>

        <div className="board-title-chip">
          <div className="bt">AI decision tool</div>
          <div className="bs">{visibleIdeas.length} ideas · {visibleConnections.length} connections</div>
        </div>

        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          <div className="toolbar-group">
            <button className="icon-btn" title="Add idea"><Icon name="plus" size={16}/></button>
            <button className={"icon-btn" + (linkMode ? " active" : "")}
                    title={linkMode ? "Cancel connection" : "Draw connection — click two ideas"}
                    onClick={() => { setLinkMode(m => !m); setLinkSource(null); }}>
              <Icon name="link" size={16}/>
            </button>
            <button className="icon-btn" title="Scout ideas — AI considers & commits a few"
                    onClick={() => runThinkingBeat()}>
              <Icon name="scout" size={16}/>
            </button>
            <button className="icon-btn" title="Critique"><Icon name="bolt" size={16}/></button>
          </div>
          <button className="btn sm" onClick={onOpenDemo} style={{whiteSpace:"nowrap"}}>
            <Icon name="play" size={13}/> demo
          </button>
        </div>
      </div>

      {/* Cluster halo (behind ideas) */}
      {showCluster && (
        <ClusterHalo ideas={visibleIdeas} ideaIds={CLUSTER.ideaIds} label={CLUSTER.label}/>
      )}

      {/* Connections */}
      {tweaks.showConnections !== false && (
        <ConnectionLayer
          ideas={visibleIdeas}
          connections={visibleConnections}
          width={size.w}
          height={size.h}
          highlightIds={highlightIds}
          revealed={connRevealed}
          interactive={!demoActive}
          onDeleteConnection={(idx, c) => {
            setDeletedKeys(k => [...k, connKey(c)]);
          }}/>
      )}

      {/* Rubber-band line while drawing a new connection */}
      {linkMode && linkSource && linkCursor && (() => {
        const src = ideas.find(i => i.id === linkSource);
        if (!src) return null;
        const sx = src.x + (src.w || 230) / 2;
        const sy = src.y + (src.h || 96) / 2;
        return (
          <svg width={size.w} height={size.h}
               style={{position:"absolute", inset:0, pointerEvents:"none", zIndex: 3, overflow:"visible"}}>
            <path d={`M ${sx} ${sy} L ${linkCursor.x} ${linkCursor.y}`}
                  stroke="#1a1814" strokeWidth="1.8" strokeDasharray="6 4"
                  fill="none" strokeLinecap="round" opacity="0.7"/>
            <circle cx={linkCursor.x} cy={linkCursor.y} r="5"
                    fill="#ffffff" stroke="#1a1814" strokeWidth="1.4"/>
          </svg>
        );
      })()}

      {/* Link mode banner */}
      {linkMode && (
        <div className="link-mode-banner">
          <Icon name="link" size={13}/>
          {linkSource
            ? `connect "${ideas.find(i => i.id === linkSource)?.title.slice(0,28)}" → pick another idea`
            : "link mode: click an idea to start a connection"}
          <button className="btn sm ghost"
                  onClick={() => { setLinkMode(false); setLinkSource(null); }}>
            cancel
          </button>
        </div>
      )}

      {/* Idea stickies */}
      {visibleIdeas.map(idea => (
        <Sticky key={idea.id}
                idea={idea}
                selected={selectedId === idea.id}
                showAI={true}
                linkCandidate={linkMode && linkSource !== idea.id}
                linkSource={linkSource === idea.id}
                onMouseDown={(e) => { if (!linkMode) startDrag(e, idea.id); }}
                onClick={() => {
                  if (linkMode) {
                    if (!linkSource) {
                      setLinkSource(idea.id);
                    } else if (linkSource !== idea.id) {
                      // create connection
                      const newC = { from: linkSource, to: idea.id, kind: "builds_on",
                                     rationale: "User-drawn connection." };
                      setUserConnections(u => [...u, newC]);
                      // also un-delete if it was deleted before
                      setDeletedKeys(k => k.filter(x => x !== connKey(newC)));
                      setLinkMode(false);
                      setLinkSource(null);
                    }
                    return;
                  }
                  setSelectedId(idea.id);
                  if (selectedId === idea.id && onOpenLog) onOpenLog(idea.id);
                }}/>
      ))}

      {/* Thinking beat — candidates the AI is considering */}
      {thinkingIdeas.map(t => {
        if (t.phase === "pending") return null;
        const rotSeed = (t.id.charCodeAt(2) * 7) % 13 - 6;
        const rot = rotSeed * 0.3;
        const cls = [
          "sticky", "torn", "c-" + t.color, "ai-authored",
          t.phase === "candidate" && "thinking-candidate",
          t.phase === "rejected" && "thinking-reject",
          t.phase === "survive" && "thinking-survive",
        ].filter(Boolean).join(" ");
        return (
          <div key={t.id} className={cls}
               style={{
                 left: t.x, top: t.y, width: 210,
                 '--r': `${rot}deg`,
                 transform: `rotate(${rot}deg)`,
                 position: "absolute",
                 zIndex: 5,
                 pointerEvents: "none",
               }}>
            <div className="sticky-title" style={{fontSize: 15}}>{t.title}</div>
            <div className="sticky-meta">
              <span className="tag">
                {t.phase === "candidate" && "considering…"}
                {t.phase === "rejected" && "not quite"}
                {t.phase === "survive" && "keeping"}
              </span>
            </div>
            {t.phase === "rejected" && (
              <svg className="scratch-out" viewBox="0 0 210 96" preserveAspectRatio="none">
                <path d="M 8 18 Q 110 10 202 28 M 204 36 Q 100 54 6 44 M 8 58 Q 110 52 202 68 M 204 76 Q 100 88 6 78"/>
              </svg>
            )}
          </div>
        );
      })}

      {/* Drop-strip when user is dragging a turn from the log */}
      {log?.draggingTurn && (
        <div className="drop-strip">
          <div className="drop-chip"
               onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("hot"); }}
               onDragLeave={(e) => e.currentTarget.classList.remove("hot")}
               onDrop={(e) => {
                 e.preventDefault();
                 log.setDraggingTurn(null);
               }}>
            <Icon name="plus" size={16}/> drop → new idea
          </div>
          <div className="drop-chip"
               onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("hot"); }}
               onDragLeave={(e) => e.currentTarget.classList.remove("hot")}
               onDrop={(e) => { e.preventDefault(); log.setDraggingTurn(null); }}>
            <Icon name="link" size={16}/> drop → attach to idea
          </div>
          <div className="drop-chip"
               onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("hot"); }}
               onDragLeave={(e) => e.currentTarget.classList.remove("hot")}
               onDrop={(e) => { e.preventDefault(); log.setDraggingTurn(null); }}>
            <Icon name="board" size={16}/> drop → another board
          </div>
        </div>
      )}

      {/* New-idea flash from log transfer */}
      {newIdeaFlash && (
        <div style={{
          position:"absolute", left: "50%", top: 110, transform:"translateX(-50%)",
          background:"var(--accent-revives)", color:"white",
          padding:"8px 14px", borderRadius: 20,
          fontFamily:"var(--f-mono)", fontSize: 11, letterSpacing:"0.1em", textTransform:"uppercase",
          zIndex: 40, boxShadow:"2px 2px 0 rgba(26,24,20,0.3)"
        }} className="fade-in-up">
          ✓ transferred: "{newIdeaFlash.title}"
        </div>
      )}

      {/* Accepted ghosts become user stickies */}
      {acceptedGhosts.map(g => (
        <Sticky key={g.id} idea={{...g, color: "peach", ai: true}}/>
      ))}

      {/* Ghost suggestions */}
      {visibleGhosts.map(g => (
        <GhostSticky key={g.id}
                     idea={g}
                     onAccept={(idea) => {
                       setAcceptedGhosts(a => [...a, idea]);
                       setDismissedGhosts(d => [...d, idea.id]);
                     }}
                     onDismiss={(idea) => setDismissedGhosts(d => [...d, idea.id])}/>
      ))}

      {/* Critiques: render both speech bubble (c1) + margin note (c2) */}
      {visibleCritiques.map(c => {
        const idea = visibleIdeas.find(i => i.id === c.ideaId);
        if (!idea) return null;
        const w = idea.w || 230;
        if (c.kind === "bubble") {
          return (
            <CritiqueBubble key={c.id}
                            x={idea.x + w + 28}
                            y={idea.y + 4}
                            text={c.text}
                            who="Dev"
                            onDismiss={() => setDismissedCritiques(d => [...d, c.id])}/>
          );
        }
        return (
          <MarginNote key={c.id}
                      x={idea.x + w + 20}
                      y={idea.y + 20}
                      text={c.text}
                      onDismiss={() => setDismissedCritiques(d => [...d, c.id])}/>
        );
      })}

      {/* Persona dock */}
      {tweaks.showPersona && (
        <PersonaDock
          name={tweaks.personaName || "Dev"}
          role={tweaks.personaRole || "Bot"}
          line={personaLine}
          pulsing={pulsing}
          thinking={aiThinking}
          paused={tweaks.aiAggressiveness === "off"}
          onTogglePause={() => {
            // cycle aggressiveness
            const next = tweaks.aiAggressiveness === "off" ? "balanced" : "off";
            window.__setTweak && window.__setTweak("aiAggressiveness", next);
          }}
          onAct={() => runThinkingBeat()}
          onOpenLog={() => onOpenLog && onOpenLog(selectedId || "i1")}
        />
      )}

      {/* Status line */}
      <div className="status-line">
        {demoActive
          ? `demo · scene ${demoScene?.id + 1}/9 · ${demoScene?.label}`
          : `local-first · indexeddb · agg: ${tweaks.aiAggressiveness}`}
      </div>
    </div>
  );
}

Object.assign(window, { CanvasScreen });
