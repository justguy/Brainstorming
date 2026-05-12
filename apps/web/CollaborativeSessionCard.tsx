import React from 'react';
import {
  buildCompanionSessionSummary,
  type CompanionSessionInput,
} from './companionSessionSummary';

interface CollaborativeSessionCardProps {
  session: CompanionSessionInput;
}

export function CollaborativeSessionCard({
  session,
}: CollaborativeSessionCardProps): React.ReactElement | null {
  const summary = buildCompanionSessionSummary(session);
  const [expanded, setExpanded] = React.useState(() => summary.status === 'shared pause' || summary.status === 'awaiting host');
  if (!summary.visible) return null;
  const peerPreview = expanded ? summary.peerLabels : summary.peerLabels.slice(0, 3);
  const hiddenPeerCount = summary.peerLabels.length - peerPreview.length;

  return (
    <section
      className="bo-card-surface w-full overflow-hidden"
      style={{
        borderRadius: 14,
        border: '2px solid var(--ink)',
        background: 'var(--paper)',
        boxShadow: '3px 3px 0 var(--ink)',
        padding: 12,
        fontFamily: 'var(--f-hand-body)',
        color: 'var(--ink)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: 10,
                height: 10,
                borderRadius: 999,
                border: '1.5px solid var(--ink)',
                background: statusDotColor(summary.status),
              }}
            />
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--f-mono)',
                fontSize: 11,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                fontWeight: 700,
              }}
            >
              Shared role room
            </p>
          </div>
          <h2
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontFamily: 'var(--f-hand)',
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.1,
              color: 'var(--ink)',
            }}
          >
            {summary.headline}
          </h2>
          <p
            style={{
              marginTop: 4,
              marginBottom: 0,
              fontFamily: 'var(--f-hand-body)',
              fontSize: 14,
              lineHeight: 1.4,
              color: 'var(--ink-soft)',
            }}
          >
            {summary.detail}
          </p>
        </div>
        <span
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: 999,
            fontFamily: 'var(--f-mono)',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
            ...statusPillStyle(summary.status),
          }}
        >
          {summary.statusLabel}
        </span>
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1.4px dashed var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            borderRadius: 12,
            border: '1.5px solid var(--hairline)',
            background: 'var(--paper)',
            padding: 10,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                  fontWeight: 700,
                }}
              >
                Role pulse
              </div>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: 'var(--ink-soft)',
                  fontFamily: 'var(--f-hand-body)',
                }}
              >
                {summary.consensusSummary}
              </p>
              {summary.actionItems[0] && (
                <p
                  style={{
                    marginTop: 6,
                    marginBottom: 0,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: 'var(--ink-soft)',
                    fontFamily: 'var(--f-hand-body)',
                  }}
                >
                  Next:{' '}
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                    {summary.actionItems[0]}
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className="btn sm ghost"
              aria-expanded={expanded}
              style={{ flexShrink: 0 }}
            >
              {expanded ? 'Hide details' : 'Session details'}
            </button>
          </div>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: '1.5px solid var(--hairline)',
            background: 'var(--paper)',
            padding: 10,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              fontWeight: 700,
            }}
          >
            Role hosts
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {peerPreview.map(label => (
              <span
                key={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1.5px solid var(--ink)',
                  background: 'var(--paper)',
                  fontFamily: 'var(--f-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                {label}
              </span>
            ))}
            {hiddenPeerCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1.5px dashed var(--ink-faint)',
                  background: 'var(--paper-dark)',
                  fontFamily: 'var(--f-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-soft)',
                }}
              >
                +{hiddenPeerCount} more
              </span>
            )}
          </div>
        </div>

        {expanded && summary.recentSpeakerLabels.length > 0 && (
          <div
            style={{
              borderRadius: 12,
              border: '1.5px solid var(--hairline)',
              background: 'var(--paper)',
              padding: 10,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                fontWeight: 700,
              }}
            >
              Recent role turns
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.recentSpeakerLabels.map(label => (
                <span
                  key={label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 10px',
                    borderRadius: 999,
                    border: '1.5px solid var(--accent-cluster)',
                    background: 'var(--sticky-green)',
                    fontFamily: 'var(--f-mono)',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                    color: 'var(--ink)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {expanded && summary.actionItems.length > 0 && (
          <div
            style={{
              borderRadius: 12,
              border: '1.5px solid var(--hairline)',
              background: 'var(--paper)',
              padding: 10,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                fontWeight: 700,
              }}
            >
              Role actions
            </div>
            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {summary.actionItems.map(item => (
                <li
                  key={item}
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: 'var(--ink-soft)',
                    fontFamily: 'var(--f-hand-body)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      marginTop: 6,
                      width: 6,
                      height: 6,
                      flexShrink: 0,
                      borderRadius: 999,
                      background: 'var(--accent-cluster)',
                    }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'shared pause':
      return 'var(--sticky-yellow)';
    case 'manual host':
      return 'var(--sticky-lilac)';
    case 'hosting here':
      return 'var(--sticky-green)';
    case 'hosted remotely':
      return 'var(--sticky-blue)';
    default:
      return 'var(--paper-dark)';
  }
}

function statusPillStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'shared pause':
      return {
        border: '1.5px solid var(--ink)',
        background: 'var(--sticky-yellow)',
        color: 'var(--ink)',
      };
    case 'manual host':
      return {
        border: '1.5px solid var(--accent-ghost)',
        background: 'var(--sticky-lilac)',
        color: 'var(--ink)',
      };
    case 'hosting here':
      return {
        border: '1.5px solid var(--accent-revives)',
        background: 'var(--sticky-green)',
        color: 'var(--ink)',
      };
    case 'hosted remotely':
      return {
        border: '1.5px solid var(--ink)',
        background: 'var(--sticky-blue)',
        color: 'var(--ink)',
      };
    default:
      return {
        border: '1.5px solid var(--hairline)',
        background: 'var(--paper-dark)',
        color: 'var(--ink-soft)',
      };
  }
}
