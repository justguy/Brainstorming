// primitives.jsx — SVG filter defs, icons, small helpers
// Exposes: window.SvgDefs, window.Icon, window.BrandMark, window.useLocal

const { useEffect, useState, useRef, useCallback, useMemo, createContext, useContext } = React;

// SVG filters for hand-drawn roughness (used via CSS filter:url)
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{position: "absolute"}} aria-hidden>
      <defs>
        <filter id="roughen" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
        <filter id="roughen-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>

        {/* arrow markers for connections */}
        <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L9 5 L0 10 z" fill="#2f8f5e" />
        </marker>
        <marker id="arrow-ink" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L9 5 L0 10 z" fill="#1a1814" />
        </marker>
      </defs>
    </svg>
  );
}

// Brand mark: little lightbulb-brain scribble
function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <g stroke="#1a1814" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 25 C10 22 10 16 14 13 C18 10 24 11 26 15 C28 19 27 23 24 25"
              fill="#f7e58a" />
        <path d="M14 27 L25 27" />
        <path d="M15 30 L24 30" />
        <path d="M17 33 L22 33" />
        {/* spark */}
        <path d="M19 6 L19 9 M30 10 L27.5 12 M8 10 L10.5 12" />
      </g>
    </svg>
  );
}

// Tiny icon system (strokes only, sketchy)
function Icon({ name, size = 18, stroke = "currentColor" }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
              stroke, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "plus":   return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "sparkle":return <svg {...p}><path d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"/></svg>;
    case "chat":   return <svg {...p}><path d="M4 5h16v11H8l-4 4V5z"/></svg>;
    case "link":   return <svg {...p}><path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-2 2"/><path d="M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l2-2"/></svg>;
    case "ghost":  return <svg {...p}><path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2-3 2z"/><circle cx="9.5" cy="11" r="0.8" fill={stroke}/><circle cx="14.5" cy="11" r="0.8" fill={stroke}/></svg>;
    case "eye":    return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "eye-off":return <svg {...p}><path d="M3 3l18 18"/><path d="M10.5 6.2A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.4 3.9"/><path d="M6.2 7.6A16 16 0 0 0 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.2-.9"/></svg>;
    case "pause":  return <svg {...p}><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>;
    case "play":   return <svg {...p}><path d="M7 5v14l12-7z"/></svg>;
    case "gear":   return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "back":   return <svg {...p}><path d="M15 5l-7 7 7 7"/></svg>;
    case "close":  return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "check":  return <svg {...p}><path d="M4 12l5 5L20 6"/></svg>;
    case "board":  return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>;
    case "home":   return <svg {...p}><path d="M4 11l8-7 8 7v9H4z"/></svg>;
    case "scout":  return <svg {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>;
    case "bolt":   return <svg {...p}><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg>;
    case "wand":   return <svg {...p}><path d="M15 6l3 3L7 20l-3-3zM14 2v4M20 4v4M17 3l3 3M10 8l2 2"/></svg>;
    case "drag":   return <svg {...p}><circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/></svg>;
    default: return null;
  }
}

// localStorage hook
function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s != null ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
}

Object.assign(window, { SvgDefs, BrandMark, Icon, useLocal });
