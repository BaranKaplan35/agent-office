import type { Lang, PublicAgent } from '@agent-office/shared';
import type { CSSProperties } from 'react';
import type { ActivityTone } from '../../state/selectors';

interface Props {
  agent: PublicAgent;
  lang: Lang;
  tone: ActivityTone;
  /** Translated status text. */
  status: string;
  /** Tooltip when the tag can be opened, e.g. "Open report of Mira". */
  openLabel: string;
  selected: boolean;
  onOpen?: () => void;
  /** Called with the anchor element so the projector can position it. */
  register: (el: HTMLElement | null) => void;
}

/**
 * A compact name tag above a desk: status dot + name. The status text expands on
 * hover, focus and selection (and is always there for screen readers). It is a
 * real button, so it works with the keyboard.
 */
export function DeskTag({
  agent,
  lang,
  tone,
  status,
  openLabel,
  selected,
  onOpen,
  register,
}: Props) {
  const hub = agent.type === 'coordinator';
  return (
    <div ref={register} className="desk-tag-anchor">
      <button
        type="button"
        className={`desk-tag tone-${tone}${selected ? ' is-selected' : ''}${hub ? ' is-hub' : ''}`}
        style={{ '--agent': agent.deskColor } as CSSProperties}
        title={onOpen ? `${openLabel} (${agent.role[lang]})` : agent.role[lang]}
        disabled={!onOpen}
        aria-pressed={onOpen ? selected : undefined}
        onClick={onOpen}
      >
        <span className="desk-tag-dot" aria-hidden="true" />
        <span className="desk-tag-name">{agent.name[lang]}</span>
        <span className="desk-tag-status">{status}</span>
      </button>
    </div>
  );
}
