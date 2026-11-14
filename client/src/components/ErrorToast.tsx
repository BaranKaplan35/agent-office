import type { MessageKey } from '../i18n/dictionaries';
import { useI18n } from '../i18n/context';
import { useApp, type AppError } from '../state/store';

const KNOWN: Record<string, MessageKey> = {
  network: 'errors.network',
  task_lost: 'errors.task_lost',
  revision_limit: 'errors.revision_limit',
  invalid_state: 'errors.invalid_state',
};

export function useErrorText() {
  const { t } = useI18n();
  return (error: AppError) => {
    const key = KNOWN[error.code];
    if (key) return t(key);
    if (error.code === 'validation') return t('errors.validation', { message: error.message });
    return t('errors.generic', { message: error.message });
  };
}

export function ErrorToast() {
  const { t } = useI18n();
  const error = useApp((s) => s.error);
  const dismiss = useApp((s) => s.dismissError);
  const text = useErrorText();
  if (!error) return null;

  return (
    <div className="toast" role="alert">
      <span>{text(error)}</span>
      <button type="button" className="btn-ghost" onClick={dismiss}>
        {t('errors.dismiss')}
      </button>
    </div>
  );
}
