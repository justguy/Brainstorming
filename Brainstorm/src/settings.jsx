// settings.jsx — BYOK settings page
// Exposes: window.SettingsScreen

function SettingsScreen({ onNav, tweaks }) {
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-5");
  const [apiKey, setApiKey] = useState("sk-ant-•••••••••••••••••a7f2");
  const [personaName, setPersonaName] = useState(tweaks.personaName || "Dev");
  const [aggressiveness, setAggressiveness] = useState(tweaks.aiAggressiveness || "balanced");

  return (
    <div className="paper-dots" style={{position:"absolute", inset:0, overflow:"auto"}}>
      <SvgDefs/>
      <div className="topbar">
        <div style={{display:"flex", gap:10}}>
          <div className="brand">
            <BrandMark/>
            <div>
              <div className="brand-name">Brainstorm</div>
              <div className="brand-tag">settings</div>
            </div>
          </div>
          <div className="toolbar-group">
            <button className="icon-btn" onClick={() => onNav("dashboard")}>
              <Icon name="back" size={16}/>
            </button>
          </div>
        </div>
        <div/>
        <div/>
      </div>

      <div className="settings">
        <h1>Settings.</h1>
        <div className="set-sub">Everything is local. Nothing leaves this device unless you pick a provider and paste a key.</div>

        <div className="setting-section">
          <h2>Provider · BYOK</h2>
          <div className="ss-sub">Bring your own key. Gemini, OpenAI, or Anthropic.</div>
          <div className="provider-row">
            {["anthropic","openai","gemini"].map(p => (
              <button key={p} className={"provider-chip" + (provider === p ? " on" : "")}
                      onClick={() => setProvider(p)}>
                {p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "Gemini"}
              </button>
            ))}
          </div>
          <div className="field">
            <label>API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)}/>
          </div>
          <div className="field">
            <label>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)}>
              <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5</option>
              <option value="claude-opus-4-5">claude-opus-4-5</option>
            </select>
          </div>
          <button className="btn primary"><Icon name="check" size={14}/> save</button>
        </div>

        <div className="setting-section">
          <h2>Your facilitator</h2>
          <div className="ss-sub">Dev is the default — an engineering manager who pushes you without taking over. You can rename him. You cannot make him nicer.</div>
          <div style={{display:"flex", alignItems:"center", gap: 16, marginBottom: 14}}>
            <PersonaAvatar size={72}/>
            <div style={{flex:1}}>
              <div className="field" style={{margin:0}}>
                <label>Name</label>
                <input value={personaName} onChange={e => setPersonaName(e.target.value)}/>
              </div>
            </div>
          </div>
          <div className="field">
            <label>How hard should Dev push?</label>
            <div className="tr-seg" style={{maxWidth: 480}}>
              {["off","gentle","balanced","aggressive"].map(v => (
                <button key={v} className={aggressiveness === v ? "on" : ""}
                        onClick={() => setAggressiveness(v)}>{v}</button>
              ))}
            </div>
          </div>
          <div className="hand-body" style={{color:"var(--ink-soft)", fontSize:13.5, marginTop: 4}}>
            balanced = 1 critique per 3 ideas, 20s cooldown, waits for idle.
            aggressive = no cooldown, critiques anything stable for 5s.
          </div>
        </div>

        <div className="setting-section">
          <h2>Signal controls</h2>
          <div className="ss-sub">Caps that keep the board from becoming noise.</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 14}}>
            <div className="field"><label>Max critiques / idea</label><input defaultValue="2"/></div>
            <div className="field"><label>Max visible suggestions</label><input defaultValue="6"/></div>
            <div className="field"><label>Max connections</label><input defaultValue="10"/></div>
            <div className="field"><label>Per-idea cooldown (s)</label><input defaultValue="25"/></div>
            <div className="field"><label>Idle threshold (s)</label><input defaultValue="2"/></div>
            <div className="field"><label>Confidence threshold</label><input defaultValue="0.62"/></div>
          </div>
        </div>

        <div className="setting-section">
          <h2>Storage</h2>
          <div className="ss-sub">IndexedDB. Local board state, ideas, groups, docs, suggestions, critiques.</div>
          <div style={{display:"flex", gap: 10}}>
            <button className="btn sm">export all boards</button>
            <button className="btn sm">import…</button>
            <button className="btn sm" style={{color:"var(--accent-critique)", borderColor:"var(--accent-critique)", boxShadow:"1.5px 1.5px 0 var(--accent-critique)"}}>wipe local data</button>
          </div>
          <div style={{marginTop: 14, display:"flex", gap: 12, flexWrap:"wrap"}}>
            <span className="stamp">sync · not shipped</span>
            <span className="stamp">yjs · roadmap</span>
            <span className="stamp">webrtc · roadmap</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen });
