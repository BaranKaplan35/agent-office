import type { Lang, PublicAgent } from '@agent-office/shared';
import { lazy, Suspense, type CSSProperties } from 'react';

const LucideIcon = lazy(() => import('./LucideIcon'));

interface Props {
  agent: PublicAgent;
  lang: Lang;
  size?: number;
}

/** Round badge in the agent's desk colour with its lucide icon (initial while loading or unknown). */
export function AgentAvatar({ agent, lang, size = 36 }: Props) {
  const initial = agent.name[lang].charAt(0).toUpperCase();
  const style = { '--agent': agent.deskColor, width: size, height: size } as CSSProperties;
  const fallback = () => <span className="avatar-initial">{initial}</span>;

  return (
    <span className="avatar" style={style} aria-hidden="true">
      <Suspense fallback={fallback()}>
        <LucideIcon name={agent.icon} size={Math.round(size * 0.5)} fallback={fallback} />
      </Suspense>
    </span>
  );
}
