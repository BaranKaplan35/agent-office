import type { Lang, PublicAgent } from '@agent-office/shared';
import { Check, Coffee, Hourglass, Network, PartyPopper, PencilLine, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { ActivityTone, AgentActivity } from '../../state/selectors';

interface Props {
  agent: PublicAgent;
  lang: Lang;
  activity: AgentActivity;
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

const ICON = { size: 12, strokeWidth: 2.6, 'aria-hidden': true } as const;

/** Busy: three bouncing dots. */
const dots = (
  <span className="bubble-dots">
    <i />
    <i />
    <i />
  </span>
);

/** The small symbol in the bubble's badge for each activity (null = no badge). */
const GLYPH: Record<AgentActivity, ReactNode> = {
  idle: <Coffee {...ICON} />,
  notNeeded: null,
  planning: dots,
  coordinating: <Network {...ICON} />,
  waiting: <Hourglass {...ICON} />,
  working: dots,
  revising: <PencilLine {...ICON} />,
  review: <b>!</b>,
  approved: <Check {...ICON} />,
  failed: <X {...ICON} />,
  merging: dots,
  done: <PartyPopper {...ICON} />,
};

/** Bubbles that stay open without hovering: they need the user. */
const ATTENTION: ReadonlySet<AgentActivity> = new Set(['review', 'failed']);

/**
 * A status bubble above a desk: name and a status badge, opening to show the role
 * and the status in words on hover, focus, selection, or when the agent needs the
 * user. The words are always there for screen readers. It is a real button, so it
 * works with the keyboard; the badge pops whenever the activity changes.
 */
export function DeskTag({
  agent,
  lang,
  activity,
  tone,
  status,
  openLabel,
  selected,
  onOpen,
  register,
}: Props) {
  const hub = agent.type === 'coordinator';
  const glyph = GLYPH[activity];
  const classes = [
    'desk-tag',
    `tone-${tone}`,
    `activity-${activity}`,
    selected && 'is-selected',
    hub && 'is-hub',
    ATTENTION.has(activity) && 'is-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={register} className="desk-tag-anchor">
      <button
        type="button"
        className={classes}
        style={{ '--agent': agent.deskColor } as CSSProperties}
        title={onOpen ? openLabel : undefined}
        disabled={!onOpen}
        aria-pressed={onOpen ? selected : undefined}
        onClick={onOpen}
      >
        {glyph ? (
          <span key={activity} className="desk-tag-badge" aria-hidden="true">
            {glyph}
          </span>
        ) : (
          <span className="desk-tag-dot" aria-hidden="true" />
        )}
        <span className="desk-tag-body">
          <span className="desk-tag-name">{agent.name[lang]}</span>
          <span className="desk-tag-more">
            <span className="desk-tag-more-inner">
              <span className="desk-tag-role">{agent.role[lang]}</span>
              <span className="desk-tag-status">{status}</span>
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
