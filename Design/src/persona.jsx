// persona.jsx — the engineering-manager persona
// Exposes: window.PersonaAvatar, window.PersonaDock

function PersonaAvatar({ size = 60, pulsing = false, name = "Dev" }) {
  return (
    <div className={"persona-avatar" + (pulsing ? " pulsing" : "")}
         style={{width: size, height: size}}
         title={name}>
      <svg viewBox="0 0 60 60" width={size} height={size}>
        <defs>
          <radialGradient id="bot-eye-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d6f5ff"/>
            <stop offset="55%" stopColor="#5cc6ff"/>
            <stop offset="100%" stopColor="#1d7fd3"/>
          </radialGradient>
          <linearGradient id="bot-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ba9e6"/>
            <stop offset="55%" stopColor="#2e86c7"/>
            <stop offset="100%" stopColor="#1f6aa8"/>
          </linearGradient>
          <linearGradient id="bot-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        {/* antenna */}
        <line x1="30" y1="6" x2="30" y2="11" stroke="#1a2a3a" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="30" cy="5" r="2" fill="#5cc6ff" stroke="#1a2a3a" strokeWidth="1"/>
        <circle cx="30" cy="5" r="0.8" fill="#eaf7ff"/>
        {/* shoulders / neck hint */}
        <rect x="22" y="48" width="16" height="8" rx="2.5"
              fill="url(#bot-body)" stroke="#1a2a3a" strokeWidth="1.3"/>
        {/* head */}
        <rect x="10" y="11" width="40" height="36" rx="11"
              fill="url(#bot-body)" stroke="#1a2a3a" strokeWidth="1.5"/>
        {/* highlight */}
        <rect x="13" y="14" width="34" height="12" rx="8" fill="url(#bot-shade)"/>
        {/* side ear bolts */}
        <circle cx="9.5" cy="30" r="2.6" fill="#3a7ab3" stroke="#1a2a3a" strokeWidth="1.2"/>
        <circle cx="50.5" cy="30" r="2.6" fill="#3a7ab3" stroke="#1a2a3a" strokeWidth="1.2"/>
        {/* face plate */}
        <rect x="16" y="19" width="28" height="20" rx="7"
              fill="#123452" stroke="#0d2238" strokeWidth="1.2"/>
        {/* eyes */}
        <circle cx="24" cy="28.5" r="4.2" fill="url(#bot-eye-glow)"/>
        <circle cx="36" cy="28.5" r="4.2" fill="url(#bot-eye-glow)"/>
        <circle cx="22.6" cy="27.1" r="1.1" fill="#ffffff" opacity="0.9"/>
        <circle cx="34.6" cy="27.1" r="1.1" fill="#ffffff" opacity="0.9"/>
        {/* smile */}
        <path d="M25 35 Q30 38 35 35" stroke="#9ce0ff" strokeWidth="1.4"
              fill="none" strokeLinecap="round"/>
        {/* cheek glow */}
        <circle cx="17.5" cy="33" r="1.3" fill="#7ed6ff" opacity="0.75"/>
        <circle cx="42.5" cy="33" r="1.3" fill="#7ed6ff" opacity="0.75"/>
      </svg>
    </div>
  );
}

function PersonaDock({ name = "Dev", role = "Bot", line, hint, pulsing = false,
                      onAct, activity = "idle", onOpenLog, paused = false, onTogglePause, thinking = false }) {
  return (
    <div className="persona-dock">
      <div style={{position:"relative"}}>
        <PersonaAvatar name={name} pulsing={(pulsing || thinking) && !paused} />
        {thinking && <div className="persona-thinking"/>}
      </div>
      <div className="persona-say">
        <div className="who">
          {name} · {role}
          {paused && <span style={{marginLeft: 8, color: "#c94a3a"}}>· paused</span>}
          {thinking && <span style={{marginLeft: 8, color: "#2e86c7"}}>· thinking…</span>}
        </div>
        <div className="what">{line}</div>
        <div className="hint">
          <button className="btn sm ghost" onClick={onTogglePause}>
            <Icon name={paused ? "play" : "pause"} size={13}/>
            {paused ? "resume" : "pause"}
          </button>
          {onAct && (
            <button className="btn sm" onClick={onAct} disabled={thinking}>
              <Icon name="sparkle" size={13}/>
              {thinking ? "drafting…" : "nudge me"}
            </button>
          )}
          {onOpenLog && (
            <button className="btn sm ghost" onClick={onOpenLog}>
              turn log
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PersonaAvatar, PersonaDock });
