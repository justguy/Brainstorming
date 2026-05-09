import { useMemo } from 'react';
import type { DragEvent } from 'react';
import type {
  ConversationDelta,
  ConversationOption,
  ConversationPersona,
  ConversationTurn,
} from './ideaConversationTypes';

interface IdeaConversationProps {
  turns: ConversationTurn[];
  onPickOption?: (optionKey: string) => void;
  /** When true, each turn becomes drag-source (used by Bloom mode). */
  draggable?: boolean;
  onTurnDragStart?: (turn: ConversationTurn) => void;
}

const PERSONA_AVATAR: Record<ConversationPersona, string> = {
  scout: 'S',
  synth: '∾',
  devil: '!',
  historian: 'H',
  user: 'D',
};

const PERSONA_NAME: Record<ConversationPersona, string> = {
  scout: 'Scout',
  synth: 'Synthesizer',
  devil: "Devil's advocate",
  historian: 'Historian',
  user: 'You',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The body may contain literal "<em>..</em>" tags. Authors include them on
 * purpose to mark highlighted phrases — but we do not want to allow arbitrary
 * HTML. Escape everything, then promote the explicit <em> markers back.
 */
function renderInlineEmphasis(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>');
}

/**
 * Render a single option's bold-markdown text. Authors may include `**bold**`
 * spans which render as <b>. Everything else escapes through.
 */
function renderOptionText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function deltaClass(kind: ConversationDelta['kind']): string {
  switch (kind) {
    case 'warn':
      return 'bo-focus__delta bo-focus__delta--warn';
    case 'bad':
      return 'bo-focus__delta bo-focus__delta--bad';
    case 'info':
    default:
      return 'bo-focus__delta';
  }
}

export function IdeaConversation({
  turns,
  onPickOption,
  draggable = false,
  onTurnDragStart,
}: IdeaConversationProps): JSX.Element {
  const renderedTurns = useMemo(() => turns, [turns]);

  return (
    <div className="bo-focus__conv-list">
      {renderedTurns.map((turn) => (
        <ConversationRow
          key={turn.id}
          turn={turn}
          draggable={draggable}
          onTurnDragStart={onTurnDragStart}
          onPickOption={onPickOption}
        />
      ))}
    </div>
  );
}

interface ConversationRowProps {
  turn: ConversationTurn;
  draggable: boolean;
  onTurnDragStart?: (turn: ConversationTurn) => void;
  onPickOption?: (optionKey: string) => void;
}

function ConversationRow({
  turn,
  draggable,
  onTurnDragStart,
  onPickOption,
}: ConversationRowProps): JSX.Element {
  const personaClass = `bo-focus__turn bo-focus__turn--${turn.persona}`;

  const handleDragStart = (event: DragEvent<HTMLDivElement>): void => {
    if (!draggable) return;
    event.dataTransfer.setData('text/plain', turn.id);
    event.dataTransfer.effectAllowed = 'move';
    onTurnDragStart?.(turn);
  };

  return (
    <div
      className={personaClass}
      draggable={draggable || undefined}
      onDragStart={draggable ? handleDragStart : undefined}
    >
      <div className="bo-focus__avatar" aria-hidden="true">
        {PERSONA_AVATAR[turn.persona]}
      </div>
      <div className="bo-focus__turn-body">
        <div className="bo-focus__who">
          <span className="bo-focus__who-name">{PERSONA_NAME[turn.persona]}</span>
          <span className="bo-focus__who-role">{turn.role}</span>
          <span className="bo-focus__who-when">{turn.whenLabel}</span>
        </div>
        <div
          className="bo-focus__said"
          // Body has been HTML-escaped; only the explicit <em>...</em> markers
          // are reinstated.
          dangerouslySetInnerHTML={{ __html: renderInlineEmphasis(turn.body) }}
        />
        {turn.deltas && turn.deltas.length > 0 ? (
          <div className="bo-focus__deltas">
            {turn.deltas.map((delta, index) => (
              <span key={`${turn.id}-delta-${index}`} className={deltaClass(delta.kind)}>
                {delta.label}
              </span>
            ))}
          </div>
        ) : null}
        {turn.options && turn.options.length > 0 ? (
          <div className="bo-focus__options">
            {turn.options.map((option) => (
              <OptionCard
                key={`${turn.id}-${option.key}`}
                option={option}
                onPick={onPickOption}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface OptionCardProps {
  option: ConversationOption;
  onPick?: (optionKey: string) => void;
}

function OptionCard({ option, onPick }: OptionCardProps): JSX.Element {
  return (
    <button
      type="button"
      className="bo-focus__opt"
      onClick={() => onPick?.(option.key)}
    >
      <span className="bo-focus__opt-key">{option.key}</span>
      <span
        className="bo-focus__opt-text"
        dangerouslySetInnerHTML={{ __html: renderOptionText(option.text) }}
      />
    </button>
  );
}

export default IdeaConversation;
