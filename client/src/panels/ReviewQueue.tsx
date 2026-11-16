import { AgentAvatar } from '../components/AgentAvatar';
import { useI18n } from '../i18n/context';
import { HelpCircle } from 'lucide-react';
import {
  approvedFinal,
  coordinatorOf,
  exportFilename,
  failedItems,
  findAgent,
  openClarification,
  requestText,
  reviewQueue,
} from '../state/selectors';
import { downloadMarkdown } from './download';
import { TASK_INPUT_ID } from './TaskInput';
import { useApp, useCurrentTeam } from '../state/store';

export function ReviewQueue() {
  const { t, lang } = useI18n();
  const team = useCurrentTeam();
  const task = useApp((s) => s.task);
  const select = useApp((s) => s.select);
  const retry = useApp((s) => s.retry);
  const pending = useApp((s) => s.pending);

  const queue = reviewQueue(task, team);
  const failed = failedItems(task, team);

  if (task?.status === 'completed') {
    const final = approvedFinal(task);
    return (
      <div className="empty-state">
        <h3>{t('queue.completedTitle')}</h3>
        <p>{t('queue.completedBody')}</p>
        {final && (
          <div className="action-row done-actions">
            <button type="button" className="btn-primary" onClick={() => select({ kind: 'final' })}>
              {t('queue.viewFinal')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadMarkdown(exportFilename(requestText(task)), final.markdown)}
            >
              {t('queue.downloadFinal')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const question = openClarification(task);
  if (question && team) {
    const lead = coordinatorOf(team);
    return (
      <div className="queue">
        <section>
          <h3 className="section-title">{t('queue.needsReview')}</h3>
          <button
            type="button"
            className="queue-item is-question"
            onClick={() => document.getElementById(TASK_INPUT_ID)?.focus()}
          >
            {lead && <AgentAvatar agent={lead} lang={lang} size={32} />}
            <span className="queue-body">
              <span className="queue-title">
                <span className="tag tag-question">
                  <HelpCircle size={12} aria-hidden="true" />
                </span>
                {t('clarify.title', { name: lead?.name[lang] ?? '' })}
              </span>
              <span className="queue-summary">
                {t('clarify.queueBody', { name: lead?.name[lang] ?? '' })}
              </span>
            </span>
          </button>
        </section>
      </div>
    );
  }

  if (queue.length === 0 && failed.length === 0) {
    return (
      <div className="empty-state">
        <h3>{t('panel.queueEmptyTitle')}</h3>
        <p>{t('panel.queueEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="queue">
      {queue.length > 0 && (
        <section>
          <h3 className="section-title">{t('queue.needsReview')}</h3>
          <ul className="queue-list">
            {queue.map((item) => {
              const agent = findAgent(team, item.agentId);
              const isFinal = item.selection.kind === 'final';
              return (
                <li
                  key={
                    isFinal ? 'final' : item.selection.kind === 'subtask' ? item.selection.id : ''
                  }
                >
                  <button
                    type="button"
                    className={`queue-item${isFinal ? ' is-final' : ''}`}
                    onClick={() => select(item.selection)}
                  >
                    {agent && <AgentAvatar agent={agent} lang={lang} size={32} />}
                    <span className="queue-body">
                      <span className="queue-title">
                        {isFinal && <span className="tag">{t('queue.final')}</span>}
                        {item.title}
                        <span className="version-tag">v{item.version}</span>
                      </span>
                      <span className="queue-meta">{agent?.name[lang]}</span>
                      {item.summary && <span className="queue-summary">{item.summary}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {failed.length > 0 && (
        <section>
          <h3 className="section-title">{t('queue.failed')}</h3>
          <ul className="queue-list">
            {failed.map((item) => {
              const agent = findAgent(team, item.agentId);
              const key = item.selection.kind === 'final' ? 'final' : item.selection.id;
              return (
                <li key={key} className="queue-item is-failed">
                  {agent && <AgentAvatar agent={agent} lang={lang} size={32} />}
                  <span className="queue-body">
                    <span className="queue-title">{item.title}</span>
                    <span className="queue-summary">{item.error}</span>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={pending === `retry:${key}`}
                    onClick={() => void retry(item.selection)}
                  >
                    {t('queue.retry')}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
