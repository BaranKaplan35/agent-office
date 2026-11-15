import { Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { MOTION_SETTINGS, useMotion, useSystemReducedMotion } from '../office/motion';
import { QUALITY_SETTINGS, useQuality } from '../office/quality';

/** Gear button with the office settings: graphics quality (Auto / High / Low) and motion. */
export function QualityMenu() {
  const { t } = useI18n();
  const setting = useQuality((s) => s.setting);
  const autoLevel = useQuality((s) => s.autoLevel);
  const setSetting = useQuality((s) => s.setSetting);
  const motion = useMotion((s) => s.setting);
  const setMotion = useMotion((s) => s.setSetting);
  const systemReduced = useSystemReducedMotion();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('settings.title')}
        title={t('settings.title')}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings size={18} aria-hidden="true" />
      </button>

      {open && (
        <div className="menu-panel" role="group" aria-label={t('settings.title')}>
          <h3>{t('quality.title')}</h3>
          {QUALITY_SETTINGS.map((option) => (
            <label key={option} className="radio-row">
              <input
                type="radio"
                name="quality"
                checked={setting === option}
                onChange={() => setSetting(option)}
              />
              <span>
                <strong>{t(`quality.${option}`)}</strong>
                <small>{t(`quality.${option}Hint`)}</small>
              </span>
            </label>
          ))}
          {setting === 'auto' && (
            <p className="hint">{t('quality.autoNow', { level: t(`quality.${autoLevel}`) })}</p>
          )}

          <h3 className="menu-section">{t('motion.title')}</h3>
          {MOTION_SETTINGS.map((option) => (
            <label key={option} className="radio-row">
              <input
                type="radio"
                name="motion"
                checked={motion === option}
                onChange={() => setMotion(option)}
              />
              <span>
                <strong>{t(`motion.${option}`)}</strong>
                <small>{t(`motion.${option}Hint`)}</small>
              </span>
            </label>
          ))}
          {motion === 'system' && (
            <p className="hint">
              {t('motion.systemNow', {
                level: t(systemReduced ? 'motion.reduced' : 'motion.full'),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
