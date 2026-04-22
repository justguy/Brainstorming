import React from 'react';

type DemoCardTone = 'blue' | 'yellow' | 'pink' | 'peach' | 'lavender' | 'green' | 'scout' | 'challenge' | 'critique';

interface DemoCardProps {
  x: number;
  y: number;
  width: number;
  minHeight: number;
  title: string;
  body: string;
  badge?: string;
  tone: DemoCardTone;
  actionRow?: React.ReactNode;
}

function cardStyles(tone: DemoCardTone): React.CSSProperties {
  switch (tone) {
    case 'blue':
      return { background: '#bfe4fa', borderColor: '#4d9cdd', color: '#22354a' };
    case 'yellow':
      return { background: '#ffe986', borderColor: '#efb736', color: '#3b2f18' };
    case 'pink':
      return { background: '#f8bfd1', borderColor: '#ea7b9d', color: '#462737' };
    case 'peach':
      return { background: '#ffd0ad', borderColor: '#df955e', color: '#452d1f' };
    case 'lavender':
      return { background: '#d9c7fb', borderColor: '#8f79d3', color: '#352a4f' };
    case 'green':
      return { background: '#cdeca0', borderColor: '#7ab85e', color: '#253d1d' };
    case 'scout':
      return { background: 'rgba(255,252,247,0.9)', borderColor: '#b69af0', color: '#4c4074' };
    case 'challenge':
      return { background: 'rgba(255,252,247,0.94)', borderColor: '#df6b5f', color: '#402625' };
    case 'critique':
      return { background: 'rgba(255,250,244,0.94)', borderColor: '#ffc099', color: '#4b3423' };
  }
}

function DemoCard({
  x,
  y,
  width,
  minHeight,
  title,
  body,
  badge,
  tone,
  actionRow,
}: DemoCardProps): React.ReactElement {
  const toneStyle = cardStyles(tone);
  const dashed = tone === 'scout' || tone === 'critique';

  return (
    <article
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        minHeight,
        padding: '1rem',
        borderRadius: '18px',
        borderWidth: '2px',
        borderStyle: dashed ? 'dashed' : 'solid',
        boxShadow: '0 20px 40px -34px rgba(62,42,20,0.45)',
        ...toneStyle,
      }}
    >
      {badge && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <span
            style={{
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.2)',
              background: 'rgba(255,255,255,0.5)',
              padding: '0.125rem 0.5rem',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </span>
        </div>
      )}
      <p
        style={{
          whiteSpace: 'pre-line',
          fontSize: '1.02rem',
          fontWeight: 700,
          lineHeight: 1.75,
        }}
      >
        {title}
      </p>
      <p
        style={{
          marginTop: '0.5rem',
          whiteSpace: 'pre-line',
          fontSize: '0.96rem',
          lineHeight: 1.55,
          opacity: 0.9,
        }}
      >
        {body}
      </p>
      {actionRow && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          {actionRow}
        </div>
      )}
    </article>
  );
}

function ActionButton({ label, dark = false }: { label: string; dark?: boolean }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: '14px',
        borderWidth: '1px',
        padding: '0.5rem 0.75rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        borderColor: dark ? '#1f2937' : 'rgba(58,52,43,0.42)',
        background: dark ? '#1f2937' : 'rgba(255,255,255,0.72)',
        color: dark ? '#fff' : '#2b2925',
      }}
    >
      {label}
    </span>
  );
}

export function DemoBoardScene(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <rect x="190" y="462" width="1130" height="415" rx="18" stroke="#41a56b" strokeWidth="2.5" strokeDasharray="8 7" />
        <path d="M520 206 C520 268, 512 306, 516 353" stroke="#262626" strokeWidth="3" strokeLinecap="round" />
        <path d="M676 354 C785 344, 851 344, 915 350" stroke="#262626" strokeWidth="3" strokeLinecap="round" />
        <path d="M673 347 C844 424, 956 441, 1038 531" stroke="#262626" strokeWidth="3" strokeLinecap="round" />
        <path d="M1084 569 C993 636, 904 707, 814 742" stroke="#262626" strokeWidth="3" strokeLinecap="round" />
        <path d="M985 351 C877 274, 770 203, 639 157" stroke="#d96d66" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
        <path d="M459 557 C480 494, 491 447, 514 396" stroke="#4a9d76" strokeWidth="3" strokeLinecap="round" />
        <path d="M489 709 C564 730, 610 746, 662 784" stroke="#8c8c8c" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 212,
          top: 450,
          borderRadius: '999px',
          background: '#41a56b',
          padding: '0.25rem 1rem',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#fff',
          boxShadow: '0 6px 14px -10px rgba(0,0,0,0.4)',
        }}
      >
        Promising cluster - consolidate?
      </div>

      <DemoCard
        x={386}
        y={46}
        width={250}
        minHeight={162}
        title="Use past decisions as training data"
        body="Mine the last 12 months of\nNotion + calendar notes."
        badge="idea"
        tone="blue"
      />
      <DemoCard
        x={418}
        y={278}
        width={286}
        minHeight={204}
        title="AI that helps teams make\nbetter decisions"
        body="Use AI to surface blind spots\nbefore a decision is committed."
        badge="idea"
        tone="yellow"
      />
      <DemoCard
        x={912}
        y={258}
        width={254}
        minHeight={164}
        title="Integrate with Slack"
        body="Slash command `/decide` -\nreframes the thread."
        badge="idea"
        tone="pink"
      />
      <DemoCard
        x={220}
        y={548}
        width={252}
        minHeight={160}
        title="Decision journal, not a\ndashboard"
        body="Write the bet down. Review it\nin 60 days."
        badge="idea"
        tone="peach"
      />
      <DemoCard
        x={548}
        y={714}
        width={250}
        minHeight={168}
        title="Pre-mortem as a first-\nclass artifact"
        body="Before kickoff, imagine the\nfailure. Save it."
        badge="idea"
        tone="lavender"
      />
      <DemoCard
        x={1032}
        y={494}
        width={262}
        minHeight={160}
        title="Score decisions before\nexecution"
        body="Confidence × reversibility × blast\nradius."
        badge="idea"
        tone="green"
      />

      <DemoCard
        x={18}
        y={218}
        width={246}
        minHeight={176}
        title="Decision\nhalf-life"
        body="Which decisions expired?\nWhich compounded?"
        badge="Scout"
        tone="scout"
        actionRow={
          <>
            <ActionButton label="keep it" dark />
            <ActionButton label="dismiss" />
          </>
        }
      />
      <DemoCard
        x={904}
        y={680}
        width={238}
        minHeight={148}
        title="Red team mode"
        body="A toggle that forces opposite\nreasoning for 10 minutes."
        badge="Scout"
        tone="scout"
        actionRow={
          <>
            <ActionButton label="keep it" dark />
            <ActionButton label="dismiss" />
          </>
        }
      />
      <DemoCard
        x={1188}
        y={274}
        width={234}
        minHeight={108}
        title="Critique"
        body="This fails the moment the team\nstops trusting the source thread.\nSlack is social theater."
        tone="critique"
      />
      <DemoCard
        x={1180}
        y={98}
        width={286}
        minHeight={152}
        title="You're assuming past decisions\nwere correct. Most of them\nweren't - you just shipped them."
        body=""
        tone="challenge"
        actionRow={
          <>
            <ActionButton label="noted" />
            <ActionButton label="press harder" />
          </>
        }
      />

      <div
        style={{
          position: 'absolute',
          left: 1196,
          top: 118,
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: '#9f9582',
        }}
      >
        Dev · Devil's Advocate
      </div>
    </div>
  );
}
