import { useState } from 'react';
import { useI18n } from '../i18n/context';

type Tab = 'queue' | 'report';

export function SidePanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('queue');

  return (
    <aside className="side card">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
          {t('panel.queue')}
          <span className="badge">0</span>
        </button>
        <button role="tab" aria-selected={tab === 'report'} onClick={() => setTab('report')}>
          {t('panel.report')}
        </button>
      </div>

      <div className="tab-body" role="tabpanel">
        {tab === 'queue' ? (
          <div className="empty-state">
            <h3>{t('panel.queueEmptyTitle')}</h3>
            <p>{t('panel.queueEmptyBody')}</p>
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('panel.reportEmpty')}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
