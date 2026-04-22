// tweaks.jsx — floating tweaks panel (toggled by host)
// Exposes: window.TweaksPanel

function TweaksPanel({ tweaks, setTweak, visible, onClose, onStartDemo, onOpenEmpty }) {
  if (!visible) return null;

  const Seg = ({ name, options, label }) => (
    <div className="tweak-row">
      <div className="tr-label">{label}</div>
      <div className="tr-seg">
        {options.map(o => (
          <button key={o} className={tweaks[name] === o ? "on" : ""}
                  onClick={() => setTweak(name, o)}>{o}</button>
        ))}
      </div>
    </div>
  );
  const Tog = ({ name, label }) => (
    <div className="tweak-toggle">
      <div className="tg-label">{label}</div>
      <button className={"tg-switch" + (tweaks[name] ? " on" : "")}
              onClick={() => setTweak(name, !tweaks[name])}>
        <span className="knob"/>
      </button>
    </div>
  );

  return (
    <div className="tweaks-panel">
      <div className="tp-head">
        <div className="tp-title">Tweaks</div>
        <button className="icon-btn" style={{background:"transparent", borderColor:"var(--paper)", color:"var(--paper)", boxShadow:"none"}} onClick={onClose}>
          <Icon name="close" size={14}/>
        </button>
      </div>
      <div className="tp-body">
        <Seg name="theme" label="theme"
             options={["sketch","whiteboard"]}/>
        <Seg name="aiAggressiveness" label="AI aggressiveness"
             options={["off","gentle","balanced","aggressive"]}/>
        <Tog name="showConnections" label="show connections"/>
        <Tog name="showCritiques"   label="show critiques"/>
        <Tog name="showGhosts"      label="show ghost suggestions"/>
        <Tog name="showPersona"     label="show persona dock"/>
        <div style={{borderTop:"1.5px dashed var(--ink)", paddingTop: 12, display:"flex", flexDirection:"column", gap:8}}>
          <button className="btn primary" style={{width:"100%"}} onClick={onStartDemo}>
            <Icon name="play" size={14}/> run killer demo
          </button>
          <button className="btn sm ghost" style={{width:"100%"}} onClick={onOpenEmpty}>
            replay empty-board beat
          </button>
          <button className="btn sm ghost" style={{width:"100%"}}
                  onClick={() => { try { window.__runThinkingBeat && window.__runThinkingBeat(); } catch {} }}>
            replay AI thinking beat
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TweaksPanel });
