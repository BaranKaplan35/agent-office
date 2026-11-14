import type { Lang, PublicAgent, PublicTeam, Task } from '@agent-office/shared';
import type { CSSProperties } from 'react';
import { AgentAvatar } from '../components/AgentAvatar';
import { StatusChip } from '../components/StatusChip';
import { useI18n } from '../i18n/context';
import {
  activityTone,
  agentActivity,
  progress,
  sameSelection,
  selectionForAgent,
  type Selection,
} from '../state/selectors';
import { useApp } from '../state/store';

interface DeskProps {
  agent: PublicAgent;
  task: Task | null;
  lang: Lang;
  hub?: boolean;
  selected: Selection | null;
  onOpen: (selection: Selection) => void;
}

function Desk({ agent, task, lang, hub, selected, onOpen }: DeskProps) {
  const { t } = useI18n();
  const activity = agentActivity(task, agent);
  const selection = selectionForAgent(task, agent);
  const sub = task?.subtasks.find((s) => s.assignee === agent.id);
  const versions = agent.type === 'coordinator' ? task?.final?.versions : sub?.versions;
  const isSelected = !!selection && sameSelection(selection, selected);

  const content = (
    <>
      <AgentAvatar agent={agent} lang={lang} size={hub ? 48 : 40} />
      <span className="desk-text">
        <span className="desk-name">{agent.name[lang]}</span>
        <span className="desk-role">{agent.role[lang]}</span>
      </span>
      <span className="desk-status">
        <StatusChip tone={activityTone(activity)} label={t(`activity.${activity}`)} />
        {versions && versions.length > 0 && (
          <span className="desk-version">v{versions.length}</span>
        )}
      </span>
    </>
  );

  const className = `desk${hub ? ' desk-hub' : ''}${isSelected ? ' is-selected' : ''} tone-${activityTone(activity)}`;
  const style = { '--agent': agent.deskColor } as CSSProperties;

  return selection ? (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => onOpen(selection)}
      aria-label={t('office.openReport', { name: agent.name[lang] })}
    >
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

/**
 * Flat, accessible view of the office: the coordinator's hub desk with the team
 * around it. It is the whole office until phase 1c and stays as the fallback
 * when WebGL is unavailable.
 */
export function TeamBoard({ team }: { team: PublicTeam }) {
  const { t, lang } = useI18n();
  const task = useApp((s) => s.task);
  const selected = useApp((s) => s.selection);
  const select = useApp((s) => s.select);

  const coordinator = team.agents.find((a) => a.type === 'coordinator');
  const workers = team.agents.filter((a) => a.type === 'worker');
  const { approved, total } = progress(task);

  return (
    <div className="board">
      {task ? (
        <div className="board-head">
          <div className="board-task">
            <span className={`task-status status-${task.status}`}>
              {t(`taskStatus.${task.status}`)}
            </span>
            <span className="board-prompt" title={task.prompt}>
              {task.prompt}
            </span>
          </div>
          {total > 0 && (
            <div className="progress" aria-label={t('office.progress', { approved, total })}>
              <div className="progress-bar">
                <span style={{ width: `${(approved / total) * 100}%` }} />
              </div>
              <span className="progress-text">{t('office.progress', { approved, total })}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="board-hint">{t('office.idleHint')}</p>
      )}

      {coordinator && (
        <div className="board-hub">
          <Desk
            agent={coordinator}
            task={task}
            lang={lang}
            hub
            selected={selected}
            onOpen={select}
          />
          {task?.planSummary && (
            <p className="plan-bubble">
              <strong>{t('office.planTitle', { name: coordinator.name[lang] })}</strong>{' '}
              {task.planSummary}
            </p>
          )}
        </div>
      )}

      <div className="board-spokes">
        {workers.map((agent) => (
          <Desk
            key={agent.id}
            agent={agent}
            task={task}
            lang={lang}
            selected={selected}
            onOpen={select}
          />
        ))}
      </div>
    </div>
  );
}
