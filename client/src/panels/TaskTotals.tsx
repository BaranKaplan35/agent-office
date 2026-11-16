import type { Task } from '@agent-office/shared';
import { useI18n } from '../i18n/context';
import { formatDuration, formatTokens, modelLabel, taskTotals } from '../state/metrics';

/** Tokens and model time per model for the whole task (shown with the final output). */
export function TaskTotals({ task }: { task: Task }) {
  const { t, lang } = useI18n();
  const { rows, total } = taskTotals(task);
  if (rows.length === 0) return null;

  const tokens = (row: {
    inputTokens: number;
    outputTokens: number;
    calls: number;
    uncounted: number;
  }) =>
    row.uncounted === row.calls
      ? '—'
      : `${formatTokens(row.inputTokens, lang)} / ${formatTokens(row.outputTokens, lang)}`;

  return (
    <details className="totals" open>
      <summary>{t('totals.title')}</summary>
      <p className="hint">{t('totals.hint')}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('totals.model')}</th>
            <th scope="col">{t('totals.calls')}</th>
            <th scope="col">{t('totals.tokens')}</th>
            <th scope="col">{t('totals.time')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.provider} ${row.model}`}>
              <th scope="row">
                <span className="model-tag">{modelLabel(row)}</span>
              </th>
              <td>{row.calls}</td>
              <td>{tokens(row)}</td>
              <td>{formatDuration(row.durationMs, lang)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">{t('totals.all')}</th>
              <td>{total.calls}</td>
              <td>{tokens(total)}</td>
              <td>{formatDuration(total.durationMs, lang)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {total.uncounted > 0 && (
        <p className="hint">{t('totals.uncounted', { n: total.uncounted })}</p>
      )}
    </details>
  );
}
