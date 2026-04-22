// demo.jsx — scripted KILLER DEMO scene runner (overlay + autoplay)
// Exposes: window.useDemo, window.DemoBar

function useDemo() {
  const [active, setActive] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!active || !playing) return;
    if (sceneIdx >= window.DEMO_SCENES.length - 1) return;
    const nextT = window.DEMO_SCENES[sceneIdx + 1].t - window.DEMO_SCENES[sceneIdx].t;
    const t = setTimeout(() => setSceneIdx(i => i + 1), Math.max(2000, nextT));
    return () => clearTimeout(t);
  }, [active, playing, sceneIdx]);

  function start() { setActive(true); setSceneIdx(0); setPlaying(true); }
  function stop()  { setActive(false); setPlaying(false); setSceneIdx(0); }
  function pause() { setPlaying(false); }
  function play()  { setPlaying(true); }
  function step(delta) {
    setSceneIdx(i => Math.max(0, Math.min(window.DEMO_SCENES.length - 1, i + delta)));
  }

  return {
    active, playing, sceneIdx,
    scene: active ? window.DEMO_SCENES[sceneIdx] : null,
    start, stop, pause, play, step,
  };
}

function DemoBar({ demo }) {
  if (!demo.active) return null;
  const scenes = window.DEMO_SCENES;
  return (
    <div style={{
      position:"absolute", top: 80, left: "50%", transform:"translateX(-50%)",
      background:"var(--ink)", color:"var(--paper)",
      padding:"6px 10px", borderRadius: 12,
      display:"flex", alignItems:"center", gap: 8,
      zIndex: 30, boxShadow: "3px 3px 0 rgba(26,24,20,0.3)",
      fontFamily:"var(--f-mono)", fontSize: 11, letterSpacing:"0.08em"
    }}>
      <button className="icon-btn" style={{color:"var(--ink)"}} onClick={() => demo.step(-1)}><Icon name="back" size={14}/></button>
      <button className="icon-btn" style={{color:"var(--ink)"}} onClick={() => demo.playing ? demo.pause() : demo.play()}>
        <Icon name={demo.playing ? "pause" : "play"} size={14}/>
      </button>
      <button className="icon-btn" style={{color:"var(--ink)", transform:"scaleX(-1)"}} onClick={() => demo.step(1)}><Icon name="back" size={14}/></button>

      <div style={{display:"flex", gap:3}}>
        {scenes.map((s, i) => (
          <div key={i}
               onClick={() => demo.step(i - demo.sceneIdx)}
               style={{
                 width: 20, height: 4, borderRadius: 2, cursor:"pointer",
                 background: i === demo.sceneIdx ? "var(--sticky-yellow)"
                          : i <  demo.sceneIdx ? "var(--paper)"
                          : "rgba(246,241,228,0.3)"
               }}/>
        ))}
      </div>
      <span style={{textTransform:"uppercase"}}>{demo.scene?.label}</span>
      <button className="btn sm" style={{background:"var(--paper)", color:"var(--ink)"}} onClick={demo.stop}>exit</button>
    </div>
  );
}

Object.assign(window, { useDemo, DemoBar });
