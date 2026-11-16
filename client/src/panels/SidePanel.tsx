import { useI18n } from '../i18n/context';
import { openClarification, reviewQueue } from '../state/selectors';
import { useApp, useCurrentTeam, type PanelTab } from '../state/store';
import { MessageLog } from './MessageLog';
import { ReportViewer } from './ReportViewer';
import { ReviewQueue } from './ReviewQueue';

const TABS: Array<{ id: PanelTab; label: 'panel.queue' | 'panel.report' | 'panel.log' }> = [
  { id: 'queue', label: 'panel.queue' },
  { id: 'report', label: 'panel.report' },
  { id: 'log', label: 'panel.log' },
];

export function SidePanel() {
  const { t } = useI18n();
  const team = useCurrentTeam();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  // An open question counts too: it is the one thing the team waits for.
  const queueCount = useApp(
    (s) => reviewQueue(s.task, team).length + (openClarification(s.task) ? 1 : 0),
  );

  return (
    <aside className="side card">
      <div className="tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="side-panel-body"
            onClick={() => setTab(id)}
          >
            {t(label)}
            {id === 'queue' && (
              <span className={`badge${queueCount > 0 ? ' has-items' : ''}`}>{queueCount}</span>
            )}
          </button>
        ))}
      </div>

      <div
        id="side-panel-body"
        className={`tab-body tab-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'queue' && <ReviewQueue />}
        {tab === 'report' && <ReportViewer />}
        {tab === 'log' && <MessageLog />}
      </div>
    </aside>
  );
}
