// app.jsx — top-level composition, routing, tweaks wiring

function App() {
  const defaults = window.__TWEAKS__ || {};
  const [tweaks, setTweaks] = useLocal("bs_tweaks", defaults);
  const [screen, setScreen] = useLocal("bs_screen", tweaks.initialScreen || "canvas");
  const [editMode, setEditMode] = useState(false);
  const demo = useDemo();
  const log = useTurnLog();
  const [newIdeaFlash, setNewIdeaFlash] = useState(null);

  window.__setTweak = (k, v) => setTweaks(t => ({ ...t, [k]: v }));

  function setTweak(k, v) {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v }}, "*"); } catch {}
  }

  // Apply theme to <body>
  useEffect(() => {
    document.body.classList.remove("theme-sketch", "theme-whiteboard");
    document.body.classList.add("theme-" + (tweaks.theme || "sketch"));
  }, [tweaks.theme]);

  // Edit-mode host protocol
  useEffect(() => {
    function onMsg(e) {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode") setEditMode(true);
      if (e.data.type === "__deactivate_edit_mode") setEditMode(false);
    }
    window.addEventListener("message", onMsg);
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch {}
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function onNav(where) {
    demo.stop();
    log.setOpenIdeaId(null);
    setScreen(where);
  }

  const currentIdea = log.openIdeaId
    ? window.DATA.IDEAS_MAIN.find(i => i.id === log.openIdeaId) || { title: "Idea" }
    : null;

  return (
    <>
      {screen === "dashboard" && <DashboardScreen onNav={onNav}/>}
      {screen === "canvas" && (
        <CanvasScreen
          tweaks={tweaks}
          onNav={onNav}
          demoState={demo}
          onOpenDemo={() => demo.start()}
          onOpenLog={(ideaId) => log.setOpenIdeaId(ideaId)}
          log={log}
          newIdeaFlash={newIdeaFlash}
        />
      )}
      {screen === "empty" && <EmptyBoardAnimated onNav={onNav} tweaks={tweaks}/>}
      {screen === "settings" && <SettingsScreen onNav={onNav} tweaks={tweaks} setTweak={setTweak}/>}

      <DemoBar demo={demo}/>

      {log.openIdeaId && (
        <TurnLog
          ideaId={log.openIdeaId}
          ideaTitle={currentIdea?.title}
          log={log}
          onClose={() => log.setOpenIdeaId(null)}
          onNewIdea={(turn) => {
            setNewIdeaFlash({ id: "fromlog_" + turn.id, title: turn.text.slice(0, 60), from: "ai" });
            log.setOpenIdeaId(null);
            setTimeout(() => setNewIdeaFlash(null), 3000);
          }}
          onTransfer={(turn, kind) => {
            log.setOpenIdeaId(null);
            setNewIdeaFlash({ kind, title: turn.text.slice(0, 50) });
            setTimeout(() => setNewIdeaFlash(null), 2400);
          }}
        />
      )}

      <TweaksPanel
        tweaks={tweaks}
        setTweak={setTweak}
        visible={editMode}
        onClose={() => {
          setEditMode(false);
          try { window.parent.postMessage({ type: "__deactivate_edit_mode" }, "*"); } catch {}
        }}
        onStartDemo={() => { setScreen("canvas"); demo.start(); }}
        onOpenEmpty={() => setScreen("empty")}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
