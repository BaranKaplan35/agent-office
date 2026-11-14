import { useI18n } from '../i18n/context';

const TILE_W = 64;
const TILE_H = 32;
const GRID = 7;

/** Placeholder floor until the real isometric office arrives (phase 1c). */
function EmptyFloor() {
  const tiles = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      const cx = (x - y) * (TILE_W / 2);
      const cy = (x + y) * (TILE_H / 2);
      tiles.push(
        <path
          key={`${x}-${y}`}
          d={`M${cx} ${cy} l${TILE_W / 2} ${TILE_H / 2} l${-TILE_W / 2} ${TILE_H / 2} l${-TILE_W / 2} ${-TILE_H / 2}Z`}
          fill={(x + y) % 2 === 0 ? 'var(--floor-a)' : 'var(--floor-b)'}
        />,
      );
    }
  }
  const half = (GRID * TILE_W) / 2;
  return (
    <svg
      className="office-floor"
      viewBox={`${-half} 0 ${GRID * TILE_W} ${GRID * TILE_H}`}
      aria-hidden="true"
    >
      {tiles}
    </svg>
  );
}

export function OfficeStage() {
  const { t } = useI18n();
  return (
    <section className="office card" aria-label={t('office.title')}>
      <EmptyFloor />
      <div className="empty-state office-empty">
        <h2>{t('office.emptyTitle')}</h2>
        <p>{t('office.emptyBody')}</p>
      </div>
    </section>
  );
}
