import { LANGS } from '@agent-office/shared';
import { useServerStatus } from '../api/useServerStatus';
import { useI18n } from '../i18n/context';

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 29 10.5 16 18 3 10.5Z" fill="var(--primary)" opacity="0.55" />
      <path d="M3 10.5 16 18v11L3 21.5Z" fill="var(--primary)" />
      <path d="M29 10.5 16 18v11l13-7.5Z" fill="var(--accent)" />
    </svg>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const status = useServerStatus();

  const statusText =
    status.state === 'online'
      ? t('status.online', { provider: status.health.provider })
      : status.state === 'offline'
        ? t('status.offline')
        : t('status.connecting');

  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-tagline">{t('app.tagline')}</div>
        </div>
      </div>

      <label className="field team-field">
        <span className="field-label">{t('header.team')}</span>
        <select disabled defaultValue="">
          <option value="">{t('header.teamPlaceholder')}</option>
        </select>
      </label>

      <div className="header-end">
        <span className={`status-pill status-${status.state}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {statusText}
        </span>

        <div className="segmented" role="group" aria-label={t('header.language')}>
          {LANGS.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
