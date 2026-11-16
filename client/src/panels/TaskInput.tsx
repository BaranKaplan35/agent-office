import { MAX_CLARIFICATIONS } from '@agent-office/shared';
import { HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/context';
import {
  coordinatorOf,
  isTaskActive,
  openClarification,
  planningFailed,
  requestText,
  unavailableAgents,
} from '../state/selectors';
import { useApp, useCurrentTeam } from '../state/store';

const MAX_PROMPT = 4000;
const MAX_ANSWER = 2000;
const MIN_PROMPT = 1;

/** Id of the task box, so the coordinator's desk can focus it when it asks. */
export const TASK_INPUT_ID = 'task-input';

export function TaskInput() {
  const { t, lang } = useI18n();
  const team = useCurrentTeam();
  const task = useApp((s) => s.task);
  const taskId = useApp((s) => s.taskId);
  const pending = useApp((s) => s.pending);
  const startTask = useApp((s) => s.startTask);
  const cancel = useApp((s) => s.cancel);
  const newTask = useApp((s) => s.newTask);
  const refreshTeams = useApp((s) => s.refreshTeams);
  const answer = useApp((s) => s.answer);
  const retryPlanning = useApp((s) => s.retryPlanning);

  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [confirming, setConfirming] = useState(false);

  const active = isTaskActive(task) || (taskId !== null && task === null);
  const finished = !!task && !active;
  const question = openClarification(task);
  const asking = !!question;
  const lead = team ? coordinatorOf(team) : undefined;
  const leadName = lead?.name[lang] ?? '';
  const sending = pending === 'create' || pending === 'answer';
  const blocked = unavailableAgents(team);
  const canSend =
    !!team && !active && !sending && blocked.length === 0 && prompt.trim().length >= MIN_PROMPT;
  const canAnswer = asking && !sending && reply.trim().length > 0;
  const field = useRef<HTMLTextAreaElement>(null);

  // A new question: put the cursor in the box, unless the user is busy elsewhere.
  const round = question?.round;
  useEffect(() => {
    if (round === undefined) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === field.current) field.current?.focus();
  }, [round]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (asking) {
      if (canAnswer && (await answer(reply.trim()))) setReply('');
      return;
    }
    if (!canSend) return;
    if (await startTask(prompt.trim(), lang)) setPrompt('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
  }

  let hint: string;
  if (!team) hint = t('task.disabledHint');
  else if (asking) hint = t('task.answerHint');
  else if (active) hint = t('task.busyHint', { prompt: task ? requestText(task) : '' });
  else if (finished) hint = t('task.finishedHint', { status: t(`taskStatus.${task.status}`) });
  else hint = t('task.shortcut');

  return (
    <form className={`task card${asking ? ' is-asking' : ''}`} onSubmit={submit}>
      {task && planningFailed(task) && (
        <div className="task-blocked task-failed" role="alert">
          <div>
            <strong>{t('task.planningFailed', { name: leadName })}</strong>
            {task.error && <p>{task.error}</p>}
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending === 'retry:plan'}
            onClick={() => void retryPlanning()}
          >
            {t('task.retryPlanning')}
          </button>
        </div>
      )}
      {question && (
        <div className="task-question" role="status" aria-live="polite">
          <span className="task-question-icon" aria-hidden="true">
            <HelpCircle size={18} />
          </span>
          <div>
            <strong>{t('clarify.title', { name: leadName })}</strong>
            {question.reply && <p>{question.reply}</p>}
            {question.questions.length > 0 && (
              <ol>
                {question.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            )}
            {MAX_CLARIFICATIONS > 1 && question.round > 1 && (
              <span className="hint">
                {t('clarify.round', { n: question.round, max: MAX_CLARIFICATIONS })}
              </span>
            )}
          </div>
        </div>
      )}
      {!active && blocked.length > 0 && (
        <div className="task-blocked" role="status">
          <div>
            <strong>{t('task.teamUnavailable')}</strong>
            <ul>
              {blocked.map((agent) => (
                <li key={agent.id}>
                  {t('task.unavailableAgent', {
                    name: agent.name[lang],
                    reason: agent.unavailable ?? '',
                  })}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending === 'teams'}
            onClick={() => void refreshTeams()}
          >
            {t('task.recheck')}
          </button>
        </div>
      )}
      <label className="sr-only" htmlFor={TASK_INPUT_ID}>
        {asking ? t('task.answerPlaceholder', { name: leadName }) : t('task.label')}
      </label>
      <div className="task-field">
        <textarea
          ref={field}
          id={TASK_INPUT_ID}
          rows={2}
          maxLength={asking ? MAX_ANSWER : MAX_PROMPT}
          value={asking ? reply : prompt}
          onChange={(e) => (asking ? setReply(e.target.value) : setPrompt(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder={
            asking
              ? t('task.answerPlaceholder', { name: leadName })
              : team
                ? team.taskPlaceholder[lang]
                : t('task.placeholder')
          }
          disabled={!team || (active && !asking)}
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
        {asking && !confirming && (
          <button type="submit" className="btn-primary" disabled={!canAnswer}>
            {pending === 'answer' ? t('task.sending') : t('task.answer')}
          </button>
        )}
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
