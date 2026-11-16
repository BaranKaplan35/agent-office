import { useEffect, useRef, useState } from 'react';
import { AgentAvatar } from '../components/AgentAvatar';
import { Markdown } from '../components/Markdown';
import { StatusChip } from '../components/StatusChip';
import { useI18n } from '../i18n/context';
import {
  exportFilename,
  findAgent,
  requestText,
  reviewableFor,
  revisionsLeft,
  type ActivityTone,
  type ReviewableState,
} from '../state/selectors';
import { formatDuration, formatTokens, modelLabel } from '../state/metrics';
import { useApp, useCurrentTeam } from '../state/store';
import { TaskTotals } from './TaskTotals';

const MAX_NOTE = 2000;

const STATE_TONE: Record<ReviewableState, ActivityTone> = {
  waiting: 'muted',
  working: 'working',
  revising: 'working',
  merging: 'working',
  review: 'review',
  approved: 'ok',
  failed: 'danger',
};

const STATE_LABEL = {
  waiting: 'activity.waiting',
  working: 'activity.working',
  revising: 'activity.revising',
  merging: 'activity.merging',
  review: 'activity.review',
  approved: 'activity.approved',
  failed: 'activity.failed',
} as const;

function downloadMarkdown(filename: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportViewer() {
  const { t, lang } = useI18n();
  const team = useCurrentTeam();
  const task = useApp((s) => s.task);
  const selection = useApp((s) => s.selection);
  const viewedVersion = useApp((s) => s.viewedVersion);
  const viewVersion = useApp((s) => s.viewVersion);
  const pending = useApp((s) => s.pending);
  const approve = useApp((s) => s.approve);
  const revise = useApp((s) => s.revise);
  const retry = useApp((s) => s.retry);

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const item = reviewableFor(task, team, selection);
  const itemKey = selection ? (selection.kind === 'final' ? 'final' : selection.id) : '';

  // A new selection starts clean and moves focus to its heading.
  useEffect(() => {
    setNoteOpen(false);
    setNote('');
    setCopied(false);
    headingRef.current?.focus();
  }, [itemKey]);

  if (!item || !team || !task) {
    return (
      <div className="empty-state">
        <p>{t('panel.reportEmpty')}</p>
      </div>
    );
  }

  const agent = findAgent(team, item.agentId);
  const name = agent?.name[lang] ?? '';
  const latest = item.versions[item.versions.length - 1];
  const shown =
    (viewedVersion !== null && item.versions.find((v) => v.version === viewedVersion)) || latest;
  const isLatest = shown === latest;
  const canDecide = item.state === 'review' && isLatest;
  const left = revisionsLeft(item.versions, team.settings.maxRevisions);
  const busyKey = (action: string) => `${action}:${itemKey}`;
  const isFinal = item.selection.kind === 'final';

  async function sendNote() {
    const clean = note.trim();
    if (!clean) return;
    if (await revise(clean)) {
      setNote('');
      setNoteOpen(false);
    }
  }

  async function copy(markdown: string) {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; export still works.
    }
  }

  let progressText: string | null = null;
  if (item.state === 'working') progressText = t('report.working', { name });
  if (item.state === 'revising') progressText = t('report.revising', { name });
  if (item.state === 'merging') progressText = t('report.merging', { name });
  if (item.state === 'waiting') {
    const names = item.waitingFor.map((id) => findAgent(team, id)?.name[lang] ?? id).join(', ');
    progressText = t('report.waiting', { names });
  }

  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-head">
        {agent && <AgentAvatar agent={agent} lang={lang} size={40} />}
        <div className="report-head-text">
          <h2 id="report-title" ref={headingRef} tabIndex={-1}>
            {item.title}
          </h2>
          <span className="report-agent">
            {name} · {agent?.role[lang]}
          </span>
          {agent && <span className="model-tag">{modelLabel(agent.llm)}</span>}
        </div>
        <StatusChip tone={STATE_TONE[item.state]} label={t(STATE_LABEL[item.state])} />
      </header>

      {item.instructions && (
        <details className="brief">
          <summary>{t('report.brief')}</summary>
          <p>{item.instructions}</p>
        </details>
      )}

      {item.versions.length > 1 && (
        <div className="versions" role="group" aria-label={t('report.versions')}>
          {item.versions.map((v) => (
            <button
              key={v.version}
              type="button"
              aria-pressed={v === shown}
              onClick={() => viewVersion(v === latest ? null : v.version)}
            >
              v{v.version}
              {v === latest && <span className="sr-only"> ({t('report.latest')})</span>}
            </button>
          ))}
        </div>
      )}

      {progressText && (
        <p className={`progress-note${item.state === 'waiting' ? '' : ' is-busy'}`}>
          {progressText}
        </p>
      )}

      {item.state === 'failed' && (
        <div className="failure" role="alert">
          <strong>{t('report.failed')}</strong>
          {item.error && <span>{item.error}</span>}
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={pending === busyKey('retry')}
            onClick={() => void retry(item.selection)}
          >
            {t('report.retry')}
          </button>
        </div>
      )}

      {shown && (
        <div className="report-body">
          {!isLatest && (
            <p className="older-note">
              {t('report.olderVersion')}{' '}
              <button type="button" className="link-button" onClick={() => viewVersion(null)}>
                {t('report.showLatest')}
              </button>
            </p>
          )}
          {shown.revisionNote && (
            <aside className="your-note">
              <span>{t('report.yourNote')}</span>
              <p>{shown.revisionNote}</p>
            </aside>
          )}
          <Markdown text={shown.markdown} />
          {shown.metrics && (
            <p className="usage" aria-label={t('report.metrics')}>
              <span className="model-tag">{modelLabel(shown.metrics)}</span>
              {shown.metrics.usage ? (
                <span>
                  {t('report.tokenCounts', {
                    input: formatTokens(shown.metrics.usage.inputTokens, lang),
                    output: formatTokens(shown.metrics.usage.outputTokens, lang),
                  })}
                </span>
              ) : (
                <span title={t('report.tokensUnknownHint')}>{t('report.tokensUnknown')}</span>
              )}
              <span>{formatDuration(shown.metrics.durationMs, lang)}</span>
            </p>
          )}
          {isFinal && <TaskTotals task={task} />}
        </div>
      )}

      {shown && (canDecide || item.state === 'approved' || isFinal) && (
        <footer className="report-actions">
          {canDecide && !noteOpen && (
            <>
              <span className="hint">
                {left > 0 ? t('report.revisionsLeft', { n: left }) : t('report.noRevisionsLeft')}
              </span>
              <div className="action-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={left === 0 || !!pending}
                  onClick={() => setNoteOpen(true)}
                >
                  {t('report.requestChanges')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!!pending}
                  onClick={() => void approve()}
                >
                  {t('report.approve')}
                </button>
              </div>
            </>
          )}

          {canDecide && noteOpen && (
            <div className="note-form">
              <label className="sr-only" htmlFor="revision-note">
                {t('report.notePlaceholder')}
              </label>
              <textarea
                id="revision-note"
                rows={3}
                maxLength={MAX_NOTE}
                value={note}
                autoFocus
                placeholder={t('report.notePlaceholder')}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendNote();
                  if (e.key === 'Escape') setNoteOpen(false);
                }}
              />
              <div className="action-row">
                <button type="button" className="btn-secondary" onClick={() => setNoteOpen(false)}>
                  {t('report.cancelNote')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!note.trim() || pending === busyKey('revise')}
                  onClick={() => void sendNote()}
                >
                  {t('report.sendBack')}
                </button>
              </div>
            </div>
          )}

          {item.state === 'approved' && item.approvedVersion && (
            <span className="approved-badge">
              {t('report.approved', { n: item.approvedVersion })}
            </span>
          )}

          {isFinal && (
            <div className="action-row">
              <button type="button" className="btn-ghost" onClick={() => void copy(shown.markdown)}>
                {copied ? t('report.copied') : t('report.copy')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => downloadMarkdown(exportFilename(requestText(task)), shown.markdown)}
              >
                {t('report.export')}
              </button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
