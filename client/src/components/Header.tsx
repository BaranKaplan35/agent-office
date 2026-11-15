import { LANGS } from '@agent-office/shared';
import { useServerStatus } from '../api/useServerStatus';
import { useI18n } from '../i18n/context';
import { isTaskActive } from '../state/selectors';
import { useApp } from '../state/store';
import { QualityMenu } from './QualityMenu';

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 29 10.5 16 18 3 10.5Z" fill="var(--primary)" opacity="0.55" />
      <path d="M3 10.5 16 18v11L3 21.5Z" fill="var(--primary)" />
      <path d="M29 10.5 16 18v11l13-7.5Z" fill="var(--accent)" />
    </svg>
  );
}

function TeamPicker() {
  const { t, lang } = useI18n();
  const teams = useApp((s) => s.teams);
  const teamsState = useApp((s) => s.teamsState);
  const teamId = useApp((s) => s.teamId);
  const locked = useApp((s) => isTaskActive(s.task));
  const selectTeam = useApp((s) => s.selectTeam);
  const current = teams.find((team) => team.id === teamId);

  const placeholder =
    teamsState === 'loading' ? t('header.teamLoading') : t('header.teamPlaceholder');

  return (
    <label className="field team-field" title={locked ? t('header.teamLocked') : undefined}>
      <span className="field-label">{t('header.team')}</span>
      <select
        value={teamId ?? ''}
        disabled={teams.length === 0 || locked}
        onChange={(e) => selectTeam(e.target.value)}
        aria-describedby={current ? 'team-description' : undefined}
      >
        {teams.length === 0 && <option value="">{placeholder}</option>}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name[lang]}
          </option>
        ))}
      </select>
      {current && (
        <span id="team-description" className="team-description">
          {current.description[lang]}
        </span>
      )}
    </label>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const status = useServerStatus();
  const stream = useApp((s) => s.stream);

  const reconnecting = stream === 'reconnecting';
  const statusText = reconnecting
    ? t('status.reconnecting')
    : status.state === 'online'
      ? t('status.online', { provider: status.health.provider })
      : status.state === 'offline'
        ? t('status.offline')
        : t('status.connecting');
  const statusClass = reconnecting ? 'connecting' : status.state;

  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-tagline">{t('app.tagline')}</div>
        </div>
      </div>

      <TeamPicker />

      <div className="header-end">
        <span className={`status-pill status-${statusClass}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {statusText}
        </span>

        <QualityMenu />

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
