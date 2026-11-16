import type { Lang, PublicAgent, PublicTeam, Task } from '@agent-office/shared';
import type { CSSProperties } from 'react';
import { AgentAvatar } from '../components/AgentAvatar';
import { StatusChip } from '../components/StatusChip';
import { useI18n } from '../i18n/context';
import { modelLabel } from '../state/metrics';
import {
  activityTone,
  agentActivity,
  sameSelection,
  selectionForAgent,
  type Selection,
} from '../state/selectors';
import { useApp } from '../state/store';
import { TASK_INPUT_ID } from '../panels/TaskInput';
import { TaskHeader } from './TaskHeader';

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
        <span className="model-tag">{modelLabel(agent.llm)}</span>
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

  if (!selection && activity === 'asking') {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => document.getElementById(TASK_INPUT_ID)?.focus()}
        aria-label={t('office.answerQuestions', { name: agent.name[lang] })}
      >
        {content}
      </button>
    );
  }

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
 * around it. It is the fallback when WebGL is unavailable or the 3D scene fails.
 */
export function TeamBoard({ team }: { team: PublicTeam }) {
  const { t, lang } = useI18n();
  const task = useApp((s) => s.task);
  const selected = useApp((s) => s.selection);
  const select = useApp((s) => s.select);

  const coordinator = team.agents.find((a) => a.type === 'coordinator');
  const workers = team.agents.filter((a) => a.type === 'worker');

  return (
    <div className="board">
      {task ? <TaskHeader /> : <p className="board-hint">{t('office.idleHint')}</p>}

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
