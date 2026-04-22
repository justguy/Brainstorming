// data.jsx — shared demo data for the brainstorm board
// Exposes: window.DATA, window.DEMO_SCENES, window.PERSONA_LINES

const IDEAS_MAIN = [
  { id: "i1",  title: "AI that helps teams make better decisions", body: "Use AI to surface blind spots before a decision is committed.", x: 440, y: 280, color: "yellow", kind: "root", origin: "user" },
  { id: "i2",  title: "Use past decisions as training data", body: "Mine the last 12 months of Notion + calendar notes.", x: 170, y: 170, color: "blue", origin: "user" },
  { id: "i3",  title: "Integrate with Slack", body: "Slash command: /decide — reframes the thread.", x: 760, y: 180, color: "pink", origin: "user" },
  { id: "i4",  title: "Score decisions before execution", body: "Confidence × reversibility × blast radius.", x: 790, y: 470, color: "green", origin: "user" },
  { id: "i5",  title: "Decision journal, not a dashboard", body: "Write the bet down. Review it in 60 days.", x: 200, y: 500, color: "peach", origin: "user" },
  { id: "i6",  title: "Pre-mortem as a first-class artifact", body: "Before kickoff, imagine the failure. Save it.", x: 490, y: 580, color: "lilac", origin: "user", ai: true },
];

const GHOSTS = [
  { id: "g1", title: "Red team mode", body: "A toggle that forces opposite reasoning for 10 minutes.", x: 820, y: 620, origin: "ai" },
  { id: "g2", title: "Decision half-life", body: "Which decisions expired? Which compounded?", x: 20,  y: 200, origin: "ai" },
];

const CONNECTIONS = [
  { from: "i2", to: "i1", kind: "builds_on",      rationale: "Training data powers the decision-support model." },
  { from: "i3", to: "i1", kind: "builds_on",      rationale: "Slack is where decisions actually happen." },
  { from: "i2", to: "i3", kind: "contradicts",    rationale: "Past Slack decisions encode the bias you want to fix." },
  { from: "i4", to: "i1", kind: "builds_on",      rationale: "Scoring gives the AI a measurable target." },
  { from: "i5", to: "i6", kind: "shared_theme",   rationale: "Both treat reflection as an artifact, not a ritual." },
  { from: "i6", to: "i4", kind: "builds_on",      rationale: "Pre-mortems feed the scoring model." },
  { from: "i5", to: "i1", kind: "revives_killed", rationale: "Reopens the 'decision journal' idea that was dropped earlier." },
];

const CRITIQUES = [
  {
    id: "c1", ideaId: "i2",
    kind: "bubble",
    text: "You're assuming past decisions were correct. Most of them weren't — you just shipped them.",
    author: "persona",
  },
  {
    id: "c2", ideaId: "i3",
    kind: "margin",
    text: "This fails the moment the team stops trusting the source thread. Slack is social theater.",
    author: "persona",
  },
];

const CLUSTER = {
  // convergence hint around the "decision scoring + pre-mortem + journal" cluster
  label: "Promising cluster — consolidate?",
  ideaIds: ["i4", "i5", "i6"],
};

const PERSONA_LINES = {
  idle: "I'm watching. Ping me when you want a push.",
  observing: "Three related ideas in the last 20 seconds. Want me to map them?",
  connection: "Drew 4 connections. The one between #2 and #3 is the spicy one.",
  critique: "Sharpened one. Not to kill it — to make it survive contact with reality.",
  ghost: "Floating a scout. Ignore it if it's noise.",
  cluster: "This cluster has weight. Want to consolidate, or push on the weakest one first?",
  settings: "Swap models anytime. I'll remember your board.",
};

// Scenes for the scripted KILLER DEMO
const DEMO_SCENES = [
  { id: 0, t: 0,      label: "Raw idea",
    act: "reset", say: "Start with one idea. I'll stay out of your way." },
  { id: 1, t: 2000,   label: "First scouts",
    act: "scouts", say: "Two scout ideas. Loosely related, slightly unexpected." },
  { id: 2, t: 8000,   label: "Connections",
    act: "connections", say: "Running find_connections. Drawing the obvious ones first." },
  { id: 3, t: 13000,  label: "The 'aha'",
    act: "aha", say: "Slack + past decisions = bias reinforcement. That's the one." },
  { id: 4, t: 18000,  label: "Critique",
    act: "critique", say: "Sharp, not mean: 'You're assuming past decisions were correct.'" },
  { id: 5, t: 24000,  label: "User edits",
    act: "quiet", say: "You're editing. I'm not going to interrupt." },
  { id: 6, t: 29000,  label: "Push further",
    act: "pushfurther", say: "What if decisions were scored before execution? Grounded leap." },
  { id: 7, t: 34000,  label: "Convergence",
    act: "cluster", say: "This cluster looks promising. Want to consolidate?" },
  { id: 8, t: 40000,  label: "Reframe",
    act: "reframe", say: "One last connection. This reframes the whole board." },
];

const BOARDS = [
  { id: "b1", title: "AI decision tool",       sub: "Active • 17 ideas, 7 connections", last: "2h ago", ideas: 17, conns: 7, color: "yellow" },
  { id: "b2", title: "Q3 roadmap re-think",    sub: "Clustering • needs critique pass",  last: "yesterday", ideas: 24, conns: 11, color: "blue" },
  { id: "b3", title: "Onboarding, v3",         sub: "3 ghosts pending review",           last: "2d ago",  ideas: 9,  conns: 4, color: "pink" },
  { id: "b4", title: "Pricing experiments",    sub: "Dormant",                            last: "2 wks",   ideas: 12, conns: 3, color: "peach" },
  { id: "b5", title: "Hiring loop rewrite",    sub: "Critique-heavy",                    last: "3d ago",  ideas: 14, conns: 9, color: "green" },
  { id: "b6", title: "Weekly 1:1 template",    sub: "Converged",                          last: "1 wk",    ideas: 6,  conns: 2, color: "lilac" },
];

window.DATA = { IDEAS_MAIN, GHOSTS, CONNECTIONS, CRITIQUES, CLUSTER, BOARDS };
window.DEMO_SCENES = DEMO_SCENES;
window.PERSONA_LINES = PERSONA_LINES;
