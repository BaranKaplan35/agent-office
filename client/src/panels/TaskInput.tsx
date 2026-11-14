import { useI18n } from '../i18n/context';

export function TaskInput() {
  const { t } = useI18n();
  return (
    <form className="task card" onSubmit={(e) => e.preventDefault()}>
      <label className="sr-only" htmlFor="task-input">
        {t('task.label')}
      </label>
      <textarea
        id="task-input"
        rows={2}
        placeholder={t('task.placeholder')}
        disabled
        aria-describedby="task-hint"
      />
      <div className="task-actions">
        <span id="task-hint" className="hint">
          {t('task.disabledHint')}
        </span>
        <button type="submit" className="btn-primary" disabled>
          {t('task.send')}
        </button>
      </div>
    </form>
  );
}
