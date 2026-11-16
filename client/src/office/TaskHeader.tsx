import { useI18n } from '../i18n/context';
import { progress, requestText } from '../state/selectors';
import { useApp } from '../state/store';

/** Current task, its status and the approval progress: shown above the office (3D or flat). */
export function TaskHeader() {
  const { t } = useI18n();
  const task = useApp((s) => s.task);
  const { approved, total } = progress(task);
  if (!task) return null;

  return (
    <div className="board-head">
      <div className="board-task">
        <span className={`task-status status-${task.status}`}>
          {t(`taskStatus.${task.status}`)}
        </span>
        <span className="board-prompt" title={requestText(task)}>
          {requestText(task)}
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
  );
}
