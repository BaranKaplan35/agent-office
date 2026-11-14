import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/context';
import { isTaskActive } from '../state/selectors';
import { useApp, useCurrentTeam } from '../state/store';

const MAX_PROMPT = 4000;
const MIN_PROMPT = 3;

export function TaskInput() {
  const { t, lang } = useI18n();
  const team = useCurrentTeam();
  const task = useApp((s) => s.task);
  const taskId = useApp((s) => s.taskId);
  const pending = useApp((s) => s.pending);
  const startTask = useApp((s) => s.startTask);
  const cancel = useApp((s) => s.cancel);
  const newTask = useApp((s) => s.newTask);

  const [prompt, setPrompt] = useState('');
  const [confirming, setConfirming] = useState(false);

  const active = isTaskActive(task) || (taskId !== null && task === null);
  const finished = !!task && !active;
  const sending = pending === 'create';
  const canSend = !!team && !active && !sending && prompt.trim().length >= MIN_PROMPT;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    if (await startTask(prompt.trim(), lang)) setPrompt('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
  }

  let hint: string;
  if (!team) hint = t('task.disabledHint');
  else if (active) hint = t('task.busyHint', { prompt: task?.prompt ?? '' });
  else if (finished) hint = t('task.finishedHint', { status: t(`taskStatus.${task.status}`) });
  else hint = t('task.shortcut');

  return (
    <form className="task card" onSubmit={submit}>
      <label className="sr-only" htmlFor="task-input">
        {t('task.label')}
      </label>
      <div className="task-field">
        <textarea
          id="task-input"
          rows={2}
          maxLength={MAX_PROMPT}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={team ? team.taskPlaceholder[lang] : t('task.placeholder')}
          disabled={!team || active}
          aria-describedby="task-hint"
        />
        <div className="task-meta">
          <span id="task-hint" className="hint">
            {hint}
          </span>
          {!active && prompt.length > MAX_PROMPT * 0.8 && (
            <span className="hint">
              {prompt.length}/{MAX_PROMPT}
            </span>
          )}
        </div>
      </div>

      <div className="task-actions">
        {active ? (
          confirming ? (
            <div className="confirm" role="group" aria-label={t('task.cancelConfirm')}>
              <span className="hint">{t('task.cancelConfirm')}</span>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                {t('task.cancelNo')}
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={pending === 'cancel'}
                onClick={() => void cancel().then(() => setConfirming(false))}
              >
                {t('task.cancelYes')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
              {t('task.cancel')}
            </button>
          )
        ) : (
          <>
            {finished && (
              <button type="button" className="btn-secondary" onClick={newTask}>
                {t('task.newTask')}
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={!canSend}>
              {sending ? t('task.sending') : t('task.send')}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
