import type { ActivityTone } from '../state/selectors';

interface Props {
  tone: ActivityTone;
  label: string;
}

export function StatusChip({ tone, label }: Props) {
  return (
    <span className={`chip chip-${tone}`}>
      <span className="chip-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
