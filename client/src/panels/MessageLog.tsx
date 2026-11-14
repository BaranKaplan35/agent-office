import type { AgentMessage, Participant } from '@agent-office/shared';
import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../i18n/context';
import { findAgent, logMessages } from '../state/selectors';
import { useApp, useCurrentTeam } from '../state/store';

export function MessageLog() {
  const { t, lang } = useI18n();
  const team = useCurrentTeam();
  const task = useApp((s) => s.task);
  const messages = logMessages(task);
  const endRef = useRef<HTMLLIElement>(null);
  const time = useMemo(
    () => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [lang],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('log.empty')}</p>
      </div>
    );
  }

  const who = (p: Participant) =>
    p === 'user'
      ? t('log.you')
      : p === 'system'
        ? t('log.system')
        : (findAgent(team, p)?.name[lang] ?? p);

  const describe = (m: AgentMessage): string => {
    switch (m.type) {
      case 'plan':
        return t('log.plan', { n: m.payload.subtasks.length });
      case 'assignment':
        return t('log.assignment', { title: m.payload.title });
      case 'report':
        return t('log.report', { n: m.payload.version });
      case 'approval':
        return t('log.approval', { n: m.payload.version });
      case 'revision_request':
        return t('log.revision_request', { n: m.payload.version });
      case 'final':
        return t('log.final', { n: m.payload.version });
      case 'error':
        return t('log.error', { message: m.payload.message });
    }
  };

  return (
    <ol className="log">
      {messages.map((m) => (
        <li key={m.id} className={`log-item log-${m.type}`}>
          <time dateTime={m.createdAt}>{time.format(new Date(m.createdAt))}</time>
          <span className="log-text">
            <strong>{who(m.from)}</strong>
            {m.to !== 'user' && m.to !== m.from && <> → {who(m.to)}</>}: {describe(m)}
            {m.type === 'revision_request' && <q className="log-note">{m.payload.note}</q>}
          </span>
        </li>
      ))}
      <li ref={endRef} aria-hidden="true" className="log-end" />
    </ol>
  );
}
